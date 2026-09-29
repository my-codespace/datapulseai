/**
 * DataPulse Persistent Store
 *
 * A file-backed JSON store providing full persistence across server restarts.
 * Uses atomic writes (write-to-temp + rename) to prevent corruption.
 * Organized per-entity to keep individual reads fast.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ─── Store Layout ──────────────────────────────────────────────────────────────
// data/
//   tasks/
//     {taskId}.json       — task metadata + plan + summary + quality
//   logs/
//     {taskId}.jsonl      — append-only log lines
//   sources/
//     {taskId}.json       — array of DataSource
//   evidence/
//     {taskId}.json       — array of Evidence
//   records/
//     {taskId}.json       — array of full ProcessedRecord (with fieldValues)
//   runs/
//     {taskId}.json       — array of Run
//   index.json            — task list (id, title, status, createdAt, updatedAt)

const DATA_DIR = process.env.DATA_DIR
  || path.join(process.cwd(), 'data');

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function taskDir(sub: string) {
  const d = path.join(DATA_DIR, sub);
  ensureDir(d);
  return d;
}

function atomicWrite(filePath: string, data: unknown) {
  ensureDir(path.dirname(filePath));
  const content = JSON.stringify(data, null, 2);
  try {
    const tmp = filePath + '.tmp.' + process.pid + '.' + Math.random().toString(36).slice(2);
    fs.writeFileSync(tmp, content, 'utf8');
    try {
      if (fs.existsSync(filePath)) {
        fs.copyFileSync(tmp, filePath);
        try { fs.unlinkSync(tmp); } catch {}
      } else {
        fs.renameSync(tmp, filePath);
      }
    } catch {
      // Fallback for Windows file lock
      fs.writeFileSync(filePath, content, 'utf8');
      try { fs.unlinkSync(tmp); } catch {}
    }
  } catch {
    try {
      fs.writeFileSync(filePath, content, 'utf8');
    } catch (e) {
      console.warn('[DB] write warning on ' + filePath, e);
    }
  }
}

function readJSON<T>(filePath: string, fallback: T): T {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

// ─── Task Index ────────────────────────────────────────────────────────────────

interface TaskIndexEntry {
  id: string;
  title: string;
  status: string;
  progress: number;
  prompt: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  runNumber: number;
  searchProvider: string;
  isDemo?: boolean;
}

function indexPath() { return path.join(DATA_DIR, 'index.json'); }

function readIndex(): TaskIndexEntry[] {
  return readJSON<TaskIndexEntry[]>(indexPath(), []);
}

function updateIndex(entry: TaskIndexEntry) {
  const index = readIndex();
  const i = index.findIndex(e => e.id === entry.id);
  if (i >= 0) { index[i] = entry; } else { index.unshift(entry); }
  atomicWrite(indexPath(), index.slice(0, 200)); // keep last 200
}

// ─── DB Interface ──────────────────────────────────────────────────────────────

import type {
  ResearchTask, LogEntry, DataSource, Evidence, ProcessedRecord, ResearchPlan,
  WorkflowStep, TaskSummary, DataQuality, TaskStatus
} from '@/types';

export interface StoredTask {
  id: string;
  prompt: string;
  title: string;
  status: TaskStatus;
  progress: number;
  error?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  plan: WorkflowStep[];
  researchPlan?: ResearchPlan;
  summary?: TaskSummary;
  quality?: DataQuality;
  searchProvider: string;
  runNumber: number;
}

export interface StoredRun {
  id: string;
  taskId: string;
  runNumber: number;
  createdAt: string;
  completedAt?: string;
  recordCount: number;
  comparison?: unknown;
}

export const db = {

  // ── Tasks ──────────────────────────────────────────────────────────────────

  task: {
    create(data: StoredTask): StoredTask {
      const filePath = path.join(taskDir('tasks'), `${data.id}.json`);
      atomicWrite(filePath, data);
      updateIndex({
        id: data.id, title: data.title, status: data.status, progress: data.progress,
        prompt: data.prompt, createdAt: data.createdAt, updatedAt: data.updatedAt,
        completedAt: data.completedAt, runNumber: data.runNumber, searchProvider: data.searchProvider,
      });
      return data;
    },

    findUnique(id: string): StoredTask | null {
      const filePath = path.join(DATA_DIR, 'tasks', `${id}.json`);
      return readJSON<StoredTask | null>(filePath, null);
    },

    findMany(opts?: { orderBy?: 'createdAt'; take?: number }): StoredTask[] {
      const index = readIndex();
      const sorted = opts?.orderBy === 'createdAt'
        ? [...index].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        : index;
      const slice = sorted.slice(0, opts?.take ?? 50);
      return slice.map(e => this.findUnique(e.id)).filter((t): t is StoredTask => t !== null);
    },

    update(id: string, updates: Partial<StoredTask>): StoredTask {
      const existing = this.findUnique(id);
      if (!existing) throw new Error(`Task ${id} not found`);
      const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() };
      const filePath = path.join(taskDir('tasks'), `${id}.json`);
      atomicWrite(filePath, updated);
      updateIndex({
        id: updated.id, title: updated.title, status: updated.status, progress: updated.progress,
        prompt: updated.prompt, createdAt: updated.createdAt, updatedAt: updated.updatedAt,
        completedAt: updated.completedAt, runNumber: updated.runNumber, searchProvider: updated.searchProvider,
      });
      return updated;
    },
  },

  // ── Logs (append-only) ────────────────────────────────────────────────────

  log: {
    create(entry: LogEntry & { taskId: string }): void {
      const filePath = path.join(taskDir('logs'), `${entry.taskId}.jsonl`);
      const line = JSON.stringify(entry) + '\n';
      fs.appendFileSync(filePath, line, 'utf8');
    },

    findMany(taskId: string): (LogEntry & { taskId: string })[] {
      const filePath = path.join(DATA_DIR, 'logs', `${taskId}.jsonl`);
      if (!fs.existsSync(filePath)) return [];
      const lines = fs.readFileSync(filePath, 'utf8').trim().split('\n').filter(Boolean);
      return lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    },
  },

  // ── Sources ───────────────────────────────────────────────────────────────

  source: {
    _path: (taskId: string) => path.join(taskDir('sources'), `${taskId}.json`),

    create(data: DataSource & { taskId: string }): void {
      const p = this._path(data.taskId);
      const arr = readJSON<(DataSource & { taskId: string })[]>(p, []);
      arr.push(data);
      atomicWrite(p, arr);
    },

    createMany(items: (DataSource & { taskId: string })[]): void {
      if (items.length === 0) return;
      const p = this._path(items[0].taskId);
      const arr = readJSON<(DataSource & { taskId: string })[]>(p, []);
      arr.push(...items);
      atomicWrite(p, arr);
    },

    update(taskId: string, sourceId: string, updates: Partial<DataSource>): void {
      const p = this._path(taskId);
      const arr = readJSON<(DataSource & { taskId: string })[]>(p, []);
      const i = arr.findIndex(s => s.id === sourceId);
      if (i >= 0) { arr[i] = { ...arr[i], ...updates }; atomicWrite(p, arr); }
    },

    findMany(taskId: string): DataSource[] {
      return readJSON<DataSource[]>(this._path(taskId), []);
    },
  },

  // ── Evidence ──────────────────────────────────────────────────────────────

  evidence: {
    _path: (taskId: string) => path.join(taskDir('evidence'), `${taskId}.json`),

    create(data: Evidence & { taskId: string }): void {
      const p = this._path(data.taskId);
      const arr = readJSON<(Evidence & { taskId: string })[]>(p, []);
      if (arr.some(e => e.id === data.id)) return; // no duplicates
      arr.push(data);
      atomicWrite(p, arr);
    },

    createMany(items: (Evidence & { taskId: string })[]): void {
      if (items.length === 0) return;
      const p = this._path(items[0].taskId);
      const arr = readJSON<(Evidence & { taskId: string })[]>(p, []);
      const existing = new Set(arr.map(e => e.id));
      for (const item of items) {
        if (!existing.has(item.id)) {
          arr.push(item);
          existing.add(item.id);
        }
      }
      atomicWrite(p, arr);
    },

    findMany(taskId: string): Evidence[] {
      return readJSON<Evidence[]>(this._path(taskId), []);
    },
  },

  // ── Records ───────────────────────────────────────────────────────────────

  record: {
    _path: (taskId: string) => path.join(taskDir('records'), `${taskId}.json`),

    create(data: ProcessedRecord & { taskId: string }): void {
      const p = this._path(data.taskId);
      const arr = readJSON<(ProcessedRecord & { taskId: string })[]>(p, []);
      arr.push(data);
      atomicWrite(p, arr);
    },

    createMany(items: (ProcessedRecord & { taskId: string })[]): void {
      if (items.length === 0) return;
      const p = this._path(items[0].taskId);
      const arr = readJSON<(ProcessedRecord & { taskId: string })[]>(p, []);
      arr.push(...items);
      atomicWrite(p, arr);
    },

    update(taskId: string, recordId: string, updates: Partial<ProcessedRecord>): void {
      const p = this._path(taskId);
      const arr = readJSON<(ProcessedRecord & { taskId: string })[]>(p, []);
      const i = arr.findIndex(r => r.id === recordId);
      if (i >= 0) { arr[i] = { ...arr[i], ...updates }; atomicWrite(p, arr); }
    },

    findMany(taskId: string): ProcessedRecord[] {
      return readJSON<ProcessedRecord[]>(this._path(taskId), []);
    },
  },

  // ── Runs ──────────────────────────────────────────────────────────────────

  run: {
    _path: (taskId: string) => path.join(taskDir('runs'), `${taskId}.json`),

    create(data: StoredRun): void {
      const p = this._path(data.taskId);
      const arr = readJSON<StoredRun[]>(p, []);
      arr.push(data);
      atomicWrite(p, arr);
    },

    update(taskId: string, updates: Partial<StoredRun>): void {
      const p = this._path(taskId);
      const arr = readJSON<StoredRun[]>(p, []);
      if (arr.length > 0) {
        arr[arr.length - 1] = { ...arr[arr.length - 1], ...updates };
        atomicWrite(p, arr);
      }
    },

    findMany(taskId: string): StoredRun[] {
      return readJSON<StoredRun[]>(this._path(taskId), []);
    },
  },
};

// ─── Convenience: Build full ResearchTask from DB ──────────────────────────────

export function loadFullTask(taskId: string): ResearchTask | null {
  const task = db.task.findUnique(taskId);
  if (!task) return null;

  const logs = db.log.findMany(taskId);
  const sources = db.source.findMany(taskId);
  const evidence = db.evidence.findMany(taskId);
  const records = db.record.findMany(taskId);

  return {
    ...task,
    logs,
    sources,
    evidence,
    rawRecords: [],
    records,
  };
}

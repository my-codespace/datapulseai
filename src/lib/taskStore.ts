/**
 * taskStore.ts — DEPRECATED (v1)
 *
 * The in-memory store has been replaced by the persistent file-based DB in:
 *   src/lib/db/client.ts
 *
 * This file is kept as a no-op shim to avoid breaking any lingering imports.
 */

import { ResearchTask } from '@/types';
import { db } from './db/client';

export function setTask(task: ResearchTask): void {
  // no-op — use db.task from db/client
  console.warn('[taskStore] setTask is deprecated. Use db.task.create/update instead.');
}

export function getTask(id: string): ResearchTask | undefined {
  const row = db.task.findUnique(id);
  if (!row) return undefined;
  return { ...row, logs: [], sources: [], evidence: [], rawRecords: [], records: [] };
}

export function getAllTasks(): ResearchTask[] {
  return db.task.findMany({ orderBy: 'createdAt', take: 50 })
    .map(row => ({ ...row, logs: [], sources: [], evidence: [], rawRecords: [], records: [] }));
}

export function deleteTask(id: string): boolean {
  return false; // Not implemented in file store
}

export function updateTask(id: string, updates: Partial<ResearchTask>): ResearchTask | null {
  const row = db.task.findUnique(id);
  if (!row) return null;
  db.task.update(id, updates as Parameters<typeof db.task.update>[1]);
  const updated = db.task.findUnique(id)!;
  return { ...updated, logs: [], sources: [], evidence: [], rawRecords: [], records: [] };
}

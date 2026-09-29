import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { createTask, executeTask } from '@/lib/orchestrator';
import { v4 as uuidv4 } from 'uuid';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: originalTaskId } = await params;
    const originalTask = db.task.findUnique(originalTaskId);

    if (!originalTask) return NextResponse.json({ error: 'Original task not found' }, { status: 404 });
    if (originalTask.status !== 'completed') {
      return NextResponse.json({ error: 'Can only rerun completed tasks' }, { status: 400 });
    }

    const newTask = createTask(originalTask.prompt);
    db.task.update(newTask.id, {
      runNumber: originalTask.runNumber + 1,
      title: originalTask.title,
    });

    db.run.create({
      id: uuidv4(),
      taskId: newTask.id,
      runNumber: originalTask.runNumber + 1,
      createdAt: new Date().toISOString(),
      recordCount: 0,
    });

    // Execute and compute diff after completion
    executeTask(newTask.id).then(() => {
      computeRunDiff(originalTaskId, newTask.id);
    }).catch(err => {
      console.error(`[Rerun ${newTask.id}] Failed:`, err);
    });

    return NextResponse.json({
      newTaskId: newTask.id,
      runNumber: originalTask.runNumber + 1,
      message: 'Rerun started',
    }, { status: 201 });

  } catch (err) {
    console.error('[POST /rerun]', err);
    return NextResponse.json({ error: 'Failed to start rerun' }, { status: 500 });
  }
}

function computeRunDiff(prevTaskId: string, newTaskId: string) {
  const prevRecords = db.record.findMany(prevTaskId).filter(r => !r.isDuplicate);
  const newRecords = db.record.findMany(newTaskId).filter(r => !r.isDuplicate);

  const prevMap = new Map(prevRecords.map(r => [
    (Object.values(r.fields)[0] || r.id).toLowerCase().trim(),
    { id: r.id, fields: r.fields },
  ]));

  const newMap = new Map(newRecords.map(r => [
    (Object.values(r.fields)[0] || r.id).toLowerCase().trim(),
    { id: r.id, fields: r.fields },
  ]));

  const changes: Array<{
    recordId: string;
    changeType: string;
    changedFields?: Array<{ field: string; oldValue: string | null; newValue: string | null }>;
  }> = [];

  for (const [sig, rec] of newMap) {
    const prev = prevMap.get(sig);
    if (!prev) {
      changes.push({ recordId: rec.id, changeType: 'new' });
    } else {
      const changedFields = Object.keys({ ...prev.fields, ...rec.fields })
        .filter(k => prev.fields[k] !== rec.fields[k])
        .map(k => ({ field: k, oldValue: prev.fields[k] ?? null, newValue: rec.fields[k] ?? null }));

      changes.push({ recordId: rec.id, changeType: changedFields.length > 0 ? 'changed' : 'unchanged', changedFields: changedFields.length > 0 ? changedFields : undefined });
    }
  }

  for (const [sig, rec] of prevMap) {
    if (!newMap.has(sig)) changes.push({ recordId: rec.id, changeType: 'removed' });
  }

  const comparison = {
    newRecords: changes.filter(c => c.changeType === 'new').length,
    removedRecords: changes.filter(c => c.changeType === 'removed').length,
    changedRecords: changes.filter(c => c.changeType === 'changed').length,
    unchangedRecords: changes.filter(c => c.changeType === 'unchanged').length,
    changes,
    comparedAt: new Date().toISOString(),
  };

  db.run.update(newTaskId, {
    comparison,
    completedAt: new Date().toISOString(),
    recordCount: newRecords.length,
  });
}

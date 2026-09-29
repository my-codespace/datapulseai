import { NextRequest, NextResponse } from 'next/server';
import { loadFullTask } from '@/lib/orchestrator';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const task = loadFullTask(id);
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    return NextResponse.json({ ...task, task });
  } catch (err) {
    console.error('[GET /api/tasks/[id]]', err);
    return NextResponse.json({ error: 'Failed to load task' }, { status: 500 });
  }
}

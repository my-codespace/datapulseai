import { NextRequest, NextResponse } from 'next/server';
import { createTask, executeTask, loadFullTask } from '@/lib/orchestrator';
import { db } from '@/lib/db/client';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { prompt?: string };
    const prompt = body?.prompt?.trim();

    if (!prompt || prompt.length < 5) {
      return NextResponse.json({ error: 'Prompt must be at least 5 characters' }, { status: 400 });
    }
    if (prompt.length > 2000) {
      return NextResponse.json({ error: 'Prompt must be under 2000 characters' }, { status: 400 });
    }

    const task = createTask(prompt);

    // Execute in background
    executeTask(task.id).catch(err => {
      console.error(`[Task ${task.id}] Execution failed:`, err);
    });

    return NextResponse.json({ id: task.id, taskId: task.id, task }, { status: 201 });

  } catch (err) {
    console.error('[POST /api/tasks]', err);
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const tasks = db.task.findMany({ orderBy: 'createdAt', take: 50 });
    return NextResponse.json(tasks);
  } catch (err) {
    console.error('[GET /api/tasks]', err);
    return NextResponse.json({ error: 'Failed to load tasks' }, { status: 500 });
  }
}

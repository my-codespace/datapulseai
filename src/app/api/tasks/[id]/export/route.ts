import { NextRequest, NextResponse } from 'next/server';
import { getTask } from '@/lib/taskStore';
import { ProcessedRecord } from '@/types';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const task = getTask(id);

  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  const format = req.nextUrl.searchParams.get('format') || 'json';
  const includeduplicates = req.nextUrl.searchParams.get('includeduplicates') === 'true';

  const records = includeduplicates
    ? task.records
    : task.records.filter((r: ProcessedRecord) => !r.isDuplicate);

  if (format === 'csv') {
    if (records.length === 0) {
      return new NextResponse('No records available', {
        headers: { 'Content-Type': 'text/csv', 'Content-Disposition': `attachment; filename="datapulse-${id}.csv"` },
      });
    }

    const allFields = Object.keys(records[0].fields);
    const metaFields = ['source_name', 'source_url', 'confidence', 'is_valid'];
    const headers = [...allFields, ...metaFields];

    const rows = records.map((r) => {
      const values = [
        ...allFields.map((f) => {
          const val = r.fields[f] ?? '';
          return `"${String(val).replace(/"/g, '""')}"`;
        }),
        `"${r.sourceName}"`,
        `"${r.sourceUrl}"`,
        `"${r.confidence}"`,
        `"${r.isValid}"`,
      ];
      return values.join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="datapulse-export-${id}.csv"`,
      },
    });
  }

  // JSON format
  const output = {
    task: {
      id: task.id,
      title: task.title,
      prompt: task.prompt,
      status: task.status,
      createdAt: task.createdAt,
      completedAt: task.completedAt,
    },
    summary: task.summary,
    fields: task.interpretation?.outputFields || [],
    records: records.map((r) => ({
      ...r.fields,
      _meta: {
        id: r.id,
        source: r.sourceName,
        sourceUrl: r.sourceUrl,
        confidence: r.confidence,
        isValid: r.isValid,
        validationIssues: r.validationIssues,
      },
    })),
  };

  return new NextResponse(JSON.stringify(output, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="datapulse-export-${id}.json"`,
    },
  });
}

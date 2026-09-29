import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { v4 as uuidv4 } from 'uuid';
import { FieldValue } from '@/types';

/** PATCH /api/tasks/[id]/records/[recordId] */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; recordId: string }> }
) {
  try {
    const { id: taskId, recordId } = await params;
    const body = await req.json() as {
      action?: 'accept' | 'reject' | 'verify';
      reviewNote?: string;
      fieldEdits?: Record<string, string | null>;
    };

    const records = db.record.findMany(taskId);
    const record = records.find(r => r.id === recordId);
    if (!record) return NextResponse.json({ error: 'Record not found' }, { status: 404 });

    const now = new Date().toISOString();
    const updates: Partial<typeof record> = { reviewedAt: now };

    if (body.action) {
      updates.reviewStatus = body.action === 'accept' ? 'accepted'
        : body.action === 'reject' ? 'rejected'
        : 'verified';
    }

    if (body.reviewNote !== undefined) updates.reviewNote = body.reviewNote;

    if (body.fieldEdits && Object.keys(body.fieldEdits).length > 0) {
      const updatedFields = { ...record.fields };
      const updatedFieldValues = { ...(record.fieldValues || {}) };

      for (const [fieldName, newValue] of Object.entries(body.fieldEdits)) {
        const existing = updatedFieldValues[fieldName];
        updatedFieldValues[fieldName] = {
          ...(existing || {}),
          value: newValue,
          originalValue: existing?.value ?? updatedFields[fieldName] ?? undefined,
          confidence: 100,
          evidenceIds: existing?.evidenceIds || [],
          extractionMethod: 'user_corrected',
          validationStatus: 'valid',
          correctedAt: now,
        } as FieldValue;
        updatedFields[fieldName] = newValue;
      }

      updates.fields = updatedFields;
      updates.fieldValues = updatedFieldValues;
      updates.needsReview = false;
    }

    db.record.update(taskId, recordId, updates);
    return NextResponse.json({ success: true });

  } catch (err) {
    console.error('[PATCH records]', err);
    return NextResponse.json({ error: 'Failed to update record' }, { status: 500 });
  }
}

import { ProcessedRecord, FieldDefinition, DataQuality, FieldQuality, ResearchPlan } from '@/types';

/**
 * Data Quality Intelligence
 * Produces deterministic, explainable quality metrics at both dataset and field level.
 */
export function calculateDataQuality(
  records: ProcessedRecord[],
  plan: ResearchPlan
): DataQuality {
  const active = records.filter(r => !r.isDuplicate);
  if (active.length === 0) {
    return {
      completeness: 0, validity: 0, uniqueness: 100, evidenceCoverage: 0,
      avgConfidence: 0, freshness: new Date().toISOString(),
      fieldQuality: {}, recordsNeedingReview: 0,
    };
  }

  const requiredFields = plan.outputFields.filter(f => f.required);
  const allFields = plan.outputFields;

  // ── Completeness ── % required fields filled across all records
  let totalRequired = 0;
  let filledRequired = 0;
  for (const record of active) {
    for (const field of requiredFields) {
      totalRequired++;
      if (record.fields[field.name]) filledRequired++;
    }
  }
  const completeness = totalRequired > 0 ? (filledRequired / totalRequired) * 100 : 100;

  // ── Validity ── % field values that passed validation
  let totalFields = 0;
  let validFields = 0;
  for (const record of active) {
    for (const field of allFields) {
      const fv = record.fieldValues?.[field.name];
      if (!fv) continue;
      if (fv.value === null) continue; // null is not invalid, just missing
      totalFields++;
      if (fv.validationStatus === 'valid' || fv.validationStatus === 'unvalidated') validFields++;
    }
  }
  const validity = totalFields > 0 ? (validFields / totalFields) * 100 : 100;

  // ── Uniqueness ── % records that are not duplicates
  const totalAll = records.length;
  const dupeCount = records.filter(r => r.isDuplicate).length;
  const uniqueness = totalAll > 0 ? ((totalAll - dupeCount) / totalAll) * 100 : 100;

  // ── Evidence Coverage ── % field values that are source_derived vs ai_inferred
  let totalExtracted = 0;
  let sourceDerivedCount = 0;
  for (const record of active) {
    for (const field of allFields) {
      const fv = record.fieldValues?.[field.name];
      if (!fv || fv.value === null) continue;
      totalExtracted++;
      if (fv.extractionMethod === 'source_derived') sourceDerivedCount++;
    }
  }
  const evidenceCoverage = totalExtracted > 0 ? (sourceDerivedCount / totalExtracted) * 100 : 0;

  // ── Average Confidence ──
  const avgConfidence = active.length > 0
    ? active.reduce((s, r) => s + r.confidence, 0) / active.length
    : 0;

  // ── Freshness ── Most recent source retrieval
  let mostRecent = new Date(0);
  for (const record of active) {
    for (const ev of record.evidence || []) {
      const d = new Date(ev.retrievedAt);
      if (d > mostRecent) mostRecent = d;
    }
  }

  // ── Field-level Quality ──
  const fieldQuality: Record<string, FieldQuality> = {};
  for (const field of allFields) {
    const withValue = active.filter(r => r.fields[field.name]).length;
    const withValid = active.filter(r => {
      const fv = r.fieldValues?.[field.name];
      return fv && fv.validationStatus !== 'invalid';
    }).length;
    const withEvidence = active.filter(r => {
      const fv = r.fieldValues?.[field.name];
      return fv && fv.value && fv.extractionMethod === 'source_derived';
    }).length;
    const fieldConfs = active
      .map(r => r.fieldValues?.[field.name]?.confidence)
      .filter((c): c is number => c !== undefined);

    fieldQuality[field.name] = {
      fillRate: Math.round((withValue / active.length) * 100),
      validRate: withValue > 0 ? Math.round((withValid / withValue) * 100) : 100,
      evidenceRate: withValue > 0 ? Math.round((withEvidence / withValue) * 100) : 0,
      avgConfidence: fieldConfs.length > 0
        ? Math.round(fieldConfs.reduce((a, b) => a + b, 0) / fieldConfs.length)
        : 0,
    };
  }

  return {
    completeness: Math.round(completeness),
    validity: Math.round(validity),
    uniqueness: Math.round(uniqueness),
    evidenceCoverage: Math.round(evidenceCoverage),
    avgConfidence: Math.round(avgConfidence),
    freshness: mostRecent > new Date(0) ? mostRecent.toISOString() : new Date().toISOString(),
    fieldQuality,
    recordsNeedingReview: active.filter(r => r.needsReview).length,
  };
}

/**
 * Deduplication using configurable key fields from the research plan.
 */
export function deduplicateRecords(records: ProcessedRecord[], plan: ResearchPlan): ProcessedRecord[] {
  const seen = new Map<string, string>(); // signature → first record id
  const keyFields = plan.deduplicationKeys.length > 0
    ? plan.deduplicationKeys
    : plan.outputFields.filter(f => f.required).slice(0, 2).map(f => f.name);

  return records.map(record => {
    const sig = keyFields
      .map(f => (record.fields[f] || '').toLowerCase().replace(/\s+/g, ' ').trim())
      .join('||');

    if (!sig.replace(/\|/g, '').trim()) return record; // insufficient data

    if (seen.has(sig)) {
      return { ...record, isDuplicate: true, duplicateOfId: seen.get(sig) };
    }

    seen.set(sig, record.id);
    return record;
  });
}

/**
 * Flag records that need human review.
 */
export function flagForReview(records: ProcessedRecord[], plan: ResearchPlan): ProcessedRecord[] {
  return records.map(record => {
    if (record.isDuplicate) return record;

    const flags: ProcessedRecord['reviewFlags'] = [];
    
    const missingRequired = plan.outputFields.filter(f => f.required && !record.fields[f.name]);
    if (missingRequired.length > 0) flags.push('missing_required');
    
    if (record.confidence < 55) flags.push('low_confidence');
    
    const hasEvidence = (record.evidence || []).some(e => e.snippet && e.snippet.length > 20);
    if (!hasEvidence) flags.push('weak_evidence');

    // Check for suspicious URLs
    const urlFields = plan.outputFields.filter(f => f.type === 'url');
    for (const field of urlFields) {
      const val = record.fields[field.name];
      if (val && (val.includes('example') || val.includes('demo') || val.includes('placeholder'))) {
        flags.push('suspicious_url');
        break;
      }
    }

    // Conflicting evidence: field value doesn't appear in any snippet
    const hasConflict = Object.entries(record.fieldValues || {}).some(([_, fv]) => {
      if (!fv.value || fv.extractionMethod !== 'source_derived') return false;
      const snippets = record.evidence.map(e => e.snippet.toLowerCase());
      return !snippets.some(s => s.includes(fv.value!.toLowerCase().slice(0, 10)));
    });
    if (hasConflict) flags.push('conflicting_evidence');

    return {
      ...record,
      needsReview: flags.length > 0,
      reviewFlags: flags,
    };
  });
}

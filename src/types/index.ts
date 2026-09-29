// ─── Core Evidence & Provenance Types ──────────────────────────────────────────

export type ExtractionMethod = 'source_derived' | 'ai_inferred' | 'user_corrected' | 'demo_generated';
export type ValidationStatus = 'valid' | 'invalid' | 'warning' | 'unvalidated';
export type ReviewAction = 'pending' | 'accepted' | 'rejected' | 'verified';
export type ReviewFlag = 'missing_required' | 'weak_evidence' | 'low_confidence' | 'suspicious_url' | 'possible_duplicate' | 'conflicting_evidence';

/** A single piece of retrieved evidence from a real source */
export interface Evidence {
  id: string;
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  retrievedAt: string;       // ISO timestamp
  /** The exact text excerpt supporting this evidence */
  snippet: string;
  /** Full page text (truncated, sanitized) */
  pageText?: string;
  /** Title of the source page */
  pageTitle?: string;
  relevance: number;          // 0-100
  searchQuery: string;        // Which query found this source
}

/** A single field value with full provenance chain */
export interface FieldValue {
  value: string | null;
  confidence: number;          // 0-100
  evidenceIds: string[];       // Links to Evidence[]
  extractionMethod: ExtractionMethod;
  validationStatus: ValidationStatus;
  validationMessage?: string;
  /** Original value before user correction */
  originalValue?: string | null;
  correctedAt?: string;
  /** AI reasoning for this extraction */
  reasoning?: string;
}

/** A retrieved search result (before content fetching) */
export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  position: number;
  searchQuery: string;
}

/** A fetched + sanitized web source */
export interface FetchedSource {
  id: string;
  url: string;
  title: string;
  text: string;            // Sanitized plaintext (max ~6000 chars)
  fetchedAt: string;
  status: 'success' | 'failed' | 'blocked' | 'timeout';
  error?: string;
  searchQuery: string;
  searchSnippet: string;   // Original snippet from search result
}

// ─── Research Planning ─────────────────────────────────────────────────────────

export interface ResearchPlan {
  objective: string;
  researchType: string;
  title: string;
  entities: string[];
  outputFields: FieldDefinition[];
  searchQueries: string[];
  sourceStrategy: string;
  validationRules: ValidationRule[];
  deduplicationKeys: string[];
  targetRecordCount: number;
  maxPasses: number;
  stoppingConditions: string[];
  complianceNotes: string;
}

export interface FieldDefinition {
  name: string;
  type: 'string' | 'url' | 'email' | 'phone' | 'number' | 'date' | 'boolean';
  required: boolean;
  description: string;
  validationHint?: string;
  extractionHint?: string;   // Hint to AI extractor for this field
}

export interface ValidationRule {
  field: string;
  rule: string;
  severity: 'error' | 'warning';
}

// ─── Data Source ───────────────────────────────────────────────────────────────

export interface DataSource {
  id: string;
  name: string;
  url: string;
  type: 'web_search' | 'job_board' | 'directory' | 'news' | 'social' | 'api';
  status: 'pending' | 'active' | 'completed' | 'failed' | 'blocked';
  searchQuery: string;
  recordsFound?: number;
  notes?: string;
  fetchStatus?: 'pending' | 'fetching' | 'fetched' | 'failed' | 'blocked';
  fetchedAt?: string;
}

// ─── Records ───────────────────────────────────────────────────────────────────

export interface RawRecord {
  id: string;
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  rawText: string;
  extractedAt: string;
  fields: Record<string, string | null>;
  evidenceId?: string;       // Which evidence item this came from
}

export interface ProcessedRecord {
  id: string;
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  /** Field values with full provenance */
  fieldValues: Record<string, FieldValue>;
  /** Legacy flat fields for table display */
  fields: Record<string, string | null>;
  /** All evidence items supporting this record */
  evidence: Evidence[];
  confidence: number;        // Overall record confidence
  validationIssues: ValidationIssue[];
  isDuplicate: boolean;
  duplicateOfId?: string;
  isValid: boolean;
  processedAt: string;
  /** Review workflow */
  needsReview: boolean;
  reviewFlags: ReviewFlag[];
  reviewStatus: ReviewAction;
  reviewedAt?: string;
  reviewNote?: string;
}

export interface ValidationIssue {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

// ─── Data Quality ──────────────────────────────────────────────────────────────

export interface FieldQuality {
  fillRate: number;         // % records with this field non-null
  validRate: number;        // % valid values
  evidenceRate: number;     // % source-derived vs inferred
  avgConfidence: number;
}

export interface DataQuality {
  completeness: number;     // % required fields filled
  validity: number;         // % valid field values
  uniqueness: number;       // % non-duplicate records
  evidenceCoverage: number; // % fields backed by real evidence
  avgConfidence: number;
  freshness: string;        // ISO timestamp of most recent source retrieval
  fieldQuality: Record<string, FieldQuality>;
  recordsNeedingReview: number;
}

// ─── Run & Change Detection ────────────────────────────────────────────────────

export type ChangeType = 'new' | 'removed' | 'changed' | 'unchanged';

export interface RecordChange {
  recordId: string;
  changeType: ChangeType;
  changedFields?: { field: string; oldValue: string | null; newValue: string | null }[];
}

export interface RunComparison {
  runId: string;
  previousRunId: string;
  newRecords: number;
  removedRecords: number;
  changedRecords: number;
  unchangedRecords: number;
  changes: RecordChange[];
  comparedAt: string;
}

// ─── Workflow Execution ────────────────────────────────────────────────────────

export interface WorkflowStep {
  id: string;
  name: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startedAt?: string;
  completedAt?: string;
  detail?: string;
  recordsProcessed?: number;
  error?: string;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'success' | 'warn' | 'error' | 'debug';
  stage: string;
  message: string;
  detail?: string;
}

export interface TaskSummary {
  totalRaw: number;
  totalProcessed: number;
  duplicatesRemoved: number;
  validationErrors: number;
  validationWarnings: number;
  avgConfidence: number;
  sourcesSucceeded: number;
  sourcesFailed: number;
  sourcesBlocked: number;
  topSources: { name: string; count: number }[];
  searchQueriesRun: number;
  pagesRetrieved: number;
  evidenceItems: number;
  passesCompleted: number;
  isDemo: boolean;
}

// ─── The Main Task ─────────────────────────────────────────────────────────────

export type TaskStatus =
  | 'idle'
  | 'planning'
  | 'searching'
  | 'retrieving'
  | 'extracting'
  | 'evaluating'
  | 'validating'
  | 'deduplicating'
  | 'scoring'
  | 'completed'
  | 'failed';

export interface ResearchTask {
  id: string;
  prompt: string;
  title: string;
  status: TaskStatus;
  progress: number;
  error?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;

  /** The AI-generated research plan (visible to user before execution) */
  plan: WorkflowStep[];
  researchPlan?: ResearchPlan;

  /** Legacy interpretation field (kept for compatibility) */
  interpretation?: {
    objective: string;
    researchType: string;
    outputFields: FieldDefinition[];
    sources: DataSource[];
    strategy: string;
    estimatedRecords: string;
    complianceNotes: string;
  };

  sources: DataSource[];
  evidence: Evidence[];     // All evidence collected
  rawRecords: RawRecord[];
  records: ProcessedRecord[];
  summary?: TaskSummary;
  quality?: DataQuality;

  /** Search provider used for this task */
  searchProvider: string;

  /** Run history for change detection */
  runNumber: number;
  previousRunId?: string;
  runComparison?: RunComparison;

  logs: LogEntry[];
}

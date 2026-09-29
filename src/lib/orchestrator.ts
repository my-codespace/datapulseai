import { v4 as uuidv4 } from 'uuid';
import {
  ResearchTask, TaskStatus, WorkflowStep, LogEntry, DataSource,
  ProcessedRecord, Evidence, TaskSummary, ResearchPlan
} from '@/types';
import { generateResearchPlan } from './ai/planner';
import { extractFromSources, evaluateCoverage, generateDemoRecords } from './ai/extractor';
import { getSearchProvider } from './search/providers';
import { fetchSources } from './retrieval/fetcher';
import { calculateDataQuality, deduplicateRecords, flagForReview } from './quality';
import { db, StoredTask, loadFullTask } from './db/client';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function addLog(taskId: string, level: LogEntry['level'], stage: string, message: string, detail?: string): void {
  const entry: LogEntry & { taskId: string } = {
    id: uuidv4(),
    taskId,
    timestamp: new Date().toISOString(),
    level,
    stage,
    message,
    detail,
  };
  db.log.create(entry);
  console.log(`[${level.toUpperCase()}][${stage}] ${message}`);
}

function updateTask(taskId: string, updates: Partial<StoredTask>): void {
  db.task.update(taskId, updates);
}

function updateStep(taskId: string, stepId: string, update: Partial<WorkflowStep>, currentPlan: WorkflowStep[]): WorkflowStep[] {
  const updated = currentPlan.map(s => s.id === stepId ? { ...s, ...update } : s);
  db.task.update(taskId, { plan: updated });
  return updated;
}

// ─── Main Orchestrator ────────────────────────────────────────────────────────

export async function executeTask(taskId: string): Promise<void> {
  const taskRow = db.task.findUnique(taskId);
  if (!taskRow) throw new Error(`Task ${taskId} not found`);

  const searchProvider = getSearchProvider();
  updateTask(taskId, { searchProvider: searchProvider.name });

  const initialPlan: WorkflowStep[] = [
    { id: 'plan', name: 'Research Planning', description: 'AI generates a dynamic research plan tailored to your request', status: 'pending' },
    { id: 'search', name: 'Web Search', description: 'Execute search queries to find relevant sources', status: 'pending' },
    { id: 'retrieve', name: 'Content Retrieval', description: 'Fetch and sanitize content from candidate sources', status: 'pending' },
    { id: 'extract', name: 'Evidence-Grounded Extraction', description: 'AI extracts structured data strictly from retrieved source content', status: 'pending' },
    { id: 'evaluate', name: 'Coverage Evaluation', description: 'Evaluate coverage and decide on additional passes', status: 'pending' },
    { id: 'validate', name: 'Validate & Deduplicate', description: 'Field validation, deduplication, and review flagging', status: 'pending' },
    { id: 'score', name: 'Quality Scoring', description: 'Calculate data quality metrics across all dimensions', status: 'pending' },
    { id: 'finalize', name: 'Finalize Dataset', description: 'Compile final dataset with full provenance chain', status: 'pending' },
  ];

  let plan = initialPlan;
  updateTask(taskId, { status: 'planning', plan, progress: 3 });

  try {
    // ════════════════════════════════════════════════════════════
    // STAGE 1: Dynamic Research Planning
    // ════════════════════════════════════════════════════════════
    plan = updateStep(taskId, 'plan', { status: 'running', startedAt: new Date().toISOString() }, plan);
    addLog(taskId, 'info', 'plan', 'Generating dynamic research plan...');

    const researchPlan: ResearchPlan = await generateResearchPlan(taskRow.prompt);
    updateTask(taskId, { title: researchPlan.title, researchPlan, status: 'planning', progress: 12 });

    plan = updateStep(taskId, 'plan', {
      status: 'completed',
      completedAt: new Date().toISOString(),
      detail: `${researchPlan.outputFields.length} fields · ${researchPlan.searchQueries.length} queries · target ${researchPlan.targetRecordCount} records`,
    }, plan);

    addLog(taskId, 'success', 'plan', `Research plan created: ${researchPlan.objective}`);
    addLog(taskId, 'info', 'plan', `Output schema: ${researchPlan.outputFields.map(f => f.name).join(', ')}`);
    addLog(taskId, 'info', 'plan', `Generated ${researchPlan.searchQueries.length} search queries`);
    addLog(taskId, 'info', 'plan', `Strategy: ${researchPlan.sourceStrategy}`);

    if (searchProvider.isDemo) {
      addLog(taskId, 'warn', 'plan',
        '⚠️ DEMO MODE ACTIVE — No search API key configured',
        'Add SERPER_API_KEY, BRAVE_API_KEY, or GOOGLE_CSE_KEY to .env.local for real web research'
      );
    }

    // ════════════════════════════════════════════════════════════
    // DEMO MODE: Generate simulated records (no search API)
    // ════════════════════════════════════════════════════════════
    if (searchProvider.isDemo) {
      addLog(taskId, 'warn', 'search', 'Running in DEMO MODE — generating simulated sample data');
      addLog(taskId, 'info', 'search', 'Add SERPER_API_KEY, BRAVE_API_KEY, or GOOGLE_CSE_KEY to .env.local for real research');

      // Skip search/retrieve — generate demo records directly
      for (const step of ['search', 'retrieve']) {
        plan = updateStep(taskId, step, {
          status: 'skipped',
          completedAt: new Date().toISOString(),
          detail: 'Skipped in Demo mode — no search API configured',
        }, plan);
      }
      updateTask(taskId, { status: 'extracting', progress: 40 });
      plan = updateStep(taskId, 'extract', { status: 'running', startedAt: new Date().toISOString() }, plan);
      addLog(taskId, 'info', 'extract', `Generating ${Math.min(researchPlan.targetRecordCount, 8)} demo records via AI...`);

      const { records: demoRecords, evidence: demoEvidence } = await generateDemoRecords(researchPlan);
      addLog(taskId, 'success', 'extract', `Generated ${demoRecords.length} demo records`);

      // Persist demo evidence
      const demoSource = {
        id: 'demo-source',
        taskId,
        name: '[DEMO DATA — simulated]',
        url: 'https://datapulse.example/demo',
        type: 'web_search' as const,
        status: 'completed' as const,
        searchQuery: researchPlan.searchQueries[0] || researchPlan.objective,
        notes: 'Demo mode: AI-generated records, not from real web research',
      };
      db.source.create(demoSource);

      for (const ev of demoEvidence) db.evidence.create({ ...ev, taskId });
      for (const rec of demoRecords) db.record.create({ ...rec, taskId });

      plan = updateStep(taskId, 'extract', {
        status: 'completed', completedAt: new Date().toISOString(),
        recordsProcessed: demoRecords.length,
        detail: `${demoRecords.length} demo records generated`,
      }, plan);

      // Skip coverage evaluation
      plan = updateStep(taskId, 'evaluate', {
        status: 'skipped', completedAt: new Date().toISOString(),
        detail: 'Skipped in Demo mode',
      }, plan);

      // Validate demo records
      updateTask(taskId, { status: 'validating', progress: 70 });
      plan = updateStep(taskId, 'validate', { status: 'running', startedAt: new Date().toISOString() }, plan);
      const dedupedDemo = deduplicateRecords(demoRecords, researchPlan);
      for (const rec of dedupedDemo) db.record.update(taskId, rec.id, { isDuplicate: rec.isDuplicate });
      plan = updateStep(taskId, 'validate', {
        status: 'completed', completedAt: new Date().toISOString(),
        detail: `${dedupedDemo.filter(r => !r.isDuplicate).length} unique demo records`,
      }, plan);

      // Quality score
      updateTask(taskId, { status: 'scoring', progress: 85 });
      plan = updateStep(taskId, 'score', { status: 'running', startedAt: new Date().toISOString() }, plan);
      const demoQuality = calculateDataQuality(dedupedDemo, researchPlan);
      plan = updateStep(taskId, 'score', {
        status: 'completed', completedAt: new Date().toISOString(),
        detail: `${demoQuality.completeness}% complete (demo data)`,
      }, plan);

      // Finalize
      plan = updateStep(taskId, 'finalize', { status: 'running', startedAt: new Date().toISOString() }, plan);
      const demoSummary: TaskSummary = {
        totalRaw: demoRecords.length, totalProcessed: demoRecords.filter(r => !r.isDuplicate).length,
        duplicatesRemoved: 0, validationErrors: 0, validationWarnings: 0,
        avgConfidence: 65, sourcesSucceeded: 1, sourcesFailed: 0, sourcesBlocked: 0,
        topSources: [{ name: '[DEMO DATA]', count: demoRecords.length }],
        searchQueriesRun: 0, pagesRetrieved: 0, evidenceItems: demoEvidence.length,
        passesCompleted: 1, isDemo: true,
      };
      plan = updateStep(taskId, 'finalize', {
        status: 'completed', completedAt: new Date().toISOString(),
        detail: `${demoRecords.length} demo records · Add a search API key for real research`,
      }, plan);
      updateTask(taskId, { status: 'completed', completedAt: new Date().toISOString(), progress: 100, plan, summary: demoSummary, quality: demoQuality });
      addLog(taskId, 'success', 'finalize', `✓ Demo complete — ${demoRecords.length} simulated records. Add SERPER_API_KEY for real results.`);
      return;
    }

    // ════════════════════════════════════════════════════════════
    // REAL MODE: Iterative search → retrieve → extract loop
    // ════════════════════════════════════════════════════════════
    let allRecords: ProcessedRecord[] = [];
    let allEvidence: Evidence[] = [];
    let allSourceIds = new Set<string>();
    let queriesRun: string[] = [];
    let pagesRetrieved = 0;
    let passNumber = 0;
    let currentQueries = researchPlan.searchQueries;

    while (passNumber < researchPlan.maxPasses) {
      passNumber++;
      const isFirstPass = passNumber === 1;
      addLog(taskId, 'info', 'search', `─── Research Pass ${passNumber}/${researchPlan.maxPasses} ───`);

      // ── STAGE 2: Search ──
      plan = updateStep(taskId, 'search', { status: 'running', startedAt: new Date().toISOString() }, plan);
      updateTask(taskId, { status: 'searching', progress: isFirstPass ? 15 : 50 });

      addLog(taskId, 'info', 'search', `Running ${currentQueries.length} queries via ${searchProvider.name}...`);

      const searchResults: import('@/types').SearchResult[] = [];
      for (const query of currentQueries) {
        try {
          addLog(taskId, 'info', 'search', `Searching: "${query}"`);
          const results = await searchProvider.search(query, { numResults: 8 });
          searchResults.push(...results);
          queriesRun.push(query);
          addLog(taskId, 'info', 'search', `  → ${results.length} results found`);
          await sleep(300);
        } catch (err) {
          addLog(taskId, 'warn', 'search', `Search failed for "${query}"`, String(err));
        }
      }

      // Deduplicate by URL
      const uniqueResults = searchResults.filter(r => r.url && !allSourceIds.has(r.url));
      addLog(taskId, 'info', 'search', `Found ${uniqueResults.length} new unique sources (${searchResults.length} total)`);

      plan = updateStep(taskId, 'search', {
        status: 'completed',
        completedAt: new Date().toISOString(),
        detail: `${queriesRun.length} queries → ${uniqueResults.length} candidate sources`,
      }, plan);

      // Save sources
      const newSources: (DataSource & { taskId: string })[] = uniqueResults.map(r => ({
        id: uuidv4(),
        taskId,
        name: r.title || r.url,
        url: r.url,
        type: 'web_search' as const,
        status: 'pending' as const,
        searchQuery: r.searchQuery,
        notes: r.snippet,
      }));

      db.source.createMany(newSources);
      for (const src of newSources) {
        allSourceIds.add(src.url);
      }

      // ── STAGE 3: Content Retrieval ──
      plan = updateStep(taskId, 'retrieve', { status: 'running', startedAt: new Date().toISOString() }, plan);
      updateTask(taskId, { status: 'retrieving', progress: isFirstPass ? 28 : 58 });

      addLog(taskId, 'info', 'retrieve', `Fetching content from up to ${Math.min(newSources.length, 15)} sources (concurrency: 3)...`);

      const toFetch = newSources.slice(0, 15).map(s => ({
        url: s.url,
        searchQuery: s.searchQuery,
        snippet: s.notes || '',
      }));

      const fetchedPages = await fetchSources(toFetch, 3);
      const successCount = fetchedPages.filter(p => p.status === 'success').length;
      const blockedCount = fetchedPages.filter(p => p.status === 'blocked').length;
      const failedCount = fetchedPages.filter(p => p.status !== 'success' && p.status !== 'blocked').length;
      pagesRetrieved += successCount;

      addLog(taskId, 'info', 'retrieve',
        `Retrieved: ${successCount} pages · ${blockedCount} blocked · ${failedCount} failed`
      );

      for (const page of fetchedPages) {
        const src = newSources.find(s => s.url === page.url);
        if (src) {
          db.source.update(taskId, src.id, {
            status: page.status === 'success' ? 'completed' : page.status === 'blocked' ? 'blocked' : 'failed',
            fetchStatus: page.status as DataSource['fetchStatus'],
            fetchedAt: page.status === 'success' ? page.fetchedAt : undefined,
          });
          if (page.status === 'blocked') {
            addLog(taskId, 'debug', 'retrieve', `  ⊘ Blocked (auth/paywall): ${page.url}`);
          }
        }
      }

      plan = updateStep(taskId, 'retrieve', {
        status: 'completed',
        completedAt: new Date().toISOString(),
        detail: `${pagesRetrieved} pages retrieved · ${blockedCount} blocked`,
      }, plan);

      // ── STAGE 4: Evidence-Grounded Extraction ──
      plan = updateStep(taskId, 'extract', { status: 'running', startedAt: new Date().toISOString() }, plan);
      updateTask(taskId, { status: 'extracting', progress: isFirstPass ? 45 : 68 });

      addLog(taskId, 'info', 'extract', `Extracting records from ${successCount} fetched pages...`);
      addLog(taskId, 'info', 'extract', 'AI extracts ONLY from retrieved source content — evidence-grounded');

      const sourcesWithContent = fetchedPages
        .filter(p => p.status === 'success' || (p.searchSnippet && p.searchSnippet.length > 20))
        .map(p => ({
          ...p,
          id: newSources.find(s => s.url === p.url)?.id || p.id,
        }));

      const { records: newRecords, evidence: newEvidence } = await extractFromSources(
        sourcesWithContent, researchPlan, allRecords
      );

      addLog(taskId, 'success', 'extract', `Extracted ${newRecords.length} candidate records from source content`);

      // Persist evidence
      db.evidence.createMany(newEvidence.map(ev => ({ ...ev, taskId })));

      // Persist records
      db.record.createMany(newRecords.map(rec => ({ ...rec, taskId })));

      allRecords = [...allRecords, ...newRecords];
      allEvidence = [...allEvidence, ...newEvidence];

      plan = updateStep(taskId, 'extract', {
        status: 'completed',
        completedAt: new Date().toISOString(),
        recordsProcessed: allRecords.length,
        detail: `${newRecords.length} new records · ${allRecords.length} total across all passes`,
      }, plan);

      // ── STAGE 5: Coverage Evaluation ──
      plan = updateStep(taskId, 'evaluate', { status: 'running', startedAt: new Date().toISOString() }, plan);
      updateTask(taskId, { status: 'evaluating', progress: isFirstPass ? 62 : 78 });

      addLog(taskId, 'info', 'evaluate',
        `Coverage: ${allRecords.length}/${researchPlan.targetRecordCount} target records · pass ${passNumber}/${researchPlan.maxPasses}`
      );

      const coverage = await evaluateCoverage(allRecords, researchPlan, passNumber);

      plan = updateStep(taskId, 'evaluate', {
        status: 'completed',
        completedAt: new Date().toISOString(),
        detail: coverage.reason,
      }, plan);

      if (coverage.sufficient || passNumber >= researchPlan.maxPasses) {
        addLog(taskId, 'success', 'evaluate', `Coverage sufficient: ${coverage.reason}`);
        break;
      } else {
        addLog(taskId, 'info', 'evaluate', `Initiating pass ${passNumber + 1} — insufficient coverage`);
        addLog(taskId, 'info', 'evaluate', `New queries: ${coverage.additionalQueries.join(' | ')}`);
        currentQueries = coverage.additionalQueries;
        await sleep(1000);
      }
    }

    // ════════════════════════════════════════════════════════════
    // STAGE 6: Validate, Deduplicate & Review Flagging
    // ════════════════════════════════════════════════════════════
    plan = updateStep(taskId, 'validate', { status: 'running', startedAt: new Date().toISOString() }, plan);
    updateTask(taskId, { status: 'validating', progress: 82 });

    const deduplicated = deduplicateRecords(allRecords, researchPlan);
    const dupeCount = deduplicated.filter(r => r.isDuplicate).length;
    addLog(taskId, 'info', 'validate', `Deduplication: ${dupeCount} duplicates removed`);

    const flagged = flagForReview(deduplicated, researchPlan);
    const reviewCount = flagged.filter(r => !r.isDuplicate && r.needsReview).length;
    addLog(taskId, 'info', 'validate', `Review flags: ${reviewCount} records need review`);

    // Update records in store with dedupe + review status
    for (const rec of flagged) {
      db.record.update(taskId, rec.id, {
        isDuplicate: rec.isDuplicate,
        duplicateOfId: rec.duplicateOfId,
        needsReview: rec.needsReview,
        reviewFlags: rec.reviewFlags,
      });
    }

    const validCount = flagged.filter(r => !r.isDuplicate && r.isValid).length;
    plan = updateStep(taskId, 'validate', {
      status: 'completed',
      completedAt: new Date().toISOString(),
      recordsProcessed: flagged.filter(r => !r.isDuplicate).length,
      detail: `${dupeCount} dupes removed · ${validCount} valid · ${reviewCount} need review`,
    }, plan);
    addLog(taskId, 'success', 'validate', `Validation complete — ${validCount} valid unique records`);

    // ════════════════════════════════════════════════════════════
    // STAGE 7: Data Quality Scoring
    // ════════════════════════════════════════════════════════════
    plan = updateStep(taskId, 'score', { status: 'running', startedAt: new Date().toISOString() }, plan);
    updateTask(taskId, { status: 'scoring', progress: 91 });

    addLog(taskId, 'info', 'score', 'Calculating data quality metrics...');
    const quality = calculateDataQuality(flagged, researchPlan);
    addLog(taskId, 'success', 'score',
      `Quality: ${quality.completeness}% complete · ${quality.validity}% valid · ${quality.evidenceCoverage}% evidence-backed`
    );

    plan = updateStep(taskId, 'score', {
      status: 'completed',
      completedAt: new Date().toISOString(),
      detail: `${quality.completeness}% complete · ${quality.evidenceCoverage}% evidence-backed · ${quality.avgConfidence}% confidence`,
    }, plan);

    // ════════════════════════════════════════════════════════════
    // STAGE 8: Finalize
    // ════════════════════════════════════════════════════════════
    plan = updateStep(taskId, 'finalize', { status: 'running', startedAt: new Date().toISOString() }, plan);
    updateTask(taskId, { progress: 97 });

    const active = flagged.filter(r => !r.isDuplicate);
    const sourceCounts = new Map<string, number>();
    for (const r of active) sourceCounts.set(r.sourceName, (sourceCounts.get(r.sourceName) || 0) + 1);

    const allDbSources = db.source.findMany(taskId);
    const summary: TaskSummary = {
      totalRaw: allRecords.length,
      totalProcessed: active.length,
      duplicatesRemoved: dupeCount,
      validationErrors: active.flatMap(r => r.validationIssues).filter(i => i.severity === 'error').length,
      validationWarnings: active.flatMap(r => r.validationIssues).filter(i => i.severity === 'warning').length,
      avgConfidence: quality.avgConfidence,
      sourcesSucceeded: allDbSources.filter(s => s.status === 'completed').length,
      sourcesFailed: allDbSources.filter(s => s.status === 'failed').length,
      sourcesBlocked: allDbSources.filter(s => s.status === 'blocked').length,
      topSources: Array.from(sourceCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, count })),
      searchQueriesRun: queriesRun.length,
      pagesRetrieved,
      evidenceItems: allEvidence.length,
      passesCompleted: passNumber,
      isDemo: searchProvider.isDemo,
    };

    plan = updateStep(taskId, 'finalize', {
      status: 'completed',
      completedAt: new Date().toISOString(),
      detail: `${active.length} records · ${allEvidence.length} evidence items · ${passNumber} passes`,
    }, plan);

    updateTask(taskId, {
      status: 'completed',
      completedAt: new Date().toISOString(),
      progress: 100,
      plan,
      summary,
      quality,
    });

    addLog(taskId, 'success', 'finalize',
      `✓ Research complete — ${active.length} clean records · ${allEvidence.length} evidence items · ${passNumber} passes`
    );

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    addLog(taskId, 'error', 'system', `Task failed: ${message}`);
    updateTask(taskId, {
      status: 'failed',
      error: message,
      plan: plan.map(s => s.status === 'running' ? { ...s, status: 'failed', error: message } : s),
    });
    throw err;
  }
}

// ─── Task Creation ─────────────────────────────────────────────────────────────

export function createTask(prompt: string): ResearchTask {
  const id = uuidv4();
  const now = new Date().toISOString();

  const initialPlan: WorkflowStep[] = [
    { id: 'plan', name: 'Research Planning', description: 'AI generates a dynamic research plan', status: 'pending' },
    { id: 'search', name: 'Web Search', description: 'Execute search queries', status: 'pending' },
    { id: 'retrieve', name: 'Content Retrieval', description: 'Fetch source pages', status: 'pending' },
    { id: 'extract', name: 'Evidence-Grounded Extraction', description: 'Extract from real source content', status: 'pending' },
    { id: 'evaluate', name: 'Coverage Evaluation', description: 'Evaluate and decide on additional passes', status: 'pending' },
    { id: 'validate', name: 'Validate & Deduplicate', description: 'Validate, dedupe, flag for review', status: 'pending' },
    { id: 'score', name: 'Quality Scoring', description: 'Calculate data quality metrics', status: 'pending' },
    { id: 'finalize', name: 'Finalize Dataset', description: 'Compile final dataset with provenance', status: 'pending' },
  ];

  const task: StoredTask = {
    id, prompt,
    title: prompt.slice(0, 80) + (prompt.length > 80 ? '...' : ''),
    status: 'idle',
    progress: 0,
    plan: initialPlan,
    searchProvider: 'pending',
    runNumber: 1,
    createdAt: now,
    updatedAt: now,
  };

  db.task.create(task);

  return {
    ...task,
    logs: [],
    sources: [],
    evidence: [],
    rawRecords: [],
    records: [],
  };
}

export { loadFullTask };

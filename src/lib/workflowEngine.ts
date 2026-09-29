/**
 * workflowEngine.ts — DEPRECATED
 *
 * This file has been replaced by the new modular architecture:
 *   - src/lib/orchestrator.ts        — Main workflow coordinator
 *   - src/lib/ai/planner.ts          — Dynamic research planning
 *   - src/lib/ai/extractor.ts        — Evidence-grounded extraction
 *   - src/lib/ai/client.ts           — Shared Gemini client with model fallbacks
 *   - src/lib/search/providers.ts    — Search provider abstraction (Serper/Brave/Google/Demo)
 *   - src/lib/retrieval/fetcher.ts   — Safe content retriever
 *   - src/lib/quality.ts             — Data quality + deduplication
 *   - src/lib/db/client.ts           — Persistent file-based store
 *
 * Re-exports orchestrator for any legacy imports.
 */

export { createTask, executeTask, loadFullTask } from './orchestrator';

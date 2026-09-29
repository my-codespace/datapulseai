import { callAI, safeParseJSON } from './client';
import { ResearchPlan, FieldDefinition, ValidationRule } from '@/types';

/**
 * Stage 1: Dynamic Research Planning
 * Generates a fully tailored research plan from the user's natural language prompt.
 * Different request types produce genuinely different plans.
 */
export async function generateResearchPlan(prompt: string): Promise<ResearchPlan> {
  const planningPrompt = `You are an expert research strategist. Analyze this research request and generate a comprehensive, dynamic research plan.

USER REQUEST: "${prompt}"

Generate a research plan that is genuinely tailored to this specific type of request.
Different request types need different workflows:

- Job research: search → job boards → extract positions → validate links → deduplicate by company+title
- Sponsorship research: identify companies → find contact pages → extract decision-makers → validate contacts
- Competitor research: identify competitors → pricing/features pages → extract plans → normalize + compare
- Lead generation: target segment search → company directories → extract companies → validate + enrich
- News/market: news sites → aggregate → extract entities → timeline + sentiment

Return ONLY valid JSON (no markdown) with this exact structure:
{
  "objective": "Precise one-sentence research objective",
  "researchType": "job_listings|sales_leads|market_data|company_info|news_intelligence|sponsorship_opportunities|competitor_analysis|contact_directory|general_research",
  "title": "4-8 word title",
  "entities": ["entity1", "entity2"],
  "outputFields": [
    {
      "name": "snake_case_field_name",
      "type": "string|url|email|phone|number|date|boolean",
      "required": true,
      "description": "What this field captures",
      "validationHint": "How to validate (e.g. must be valid URL, must contain @)",
      "extractionHint": "What text pattern to look for in source content"
    }
  ],
  "searchQueries": [
    "specific search query 1",
    "specific search query 2",
    "specific search query 3",
    "specific search query 4"
  ],
  "sourceStrategy": "Brief description of which types of sources to prioritize and why",
  "validationRules": [
    { "field": "field_name", "rule": "validation description", "severity": "error|warning" }
  ],
  "deduplicationKeys": ["field1", "field2"],
  "targetRecordCount": 20,
  "maxPasses": 2,
  "stoppingConditions": ["Target record count reached", "No new unique records found"],
  "complianceNotes": "Only using publicly accessible sources"
}

Rules:
- outputFields: 4-8 fields exactly matching what the user asked for
- searchQueries: 3-6 targeted queries that will find PUBLIC, OPEN web pages
- NEVER restrict queries to login-walled networks like site:linkedin.com, site:facebook.com, or site:instagram.com
- For job/career searches: use open applicant tracking systems (site:greenhouse.io, site:lever.co, site:workable.com, site:ashbyhq.com), startup boards (site:wellfound.com), tech company career sites, or general keyword queries like "frontend engineer hiring Bangalore 2024"
- For companies/leads/funding: use Crunchbase, TechCrunch, Y Combinator, directories, industry listicles, and official company sites
- All search queries should be different angles on the same topic`;

  const raw = await callAI(planningPrompt);
  const parsed = safeParseJSON(raw, null) as Record<string, unknown> | null;

  if (!parsed) throw new Error('Failed to generate research plan — invalid JSON from AI');

  const outputFields: FieldDefinition[] = ((parsed.outputFields as unknown[]) || []).map((f: unknown) => {
    const field = f as Record<string, unknown>;
    return {
      name: String(field.name || ''),
      type: (field.type as FieldDefinition['type']) || 'string',
      required: Boolean(field.required),
      description: String(field.description || ''),
      validationHint: field.validationHint ? String(field.validationHint) : undefined,
      extractionHint: field.extractionHint ? String(field.extractionHint) : undefined,
    };
  });

  const validationRules: ValidationRule[] = ((parsed.validationRules as unknown[]) || []).map((r: unknown) => {
    const rule = r as Record<string, unknown>;
    return {
      field: String(rule.field || ''),
      rule: String(rule.rule || ''),
      severity: (rule.severity as ValidationRule['severity']) || 'warning',
    };
  });

  return {
    objective: String(parsed.objective || prompt),
    researchType: String(parsed.researchType || 'general_research'),
    title: String(parsed.title || prompt.slice(0, 60)),
    entities: (parsed.entities as string[]) || [],
    outputFields,
    searchQueries: (parsed.searchQueries as string[]) || [prompt],
    sourceStrategy: String(parsed.sourceStrategy || 'Multi-source web research'),
    validationRules,
    deduplicationKeys: (parsed.deduplicationKeys as string[]) || ['name'],
    targetRecordCount: Number(parsed.targetRecordCount) || 20,
    maxPasses: Math.min(Number(parsed.maxPasses) || 2, 3),
    stoppingConditions: (parsed.stoppingConditions as string[]) || ['Target reached'],
    complianceNotes: String(parsed.complianceNotes || 'Using publicly accessible sources only'),
  };
}

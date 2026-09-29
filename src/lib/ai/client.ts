import { GoogleGenerativeAI } from '@google/generative-ai';

// ─── Model Configuration ───────────────────────────────────────────────────────
// Real Gemini model IDs (stable as of 2025). Tried in order — first success wins.
// Free-tier models are unlimited for non-commercial use.
// Ref: https://ai.google.dev/gemini-api/docs/models

const MODEL_FALLBACKS = [
  'gemini-2.0-flash',         // Primary: fast, capable, large context
  'gemini-2.0-flash-lite',    // Secondary: faster, lower quota cost
  'gemini-1.5-flash',         // Tertiary: highly available, stable
  'gemini-1.5-flash-8b',      // Quaternary: smallest/fastest, great fallback
  'gemini-1.5-pro',           // Last resort: most capable but lower rate limits
];

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
let resolvedModel: string | null = null;
let resolvedModelFailCount = 0;

async function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

async function callModel(modelName: string, prompt: string, jsonMode: boolean): Promise<string> {
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: jsonMode
      ? { responseMimeType: 'application/json', temperature: 0.2 }
      : { temperature: 0.5 },
  });
  const result = await model.generateContent(prompt);
  const text = result.response.text();
  if (!text || text.trim().length === 0) {
    throw new Error(`Model ${modelName} returned empty response`);
  }
  return text;
}

function isRateLimit(msg: string): boolean {
  return msg.includes('429') || msg.toLowerCase().includes('quota') || msg.toLowerCase().includes('rate limit') || msg.toLowerCase().includes('resource exhausted');
}

function isFatal(msg: string): boolean {
  // Non-retriable errors — don't burn retries on these
  return msg.includes('API_KEY_INVALID') || msg.includes('403') || msg.includes('PERMISSION_DENIED');
}

export async function callAI(prompt: string, jsonMode = true): Promise<string> {
  // ── Try cached model first ──────────────────────────────────────────────────
  // ── Try cached model first ──────────────────────────────────────────────────
  if (resolvedModel) {
    try {
      const result = await callModel(resolvedModel, prompt, jsonMode);
      return result;
    } catch (err) {
      console.warn(`[DataPulse AI] Cached model ${resolvedModel} failed (${String(err).slice(0, 60)}). Resetting...`);
      resolvedModel = null;
    }
  }

  // ── Discover working model from fallback list ───────────────────────────────
  let lastError: Error | null = null;

  for (const modelName of MODEL_FALLBACKS) {
    if (modelName === resolvedModel) continue; // already tried above

    try {
      const result = await callModel(modelName, prompt, jsonMode);
      resolvedModel = modelName;
      resolvedModelFailCount = 0;
      console.log(`[DataPulse AI] Using model: ${modelName}`);
      return result;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const msg = lastError.message;

      if (isFatal(msg)) throw lastError;

      if (isRateLimit(msg)) {
        console.warn(`[DataPulse AI] ${modelName} rate-limited, immediately trying next fallback...`);
        continue;
      }

      console.warn(`[DataPulse AI] ${modelName} failed (${msg.slice(0, 70)}), trying next...`);
    }
  }

  // If all models were unavailable, wait 4s and retry the reliable primary model
  console.warn('[DataPulse AI] All models temporarily busy, waiting 4s before retry...');
  await sleep(4000);

  try {
    const result = await callModel('gemini-2.0-flash', prompt, jsonMode);
    resolvedModel = 'gemini-2.0-flash';
    return result;
  } catch (retryErr) {
    lastError = retryErr instanceof Error ? retryErr : new Error(String(retryErr));
  }

  throw lastError ?? new Error('All Gemini models unavailable. Please check your GEMINI_API_KEY and try again.');
}

export function safeParseJSON<T>(text: string, fallback: T): T {
  try {
    // Strip markdown code fences if present
    const cleaned = text
      .replace(/^```json\s*/mi, '')
      .replace(/^```\s*/mi, '')
      .replace(/```\s*$/m, '')
      .trim();
    return JSON.parse(cleaned) as T;
  } catch {
    // Try to extract JSON from a larger text block
    const jsonMatch = (cleaned: string): T | null => {
      const start = cleaned.indexOf('{') !== -1 ? cleaned.indexOf('{') : cleaned.indexOf('[');
      const end = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
      if (start !== -1 && end !== -1 && end > start) {
        try { return JSON.parse(cleaned.slice(start, end + 1)) as T; } catch { return null; }
      }
      return null;
    };
    const extracted = jsonMatch(text);
    return extracted ?? fallback;
  }
}

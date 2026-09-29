import { FetchedSource } from '@/types';
import { v4 as uuidv4 } from 'uuid';
import * as cheerio from 'cheerio';

// ─── URL Safety List ───────────────────────────────────────────────────────────

/** Domains that require auth, have paywalls, or are known to block scrapers */
const BLOCKED_DOMAINS = new Set([
  'linkedin.com', 'facebook.com', 'instagram.com', 'twitter.com', 'x.com',
  'reddit.com', 'wsj.com', 'ft.com', 'bloomberg.com', 'nytimes.com',
  'hbr.org', 'medium.com', // medium has metered paywall
  'quora.com', 'pinterest.com', 'tiktok.com',
]);

/** Only allow http/https */
const ALLOWED_PROTOCOLS = new Set(['https:', 'http:']);

/** Max content length to fetch (bytes) */
const MAX_CONTENT_LENGTH = 500_000; // 500KB

/** Max chars of text to pass to AI (keep prompts manageable) */
const MAX_TEXT_CHARS = 6000;

/** Fetch timeout in ms */
const FETCH_TIMEOUT_MS = 8000;

// ─── Prompt Injection Defense ──────────────────────────────────────────────────

const INJECTION_PATTERNS = [
  /ignore previous instructions/gi,
  /ignore all prior/gi,
  /disregard (your |all |the )?instructions/gi,
  /you are now/gi,
  /act as/gi,
  /system prompt/gi,
  /\[INST\]/gi,
  /<\|im_start\|>/gi,
  /###\s*instruction/gi,
  /OVERRIDE:/gi,
];

function sanitizeForPrompt(text: string): string {
  let sanitized = text;
  for (const pattern of INJECTION_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[CONTENT REDACTED]');
  }
  return sanitized;
}

// ─── URL Validation ────────────────────────────────────────────────────────────

function isSafeUrl(url: string): { safe: boolean; reason?: string } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { safe: false, reason: 'Invalid URL format' };
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    return { safe: false, reason: `Protocol not allowed: ${parsed.protocol}` };
  }

  // Block private IP ranges
  const host = parsed.hostname.toLowerCase();
  if (
    host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' ||
    host.startsWith('192.168.') || host.startsWith('10.') || host.startsWith('172.16.') ||
    host.endsWith('.local') || host.endsWith('.internal')
  ) {
    return { safe: false, reason: 'Private/internal IP not allowed' };
  }

  const domain = parsed.hostname.replace(/^www\./, '');
  if (BLOCKED_DOMAINS.has(domain) || [...BLOCKED_DOMAINS].some(d => domain.endsWith('.' + d))) {
    return { safe: false, reason: `Domain blocked (auth/paywall): ${domain}` };
  }

  return { safe: true };
}

// ─── HTML → Plaintext ─────────────────────────────────────────────────────────

function htmlToText(html: string, url: string): { title: string; text: string } {
  const $ = cheerio.load(html);

  // Remove non-content elements
  $('script, style, nav, header, footer, aside, iframe, noscript, [aria-hidden="true"]').remove();
  $('[class*="cookie"], [class*="popup"], [class*="banner"], [class*="overlay"]').remove();
  $('[id*="cookie"], [id*="popup"], [id*="banner"]').remove();

  const title = $('title').first().text().trim() || $('h1').first().text().trim() || url;

  // Extract meaningful text — prefer main content areas
  let text = '';
  const mainSelectors = ['main', 'article', '[role="main"]', '.content', '#content', '.post-body'];
  for (const sel of mainSelectors) {
    const el = $(sel).first();
    if (el.length && el.text().trim().length > 200) {
      text = el.text();
      break;
    }
  }

  if (!text) {
    text = $('body').text();
  }

  // Normalize whitespace
  text = text.replace(/\s+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

  // Truncate
  if (text.length > MAX_TEXT_CHARS) {
    text = text.slice(0, MAX_TEXT_CHARS) + '\n[CONTENT TRUNCATED — showing first 6000 chars]';
  }

  return { title: title.slice(0, 200), text };
}

// ─── Main Fetcher ──────────────────────────────────────────────────────────────

export async function fetchPageContent(
  url: string,
  searchQuery: string,
  searchSnippet: string
): Promise<FetchedSource> {
  const id = uuidv4();
  const fetchedAt = new Date().toISOString();

  // Safety check
  const { safe, reason } = isSafeUrl(url);
  if (!safe) {
    return {
      id, url,
      title: searchSnippet ? `Source (${new URL(url).hostname})` : '',
      text: searchSnippet ? `URL: ${url}\nSearch Snippet: ${searchSnippet}` : '',
      fetchedAt,
      status: searchSnippet ? 'success' : 'blocked',
      error: reason,
      searchQuery, searchSnippet,
    };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
      },
      redirect: 'follow',
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return {
        id, url,
        title: searchSnippet ? `Source (${new URL(url).hostname})` : '',
        text: searchSnippet ? `URL: ${url}\nSearch Snippet: ${searchSnippet}` : '',
        fetchedAt,
        status: searchSnippet ? 'success' : 'failed',
        error: `HTTP ${response.status}`,
        searchQuery, searchSnippet,
      };
    }

    // Check content type — only process HTML
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
      return {
        id, url,
        title: `[${contentType}]`,
        text: searchSnippet ? `URL: ${url}\nSnippet: ${searchSnippet}` : `[Binary content at ${url}]`,
        fetchedAt,
        status: 'success',
        searchQuery, searchSnippet,
      };
    }

    // Check size
    const contentLength = Number(response.headers.get('content-length') ?? 0);
    if (contentLength > MAX_CONTENT_LENGTH) {
      return {
        id, url,
        title: searchSnippet ? `Source (${new URL(url).hostname})` : '',
        text: searchSnippet ? `URL: ${url}\nSnippet: ${searchSnippet}` : '',
        fetchedAt,
        status: searchSnippet ? 'success' : 'failed',
        error: `Content too large: ${contentLength} bytes`,
        searchQuery, searchSnippet,
      };
    }

    const html = await response.text();
    const { title, text } = htmlToText(html, url);
    const sanitizedText = sanitizeForPrompt(text);

    // If fetched HTML was thin (e.g. client-side JS app / redirect shell), enrich with Google's search snippet
    const finalText = sanitizedText.length > 80
      ? sanitizedText
      : searchSnippet
        ? `Title: ${title}\nURL: ${url}\nSearch Snippet: ${searchSnippet}`
        : sanitizedText;

    return {
      id, url, title, text: finalText, fetchedAt,
      status: 'success',
      searchQuery, searchSnippet,
    };

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isTimeout = message.includes('abort') || message.includes('timeout');

    return {
      id, url,
      title: searchSnippet ? `Source (${new URL(url).hostname})` : '',
      text: searchSnippet ? `URL: ${url}\nSearch Snippet: ${searchSnippet}` : '',
      fetchedAt,
      status: searchSnippet ? 'success' : isTimeout ? 'timeout' : 'failed',
      error: isTimeout ? 'Request timed out' : message.slice(0, 200),
      searchQuery, searchSnippet,
    };
  }
}

/** Fetch multiple sources concurrently with a concurrency limit */
export async function fetchSources(
  sources: { url: string; searchQuery: string; snippet: string }[],
  concurrency = 3
): Promise<FetchedSource[]> {
  const results: FetchedSource[] = [];
  
  for (let i = 0; i < sources.length; i += concurrency) {
    const batch = sources.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(s => fetchPageContent(s.url, s.searchQuery, s.snippet))
    );
    results.push(...batchResults);
  }

  return results;
}

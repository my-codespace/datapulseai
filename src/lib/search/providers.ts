import { SearchResult } from '@/types';

// ─── Search Provider Interface ─────────────────────────────────────────────────

export interface SearchOptions {
  numResults?: number;
  language?: string;
  country?: string;
}

export interface SearchProvider {
  readonly name: string;
  readonly isDemo: boolean;
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
}

// ─── Serper Provider ───────────────────────────────────────────────────────────

class SerperProvider implements SearchProvider {
  readonly name = 'Serper';
  readonly isDemo = false;

  constructor(private readonly apiKey: string) {}

  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const response = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ q: query, num: options.numResults ?? 8 }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`Serper API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as { organic?: SerperOrganic[] };
    return (data.organic ?? []).map((r, i) => ({
      title: r.title ?? '',
      url: r.link ?? '',
      snippet: r.snippet ?? '',
      position: i + 1,
      searchQuery: query,
    }));
  }
}

interface SerperOrganic {
  title?: string;
  link?: string;
  snippet?: string;
}

// ─── Brave Search Provider ─────────────────────────────────────────────────────

class BraveProvider implements SearchProvider {
  readonly name = 'Brave';
  readonly isDemo = false;

  constructor(private readonly apiKey: string) {}

  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const params = new URLSearchParams({ q: query, count: String(options.numResults ?? 8) });
    const response = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
      headers: { 'Accept': 'application/json', 'X-Subscription-Token': this.apiKey },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`Brave Search API error: ${response.status}`);
    }

    const data = await response.json() as { web?: { results?: BraveResult[] } };
    return (data.web?.results ?? []).map((r, i) => ({
      title: r.title ?? '',
      url: r.url ?? '',
      snippet: r.description ?? '',
      position: i + 1,
      searchQuery: query,
    }));
  }
}

interface BraveResult {
  title?: string;
  url?: string;
  description?: string;
}

// ─── Google Custom Search Provider ────────────────────────────────────────────

class GoogleCSEProvider implements SearchProvider {
  readonly name = 'Google CSE';
  readonly isDemo = false;

  constructor(private readonly apiKey: string, private readonly cseId: string) {}

  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const params = new URLSearchParams({
      key: this.apiKey,
      cx: this.cseId,
      q: query,
      num: String(Math.min(options.numResults ?? 8, 10)),
    });

    const response = await fetch(`https://www.googleapis.com/customsearch/v1?${params}`, {
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`Google CSE error: ${response.status}`);
    }

    const data = await response.json() as { items?: GoogleItem[] };
    return (data.items ?? []).map((r, i) => ({
      title: r.title ?? '',
      url: r.link ?? '',
      snippet: r.snippet ?? '',
      position: i + 1,
      searchQuery: query,
    }));
  }
}

interface GoogleItem {
  title?: string;
  link?: string;
  snippet?: string;
}

// ─── Demo Provider (clearly labelled, no real requests) ───────────────────────

const DEMO_TEMPLATES: Record<string, SearchResult[]> = {
  default: [
    { title: '[DEMO] Example Result 1', url: 'https://demo.datapulse.example/result-1', snippet: 'This is a demo result. Add a real search API key to get actual web results.', position: 1, searchQuery: '' },
    { title: '[DEMO] Example Result 2', url: 'https://demo.datapulse.example/result-2', snippet: 'Demo mode is active. Set SERPER_API_KEY, BRAVE_API_KEY, or GOOGLE_CSE_KEY in .env.local.', position: 2, searchQuery: '' },
    { title: '[DEMO] Example Result 3', url: 'https://demo.datapulse.example/result-3', snippet: 'Real results require a search API. DataPulse supports Serper, Brave Search, and Google CSE.', position: 3, searchQuery: '' },
  ],
};

class DemoProvider implements SearchProvider {
  readonly name = 'Demo (no search API configured)';
  readonly isDemo = true;

  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    // Artificial delay to simulate real search
    await new Promise(r => setTimeout(r, 600));
    const count = options.numResults ?? 3;
    return DEMO_TEMPLATES.default.slice(0, count).map(r => ({ ...r, searchQuery: query }));
  }
}

// ─── Provider Factory ──────────────────────────────────────────────────────────

let _provider: SearchProvider | null = null;

export function getSearchProvider(): SearchProvider {
  if (_provider) return _provider;

  const serperKey = process.env.SERPER_API_KEY;
  const braveKey = process.env.BRAVE_API_KEY;
  const googleKey = process.env.GOOGLE_CSE_KEY;
  const googleCseId = process.env.GOOGLE_CSE_ID;
  const preferred = process.env.SEARCH_PROVIDER?.toLowerCase();

  if (preferred === 'brave' && braveKey) {
    _provider = new BraveProvider(braveKey);
  } else if (preferred === 'google' && googleKey && googleCseId) {
    _provider = new GoogleCSEProvider(googleKey, googleCseId);
  } else if (serperKey) {
    _provider = new SerperProvider(serperKey);
  } else if (braveKey) {
    _provider = new BraveProvider(braveKey);
  } else if (googleKey && googleCseId) {
    _provider = new GoogleCSEProvider(googleKey, googleCseId);
  } else {
    console.warn('[DataPulse] No search API key found — running in DEMO MODE. Add SERPER_API_KEY to .env.local for real results.');
    _provider = new DemoProvider();
  }

  console.log(`[DataPulse] Search provider: ${_provider.name}`);
  return _provider;
}

/** Reset cached provider (useful for testing) */
export function resetSearchProvider(): void {
  _provider = null;
}

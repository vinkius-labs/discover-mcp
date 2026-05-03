import { describe, it, expect, vi } from 'vitest';
import {
  tokenize,
  similarity,
  buildQuery,
  matchCategories,
  rankResults,
  route,
} from '../src/engine/semantic-router.js';
import type { CatalogSearchResult } from '../src/types.js';
import type { VinkiusClient } from '../src/api/client.js';
import { CapabilityGraph } from '../src/engine/capability-graph.js';

// ── Text Processing ─────────────────────────────────────────────────────────

describe('tokenize', () => {
  it('lowercases and splits on whitespace', () => {
    expect(tokenize('Hello World')).toEqual(['hello', 'world']);
  });

  it('filters short words and preserves content words (language-agnostic)', () => {
    const tokens = tokenize('the quick brown fox and the lazy dog');
    // 'the' and 'and' are kept (3 chars) — no stop-word lists needed
    expect(tokens).toContain('the');
    expect(tokens).toContain('and');
    expect(tokens).toContain('quick');
    expect(tokens).toContain('brown');
    expect(tokens).toContain('fox');
    expect(tokens).toContain('dog');
  });

  it('removes short words (< 3 chars)', () => {
    const tokens = tokenize('go to my big database');
    expect(tokens).not.toContain('go');
    expect(tokens).not.toContain('to');
    expect(tokens).not.toContain('my');
    expect(tokens).toContain('big');
    expect(tokens).toContain('database');
  });

  it('strips special characters', () => {
    const tokens = tokenize('U.S. CPI (inflation) data!');
    expect(tokens).toContain('cpi');
    expect(tokens).toContain('inflation');
  });

  it('returns empty array for empty input', () => {
    expect(tokenize('')).toEqual([]);
  });

  it('preserves hyphens in compound words', () => {
    const tokens = tokenize('time-series economic-data');
    expect(tokens).toContain('time-series');
    expect(tokens).toContain('economic-data');
  });

  it('preserves Portuguese accented characters', () => {
    const tokens = tokenize('buscar dados de inflação no Brasil');
    expect(tokens).toContain('buscar');
    expect(tokens).toContain('dados');
    expect(tokens).toContain('inflação');
    expect(tokens).toContain('brasil');
  });

  it('preserves Spanish accented characters', () => {
    const tokens = tokenize('obtener información económica');
    expect(tokens).toContain('obtener');
    expect(tokens).toContain('información');
    expect(tokens).toContain('económica');
  });

  it('preserves French accented characters', () => {
    const tokens = tokenize('récupérer les données financières');
    expect(tokens).toContain('récupérer');
    expect(tokens).toContain('données');
    expect(tokens).toContain('financières');
  });
});

describe('similarity', () => {
  it('returns 1 for identical sets', () => {
    expect(similarity(['inflation', 'cpi', 'economics'], ['inflation', 'cpi', 'economics'])).toBe(1);
  });

  it('returns 0 for completely disjoint sets', () => {
    expect(similarity(['apple', 'banana'], ['car', 'train'])).toBe(0);
  });

  it('returns 0 for two empty arrays', () => {
    expect(similarity([], [])).toBe(0);
  });

  it('returns correct Jaccard for partial overlap', () => {
    // {inflation, cpi, data} ∩ {inflation, economics, data} = {inflation, data} = 2
    // Union = {inflation, cpi, data, economics} = 4
    // Jaccard = 2/4 = 0.5
    expect(similarity(['inflation', 'cpi', 'data'], ['inflation', 'economics', 'data'])).toBe(0.5);
  });

  it('handles one empty array', () => {
    expect(similarity(['test'], [])).toBe(0);
    expect(similarity([], ['test'])).toBe(0);
  });
});

// ── Query Building ──────────────────────────────────────────────────────────

describe('buildQuery', () => {
  it('extracts keywords from capability', () => {
    const query = buildQuery({ capability: 'fetch CPI data' });
    expect(query).toContain('fetch');
    expect(query).toContain('cpi');
    expect(query).toContain('data');
  });

  it('includes domain keywords', () => {
    const query = buildQuery({ capability: 'fetch data', domain: 'economics' });
    expect(query).toContain('fetch');
    expect(query).toContain('data');
    expect(query).toContain('economics');
  });

  it('appends input hint keys', () => {
    const query = buildQuery({
      capability: 'fetch data',
      inputHints: { series_id: 'string', start_date: 'date' },
    });
    expect(query).toContain('series_id');
    expect(query).toContain('start_date');
  });

  it('tokenizes output hints', () => {
    const query = buildQuery({
      capability: 'fetch data',
      outputHints: 'time-series JSON',
    });
    expect(query).toContain('time-series');
    expect(query).toContain('json');
  });

  it('deduplicates keywords across all fields', () => {
    const query = buildQuery({
      capability: 'fetch CPI',
      domain: 'economics',
      inputHints: { series_id: 'string' },
      outputHints: 'JSON array',
    });
    expect(query).toContain('fetch');
    expect(query).toContain('cpi');
    expect(query).toContain('economics');
    expect(query).toContain('series_id');
    expect(query).toContain('json');
    expect(query).toContain('array');
    // No duplicates
    const words = query.split(' ');
    expect(words.length).toBe(new Set(words).size);
  });
});

// ── Category Matching ───────────────────────────────────────────────────────

describe('matchCategories', () => {
  const categories = [
    { slug: 'industry-titans', label: 'Industry Titans' },
    { slug: 'money-moves', label: 'Money Moves' },
    { slug: 'the-unthinkable', label: 'The Unthinkable' },
    { slug: 'fort-knox', label: 'Fort Knox' },
    { slug: 'brain-trust', label: 'Brain Trust' },
    { slug: 'growth-engine', label: 'Growth Engine' },
  ];

  it('matches by keyword similarity', () => {
    const matched = matchCategories('financial growth', categories);
    expect(matched).toContain('growth-engine');
  });

  it('matches by substring containment', () => {
    const matched = matchCategories('Industry', categories);
    expect(matched[0]).toBe('industry-titans');
  });

  it('returns empty for no matches', () => {
    const matched = matchCategories('quantum computing', categories);
    expect(matched).toEqual([]);
  });

  it('returns results sorted by score (best first)', () => {
    const matched = matchCategories('Fort Knox security', categories);
    expect(matched[0]).toBe('fort-knox');
  });
});

// ── Result Ranking ──────────────────────────────────────────────────────────

describe('rankResults', () => {
  function makeResult(overrides: Partial<CatalogSearchResult> = {}): CatalogSearchResult {
    return {
      id: 'uuid-1',
      slug: 'test-server',
      title: 'Test Server',
      short_description: 'A test server',
      listing_type: 'free',
      publisher_type: 'official',
      avg_rating: 4.5,
      tags: [],
      categories: ['Brain Trust'],
      icon_url: null,
      top_tools: [{ name: 'test_tool', description: 'A test tool' }],
      action: 'activate',
      ...overrides,
    };
  }

  it('ranks servers with matching category higher', () => {
    const results = [
      makeResult({ slug: 'no-match', title: 'No Match', categories: ['Fort Knox'] }),
      makeResult({ slug: 'match', title: 'Match', categories: ['Brain Trust'] }),
    ];

    const ranked = rankResults(results, { capability: 'data analysis' }, ['brain-trust']);
    expect(ranked[0].server.slug).toBe('match');
    expect(ranked[0].categoryScore).toBe(1.0);
    expect(ranked[1].categoryScore).toBe(0.0);
  });

  it('gives neutral category score when no category filter', () => {
    const results = [makeResult()];
    const ranked = rankResults(results, { capability: 'test' }, []);
    expect(ranked[0].categoryScore).toBe(0.5);
  });

  it('scores tools by keyword similarity', () => {
    const results = [
      makeResult({
        slug: 'fred',
        top_tools: [
          { name: 'get_series_observations', description: 'Get economic time series observations' },
          { name: 'search_series', description: 'Search for economic data series' },
        ],
      }),
    ];

    const ranked = rankResults(results, { capability: 'economic time series observations' }, []);
    expect(ranked[0].toolScores.length).toBe(2);
    // Tools should be sorted by score, best first
    expect(ranked[0].toolScores[0].score).toBeGreaterThanOrEqual(ranked[0].toolScores[1].score);
  });

  it('handles servers with no top_tools', () => {
    const results = [makeResult({ top_tools: [] })];
    const ranked = rankResults(results, { capability: 'test' }, []);
    expect(ranked[0].toolScores).toEqual([]);
  });

  it('sorts final results by overallScore descending', () => {
    const results = [
      makeResult({ slug: 'low', title: 'Unrelated Server', short_description: 'nothing' }),
      makeResult({
        slug: 'high',
        title: 'FRED Economic Intelligence',
        short_description: 'economic data and CPI inflation',
        top_tools: [{ name: 'get_cpi', description: 'Get CPI inflation data' }],
      }),
    ];

    const ranked = rankResults(
      results,
      { capability: 'CPI inflation data', domain: 'economics' },
      [],
    );
    expect(ranked[0].server.slug).toBe('high');
  });
});

// ── Full Pipeline ───────────────────────────────────────────────────────────

describe('route', () => {
  function makeClient(overrides: Partial<VinkiusClient> = {}): VinkiusClient {
    return {
      browse: vi.fn().mockResolvedValue({
        categories: [
          { slug: 'the-unthinkable', label: 'The Unthinkable', listing_count: 93 },
          { slug: 'money-moves', label: 'Money Moves', listing_count: 91 },
        ],
      }),
      search: vi.fn().mockResolvedValue({
        results: [
          {
            id: 'uuid-fred',
            slug: 'fred',
            title: 'FRED Full Access',
            short_description: 'U.S. economic data',
            listing_type: 'free',
            publisher_type: 'official',
            avg_rating: 4.8,
            tags: ['economics'],
            categories: ['The Unthinkable'],
            icon_url: null,
            top_tools: [{ name: 'get_series', description: 'Get time series' }],
            action: 'activate',
          },
        ],
        total: 1,
        hint: '',
      }),
      ...overrides,
    } as unknown as VinkiusClient;
  }

  it('calls browse when domain is provided', async () => {
    const client = makeClient();
    await route(client, { capability: 'inflation data', domain: 'economics' });
    expect(client.browse).toHaveBeenCalledTimes(1);
  });

  it('skips browse when no domain', async () => {
    const client = makeClient();
    await route(client, { capability: 'inflation data' });
    expect(client.browse).not.toHaveBeenCalled();
  });

  it('calls search with optimized query', async () => {
    const client = makeClient();
    await route(client, {
      capability: 'fetch CPI data',
      domain: 'economics',
      inputHints: { series_id: 'string' },
    });

    expect(client.search).toHaveBeenCalledWith(
      'fetch cpi data economics series_id',
      15,
    );
  });

  it('returns ranked servers', async () => {
    const client = makeClient();
    const result = await route(client, { capability: 'inflation data' });

    expect(result.servers.length).toBeGreaterThan(0);
    expect(result.servers[0].slug).toBe('fred');
    expect(result.servers[0].overall_score).toBeGreaterThan(0);
  });

  it('includes session context from capability graph', async () => {
    const client = makeClient();
    const graph = new CapabilityGraph();
    graph.record('stripe__list_charges', 'stripe');

    const result = await route(client, { capability: 'test' }, graph);
    expect(result.sessionContext).toContain('stripe');
  });

  it('returns empty session context when no graph', async () => {
    const client = makeClient();
    const result = await route(client, { capability: 'test' });
    expect(result.sessionContext).toBe('');
  });

  it('handles browse failure gracefully', async () => {
    const client = makeClient({
      browse: vi.fn().mockRejectedValue(new Error('Network error')),
    } as any);

    const result = await route(client, { capability: 'test', domain: 'economics' });
    expect(result.matchedCategories).toEqual([]);
    expect(result.servers.length).toBeGreaterThan(0);
  });
});

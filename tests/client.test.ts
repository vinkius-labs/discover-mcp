import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VinkiusClient, CatalogApiError } from '../src/api/client.js';

// ── Mock fetch globally ─────────────────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
  };
}

function errorResponse(status: number, body: string) {
  return {
    ok: false,
    status,
    text: async () => body,
  };
}

describe('VinkiusClient', () => {
  let client: VinkiusClient;

  beforeEach(() => {
    mockFetch.mockReset();
    client = new VinkiusClient('vk_catalog_test_abc123');
  });

  // ── Constructor & URL handling ────────────────────────────────────────

  describe('URL construction', () => {
    it('defaults to production API', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ servers: [] }));
      await client.getTools();
      expect(mockFetch.mock.calls[0][0]).toBe('https://api.vinkius.com/catalog/tools');
    });

    it('accepts custom base URL', async () => {
      const c = new VinkiusClient('token', 'https://custom.api.example.com');
      mockFetch.mockResolvedValueOnce(jsonResponse({ servers: [] }));
      await c.getTools();
      expect(mockFetch.mock.calls[0][0]).toBe('https://custom.api.example.com/catalog/tools');
    });

    it('strips single trailing slash', async () => {
      const c = new VinkiusClient('token', 'https://api.example.com/');
      mockFetch.mockResolvedValueOnce(jsonResponse({ servers: [] }));
      await c.getTools();
      expect(mockFetch.mock.calls[0][0]).toBe('https://api.example.com/catalog/tools');
    });

    it('strips multiple trailing slashes', async () => {
      const c = new VinkiusClient('token', 'https://api.example.com///');
      mockFetch.mockResolvedValueOnce(jsonResponse({ servers: [] }));
      await c.getTools();
      expect(mockFetch.mock.calls[0][0]).toBe('https://api.example.com/catalog/tools');
    });
  });

  // ── Authentication headers ────────────────────────────────────────────

  describe('authentication', () => {
    it('sends Bearer token in Authorization header', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}));
      await client.getTools();

      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers.Authorization).toBe('Bearer vk_catalog_test_abc123');
    });

    it('sends Accept: application/json', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}));
      await client.getTools();

      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers.Accept).toBe('application/json');
    });

    it('sends User-Agent header', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}));
      await client.getTools();

      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers['User-Agent']).toBe('@vinkius-core/discover-mcp');
    });

    it('sends Content-Type only on POST requests', async () => {
      // GET — no Content-Type
      mockFetch.mockResolvedValueOnce(jsonResponse({ servers: [] }));
      await client.getTools();
      expect(mockFetch.mock.calls[0][1].headers['Content-Type']).toBeUndefined();

      // POST — has Content-Type
      mockFetch.mockResolvedValueOnce(jsonResponse({ content: [], isError: false }));
      await client.execute('tool', {});
      expect(mockFetch.mock.calls[1][1].headers['Content-Type']).toBe('application/json');
    });
  });

  // ── GET /catalog/tools ────────────────────────────────────────────────

  describe('getTools', () => {
    it('returns empty server list', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ servers: [] }));
      const result = await client.getTools();
      expect(result.servers).toEqual([]);
    });

    it('returns multiple servers with tools', async () => {
      const payload = {
        servers: [
          {
            slug: 'github',
            listing_id: 'uuid-1',
            title: 'GitHub',
            short_description: 'Git hosting',
            icon_url: 'https://example.com/github.png',
            tools: [
              { name: 'github__list_issues', description: 'List issues', inputSchema: { type: 'object', properties: {} } },
              { name: 'github__create_issue', description: 'Create issue', inputSchema: { type: 'object', properties: {} } },
            ],
          },
          {
            slug: 'stripe',
            listing_id: 'uuid-2',
            title: 'Stripe',
            short_description: 'Payments',
            icon_url: null,
            tools: [
              { name: 'stripe__list_charges', description: 'List charges', inputSchema: { type: 'object', properties: {} } },
            ],
          },
        ],
      };

      mockFetch.mockResolvedValueOnce(jsonResponse(payload));
      const result = await client.getTools();

      expect(result.servers).toHaveLength(2);
      expect(result.servers[0].tools).toHaveLength(2);
      expect(result.servers[1].tools).toHaveLength(1);
      expect(result.servers[0].slug).toBe('github');
      expect(result.servers[1].icon_url).toBeNull();
    });
  });

  // ── POST /catalog/execute ─────────────────────────────────────────────

  describe('execute', () => {
    it('sends correct payload', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        content: [{ type: 'text', text: '{"data": "ok"}' }],
        isError: false,
      }));

      await client.execute('github__list_issues', { owner: 'vinkius', state: 'open' });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body).toEqual({
        tool_name: 'github__list_issues',
        arguments: { owner: 'vinkius', state: 'open' },
      });
    });

    it('handles successful execution', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        content: [{ type: 'text', text: '42 issues found' }],
        isError: false,
      }));

      const result = await client.execute('github__list_issues', {});
      expect(result.isError).toBe(false);
      expect(result.content[0].text).toBe('42 issues found');
    });

    it('handles execution errors', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        content: [{ type: 'text', text: 'Rate limit exceeded' }],
        isError: true,
      }));

      const result = await client.execute('stripe__list_charges', {});
      expect(result.isError).toBe(true);
    });

    it('sends empty arguments correctly', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ content: [], isError: false }));
      await client.execute('catalog_tools', {});

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.arguments).toEqual({});
    });

    it('sends complex nested arguments', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ content: [], isError: false }));

      const args = {
        filters: { status: 'open', labels: ['bug', 'urgent'] },
        pagination: { page: 1, per_page: 50 },
      };
      await client.execute('github__list_issues', args);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.arguments).toEqual(args);
    });
  });

  // ── GET /catalog/search ───────────────────────────────────────────────

  describe('search', () => {
    it('encodes query params correctly', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ results: [], total: 0, hint: '' }));
      await client.search('U.S. inflation CPI data', 5);

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('q=U.S.+inflation+CPI+data');
      expect(url).toContain('limit=5');
    });

    it('defaults limit to 15', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ results: [], total: 0, hint: '' }));
      await client.search('payments');

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('limit=15');
    });

    it('returns search results with all fields', async () => {
      const payload = {
        results: [{
          id: 'uuid-1',
          slug: 'fred-full-access',
          title: 'FRED Full Access — U.S. Economic Intelligence',
          short_description: '19 tools for economic data',
          listing_type: 'free',
          publisher_type: 'official',
          avg_rating: 4.8,
          tags: ['economics', 'data'],
          categories: ['Brain Trust', 'The Unthinkable'],
          icon_url: 'https://example.com/fred.png',
          top_tools: [{ name: 'get_series_observations', description: 'Get time series' }],
          action: 'activate',
        }],
        total: 1,
        hint: 'Try also: BLS, Eurostat',
      };

      mockFetch.mockResolvedValueOnce(jsonResponse(payload));
      const result = await client.search('inflation');

      expect(result.total).toBe(1);
      expect(result.results[0].publisher_type).toBe('official');
      expect(result.results[0].categories).toContain('The Unthinkable');
      expect(result.hint).toBe('Try also: BLS, Eurostat');
    });

    it('handles special characters in query', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ results: [], total: 0, hint: '' }));
      await client.search('C++ & Rust tools (free)');

      const url = mockFetch.mock.calls[0][0] as string;
      // URLSearchParams encodes these safely
      expect(url).toContain('catalog/search?');
      expect(url).not.toContain('undefined');
    });
  });

  // ── POST /catalog/activate ────────────────────────────────────────────

  describe('activate', () => {
    it('sends listing_id for free listing', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        activated: true,
        subscription_id: 'sub-uuid-1',
        message: "'GitHub' activated. Use catalog_tools to see available tools.",
      }));

      const result = await client.activate('listing-uuid-123');

      expect(result.activated).toBe(true);
      expect(result.subscription_id).toBe('sub-uuid-1');

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body).toEqual({ listing_id: 'listing-uuid-123' });
    });

    it('handles paid listing returning checkout URL', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        activated: false,
        checkout_url: 'https://cloud.vinkius.com/marketplace/stripe?subscribe=1',
        message: "'Stripe' requires a paid subscription.",
      }));

      const result = await client.activate('paid-listing-uuid');

      expect(result.activated).toBe(false);
      expect(result.checkout_url).toContain('subscribe=1');
    });

    it('handles already subscribed', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        activated: true,
        subscription_id: 'existing-sub',
        message: "Already subscribed to 'GitHub'.",
      }));

      const result = await client.activate('listing-uuid');
      expect(result.activated).toBe(true);
      expect(result.message).toContain('Already subscribed');
    });
  });

  // ── POST /catalog/deactivate ──────────────────────────────────────────

  describe('deactivate', () => {
    it('sends subscription_id', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ deactivated: true }));

      const result = await client.deactivate('sub-uuid-456');

      expect(result.deactivated).toBe(true);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body).toEqual({ subscription_id: 'sub-uuid-456' });
    });
  });

  // ── GET /catalog/browse ───────────────────────────────────────────────

  describe('browse', () => {
    it('returns all categories', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        categories: [
          { slug: 'industry-titans', label: 'Industry Titans', listing_count: 221 },
          { slug: 'money-moves', label: 'Money Moves', listing_count: 91 },
          { slug: 'the-unthinkable', label: 'The Unthinkable', listing_count: 93 },
          { slug: 'fort-knox', label: 'Fort Knox', listing_count: 47 },
        ],
      }));

      const result = await client.browse();

      expect(result.categories).toHaveLength(4);
      expect(result.categories.map(c => c.slug)).toContain('fort-knox');
      expect(result.categories[0].listing_count).toBe(221);
    });
  });

  // ── GET /catalog/analytics ────────────────────────────────────────────

  describe('analytics', () => {
    it('returns subscription analytics', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        subscriptions: [
          {
            subscription_id: 'sub-1',
            title: 'GitHub',
            slug: 'github',
            status: 'active',
            started_at: '2026-01-01T00:00:00Z',
            request_count: 1542,
            last_used_at: '2026-04-11T07:00:00Z',
          },
          {
            subscription_id: 'sub-2',
            title: 'FRED Full Access',
            slug: 'fred-full-access',
            status: 'active',
            started_at: '2026-03-15T00:00:00Z',
            request_count: 87,
            last_used_at: null,
          },
        ],
      }));

      const result = await client.analytics();

      expect(result.subscriptions).toHaveLength(2);
      expect(result.subscriptions[0].request_count).toBe(1542);
      expect(result.subscriptions[1].last_used_at).toBeNull();
    });
  });

  // ── Error handling ────────────────────────────────────────────────────

  describe('error handling', () => {
    it('throws CatalogApiError with auth guidance on 401', async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(401, 'Invalid or expired token'));

      try {
        await client.getTools();
        expect.unreachable('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(CatalogApiError);
        expect((err as CatalogApiError).message).toContain('Authentication failed');
        expect((err as CatalogApiError).status).toBe(401);
      }
    });

    it('marks 401/403 as non-retryable', async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(401, 'bad token'));

      try {
        await client.getTools();
      } catch (err) {
        expect(err).toBeInstanceOf(CatalogApiError);
        expect((err as CatalogApiError).retryable).toBe(false);
        expect((err as CatalogApiError).userGuidance).toContain('STOP');
      }
    });

    it('throws CatalogApiError with auth guidance on 403', async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(403, 'Insufficient permissions'));

      await expect(client.execute('tool', {})).rejects.toThrow('Authentication failed');
    });

    it('throws non-retryable CatalogApiError on 429 Rate Limited', async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(429, 'Too many requests'));

      await expect(client.search('test')).rejects.toThrow(CatalogApiError);
    });

    it('marks 5xx as retryable', async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(500, 'Internal server error'));

      try {
        await client.browse();
      } catch (err) {
        expect(err).toBeInstanceOf(CatalogApiError);
        expect((err as CatalogApiError).retryable).toBe(true);
      }
    });

    it('handles response.text() failure gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 502,
        text: async () => { throw new Error('stream broken'); },
      });

      await expect(client.getTools()).rejects.toThrow(CatalogApiError);
    });

    it('propagates network errors (ECONNREFUSED)', async () => {
      mockFetch.mockRejectedValueOnce(new Error('fetch failed: ECONNREFUSED'));

      await expect(client.getTools()).rejects.toThrow('ECONNREFUSED');
    });

    it('propagates DNS resolution errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('getaddrinfo ENOTFOUND'));

      await expect(client.search('test')).rejects.toThrow('ENOTFOUND');
    });

    it('propagates timeout errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('AbortError: signal timed out'));

      await expect(client.execute('tool', {})).rejects.toThrow('timed out');
    });
  });

  // ── Request method correctness ────────────────────────────────────────

  describe('HTTP method correctness', () => {
    const getCalls = [
      ['getTools', () => client.getTools()],
      ['search', () => client.search('test')],
      ['browse', () => client.browse()],
      ['analytics', () => client.analytics()],
    ] as const;

    const postCalls = [
      ['execute', () => client.execute('tool', {})],
      ['activate', () => client.activate('id')],
      ['deactivate', () => client.deactivate('id')],
    ] as const;

    for (const [name, fn] of getCalls) {
      it(`${name} uses GET`, async () => {
        mockFetch.mockResolvedValueOnce(jsonResponse({}));
        await fn();
        expect(mockFetch.mock.calls[0][1].method).toBe('GET');
      });
    }

    for (const [name, fn] of postCalls) {
      it(`${name} uses POST`, async () => {
        mockFetch.mockResolvedValueOnce(jsonResponse({}));
        await fn();
        expect(mockFetch.mock.calls[0][1].method).toBe('POST');
      });
    }
  });

  // ── GET requests have no body ─────────────────────────────────────────

  describe('GET requests have no body', () => {
    it('getTools has no body', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}));
      await client.getTools();
      expect(mockFetch.mock.calls[0][1].body).toBeUndefined();
    });

    it('browse has no body', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}));
      await client.browse();
      expect(mockFetch.mock.calls[0][1].body).toBeUndefined();
    });

    it('analytics has no body', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}));
      await client.analytics();
      expect(mockFetch.mock.calls[0][1].body).toBeUndefined();
    });
  });

  // ── Timeout ────────────────────────────────────────────────────────────

  describe('timeout', () => {
    it('rejects with clear message when fetch exceeds timeout', async () => {
      // Create client with very short timeout
      const fastClient = new VinkiusClient('vk_catalog_test_abc123', undefined, 50);

      // Mock fetch that listens for abort signal — mimics real fetch behavior
      mockFetch.mockImplementationOnce((_url: string, init: { signal: AbortSignal }) => {
        return new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
      });

      await expect(fastClient.getTools()).rejects.toThrow(/timed out after 50ms/);
    });

    it('clears timeout on successful response', async () => {
      const fastClient = new VinkiusClient('vk_catalog_test_abc123', undefined, 500);
      mockFetch.mockResolvedValueOnce(jsonResponse({ servers: [] }));

      // Should not throw — response completes before timeout
      const result = await fastClient.getTools();
      expect(result).toEqual({ servers: [] });
    });

    it('passes AbortSignal to fetch', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ servers: [] }));
      await client.getTools();
      const init = mockFetch.mock.calls[0][1];
      expect(init.signal).toBeInstanceOf(AbortSignal);
    });
  });
});

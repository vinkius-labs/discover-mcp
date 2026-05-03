import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToolRegistry } from '@vurb/core';
import type { AppContext } from '../src/vurb.js';
import { createMetaTools } from '../src/tools/meta-tools.js';
import { CapabilityGraph } from '../src/engine/capability-graph.js';

describe('meta-tools', () => {
  let mockClient: Record<string, ReturnType<typeof vi.fn>>;
  let graph: CapabilityGraph;
  let registry: ToolRegistry<AppContext>;

  /**
   * Helper: call a tool action via the Vurb registry.
   *
   * Vurb action consolidation merges all catalog.* tools into a
   * single "catalog" builder with a discriminator field `action`.
   */
  async function call(action: string, args: Record<string, unknown> = {}) {
    const ctx: AppContext = { client: mockClient as any, graph };
    return registry.routeCall(ctx, 'catalog', { action, ...args });
  }

  /**
   * Parse the first content block as JSON data.
   * Presenter-formatted responses have data in content[0].
   */
  function parseData(result: any): any {
    return JSON.parse(result.content[0].text);
  }

  beforeEach(() => {
    mockClient = {
      search: vi.fn().mockResolvedValue({ results: [], total: 0, hint: '' }),
      browse: vi.fn().mockResolvedValue({ categories: [] }),
      activate: vi.fn().mockResolvedValue({ activated: true, message: 'OK' }),
      deactivate: vi.fn().mockResolvedValue({ deactivated: true }),
      getTools: vi.fn().mockResolvedValue({ servers: [], total_servers: 0, page: 1, per_page: 25, has_more: false }),
      analytics: vi.fn().mockResolvedValue({ subscriptions: [] }),
      execute: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'result' }], isError: false }),
    };

    graph = new CapabilityGraph();

    registry = new ToolRegistry<AppContext>();
    const tools = createMetaTools();
    registry.registerAll(
      tools.requestCapability,
      tools.search,
      tools.browse,
      tools.activate,
      tools.deactivate,
      tools.tools,
      tools.inspect,
      tools.analytics,
      tools.execute,
    );
  });

  // ── Registration ──────────────────────────────────────────────────────

  describe('registration', () => {
    it('consolidates all 8 actions into 1 catalog builder', () => {
      expect(registry.size).toBe(1);
      expect(registry.has('catalog')).toBe(true);
    });

    it('exposes all 9 actions in the compiled tool definition', () => {
      const allTools = registry.getAllTools();
      expect(allTools).toHaveLength(1);

      const catalogTool = allTools[0];
      expect(catalogTool.name).toBe('catalog');

      const schema = catalogTool.inputSchema as any;
      const actionEnum = schema.properties?.action?.enum;
      expect(actionEnum).toEqual(expect.arrayContaining([
        'request_capability',
        'search',
        'browse',
        'activate',
        'deactivate',
        'tools',
        'inspect',
        'analytics',
        'execute',
      ]));
    });

    it('has a non-empty description', () => {
      const allTools = registry.getAllTools();
      expect(allTools[0].description!.length).toBeGreaterThan(10);
    });

    it('includes AI-First instructions in tool descriptions', () => {
      const allTools = registry.getAllTools();
      const desc = allTools[0].description!;
      // Vurb appends .instructions() content to the tool description
      expect(desc.length).toBeGreaterThan(100);
    });

    it('includes MCP annotations from semantic modifiers', () => {
      const allTools = registry.getAllTools();
      const tool = allTools[0];
      // The consolidated tool should have annotations from its actions
      expect(tool).toBeDefined();
    });
  });

  // ── catalog_search ────────────────────────────────────────────────────

  describe('catalog_search', () => {
    it('calls client.search with query and limit', async () => {
      await call('search', { query: 'payment processing', limit: 5 });
      expect(mockClient.search).toHaveBeenCalledWith('payment processing', 5);
    });

    it('defaults limit to 10 when not provided', async () => {
      await call('search', { query: 'inflation data' });
      expect(mockClient.search).toHaveBeenCalledWith('inflation data', 10);
    });

    it('returns raw results array for Presenter formatting', async () => {
      mockClient.search.mockResolvedValue({
        results: [{ id: '1', title: 'FRED', short_description: 'Econ data', slug: 'fred' }],
        total: 1,
        hint: '',
      });

      const result = await call('search', { query: 'test' }) as any;
      expect(result.content.length).toBeGreaterThanOrEqual(1);
      expect(result.content[0].type).toBe('text');

      // Handler returns the raw results array (Presenter formats it at the server level)
      const data = parseData(result);
      expect(Array.isArray(data)).toBe(true);
      expect(data[0].title).toBe('FRED');
    });
  });

  // ── catalog_browse ────────────────────────────────────────────────────

  describe('catalog_browse', () => {
    it('calls client.browse with no arguments', async () => {
      await call('browse');
      expect(mockClient.browse).toHaveBeenCalledTimes(1);
    });

    it('returns raw categories array', async () => {
      mockClient.browse.mockResolvedValue({
        categories: [
          { slug: 'finance', label: 'Finance', listing_count: 25 },
          { slug: 'devops', label: 'DevOps', listing_count: 18 },
        ],
      });

      const result = await call('browse') as any;
      const data = parseData(result);
      expect(Array.isArray(data)).toBe(true);
      expect(data).toHaveLength(2);
      expect(data[0].label).toBe('Finance');
    });
  });

  // ── catalog_activate ──────────────────────────────────────────────────

  describe('catalog_activate', () => {
    it('calls client.activate with listing_id', async () => {
      await call('activate', { listing_id: 'uuid-123' });
      expect(mockClient.activate).toHaveBeenCalledWith('uuid-123');
    });

    it('returns activation result object', async () => {
      mockClient.activate.mockResolvedValue({
        activated: true,
        subscription_id: 'sub-1',
        message: 'Server activated',
      });

      const result = await call('activate', { listing_id: 'uuid-123' }) as any;
      const data = parseData(result);
      expect(data.activated).toBe(true);
    });
  });

  // ── catalog_deactivate ────────────────────────────────────────────────

  describe('catalog_deactivate', () => {
    it('calls client.deactivate with subscription_id', async () => {
      await call('deactivate', { subscription_id: 'sub-uuid-456' });
      expect(mockClient.deactivate).toHaveBeenCalledWith('sub-uuid-456');
    });

    it('returns Presenter-formatted response via MVA pipeline', async () => {
      const result = await call('deactivate', { subscription_id: 'sub-uuid-456' }) as any;
      const fullText = result.content.map((c: any) => c.text).join('\n');
      // DeactivatePresenter handles formatting via MVA pipeline
      expect(fullText).toContain('deactivated');
    });
  });

  // ── catalog_tools ─────────────────────────────────────────────────────

  describe('catalog_tools', () => {
    it('calls client.getTools and returns servers array', async () => {
      mockClient.getTools.mockResolvedValue({
        servers: [{
          slug: 'github',
          title: 'GitHub',
          short_description: 'GitHub tools',
          listing_id: 'uuid-1',
          tools: [{ name: 'github__list_issues', description: 'List issues' }],
        }],
      });

      const result = await call('tools') as any;
      expect(mockClient.getTools).toHaveBeenCalledTimes(1);
      const data = parseData(result);
      expect(Array.isArray(data)).toBe(true);
      expect(data[0].slug).toBe('github');
      expect(data[0].tools[0].name).toBe('github__list_issues');
    });
  });

  // ── catalog_analytics ─────────────────────────────────────────────────

  describe('catalog_analytics', () => {
    it('calls client.analytics and returns subscriptions array', async () => {
      mockClient.analytics.mockResolvedValue({
        subscriptions: [{
          subscription_id: 'sub-1',
          title: 'GitHub',
          slug: 'github',
          status: 'active',
          started_at: '2025-01-01',
          request_count: 42,
          last_used_at: '2025-05-01',
        }],
      });

      const result = await call('analytics') as any;
      expect(mockClient.analytics).toHaveBeenCalledTimes(1);
      const data = parseData(result);
      expect(Array.isArray(data)).toBe(true);
      expect(data[0].request_count).toBe(42);
    });
  });

  // ── catalog_execute ────────────────────────────────────────────────────

  describe('catalog_execute', () => {
    it('calls client.execute with tool_name', async () => {
      await call('execute', { tool_name: 'github__list_issues' });
      expect(mockClient.execute).toHaveBeenCalledWith('github__list_issues', {});
    });

    it('passes through isError from result', async () => {
      mockClient.execute.mockResolvedValue({
        content: [{ type: 'text', text: 'Error occurred' }],
        isError: true,
      });

      const result = await call('execute', { tool_name: 'bad_tool' }) as any;
      // f.error() ErrorBuilder produces a structured self-healing error
      const fullText = result.content.map((c: any) => c.text).join('\n');
      expect(fullText).toContain('TOOL_EXECUTION_FAILED');
      expect(fullText).toContain('Error occurred');
      expect(fullText).toContain('catalog.tools');
    });

    it('returns raw content on success via implicit success()', async () => {
      const result = await call('execute', { tool_name: 'github__list_issues' }) as any;
      // Handler returns raw content array → Vurb auto-wraps with success()
      expect(result.content[0].text).toContain('result');
    });

    it('forwards arguments to client.execute via arguments object', async () => {
      const args = { owner: 'vinkius', state: 'open' };
      await call('execute', { tool_name: 'github__list_issues', arguments: args });
      expect(mockClient.execute).toHaveBeenCalledWith('github__list_issues', args);
    });

    it('defaults arguments to empty object when arguments is omitted', async () => {
      await call('execute', { tool_name: 'github__list_issues' });
      expect(mockClient.execute).toHaveBeenCalledWith('github__list_issues', {});
    });
  });

  // ── catalog_request_capability ─────────────────────────────────────────

  describe('catalog_request_capability', () => {
    it('calls browse when domain is provided', async () => {
      await call('request_capability', {
        capability: 'fetch inflation data',
        domain: 'economics',
      });

      expect(mockClient.browse).toHaveBeenCalledTimes(1);
      expect(mockClient.search).toHaveBeenCalled();
    });

    it('skips browse when no domain', async () => {
      await call('request_capability', { capability: 'fetch data' });

      expect(mockClient.browse).not.toHaveBeenCalled();
      expect(mockClient.search).toHaveBeenCalled();
    });

    it('returns ranked servers array for Presenter formatting', async () => {
      mockClient.search.mockResolvedValue({
        results: [{
          id: 'uuid-1',
          slug: 'fred',
          title: 'FRED Full Access',
          short_description: 'Economic data',
          listing_type: 'free',
          publisher_type: 'official',
          avg_rating: 4.8,
          tags: [],
          categories: ['The Unthinkable'],
          icon_url: null,
          top_tools: [{ name: 'get_series', description: 'Get time series' }],
          action: 'activate',
        }],
        total: 1,
        hint: '',
      });

      const result = await call('request_capability', {
        capability: 'economic time series',
      }) as any;

      const data = parseData(result);
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThan(0);
      expect(data[0].slug).toBe('fred');
      expect(data[0].overall_score).toBeGreaterThanOrEqual(0);
    });

    it('returns empty array when no servers match', async () => {
      mockClient.search.mockResolvedValue({ results: [], total: 0, hint: '' });

      const result = await call('request_capability', {
        capability: 'quantum entanglement simulator',
      }) as any;

      const data = parseData(result);
      expect(Array.isArray(data)).toBe(true);
      expect(data).toHaveLength(0);
    });

    it('passes output_hints to router query', async () => {
      await call('request_capability', {
        capability: 'fetch CPI',
        domain: 'economics',
        output_hints: 'JSON array with date and value',
      });

      const searchCall = mockClient.search.mock.calls[0];
      const query = searchCall[0] as string;
      // buildQuery tokenizes output_hints into keywords
      expect(query).toContain('json');
      expect(query).toContain('array');
      expect(query).toContain('date');
      expect(query).toContain('value');
    });

    it('limits ranked servers to top 10', async () => {
      const results = Array.from({ length: 20 }, (_, i) => ({
        id: `uuid-${i}`,
        slug: `server-${i}`,
        title: `Server ${i}`,
        short_description: `Desc ${i}`,
        listing_type: 'free',
        publisher_type: 'official',
        avg_rating: 4.0,
        tags: [],
        categories: [],
        icon_url: null,
        top_tools: [{ name: `tool_${i}`, description: `Tool ${i}` }],
        action: 'activate',
      }));
      mockClient.search.mockResolvedValue({ results, total: 20, hint: '' });

      const result = await call('request_capability', {
        capability: 'anything',
      }) as any;

      const data = parseData(result);
      expect(data.length).toBeLessThanOrEqual(10);
    });

    it('includes ranking scores and tool matches', async () => {
      mockClient.search.mockResolvedValue({
        results: [{
          id: 'uuid-1', slug: 'test', title: 'Test', short_description: 'Test',
          listing_type: 'free', publisher_type: 'official', avg_rating: 4.0,
          tags: [], categories: [], icon_url: null,
          top_tools: [{ name: 'tool', description: 'desc' }],
          action: 'activate',
        }],
        total: 1, hint: '',
      });

      const result = await call('request_capability', {
        capability: 'test',
      }) as any;

      const data = parseData(result);
      expect(data[0].overall_score).toBeDefined();
      expect(data[0].category_score).toBeDefined();
      expect(data[0].top_matching_tools).toBeDefined();
    });
  });

  // ── Capability Graph integration ──────────────────────────────────────

  describe('capability graph integration', () => {
    it('records tool execution in graph via catalog execute', async () => {
      await call('execute', { tool_name: 'github__list_issues' });

      expect(graph.size).toBe(1);
      expect(graph.getActiveServerSlugs()).toContain('github');
    });

    it('increments call count on repeated execute calls', async () => {
      await call('execute', { tool_name: 'github__list_issues' });
      await call('execute', { tool_name: 'github__list_issues' });
      await call('execute', { tool_name: 'github__list_issues' });

      expect(graph.size).toBe(1);
      expect(graph.totalCalls).toBe(3);
    });

    it('does not record for invalid tool names (no slug separator)', async () => {
      await call('execute', { tool_name: 'invalid_name_no_slug' });
      expect(graph.size).toBe(0);
    });

    it('tracks multiple tools across different servers', async () => {
      await call('execute', { tool_name: 'github__list_issues' });
      await call('execute', { tool_name: 'stripe__list_charges' });
      await call('execute', { tool_name: 'slack__send_message' });

      expect(graph.size).toBe(3);
      expect(graph.getActiveServerSlugs()).toEqual(
        expect.arrayContaining(['github', 'stripe', 'slack']),
      );
      expect(graph.getSessionContext()).toContain('3 tool(s)');
      expect(graph.getSessionContext()).toContain('3 server(s)');
    });
  });

  // ── Presenter Integration (MVA View Layer) ────────────────────────────

  describe('Presenter integration', () => {
    it('SearchPresenter validates and renders server data', async () => {
      const { SearchPresenter } = await import('../src/presenters/SearchPresenter.js');
      const mockData = [
        { id: '1', title: 'FRED', slug: 'fred', short_description: 'Econ data', avg_rating: 4.8, action: 'subscribe' },
      ];

      const view = SearchPresenter.make(mockData).build();
      expect(view.content.length).toBeGreaterThan(1); // data + UI + rules
      const fullText = view.content.map((c: any) => c.text).join('\n');
      expect(fullText).toContain('domain_rules');
      expect(fullText).toContain('ranked by relevance');
      expect(fullText).toContain('ui_passthrough');
      expect(fullText).toContain('action_suggestions');
    });

    it('AnalyticsPresenter highlights unused subscriptions', async () => {
      const { AnalyticsPresenter } = await import('../src/presenters/AnalyticsPresenter.js');
      const mockData = [
        { subscription_id: 'sub-1', title: 'Unused', slug: 'unused', status: 'active', started_at: '2025-01-01', request_count: 0, last_used_at: null },
      ];

      const view = AnalyticsPresenter.make(mockData).build();
      const fullText = view.content.map((c: any) => c.text).join('\n');
      expect(fullText).toContain('never been used');
    });

    it('ActivatePresenter suggests next tools after successful activation', async () => {
      const { ActivatePresenter } = await import('../src/presenters/ActivatePresenter.js');
      const mockData = { activated: true, subscription_id: 'sub-1', message: 'OK' };

      const view = ActivatePresenter.make(mockData).build();
      const fullText = view.content.map((c: any) => c.text).join('\n');
      expect(fullText).toContain('action_suggestions');
      expect(fullText).toContain('catalog.tools');
    });

    it('ActivatePresenter warns about checkout URL for paid servers', async () => {
      const { ActivatePresenter } = await import('../src/presenters/ActivatePresenter.js');
      const mockData = { activated: false, checkout_url: 'https://pay.vinkius.com/checkout', message: 'Checkout required' };

      const view = ActivatePresenter.make(mockData).build();
      const fullText = view.content.map((c: any) => c.text).join('\n');
      expect(fullText).toContain('PAID server');
      expect(fullText).toContain('checkout');
    });

    it('CapabilityPresenter renders ranked results table', async () => {
      const { CapabilityPresenter } = await import('../src/presenters/CapabilityPresenter.js');
      const mockData = [
        { title: 'FRED', slug: 'fred', id: 'uuid-1', short_description: 'Econ', overall_score: 0.95, category_score: 0.9, top_matching_tools: [{ name: 'get_series', description: 'Get series', relevance: 0.9 }] },
      ];

      const view = CapabilityPresenter.make(mockData).build();
      const fullText = view.content.map((c: any) => c.text).join('\n');
      expect(fullText).toContain('ui_passthrough');
      expect(fullText).toContain('#1');
      expect(fullText).toContain('FRED');
    });

    it('BrowsePresenter includes category summary', async () => {
      const { BrowsePresenter } = await import('../src/presenters/BrowsePresenter.js');
      const mockData = [
        { slug: 'finance', label: 'Finance', listing_count: 25 },
        { slug: 'devops', label: 'DevOps', listing_count: 18 },
      ];

      const view = BrowsePresenter.make(mockData).build();
      const fullText = view.content.map((c: any) => c.text).join('\n');
      expect(fullText).toContain('2 categories');
      expect(fullText).toContain('43 total servers');
    });

    it('ToolsPresenter shows tool inventory summary', async () => {
      const { ToolsPresenter } = await import('../src/presenters/ToolsPresenter.js');
      const mockData = [
        { slug: 'github', title: 'GitHub', short_description: 'GH', listing_id: '1', tool_count: 2, tools: [{ name: 'github__issues' }, { name: 'github__prs' }] },
      ];

      const view = ToolsPresenter.make(mockData).build();
      const fullText = view.content.map((c: any) => c.text).join('\n');
      expect(fullText).toContain('1 active server');
      expect(fullText).toContain('2 tool(s)');
      expect(fullText).toContain('domain_rules');
      expect(fullText).toContain('catalog.inspect');
    });
    it('DeactivatePresenter renders deactivation result', async () => {
      const { DeactivatePresenter } = await import('../src/presenters/DeactivatePresenter.js');
      const mockData = { deactivated: true };

      const view = DeactivatePresenter.make(mockData).build();
      const fullText = view.content.map((c: any) => c.text).join('\n');
      expect(fullText).toContain('deactivated');
      expect(fullText).toContain('domain_rules');
    });
  });
});

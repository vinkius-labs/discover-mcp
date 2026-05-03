import { describe, it, expect, vi, beforeEach } from 'vitest';
import { refreshProxyTools, type ProxyToolEntry } from '../src/tools/proxy-tools.js';
import type { VinkiusClient } from '../src/api/client.js';
import type { SlimCatalogServer, CatalogToolSchemaResponse } from '../src/types.js';

function makeServer(slug: string, toolNames: string[]): SlimCatalogServer {
  return {
    slug,
    listing_id: `uuid-${slug}`,
    title: slug.charAt(0).toUpperCase() + slug.slice(1),
    short_description: `${slug} server`,
    icon_url: null,
    tool_count: toolNames.length,
    tools: toolNames.map(name => ({ name })),
  };
}

function makeSchemaResponse(name: string, description: string, inputSchema?: Record<string, unknown>): CatalogToolSchemaResponse {
  const slug = name.split('__')[0];
  return {
    name,
    description,
    inputSchema: inputSchema ?? { type: 'object', properties: {} },
    server_slug: slug,
    server_title: slug.charAt(0).toUpperCase() + slug.slice(1),
  };
}

/** Wrap servers in paginated response format (single page, no more). */
function makeToolsResponse(servers: SlimCatalogServer[]) {
  return {
    servers,
    total_servers: servers.length,
    page: 1,
    per_page: 25,
    has_more: false,
  };
}

function makeClient(servers: SlimCatalogServer[], schemaMap?: Record<string, CatalogToolSchemaResponse>): Partial<VinkiusClient> {
  return {
    getTools: vi.fn().mockResolvedValue({
      servers,
      total_servers: servers.length,
      page: 1,
      per_page: 25,
      has_more: false,
    }),
    getToolSchema: vi.fn().mockImplementation(async (toolName: string) => {
      if (schemaMap?.[toolName]) return schemaMap[toolName];
      // Default: return minimal schema
      const slug = toolName.split('__')[0];
      return {
        name: toolName,
        description: `Description for ${toolName}`,
        inputSchema: { type: 'object', properties: {} },
        server_slug: slug,
        server_title: slug.charAt(0).toUpperCase() + slug.slice(1),
      };
    }),
  };
}

describe('proxy-tools', () => {
  let registeredTools: Map<string, ProxyToolEntry>;

  beforeEach(() => {
    registeredTools = new Map();
  });

  // ── Registration ──────────────────────────────────────────────────────

  describe('tool registration', () => {
    it('registers all tools from a single server', async () => {
      const client = makeClient([
        makeServer('github', ['github__list_issues', 'github__create_issue', 'github__list_repos']),
      ]);

      await refreshProxyTools(client as VinkiusClient, registeredTools);

      expect(registeredTools.size).toBe(3);
      expect(registeredTools.has('github__list_issues')).toBe(true);
      expect(registeredTools.has('github__create_issue')).toBe(true);
      expect(registeredTools.has('github__list_repos')).toBe(true);
    });

    it('registers tools from multiple servers', async () => {
      const client = makeClient([
        makeServer('github', ['github__list_issues']),
        makeServer('stripe', ['stripe__list_charges']),
        makeServer('slack', ['slack__send_message']),
      ]);

      await refreshProxyTools(client as VinkiusClient, registeredTools);

      expect(registeredTools.size).toBe(3);
      expect(registeredTools.has('github__list_issues')).toBe(true);
      expect(registeredTools.has('stripe__list_charges')).toBe(true);
      expect(registeredTools.has('slack__send_message')).toBe(true);
    });

    it('handles server with no tools', async () => {
      const client = makeClient([makeServer('empty', [])]);

      await refreshProxyTools(client as VinkiusClient, registeredTools);

      expect(registeredTools.size).toBe(0);
    });

    it('handles empty server list', async () => {
      const client = makeClient([]);

      await refreshProxyTools(client as VinkiusClient, registeredTools);

      expect(registeredTools.size).toBe(0);
    });
  });

  // ── Deduplication ─────────────────────────────────────────────────────

  describe('deduplication', () => {
    it('skips tools already in registeredTools map', async () => {
      // Pre-populate with existing entries
      const existingEntry: ProxyToolEntry = {
        name: 'github__list_issues',
        description: '[Github] List issues',
        inputSchema: {},
        serverSlug: 'github',
        handler: vi.fn(),
      };
      registeredTools.set('github__list_issues', existingEntry);

      const client = makeClient([
        makeServer('github', ['github__list_issues', 'github__list_repos']),
      ]);

      await refreshProxyTools(client as VinkiusClient, registeredTools);

      // Existing entry should be preserved (same object reference)
      expect(registeredTools.get('github__list_issues')).toBe(existingEntry);
      // New tool should be added
      expect(registeredTools.has('github__list_repos')).toBe(true);
      expect(registeredTools.size).toBe(2);
    });

    it('second refresh with same servers registers nothing new', async () => {
      const servers = [makeServer('github', ['github__list_issues'])];
      const client = makeClient(servers);

      await refreshProxyTools(client as VinkiusClient, registeredTools);
      const firstEntry = registeredTools.get('github__list_issues');
      expect(registeredTools.size).toBe(1);

      await refreshProxyTools(client as VinkiusClient, registeredTools);

      // Same object reference — entry was not replaced
      expect(registeredTools.get('github__list_issues')).toBe(firstEntry);
      expect(registeredTools.size).toBe(1);
    });
  });

  // ── Deactivation tracking ─────────────────────────────────────────────

  describe('deactivation tracking', () => {
    it('removes deactivated server tools from map', async () => {
      const makeEntry = (name: string): ProxyToolEntry => ({
        name,
        description: `[Test] ${name}`,
        inputSchema: {},
        serverSlug: name.split('__')[0],
        handler: vi.fn(),
      });

      registeredTools.set('github__list_issues', makeEntry('github__list_issues'));
      registeredTools.set('stripe__list_charges', makeEntry('stripe__list_charges'));
      registeredTools.set('slack__send_message', makeEntry('slack__send_message'));

      // Only github comes back — stripe and slack were deactivated
      const client = makeClient([
        makeServer('github', ['github__list_issues']),
      ]);

      await refreshProxyTools(client as VinkiusClient, registeredTools);

      expect(registeredTools.has('github__list_issues')).toBe(true);
      expect(registeredTools.has('stripe__list_charges')).toBe(false);
      expect(registeredTools.has('slack__send_message')).toBe(false);
      expect(registeredTools.size).toBe(1);
    });

    it('clears all tools when all servers are deactivated', async () => {
      const makeEntry = (name: string): ProxyToolEntry => ({
        name,
        description: `[Test] ${name}`,
        inputSchema: {},
        serverSlug: name.split('__')[0],
        handler: vi.fn(),
      });

      registeredTools.set('github__list_issues', makeEntry('github__list_issues'));
      registeredTools.set('stripe__list_charges', makeEntry('stripe__list_charges'));

      const client = makeClient([]); // Empty — everything deactivated

      await refreshProxyTools(client as VinkiusClient, registeredTools);

      expect(registeredTools.size).toBe(0);
    });

    it('handles partial deactivation correctly', async () => {
      const makeEntry = (name: string): ProxyToolEntry => ({
        name,
        description: `[Test] ${name}`,
        inputSchema: {},
        serverSlug: name.split('__')[0],
        handler: vi.fn(),
      });

      registeredTools.set('github__list_issues', makeEntry('github__list_issues'));
      registeredTools.set('github__create_issue', makeEntry('github__create_issue'));
      registeredTools.set('stripe__list_charges', makeEntry('stripe__list_charges'));

      // GitHub loses create_issue tool, stripe stays
      const client = makeClient([
        makeServer('github', ['github__list_issues']),
        makeServer('stripe', ['stripe__list_charges']),
      ]);

      await refreshProxyTools(client as VinkiusClient, registeredTools);

      expect(registeredTools.has('github__list_issues')).toBe(true);
      expect(registeredTools.has('github__create_issue')).toBe(false); // Removed
      expect(registeredTools.has('stripe__list_charges')).toBe(true);
    });
  });

  // ── Tool entry metadata ───────────────────────────────────────────────

  describe('tool metadata', () => {
    it('prefixes description with server title from schema response', async () => {
      const schemaMap: Record<string, CatalogToolSchemaResponse> = {
        'fred__get_series': {
          name: 'fred__get_series',
          description: 'Get time series data',
          inputSchema: { type: 'object', properties: {} },
          server_slug: 'fred',
          server_title: 'FRED Full Access — U.S. Economic Intelligence',
        },
      };

      const client = makeClient(
        [{
          slug: 'fred',
          listing_id: 'uuid-fred',
          title: 'FRED Full Access — U.S. Economic Intelligence',
          short_description: '19 tools',
          icon_url: null,
          tool_count: 1,
          tools: [{ name: 'fred__get_series' }],
        }],
        schemaMap,
      );

      await refreshProxyTools(client as VinkiusClient, registeredTools);

      const entry = registeredTools.get('fred__get_series')!;
      expect(entry.description).toBe(
        '[FRED Full Access — U.S. Economic Intelligence] Get time series data',
      );
    });

    it('stores inputSchema from granular schema fetch', async () => {
      const inputSchema = {
        type: 'object',
        properties: {
          owner: { type: 'string', description: 'Repository owner' },
          repo: { type: 'string', description: 'Repository name' },
        },
      };

      const schemaMap: Record<string, CatalogToolSchemaResponse> = {
        'github__list_issues': makeSchemaResponse('github__list_issues', 'List issues', inputSchema),
      };

      const client = makeClient(
        [makeServer('github', ['github__list_issues'])],
        schemaMap,
      );

      await refreshProxyTools(client as VinkiusClient, registeredTools);

      const entry = registeredTools.get('github__list_issues')!;
      expect(entry.inputSchema).toEqual(inputSchema);
    });

    it('stores serverSlug on each entry', async () => {
      const client = makeClient([
        makeServer('github', ['github__list_issues']),
        makeServer('stripe', ['stripe__list_charges']),
      ]);

      await refreshProxyTools(client as VinkiusClient, registeredTools);

      expect(registeredTools.get('github__list_issues')!.serverSlug).toBe('github');
      expect(registeredTools.get('stripe__list_charges')!.serverSlug).toBe('stripe');
    });

    it('falls back to minimal description when schema fetch fails', async () => {
      const client: Partial<VinkiusClient> = {
        getTools: vi.fn().mockResolvedValue(makeToolsResponse([makeServer('broken', ['broken__tool'])])),
        getToolSchema: vi.fn().mockRejectedValue(new Error('404')),
      };

      await refreshProxyTools(client as VinkiusClient, registeredTools);

      const entry = registeredTools.get('broken__tool')!;
      expect(entry.description).toBe('[Broken]');
      expect(entry.inputSchema).toEqual({ type: 'object', properties: {} });
    });
  });

  // ── Tool execution delegation ─────────────────────────────────────────

  describe('tool execution delegation', () => {
    it('tool handler calls client.execute with correct args', async () => {
      const mockExecute = vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'result data' }],
        isError: false,
      });

      const client: Partial<VinkiusClient> = {
        getTools: vi.fn().mockResolvedValue(makeToolsResponse([makeServer('github', ['github__list_issues'])])),
        getToolSchema: vi.fn().mockResolvedValue(makeSchemaResponse('github__list_issues', 'List')),
        execute: mockExecute,
      };

      await refreshProxyTools(client as VinkiusClient, registeredTools);

      const entry = registeredTools.get('github__list_issues')!;
      const result = await entry.handler({ owner: 'vinkius', state: 'open' });

      expect(mockExecute).toHaveBeenCalledWith('github__list_issues', { owner: 'vinkius', state: 'open' });
      expect(result.content[0].text).toBe('result data');
      expect(result.isError).toBe(false);
    });
  });

  // ── Scale test ────────────────────────────────────────────────────────

  describe('scale', () => {
    it('handles 50 servers with 10 tools each (500 tools)', async () => {
      const servers: SlimCatalogServer[] = [];
      for (let i = 0; i < 50; i++) {
        const toolNames = [];
        for (let j = 0; j < 10; j++) {
          toolNames.push(`server-${i}__tool_${j}`);
        }
        servers.push(makeServer(`server-${i}`, toolNames));
      }

      const client = makeClient(servers);
      await refreshProxyTools(client as VinkiusClient, registeredTools);

      expect(registeredTools.size).toBe(500);
    });

    it('removes 250 tools when half the servers are deactivated', async () => {
      // First: register 500 tools across 50 servers
      const allServers: SlimCatalogServer[] = [];
      for (let i = 0; i < 50; i++) {
        const toolNames = [];
        for (let j = 0; j < 10; j++) {
          toolNames.push(`server-${i}__tool_${j}`);
        }
        allServers.push(makeServer(`server-${i}`, toolNames));
      }

      const client1 = makeClient(allServers);
      await refreshProxyTools(client1 as VinkiusClient, registeredTools);
      expect(registeredTools.size).toBe(500);

      // Second: only first 25 servers remain
      const halfServers = allServers.slice(0, 25);
      const client2 = makeClient(halfServers);
      await refreshProxyTools(client2 as VinkiusClient, registeredTools);

      expect(registeredTools.size).toBe(250);
    });
  });

  // ── Tool reactivation lifecycle ───────────────────────────────────────

  describe('tool removal lifecycle', () => {
    it('tools reappear after deactivation and reactivation', async () => {
      // Step 1: Register github
      const client1 = makeClient([makeServer('github', ['github__list_issues'])]);
      await refreshProxyTools(client1 as VinkiusClient, registeredTools);
      expect(registeredTools.size).toBe(1);

      // Step 2: Deactivate github
      const client2 = makeClient([]);
      await refreshProxyTools(client2 as VinkiusClient, registeredTools);
      expect(registeredTools.size).toBe(0);

      // Step 3: Reactivate github — should register again
      const client3 = makeClient([makeServer('github', ['github__list_issues'])]);
      await refreshProxyTools(client3 as VinkiusClient, registeredTools);
      expect(registeredTools.size).toBe(1);
      expect(registeredTools.has('github__list_issues')).toBe(true);
    });

    it('handles server gaining new tools between refreshes', async () => {
      // Step 1: GitHub with 1 tool
      const client1 = makeClient([makeServer('github', ['github__list_issues'])]);
      await refreshProxyTools(client1 as VinkiusClient, registeredTools);
      expect(registeredTools.size).toBe(1);

      // Step 2: GitHub now has 3 tools
      const client2 = makeClient([
        makeServer('github', ['github__list_issues', 'github__create_issue', 'github__close_issue']),
      ]);
      await refreshProxyTools(client2 as VinkiusClient, registeredTools);

      expect(registeredTools.size).toBe(3);
    });
  });

  // ── Capability graph in proxy tools ───────────────────────────────────

  describe('capability graph integration', () => {
    it('records proxy tool execution in capability graph', async () => {
      const { CapabilityGraph } = await import('../src/engine/capability-graph.js');
      const graph = new CapabilityGraph();

      const mockExecute = vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'ok' }],
        isError: false,
      });

      const client: Partial<VinkiusClient> = {
        getTools: vi.fn().mockResolvedValue(makeToolsResponse([makeServer('github', ['github__list_issues'])])),
        getToolSchema: vi.fn().mockResolvedValue(makeSchemaResponse('github__list_issues', 'List')),
        execute: mockExecute,
      };

      await refreshProxyTools(client as VinkiusClient, registeredTools, graph);

      const entry = registeredTools.get('github__list_issues')!;
      await entry.handler({ state: 'open' });

      expect(graph.size).toBe(1);
      expect(graph.getActiveServerSlugs()).toContain('github');
      expect(graph.totalCalls).toBe(1);
    });

    it('records correct server slug per tool', async () => {
      const { CapabilityGraph } = await import('../src/engine/capability-graph.js');
      const graph = new CapabilityGraph();

      const mockExecute = vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'ok' }],
        isError: false,
      });

      const client: Partial<VinkiusClient> = {
        getTools: vi.fn().mockResolvedValue(makeToolsResponse([
            makeServer('github', ['github__list_issues']),
            makeServer('stripe', ['stripe__list_charges']),
          ])),
        getToolSchema: vi.fn().mockImplementation(async (name: string) => makeSchemaResponse(name, 'List')),
        execute: mockExecute,
      };

      await refreshProxyTools(client as VinkiusClient, registeredTools, graph);

      // Call both proxy tools
      await registeredTools.get('github__list_issues')!.handler({});
      await registeredTools.get('stripe__list_charges')!.handler({});

      expect(graph.size).toBe(2);
      expect(graph.getActiveServerSlugs()).toEqual(
        expect.arrayContaining(['github', 'stripe']),
      );
    });

    it('does not crash when graph is not provided', async () => {
      const mockExecute = vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'ok' }],
        isError: false,
      });

      const client: Partial<VinkiusClient> = {
        getTools: vi.fn().mockResolvedValue(makeToolsResponse([makeServer('github', ['github__list_issues'])])),
        getToolSchema: vi.fn().mockResolvedValue(makeSchemaResponse('github__list_issues', 'List')),
        execute: mockExecute,
      };

      await refreshProxyTools(client as VinkiusClient, registeredTools);

      const entry = registeredTools.get('github__list_issues')!;
      const result = await entry.handler({ state: 'open' });

      expect(result.content[0].text).toBe('ok');
    });
  });
});

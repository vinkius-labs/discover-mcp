/**
 * Proxy-tools — Tier 2 tools dynamically loaded from activated servers.
 *
 * Architecture:
 *   Proxy tools are managed EXCLUSIVELY in-memory. They DO NOT register
 *   on the MCP Server instance directly because:
 *
 *   1. Vurb's `startServer()` returns the low-level SDK `Server` (not `McpServer`),
 *      which does NOT expose `registerTool()`.
 *   2. The `tools/list` and `tools/call` handlers are already owned by Vurb's
 *      `ServerAttachment` — setting them again would crash.
 *   3. Creating a separate `McpServer` wrapper would conflict with the
 *      existing handler pipeline.
 *
 *   Instead, proxy tools are registered as additional MCP tool definitions
 *   that are merged into the `tools/list` response and dispatched in
 *   `tools/call` via a separate lookup path. This is achieved by patching
 *   the Server's existing request handlers to include proxy tools.
 *
 * When a CapabilityGraph is provided, every proxy tool execution is recorded
 * for Iterative Capability Extension tracking.
 */

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { VinkiusClient } from '../api/client.js';

import type { CapabilityGraph } from '../engine/capability-graph.js';

/** A proxy tool definition with its execution handler. */
export interface ProxyToolEntry {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  serverSlug: string;
  handler: (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }>; isError: boolean }>;
}

/**
 * Refresh all proxy tools based on current subscriptions.
 *
 * Three-phase approach to avoid full-manifest dumps:
 *   1. Paginate through the SLIM tool index (names only, max 25 servers/page)
 *   2. For each NEW tool, fetch its schema individually (~1KB each)
 *   3. Remove tools that are no longer in the active set
 *
 * Pagination is API-enforced: no client-side guard needed.
 * Already-registered tools skip the schema fetch entirely.
 * This function populates an in-memory Map of proxy tool entries.
 */
export async function refreshProxyTools(
  client: VinkiusClient,
  proxyTools: Map<string, ProxyToolEntry>,
  graph?: CapabilityGraph,
): Promise<void> {
  const newToolNames = new Set<string>();

  // Phase 1: Paginate through all pages of the slim index
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const response = await client.getTools(page);

    for (const catalogServer of response.servers) {
      for (const tool of catalogServer.tools) {
        newToolNames.add(tool.name);

        // Skip if already registered — no schema fetch needed
        if (proxyTools.has(tool.name)) {
          continue;
        }

        const serverSlug = catalogServer.slug;

        // Phase 2: Granular schema fetch for this single tool
        let description = `[${catalogServer.title}]`;
        let inputSchema: Record<string, unknown> = { type: 'object', properties: {} };

        try {
          const schema = await client.getToolSchema(tool.name);
          description = `[${catalogServer.title}] ${schema.description}`;
          inputSchema = schema.inputSchema;
        } catch {
          // Schema fetch failed — register with minimal definition.
          // The tool will still be callable; the agent just won't see params.
        }

        proxyTools.set(tool.name, {
          name: tool.name,
          description,
          inputSchema,
          serverSlug,
          handler: async (args: Record<string, unknown>) => {
            const result = await client.execute(tool.name, args);

            // Record in capability graph (Iterative Capability Extension)
            if (graph) {
              graph.record(tool.name, serverSlug);
            }

            return {
              content: result.content,
              isError: result.isError,
            };
          },
        });
      }
    }

    hasMore = response.has_more;
    page++;
  }

  // Phase 3: Remove tools that are no longer in the active set
  for (const toolName of proxyTools.keys()) {
    if (!newToolNames.has(toolName)) {
      proxyTools.delete(toolName);
    }
  }
}

/**
 * Patch the MCP Server's tools/list and tools/call handlers to include
 * proxy tools alongside Vurb-managed tools.
 *
 * This intercepts the existing handlers set by Vurb's ServerAttachment
 * and merges proxy tool definitions into tools/list responses, while
 * routing proxy tool calls through the in-memory handler map.
 *
 * Must be called AFTER `startServer()` has completed (so the original
 * handlers exist to be replaced).
 */
export function patchServerWithProxyTools(
  server: InstanceType<typeof Server>,
  proxyTools: Map<string, ProxyToolEntry>,
): void {
  // Store references to the original handlers set by Vurb's ServerAttachment.
  // We use the internal _requestHandlers map (duck-typed) because the SDK
  // does not expose a getRequestHandler() method.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SDK internal access
  const serverAny = server as any;

  // MCP protocol method strings are stable constants.
  // The SDK's Server stores handlers keyed by these strings.
  const listMethod = 'tools/list';
  const callMethod = 'tools/call';

  // Capture the original handlers before overriding
  const originalListHandler = serverAny._requestHandlers?.get(listMethod);
  const originalCallHandler = serverAny._requestHandlers?.get(callMethod);

  if (!originalListHandler || !originalCallHandler) {
    console.error(
      'Warning: Could not patch Server handlers for proxy tools. ' +
      'Proxy tools will not appear in tools/list. Use catalog.execute instead.',
    );
    return;
  }

  // Override tools/list: merge proxy tools into the Vurb response
  server.setRequestHandler(ListToolsRequestSchema, async (request, extra) => {
    const result = await originalListHandler(request, extra);
    const proxyToolDefs = Array.from(proxyTools.values()).map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }));
    return {
      ...result,
      tools: [...(result.tools ?? []), ...proxyToolDefs],
    };
  });

  // Override tools/call: check proxy map first, fall through to Vurb
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const toolName = request.params.name;
    const proxyTool = proxyTools.get(toolName);

    if (proxyTool) {
      // Direct proxy execution — bypass Vurb pipeline
      return proxyTool.handler(request.params.arguments ?? {});
    }

    // Fall through to the original Vurb handler
    return originalCallHandler(request, extra);
  });
}

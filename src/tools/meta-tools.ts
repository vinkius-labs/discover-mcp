/**
 * Meta-tools — Tier 1 tools for the Vinkius MCP Catalog.
 *
 * Built with the FULL Vurb MVA (Model-View-Agent) architecture:
 *
 *   Model    → defineModel() — domain schemas (ServerModel, SubscriptionModel, ...)
 *   View     → definePresenter() — response formatting, UI blocks, suggestActions
 *   Agent    → f.router('catalog') — FluentRouter with shared prefix + middleware
 *
 * Vurb Primitives in use:
 *   f.router()           — Prefix grouping (eliminates 'catalog.' from every name)
 *   .returns(Presenter)  — Automatic MVA response formatting
 *   .instructions()      — AI-First prompt engineering in the tool definition
 *   .readOnly()          — MCP annotation for read-only queries
 *   .destructive()       — MCP annotation for irreversible mutations
 *   .cached()/.stale()   — State Sync epistemic cache hints
 *   .tags()              — Capability tags for selective filtering
 *   .bindState()         — FSM temporal gating for anti-hallucination
 *   .invalidates()       — State Sync cache invalidation patterns
 *   .concurrency()       — Intent Mutex: prevents LLM double-firing
 *   .egress()            — Payload size guard: protects context budget
 *   .withJson()          — Typed JSON object parameter for tool arguments
 *   f.error()            — Structured self-healing ErrorBuilder
 */

import { f } from '../vurb.js';
import { route } from '../engine/semantic-router.js';
import { parseToolName } from '../engine/router.js';

// ── Presenters (View Layer) ─────────────────────────────────────────────────

import { SearchPresenter } from '../presenters/SearchPresenter.js';
import { BrowsePresenter } from '../presenters/BrowsePresenter.js';
import { ToolsPresenter } from '../presenters/ToolsPresenter.js';
import { InspectPresenter } from '../presenters/InspectPresenter.js';
import { AnalyticsPresenter } from '../presenters/AnalyticsPresenter.js';
import { ActivatePresenter } from '../presenters/ActivatePresenter.js';
import { DeactivatePresenter } from '../presenters/DeactivatePresenter.js';
import { CapabilityPresenter } from '../presenters/CapabilityPresenter.js';

/**
 * Create all meta-tool builders using FluentRouter.
 *
 * The `f.router('catalog')` prefix groups all tools under a single
 * `catalog` namespace. Child tools use `.query('search')` → `catalog.search`,
 * `.mutation('activate')` → `catalog.activate`, etc.
 *
 * Error handling:
 *   CatalogApiError propagates naturally through the Vurb error handler.
 *   Auth errors (401/403) carry clear, non-retryable messages with token
 *   renewal instructions. The error message itself instructs the LLM to
 *   stop and explain the issue to the user.
 *
 * Returns fresh builder instances — safe for testing and
 * for the production singleton in index.ts.
 */
export function createMetaTools() {
  // ── Router: shared prefix + description ────────────────────────────────
  const catalog = f.router('catalog')
    .describe('Vinkius MCP Catalog — unified gateway to 3,400+ MCP servers');

  // ── catalog.request_capability ──────────────────────────────────────────
  // Semantic routing: accepts a structured capability spec and finds
  // the best matching servers using hierarchical category/tool scoring.

  const requestCapability = catalog.action('request_capability')
    .describe(
      'Request a capability you need but don\'t have yet. ' +
      'Accepts a structured specification — the system uses semantic routing to find the best matching servers.',
    )
    .instructions(
      'Use this when you identify a GAP in your current capabilities — ' +
      'e.g., you need to fetch weather data but have no weather tool. ' +
      'Do NOT use this for general browsing; use catalog.search or catalog.browse instead. ' +
      'Provide a specific capability description for best results.',
    )
    .withString('capability', 'What you need to do (e.g., "fetch U.S. CPI inflation time-series data")')
    .withOptionalString('domain', 'Domain hint to narrow the search (e.g., "economics", "payments", "security")')
    .withOptionalString('output_hints', 'Expected output format (e.g., "time-series JSON with date and value fields")')
    .tags('discovery')
    .bindState(['idle', 'exploring', 'activated'], 'SEARCH')
    .returns(CapabilityPresenter)
    .handle(async (input, ctx) => {
      const result = await route(
        ctx.client,
        {
          capability: input.capability,
          domain: input.domain,
          outputHints: input.output_hints,
        },
        ctx.graph,
      );

      // Engine returns Model-shaped data → Presenter handles the rest.
      return result.servers;
    });

  // ── catalog.search ──────────────────────────────────────────────────────
  // Marketplace search: keyword-based discovery of MCP servers.

  const search = catalog.query('search')
    .describe(
      'Search the Vinkius MCP marketplace to find servers by keyword. ' +
      'Returns relevant MCPs with descriptions, tools, ratings, and activation instructions.',
    )
    .instructions(
      'Use this when the user asks about specific tools or integrations. ' +
      'For structured capability requests, prefer catalog.request_capability. ' +
      'For general exploration, use catalog.browse.',
    )
    .withString('query', 'What you need (e.g., "track cloud spending", "manage github issues")')
    .withOptionalNumber('limit', 'Max results to return (default: 10)')
    .tags('discovery')
    .bindState(['idle', 'exploring', 'activated'], 'SEARCH')
    .returns(SearchPresenter)
    .handle(async (input, ctx) => {
      const result = await ctx.client.search(input.query, input.limit ?? 10);
      return result.results;
    });

  // ── catalog.browse ──────────────────────────────────────────────────────
  // Category browsing: explore what types of MCPs are available.

  const browse = catalog.query('browse')
    .describe(
      'Browse available MCP categories in the Vinkius marketplace. ' +
      'Returns categories with listing counts for exploration.',
    )
    .instructions(
      'Use this to explore the marketplace when the user doesn\'t know what\'s available. ' +
      'For targeted searches, use catalog.search instead.',
    )
    .cached()
    .tags('discovery')
    .bindState(['idle', 'exploring', 'activated'], 'BROWSE')
    .returns(BrowsePresenter)
    .handle(async (_input, ctx) => {
      const result = await ctx.client.browse();
      return result.categories;
    });

  // ── catalog.activate ──────────────────────────────────────────────────
  // Server activation: subscribe to an MCP server from the marketplace.

  const activate = catalog.mutation('activate')
    .describe(
      'Activate (subscribe to) an MCP server from the marketplace. ' +
      'Free MCPs activate instantly. Paid MCPs return a checkout URL.',
    )
    .instructions(
      'Use this AFTER finding a server via catalog.search or catalog.request_capability. ' +
      'You need the listing "id" (UUID) from the search results. ' +
      'For paid servers, inform the user they need to open the checkout URL in a browser.',
    )
    .withString('listing_id', 'The listing UUID to activate (from search results "id" field)')
    .tags('management')
    .bindState(['idle', 'exploring', 'activated'], 'ACTIVATE')
    .invalidates('catalog.tools', 'catalog.analytics')
    .returns(ActivatePresenter)
    .handle(async (input, ctx) => {
      return await ctx.client.activate(input.listing_id);
    });

  // ── catalog.deactivate ────────────────────────────────────────────────
  // Server deactivation: unsubscribe and remove tools.

  const deactivate = catalog.mutation('deactivate')
    .describe(
      'Deactivate (unsubscribe from) an MCP server. ' +
      'Revokes access and removes the server\'s tools from the catalog.',
    )
    .instructions(
      'Use this to clean up unused subscriptions. ' +
      'Find the subscription_id via catalog.analytics first. ' +
      'This is irreversible — the user will need to re-activate to regain access.',
    )
    .withString('subscription_id', 'The subscription UUID to deactivate (from catalog.analytics)')
    .destructive()
    .tags('management')
    .bindState(['activated'], 'DEACTIVATE')
    .invalidates('catalog.tools', 'catalog.analytics')
    .returns(DeactivatePresenter)
    .handle(async (input, ctx) => {
      return await ctx.client.deactivate(input.subscription_id);
    });

  // ── catalog.tools ─────────────────────────────────────────────────────
  // Slim tool index: server names + tool names only. No schemas.
  // Use catalog.inspect for granular, per-tool detail retrieval.

  const tools = catalog.query('tools')
    .describe(
      'List all currently activated MCP servers and their available tools. ' +
      'Shows which servers are active and what tools each provides. ' +
      'Results are paginated (max 25 servers per page).',
    )
    .instructions(
      'Use this to discover what tools are available in the current session. ' +
      'This returns tool NAMES only — no parameters or descriptions. ' +
      'To see a tool\'s parameters, call catalog.inspect with the tool name. ' +
      'If has_more is true, call catalog.tools again with the next page number. ' +
      'If no tools are listed, the user needs to activate servers first via catalog.search → catalog.activate.',
    )
    .withOptionalNumber('page', 'Page number (default: 1, max 25 servers per page)')
    .stale()
    .tags('discovery', 'execution')
    .bindState(['activated'])
    .egress(16_000)
    .returns(ToolsPresenter)
    .handle(async (input, ctx) => {
      const result = await ctx.client.getTools(input.page ?? 1);
      return result.servers;
    });

  // ── catalog.inspect ───────────────────────────────────────────────────
  // Granular tool detail: fetches description + inputSchema for ONE tool.
  // This is the HATEOAS bridge between catalog.tools and catalog.execute.

  const inspect = catalog.query('inspect')
    .describe(
      'Get full details and parameters for a specific tool. ' +
      'Returns the tool description, input schema, and server metadata.',
    )
    .instructions(
      'Use this BEFORE calling catalog.execute to see the exact parameter names and types. ' +
      'Pass the exact tool name from catalog.tools (e.g., "esa-near-earth-objects__get_risk_list"). ' +
      'NEVER guess parameters — always inspect first.',
    )
    .withString('tool_name', 'Full tool name from catalog.tools (e.g., "esa-near-earth-objects__get_risk_list")')
    .cached()
    .tags('discovery', 'execution')
    .bindState(['activated'])
    .egress(8_000)
    .returns(InspectPresenter)
    .handle(async (input, ctx) => {
      const result = await ctx.client.getToolSchema(input.tool_name);
      return result;
    });

  // ── catalog.analytics ─────────────────────────────────────────────────
  // Usage analytics: subscription status and API call metrics.

  const analytics = catalog.query('analytics')
    .describe(
      'View usage analytics for your activated MCP servers. ' +
      'Shows request counts, last usage times, and subscription status.',
    )
    .instructions(
      'Use this when the user wants to review their MCP usage or find inactive subscriptions. ' +
      'The subscription_id from results is needed for catalog.deactivate.',
    )
    .stale()
    .tags('management')
    .bindState(['activated'])
    .returns(AnalyticsPresenter)
    .handle(async (_input, ctx) => {
      const result = await ctx.client.analytics();
      return result.subscriptions;
    });

  // ── catalog.execute ───────────────────────────────────────────────────
  // Universal tool execution: invoke any tool from any activated server.

  const execute = catalog.action('execute')
    .describe(
      'Execute a tool from any activated MCP server. ' +
      'Use catalog.tools to discover available tool names, then call them here.',
    )
    .instructions(
      'This is the UNIVERSAL execution endpoint — it works for ALL activated servers. ' +
      'Tool names use the format "server_slug__tool_name" (double underscore). ' +
      'You MUST call catalog.tools first to get exact tool names. NEVER guess or construct tool names — they will be wrong. ' +
      'Pass the tool\'s arguments as a JSON object in the "arguments" field.',
    )
    .withString('tool_name', 'Full tool name from catalog.tools (e.g., "github__create_issue")')
    .withOptionalJson('arguments', 'Tool arguments as a JSON object (e.g., {"owner": "vinkius", "state": "open"})')
    .tags('execution')
    .bindState(['activated'])
    .egress(128_000)
    .concurrency({ maxActive: 3, maxQueue: 5 })
    .handle(async (input, ctx) => {
      const args = input.arguments ?? {};

      const result = await ctx.client.execute(input.tool_name, args);

      // Record in capability graph for session-aware routing
      const parsed = parseToolName(input.tool_name);
      if (parsed) {
        ctx.graph.record(input.tool_name, parsed.slug);
      }

      if (result.isError) {
        return f.error('TOOL_EXECUTION_FAILED', result.content?.[0]?.text ?? 'Tool execution failed')
          .suggest(`Verify the tool name exists. Use catalog.tools to list available tools.`)
          .actions('catalog.tools')
          .details({ tool_name: input.tool_name });
      }

      return result.content;
    });

  return {
    requestCapability,
    search,
    browse,
    activate,
    deactivate,
    tools,
    inspect,
    analytics,
    execute,
  };
}

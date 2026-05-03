#!/usr/bin/env node

/**
 * Vinkius Discover — Unified gateway to 3,400+ MCP servers.
 *
 * A single stdio MCP server that aggregates all marketplace MCPs
 * behind one connection, with intelligent search and routing.
 *
 * Built with Vurb.ts — the MVA framework for MCP servers.
 *
 * Configuration:
 *   VINKIUS_CATALOG_TOKEN  — Required. Your vk_catalog_* token.
 *   VINKIUS_API_URL        — Optional. Defaults to https://api.vinkius.com
 *
 * Usage (claude_desktop_config.json):
 *   {
 *     "mcpServers": {
 *       "vinkius": {
 *         "command": "npx",
 *         "args": ["-y", "@vinkius-core/discover-mcp"],
 *         "env": { "VINKIUS_CATALOG_TOKEN": "vk_catalog_..." }
 *       }
 *     }
 *   }
 */

import { startServer, PromptRegistry } from '@vurb/core';
import { f } from './vurb.js';
import type { AppContext } from './vurb.js';
import { VinkiusClient } from './api/client.js';
import { CapabilityGraph } from './engine/capability-graph.js';
import { refreshProxyTools, patchServerWithProxyTools, type ProxyToolEntry } from './tools/proxy-tools.js';
import { createMetaTools } from './tools/meta-tools.js';
import { discoverPrompt } from './prompts/discover.js';

// ── Configuration ───────────────────────────────────────────────────────────

const CATALOG_TOKEN = process.env.VINKIUS_CATALOG_TOKEN;
const API_URL = process.env.VINKIUS_API_URL;

if (!CATALOG_TOKEN) {
  console.error(
    '╔═══════════════════════════════════════════════════════════════════╗\n' +
    '║  VINKIUS_CATALOG_TOKEN is required to use the MCP Catalog.      ║\n' +
    '╚═══════════════════════════════════════════════════════════════════╝\n\n' +
    'Follow these steps to get started:\n\n' +
    '  1. Sign up or log in at https://cloud.vinkius.com\n' +
    '  2. Go to Settings → Catalog Tokens\n' +
    '     https://cloud.vinkius.com/settings/catalog-tokens\n' +
    '  3. Click "Create catalog token" and copy the vk_catalog_* token\n' +
    '  4. Add it to your MCP client configuration:\n\n' +
    '     claude_desktop_config.json:\n' +
    '     {\n' +
    '       "mcpServers": {\n' +
    '         "vinkius": {\n' +
    '           "command": "npx",\n' +
    '           "args": ["-y", "@vinkius-core/discover-mcp"],\n' +
    '           "env": {\n' +
    '             "VINKIUS_CATALOG_TOKEN": "vk_catalog_YOUR_TOKEN_HERE"\n' +
    '           }\n' +
    '         }\n' +
    '       }\n' +
    '     }\n\n' +
    '  5. Restart your AI agent\n',
  );
  process.exit(1);
}

if (!CATALOG_TOKEN.startsWith('vk_catalog_')) {
  console.error(
    'Error: VINKIUS_CATALOG_TOKEN must start with "vk_catalog_".\n\n' +
    'You are using: ' + CATALOG_TOKEN.substring(0, 12) + '...\n\n' +
    'This looks like a regular server token (vk_live_*).\n' +
    'Catalog tokens are different — they give access to ALL your subscribed MCPs.\n\n' +
    'Create a catalog token at:\n' +
    '  https://cloud.vinkius.com/settings/catalog-tokens\n',
  );
  process.exit(1);
}

// ── Bootstrap ───────────────────────────────────────────────────────────────

const client = new VinkiusClient(CATALOG_TOKEN, API_URL);
const graph = new CapabilityGraph();
const registeredProxyTools = new Map<string, ProxyToolEntry>();

// ── FSM Gate (Temporal Anti-Hallucination) ──────────────────────────────────
// Tracks the discovery lifecycle to prevent premature tool calls.
//
// States:
//   idle       → Agent has not yet discovered any capabilities
//   exploring  → Agent is actively browsing/searching the marketplace
//   activated  → At least one server has been activated
//
// The FSM degrades gracefully when XState is not installed —
// all tools remain visible (no gating).

const gate = f.fsm({
  id: 'discover',
  initial: 'idle',
  states: {
    idle:      { on: { SEARCH: 'exploring', BROWSE: 'exploring', ACTIVATE: 'activated' } },
    exploring: { on: { ACTIVATE: 'activated', SEARCH: 'exploring', BROWSE: 'exploring' } },
    activated: { on: { SEARCH: 'exploring', BROWSE: 'exploring', ACTIVATE: 'activated', DEACTIVATE: 'activated' } },
  },
});

// ── Vurb Registry ───────────────────────────────────────────────────────────

const registry = f.registry();

const metaTools = createMetaTools();
registry.registerAll(
  metaTools.requestCapability,
  metaTools.search,
  metaTools.browse,
  metaTools.activate,
  metaTools.deactivate,
  metaTools.tools,
  metaTools.inspect,
  metaTools.analytics,
  metaTools.execute,
);

// ── Prompt Registry ─────────────────────────────────────────────────────────

const prompts = new PromptRegistry<AppContext>();
prompts.register(discoverPrompt);

// ── Start Server ────────────────────────────────────────────────────────────

const { server } = await startServer<AppContext>({
  name: 'vinkius-discover-mcp',
  version: '0.2.2',
  registry,
  prompts,
  contextFactory: () => ({ client, graph }),
  attach: {
    fsm: gate,
    introspection: { enabled: true },
  },
});

// ── Proxy Tools (dynamic, post-startup) ─────────────────────────────────────
// Proxy tools are managed in-memory and merged into the MCP tools/list
// response by patching the Server's request handlers. This avoids the
// need for McpServer.registerTool() which doesn't exist on the low-level
// Server instance returned by Vurb's startServer().

if (server) {
  // Patch the Server's handlers to include proxy tools in tools/list and tools/call
  patchServerWithProxyTools(server, registeredProxyTools);

  try {
    // Paginate through all pages — API enforces 25 servers/page cap.
    // No client-side guard needed: the API is the protection layer.
    await refreshProxyTools(client, registeredProxyTools, graph);
    console.error(`Loaded ${registeredProxyTools.size} proxy tools.`);
  } catch {
    // Non-fatal: catalog execute always works as fallback
    console.error('Warning: Could not load proxy tools on startup. Use catalog execute to invoke tools directly.');
  }
}

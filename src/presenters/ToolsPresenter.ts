/**
 * ToolsPresenter — View layer for the SLIM tool index.
 *
 * Renders a compact inventory: server names + tool names only.
 * Descriptions and inputSchemas are excluded — use catalog.inspect
 * to retrieve full details for a specific tool before execution.
 *
 * HATEOAS: collectionSuggestions guide the agent to catalog.inspect
 * for granular schema retrieval, preventing blind execution.
 */

import { definePresenter, ui, suggest } from '@vurb/core';
import { ActiveServerModel } from '../models/ActiveServerModel.js';

export const ToolsPresenter = definePresenter({
  name: 'ActiveTools',
  schema: ActiveServerModel.schema,

  rules: [
    'ONLY tool names listed here are valid. NEVER guess, abbreviate, or construct tool names.',
    'To see a tool\'s parameters, call catalog.inspect with the tool name BEFORE executing.',
    'NEVER call catalog.execute without first inspecting the tool — parameters will be wrong.',
    'If a tool is not listed here, the server may need activation via catalog.activate.',
  ],

  collectionUi: (servers: any[]) => {
    const totalTools = servers.reduce((sum: number, s: any) => sum + (s.tool_count ?? s.tools?.length ?? 0), 0);

    return [
      ui.summary(`${servers.length} active server(s) providing ${totalTools} tool(s)`),
      ui.table(
        ['Server', 'Tools', 'Tool Names'],
        servers.map((s: any) => [
          s.title,
          `${s.tool_count ?? s.tools?.length ?? 0}`,
          (s.tools ?? []).map((t: any) => t.name).join(', '),
        ]),
      ),
    ];
  },

  collectionSuggestions: (servers: any[]) => {
    const allTools = servers.flatMap((s: any) => s.tools ?? []);
    if (allTools.length === 0) {
      return [suggest('catalog.search', 'No active tools — search the marketplace to find servers to activate')];
    }

    // Suggest inspecting the first available tool as an example
    const firstTool = allTools[0]?.name ?? 'unknown';
    return [
      suggest('catalog.inspect', `Inspect "${firstTool}" to see its parameters before executing`),
    ];
  },

  agentLimit: {
    max: 50,
    onTruncate: (n: number) => ui.summary(`${n} additional server(s) omitted. Use catalog.inspect + catalog.execute directly.`),
  },
});

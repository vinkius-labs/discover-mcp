/**
 * CapabilityPresenter — View layer for semantic routing results.
 *
 * Transforms hierarchical routing results into agent-friendly
 * ranked server lists with relevance scores, tool matches,
 * and clear activation suggestions.
 */

import { definePresenter, ui, suggest } from '@vurb/core';
import { RankedServerModel } from '../models/RankedServerModel.js';

export const CapabilityPresenter = definePresenter({
  name: 'CapabilityResult',
  schema: RankedServerModel.schema,

  rules: [
    'Servers are ranked by semantic relevance to the requested capability.',
    'The "overall_score" combines category matching, tool matching, and session history.',
    'Use the "id" field with catalog.activate to enable the best matching server.',
    'The "top_matching_tools" shows which tools are most relevant to your request.',
    '⚠️ Tool names shown here are PREVIEW names only. After activation, you MUST call catalog.tools to get exact callable tool names. NEVER guess tool names.',
  ],

  collectionRules: (servers: any[]) => [
    servers.length === 0
      ? '⚠️ No servers matched this capability request. Try broader terms or remove the domain filter.'
      : null,
    servers.length > 0
      ? `✅ Found ${servers.length} matching server(s). The top result has ${Math.round((servers[0]?.overall_score ?? 0) * 100)}% relevance.`
      : null,
  ],

  collectionUi: (servers: any[]) => {
    if (servers.length === 0) return [];

    return [
      ui.table(
        ['Rank', 'Server', 'Score', 'Best Tool'],
        servers.slice(0, 10).map((s: any, i: number) => [
          `#${i + 1}`,
          s.title,
          `${Math.round((s.overall_score ?? 0) * 100)}%`,
          s.top_matching_tools?.[0]?.name ?? '—',
        ]),
      ),
    ];
  },

  collectionSuggestions: (servers: any[]) => [
    servers.length > 0
      ? suggest('catalog.activate', `Activate "${servers[0]?.title}" to access its ${servers[0]?.top_matching_tools?.length ?? 0} matching tools`)
      : suggest('catalog.browse', 'Browse available categories to discover servers'),
  ],

  agentLimit: {
    max: 10,
    onTruncate: (n: number) => ui.summary(`${n} additional server(s) omitted. The top results are the most relevant.`),
  },
});

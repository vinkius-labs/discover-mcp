/**
 * InspectPresenter — View layer for single-tool schema details.
 *
 * Renders the full description, inputSchema parameters, and server
 * metadata for a specific tool. HATEOAS suggestion guides the agent
 * directly to catalog.execute with the correct tool name.
 */

import { definePresenter, ui, suggest } from '@vurb/core';
import { InspectResultModel } from '../models/InspectResultModel.js';

export const InspectPresenter = definePresenter({
  name: 'InspectResult',
  schema: InspectResultModel.schema,

  rules: [
    'The parameters shown in inputSchema are EXACT — use them as-is in catalog.execute.',
    'The "action" parameter is almost always required — check the "required" array.',
    'Pass arguments as a JSON object in catalog.execute\'s "arguments" field.',
  ],

  ui: (tool: any) => {
    const schema = tool.inputSchema ?? {};
    const props = schema.properties ?? {};
    const required = new Set(schema.required ?? []);

    const paramRows = Object.entries(props).map(([key, def]: [string, any]) => [
      key,
      def?.type ?? 'any',
      required.has(key) ? '✅' : '',
      def?.description ?? '',
    ]);

    return [
      ui.summary(`📋 ${tool.name} (${tool.server_title})`),
      ...(paramRows.length > 0
        ? [ui.table(['Parameter', 'Type', 'Required', 'Description'], paramRows)]
        : []),
    ];
  },

  suggestActions: (tool: any) => [
    suggest('catalog.execute', `Execute "${tool.name}" with the parameters shown above`),
  ],
});

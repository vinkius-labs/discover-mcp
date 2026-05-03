/**
 * InspectResultModel — Domain model for single-tool schema details.
 *
 * Represents the full schema of one tool, including its inputSchema
 * parameters and server metadata. Used by InspectPresenter.
 */

import { defineModel } from '@vurb/core';

export const InspectResultModel = defineModel('InspectResult', m => {
  m.casts({
    name:         m.string('Full namespaced tool name'),
    description:  m.string('Tool description and instructions'),
    inputSchema:  m.object('JSON Schema for tool parameters', {}),
    server_slug:  m.string('Server slug'),
    server_title: m.string('Server display name'),
  });
});

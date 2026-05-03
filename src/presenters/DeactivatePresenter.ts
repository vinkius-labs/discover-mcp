/**
 * DeactivatePresenter — View layer for server deactivation results.
 *
 * Renders the deactivation outcome with contextual rules about
 * the impact (tools becoming unavailable) and HATEOAS suggestions
 * to refresh the tool inventory or check subscription status.
 */

import { definePresenter, suggest } from '@vurb/core';
import { DeactivateResultModel } from '../models/DeactivateResultModel.js';

export const DeactivatePresenter = definePresenter({
  name: 'DeactivateResult',
  schema: DeactivateResultModel.schema,

  rules: (result: any) => [
    result.deactivated
      ? '✅ Server deactivated. All tools from this server are now unavailable — any future calls to those tools will fail.'
      : '⚠️ Deactivation did not complete. Verify the subscription ID is correct (use catalog.analytics to find it).',
  ],

  suggestActions: (result: any) => {
    const suggestions = [];
    if (result.deactivated) {
      suggestions.push(suggest('catalog.tools', 'Refresh tool inventory — deactivated tools have been removed'));
      suggestions.push(suggest('catalog.analytics', 'Verify deactivation status in usage analytics'));
    } else {
      suggestions.push(suggest('catalog.analytics', 'Check subscription status and find the correct subscription ID'));
    }
    return suggestions;
  },
});

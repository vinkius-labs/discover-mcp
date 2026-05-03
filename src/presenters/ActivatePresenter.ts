/**
 * ActivatePresenter — View layer for server activation results.
 *
 * Renders the activation outcome with next-step suggestions
 * based on whether the activation was instant (free) or requires
 * a checkout flow (paid).
 */

import { definePresenter, suggest } from '@vurb/core';
import { ActivateResultModel } from '../models/ActivateResultModel.js';

export const ActivatePresenter = definePresenter({
  name: 'ActivateResult',
  schema: ActivateResultModel.schema,

  rules: (result: any) => [
    result.activated
      ? '✅ Server activated successfully. Tools are now available.'
      : null,
    result.checkout_url
      ? `💳 This is a PAID server. The user MUST open the checkout URL in a browser to complete activation: ${result.checkout_url}`
      : null,
    !result.activated && !result.checkout_url
      ? '⚠️ Activation did not complete. Check the message for details.'
      : null,
  ],

  suggestActions: (result: any) => {
    const suggestions = [];
    if (result.activated) {
      suggestions.push(suggest('catalog.tools', 'List all available tools to see exact callable names (required before execution)'));
    }
    if (!result.activated && result.checkout_url) {
      suggestions.push(suggest('catalog.analytics', 'Check subscription status after completing checkout'));
    }
    return suggestions;
  },
});

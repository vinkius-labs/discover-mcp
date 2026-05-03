/**
 * ActivateResultModel — Domain model for server activation outcomes.
 *
 * Represents the result of activating a marketplace server —
 * free (instant activation) or paid (checkout URL). Used by ActivatePresenter.
 */

import { defineModel } from '@vurb/core';

export const ActivateResultModel = defineModel('ActivateResult', m => {
  m.casts({
    activated:       m.boolean('Whether activation completed immediately'),
    subscription_id: m.string('Subscription UUID (if activated)'),
    checkout_url:    m.string('Checkout URL for paid servers'),
    message:         m.string('Human-readable activation status'),
  });
});

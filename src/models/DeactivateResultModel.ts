/**
 * DeactivateResultModel — Domain model for server deactivation outcomes.
 *
 * Represents the result of deactivating a marketplace server subscription.
 * Used by DeactivatePresenter to validate and shape deactivation responses.
 */

import { defineModel } from '@vurb/core';

export const DeactivateResultModel = defineModel('DeactivateResult', m => {
  m.casts({
    deactivated: m.boolean('Whether the subscription was successfully deactivated'),
  });
});

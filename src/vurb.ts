/**
 * Vurb Instance — Context Initialization
 *
 * Single point of context definition for the entire server.
 * All tools inherit the VinkiusClient and CapabilityGraph via context.
 */

import { initVurb } from '@vurb/core';
import type { VinkiusClient } from './api/client.js';
import type { CapabilityGraph } from './engine/capability-graph.js';

/** Application context available in every tool handler. */
export interface AppContext {
  client: VinkiusClient;
  graph: CapabilityGraph;
}

export const f = initVurb<AppContext>();

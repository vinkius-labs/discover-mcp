import { describe, it, expect, beforeEach } from 'vitest';
import { initVurb } from '@vurb/core';

describe('discovery FSM gate', () => {
  let gate: ReturnType<ReturnType<typeof initVurb>['fsm']>;

  beforeEach(() => {
    const f = initVurb();
    gate = f.fsm({
      id: 'discover',
      initial: 'idle',
      states: {
        idle:      { on: { SEARCH: 'exploring', BROWSE: 'exploring', ACTIVATE: 'activated' } },
        exploring: { on: { ACTIVATE: 'activated', SEARCH: 'exploring', BROWSE: 'exploring' } },
        activated: { on: { SEARCH: 'exploring', DEACTIVATE: 'idle' } },
      },
    });
  });

  describe('initial state', () => {
    it('starts in idle state', () => {
      expect(gate.currentState).toBe('idle');
    });
  });

  describe('transitions', () => {
    it('idle → exploring on SEARCH', async () => {
      const result = await gate.transition('SEARCH');
      expect(result.changed).toBe(true);
      expect(result.previousState).toBe('idle');
      expect(result.currentState).toBe('exploring');
    });

    it('idle → exploring on BROWSE', async () => {
      const result = await gate.transition('BROWSE');
      expect(result.changed).toBe(true);
      expect(result.currentState).toBe('exploring');
    });

    it('idle → activated on ACTIVATE', async () => {
      const result = await gate.transition('ACTIVATE');
      expect(result.changed).toBe(true);
      expect(result.currentState).toBe('activated');
    });

    it('exploring → activated on ACTIVATE', async () => {
      await gate.transition('SEARCH');
      const result = await gate.transition('ACTIVATE');
      expect(result.changed).toBe(true);
      expect(result.currentState).toBe('activated');
    });

    it('exploring → exploring on repeated SEARCH', async () => {
      await gate.transition('SEARCH');
      const result = await gate.transition('SEARCH');
      expect(result.changed).toBe(false);
      expect(result.currentState).toBe('exploring');
    });

    it('activated → exploring on SEARCH', async () => {
      await gate.transition('ACTIVATE');
      const result = await gate.transition('SEARCH');
      expect(result.changed).toBe(true);
      expect(result.currentState).toBe('exploring');
    });

    it('activated → idle on DEACTIVATE', async () => {
      await gate.transition('ACTIVATE');
      const result = await gate.transition('DEACTIVATE');
      expect(result.changed).toBe(true);
      expect(result.currentState).toBe('idle');
    });

    it('ignores unknown events (no state change)', async () => {
      const result = await gate.transition('UNKNOWN_EVENT');
      expect(result.changed).toBe(false);
      expect(result.currentState).toBe('idle');
    });
  });

  describe('tool binding', () => {
    it('ungated tools are always visible', () => {
      expect(gate.isToolAllowed('catalog')).toBe(true);
    });

    it('gated tools are only visible in allowed states', () => {
      gate.bindTool('proxy_tool', ['activated']);
      expect(gate.isToolAllowed('proxy_tool')).toBe(false); // idle state
    });

    it('gated tools become visible after transition', async () => {
      gate.bindTool('proxy_tool', ['activated']);
      await gate.transition('ACTIVATE');
      expect(gate.isToolAllowed('proxy_tool')).toBe(true);
    });

    it('filters visible tool names', async () => {
      gate.bindTool('proxy_tool', ['activated']);
      gate.bindTool('exec_tool', ['activated', 'exploring']);

      const allTools = ['catalog', 'proxy_tool', 'exec_tool'];

      // idle state
      expect(gate.getVisibleToolNames(allTools)).toEqual(['catalog']);

      // exploring
      await gate.transition('SEARCH');
      expect(gate.getVisibleToolNames(allTools)).toEqual(['catalog', 'exec_tool']);

      // activated
      await gate.transition('ACTIVATE');
      expect(gate.getVisibleToolNames(allTools)).toEqual(allTools);
    });
  });

  describe('snapshot and restore', () => {
    it('creates a serializable snapshot', async () => {
      await gate.transition('ACTIVATE');
      const snap = gate.snapshot();
      expect(snap.state).toBe('activated');
      expect(snap.updatedAt).toBeGreaterThan(0);
    });

    it('restores from a snapshot', async () => {
      await gate.transition('ACTIVATE');
      const snap = gate.snapshot();

      // Create a new gate and restore
      const f = initVurb();
      const newGate = f.fsm({
        id: 'discover',
        initial: 'idle',
        states: {
          idle:      { on: { SEARCH: 'exploring', ACTIVATE: 'activated' } },
          exploring: { on: { ACTIVATE: 'activated' } },
          activated: { on: { DEACTIVATE: 'idle' } },
        },
      });

      newGate.restore(snap);
      expect(newGate.currentState).toBe('activated');
    });
  });

  describe('lifecycle', () => {
    it('full discovery lifecycle: idle → explore → activate → deactivate → idle', async () => {
      expect(gate.currentState).toBe('idle');

      await gate.transition('BROWSE');
      expect(gate.currentState).toBe('exploring');

      await gate.transition('SEARCH');
      expect(gate.currentState).toBe('exploring');

      await gate.transition('ACTIVATE');
      expect(gate.currentState).toBe('activated');

      await gate.transition('DEACTIVATE');
      expect(gate.currentState).toBe('idle');
    });
  });
});

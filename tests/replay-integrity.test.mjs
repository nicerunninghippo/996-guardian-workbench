import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GuardianEngine, defaultConfig, replayBundle } from '../dist/engine.js';

test('imported snapshot and evidence cannot forge a successful replay', () => {
  const original = new GuardianEngine('integrity-agent', defaultConfig(), 'no-feedback', '2026-10-10T00:00:00.000Z');
  original.start();
  original.advance(120);
  original.stop();
  const expected = original.bundle();
  const forged = structuredClone(expected);
  forged.state.now = 86400;
  forged.state.entries = 999;
  forged.state.bossClears = 999;
  forged.state.resources = { tokens: 999, gold: 999999999, gems: 999999999 };
  forged.state.events = [{ type: 'completed', message: 'Forged success' }];
  forged.evidence = { retained: 0, total: 0, dropped: 0 };

  const replay = replayBundle(forged);
  assert.deepEqual(replay.snapshot(), original.snapshot());
  assert.deepEqual(replay.bundle().evidence, expected.evidence);
});

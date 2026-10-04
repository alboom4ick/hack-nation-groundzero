import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScreenLog } from '../public/screen-log.js';
import { createAsker } from '../public/asker.js';

test('screen log keeps the last events, newest marked latest, and strips the [SCREEN] tag', () => {
  const log = createScreenLog({ max: 2 });
  assert.match(log.state(), /Nothing has been seen/);
  log.record('[SCREEN] invoice 4471 opened');
  log.record('cost center changed from 4711 to 0400');
  log.record('Save clicked');
  const lines = log.state().split('\n');
  assert.equal(lines.length, 2);
  assert.match(lines[0], /^earlier .*cost center changed/);
  assert.match(lines[1], /^latest .*Save clicked/);
  assert.doesNotMatch(log.state(), /\[SCREEN\]/);
});

test('the asker exposes get_screen_state as a client tool returning the log', async () => {
  const asker = createAsker();
  asker.screen.record('invoice 4471 opened');
  assert.match(await asker.tools.get_screen_state(), /invoice 4471 opened/);
});

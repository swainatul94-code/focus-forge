import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const L = require('../www/logic.js');

// helper: build checkins map from offsets relative to a fixed "today"
const TODAY = '2026-06-11';
function days(...offsets) {
  const m = {};
  for (const o of offsets) {
    const d = new Date(2026, 5, 11); // June 11 2026, local
    d.setDate(d.getDate() + o);
    m[L.iso(d)] = true;
  }
  return m;
}

test('currentStreak counts consecutive days ending today', () => {
  assert.equal(L.currentStreak(days(0, -1, -2), TODAY), 3);
});

test('currentStreak allows unchecked today (counts to yesterday)', () => {
  assert.equal(L.currentStreak(days(-1, -2), TODAY), 2);
});

test('currentStreak treats frozen days as continuation', () => {
  const c = days(0, -2);
  c['2026-06-10'] = 'frozen';
  assert.equal(L.currentStreak(c, TODAY), 3);
});

test('currentStreak is 0 after a 2-day gap', () => {
  assert.equal(L.currentStreak(days(-3, -4), TODAY), 0);
});

test('freezeSpendDays: yesterday missed, streak alive, token held -> spend it', () => {
  const g = { checkins: days(-2, -3), freezeTokens: 1 };
  assert.deepEqual(L.freezeSpendDays(g, TODAY), ['2026-06-10']);
});

test('freezeSpendDays: no token -> nothing', () => {
  const g = { checkins: days(-2, -3), freezeTokens: 0 };
  assert.deepEqual(L.freezeSpendDays(g, TODAY), []);
});

test('freezeSpendDays: yesterday checked -> nothing', () => {
  const g = { checkins: days(-1), freezeTokens: 2 };
  assert.deepEqual(L.freezeSpendDays(g, TODAY), []);
});

test('freezeSpendDays: 2-day gap, 2 tokens -> both days bridged', () => {
  const g = { checkins: days(-3, -4), freezeTokens: 2 };
  assert.deepEqual(L.freezeSpendDays(g, TODAY).sort(), ['2026-06-09', '2026-06-10']);
});

test('freezeSpendDays: gap longer than tokens -> chain dead, spend nothing', () => {
  const g = { checkins: days(-3, -4), freezeTokens: 1 };
  assert.deepEqual(L.freezeSpendDays(g, TODAY), []);
});

test('freezeSpendDays: no real streak behind the gap -> nothing', () => {
  const g = { checkins: {}, freezeTokens: 2 };
  assert.deepEqual(L.freezeSpendDays(g, TODAY), []);
});

test('freezeEarn: streak crossing 7 earns 1 token, capped at 2, no double-earn', () => {
  const g = { checkins: days(0, -1, -2, -3, -4, -5, -6), freezeTokens: 0, freezesEarnedFor: 0 };
  assert.equal(L.freezeEarn(g, TODAY), 1);          // 7-day streak -> earn
  g.freezeTokens = 1; g.freezesEarnedFor = 7;
  assert.equal(L.freezeEarn(g, TODAY), 0);          // already credited for 7
  const g14 = { checkins: days(...Array.from({ length: 14 }, (_, i) => -i)), freezeTokens: 2, freezesEarnedFor: 7 };
  assert.equal(L.freezeEarn(g14, TODAY), 0);        // at cap of 2
});

test('statsForGoal: deadline goal completion uses target days, not elapsed', () => {
  // 5-day deadline goal that ended days ago; 4 real check-ins -> 80%, not 4/10
  const g = { checkins: days(-9, -8, -7, -6), start: '2026-06-02', type: 'deadline', targetDays: 5 };
  assert.equal(L.statsForGoal(g, TODAY).completionPct, 80);
});

test('statsForGoal: completion ignores frozen days, longest streak counts them', () => {
  const c = days(0, -1, -3, -4);
  c['2026-06-09'] = 'frozen'; // -2
  const g = { checkins: c, start: '2026-06-02', type: 'streak' };
  const s = L.statsForGoal(g, TODAY);
  assert.equal(s.totalCheckins, 4);            // frozen not a real check-in
  assert.equal(s.longestStreak, 5);            // -4..0 bridged by frozen day
  assert.equal(s.completionPct, 40);           // 4 real / 10 elapsed days
});

test('weeklyCounts returns 8 buckets, oldest first', () => {
  const g = { checkins: days(0, -1, -7), start: '2026-01-01', type: 'streak' };
  const w = L.weeklyCounts([g], TODAY, 8);
  assert.equal(w.length, 8);
  assert.equal(w[7], 2);  // current week: today + yesterday
  assert.equal(w[6], 1);  // previous week
});

test('notificationPlan: pending goals -> 3 notifications with correct ids', () => {
  const goals = [{ id: 'a', title: 'Read', emoji: '📚', checkins: {}, start: TODAY, type: 'streak' }];
  const plan = L.notificationPlan(goals, { notif: true, time: '20:00' }, TODAY);
  assert.deepEqual(plan.map(n => n.id), [1, 2, 3]);
  assert.match(plan[0].body, /1 goal/);
  assert.match(plan[2].body, /Read/);
  assert.deepEqual(plan[0].on, { hour: 20, minute: 0 });
  assert.deepEqual(plan[1].on, { hour: 21, minute: 30 });
  assert.equal(plan[2].at, '2026-06-12T09:00');
});

test('notificationPlan: all checked -> reminders for tomorrow, no morning-after', () => {
  const goals = [{ id: 'a', title: 'Read', emoji: '📚', checkins: days(0), start: TODAY, type: 'streak' }];
  const plan = L.notificationPlan(goals, { notif: true, time: '20:00' }, TODAY);
  assert.deepEqual(plan.map(n => n.id), [1, 2]);
});

test('notificationPlan: notifications off -> empty', () => {
  assert.deepEqual(L.notificationPlan([], { notif: false, time: '20:00' }, TODAY), []);
});

test('notificationPlan: no goals -> empty (nothing to nag about)', () => {
  assert.deepEqual(L.notificationPlan([], { notif: true, time: '20:00' }, TODAY), []);
});

test('notificationPlan: only an expired deadline goal -> empty', () => {
  const g = { id: 'd', title: 'Sprint', emoji: '🎯', checkins: {}, start: '2026-06-01', type: 'deadline', targetDays: 3 };
  assert.deepEqual(L.notificationPlan([g], { notif: true, time: '20:00' }, TODAY), []);
});

test('channelSpecs: defaults -> 3 channels v1, system default sound', () => {
  const specs = L.channelSpecs({});
  assert.deepEqual(specs.map(s => s.id), ['ff_daily_v1', 'ff_last_v1', 'ff_morning_v1']);
  for (const s of specs) {
    assert.equal(s.soundName, undefined);
    assert.equal(s.soundUri, undefined);
    assert.equal(s.importance, 4);
    assert.ok(Array.isArray(s.vibration));
  }
});

test('channelSpecs: bundled tone choice -> res/raw soundName', () => {
  const specs = L.channelSpecs({ sounds: { daily: 'chime', last: 'urgent' } });
  assert.equal(specs[0].soundName, 'ff_chime.wav');
  assert.equal(specs[1].soundName, 'ff_urgent.wav');
  assert.equal(specs[2].soundName, undefined); // morning unset -> default
});

test('channelSpecs: custom sound uses imported uri; without import falls back to default', () => {
  const withImport = L.channelSpecs({ sounds: { daily: 'custom' }, customSound: { uri: 'content://media/123', name: 'song.mp3' } });
  assert.equal(withImport[0].soundUri, 'content://media/123');
  const noImport = L.channelSpecs({ sounds: { daily: 'custom' } });
  assert.equal(noImport[0].soundUri, undefined);
  assert.equal(noImport[0].soundName, undefined);
});

test('channelSpecs: sndVer bump changes channel ids', () => {
  assert.equal(L.channelSpecs({ sndVer: 3 })[0].id, 'ff_daily_v3');
});

test('notificationPlan: items carry per-layer channelIds', () => {
  const goals = [{ id: 'a', title: 'Read', emoji: '📚', checkins: {}, start: TODAY, type: 'streak' }];
  const plan = L.notificationPlan(goals, { notif: true, time: '20:00', sndVer: 2 }, TODAY);
  assert.equal(plan[0].channelId, 'ff_daily_v2');
  assert.equal(plan[1].channelId, 'ff_last_v2');
  assert.equal(plan[2].channelId, 'ff_morning_v2');
});

test('notificationPlan: expired deadline goal excluded from pending count', () => {
  const expired = { id: 'd', title: 'Sprint', emoji: '🎯', checkins: {}, start: '2026-06-01', type: 'deadline', targetDays: 3 };
  const live = { id: 'a', title: 'Read', emoji: '📚', checkins: {}, start: TODAY, type: 'streak' };
  const plan = L.notificationPlan([expired, live], { notif: true, time: '20:00' }, TODAY);
  assert.match(plan[0].body, /1 goal /);
  assert.match(plan[2].body, /Read/);
  assert.doesNotMatch(plan[2].body, /Sprint/);
});

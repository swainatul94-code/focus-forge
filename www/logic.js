/* Focus Forge pure logic — no DOM, no Capacitor. Loaded by the page
   (window.FFLogic) and by node:test (module.exports). */
(function (global) {
  function iso(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
      '-' + String(d.getDate()).padStart(2, '0');
  }
  function parse(k) { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); }
  function addDays(k, n) { const d = parse(k); d.setDate(d.getDate() + n); return iso(d); }
  function daysBetween(a, b) { return Math.round((parse(b) - parse(a)) / 86400000); }

  /* consecutive run (real or frozen) ending today, or yesterday if today unchecked */
  function currentStreak(checkins, todayKey) {
    let k = todayKey, s = 0;
    if (!checkins[k]) k = addDays(k, -1);
    while (checkins[k]) { s++; k = addDays(k, -1); }
    return s;
  }

  /* walk back from yesterday over missed days; if a checked day is reached
     before tokens run out, return the missed days to freeze (bridging the
     gap), else [] — chain is dead or there was nothing to save. Depends only
     on check-in history, never on when the app was last opened. */
  function freezeSpendDays(g, todayKey) {
    const tokens = g.freezeTokens || 0;
    if (!tokens) return [];
    const gap = [];
    let k = addDays(todayKey, -1);
    while (!g.checkins[k] && gap.length < tokens) { gap.push(k); k = addDays(k, -1); }
    if (!gap.length || !g.checkins[k]) return []; // yesterday fine, or gap > tokens
    return gap;
  }

  /* tokens to add right now: streak crossed a new multiple of 7, cap 2 held */
  function freezeEarn(g, todayKey) {
    const s = currentStreak(g.checkins, todayKey);
    const credited = g.freezesEarnedFor || 0;
    const milestone = Math.floor(s / 7) * 7;
    if (milestone < 7 || milestone <= credited) return 0;
    if ((g.freezeTokens || 0) >= 2) return 0;
    return 1;
  }

  function realCheckins(checkins) {
    return Object.keys(checkins).filter(k => checkins[k] === true);
  }

  function longestStreak(checkins) {
    const keys = Object.keys(checkins).sort();
    let best = 0;
    for (const k of keys) {
      if (checkins[addDays(k, -1)]) continue; // not a run start
      let len = 0, cur = k;
      while (checkins[cur]) { len++; cur = addDays(cur, 1); }
      best = Math.max(best, len);
    }
    return best;
  }

  function statsForGoal(g, todayKey) {
    const real = realCheckins(g.checkins).length;
    let elapsed = Math.max(1, daysBetween(g.start, todayKey) + 1);
    if (g.targetDays) elapsed = Math.min(elapsed, g.targetDays); // deadline: out of target, not forever
    return {
      totalCheckins: real,
      longestStreak: longestStreak(g.checkins),
      completionPct: Math.min(100, Math.round(real / elapsed * 100))
    };
  }

  /* deadline goal whose target window has passed */
  function isExpiredDeadline(g, todayKey) {
    return !!g.targetDays && daysBetween(g.start, todayKey) + 1 > g.targetDays;
  }

  /* check-ins per week across all goals; buckets[weeks-1] = current week */
  function weeklyCounts(goals, todayKey, weeks) {
    const buckets = new Array(weeks).fill(0);
    for (const g of goals) {
      for (const k of realCheckins(g.checkins)) {
        const ago = daysBetween(k, todayKey);
        if (ago < 0) continue;
        const w = Math.floor(ago / 7);
        if (w < weeks) buckets[weeks - 1 - w]++;
      }
    }
    return buckets;
  }

  /* bundled tone name -> res/raw file (without path) */
  const SOUNDS = { chime: 'ff_chime', urgent: 'ff_urgent', soft: 'ff_soft', digital: 'ff_digital' };

  /* Android 8+ fixes a channel's sound at creation time — it can never be
     changed. So each reminder layer gets its own channel, and the ids carry a
     version (settings.sndVer): changing any sound bumps the version, fresh
     channels are created and native.js deletes the stale ff_* ones. */
  function channelSpecs(settings) {
    const v = settings.sndVer || 1;
    const sounds = settings.sounds || {};
    const layers = [
      { key: 'daily',   name: 'Daily reminder',       vibration: [0, 250, 150, 250] },
      { key: 'last',    name: 'Last-chance nudge',    vibration: [0, 400, 150, 400, 150, 400] },
      { key: 'morning', name: 'Morning streak alert', vibration: [0, 200] }
    ];
    return layers.map(L => {
      const spec = { key: L.key, id: 'ff_' + L.key + '_v' + v, name: L.name,
                     importance: 4, vibration: L.vibration };
      const choice = sounds[L.key] || 'default';
      if (choice === 'custom' && settings.customSound && settings.customSound.uri) {
        spec.soundUri = settings.customSound.uri;
      } else if (SOUNDS[choice]) {
        spec.soundName = SOUNDS[choice] + '.wav';
      } // neither set -> system default notification sound
      return spec;
    });
  }

  /* declarative plan; native.js turns it into plugin calls.
     id 1: daily repeating at settings.time     -> 'daily' channel
     id 2: last-chance repeating 21:30          -> 'last' channel
     id 3: one-shot tomorrow 09:00, only if something is pending now -> 'morning' */
  function notificationPlan(goals, settings, todayKey) {
    if (!settings.notif) return [];
    const active = goals.filter(g => !isExpiredDeadline(g, todayKey));
    if (!active.length) return []; // nothing left to remind about
    const pending = active.filter(g => !g.checkins[todayKey]);
    const n = pending.length;
    const [h, m] = (settings.time || '20:00').split(':').map(Number);
    const chan = {};
    for (const s of channelSpecs(settings)) chan[s.key] = s.id;
    const plan = [
      {
        id: 1, on: { hour: h, minute: m }, channelId: chan.daily,
        title: 'Focus Forge — check-in time',
        body: n > 0 ? `${n} goal${n > 1 ? 's' : ''} still need a check-in today. Keep the streak alive 🔥`
                    : 'Daily check-in time. Keep the streak alive 🔥'
      },
      {
        id: 2, on: { hour: 21, minute: 30 }, channelId: chan.last,
        title: 'Last chance today ⏰',
        body: 'Still unchecked goals. A 30-second check-in saves the streak.'
      }
    ];
    if (n > 0) {
      const names = pending.slice(0, 3).map(g => g.emoji + ' ' + g.title).join(', ');
      plan.push({
        id: 3, at: addDays(todayKey, 1) + 'T09:00', channelId: chan.morning,
        title: 'Streak at risk ⚠️',
        body: `Yesterday you missed: ${names}${n > 3 ? '…' : ''}. Check in today to recover.`
      });
    }
    return plan;
  }

  const FFLogic = { iso, parse, addDays, daysBetween, currentStreak, freezeSpendDays,
    freezeEarn, longestStreak, statsForGoal, weeklyCounts, notificationPlan, isExpiredDeadline,
    channelSpecs, SOUNDS };
  if (typeof module !== 'undefined' && module.exports) module.exports = FFLogic;
  else global.FFLogic = FFLogic;
})(typeof window !== 'undefined' ? window : globalThis);

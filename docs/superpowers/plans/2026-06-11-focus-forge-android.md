# Focus Forge Android App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package focus-tracker.html as an Android APK (Capacitor) with closed-app notifications, streak freeze tokens, and a stats dashboard.

**Architecture:** The existing single-file app moves to `www/index.html`. New pure logic (streak-with-freeze, stats, notification planning) lives in `www/logic.js` — a dependency-free module loadable both by the browser (`window.FFLogic`) and Node's test runner (CommonJS). `www/native.js` bridges to Capacitor plugins (`window.Capacitor?.Plugins`) with browser fallbacks, so the app keeps working on desktop for testing. No bundler: Capacitor's native runtime is injected by the Android WebView; plugins are reached via `Capacitor.Plugins.*`.

**Tech Stack:** Capacitor 7+ (`@capacitor/core`, `@capacitor/cli`, `@capacitor/android`, `@capacitor/local-notifications`, `@capacitor/haptics`), Node 24 built-in test runner (`node:test`), no frontend framework.

**Data model additions (on each goal `g`):**
- `g.checkins[date]` — `true` (real check-in) or `"frozen"` (freeze token spent). Both truthy → existing streak-walk code keeps working.
- `g.freezeTokens` — number held, max 2.
- `g.freezesEarnedFor` — highest streak length already credited with a token (prevents re-earning).

**Notification IDs (fixed):** 1 = daily reminder (repeating at `settings.time`), 2 = last-chance (repeating 21:30), 3 = morning-after (one-shot, next day 09:00). All three cancelled and rescheduled on every app launch/resume/check-in.

---

### Task 1: Scaffold Capacitor project

**Files:**
- Create: `package.json`, `capacitor.config.json`, `www/index.html` (copy), `.gitignore`
- Create (generated): `android/` via CLI

- [ ] **Step 1: Create package.json**

```json
{
  "name": "focus-forge",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "test": "node --test tests/"
  }
}
```

- [ ] **Step 2: Create .gitignore**

```
node_modules/
android/
.gradle/
```

- [ ] **Step 3: Install Capacitor + plugins**

Run in `C:\Users\swain\focus-forge-app`:
```powershell
npm install @capacitor/core @capacitor/cli @capacitor/android @capacitor/local-notifications @capacitor/haptics
```
Expected: packages added, no errors.

- [ ] **Step 4: Create capacitor.config.json**

```json
{
  "appId": "com.swain.focusforge",
  "appName": "Focus Forge",
  "webDir": "www"
}
```

- [ ] **Step 5: Copy app into www/**

```powershell
New-Item -ItemType Directory -Force www | Out-Null
Copy-Item C:\Users\swain\focus-tracker.html www\index.html
```

- [ ] **Step 6: Generate Android shell**

```powershell
npx cap add android
```
Expected: `android/` created, "Adding native android project" success message. (Does not require the SDK yet — only the build does.)

- [ ] **Step 7: Commit**

```powershell
git add -A; git commit -m "feat: scaffold Capacitor project around focus-tracker"
```

---

### Task 2: Pure logic module with tests (streak/freeze/stats/notification plan)

**Files:**
- Create: `www/logic.js`
- Create: `tests/logic.test.mjs`

- [ ] **Step 1: Write failing tests**

`tests/logic.test.mjs`:
```js
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

test('freezeSpendDay: yesterday missed, streak alive, token held -> spend', () => {
  const g = { checkins: days(-2, -3), freezeTokens: 1 };
  assert.equal(L.freezeSpendDay(g, TODAY), '2026-06-10');
});

test('freezeSpendDay: no token -> null', () => {
  const g = { checkins: days(-2, -3), freezeTokens: 0 };
  assert.equal(L.freezeSpendDay(g, TODAY), null);
});

test('freezeSpendDay: yesterday checked -> null', () => {
  const g = { checkins: days(-1), freezeTokens: 2 };
  assert.equal(L.freezeSpendDay(g, TODAY), null);
});

test('freezeSpendDay: gap of 2+ days -> null (freeze covers single misses only)', () => {
  const g = { checkins: days(-3, -4), freezeTokens: 2 };
  assert.equal(L.freezeSpendDay(g, TODAY), null);
});

test('freezeEarn: streak crossing 7 earns 1 token, capped at 2, no double-earn', () => {
  const g = { checkins: days(0, -1, -2, -3, -4, -5, -6), freezeTokens: 0, freezesEarnedFor: 0 };
  assert.equal(L.freezeEarn(g, TODAY), 1);          // 7-day streak -> earn
  g.freezeTokens = 1; g.freezesEarnedFor = 7;
  assert.equal(L.freezeEarn(g, TODAY), 0);          // already credited for 7
  g.freezeTokens = 2; g.freezesEarnedFor = 7;
  const g14 = { checkins: days(...Array.from({length:14},(_,i)=>-i)), freezeTokens: 2, freezesEarnedFor: 7 };
  assert.equal(L.freezeEarn(g14, TODAY), 0);        // at cap of 2
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
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '../www/logic.js'`

- [ ] **Step 3: Implement www/logic.js**

```js
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

  /* if exactly yesterday was missed, the streak before it is alive, and a
     token is held -> return yesterday's key to freeze, else null */
  function freezeSpendDay(g, todayKey) {
    if (!(g.freezeTokens > 0)) return null;
    const y = addDays(todayKey, -1);
    if (g.checkins[y]) return null;                 // yesterday fine
    if (!g.checkins[addDays(todayKey, -2)]) return null; // 2+ day gap: dead
    return y;
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
    const elapsed = Math.max(1, daysBetween(g.start, todayKey) + 1);
    return {
      totalCheckins: real,
      longestStreak: longestStreak(g.checkins),
      completionPct: Math.min(100, Math.round(real / elapsed * 100))
    };
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

  /* declarative plan; native.js turns it into plugin calls.
     id 1: daily repeating at settings.time
     id 2: last-chance repeating 21:30
     id 3: one-shot tomorrow 09:00, only if something is pending now */
  function notificationPlan(goals, settings, todayKey) {
    if (!settings.notif) return [];
    const pending = goals.filter(g => !g.checkins[todayKey]);
    const n = pending.length;
    const [h, m] = (settings.time || '20:00').split(':').map(Number);
    const plan = [
      {
        id: 1, on: { hour: h, minute: m },
        title: 'Focus Forge — check-in time',
        body: n > 0 ? `${n} goal${n > 1 ? 's' : ''} still need a check-in today. Keep the streak alive 🔥`
                    : 'Daily check-in time. Keep the streak alive 🔥'
      },
      {
        id: 2, on: { hour: 21, minute: 30 },
        title: 'Last chance today ⏰',
        body: 'Still unchecked goals. A 30-second check-in saves the streak.'
      }
    ];
    if (n > 0) {
      const names = pending.slice(0, 3).map(g => g.emoji + ' ' + g.title).join(', ');
      plan.push({
        id: 3, at: addDays(todayKey, 1) + 'T09:00',
        title: 'Streak at risk ⚠️',
        body: `Yesterday you missed: ${names}${n > 3 ? '…' : ''}. Check in today to recover.`
      });
    }
    return plan;
  }

  const FFLogic = { iso, parse, addDays, daysBetween, currentStreak, freezeSpendDay,
    freezeEarn, longestStreak, statsForGoal, weeklyCounts, notificationPlan };
  if (typeof module !== 'undefined' && module.exports) module.exports = FFLogic;
  else global.FFLogic = FFLogic;
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```powershell
git add -A; git commit -m "feat: pure logic module (streak, freeze, stats, notification plan) with tests"
```

---

### Task 3: Native bridge (notifications + haptics, browser fallback)

**Files:**
- Create: `www/native.js`

- [ ] **Step 1: Implement www/native.js**

```js
/* Bridge to Capacitor plugins. Every function is safe in a desktop
   browser: Capacitor is undefined there, web fallbacks run instead. */
(function (global) {
  const cap = () => global.Capacitor && global.Capacitor.Plugins;
  const LN = () => cap() && cap().LocalNotifications;
  const HAPTICS = () => cap() && cap().Haptics;

  async function ensurePermission() {
    if (!LN()) {  // browser fallback
      if ('Notification' in global && Notification.permission === 'default') {
        try { await Notification.requestPermission(); } catch (e) {}
      }
      return ('Notification' in global) && Notification.permission === 'granted';
    }
    let s = await LN().checkPermissions();
    if (s.display === 'prompt' || s.display === 'prompt-with-rationale') {
      s = await LN().requestPermissions();
    }
    return s.display === 'granted';
  }

  /* plan: output of FFLogic.notificationPlan */
  async function applyNotificationPlan(plan) {
    if (!LN()) return false; // browser: page-open setInterval reminder still works
    await LN().cancel({ notifications: [{ id: 1 }, { id: 2 }, { id: 3 }] });
    if (!plan.length) return true;
    const notifications = plan.map(p => ({
      id: p.id,
      title: p.title,
      body: p.body,
      schedule: p.on
        ? { on: p.on, allowWhileIdle: true }
        : { at: new Date(p.at), allowWhileIdle: true }
    }));
    await LN().schedule({ notifications });
    return true;
  }

  async function buzz() {
    try { if (HAPTICS()) await HAPTICS().impact({ style: 'MEDIUM' }); } catch (e) {}
  }

  function isNative() { return !!LN(); }

  global.FFNative = { ensurePermission, applyNotificationPlan, buzz, isNative };
})(window);
```

- [ ] **Step 2: Commit**

```powershell
git add www/native.js; git commit -m "feat: Capacitor bridge with browser fallbacks"
```

---

### Task 4: Wire logic + bridge into www/index.html

**Files:**
- Modify: `www/index.html`

All edits below are in `www/index.html`. The original file's functions remain except where replaced.

- [ ] **Step 1: Load the two scripts**

Before the existing `<script>` tag (line ~343), insert:
```html
<script src="logic.js"></script>
<script src="native.js"></script>
```

- [ ] **Step 2: Delegate date/streak helpers to FFLogic**

Replace the bodies of the existing helpers (keep the same names so the rest of the file is untouched):
```js
function iso(d){return FFLogic.iso(d)}
function parse(k){return FFLogic.parse(k)}
function daysBetween(a,b){return FFLogic.daysBetween(a,b)}
function currentStreak(g){return FFLogic.currentStreak(g.checkins,todayKey())}
```
Note: `FFLogic.iso` uses local time, fixing a latent bug — the original `toISOString()` is UTC and flips the date after ~18:30 IST.

- [ ] **Step 3: totalCheckins counts only real check-ins**

Replace:
```js
function totalCheckins(g){return Object.keys(g.checkins).filter(k=>g.checkins[k]===true).length}
```

- [ ] **Step 4: Freeze sync on boot + earn on check-in**

Add function (near `syncBadges`):
```js
function syncFreezes(){
  let changed=false;
  goals.forEach(g=>{
    g.freezeTokens=g.freezeTokens||0;
    g.freezesEarnedFor=g.freezesEarnedFor||0;
    const day=FFLogic.freezeSpendDay(g,todayKey());
    if(day){
      g.checkins[day]='frozen';
      g.freezeTokens--;
      changed=true;
      setTimeout(()=>toast('❄️',`Streak freeze used for "${g.title}" — chain saved!`),600);
    }
  });
  if(changed)save();
}
```
Call `syncFreezes();` in the boot section immediately BEFORE `syncBadges();`.

In `checkin(id)`, after `g.best=Math.max(...)`, add:
```js
const earned=FFLogic.freezeEarn(g,todayKey());
if(earned){g.freezeTokens=(g.freezeTokens||0)+earned;g.freezesEarnedFor=Math.floor(currentStreak(g)/7)*7;
  setTimeout(()=>toast('❄️','Streak freeze earned! Auto-protects one missed day.'),1800);}
```

- [ ] **Step 5: Show tokens on the card + frozen heatmap cells**

In `card()`, streak branch, append to `meta`:
```js
meta+=` · ❄ ${g.freezeTokens||0} freeze${(g.freezeTokens||0)===1?'':'s'}`;
```
In `heat()`, change the cell class logic to:
```js
if(g.checkins[k]==='frozen')cls+=' frz';else if(on)cls+=' lvl2';else if(!before)cls+=' lvl1';
```
Add CSS next to `.cell.lvl2`:
```css
.cell.frz{background:rgba(103,232,249,.75);box-shadow:0 0 8px rgba(103,232,249,.6)}
```

- [ ] **Step 6: Notification rescheduling hook**

Add and call everywhere state changes:
```js
async function rescheduleNotifs(){
  const plan=FFLogic.notificationPlan(goals,settings,todayKey());
  try{await FFNative.applyNotificationPlan(plan);}catch(e){}
}
```
Call `rescheduleNotifs()` at the end of: `checkin()`, `saveGoal()`, `delGoal()`, `saveSettings()`, the boot section, and on resume:
```js
document.addEventListener('visibilitychange',()=>{if(!document.hidden){syncFreezes();syncBadges();render();rescheduleNotifs();}});
```
In `saveSettings()`, replace the web-only permission request block with:
```js
if(on){const ok=await FFNative.ensurePermission();
  if(!ok)toast('🚫','Notifications blocked — allow them in system settings.');}
```
In `testNotif()`, when running natively, schedule a 5-second test instead of the web Notification:
```js
if(FFNative.isNative()){
  const ok=await FFNative.ensurePermission();
  if(!ok)return toast('🚫','Allow notifications first.');
  await Capacitor.Plugins.LocalNotifications.schedule({notifications:[{id:99,title:'Focus Forge test 🔔',body:'Notifications are working. Streaks are safe.',schedule:{at:new Date(Date.now()+5000)}}]});
  return toast('🔔','Test arrives in 5 seconds — close the app to prove it.');
}
```
Update the Settings hint text (line ~313) to:
```html
<p class="hint" style="margin-top:10px">📱 In the app, reminders fire even when the app is closed. In a browser, they only fire while the tab is open.</p>
```

- [ ] **Step 7: Haptic buzz on check-in**

First line of `checkin()` after the guard clauses: `FFNative.buzz();`

- [ ] **Step 8: Manual browser test**

Open `www/index.html` in a browser. Verify: goals render, check-in works, freeze count shows in meta line, no console errors (Capacitor absent → fallbacks silent).

- [ ] **Step 9: Commit**

```powershell
git add www/index.html; git commit -m "feat: wire freeze, native notifications, haptics into app"
```

---

### Task 5: Stats dashboard

**Files:**
- Modify: `www/index.html`

- [ ] **Step 1: Add header button**

Next to the Trophy Shelf button (line ~232):
```html
<button class="btn ghost" onclick="openStats()">📊 Stats</button>
```

- [ ] **Step 2: Add modal markup**

After the badges modal `</div>` (line ~296):
```html
<!-- stats modal -->
<div class="ov" id="statsOv">
  <div class="modal">
    <h3>📊 Stats</h3>
    <p class="hint">Real check-ins only — frozen days don't count here.</p>
    <div id="statsBody"></div>
    <label style="margin-top:18px">Check-ins per week (last 8 weeks)</label>
    <div class="weekchart" id="weekChart"></div>
    <div class="acts"><button class="btn" onclick="closeStats()">Done</button></div>
  </div>
</div>
```

- [ ] **Step 3: Add CSS**

```css
.srow{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.08)}
.srow .se{font-size:22px}.srow .sn{flex:1;font-weight:700;font-size:14px}
.srow .sv{font-size:12px;color:var(--muted2);text-align:right;line-height:1.5}
.weekchart{display:flex;align-items:flex-end;gap:6px;height:90px;margin-top:8px}
.weekchart .wb{flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:4px;height:100%}
.weekchart .wbar{width:100%;border-radius:6px 6px 0 0;background:linear-gradient(180deg,var(--accent2),var(--accent));min-height:3px;transition:height .6s cubic-bezier(.2,.8,.2,1)}
.weekchart .wl{font-size:10px;color:var(--muted2)}
```

- [ ] **Step 4: Add JS**

```js
function openStats(){
  const body=document.getElementById('statsBody');
  if(!goals.length){body.innerHTML='<p class="hint">No goals yet — nothing to count.</p>';}
  else body.innerHTML=goals.map(g=>{
    const s=FFLogic.statsForGoal(g,todayKey());
    return `<div class="srow"><span class="se">${g.emoji}</span>
      <span class="sn">${esc(g.title)}</span>
      <span class="sv">${s.completionPct}% complete<br>${s.totalCheckins} check-ins · best ${s.longestStreak}d</span></div>`;
  }).join('');
  const w=FFLogic.weeklyCounts(goals,todayKey(),8),mx=Math.max(1,...w);
  document.getElementById('weekChart').innerHTML=w.map((v,i)=>
    `<div class="wb"><div class="wbar" style="height:${Math.round(v/mx*78)}px" title="${v} check-ins"></div>
     <div class="wl">${i===7?'now':(7-i)+'w'}</div></div>`).join('');
  document.getElementById('statsOv').classList.add('show');
}
function closeStats(){document.getElementById('statsOv').classList.remove('show')}
```
Register backdrop/Esc close: add `['statsOv',closeStats]` to the modal array (line ~835) and `closeStats()` to the Escape handler.

- [ ] **Step 5: Manual browser test**

Open app, add goal, check in, open Stats. Verify rows + 8 bars render.

- [ ] **Step 6: Commit**

```powershell
git add www/index.html; git commit -m "feat: stats dashboard modal"
```

---

### Task 6: Sync, icon, splash, manifest

**Files:**
- Modify: `android/app/src/main/AndroidManifest.xml` (generated; one additive edit survives `cap sync`)
- Create: `resources/icon.png` (1024×1024)

- [ ] **Step 1: Generate icon**

Simple programmatic icon (flame on purple gradient) via PowerShell + .NET `System.Drawing`, saved to `resources/icon.png`, 1024×1024. Then:
```powershell
npm install -D @capacitor/assets
npx capacitor-assets generate --android
```
Expected: launcher icons + splash written into `android/app/src/main/res/`.

- [ ] **Step 2: Sync web code into android project**

```powershell
npx cap sync android
```
Expected: "Copying web assets... Sync finished".

- [ ] **Step 3: Commit**

```powershell
git add -A; git commit -m "feat: app icon, splash, android sync"
```

---

### Task 7: Build APK

**Files:** none modified — build only.

- [ ] **Step 1: Verify Android Studio + SDK installed** (user-side step; SDK lands in `%LOCALAPPDATA%\Android\Sdk` after first-run wizard)

- [ ] **Step 2: Point Gradle at the SDK + JDK and build**

```powershell
$env:JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"
"sdk.dir=$($env:LOCALAPPDATA -replace '\\','/')/Android/Sdk" | Out-File android\local.properties -Encoding ascii
cd android; .\gradlew.bat assembleDebug
```
Expected: `BUILD SUCCESSFUL`, APK at `android\app\build\outputs\apk\debug\app-debug.apk`.

- [ ] **Step 3: Copy APK somewhere obvious**

```powershell
Copy-Item android\app\build\outputs\apk\debug\app-debug.apk ..\FocusForge.apk
```

- [ ] **Step 4: Commit any config changes**

```powershell
git add -A; git commit -m "build: debug APK config"
```

---

### Task 8: Phone install + verification guide

**Files:**
- Create: `INSTALL.md` — step-by-step: transfer APK, enable unknown sources, install, grant notification permission, 2-minute closed-app notification test, freeze/stats walkthrough.

- [ ] **Step 1: Write INSTALL.md** (full text written at implementation time — covers: copy `FocusForge.apk` to phone via USB/Drive, tap → allow "install unknown apps", open app, allow notifications, Settings → reminder ON → time 2 min ahead → save → fully close app → wait for notification)

- [ ] **Step 2: Commit**

```powershell
git add INSTALL.md; git commit -m "docs: phone install and test guide"
```

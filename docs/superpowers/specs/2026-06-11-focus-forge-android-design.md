# Focus Forge — Android App Design

**Date:** 2026-06-11
**Status:** Approved by user
**Source:** `C:\Users\swain\focus-tracker.html` (single-file web habit tracker)

## Goal

Package the existing Focus Forge web app as an installable Android APK with
notifications that fire even when the app is fully closed, plus two new
features: streak freeze tokens and a stats dashboard.

## Approach (decided)

**Capacitor** wraps the existing HTML in a native Android shell.
Chosen over PWA/PWABuilder because only a native shell can schedule local
notifications that fire with the app closed, without any server.

- Data stays in `localStorage` inside the app's WebView. Fully offline.
- Existing export/import JSON backup is retained.
- Distribution: debug APK sideloaded onto the user's phone (no Play Store).

## Project structure

```
focus-forge-app/
  package.json            # npm project, Capacitor dependencies
  capacitor.config.json   # app id, name, webDir
  www/
    index.html            # the entire app (upgraded focus-tracker.html)
  android/                # generated native shell — never hand-edited
  resources/              # icon + splash source images
  docs/superpowers/specs/ # this document
```

## Feature 1: Native notifications (3-layer nudge system)

Plugin: `@capacitor/local-notifications`. Android's alarm system fires these;
the app does not need to be running.

Rescheduling happens on every app launch, resume, and check-in:

1. **Daily reminder** at user-set time (default 20:00).
   Text: "N goal(s) still need a check-in today."
   Cancelled for today when all goals are checked in; next day's is scheduled.
2. **Last-chance nudge** at 21:30 if goals remain unchecked.
   Same cancel-on-complete logic.
3. **Morning-after alert** at 09:00 the next day, scheduled from the current
   day's state: "Yesterday you missed <goal> — streak at risk. Check in today."
   Only scheduled if goals are currently unchecked.

**Known limitation (accepted):** notification text is fixed at scheduling
time. If the app is not opened for several days, alarms still fire daily but
text reflects the last known state. Unfixable without a server.

Permission: Android 13+ runtime notification permission requested on first
launch via the plugin. The in-app web `Notification` API code is replaced by
the plugin calls; the web fallback remains for browser testing.

## Feature 2: Streak freeze ❄

- Earn 1 token per 7 consecutive check-in days. Maximum 2 held per goal.
- On app open: if exactly yesterday was missed, streak before it was alive,
  and a token is available → auto-spend: yesterday is recorded as `"frozen"`
  in `checkins` (vs `true` for real check-ins), token count decremented.
- Frozen days count as streak-continuation but not as real check-ins in stats.
- Heatmap renders frozen cells blue; goal card shows ❄ token count.
- Data: `g.freezeTokens` (number), `g.freezesEarnedFor` (highest streak length
  already credited, prevents double-earning).

## Feature 3: Stats dashboard 📊

New modal opened from header button:

- Per goal: completion % (real check-ins ÷ days since start), total
  check-ins, longest streak ever.
- Overall: bar chart of total check-ins per week for the last 8 weeks,
  rendered with plain CSS bars. No charting library.

## Free native extras

- Haptic buzz on check-in (`@capacitor/haptics`).
- App icon + splash screen from `resources/`.
- Fullscreen (no browser chrome).

## Build & install flow (user's machine: Windows 11, Node v24 present)

1. Install Android Studio (winget) → first-run wizard installs Android SDK.
2. `npm install` → `npx cap add android` → `npx cap sync`.
3. Build: `android\gradlew.bat assembleDebug` with `JAVA_HOME` pointed at
   Android Studio's bundled JDK. Output: `app-debug.apk`.
4. Copy APK to phone, enable "install unknown apps", tap to install.

## Testing

- All logic (streaks, freeze, stats, scheduling decisions) testable in a
  desktop browser; plugin calls are guarded so the page still runs on PC.
- Notification end-to-end test on the phone: set reminder 2 minutes ahead,
  fully close the app, confirm the notification fires.

## Out of scope

- Play Store publishing, release signing.
- Server push notifications.
- Per-goal reminder times, check-in notes (declined by user).
- Home-screen widget.

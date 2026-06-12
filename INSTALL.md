# Installing Focus Forge on your Android phone

## 1. Get the APK onto the phone

The build produces `FocusForge.apk` in this folder. Move it to your phone any way you like:

- **USB cable:** plug phone in, choose "File transfer" on the phone, copy the APK to the Download folder.
- **Google Drive:** upload the APK, open Drive on the phone, download it.
- **Email it to yourself** and open the attachment.

## 2. Install it

1. On the phone, open the **Files** app → find `FocusForge.apk` → tap it.
2. Android will warn: *"For your security, your phone is not allowed to install unknown apps from this source."* Tap **Settings** → enable **Allow from this source**. This is normal for any app installed outside the Play Store.
3. Go back and tap **Install**.
4. If Play Protect asks "scan app?" — either choice works; the app contains only your own tracker.

## 3. First launch

1. Open **Focus Forge** — your goals start fresh on the phone (use Settings → Import JSON to bring data from the PC version; export it from the browser first).
2. The app asks **"Allow Focus Forge to send you notifications?"** → **Allow**. Without this, no reminders.

## 4. Prove the closed-app reminder works (2 minutes)

1. Open **Settings ⚙️** in the app.
2. Daily reminder **On**, set "Remind me at" to **2 minutes from now**, tap **Save**.
3. Tap **Send test notification** → close the app **fully** (swipe it away from Recents).
4. Within ~5 seconds the test notification appears. At the set time, the daily reminder appears too — with the app closed. That's the native notification system working.

## What the reminders do

| When | What |
|------|------|
| Your set time (default 20:00) | "N goals still need a check-in today" — skipped if you already checked everything in |
| 21:30 | Last-chance nudge if something is still unchecked |
| 09:00 next morning | "Yesterday you missed: …" — only if you actually missed |

## New features

- **❄ Streak freeze:** every 7-day streak earns a freeze token (max 2). Miss a single day and a token is spent automatically — the chain survives. The frozen day shows blue in the heatmap.
- **📊 Stats:** button in the header — completion %, total check-ins, longest streak per goal, and a weekly bar chart.
- **🎵 Notification tones (v1.1):** Settings → "Notification tones" — each of the three reminders (daily / last-chance / morning) can have its own sound: System default, Chime, Urgent beeps, Soft tone, Digital, or **My music** — pick any audio file from your phone with "My music 🎵" and it becomes the notification sound. Each reminder type also has a distinct vibration pattern.

## ⚠️ Reminders not arriving when the app is closed?

Three things to check, in order:

1. **Exact reminders (Android 12+, blocked by default on Android 14+).**
   Open the app → Settings ⚙️ → if you see *"Exact reminders blocked"*, tap **Allow now** and flip the switch (*Alarms & reminders → Allow*). Without this, Android delays reminders by hours or skips them entirely. The app also warns you on launch if this is off.

2. **Battery optimization.**
   Android Settings → Apps → Focus Forge → **Battery → Unrestricted**. On Xiaomi/Oppo/Vivo/OnePlus also enable **Autostart** for the app and "lock" it in the recent-apps screen (pull down on its card) so swiping other apps away doesn't kill its alarms.

3. **Do Not Disturb / notification channel.**
   Check the notification isn't silenced: Android Settings → Apps → Focus Forge → Notifications → all channels enabled, sound on.

After changing any of these, open the app once so it reschedules everything.

## Publishing to the Play Store

### Prerequisites

| Item | Where |
|------|-------|
| Google Play Developer account | play.google.com/console → "Get started" → $25 one-time fee |
| `FocusForge-release.aab` | Already built — lives in the project root |
| Keystore file | `android/focus-forge.jks` — **back this up now**; losing it means you can never update the app |
| Privacy policy URL | Required even for offline apps — see below |

### Step 1 — Create developer account

1. Go to **play.google.com/console** → click "Get started".
2. Sign in with your Google account, pay $25.
3. Fill in developer name, email, phone, address.
4. Identity verification takes 2–7 days — do this first.

### Step 2 — Write a privacy policy

Focus Forge stores everything locally; it never sends data to a server. Still required by Google.

Create a GitHub Gist (gist.github.com) or a GitHub Pages file with this text:

```
Privacy Policy for Focus Forge

Focus Forge does not collect, store, or transmit any personal data.
All habit tracking data is stored locally on your device and never leaves it.

Contact: swainatul94@gmail.com
```

Make it public. Copy its URL — you will paste it in several places.

### Step 3 — Create the app in Play Console

1. Play Console → **Create app**.
2. App name: **Focus Forge** | Default language: **English (UK or US)** | App: ✓ | Free: ✓.
3. Tick both declarations → **Create app**.

### Step 4 — Fill the store listing

Navigate to **Dashboard → Store presence → Main store listing**.

| Field | Value |
|-------|-------|
| App name | Focus Forge |
| Short description | Daily habit tracker with streak freezes and reminders (≤80 chars) |
| Full description | Track daily habits, protect streaks with freeze tokens, and get smart reminders — all offline, no account needed. |
| App icon | 512×512 PNG — resize `resources/icon.png` to 512×512 |
| Feature graphic | 1024×500 PNG — a simple banner (solid colour + app name is fine) |
| Phone screenshots | At least 2 screenshots from the app; min 320px short side |
| Privacy policy | Paste the URL from Step 2 |

### Step 5 — Content rating

Dashboard → **Policy → App content → Content ratings** → Start questionnaire.
Answer honestly (habit tracker = no violence, no ads, no user interaction) → all ratings will be low. Takes ~5 minutes.

### Step 6 — Upload the release

1. Dashboard → **Production → Releases → Create new release**.
2. Under "App bundles", upload **`FocusForge-release.aab`**.
3. Release name: `1.0` | Release notes: `Initial release`.
4. **Save → Review release → Roll out to production (100%)**.

Google reviews new apps in 1–7 days. You will get an email when it goes live.

---

## Updating the app later

### Quick sideload (debug APK, phone only)

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
npm run sync     # cap sync + re-applies manifest/sound patches
cd android
.\gradlew.bat assembleDebug
```

Copy `android\app\build\outputs\apk\debug\app-debug.apk` to the phone and install over the old one (data is kept).

### Play Store update (release AAB)

> Requires the keystore file to still be at `android\focus-forge.jks`.
> If you deleted the `android\` folder, see **Restoring the signing config** below.

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
npm run sync     # cap sync + re-applies manifest/sound patches
cd android
.\gradlew.bat bundleRelease
```

Output: `android\app\build\outputs\bundle\release\app-release.aab`

Bump `versionCode` and `versionName` in `android\app\build.gradle` before each Play Store upload — Google rejects a lower or equal versionCode.

Upload the AAB in Play Console → Production → Create new release.

---

## Restoring the signing config after `npx cap add android`

If the `android\` folder is ever deleted and regenerated:

1. Run `npm run sync` — this re-applies the SCHEDULE_EXACT_ALARM permission, copies the notification tones into `res/raw`, and fixes `file_paths.xml` automatically.
2. Re-set `versionCode` / `versionName` in `android\app\build.gradle` (current: 2 / "1.1").
3. Recreate the two signing files below.

**`android\keystore.properties`** (create this file — use the passwords from your secure backup):
```properties
storeFile=../focus-forge.jks
storePassword=YOUR_STORE_PASSWORD
keyAlias=focusforge
keyPassword=YOUR_KEY_PASSWORD
```
> The actual passwords are stored in your password manager / secure backup — never commit them to git.

**`android\app\build.gradle`** — add these blocks (after `apply plugin` line and inside `android {}`):

```groovy
// After "apply plugin: 'com.android.application'"
def keystorePropertiesFile = rootProject.file("keystore.properties")
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}

// Inside android { } — before defaultConfig
signingConfigs {
    release {
        storeFile file(keystoreProperties['storeFile'])
        storePassword keystoreProperties['storePassword']
        keyAlias keystoreProperties['keyAlias']
        keyPassword keystoreProperties['keyPassword']
    }
}

// Inside buildTypes { release { } — add:
signingConfig signingConfigs.release
```

The keystore itself (`android\focus-forge.jks`) must also be present — copy it back from your backup.

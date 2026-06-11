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

## Updating the app later

Edit `www/index.html` on the PC, then:

```powershell
npx cap sync android
cd android
.\gradlew.bat assembleDebug
```

Copy the new APK to the phone and install over the old one (data is kept).

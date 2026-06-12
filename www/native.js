/* Bridge to Capacitor plugins. Every function is safe in a desktop
   browser: Capacitor is undefined there, web fallbacks run instead. */
(function (global) {
  const cap = () => global.Capacitor && global.Capacitor.Plugins;
  const LN = () => cap() && cap().LocalNotifications;
  const HAPTICS = () => cap() && cap().Haptics;
  const NS = () => cap() && cap().NotificationSound; // local plugin (plugins/notification-sound)

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

  /* Android 12+: without the exact-alarm setting, reminders are scheduled as
     inexact alarms that Doze can delay for hours (or past the day entirely).
     Android 14+ denies it by default — the user must flip one switch. */
  async function exactAlarmStatus() {
    if (!LN() || !LN().checkExactNotificationSetting) return 'unknown';
    try { return (await LN().checkExactNotificationSetting()).exact_alarm; }
    catch (e) { return 'unknown'; }
  }

  /* opens the system "Alarms & reminders" page for this app */
  async function requestExactAlarms() {
    if (!LN() || !LN().changeExactNotificationSetting) return 'unknown';
    try { return (await LN().changeExactNotificationSetting()).exact_alarm; }
    catch (e) { return 'unknown'; }
  }

  /* specs: output of FFLogic.channelSpecs. Creates the current ff_* channels,
     deletes stale versions (channel sound is immutable, so sound changes
     arrive as new channel ids). */
  async function ensureChannels(specs) {
    if (!LN()) return false;
    try {
      const { channels } = await LN().listChannels();
      const keep = new Set(specs.map(s => s.id));
      for (const c of channels || []) {
        if (/^ff_/.test(c.id) && !keep.has(c.id)) {
          try { await LN().deleteChannel({ id: c.id }); } catch (e) {}
        }
      }
    } catch (e) {}
    for (const s of specs) {
      try {
        if (NS()) {
          await NS().createChannel(s); // supports soundUri + vibration patterns
        } else {
          await LN().createChannel({ id: s.id, name: s.name, importance: s.importance,
            sound: s.soundName, vibration: true });
        }
      } catch (e) {}
    }
    return true;
  }

  /* file: a File from <input type=file accept="audio/*">. Returns the
     content:// uri to use as a channel sound, or null on desktop. */
  async function importCustomSound(file, previousUri) {
    if (!NS()) return null;
    if (file.size > 10 * 1024 * 1024) throw new Error('File too big — pick one under 10 MB.');
    const b64 = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result).split(',')[1]);
      r.onerror = () => rej(r.error || new Error('read failed'));
      r.readAsDataURL(file);
    });
    const safe = (file.name || 'custom.mp3').replace(/[^a-zA-Z0-9._-]/g, '_');
    const { uri } = await NS().importSound({
      data: b64,
      fileName: 'FocusForge_' + safe,
      mimeType: file.type || 'audio/mpeg',
      previousUri: previousUri || null
    });
    return uri;
  }

  async function openAppSettings() {
    if (NS()) try { await NS().openAppSettings(); } catch (e) {}
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
      channelId: p.channelId,
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

  global.FFNative = { ensurePermission, applyNotificationPlan, buzz, isNative,
    exactAlarmStatus, requestExactAlarms, ensureChannels, importCustomSound, openAppSettings };
})(window);

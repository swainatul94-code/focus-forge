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

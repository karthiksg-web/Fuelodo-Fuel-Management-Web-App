// ============================================
// FuelOdo - Notifications System v2
// Fixed: undefined is OVERDUE bug (reminder.type → reminder.serviceType)
// Fixed: severity label mapping (alert → Critical)
// Added: null-safe guards throughout
// ============================================

const NotificationSystem = (() => {
  let unsubscribeListener = null;
  let notificationsCache = [];

  // ── Initialize: listen to Firestore & setup UI ──
  function init() {
    const uid = getCurrentUid();
    if (!uid) return;
    setupBellListener(uid);
    setupDropdownUI();
  }

  // ── Firestore realtime listener ──
  function setupBellListener(uid) {
    if (unsubscribeListener) unsubscribeListener();

    unsubscribeListener = db
      .collection('users').doc(uid)
      .collection('notifications')
      .orderBy('timestamp', 'desc')
      .limit(30)
      .onSnapshot(snapshot => {
        notificationsCache = [];
        snapshot.forEach(doc => {
          notificationsCache.push({ id: doc.id, ...doc.data() });
        });
        renderNotifications();
        updateBadge();
      }, err => {
        console.warn('[Notifications] Listener error:', err);
      });

    if (AppState && AppState.listeners) {
      AppState.listeners.push(unsubscribeListener);
    }
  }

  // ── Render notification items in dropdown ──
  function renderNotifications() {
    const list = document.getElementById('notificationList');
    if (!list) return;

    if (notificationsCache.length === 0) {
      list.innerHTML = `
        <div class="notif-empty">
          <span style="font-size:2rem;">🔔</span>
          <p>No notifications yet</p>
        </div>`;
      return;
    }

    list.innerHTML = notificationsCache.map(n => {
      // Safe fallbacks for all fields
      const severity = n.severity || 'info';
      const message = n.message || 'New notification';
      const icon = getSeverityIcon(severity);
      const cls = getSeverityClass(severity);
      const label = getSeverityLabel(severity);
      const ts = n.timestamp?.toDate ? formatRelativeTime(n.timestamp.toDate()) : '';
      return `
        <div class="notif-item ${n.read ? '' : 'unread'} ${cls}" data-id="${n.id}" onclick="NotificationSystem.markRead('${n.id}')">
          <div class="notif-item-icon">${icon}</div>
          <div class="notif-item-body">
            <div class="notif-item-msg">${message}</div>
            <div class="notif-item-meta">
              <span class="notif-severity-badge ${cls}">${label}</span>
              <span class="notif-time">${ts}</span>
            </div>
          </div>
          ${!n.read ? '<div class="notif-dot"></div>' : ''}
        </div>`;
    }).join('');
  }

  // ── Update bell badge count ──
  function updateBadge() {
    const badge = document.getElementById('notifBadge');
    if (!badge) return;
    const unread = notificationsCache.filter(n => !n.read).length;
    badge.textContent = unread > 9 ? '9+' : unread;
    badge.style.display = unread > 0 ? 'flex' : 'none';
  }

  // ── Dropdown UI event bindings ──
  function setupDropdownUI() {
    const bellBtn = document.getElementById('bellBtn');
    const dropdown = document.getElementById('notifDropdown');
    const markAllBtn = document.getElementById('notifMarkAllRead');

    if (!bellBtn || !dropdown) return;

    bellBtn.addEventListener('click', e => {
      e.stopPropagation();
      const isOpen = dropdown.classList.contains('open');
      const profileDd = document.getElementById('profileDropdown');
      if (profileDd) profileDd.style.display = 'none';
      dropdown.classList.toggle('open', !isOpen);
    });

    document.addEventListener('click', e => {
      if (!dropdown.contains(e.target) && !bellBtn.contains(e.target)) {
        dropdown.classList.remove('open');
      }
    });

    if (markAllBtn) {
      markAllBtn.addEventListener('click', markAllRead);
    }
  }

  // ── Mark individual notification as read ──
  async function markRead(notifId) {
    const uid = getCurrentUid();
    if (!uid || !notifId) return;
    try {
      await db.collection('users').doc(uid)
        .collection('notifications').doc(notifId)
        .update({ read: true });
    } catch (e) {
      console.warn('[Notifications] markRead error:', e);
    }
  }

  // ── Mark all as read ──
  async function markAllRead() {
    const uid = getCurrentUid();
    if (!uid) return;
    const unread = notificationsCache.filter(n => !n.read);
    if (unread.length === 0) return;
    const batch = db.batch();
    unread.forEach(n => {
      const ref = db.collection('users').doc(uid).collection('notifications').doc(n.id);
      batch.update(ref, { read: true });
    });
    try {
      await batch.commit();
    } catch (e) {
      console.warn('[Notifications] markAllRead error:', e);
    }
  }

  // ── Create a notification in Firestore ──
  async function createNotification({ type, message, severity = 'info' }) {
    const uid = getCurrentUid();
    if (!uid || !type || !message) return;

    // Prevent duplicate same-type notifications within 24h
    const recent = notificationsCache.find(n => {
      if (n.type !== type) return false;
      const ts = n.timestamp?.toDate ? n.timestamp.toDate() : new Date();
      return (Date.now() - ts.getTime()) < 86400000; // 24h
    });
    if (recent) return;

    try {
      await db.collection('users').doc(uid).collection('notifications').add({
        type,
        message,
        severity,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        read: false
      });
    } catch (e) {
      console.warn('[Notifications] createNotification error:', e);
    }
  }

  // ── Auto-trigger engine (called after new fuel entry) ──
  async function runAlertEngine(vehicleId) {
    const uid = getCurrentUid();
    if (!uid || !vehicleId) return;

    const logs = AppState.allFuelLogs.filter(l => l.vehicleId === vehicleId);
    if (logs.length < 2) return;

    const sorted = [...logs].sort((a, b) => {
      const da = a.date?.toDate ? a.date.toDate().getTime() : new Date(a.date).getTime();
      const db2 = b.date?.toDate ? b.date.toDate().getTime() : new Date(b.date).getTime();
      return da - db2;
    });

    const mileages = [];
    const costs = [];

    for (let i = 1; i < sorted.length; i++) {
      // Skip partial fills for mileage calc
      if (sorted[i].isFullTank === false) continue;
      const dist = (sorted[i].odometer || 0) - (sorted[i - 1].odometer || 0);
      if (dist > 0) {
        mileages.push(dist / (sorted[i].liters || 1));
        costs.push(sorted[i].totalCost || 0);
      }
    }

    if (mileages.length === 0) return;

    const avgMileage = mileages.reduce((s, v) => s + v, 0) / mileages.length;
    const avgCost = costs.reduce((s, v) => s + v, 0) / costs.length;
    const lastMileage = mileages[mileages.length - 1];
    const lastCost = costs[costs.length - 1];

    const vehicle = AppState.vehicles.find(v => v.id === vehicleId);
    const vName = vehicle?.name || 'your vehicle';

    if (lastMileage < avgMileage * 0.8) {
      await createNotification({
        type: `low_mileage_${vehicleId}`,
        message: `⚠️ Low mileage on ${vName}! Latest: ${lastMileage.toFixed(1)} km/L vs avg ${avgMileage.toFixed(1)} km/L.`,
        severity: 'warning'
      });
    }

    if (lastCost > avgCost * 1.2) {
      await createNotification({
        type: `high_cost_${vehicleId}`,
        message: `🚨 Fuel cost spiked on ${vName}! Last fill-up: ₹${lastCost.toFixed(0)} vs avg ₹${avgCost.toFixed(0)}.`,
        severity: 'critical'
      });
    }
  }

  // ── Check upcoming service reminders & notify ──
  // FIX: was using reminder.type — correct field is reminder.serviceType
  async function checkReminderNotifications(reminders) {
    for (const reminder of reminders) {
      if (!reminder || !reminder.vehicleId) continue;

      const vehicle = AppState.vehicles.find(v => v.id === reminder.vehicleId);
      const vName = vehicle?.name || 'your vehicle';

      // FIX: use serviceType (correct Firestore field), not reminder.type
      const serviceLabel = reminder.serviceType || reminder.type || 'Service';

      const vLogs = AppState.allFuelLogs.filter(l => l.vehicleId === reminder.vehicleId);
      if (vLogs.length === 0) continue;

      const sorted = [...vLogs].sort((a, b) => (b.odometer || 0) - (a.odometer || 0));
      const currentOdo = sorted[0].odometer || 0;
      const lastKm = Number(reminder.lastServiceKm) || 0;
      const intervalKm = Number(reminder.intervalKm) || 0;
      const nextService = lastKm + intervalKm;
      const remaining = nextService - currentOdo;

      if (remaining <= 500 && remaining >= 0) {
        await createNotification({
          type: `reminder_${reminder.id}`,
          message: `🔔 ${serviceLabel} due soon on ${vName}! ${remaining} km remaining.`,
          severity: 'info'
        });
      } else if (remaining < 0) {
        await createNotification({
          type: `reminder_overdue_${reminder.id}`,
          // FIX: was "undefined is OVERDUE" — now uses correct serviceLabel
          message: `🚨 ${serviceLabel} is OVERDUE on ${vName} by ${Math.abs(remaining).toLocaleString()} km!`,
          severity: 'critical'
        });
      }
    }
  }

  // ── Helpers ──
  function getSeverityIcon(severity) {
    const map = { info: 'ℹ️', warning: '⚠️', critical: '🚨', alert: '🚨', success: '✅' };
    return map[severity] || 'ℹ️';
  }

  function getSeverityClass(severity) {
    // Normalize 'alert' → 'critical' for consistent styling
    const normalized = severity === 'alert' ? 'critical' : (severity || 'info');
    const map = { info: 'notif-info', warning: 'notif-warning', critical: 'notif-critical', success: 'notif-success' };
    return map[normalized] || 'notif-info';
  }

  // FIX: map severity keys to human-readable labels (was showing raw 'alert' string)
  function getSeverityLabel(severity) {
    const map = { info: 'Info', warning: 'Warning', critical: 'Critical', alert: 'Critical', success: 'Success' };
    return map[severity] || 'Info';
  }

  function formatRelativeTime(date) {
    if (!date) return '';
    const diff = Date.now() - date.getTime();
    const mins = Math.floor(diff / 60000);
    const hrs = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    if (hrs < 24) return `${hrs}h ago`;
    return `${days}d ago`;
  }

  // ── FCM Push (Browser Push Notifications) ──
  async function requestPushPermission() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') return;
    if (Notification.permission === 'denied') return;
    await Notification.requestPermission();
  }

  // ── Public API ──
  return {
    init,
    markRead,
    markAllRead,
    createNotification,
    runAlertEngine,
    checkReminderNotifications,
    requestPushPermission
  };
})();

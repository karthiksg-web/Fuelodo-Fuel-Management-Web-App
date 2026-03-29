// ============================================
// FuelOdo - Service Reminders
// ============================================

(function() {
  document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('reminderModal');
    const form = document.getElementById('reminderForm');

    // Open modal
    document.getElementById('addReminderBtn').addEventListener('click', () => openReminderModal());
    document.getElementById('addReminderEmptyBtn').addEventListener('click', () => openReminderModal());

    // Close modal
    document.getElementById('reminderModalClose').addEventListener('click', () => modal.classList.remove('active'));
    document.getElementById('reminderCancelBtn').addEventListener('click', () => modal.classList.remove('active'));
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('active'); });

    function openReminderModal() {
      form.reset();
      modal.classList.add('active');
    }

    // Save reminder
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const uid = getCurrentUid();
      if (!uid) return;

      const vehicleId = document.getElementById('reminderVehicleSelect').value;
      const serviceType = document.getElementById('reminderType').value.trim();
      const intervalKm = parseInt(document.getElementById('reminderKm').value);
      const lastServiceKm = parseInt(document.getElementById('reminderLastKm').value);

      if (!vehicleId) {
        showToast('Please select a vehicle', 'error');
        return;
      }

      try {
        await db.collection('users').doc(uid).collection('reminders').add({
          vehicleId,
          serviceType,
          intervalKm,
          lastServiceKm,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        modal.classList.remove('active');
        showToast('Reminder added!', 'success');
        loadReminders();
      } catch (err) {
        console.error('Save reminder error:', err);
        showToast('Failed to save reminder', 'error');
      }
    });

    // Delete reminder
    window.deleteReminder = async function(reminderId) {
      if (!confirm('Delete this reminder?')) return;
      const uid = getCurrentUid();
      if (!uid) return;

      try {
        await db.collection('users').doc(uid).collection('reminders').doc(reminderId).delete();
        showToast('Reminder deleted', 'success');
        loadReminders();
      } catch (err) {
        showToast('Failed to delete', 'error');
      }
    };
  });

  // ── Load Reminders ──
  window.loadReminders = async function() {
    const uid = getCurrentUid();
    if (!uid) return;

    const container = document.getElementById('remindersList');
    const emptyState = document.getElementById('remindersEmpty');

    try {
      const snap = await db.collection('users').doc(uid).collection('reminders')
        .orderBy('createdAt', 'desc').get();

      if (snap.empty) {
        container.innerHTML = '';
        container.appendChild(emptyState);
        emptyState.style.display = '';
        return;
      }

      emptyState.style.display = 'none';
      let html = '';

      snap.forEach(doc => {
        const r = doc.data();
        const vehicle = AppState.vehicles.find(v => String(v.id) === String(r.vehicleId));
        const vName = vehicle ? vehicle.name : 'Unknown Vehicle';

        // Get latest odometer for this vehicle
        let vLogs = AppState.allFuelLogs.filter(l => l.vehicleId === r.vehicleId);
        if (window.sortLogsAsc) window.sortLogsAsc(vLogs);
        else vLogs.sort((a, b) => {
          const da = a.date?.toDate ? a.date.toDate().getTime() : new Date(a.date).getTime();
          const db2 = b.date?.toDate ? b.date.toDate().getTime() : new Date(b.date).getTime();
          return da - db2;
        });

        let currentOdo = vLogs.length > 0 ? (Number(vLogs[vLogs.length - 1].odometer) || 0) : 0;
        const lastKm = Number(r.lastServiceKm) || 0;
        const interval = Number(r.intervalKm) || 0;
        
        currentOdo = Math.max(currentOdo, lastKm);
        const nextServiceKm = lastKm + interval;
        const kmRemaining = nextServiceKm - currentOdo;
        const isDue = kmRemaining <= 0;
        const isNear = kmRemaining > 0 && kmRemaining <= 500;

        let statusBadge = '';
        let borderColor = 'var(--accent-500)';
        if (isDue) {
          statusBadge = '<span class="badge badge-danger">⚠️ OVERDUE</span>';
          borderColor = 'var(--danger-500)';
        } else if (isNear) {
          statusBadge = '<span class="badge badge-warning">⏰ Due Soon</span>';
          borderColor = 'var(--warning-500)';
        } else {
          statusBadge = '<span class="badge badge-success">✅ OK</span>';
        }

        html += `
          <div class="card slide-up" style="margin-bottom:var(--space-4);border-left:4px solid ${borderColor};">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;">
              <div>
                <div style="display:flex;align-items:center;gap:var(--space-3);margin-bottom:var(--space-2);">
                  <span style="font-size:1.3rem;">🔧</span>
                  <strong style="font-family:var(--font-heading);">${r.serviceType}</strong>
                  ${statusBadge}
                </div>
                <div style="font-size:var(--text-sm);color:var(--text-secondary);margin-bottom:var(--space-1);">
                  <strong>${vName}</strong> · Every ${r.intervalKm.toLocaleString()} km
                </div>
                <div style="font-size:var(--text-sm);color:var(--text-secondary);">
                  Last service: ${lastKm.toLocaleString()} km · 
                  Next: ${nextServiceKm.toLocaleString()} km · 
                  ${isDue ? `<span style="color:var(--danger-500);font-weight:600;">Overdue by ${Math.abs(kmRemaining).toLocaleString()} km</span>` :
                    `<span>${kmRemaining.toLocaleString()} km left to service</span>`}
                </div>
              </div>
              <button class="btn btn-ghost btn-icon btn-sm" onclick="deleteReminder('${doc.id}')" title="Delete">🗑️</button>
            </div>
          </div>
        `;
      });

      container.innerHTML = html;
    } catch (err) {
      console.error('Load reminders error:', err);
    }
  };
})();

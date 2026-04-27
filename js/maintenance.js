// ============================================
// FuelOdo - Maintenance Log Module
// Fields: vehicleId, serviceType, cost, date, notes
// Firestore: users/{uid}/maintenanceLogs/{id}
// ============================================

(function() {
  document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('maintenanceModal');
    const form = document.getElementById('maintenanceForm');
    if (!modal || !form) return;

    // Open modal buttons
    const openBtns = [
      document.getElementById('addMaintenanceBtn'),
      document.getElementById('addMaintenanceQuickBtn')
    ];
    openBtns.forEach(btn => {
      if (btn) btn.addEventListener('click', () => {
        form.reset();
        document.getElementById('maintDate').value = new Date().toISOString().split('T')[0];
        modal.classList.add('active');
      });
    });

    // Close modal
    document.getElementById('maintenanceModalClose')?.addEventListener('click', () => modal.classList.remove('active'));
    document.getElementById('maintenanceCancelBtn')?.addEventListener('click', () => modal.classList.remove('active'));
    modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('active'); });

    // Save maintenance entry
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const uid = getCurrentUid();
      if (!uid) return;

      const vehicleId = document.getElementById('maintVehicleSelect').value;
      const serviceType = document.getElementById('maintServiceType').value.trim();
      const cost = parseFloat(document.getElementById('maintCost').value);
      const date = new Date(document.getElementById('maintDate').value);
      const notes = document.getElementById('maintNotes')?.value?.trim() || '';

      if (!vehicleId) { showToast('Please select a vehicle', 'error'); return; }
      if (!serviceType) { showToast('Please enter a service type', 'error'); return; }
      if (!cost || cost <= 0) { showToast('Please enter a valid cost', 'error'); return; }

      const btn = form.querySelector('button[type="submit"]');
      const originalText = btn.innerHTML;
      btn.innerHTML = '<span class="spinner-small"></span> Saving...';
      btn.disabled = true;

      try {
        await db.collection('users').doc(uid).collection('maintenanceLogs').add({
          vehicleId,
          vehicleName: AppState.vehicles.find(v => v.id === vehicleId)?.name || '',
          serviceType,
          cost,
          date,
          notes,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        modal.classList.remove('active');
        showToast('✅ Maintenance entry saved!', 'success');
        // Reload maintenance data
        loadMaintenanceLogs();
      } catch (err) {
        console.error('Save maintenance error:', err);
        showToast('Failed to save maintenance entry', 'error');
      } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
      }
    });
  });

  // ── Load maintenance logs into AppState ──
  window.loadMaintenanceLogs = function() {
    const uid = getCurrentUid();
    if (!uid) return;

    return db.collection('users').doc(uid).collection('maintenanceLogs')
      .orderBy('date', 'desc')
      .get()
      .then(snap => {
        AppState.allMaintenanceLogs = [];
        snap.forEach(doc => {
          AppState.allMaintenanceLogs.push({ id: doc.id, ...doc.data() });
        });

        // Refresh dashboard if active
        const hash = window.location.hash.replace('#', '') || 'dashboard';
        if (hash === 'dashboard' && typeof initDashboard === 'function') initDashboard();
      })
      .catch(err => console.error('Load maintenance logs error:', err));
  };
})();

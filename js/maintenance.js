// ============================================
// FuelOdo - Maintenance Log Module v2
// Features: Add / Edit / Delete / Records List
// Firestore: users/{uid}/maintenanceLogs/{id}
// ============================================

(function() {
  let editingId = null; // null = adding new, string = editing existing

  document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('maintenanceModal');
    const form  = document.getElementById('maintenanceForm');
    const modalTitle = document.getElementById('maintenanceModalTitle');
    if (!modal || !form) return;

    // ── Open ADD modal ──
    const openBtns = [
      document.getElementById('addMaintenanceBtn'),
      document.getElementById('addMaintenanceQuickBtn'),
      document.getElementById('addMaintenanceEmptyBtn')
    ];
    openBtns.forEach(btn => {
      if (btn) btn.addEventListener('click', () => openModal());
    });

    // ── Close modal ──
    document.getElementById('maintenanceModalClose')?.addEventListener('click', closeModal);
    document.getElementById('maintenanceCancelBtn')?.addEventListener('click', closeModal);
    modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

    function openModal(record = null) {
      form.reset();
      editingId = record ? record.id : null;
      if (modalTitle) modalTitle.textContent = record ? '✏️ Edit Maintenance' : '🔧 Log Maintenance';

      document.getElementById('maintDate').value = record
        ? toDateInput(record.date)
        : new Date().toISOString().split('T')[0];

      if (record) {
        document.getElementById('maintVehicleSelect').value = record.vehicleId || '';
        document.getElementById('maintServiceType').value  = record.serviceType || '';
        document.getElementById('maintCost').value         = record.cost || '';
        document.getElementById('maintNotes').value        = record.notes || '';
        // Add items list if it exists
        const itemsEl = document.getElementById('maintItems');
        if (itemsEl) itemsEl.value = (record.items || []).join('\n');
      }

      modal.classList.add('active');
    }

    function closeModal() {
      modal.classList.remove('active');
      editingId = null;
    }

    // ── Save (Add or Edit) ──
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const uid = getCurrentUid();
      if (!uid) return;

      const vehicleId   = document.getElementById('maintVehicleSelect').value;
      const serviceType = document.getElementById('maintServiceType').value.trim();
      const cost        = parseFloat(document.getElementById('maintCost').value);
      const date        = new Date(document.getElementById('maintDate').value);
      const notes       = document.getElementById('maintNotes')?.value?.trim() || '';
      const itemsRaw    = document.getElementById('maintItems')?.value?.trim() || '';
      const items       = itemsRaw ? itemsRaw.split('\n').map(s => s.trim()).filter(Boolean) : [];

      if (!vehicleId)        { showToast('Please select a vehicle', 'error');     return; }
      if (!serviceType)      { showToast('Please enter a service type', 'error'); return; }
      if (!cost || cost <= 0){ showToast('Please enter a valid cost', 'error');   return; }

      const btn = form.querySelector('button[type="submit"]');
      const orig = btn.innerHTML;
      btn.innerHTML = '<span class="spinner-small"></span> Saving...';
      btn.disabled = true;

      const payload = {
        vehicleId,
        vehicleName: AppState.vehicles.find(v => v.id === vehicleId)?.name || '',
        serviceType,
        cost,
        date,
        notes,
        items
      };

      try {
        const ref = db.collection('users').doc(uid).collection('maintenanceLogs');

        if (editingId) {
          await ref.doc(editingId).update(payload);
          showToast('✅ Maintenance updated!', 'success');
        } else {
          await ref.add({ ...payload, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
          showToast('✅ Maintenance saved!', 'success');
        }

        closeModal();
        loadMaintenanceLogs();
      } catch (err) {
        console.error('Save maintenance error:', err);
        showToast('Failed to save entry', 'error');
      } finally {
        btn.innerHTML = orig;
        btn.disabled = false;
      }
    });

    // ── Edit (called from record card) ──
    window.editMaintenanceLog = function(id) {
      const record = (AppState.allMaintenanceLogs || []).find(m => m.id === id);
      if (!record) return;
      openModal(record);
    };

    // ── Delete ──
    window.deleteMaintenanceLog = async function(id) {
      if (!confirm('Delete this maintenance record?')) return;
      const uid = getCurrentUid();
      if (!uid) return;
      try {
        await db.collection('users').doc(uid).collection('maintenanceLogs').doc(id).delete();
        showToast('Record deleted', 'success');
        loadMaintenanceLogs();
      } catch (err) {
        showToast('Failed to delete', 'error');
      }
    };
  });

  // ── Helper: Firestore Timestamp / Date string → YYYY-MM-DD ──
  function toDateInput(d) {
    if (!d) return '';
    const date = d.toDate ? d.toDate() : new Date(d);
    return date.toISOString().split('T')[0];
  }

  // ── Load maintenance logs into AppState + render records page ──
  window.loadMaintenanceLogs = function() {
    const uid = getCurrentUid();
    if (!uid) return Promise.resolve();

    return db.collection('users').doc(uid).collection('maintenanceLogs')
      .orderBy('date', 'desc')
      .get()
      .then(snap => {
        AppState.allMaintenanceLogs = [];
        snap.forEach(doc => {
          AppState.allMaintenanceLogs.push({ id: doc.id, ...doc.data() });
        });

        renderMaintenanceRecords();

        // Refresh dashboard cost cards
        const hash = window.location.hash.replace('#', '') || 'dashboard';
        if (hash === 'dashboard' && typeof initDashboard === 'function') initDashboard();
        if (hash === 'maintenance' && typeof renderMaintenanceRecords === 'function') renderMaintenanceRecords();
      })
      .catch(err => console.error('Load maintenance logs error:', err));
  };

  // ── Render maintenance records list ──
  window.renderMaintenanceRecords = function() {
    const container  = document.getElementById('maintenanceList');
    const emptyState = document.getElementById('maintenanceEmpty');
    if (!container) return;

    const logs = AppState.allMaintenanceLogs || [];

    if (logs.length === 0) {
      container.innerHTML = '';
      if (emptyState) { emptyState.style.display = ''; container.appendChild(emptyState); }
      return;
    }

    if (emptyState) emptyState.style.display = 'none';

    // Summary totals
    const total = logs.reduce((s, m) => s + (m.cost || 0), 0);

    container.innerHTML = `
      <div class="maint-summary card slide-up" style="margin-bottom:var(--space-5);display:flex;align-items:center;justify-content:space-between;gap:var(--space-4);">
        <div>
          <div style="font-size:var(--text-sm);color:var(--text-secondary);margin-bottom:2px;">Total Maintenance Spent</div>
          <div style="font-size:var(--text-2xl);font-weight:700;font-family:var(--font-heading);color:var(--warning-600);">${formatCurrency(total)}</div>
        </div>
        <div style="font-size:var(--text-sm);color:var(--text-tertiary);">${logs.length} record${logs.length !== 1 ? 's' : ''}</div>
      </div>

      ${logs.map(m => {
        const d = m.date?.toDate ? m.date.toDate() : new Date(m.date);
        const dateStr = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        const vehicle = AppState.vehicles.find(v => v.id === m.vehicleId);
        const vName = vehicle?.name || m.vehicleName || 'Unknown Vehicle';
        const items = m.items || [];

        return `
        <div class="card slide-up maint-record-card" style="margin-bottom:var(--space-4);border-left:4px solid var(--warning-500);">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:var(--space-3);">
            <div style="flex:1;min-width:0;">
              <div style="display:flex;align-items:center;gap:var(--space-2);flex-wrap:wrap;margin-bottom:var(--space-2);">
                <span style="font-size:1.2rem;">🔧</span>
                <strong style="font-family:var(--font-heading);font-size:var(--text-base);">${m.serviceType}</strong>
                <span class="badge" style="background:rgba(245,158,11,0.12);color:var(--warning-600);">${formatCurrency(m.cost)}</span>
              </div>
              <div style="font-size:var(--text-sm);color:var(--text-secondary);margin-bottom:var(--space-2);">
                🚗 ${vName} &nbsp;·&nbsp; 📅 ${dateStr}
              </div>
              ${items.length > 0 ? `
              <div style="margin-bottom:var(--space-2);">
                <div style="font-size:var(--text-xs);font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:var(--space-1);">Items Serviced</div>
                <div style="display:flex;flex-wrap:wrap;gap:6px;">
                  ${items.map(item => `<span style="background:var(--bg-tertiary);border:1px solid var(--border-color);padding:2px 10px;border-radius:99px;font-size:var(--text-xs);">✓ ${item}</span>`).join('')}
                </div>
              </div>` : ''}
              ${m.notes ? `<div style="font-size:var(--text-xs);color:var(--text-tertiary);font-style:italic;">📝 ${m.notes}</div>` : ''}
            </div>
            <div style="display:flex;flex-direction:column;gap:var(--space-2);flex-shrink:0;">
              <button class="btn btn-ghost btn-icon btn-sm" onclick="editMaintenanceLog('${m.id}')" title="Edit">✏️</button>
              <button class="btn btn-ghost btn-icon btn-sm" onclick="deleteMaintenanceLog('${m.id}')" title="Delete">🗑️</button>
            </div>
          </div>
        </div>`;
      }).join('')}`;
  };
})();

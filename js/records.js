// ============================================
// FuelOdo - Fuel Records Management
// ============================================

(function() {
  document.addEventListener('DOMContentLoaded', () => {
    const vehicleFilter = document.getElementById('recordsVehicleFilter');
    const dateFrom = document.getElementById('recordsDateFrom');
    const dateTo = document.getElementById('recordsDateTo');
    const clearFiltersBtn = document.getElementById('clearFiltersBtn');

    // Filter handlers
    vehicleFilter.addEventListener('change', loadRecords);
    dateFrom.addEventListener('change', loadRecords);
    dateTo.addEventListener('change', loadRecords);
    clearFiltersBtn.addEventListener('click', () => {
      vehicleFilter.value = 'all';
      dateFrom.value = '';
      dateTo.value = '';
      loadRecords();
    });

    // ── Edit Fuel Modal ──
    const editModal = document.getElementById('editFuelModal');
    const editForm = document.getElementById('editFuelForm');

    document.getElementById('editFuelModalClose').addEventListener('click', () => editModal.classList.remove('active'));
    document.getElementById('editFuelCancelBtn').addEventListener('click', () => editModal.classList.remove('active'));
    editModal.addEventListener('click', (e) => { if (e.target === editModal) editModal.classList.remove('active'); });

    // Save edit
    editForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const uid = getCurrentUid();
      const logId = document.getElementById('editFuelLogId').value;
      const vehicleId = document.getElementById('editFuelVehicleId').value;

      if (!uid || !logId || !vehicleId) return;

      const liters = parseFloat(document.getElementById('editFuelLiters').value);
      const pricePerLiter = parseFloat(document.getElementById('editFuelPrice').value);
      const odometer = parseFloat(document.getElementById('editFuelOdometer').value);
      const totalCost = liters * pricePerLiter;
      const date = new Date(document.getElementById('editFuelDate').value);

      try {
        await db.collection('users').doc(uid)
          .collection('vehicles').doc(vehicleId)
          .collection('fuelLogs').doc(logId)
          .update({ date, liters, pricePerLiter, odometer, totalCost });

        editModal.classList.remove('active');
        showToast('Entry updated!', 'success');
      } catch (err) {
        console.error('Edit fuel error:', err);
        showToast('Failed to update', 'error');
      }
    });

    // Open edit modal
    window.editFuelLog = function(logId, vehicleId) {
      const log = AppState.allFuelLogs.find(l => l.id === logId);
      if (!log) return;

      document.getElementById('editFuelLogId').value = logId;
      document.getElementById('editFuelVehicleId').value = vehicleId;
      
      const d = log.date?.toDate ? log.date.toDate() : new Date(log.date);
      document.getElementById('editFuelDate').value = d.toISOString().split('T')[0];
      document.getElementById('editFuelLiters').value = log.liters;
      document.getElementById('editFuelPrice').value = log.pricePerLiter;
      document.getElementById('editFuelOdometer').value = log.odometer;

      editModal.classList.add('active');
    };

    // Delete fuel log
    window.deleteFuelLog = async function(logId, vehicleId) {
      if (!confirm('Delete this fuel entry?')) return;
      const uid = getCurrentUid();
      if (!uid) return;

      try {
        await db.collection('users').doc(uid)
          .collection('vehicles').doc(vehicleId)
          .collection('fuelLogs').doc(logId).delete();
        showToast('Entry deleted', 'success');
      } catch (err) {
        console.error('Delete fuel error:', err);
        showToast('Failed to delete', 'error');
      }
    };
  });

  // ── Load / Render Records ──
  window.loadRecords = function() {
    const vehicleFilter = document.getElementById('recordsVehicleFilter');
    const dateFrom = document.getElementById('recordsDateFrom');
    const dateTo = document.getElementById('recordsDateTo');
    const tbody = document.getElementById('recordsBody');
    const tableContainer = document.getElementById('recordsTableContainer');
    const emptyState = document.getElementById('recordsEmpty');

    let logs = [...AppState.allFuelLogs];

    // Filter by vehicle
    const vid = vehicleFilter ? vehicleFilter.value : 'all';
    if (vid !== 'all') {
      logs = logs.filter(l => l.vehicleId === vid);
    }

    // Filter by date range
    if (dateFrom && dateFrom.value) {
      const from = new Date(dateFrom.value);
      logs = logs.filter(l => {
        const d = l.date?.toDate ? l.date.toDate() : new Date(l.date);
        return d >= from;
      });
    }
    if (dateTo && dateTo.value) {
      const to = new Date(dateTo.value);
      to.setHours(23, 59, 59);
      logs = logs.filter(l => {
        const d = l.date?.toDate ? l.date.toDate() : new Date(l.date);
        return d <= to;
      });
    }

    // Sort newest first
    if (window.sortLogsDesc) window.sortLogsDesc(logs);
    else logs.sort((a, b) => {
      const da = a.date?.toDate ? a.date.toDate().getTime() : new Date(a.date).getTime();
      const db2 = b.date?.toDate ? b.date.toDate().getTime() : new Date(b.date).getTime();
      return db2 - da;
    });

    if (logs.length === 0) {
      tableContainer.style.display = 'none';
      emptyState.style.display = '';
      return;
    }

    tableContainer.style.display = '';
    emptyState.style.display = 'none';

    tbody.innerHTML = logs.map(l => {
      const d = l.date?.toDate ? l.date.toDate() : new Date(l.date);
      const vehicle = AppState.vehicles.find(v => v.id === l.vehicleId);
      const fuelBadge = (l.fuelType || vehicle?.fuelType || 'Petrol');
      const badgeClass = fuelBadge === 'Diesel' ? 'badge-diesel' : 'badge-petrol';

      return `<tr>
        <td data-label="Date">${formatDate(l.date)}</td>
        <td data-label="Vehicle">${l.vehicleName || '—'}</td>
        <td data-label="Fuel"><span class="badge ${badgeClass}">${fuelBadge}</span></td>
        <td data-label="Liters">${formatNumber(l.liters)} L</td>
        <td data-label="Price/L">${formatCurrency(l.pricePerLiter)}</td>
        <td data-label="Total"><strong>${formatCurrency(l.totalCost)}</strong></td>
        <td data-label="Odometer">${(l.odometer || 0).toLocaleString()} km</td>
        <td data-label="Distance">${l.distance ? l.distance.toLocaleString() + ' km' : '—'}</td>
        <td data-label="Mileage">${l.mileage ? formatNumber(l.mileage) + ' km/L' : '—'}</td>
        <td data-label="Cost/km">${l.costPerKm ? '₹' + formatNumber(l.costPerKm) : '—'}</td>
        <td class="table-actions">
          <button class="btn btn-ghost btn-icon btn-sm" onclick="editFuelLog('${l.id}','${l.vehicleId}')" title="Edit">✏️</button>
          <button class="btn btn-ghost btn-icon btn-sm" onclick="deleteFuelLog('${l.id}','${l.vehicleId}')" title="Delete">🗑️</button>
        </td>
      </tr>`;
    }).join('');
  };
})();

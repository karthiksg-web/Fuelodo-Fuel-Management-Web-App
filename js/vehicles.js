// ============================================
// FuelOdo - Vehicle Management (CRUD)
// ============================================

(function() {
  document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('vehicleModal');
    const form = document.getElementById('vehicleForm');
    const modalTitle = document.getElementById('vehicleModalTitle');
    const editIdInput = document.getElementById('vehicleEditId');
    const fuelTypeToggle = document.getElementById('fuelTypeToggle');

    // Open modal buttons
    document.getElementById('addVehicleBtn').addEventListener('click', () => openVehicleModal());
    document.getElementById('addVehicleEmptyBtn').addEventListener('click', () => openVehicleModal());

    // Close modal
    document.getElementById('vehicleModalClose').addEventListener('click', closeVehicleModal);
    document.getElementById('vehicleCancelBtn').addEventListener('click', closeVehicleModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeVehicleModal();
    });

    // Fuel type toggle
    fuelTypeToggle.querySelectorAll('.toggle-option').forEach(opt => {
      opt.addEventListener('click', () => {
        fuelTypeToggle.querySelectorAll('.toggle-option').forEach(o => o.classList.remove('active'));
        opt.classList.add('active');
      });
    });

    function openVehicleModal(vehicle = null) {
      form.reset();
      editIdInput.value = '';
      
      // Reset fuel type toggle
      fuelTypeToggle.querySelectorAll('.toggle-option').forEach(o => o.classList.remove('active'));
      fuelTypeToggle.querySelector('[data-value="Petrol"]').classList.add('active');

      if (vehicle) {
        modalTitle.textContent = 'Edit Vehicle';
        editIdInput.value = vehicle.id;
        document.getElementById('vehicleName').value = vehicle.name || '';
        document.getElementById('vehicleNumber').value = vehicle.number || '';
        document.getElementById('vehicleTankCapacity').value = vehicle.tankCapacity || '';
        
        // Set fuel type
        fuelTypeToggle.querySelectorAll('.toggle-option').forEach(o => o.classList.remove('active'));
        const target = fuelTypeToggle.querySelector(`[data-value="${vehicle.fuelType}"]`);
        if (target) target.classList.add('active');
      } else {
        modalTitle.textContent = 'Add Vehicle';
      }

      modal.classList.add('active');
    }

    function closeVehicleModal() {
      modal.classList.remove('active');
    }

    // Save vehicle
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const uid = getCurrentUid();
      if (!uid) return;

      const name = document.getElementById('vehicleName').value.trim();
      const number = document.getElementById('vehicleNumber').value.trim().toUpperCase();
      const fuelType = fuelTypeToggle.querySelector('.toggle-option.active')?.dataset.value || 'Petrol';
      const tankCapacity = parseFloat(document.getElementById('vehicleTankCapacity').value) || null;
      const editId = editIdInput.value;

      const data = {
        name,
        number,
        fuelType,
        tankCapacity,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };

      try {
        if (editId) {
          // Update
          await db.collection('users').doc(uid).collection('vehicles').doc(editId).update(data);
          window.logAppEvent('vehicle_updated', { fuel_type: fuelType });
          showToast('Vehicle updated!', 'success');
        } else {
          // Create
          data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
          await db.collection('users').doc(uid).collection('vehicles').add(data);
          window.logAppEvent('vehicle_created', { fuel_type: fuelType });
          showToast('Vehicle added!', 'success');
        }
        closeVehicleModal();
      } catch (err) {
        console.error('Save vehicle error:', err);
        showToast('Failed to save vehicle', 'error');
      }
    });

    // Delete vehicle
    window.deleteVehicle = async function(vehicleId) {
      if (!confirm('Delete this vehicle and all its fuel logs? This cannot be undone.')) return;
      
      const uid = getCurrentUid();
      if (!uid) return;

      try {
        // Delete all fuel logs first
        const logsSnap = await db.collection('users').doc(uid)
          .collection('vehicles').doc(vehicleId)
          .collection('fuelLogs').get();
        
        const batch = db.batch();
        logsSnap.forEach(doc => batch.delete(doc.ref));
        await batch.commit();

        // Delete vehicle
        await db.collection('users').doc(uid).collection('vehicles').doc(vehicleId).delete();
        showToast('Vehicle deleted', 'success');
      } catch (err) {
        console.error('Delete vehicle error:', err);
        showToast('Failed to delete vehicle', 'error');
      }
    };

    // Edit vehicle
    window.editVehicle = function(vehicleId) {
      const vehicle = AppState.vehicles.find(v => v.id === vehicleId);
      if (vehicle) openVehicleModal(vehicle);
    };
  });

  window.renderVehicles = function() {
    const grid = document.getElementById('vehiclesGrid');
    const empty = document.getElementById('vehiclesEmpty');
    
    // Clear only vehicle cards, preserve the empty state element
    grid.querySelectorAll('.vehicle-card').forEach(e => e.remove());

    if (AppState.vehicles.length === 0) {
      if (empty) empty.style.display = '';
      return;
    }

    if (empty) empty.style.display = 'none';

    AppState.vehicles.forEach(v => {
      // Get stats for this vehicle
      const logs = AppState.allFuelLogs.filter(l => l.vehicleId === v.id);
      const totalCost = logs.reduce((sum, l) => sum + (l.totalCost || 0), 0);
      const totalLiters = logs.reduce((sum, l) => sum + (l.liters || 0), 0);
      
      let totalDistance = 0;
      let latestOdo = 0;
      let totalMileage = 0;
      let mileageCount = 0;
      
      if (logs.length > 0) {
        if (window.sortLogsAsc) window.sortLogsAsc(logs);
        else logs.sort((a, b) => {
          const da = a.date?.toDate ? a.date.toDate().getTime() : new Date(a.date).getTime();
          const db = b.date?.toDate ? b.date.toDate().getTime() : new Date(b.date).getTime();
          return da - db;
        });

        latestOdo = logs[logs.length - 1].odometer || 0;

        for (let i = 1; i < logs.length; i++) {
          const dist = (logs[i].odometer || 0) - (logs[i-1].odometer || 0);
          if (dist > 0) {
            totalDistance += dist;
            const m = dist / (logs[i].liters || 1);
            totalMileage += m;
            mileageCount++;
          }
        }
      }
      
      const avgMileage = mileageCount > 0 ? (totalMileage / mileageCount) : 0;

      const card = document.createElement('div');
      card.className = 'card vehicle-card slide-up';
      card.innerHTML = `
        <div class="vehicle-header">
          <div class="vehicle-info">
            <div class="vehicle-icon">🚗</div>
            <div>
              <div class="vehicle-name">${v.name}</div>
              <div class="vehicle-number">${v.number}</div>
            </div>
          </div>
          <div class="vehicle-actions">
            <button class="btn btn-ghost btn-icon btn-sm" onclick="editVehicle('${v.id}')" title="Edit">✏️</button>
            <button class="btn btn-ghost btn-icon btn-sm" onclick="deleteVehicle('${v.id}')" title="Delete">🗑️</button>
          </div>
        </div>
        <div class="vehicle-meta">
          <span class="badge badge-${v.fuelType === 'Diesel' ? 'diesel' : 'petrol'}">${v.fuelType || 'Petrol'}</span>
          ${v.tankCapacity ? `<span class="badge badge-success">${v.tankCapacity}L tank</span>` : ''}
        </div>
        <div class="vehicle-stats">
          <div class="vehicle-stat">
            <div class="stat-val">${formatNumber(avgMileage)}</div>
            <div class="stat-lbl">Avg km/L</div>
          </div>
          <div class="vehicle-stat">
            <div class="stat-val">${formatCurrency(totalCost)}</div>
            <div class="stat-lbl">Total Spent</div>
          </div>
          <div class="vehicle-stat">
            <div class="stat-val">${latestOdo.toLocaleString()}</div>
            <div class="stat-lbl">Odometer</div>
          </div>
          <div class="vehicle-stat">
            <div class="stat-val">${logs.length}</div>
            <div class="stat-lbl">Fill-ups</div>
          </div>
        </div>
      `;
      grid.appendChild(card);
    });
  };
})();

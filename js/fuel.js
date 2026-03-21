// ============================================
// FuelOdo - Fuel Entry System
// ============================================

(function() {
  document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('fuelForm');
    const litersInput = document.getElementById('fuelLiters');
    const priceInput = document.getElementById('fuelPrice');
    const odometerInput = document.getElementById('fuelOdometer');
    const vehicleSelect = document.getElementById('fuelVehicleSelect');
    const totalCostDisplay = document.getElementById('fuelTotalCost');
    const autoCalcDisplay = document.getElementById('autoCalcDisplay');
    const calcDistance = document.getElementById('calcDistance');
    const calcMileage = document.getElementById('calcMileage');
    const calcCostPerKm = document.getElementById('calcCostPerKm');
    const dateInput = document.getElementById('fuelDate');

    // Set default date to today
    dateInput.value = new Date().toISOString().split('T')[0];

    // ── Auto-calculate total cost ──
    function updateTotalCost() {
      const liters = parseFloat(litersInput.value) || 0;
      const price = parseFloat(priceInput.value) || 0;
      const total = liters * price;
      totalCostDisplay.textContent = formatCurrency(total);
    }

    litersInput.addEventListener('input', updateTotalCost);
    priceInput.addEventListener('input', updateTotalCost);

    // ── Auto-calculate distance, mileage, cost/km ──
    async function updateAutoCalc() {
      const vehicleId = vehicleSelect.value;
      const odometer = parseFloat(odometerInput.value) || 0;
      const liters = parseFloat(litersInput.value) || 0;
      const price = parseFloat(priceInput.value) || 0;
      const totalCost = liters * price;

      if (!vehicleId || odometer <= 0) {
        autoCalcDisplay.style.display = 'none';
        return;
      }

      // Get previous odometer for this vehicle
      const prevOdometer = getPreviousOdometer(vehicleId);

      if (prevOdometer !== null && odometer > prevOdometer) {
        const distance = odometer - prevOdometer;
        const mileage = liters > 0 ? distance / liters : 0;
        const costPerKm = distance > 0 ? totalCost / distance : 0;

        calcDistance.textContent = distance.toLocaleString();
        calcMileage.textContent = formatNumber(mileage);
        calcCostPerKm.textContent = formatNumber(costPerKm);
        autoCalcDisplay.style.display = '';
      } else {
        autoCalcDisplay.style.display = 'none';
      }
    }

    function getPreviousOdometer(vehicleId) {
      let logs = AppState.allFuelLogs.filter(l => l.vehicleId === vehicleId);
      if (window.sortLogsAsc) window.sortLogsAsc(logs);
      else logs.sort((a, b) => {
        const da = a.date?.toDate ? a.date.toDate().getTime() : new Date(a.date).getTime();
        const db2 = b.date?.toDate ? b.date.toDate().getTime() : new Date(b.date).getTime();
        return da - db2;
      });
      
      if (logs.length === 0) return null;
      return logs[logs.length - 1].odometer || null;
    }

    odometerInput.addEventListener('input', updateAutoCalc);
    litersInput.addEventListener('input', () => { updateTotalCost(); updateAutoCalc(); });
    priceInput.addEventListener('input', () => { updateTotalCost(); updateAutoCalc(); });
    vehicleSelect.addEventListener('change', updateAutoCalc);

    // ── Save fuel entry ──
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const uid = getCurrentUid();
      const vehicleId = vehicleSelect.value;

      if (!uid || !vehicleId) {
        showToast('Please select a vehicle', 'error');
        return;
      }

      const date = dateInput.value;
      const liters = parseFloat(litersInput.value);
      const pricePerLiter = parseFloat(priceInput.value);
      const odometer = parseFloat(odometerInput.value);
      const totalCost = liters * pricePerLiter;

      // Calculate distance & mileage
      const prevOdometer = getPreviousOdometer(vehicleId);
      let distance = null;
      let mileage = null;
      let costPerKm = null;

      if (prevOdometer !== null && odometer > prevOdometer) {
        distance = odometer - prevOdometer;
        mileage = distance / liters;
        costPerKm = totalCost / distance;
      }

      const data = {
        date: new Date(date),
        liters,
        pricePerLiter,
        totalCost,
        odometer,
        distance,
        mileage,
        costPerKm,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      };

      try {
        await db.collection('users').doc(uid)
          .collection('vehicles').doc(vehicleId)
          .collection('fuelLogs').add(data);

        showToast('Fuel entry saved!', 'success');
        form.reset();
        dateInput.value = new Date().toISOString().split('T')[0];
        totalCostDisplay.textContent = '₹0.00';
        autoCalcDisplay.style.display = 'none';
      } catch (err) {
        console.error('Save fuel error:', err);
        showToast('Failed to save entry', 'error');
      }
    });

    // Reset button
    form.addEventListener('reset', () => {
      setTimeout(() => {
        totalCostDisplay.textContent = '₹0.00';
        autoCalcDisplay.style.display = 'none';
        dateInput.value = new Date().toISOString().split('T')[0];
      }, 10);
    });
  });
})();

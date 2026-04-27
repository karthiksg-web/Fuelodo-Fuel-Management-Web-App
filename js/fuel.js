// ============================================
// FuelOdo - Fuel Entry System v2
// Features: Odometer Validation, 300km Anomaly Warning,
//           Business Mode fields, Debouncing
// ============================================

(function() {
  // ── Debounce helper ──
  function debounce(fn, delay) {
    let timer;
    return function(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

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
    const odomWarning = document.getElementById('odomWarning');

    // Business Mode elements (will show/hide based on mode)
    const businessFields = document.getElementById('businessFields');

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

    // ── Get previous odometer reading for a vehicle ──
    function getPreviousOdometer(vehicleId) {
      let logs = AppState.allFuelLogs.filter(l => l.vehicleId === vehicleId);
      logs.sort((a, b) => {
        const da = a.date?.toDate ? a.date.toDate().getTime() : new Date(a.date).getTime();
        const db2 = b.date?.toDate ? b.date.toDate().getTime() : new Date(b.date).getTime();
        if (da !== db2) return da - db2;
        return (a.odometer || 0) - (b.odometer || 0);
      });
      if (logs.length === 0) return null;
      return logs[logs.length - 1].odometer || null;
    }

    // ── Auto-calculate distance, mileage, cost/km (debounced) ──
    const updateAutoCalc = debounce(function() {
      const vehicleId = vehicleSelect.value;
      const odometer = parseFloat(odometerInput.value) || 0;
      const liters = parseFloat(litersInput.value) || 0;
      const price = parseFloat(priceInput.value) || 0;
      const totalCost = liters * price;

      // Clear previous warnings
      if (odomWarning) odomWarning.style.display = 'none';
      odometerInput.classList.remove('input-error');

      if (!vehicleId || odometer <= 0) {
        autoCalcDisplay.style.display = 'none';
        return;
      }

      const prevOdometer = getPreviousOdometer(vehicleId);

      // Validation: current must be GREATER than previous
      if (prevOdometer !== null) {
        if (odometer <= prevOdometer) {
          odometerInput.classList.add('input-error');
          if (odomWarning) {
            odomWarning.textContent = `⛔ Odometer must be greater than last reading (${prevOdometer.toLocaleString()} km).`;
            odomWarning.style.display = '';
            odomWarning.className = 'odometer-warning error';
          }
          autoCalcDisplay.style.display = 'none';
          return;
        }

        const distance = odometer - prevOdometer;

        // Anomaly: distance > 300 km
        if (distance > 300 && odomWarning) {
          odomWarning.textContent = `⚠️ Unusual distance detected: ${distance.toLocaleString()} km since last entry. Please verify.`;
          odomWarning.style.display = '';
          odomWarning.className = 'odometer-warning caution';
        }

        const mileage = liters > 0 ? distance / liters : 0;
        const costPerKm = distance > 0 ? totalCost / distance : 0;

        calcDistance.textContent = distance.toLocaleString();
        calcMileage.textContent = formatNumber(mileage);
        calcCostPerKm.textContent = formatNumber(costPerKm);
        autoCalcDisplay.style.display = '';
      } else {
        autoCalcDisplay.style.display = 'none';
      }
    }, 300);

    odometerInput.addEventListener('input', () => { updateAutoCalc(); });
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

      // ─── Odometer Validation (hard block) ───
      const prevOdometer = getPreviousOdometer(vehicleId);
      if (prevOdometer !== null && odometer <= prevOdometer) {
        odometerInput.classList.add('input-error');
        if (odomWarning) {
          odomWarning.textContent = `⛔ Invalid odometer! Current reading (${odometer.toLocaleString()}) must be greater than previous (${prevOdometer.toLocaleString()}).`;
          odomWarning.style.display = '';
          odomWarning.className = 'odometer-warning error';
        }
        showToast('Odometer reading must be greater than last entry!', 'error');
        return;
      }

      // ─── Anomaly: 300 km confirmation ───
      let distance = null;
      let mileage = null;
      let costPerKm = null;

      if (prevOdometer !== null && odometer > prevOdometer) {
        distance = odometer - prevOdometer;
        mileage = distance / liters;
        costPerKm = totalCost / distance;

        if (distance > 300) {
          const proceed = confirm(
            `⚠️ Unusual distance detected!\n\nYou've entered ${distance.toLocaleString()} km since the last fill-up. This seems unusually high.\n\nAre you sure? Click OK to save or Cancel to correct.`
          );
          if (!proceed) return;
        }
      }

      // ─── Business Mode extra fields ───
      const isBusinessMode = AppState.businessMode === true;
      const businessData = {};
      if (isBusinessMode) {
        const driverName = document.getElementById('fuelDriverName')?.value?.trim() || '';
        const tripPurpose = document.getElementById('fuelTripPurpose')?.value?.trim() || '';
        const income = parseFloat(document.getElementById('fuelIncome')?.value || 0) || 0;
        if (driverName) businessData.driverName = driverName;
        if (tripPurpose) businessData.tripPurpose = tripPurpose;
        if (income > 0) businessData.income = income;
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
        ...businessData,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      };

      const submitBtn = form.querySelector('button[type="submit"]');
      const originalText = submitBtn.innerHTML;
      submitBtn.innerHTML = '<span class="spinner-small"></span> Saving...';
      submitBtn.disabled = true;

      try {
        await db.collection('users').doc(uid)
          .collection('vehicles').doc(vehicleId)
          .collection('fuelLogs').add(data);

        window.logAppEvent('fuel_added', {
          vehicle_id: vehicleId,
          liters,
          total_cost: totalCost
        });

        // Trigger notification engine
        if (typeof NotificationSystem !== 'undefined') {
          setTimeout(() => NotificationSystem.runAlertEngine(vehicleId), 1500);
        }

        showToast('✅ Fuel entry saved!', 'success');
        form.reset();
        dateInput.value = new Date().toISOString().split('T')[0];
        totalCostDisplay.textContent = '₹0.00';
        autoCalcDisplay.style.display = 'none';
        if (odomWarning) odomWarning.style.display = 'none';
        odometerInput.classList.remove('input-error');
      } catch (err) {
        console.error('Save fuel error:', err);
        showToast('Failed to save entry', 'error');
      } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
      }
    });

    // Reset button handler
    form.addEventListener('reset', () => {
      setTimeout(() => {
        totalCostDisplay.textContent = '₹0.00';
        autoCalcDisplay.style.display = 'none';
        if (odomWarning) odomWarning.style.display = 'none';
        odometerInput.classList.remove('input-error');
        dateInput.value = new Date().toISOString().split('T')[0];
      }, 10);
    });
  });
})();

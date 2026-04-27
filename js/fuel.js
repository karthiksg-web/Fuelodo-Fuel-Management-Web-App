// ============================================
// FuelOdo - Fuel Entry System v3
// Added: Full Tank toggle (isFullTank field)
// Added: Inline field validation with error messages
// Fixed: Mileage skipped for partial fills
// ============================================

(function() {
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
    const fullTankToggle = document.getElementById('fullTankToggle');
    const businessFields = document.getElementById('businessFields');

    if (!form) return;

    // Set default date to today
    dateInput.value = new Date().toISOString().split('T')[0];

    // ── Show/hide business fields ──
    function updateBusinessFields() {
      if (businessFields) {
        businessFields.style.display = AppState.businessMode ? '' : 'none';
      }
    }
    updateBusinessFields();

    // ── Inline validation helpers ──
    function showFieldError(input, message) {
      input.classList.add('input-error');
      let err = input.parentElement.querySelector('.field-error');
      if (!err) {
        err = document.createElement('span');
        err.className = 'field-error';
        input.parentElement.appendChild(err);
      }
      err.textContent = message;
    }

    function clearFieldError(input) {
      input.classList.remove('input-error');
      const err = input.parentElement.querySelector('.field-error');
      if (err) err.remove();
    }

    function validateField(input, rules) {
      const val = input.value.trim();
      for (const rule of rules) {
        if (!rule.check(val, input)) {
          showFieldError(input, rule.message);
          return false;
        }
      }
      clearFieldError(input);
      return true;
    }

    // Blur validation for each field
    vehicleSelect.addEventListener('blur', () => {
      if (!vehicleSelect.value) showFieldError(vehicleSelect, 'Please select a vehicle');
      else clearFieldError(vehicleSelect);
    });

    litersInput.addEventListener('blur', () => {
      const v = parseFloat(litersInput.value);
      if (!v || v <= 0) showFieldError(litersInput, 'Enter a valid liters amount');
      else if (v > 500) showFieldError(litersInput, 'Liters seems too high — please verify');
      else clearFieldError(litersInput);
    });

    priceInput.addEventListener('blur', () => {
      const v = parseFloat(priceInput.value);
      if (!v || v <= 0) showFieldError(priceInput, 'Enter a valid price per liter');
      else if (v > 500) showFieldError(priceInput, 'Price seems too high — please verify');
      else clearFieldError(priceInput);
    });

    odometerInput.addEventListener('blur', () => {
      const v = parseFloat(odometerInput.value);
      if (!v || v < 0) showFieldError(odometerInput, 'Enter a valid odometer reading');
      else clearFieldError(odometerInput);
    });

    // ── Auto-calculate total cost ──
    function updateTotalCost() {
      const liters = parseFloat(litersInput.value) || 0;
      const price = parseFloat(priceInput.value) || 0;
      const total = liters * price;
      totalCostDisplay.textContent = formatCurrency(total);
    }

    litersInput.addEventListener('input', updateTotalCost);
    priceInput.addEventListener('input', updateTotalCost);

    // ── Get previous odometer for vehicle ──
    function getPreviousOdometer(vehicleId) {
      let logs = AppState.allFuelLogs.filter(l => l.vehicleId === vehicleId);
      logs.sort((a, b) => {
        const da = a.date?.toDate ? a.date.toDate().getTime() : new Date(a.date).getTime();
        const db2 = b.date?.toDate ? b.date.toDate().getTime() : new Date(b.date).getTime();
        if (da !== db2) return da - db2;
        return (a.odometer || 0) - (b.odometer || 0);
      });
      return logs.length > 0 ? (logs[logs.length - 1].odometer || null) : null;
    }

    // ── Auto-calc distance, mileage, cost/km ──
    const updateAutoCalc = debounce(function() {
      const vehicleId = vehicleSelect.value;
      const odometer = parseFloat(odometerInput.value) || 0;
      const liters = parseFloat(litersInput.value) || 0;
      const price = parseFloat(priceInput.value) || 0;
      const totalCost = liters * price;
      const isPartialFill = fullTankToggle && !fullTankToggle.checked;

      if (odomWarning) odomWarning.style.display = 'none';
      odometerInput.classList.remove('input-error');

      if (!vehicleId || odometer <= 0) {
        autoCalcDisplay.style.display = 'none';
        return;
      }

      const prevOdometer = getPreviousOdometer(vehicleId);

      if (prevOdometer !== null) {
        if (odometer <= prevOdometer) {
          odometerInput.classList.add('input-error');
          if (odomWarning) {
            odomWarning.textContent = `⛔ Must be greater than last reading (${prevOdometer.toLocaleString()} km).`;
            odomWarning.style.display = '';
            odomWarning.className = 'odometer-warning error';
          }
          autoCalcDisplay.style.display = 'none';
          return;
        }

        const distance = odometer - prevOdometer;

        if (distance > 300 && odomWarning) {
          odomWarning.textContent = `⚠️ Unusual distance: ${distance.toLocaleString()} km. Please verify.`;
          odomWarning.style.display = '';
          odomWarning.className = 'odometer-warning caution';
        }

        // Show auto-calc only for full tank
        if (!isPartialFill) {
          const mileage = liters > 0 ? distance / liters : 0;
          const costPerKm = distance > 0 ? totalCost / distance : 0;
          calcDistance.textContent = distance.toLocaleString();
          calcMileage.textContent = formatNumber(mileage);
          calcCostPerKm.textContent = formatNumber(costPerKm);
          autoCalcDisplay.style.display = '';

          // Update partial fill note visibility
          const partialNote = document.getElementById('partialFillNote');
          if (partialNote) partialNote.style.display = 'none';
        } else {
          // Partial fill: show distance only
          calcDistance.textContent = distance.toLocaleString();
          calcMileage.textContent = '—';
          calcCostPerKm.textContent = '—';
          autoCalcDisplay.style.display = '';

          const partialNote = document.getElementById('partialFillNote');
          if (partialNote) partialNote.style.display = '';
        }
      } else {
        autoCalcDisplay.style.display = 'none';
      }
    }, 300);

    odometerInput.addEventListener('input', updateAutoCalc);
    litersInput.addEventListener('input', () => { updateTotalCost(); updateAutoCalc(); });
    priceInput.addEventListener('input', () => { updateTotalCost(); updateAutoCalc(); });
    vehicleSelect.addEventListener('change', updateAutoCalc);
    if (fullTankToggle) fullTankToggle.addEventListener('change', updateAutoCalc);

    // ── Save fuel entry ──
    form.addEventListener('submit', async e => {
      e.preventDefault();

      // Full validation before submit
      let valid = true;
      if (!vehicleSelect.value) { showFieldError(vehicleSelect, 'Please select a vehicle'); valid = false; }
      const liters = parseFloat(litersInput.value);
      if (!liters || liters <= 0) { showFieldError(litersInput, 'Enter a valid liters amount'); valid = false; }
      const pricePerLiter = parseFloat(priceInput.value);
      if (!pricePerLiter || pricePerLiter <= 0) { showFieldError(priceInput, 'Enter a valid price per liter'); valid = false; }
      const odometer = parseFloat(odometerInput.value);
      if (!odometer || odometer < 0) { showFieldError(odometerInput, 'Enter a valid odometer reading'); valid = false; }
      if (!dateInput.value) { showFieldError(dateInput, 'Please select a date'); valid = false; }
      if (!valid) { showToast('Please fix the errors above', 'error'); return; }

      const uid = getCurrentUid();
      const vehicleId = vehicleSelect.value;
      if (!uid || !vehicleId) { showToast('Please select a vehicle', 'error'); return; }

      const date = dateInput.value;
      const totalCost = liters * pricePerLiter;
      const isFullTank = fullTankToggle ? fullTankToggle.checked : true;

      // Odometer validation
      const prevOdometer = getPreviousOdometer(vehicleId);
      if (prevOdometer !== null && odometer <= prevOdometer) {
        odometerInput.classList.add('input-error');
        if (odomWarning) {
          odomWarning.textContent = `⛔ Invalid! Must be greater than last reading (${prevOdometer.toLocaleString()}).`;
          odomWarning.style.display = '';
          odomWarning.className = 'odometer-warning error';
        }
        showToast('Odometer reading must be greater than last entry!', 'error');
        return;
      }

      let distance = null;
      let mileage = null;
      let costPerKm = null;

      if (prevOdometer !== null && odometer > prevOdometer) {
        distance = odometer - prevOdometer;

        if (distance > 300) {
          const proceed = confirm(`⚠️ Unusual distance detected!\n\nYou've entered ${distance.toLocaleString()} km since the last fill-up.\n\nAre you sure? Click OK to save or Cancel to correct.`);
          if (!proceed) return;
        }

        // Only calculate mileage for full tank fills
        if (isFullTank) {
          mileage = distance / liters;
          costPerKm = totalCost / distance;
        }
      }

      // Business Mode fields
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
        isFullTank,        // NEW field
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

        if (typeof window.logAppEvent === 'function') {
          window.logAppEvent('fuel_added', { vehicle_id: vehicleId, liters, total_cost: totalCost, is_full_tank: isFullTank });
        }

        if (typeof NotificationSystem !== 'undefined') {
          setTimeout(() => NotificationSystem.runAlertEngine(vehicleId), 1500);
        }

        showToast('✅ Fuel entry saved!', 'success');
        form.reset();
        dateInput.value = new Date().toISOString().split('T')[0];
        if (fullTankToggle) fullTankToggle.checked = true; // Reset to full tank default
        totalCostDisplay.textContent = '₹0.00';
        autoCalcDisplay.style.display = 'none';
        if (odomWarning) odomWarning.style.display = 'none';
        odometerInput.classList.remove('input-error');
        // Clear all field errors
        form.querySelectorAll('.field-error').forEach(e => e.remove());
        form.querySelectorAll('.input-error').forEach(e => e.classList.remove('input-error'));

        // Update business fields visibility
        updateBusinessFields();
      } catch (err) {
        console.error('Save fuel error:', err);
        showToast('Failed to save entry', 'error');
      } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
      }
    });

    form.addEventListener('reset', () => {
      setTimeout(() => {
        totalCostDisplay.textContent = '₹0.00';
        autoCalcDisplay.style.display = 'none';
        if (odomWarning) odomWarning.style.display = 'none';
        odometerInput.classList.remove('input-error');
        dateInput.value = new Date().toISOString().split('T')[0];
        if (fullTankToggle) fullTankToggle.checked = true;
        form.querySelectorAll('.field-error').forEach(e => e.remove());
        form.querySelectorAll('.input-error').forEach(e => e.classList.remove('input-error'));
        updateBusinessFields();
      }, 10);
    });
  });
})();

// ============================================
// FuelOdo - Dashboard System v2
// Fixed: Separate Fuel Cost / Maintenance Cost / Total Expenses
// Fixed: Mileage calculation skips partial fills (isFullTank === false)
// Added: Smart Insights integration
// ============================================

let expenseChart = null;
let mileageChart = null;

window.initDashboard = function() {
  const isBusinessMode = AppState.businessMode === true;
  const logs = getFilteredLogs();
  const maintenanceLogs = (AppState.allMaintenanceLogs || []).filter(m => {
    if (AppState.selectedVehicleId === 'all') return true;
    return m.vehicleId === AppState.selectedVehicleId;
  });

  // ── Cost calculations — now SEPARATED ──
  const fuelCost = logs.reduce((s, l) => s + (l.totalCost || 0), 0);
  const maintCost = maintenanceLogs.reduce((s, m) => s + (m.cost || 0), 0);
  const totalExpenses = fuelCost + maintCost;

  let totalDistance = 0;
  let totalMileage = 0;
  let mileageCount = 0;
  let totalIncome = 0;
  let latestOdo = 0;
  let absoluteLatestTime = 0;
  let latestMileage = 0;

  const byVehicle = {};
  logs.forEach(l => {
    if (!byVehicle[l.vehicleId]) byVehicle[l.vehicleId] = [];
    byVehicle[l.vehicleId].push(l);
    if (isBusinessMode) totalIncome += (parseFloat(l.income) || 0);
  });

  Object.values(byVehicle).forEach(vLogs => {
    vLogs.sort((a, b) => {
      const da = a.date?.toDate ? a.date.toDate().getTime() : new Date(a.date).getTime();
      const db2 = b.date?.toDate ? b.date.toDate().getTime() : new Date(b.date).getTime();
      if (da !== db2) return da - db2;
      return (a.odometer || 0) - (b.odometer || 0);
    });

    if (vLogs.length > 0) {
      const last = vLogs[vLogs.length - 1];
      if ((last.odometer || 0) > latestOdo) latestOdo = last.odometer;
    }

    let vLatestMileage = 0;
    let vLatestTime = 0;

    for (let i = 1; i < vLogs.length; i++) {
      const dist = (vLogs[i].odometer || 0) - (vLogs[i - 1].odometer || 0);
      if (dist > 0) {
        totalDistance += dist;

        // ── FULL TANK LOGIC: skip mileage calc for partial fills ──
        const isFullTank = vLogs[i].isFullTank !== false; // default true for existing records
        if (isFullTank) {
          const m = dist / (vLogs[i].liters || 1);
          totalMileage += m;
          mileageCount++;

          const dTime = vLogs[i].date?.toDate ? vLogs[i].date.toDate().getTime() : new Date(vLogs[i].date).getTime();
          if (dTime >= vLatestTime) {
            vLatestTime = dTime;
            vLatestMileage = m;
          }
        }
      }
    }

    if (vLatestTime >= absoluteLatestTime && vLatestMileage > 0) {
      absoluteLatestTime = vLatestTime;
      latestMileage = vLatestMileage;
    }
  });

  const avgMileage = mileageCount > 0 ? totalMileage / mileageCount : 0;

  // ── Render Stat Cards ──
  // Card 1: Fuel Cost (was "Total Fuel Cost" duplicate)
  const statFuelCostEl = document.getElementById('statFuelCost');
  if (statFuelCostEl) statFuelCostEl.textContent = formatCurrency(fuelCost);

  // Card 2: Avg Mileage
  document.getElementById('statAvgMileage').textContent = formatNumber(avgMileage) + ' km/L';

  // Card 3: Total Distance
  document.getElementById('statTotalDistance').textContent = totalDistance.toLocaleString() + ' km';

  // Card 4: Maintenance Cost (new separate card)
  const statMaintCostEl = document.getElementById('statMaintCost');
  if (statMaintCostEl) statMaintCostEl.textContent = formatCurrency(maintCost);

  // Card 5: Total Expenses = Fuel + Maintenance
  const statTotalExpensesEl = document.getElementById('statTotalExpenses');
  if (statTotalExpensesEl) statTotalExpensesEl.textContent = formatCurrency(totalExpenses);

  // Business Mode: Profit card
  const statProfitCard = document.getElementById('statProfitCard');
  if (isBusinessMode && statProfitCard) {
    statProfitCard.style.display = 'flex';
    const profit = totalIncome - totalExpenses;
    const profitEl = document.getElementById('statTotalProfit');
    if (profitEl) {
      profitEl.textContent = formatCurrency(profit);
      profitEl.style.color = profit >= 0 ? 'var(--success-500)' : 'var(--danger-500)';
    }
  } else {
    if (statProfitCard) statProfitCard.style.display = 'none';
  }

  // ── Load Smart Insights ──
  if (typeof window.loadInsights === 'function') {
    window.loadInsights();
  }

  // ── Lazy load charts ──
  setTimeout(() => {
    renderExpenseChart(logs, maintenanceLogs);
    renderMileageChart(logs, byVehicle);
  }, 100);
};

function renderExpenseChart(logs, maintenanceLogs) {
  const ctx = document.getElementById('expenseChart');
  if (!ctx) return;

  const monthly = {};
  logs.forEach(l => {
    const d = l.date?.toDate ? l.date.toDate() : new Date(l.date);
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    if (!monthly[key]) monthly[key] = { fuel: 0, maint: 0 };
    monthly[key].fuel += l.totalCost || 0;
  });

  (maintenanceLogs || []).forEach(m => {
    const d = m.date?.toDate ? m.date.toDate() : new Date(m.date);
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    if (!monthly[key]) monthly[key] = { fuel: 0, maint: 0 };
    monthly[key].maint += m.cost || 0;
  });

  const labels = Object.keys(monthly).sort();
  const fuelData = labels.map(k => monthly[k].fuel);
  const maintData = labels.map(k => monthly[k].maint);
  const hasMaint = maintData.some(v => v > 0);

  const displayLabels = labels.map(k => {
    const [y, m] = k.split('-');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return months[parseInt(m) - 1] + ' ' + y.slice(2);
  });

  if (expenseChart) expenseChart.destroy();

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const tooltipBg = isDark ? '#1e2538' : '#fff';
  const tooltipTitle = isDark ? '#f1f5f9' : '#0f172a';
  const tooltipBody = isDark ? '#94a3b8' : '#475569';
  const tooltipBorder = isDark ? 'rgba(241,245,249,0.1)' : 'rgba(15,23,42,0.1)';
  const gridColor = isDark ? 'rgba(241,245,249,0.04)' : 'rgba(15,23,42,0.04)';
  const tickColor = isDark ? '#64748b' : '#94a3b8';

  const datasets = [{
    label: 'Fuel Cost (₹)',
    data: fuelData,
    borderColor: '#3b5bff',
    backgroundColor: 'rgba(59, 91, 255, 0.12)',
    borderWidth: 2.5,
    fill: true,
    tension: 0.4,
    pointRadius: 4,
    pointBackgroundColor: '#3b5bff',
    pointBorderColor: '#fff',
    pointBorderWidth: 2
  }];

  if (hasMaint) {
    datasets.push({
      label: 'Maintenance (₹)',
      data: maintData,
      borderColor: '#f59e0b',
      backgroundColor: 'rgba(245, 158, 11, 0.1)',
      borderWidth: 2,
      fill: true,
      tension: 0.4,
      pointRadius: 4,
      pointBackgroundColor: '#f59e0b',
      pointBorderColor: '#fff',
      pointBorderWidth: 2
    });
  }

  expenseChart = new Chart(ctx, {
    type: 'line',
    data: { labels: displayLabels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: hasMaint, position: 'top', labels: { color: tickColor, font: { size: 11 }, boxWidth: 12 } },
        tooltip: {
          backgroundColor: tooltipBg,
          titleColor: tooltipTitle,
          bodyColor: tooltipBody,
          borderColor: tooltipBorder,
          borderWidth: 1,
          cornerRadius: 8,
          padding: 12,
          callbacks: { label: ctx => `${ctx.dataset.label}: ₹${ctx.parsed.y.toLocaleString('en-IN')}` }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: tickColor, font: { size: 11 } } },
        y: {
          grid: { color: gridColor },
          ticks: { color: tickColor, font: { size: 11 }, callback: v => '₹' + v.toLocaleString('en-IN') }
        }
      }
    }
  });
}

function renderMileageChart(logs, byVehicle) {
  const ctx = document.getElementById('mileageChart');
  if (!ctx) return;

  const points = [];
  Object.values(byVehicle).forEach(vLogs => {
    for (let i = 1; i < vLogs.length; i++) {
      // Skip partial fills in mileage chart
      if (vLogs[i].isFullTank === false) continue;
      const dist = (vLogs[i].odometer || 0) - (vLogs[i - 1].odometer || 0);
      if (dist > 0 && vLogs[i].liters > 0) {
        const d = vLogs[i].date?.toDate ? vLogs[i].date.toDate() : new Date(vLogs[i].date);
        points.push({ date: d, mileage: dist / vLogs[i].liters });
      }
    }
  });

  points.sort((a, b) => a.date - b.date);

  if (mileageChart) mileageChart.destroy();

  if (points.length === 0) return;

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const tickColor = isDark ? '#64748b' : '#94a3b8';
  const gridColor = isDark ? 'rgba(241,245,249,0.04)' : 'rgba(15,23,42,0.04)';
  const tooltipBg = isDark ? '#1e2538' : '#fff';
  const tooltipTitle = isDark ? '#f1f5f9' : '#0f172a';
  const tooltipBody = isDark ? '#94a3b8' : '#475569';
  const tooltipBorder = isDark ? 'rgba(241,245,249,0.1)' : 'rgba(15,23,42,0.1)';

  mileageChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: points.map(p => p.date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })),
      datasets: [{
        label: 'Mileage (km/L)',
        data: points.map(p => parseFloat(p.mileage.toFixed(1))),
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        borderWidth: 2.5,
        fill: true,
        tension: 0.4,
        pointRadius: 4,
        pointBackgroundColor: '#10b981',
        pointBorderColor: '#fff',
        pointBorderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: tooltipBg, titleColor: tooltipTitle, bodyColor: tooltipBody,
          borderColor: tooltipBorder, borderWidth: 1, cornerRadius: 8, padding: 12,
          callbacks: { label: ctx => ctx.parsed.y + ' km/L' }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: tickColor, font: { size: 11 } } },
        y: {
          grid: { color: gridColor },
          ticks: { color: tickColor, font: { size: 11 }, callback: v => v + ' km/L' }
        }
      }
    }
  });
}

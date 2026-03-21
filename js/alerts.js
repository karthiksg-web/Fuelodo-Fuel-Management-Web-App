// ============================================
// FuelOdo - Alerts & Insights
// ============================================

window.loadAlerts = function() {
  const container = document.getElementById('alertsList');
  const emptyState = document.getElementById('alertsEmpty');
  const logs = AppState.allFuelLogs;

  if (logs.length < 3) {
    container.innerHTML = '';
    container.appendChild(emptyState);
    emptyState.style.display = '';
    return;
  }

  const alerts = [];

  // Analyze per vehicle
  const byVehicle = {};
  logs.forEach(l => {
    if (!byVehicle[l.vehicleId]) byVehicle[l.vehicleId] = [];
    byVehicle[l.vehicleId].push(l);
  });

  Object.entries(byVehicle).forEach(([vid, vLogs]) => {
    const vehicle = AppState.vehicles.find(v => v.id === vid);
    const vName = vehicle ? vehicle.name : 'Vehicle';
    
    if (window.sortLogsAsc) window.sortLogsAsc(vLogs);
    else vLogs.sort((a, b) => {
      const da = a.date?.toDate ? a.date.toDate().getTime() : new Date(a.date).getTime();
      const db2 = b.date?.toDate ? b.date.toDate().getTime() : new Date(b.date).getTime();
      return da - db2;
    });

    // Calculate mileages
    const mileages = [];
    const costs = [];
    const monthlyMileage = {};

    for (let i = 1; i < vLogs.length; i++) {
      const dist = (vLogs[i].odometer || 0) - (vLogs[i-1].odometer || 0);
      if (dist > 0) {
        const m = dist / (vLogs[i].liters || 1);
        mileages.push(m);
        costs.push(vLogs[i].totalCost || 0);

        const d = vLogs[i].date?.toDate ? vLogs[i].date.toDate() : new Date(vLogs[i].date);
        const monthKey = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        if (!monthlyMileage[monthKey]) monthlyMileage[monthKey] = [];
        monthlyMileage[monthKey].push(m);
      }
    }

    if (mileages.length === 0) return;

    const avgMileage = mileages.reduce((s, v) => s + v, 0) / mileages.length;
    const avgCost = costs.reduce((s, v) => s + v, 0) / costs.length;
    const lastMileage = mileages[mileages.length - 1];
    const lastCost = costs[costs.length - 1];

    // ── Low mileage warning ──
    if (lastMileage < avgMileage * 0.85) {
      alerts.push({
        type: 'warning',
        icon: '⚠️',
        title: `Low Mileage - ${vName}`,
        message: `Last fill-up mileage (${formatNumber(lastMileage)} km/L) is ${formatNumber(((avgMileage - lastMileage) / avgMileage) * 100)}% below your average (${formatNumber(avgMileage)} km/L). Consider checking tire pressure or driving habits.`,
        priority: 2
      });
    }

    // ── High fuel cost alert ──
    if (lastCost > avgCost * 1.2) {
      alerts.push({
        type: 'danger',
        icon: '🚨',
        title: `High Fuel Cost - ${vName}`,
        message: `Last fill-up cost (${formatCurrency(lastCost)}) is ${formatNumber(((lastCost - avgCost) / avgCost) * 100)}% above your average (${formatCurrency(avgCost)}).`,
        priority: 1
      });
    }

    // ── Best efficiency period ──
    if (Object.keys(monthlyMileage).length >= 2) {
      let bestMonth = null;
      let bestAvg = 0;

      Object.entries(monthlyMileage).forEach(([month, vals]) => {
        const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
        if (avg > bestAvg) {
          bestAvg = avg;
          bestMonth = month;
        }
      });

      if (bestMonth) {
        const [y, m] = bestMonth.split('-');
        const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        alerts.push({
          type: 'success',
          icon: '🏆',
          title: `Best Efficiency - ${vName}`,
          message: `Your best mileage was in ${monthNames[parseInt(m) - 1]} ${y} with an average of ${formatNumber(bestAvg)} km/L. Great driving!`,
          priority: 3
        });
      }
    }

    // ── Good mileage tip ──
    if (lastMileage >= avgMileage * 1.1) {
      alerts.push({
        type: 'success',
        icon: '✅',
        title: `Great Efficiency - ${vName}`,
        message: `Your latest mileage (${formatNumber(lastMileage)} km/L) is above average! Keep up the good driving.`,
        priority: 4
      });
    }
  });

  // Sort by priority
  alerts.sort((a, b) => a.priority - b.priority);

  if (alerts.length === 0) {
    container.innerHTML = '';
    container.appendChild(emptyState);
    emptyState.style.display = '';
    return;
  }

  emptyState.style.display = 'none';
  container.innerHTML = alerts.map(a => `
    <div class="card slide-up" style="margin-bottom:var(--space-4);border-left:4px solid var(--${a.type === 'danger' ? 'danger' : a.type === 'warning' ? 'warning' : 'accent'}-500);">
      <div style="display:flex;align-items:flex-start;gap:var(--space-4);">
        <span style="font-size:1.5rem;flex-shrink:0;">${a.icon}</span>
        <div>
          <div style="font-weight:600;font-family:var(--font-heading);margin-bottom:var(--space-1);">${a.title}</div>
          <div style="font-size:var(--text-sm);color:var(--text-secondary);">${a.message}</div>
        </div>
      </div>
    </div>
  `).join('');
};

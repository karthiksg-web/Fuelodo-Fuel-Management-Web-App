// ============================================
// FuelOdo - Smart Insights Engine
// Generates natural-language insights on the Dashboard
// ============================================

window.loadInsights = function() {
  const container = document.getElementById('insightsContainer');
  if (!container) return;

  const logs = AppState.allFuelLogs;
  const maintenanceLogs = AppState.allMaintenanceLogs || [];

  if (logs.length < 2) {
    container.innerHTML = `
      <div class="insight-card insight-empty">
        <span class="insight-icon">💡</span>
        <span>Add at least 2 fuel entries to unlock smart insights!</span>
      </div>`;
    return;
  }

  const insights = [];
  const now = new Date();
  const thisMonth = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonth = lastMonthDate.getFullYear() + '-' + String(lastMonthDate.getMonth() + 1).padStart(2, '0');

  // ── Group logs by month ──
  const monthly = {};
  logs.forEach(l => {
    const d = l.date?.toDate ? l.date.toDate() : new Date(l.date);
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    if (!monthly[key]) monthly[key] = { cost: 0, liters: 0, logs: [] };
    monthly[key].cost += l.totalCost || 0;
    monthly[key].liters += l.liters || 0;
    monthly[key].logs.push(l);
  });

  const thisMonthData = monthly[thisMonth];
  const lastMonthData = monthly[lastMonth];

  // ── Insight 1: Monthly spend comparison ──
  if (thisMonthData && lastMonthData && lastMonthData.cost > 0) {
    const diff = thisMonthData.cost - lastMonthData.cost;
    const pct = Math.abs((diff / lastMonthData.cost) * 100).toFixed(0);
    if (Math.abs(diff) > 50) {
      insights.push({
        icon: diff > 0 ? '📈' : '📉',
        type: diff > 0 ? 'warning' : 'good',
        text: diff > 0
          ? `You spent <strong>${formatCurrency(Math.abs(diff))} more</strong> on fuel this month vs last month (+${pct}%)`
          : `You saved <strong>${formatCurrency(Math.abs(diff))}</strong> on fuel this month vs last month (-${pct}%) 🎉`
      });
    }
  }

  // ── Insight 2: Mileage trend (per vehicle) ──
  const byVehicle = {};
  logs.forEach(l => {
    if (!byVehicle[l.vehicleId]) byVehicle[l.vehicleId] = { name: l.vehicleName || 'Vehicle', logs: [] };
    byVehicle[l.vehicleId].logs.push(l);
  });

  Object.values(byVehicle).forEach(({ name, logs: vLogs }) => {
    const sorted = [...vLogs].sort((a, b) => {
      const da = a.date?.toDate ? a.date.toDate().getTime() : new Date(a.date).getTime();
      const db2 = b.date?.toDate ? b.date.toDate().getTime() : new Date(b.date).getTime();
      return da - db2;
    });

    const mileages = [];
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].isFullTank === false) continue;
      const dist = (sorted[i].odometer || 0) - (sorted[i - 1].odometer || 0);
      if (dist > 0 && sorted[i].liters > 0) {
        mileages.push(dist / sorted[i].liters);
      }
    }

    if (mileages.length >= 3) {
      const recent = mileages.slice(-2);
      const older = mileages.slice(0, -2);
      const recentAvg = recent.reduce((s, v) => s + v, 0) / recent.length;
      const olderAvg = older.reduce((s, v) => s + v, 0) / older.length;
      const drop = olderAvg - recentAvg;

      if (drop > 1.5) {
        insights.push({
          icon: '⚠️',
          type: 'warning',
          text: `<strong>${name}</strong> mileage dropped by <strong>${drop.toFixed(1)} km/L</strong> recently. Check tire pressure or air filter.`
        });
      } else if (recentAvg > olderAvg + 1) {
        insights.push({
          icon: '🏆',
          type: 'good',
          text: `<strong>${name}</strong> efficiency improved by <strong>${(recentAvg - olderAvg).toFixed(1)} km/L</strong>! Great driving.`
        });
      }
    }
  });

  // ── Insight 3: Best performing vehicle ──
  const vehicleAvgMileage = {};
  Object.entries(byVehicle).forEach(([vid, { name, logs: vLogs }]) => {
    const sorted = [...vLogs].sort((a, b) => {
      const da = a.date?.toDate ? a.date.toDate().getTime() : new Date(a.date).getTime();
      const db2 = b.date?.toDate ? b.date.toDate().getTime() : new Date(b.date).getTime();
      return da - db2;
    });
    const m = [];
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].isFullTank === false) continue;
      const dist = (sorted[i].odometer || 0) - (sorted[i - 1].odometer || 0);
      if (dist > 0 && sorted[i].liters > 0) m.push(dist / sorted[i].liters);
    }
    if (m.length > 0) vehicleAvgMileage[name] = m.reduce((s, v) => s + v, 0) / m.length;
  });

  const vehicleNames = Object.keys(vehicleAvgMileage);
  if (vehicleNames.length >= 2) {
    const best = vehicleNames.reduce((a, b) => vehicleAvgMileage[a] > vehicleAvgMileage[b] ? a : b);
    insights.push({
      icon: '🚗',
      type: 'info',
      text: `<strong>${best}</strong> is your most fuel-efficient vehicle at <strong>${vehicleAvgMileage[best].toFixed(1)} km/L</strong>`
    });
  }

  // ── Insight 4: Fuel price trend ──
  const recentLogs = [...logs].sort((a, b) => {
    const da = a.date?.toDate ? a.date.toDate().getTime() : new Date(a.date).getTime();
    const db2 = b.date?.toDate ? b.date.toDate().getTime() : new Date(b.date).getTime();
    return db2 - da;
  }).slice(0, 6);

  if (recentLogs.length >= 2) {
    const latest = recentLogs[0].pricePerLiter || 0;
    const older = recentLogs.slice(1);
    const olderAvgPrice = older.reduce((s, l) => s + (l.pricePerLiter || 0), 0) / older.length;
    const priceDiff = latest - olderAvgPrice;
    if (Math.abs(priceDiff) > 1) {
      insights.push({
        icon: priceDiff > 0 ? '⛽' : '💰',
        type: priceDiff > 0 ? 'warning' : 'good',
        text: priceDiff > 0
          ? `Fuel price <strong>up ₹${Math.abs(priceDiff).toFixed(1)}/L</strong> compared to your recent average`
          : `Fuel price <strong>down ₹${Math.abs(priceDiff).toFixed(1)}/L</strong> — good time to fill up!`
      });
    }
  }

  // ── Insight 5: Maintenance due ──
  if (maintenanceLogs.length > 0) {
    const thisMonthMaint = maintenanceLogs.filter(m => {
      const d = m.date?.toDate ? m.date.toDate() : new Date(m.date);
      const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      return key === thisMonth;
    });
    const maintCostThisMonth = thisMonthMaint.reduce((s, m) => s + (m.cost || 0), 0);
    if (maintCostThisMonth > 0) {
      insights.push({
        icon: '🔧',
        type: 'info',
        text: `You spent <strong>${formatCurrency(maintCostThisMonth)}</strong> on maintenance this month`
      });
    }
  }

  if (insights.length === 0) {
    container.innerHTML = `
      <div class="insight-card insight-empty">
        <span class="insight-icon">✅</span>
        <span>Everything looks great! Keep tracking to unlock more insights.</span>
      </div>`;
    return;
  }

  container.innerHTML = insights.map(ins => `
    <div class="insight-card insight-${ins.type} slide-up">
      <span class="insight-icon">${ins.icon}</span>
      <span class="insight-text">${ins.text}</span>
    </div>
  `).join('');
};

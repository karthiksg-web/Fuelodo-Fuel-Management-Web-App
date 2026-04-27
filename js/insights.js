// ============================================
// FuelOdo - Smart Insights Engine v2
// Premium horizontal card design
// ============================================

window.loadInsights = function() {
  const container = document.getElementById('insightsContainer');
  if (!container) return;

  const logs = AppState.allFuelLogs;
  const maintenanceLogs = AppState.allMaintenanceLogs || [];

  // ── Card builder ──
  function card(icon, type, headline, detail) {
    return `
      <div class="insight-card insight-${type}">
        <div class="insight-icon">${icon}</div>
        <div class="insight-text">
          <strong>${headline}</strong>
          ${detail}
        </div>
      </div>`;
  }

  if (logs.length < 2) {
    container.innerHTML = card('💡', 'info',
      'Start tracking',
      'Add at least 2 fuel entries to unlock smart insights.'
    );
    return;
  }

  const cards = [];
  const now = new Date();
  const thisMonth = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonth = lastMonthDate.getFullYear() + '-' + String(lastMonthDate.getMonth() + 1).padStart(2, '0');

  // ── Group logs by month ──
  const monthly = {};
  logs.forEach(l => {
    const d = l.date?.toDate ? l.date.toDate() : new Date(l.date);
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    if (!monthly[key]) monthly[key] = { cost: 0, liters: 0 };
    monthly[key].cost   += l.totalCost || 0;
    monthly[key].liters += l.liters    || 0;
  });

  // ── Insight 1: Monthly spend comparison ──
  const tm = monthly[thisMonth];
  const lm = monthly[lastMonth];
  if (tm && lm && lm.cost > 0) {
    const diff = tm.cost - lm.cost;
    const pct  = Math.abs((diff / lm.cost) * 100).toFixed(0);
    if (Math.abs(diff) > 50) {
      cards.push(card(
        diff > 0 ? '📈' : '📉',
        diff > 0 ? 'warning' : 'good',
        diff > 0 ? `+${formatCurrency(Math.abs(diff))} this month` : `-${formatCurrency(Math.abs(diff))} saved`,
        diff > 0
          ? `${pct}% more on fuel vs last month`
          : `${pct}% less on fuel vs last month 🎉`
      ));
    }
  }

  // ── Group by vehicle ──
  const byVehicle = {};
  logs.forEach(l => {
    if (!byVehicle[l.vehicleId]) byVehicle[l.vehicleId] = { name: l.vehicleName || 'Vehicle', logs: [] };
    byVehicle[l.vehicleId].logs.push(l);
  });

  // ── Insight 2: Mileage trend per vehicle ──
  Object.values(byVehicle).forEach(({ name, logs: vLogs }) => {
    const sorted = [...vLogs].sort((a, b) => {
      const da  = a.date?.toDate ? a.date.toDate().getTime() : new Date(a.date).getTime();
      const db2 = b.date?.toDate ? b.date.toDate().getTime() : new Date(b.date).getTime();
      return da - db2;
    });
    const mileages = [];
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].isFullTank === false) continue;
      const dist = (sorted[i].odometer || 0) - (sorted[i-1].odometer || 0);
      if (dist > 0 && sorted[i].liters > 0) mileages.push(dist / sorted[i].liters);
    }
    if (mileages.length >= 3) {
      const recent    = mileages.slice(-2);
      const older     = mileages.slice(0, -2);
      const recentAvg = recent.reduce((s, v) => s + v, 0) / recent.length;
      const olderAvg  = older.reduce((s, v) => s + v, 0) / older.length;
      const drop      = olderAvg - recentAvg;
      if (drop > 1.5) {
        cards.push(card('⚠️', 'warning',
          `−${drop.toFixed(1)} km/L drop`,
          `${name} mileage fell. Check tire pressure or air filter.`
        ));
      } else if (recentAvg > olderAvg + 1) {
        cards.push(card('🏆', 'good',
          `+${(recentAvg - olderAvg).toFixed(1)} km/L gain`,
          `${name} efficiency improved. Great driving!`
        ));
      }
    }
  });

  // ── Insight 3: Best performing vehicle ──
  const vehicleAvg = {};
  Object.entries(byVehicle).forEach(([, { name, logs: vLogs }]) => {
    const sorted = [...vLogs].sort((a, b) => {
      const da  = a.date?.toDate ? a.date.toDate().getTime() : new Date(a.date).getTime();
      const db2 = b.date?.toDate ? b.date.toDate().getTime() : new Date(b.date).getTime();
      return da - db2;
    });
    const m = [];
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].isFullTank === false) continue;
      const dist = (sorted[i].odometer || 0) - (sorted[i-1].odometer || 0);
      if (dist > 0 && sorted[i].liters > 0) m.push(dist / sorted[i].liters);
    }
    if (m.length > 0) vehicleAvg[name] = m.reduce((s, v) => s + v, 0) / m.length;
  });
  const names = Object.keys(vehicleAvg);
  if (names.length >= 2) {
    const best = names.reduce((a, b) => vehicleAvg[a] > vehicleAvg[b] ? a : b);
    cards.push(card('🚗', 'info',
      `${vehicleAvg[best].toFixed(1)} km/L`,
      `Best efficiency: ${best}`
    ));
  }

  // ── Insight 4: Cost per km trend ──
  // Compare average cost/km this month vs last month
  const cpkThisMonth = [];
  const cpkLastMonth = [];
  logs.forEach(l => {
    if (!l.costPerKm) return;
    const d   = l.date?.toDate ? l.date.toDate() : new Date(l.date);
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    if (key === thisMonth) cpkThisMonth.push(l.costPerKm);
    if (key === lastMonth) cpkLastMonth.push(l.costPerKm);
  });
  if (cpkThisMonth.length > 0 && cpkLastMonth.length > 0) {
    const avgNow  = cpkThisMonth.reduce((s, v) => s + v, 0) / cpkThisMonth.length;
    const avgPrev = cpkLastMonth.reduce((s, v) => s + v, 0) / cpkLastMonth.length;
    const diff    = avgNow - avgPrev;
    if (Math.abs(diff) > 0.3) {
      cards.push(card(
        diff > 0 ? '📊' : '💪',
        diff > 0 ? 'warning' : 'good',
        diff > 0
          ? `₹${diff.toFixed(1)}/km costlier`
          : `₹${Math.abs(diff).toFixed(1)}/km cheaper`,
        diff > 0
          ? `Your running cost per km rose this month`
          : `Your running cost per km dropped — great efficiency!`
      ));
    }
  }

  // ── Insight 5: Fill-up frequency ──
  const fillsThisMonth = (monthly[thisMonth]?.logs?.length) ||
    logs.filter(l => {
      const d = l.date?.toDate ? l.date.toDate() : new Date(l.date);
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') === thisMonth;
    }).length;
  const fillsLastMonth = (monthly[lastMonth]?.logs?.length) ||
    logs.filter(l => {
      const d = l.date?.toDate ? l.date.toDate() : new Date(l.date);
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') === lastMonth;
    }).length;
  if (fillsThisMonth > 0) {
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysPassed  = now.getDate();
    const freq = Math.round(daysPassed / fillsThisMonth);
    let freqText = `Every ~${freq} day${freq !== 1 ? 's' : ''} this month`;
    if (fillsLastMonth > 0 && fillsThisMonth > fillsLastMonth) {
      freqText += ` (more frequent than last month)`;
    }
    cards.push(card('🗓️', 'info',
      `${fillsThisMonth} fill-up${fillsThisMonth !== 1 ? 's' : ''} this month`,
      freqText
    ));
  }

  // ── Insight 6: Maintenance this month ──
  if (maintenanceLogs.length > 0) {
    const thisMaint = maintenanceLogs.filter(m => {
      const d   = m.date?.toDate ? m.date.toDate() : new Date(m.date);
      const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      return key === thisMonth;
    });
    const mCost = thisMaint.reduce((s, m) => s + (m.cost || 0), 0);
    if (mCost > 0) {
      cards.push(card('🔧', 'info',
        formatCurrency(mCost),
        `Maintenance spend this month (${thisMaint.length} service${thisMaint.length !== 1 ? 's' : ''})`
      ));
    }
  }

  if (cards.length === 0) {
    container.innerHTML = card('✅', 'good',
      'All clear!',
      'Keep tracking to unlock more insights.'
    );
    return;
  }

  container.innerHTML = cards.join('');
};

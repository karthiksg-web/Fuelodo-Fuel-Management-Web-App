// ============================================
// FuelOdo - Smart Alerts & Insights Engine v2
// Features: Severity Tags, Cost/km Insight, 0.8x / 1.2x dynamic rules
// ============================================

window.loadAlerts = function() {
  const container = document.getElementById('alertsList');
  const emptyState = document.getElementById('alertsEmpty');
  const logs = AppState.allFuelLogs;

  // Show skeleton while loading
  container.innerHTML = `
    <div class="skeleton-card"></div>
    <div class="skeleton-card"></div>
    <div class="skeleton-card"></div>`;

  if (logs.length < 2) {
    container.innerHTML = '';
    container.appendChild(emptyState);
    emptyState.style.display = '';
    return;
  }

  const alerts = [];

  // ── Group logs by vehicle ──
  const byVehicle = {};
  logs.forEach(l => {
    if (!byVehicle[l.vehicleId]) byVehicle[l.vehicleId] = [];
    byVehicle[l.vehicleId].push(l);
  });

  Object.entries(byVehicle).forEach(([vid, vLogs]) => {
    const vehicle = AppState.vehicles.find(v => v.id === vid);
    const vName = vehicle ? vehicle.name : 'Vehicle';

    // Sort ascending by date
    vLogs.sort((a, b) => {
      const da = a.date?.toDate ? a.date.toDate().getTime() : new Date(a.date).getTime();
      const db2 = b.date?.toDate ? b.date.toDate().getTime() : new Date(b.date).getTime();
      return da - db2;
    });

    const mileages = [];
    const costs = [];
    const costPerKms = [];
    const monthlyData = {};

    for (let i = 1; i < vLogs.length; i++) {
      // Skip partial fills for mileage accuracy
      if (vLogs[i].isFullTank === false) continue;
      const dist = (vLogs[i].odometer || 0) - (vLogs[i - 1].odometer || 0);
      if (dist > 0) {
        const m = dist / (vLogs[i].liters || 1);
        const c = vLogs[i].totalCost || 0;
        const cpk = dist > 0 ? c / dist : 0;

        mileages.push(m);
        costs.push(c);
        costPerKms.push(cpk);

        const d = vLogs[i].date?.toDate ? vLogs[i].date.toDate() : new Date(vLogs[i].date);
        const monthKey = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '00');
        if (!monthlyData[monthKey]) monthlyData[monthKey] = { mileages: [], costPerKms: [] };
        monthlyData[monthKey].mileages.push(m);
        monthlyData[monthKey].costPerKms.push(cpk);
      }
    }

    if (mileages.length === 0) return;

    const avgMileage = mileages.reduce((s, v) => s + v, 0) / mileages.length;
    const avgCost = costs.reduce((s, v) => s + v, 0) / costs.length;
    const lastMileage = mileages[mileages.length - 1];
    const lastCost = costs[costs.length - 1];

    // ── RULE 1: Mileage dropped significantly (< 80% of avg) ──
    if (lastMileage < avgMileage * 0.8) {
      const drop = (((avgMileage - lastMileage) / avgMileage) * 100).toFixed(1);
      alerts.push({
        severity: 'critical',
        icon: '🔴',
        label: 'Critical',
        title: `Mileage Dropped Significantly — ${vName}`,
        message: `Latest mileage ${formatNumber(lastMileage)} km/L is ${drop}% below your average of ${formatNumber(avgMileage)} km/L. Check tire pressure, air filter, or driving habits.`,
        tip: 'Consider a vehicle inspection.',
        priority: 1
      });
    } else if (lastMileage < avgMileage * 0.9) {
      // Mild warning (90%)
      const drop = (((avgMileage - lastMileage) / avgMileage) * 100).toFixed(1);
      alerts.push({
        severity: 'warning',
        icon: '🟡',
        label: 'Warning',
        title: `Mileage Slightly Low — ${vName}`,
        message: `Latest mileage ${formatNumber(lastMileage)} km/L is ${drop}% below average (${formatNumber(avgMileage)} km/L).`,
        tip: 'Monitor over next 2 fill-ups.',
        priority: 2
      });
    }

    // ── RULE 2: Fuel cost unusually high (> 120% of avg) ──
    if (lastCost > avgCost * 1.2) {
      const rise = (((lastCost - avgCost) / avgCost) * 100).toFixed(1);
      alerts.push({
        severity: 'critical',
        icon: '🔴',
        label: 'Critical',
        title: `Fuel Cost Unusually High — ${vName}`,
        message: `Last fill-up cost ${formatCurrency(lastCost)} is ${rise}% above average (${formatCurrency(avgCost)}). Possible price surge or overfill.`,
        tip: 'Compare with nearby station prices.',
        priority: 1
      });
    }

    // ── RULE 3: Cost per km comparison (current vs previous month) ──
    const sortedMonths = Object.keys(monthlyData).sort();
    if (sortedMonths.length >= 2) {
      const prevMonth = sortedMonths[sortedMonths.length - 2];
      const currMonth = sortedMonths[sortedMonths.length - 1];

      const prevAvgCpk = monthlyData[prevMonth].costPerKms.reduce((s, v) => s + v, 0) / monthlyData[prevMonth].costPerKms.length;
      const currAvgCpk = monthlyData[currMonth].costPerKms.reduce((s, v) => s + v, 0) / monthlyData[currMonth].costPerKms.length;

      if (prevAvgCpk > 0 && currAvgCpk > 0) {
        const pctChange = (((currAvgCpk - prevAvgCpk) / prevAvgCpk) * 100).toFixed(1);
        const [cy, cm] = currMonth.split('-');
        const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const currLabel = `${monthNames[parseInt(cm) - 1]} ${cy}`;

        if (parseFloat(pctChange) > 10) {
          alerts.push({
            severity: 'warning',
            icon: '🟡',
            label: 'Warning',
            title: `Cost/km Up ${pctChange}% This Month — ${vName}`,
            message: `Your cost per km in ${currLabel} is ₹${currAvgCpk.toFixed(2)}/km, which is ${pctChange}% higher than last month (₹${prevAvgCpk.toFixed(2)}/km).`,
            tip: 'Review fuel prices & driving efficiency.',
            priority: 2
          });
        } else if (parseFloat(pctChange) < -10) {
          alerts.push({
            severity: 'good',
            icon: '🟢',
            label: 'Good',
            title: `Cost/km Improved ${Math.abs(pctChange)}% — ${vName}`,
            message: `Excellent! Cost per km in ${currLabel} is ₹${currAvgCpk.toFixed(2)}/km, down ${Math.abs(pctChange)}% from last month (₹${prevAvgCpk.toFixed(2)}/km).`,
            tip: 'Keep up the efficient driving!',
            priority: 4
          });
        } else {
          alerts.push({
            severity: 'good',
            icon: '🟢',
            label: 'Stable',
            title: `Cost/km Stable — ${vName}`,
            message: `Cost per km in ${currLabel}: ₹${currAvgCpk.toFixed(2)}/km (${pctChange > 0 ? '+' : ''}${pctChange}% vs last month).`,
            tip: '',
            priority: 5
          });
        }
      }
    }

    // ── RULE 4: Good efficiency ──
    if (lastMileage >= avgMileage * 1.1) {
      alerts.push({
        severity: 'good',
        icon: '🟢',
        label: 'Excellent',
        title: `Great Efficiency — ${vName}`,
        message: `Latest mileage ${formatNumber(lastMileage)} km/L exceeds your average by ${(((lastMileage - avgMileage) / avgMileage) * 100).toFixed(1)}%. Outstanding driving!`,
        tip: '',
        priority: 4
      });
    }

    // ── RULE 5: Best month ──
    if (Object.keys(monthlyData).length >= 2) {
      let bestMonth = null;
      let bestAvg = 0;
      Object.entries(monthlyData).forEach(([month, data]) => {
        const avg = data.mileages.reduce((s, v) => s + v, 0) / data.mileages.length;
        if (avg > bestAvg) { bestAvg = avg; bestMonth = month; }
      });

      if (bestMonth) {
        const [y, m] = bestMonth.split('-');
        const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        alerts.push({
          severity: 'good',
          icon: '🏆',
          label: 'Record',
          title: `Best Month — ${vName}`,
          message: `Best mileage: ${monthNames[parseInt(m) - 1]} ${y} with avg ${formatNumber(bestAvg)} km/L.`,
          tip: '',
          priority: 5
        });
      }
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

  // Limit to top 5 by default, show expand button if more
  const maxVisible = 5;
  const visible = alerts.slice(0, maxVisible);
  const hidden = alerts.slice(maxVisible);

  container.innerHTML = `
    <div class="alerts-summary">
      <div class="alerts-count-row">
        <span class="alerts-count-badge critical">${alerts.filter(a => a.severity === 'critical').length} Critical</span>
        <span class="alerts-count-badge warning">${alerts.filter(a => a.severity === 'warning').length} Warning</span>
        <span class="alerts-count-badge good">${alerts.filter(a => a.severity === 'good').length} Good</span>
      </div>
    </div>
    ${visible.map(a => `
    <div class="alert-card slide-up severity-${a.severity}">
      <div class="alert-left">
        <span class="alert-sev-icon">${a.icon}</span>
      </div>
      <div class="alert-body">
        <div class="alert-header-row">
          <span class="alert-title">${a.title}</span>
          <span class="severity-badge ${a.severity}">${a.label}</span>
        </div>
        <div class="alert-message">${a.message}</div>
        ${a.tip ? `<div class="alert-tip">💡 ${a.tip}</div>` : ''}
      </div>
    </div>`).join('')}
    ${hidden.length > 0 ? `
    <div id="hiddenAlerts" style="display:none;">
      ${hidden.map(a => `
      <div class="alert-card slide-up severity-${a.severity}">
        <div class="alert-left"><span class="alert-sev-icon">${a.icon}</span></div>
        <div class="alert-body">
          <div class="alert-header-row">
            <span class="alert-title">${a.title}</span>
            <span class="severity-badge ${a.severity}">${a.label}</span>
          </div>
          <div class="alert-message">${a.message}</div>
          ${a.tip ? `<div class="alert-tip">💡 ${a.tip}</div>` : ''}
        </div>
      </div>`).join('')}
    </div>
    <button class="btn btn-ghost" id="showAllAlertsBtn" onclick="document.getElementById('hiddenAlerts').style.display='';this.style.display='none';" style="width:100%;margin-top:var(--space-2);">
      Show ${hidden.length} more alerts
    </button>` : ''}`;
}

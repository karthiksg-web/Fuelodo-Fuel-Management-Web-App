// ============================================
// FuelOdo - Dashboard (Stats + Charts)
// ============================================

let expenseChart = null;
let mileageChart = null;

window.initDashboard = function() {
  const logs = getFilteredLogs();

  // ── Stat Cards ──
  const totalCost = logs.reduce((s, l) => s + (l.totalCost || 0), 0);
  let totalDistance = 0;
  let totalMileage = 0;
  let mileageCount = 0;

  let latestOdo = 0;
  let latestMileage = 0;
  let absoluteLatestTime = 0;

  // Group by vehicle for proper distance calc
  const byVehicle = {};
  logs.forEach(l => {
    if (!byVehicle[l.vehicleId]) byVehicle[l.vehicleId] = [];
    byVehicle[l.vehicleId].push(l);
  });

  Object.values(byVehicle).forEach(vLogs => {
    if (window.sortLogsAsc) {
      window.sortLogsAsc(vLogs);
    } else {
      vLogs.sort((a, b) => {
        const da = a.date?.toDate ? a.date.toDate().getTime() : new Date(a.date).getTime();
        const db2 = b.date?.toDate ? b.date.toDate().getTime() : new Date(b.date).getTime();
        return da - db2;
      });
    }

    if (vLogs.length > 0) {
      const last = vLogs[vLogs.length - 1]; // Guaranteed newest due to sortLogsAsc
      if ((last.odometer || 0) > latestOdo) latestOdo = last.odometer;
    }

    let vLatestMileage = 0;
    let vLatestTime = 0;

    for (let i = 1; i < vLogs.length; i++) {
      const dist = (vLogs[i].odometer || 0) - (vLogs[i-1].odometer || 0);
      if (dist > 0) {
        totalDistance += dist;
        const m = dist / (vLogs[i].liters || 1);
        totalMileage += m;
        mileageCount++;

        const dTime = vLogs[i].date?.toDate ? vLogs[i].date.toDate().getTime() : new Date(vLogs[i].date).getTime();
        // If it's a newer date, OR same date but occurred later in array
        if (dTime > vLatestTime || (dTime === vLatestTime)) {
          vLatestTime = dTime;
          vLatestMileage = m;
        }
      }
    }

    // Capture the overall absolute latest mileage to show on the gauge
    if (vLatestTime > absoluteLatestTime || (vLatestTime === absoluteLatestTime && vLatestMileage > 0)) {
      absoluteLatestTime = vLatestTime;
      latestMileage = vLatestMileage;
    }
  });

  const avgMileage = mileageCount > 0 ? totalMileage / mileageCount : 0;

  document.getElementById('statTotalCost').textContent = formatCurrency(totalCost);
  document.getElementById('statTotalDistance').textContent = totalDistance.toLocaleString() + ' km';
  document.getElementById('statAvgMileage').textContent = formatNumber(avgMileage) + ' km/L';
  document.getElementById('statTotalFillups').textContent = logs.length;

  // ── Speedometer (Latest Mileage) ──
  if (typeof updateSpeedometer === 'function') {
    updateSpeedometer(latestMileage);
  }

  // ── Digital Odometer (Latest Odometer) ──
  if (typeof updateOdometer === 'function') {
    updateOdometer(latestOdo);
  }

  // ── Charts ──
  renderExpenseChart(logs);
  renderMileageChart(logs, byVehicle);
};

function renderExpenseChart(logs) {
  const ctx = document.getElementById('expenseChart');
  if (!ctx) return;

  // Group by month
  const monthly = {};
  logs.forEach(l => {
    const d = l.date?.toDate ? l.date.toDate() : new Date(l.date);
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    monthly[key] = (monthly[key] || 0) + (l.totalCost || 0);
  });

  const labels = Object.keys(monthly).sort();
  const data = labels.map(k => monthly[k]);

  const displayLabels = labels.map(k => {
    const [y, m] = k.split('-');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return months[parseInt(m) - 1] + ' ' + y.slice(2);
  });

  if (expenseChart) expenseChart.destroy();
  
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

  expenseChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: displayLabels,
      datasets: [{
        label: 'Fuel Cost (₹)',
        data: data,
        borderColor: '#3b5bff',
        backgroundColor: 'rgba(59, 91, 255, 0.1)',
        borderWidth: 2.5,
        fill: true,
        tension: 0.4,
        pointRadius: 4,
        pointBackgroundColor: '#3b5bff',
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
          backgroundColor: isDark ? '#1e2538' : '#fff',
          titleColor: isDark ? '#f1f5f9' : '#0f172a',
          bodyColor: isDark ? '#94a3b8' : '#475569',
          borderColor: isDark ? 'rgba(241,245,249,0.1)' : 'rgba(15,23,42,0.1)',
          borderWidth: 1,
          cornerRadius: 8,
          padding: 12,
          callbacks: {
            label: (ctx) => '₹' + ctx.parsed.y.toLocaleString('en-IN')
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: isDark ? '#64748b' : '#94a3b8', font: { size: 11 } }
        },
        y: {
          grid: { color: isDark ? 'rgba(241,245,249,0.04)' : 'rgba(15,23,42,0.04)' },
          ticks: {
            color: isDark ? '#64748b' : '#94a3b8',
            font: { size: 11 },
            callback: (v) => '₹' + v.toLocaleString('en-IN')
          }
        }
      }
    }
  });
}

function renderMileageChart(logs, byVehicle) {
  const ctx = document.getElementById('mileageChart');
  if (!ctx) return;

  // Calculate mileage per fill-up with dates
  const points = [];
  Object.values(byVehicle).forEach(vLogs => {
    for (let i = 1; i < vLogs.length; i++) {
      const dist = (vLogs[i].odometer || 0) - (vLogs[i-1].odometer || 0);
      if (dist > 0) {
        const d = vLogs[i].date?.toDate ? vLogs[i].date.toDate() : new Date(vLogs[i].date);
        points.push({
          date: d,
          mileage: dist / (vLogs[i].liters || 1)
        });
      }
    }
  });

  points.sort((a, b) => a.date - b.date);

  const labels = points.map(p => p.date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }));
  const data = points.map(p => parseFloat(p.mileage.toFixed(1)));

  if (mileageChart) mileageChart.destroy();

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

  mileageChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Mileage (km/L)',
        data: data,
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
          backgroundColor: isDark ? '#1e2538' : '#fff',
          titleColor: isDark ? '#f1f5f9' : '#0f172a',
          bodyColor: isDark ? '#94a3b8' : '#475569',
          borderColor: isDark ? 'rgba(241,245,249,0.1)' : 'rgba(15,23,42,0.1)',
          borderWidth: 1,
          cornerRadius: 8,
          padding: 12,
          callbacks: {
            label: (ctx) => ctx.parsed.y + ' km/L'
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: isDark ? '#64748b' : '#94a3b8', font: { size: 11 } }
        },
        y: {
          grid: { color: isDark ? 'rgba(241,245,249,0.04)' : 'rgba(15,23,42,0.04)' },
          ticks: {
            color: isDark ? '#64748b' : '#94a3b8',
            font: { size: 11 },
            callback: (v) => v + ' km/L'
          }
        }
      }
    }
  });
}

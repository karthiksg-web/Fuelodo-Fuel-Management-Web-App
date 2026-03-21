// ============================================
// FuelOdo - Export (CSV / PDF) & Monthly Summary
// ============================================

(function() {
  document.addEventListener('DOMContentLoaded', () => {
    // ── CSV Export ──
    document.getElementById('exportCsvBtn').addEventListener('click', exportCSV);
    
    // ── PDF Export ──
    document.getElementById('exportPdfBtn').addEventListener('click', exportPDF);
  });

  function exportCSV() {
    const logs = AppState.allFuelLogs;
    if (logs.length === 0) {
      showToast('No data to export', 'warning');
      return;
    }

    const headers = ['Date', 'Vehicle', 'Fuel Type', 'Liters', 'Price/L', 'Total Cost', 'Odometer', 'Distance', 'Mileage (km/L)', 'Cost/km'];
    
    const rows = logs.map(l => {
      const d = l.date?.toDate ? l.date.toDate() : new Date(l.date);
      return [
        d.toISOString().split('T')[0],
        l.vehicleName || '',
        l.fuelType || '',
        l.liters || '',
        l.pricePerLiter || '',
        l.totalCost || '',
        l.odometer || '',
        l.distance || '',
        l.mileage ? l.mileage.toFixed(2) : '',
        l.costPerKm ? l.costPerKm.toFixed(2) : ''
      ].join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    
    downloadBlob(blob, `FuelOdo_Export_${new Date().toISOString().split('T')[0]}.csv`);
    showToast('CSV downloaded!', 'success');
  }

  function exportPDF() {
    const logs = AppState.allFuelLogs;
    if (logs.length === 0) {
      showToast('No data to export', 'warning');
      return;
    }

    try {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();

      // Title
      doc.setFontSize(20);
      doc.setTextColor(59, 91, 255);
      doc.text('FuelOdo - Fuel Report', 14, 22);

      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`Generated on ${new Date().toLocaleDateString('en-IN')}`, 14, 30);

      // Stats summary
      const totalCost = logs.reduce((s, l) => s + (l.totalCost || 0), 0);
      const totalLiters = logs.reduce((s, l) => s + (l.liters || 0), 0);
      
      doc.setFontSize(12);
      doc.setTextColor(30);
      doc.text(`Total Fill-ups: ${logs.length}`, 14, 42);
      doc.text(`Total Fuel Cost: ${formatCurrency(totalCost)}`, 14, 50);
      doc.text(`Total Liters: ${totalLiters.toFixed(1)} L`, 14, 58);

      // Table
      const tableData = logs.map(l => {
        const d = l.date?.toDate ? l.date.toDate() : new Date(l.date);
        return [
          d.toLocaleDateString('en-IN'),
          l.vehicleName || '—',
          `${(l.liters || 0).toFixed(1)} L`,
          formatCurrency(l.totalCost),
          `${(l.odometer || 0).toLocaleString()} km`,
          l.mileage ? l.mileage.toFixed(1) + ' km/L' : '—'
        ];
      });

      doc.autoTable({
        startY: 66,
        head: [['Date', 'Vehicle', 'Liters', 'Cost', 'Odometer', 'Mileage']],
        body: tableData,
        styles: {
          fontSize: 8,
          cellPadding: 3
        },
        headStyles: {
          fillColor: [59, 91, 255],
          textColor: 255,
          fontStyle: 'bold'
        },
        alternateRowStyles: {
          fillColor: [245, 247, 252]
        }
      });

      doc.save(`FuelOdo_Report_${new Date().toISOString().split('T')[0]}.pdf`);
      showToast('PDF downloaded!', 'success');
    } catch (err) {
      console.error('PDF export error:', err);
      showToast('Failed to generate PDF', 'error');
    }
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ── Monthly Summary ──
  window.loadMonthlySummary = function() {
    const container = document.getElementById('monthlySummaryContainer');
    const logs = AppState.allFuelLogs;

    if (logs.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📊</div>
          <h3>No data yet</h3>
          <p>Add fuel entries to see your monthly summary</p>
        </div>`;
      return;
    }

    // Group by month
    const monthly = {};
    logs.forEach(l => {
      const d = l.date?.toDate ? l.date.toDate() : new Date(l.date);
      const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      if (!monthly[key]) {
        monthly[key] = { cost: 0, liters: 0, count: 0, distances: [], mileages: [] };
      }
      monthly[key].cost += l.totalCost || 0;
      monthly[key].liters += l.liters || 0;
      monthly[key].count++;
      if (l.distance) monthly[key].distances.push(l.distance);
      if (l.mileage) monthly[key].mileages.push(l.mileage);
    });

    const months = Object.keys(monthly).sort().reverse();
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    container.innerHTML = `
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Month</th>
              <th>Fill-ups</th>
              <th>Total Liters</th>
              <th>Total Cost</th>
              <th>Total Distance</th>
              <th>Avg Mileage</th>
            </tr>
          </thead>
          <tbody>
            ${months.map(key => {
              const m = monthly[key];
              const [y, mo] = key.split('-');
              const totalDist = m.distances.reduce((s, d) => s + d, 0);
              const avgMileage = m.mileages.length > 0
                ? (m.mileages.reduce((s, v) => s + v, 0) / m.mileages.length)
                : 0;
              return `<tr>
                <td><strong>${monthNames[parseInt(mo) - 1]} ${y}</strong></td>
                <td>${m.count}</td>
                <td>${m.liters.toFixed(1)} L</td>
                <td><strong>${formatCurrency(m.cost)}</strong></td>
                <td>${totalDist.toLocaleString()} km</td>
                <td>${avgMileage > 0 ? avgMileage.toFixed(1) + ' km/L' : '—'}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  };
})();

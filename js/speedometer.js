// ============================================
// FuelOdo - Speedometer & Odometer
// ============================================

(function() {
  // Arc parameters for the SVG speedometer
  const ARC_LENGTH = 345; // approximate arc length from SVG path
  const MAX_MILEAGE = 30; // max km/L for full-scale

  // ── Update Speedometer Gauge ──
  window.updateSpeedometer = function(mileage) {
    const arc = document.getElementById('speedoArc');
    const needle = document.getElementById('speedoNeedle');
    const valueText = document.getElementById('speedoValue');
    const ticksGroup = document.getElementById('speedoTicks');

    if (!arc || !needle) return;

    const clamped = Math.min(Math.max(mileage, 0), MAX_MILEAGE);
    const ratio = clamped / MAX_MILEAGE;

    // Update arc fill
    const offset = ARC_LENGTH * (1 - ratio);
    arc.setAttribute('stroke-dashoffset', offset);

    // Update needle rotation
    // Arc goes from ~225° (left) to ~315° (right) -> 180° sweep
    // Needle rotates from -90° to +90° relative to vertical center
    const angle = -90 + (ratio * 180);
    needle.setAttribute('transform', `rotate(${angle}, 140, 150)`);

    // Update value text
    valueText.textContent = mileage.toFixed(1);

    // Draw tick marks
    renderTicks(ticksGroup);
  };

  function renderTicks(group) {
    if (!group || group.children.length > 0) return; // only render once
    
    const cx = 140, cy = 150, r = 120;
    const startAngle = 225;
    const endAngle = 315;
    const steps = 6; // 0, 5, 10, 15, 20, 25, 30

    for (let i = 0; i <= steps; i++) {
      const value = (MAX_MILEAGE / steps) * i;
      const angle = startAngle + ((endAngle - startAngle) / steps) * i;
      const rad = (angle * Math.PI) / 180;

      const x1 = cx + (r - 5) * Math.cos(rad);
      const y1 = cy + (r - 5) * Math.sin(rad);
      const x2 = cx + (r + 8) * Math.cos(rad);
      const y2 = cy + (r + 8) * Math.sin(rad);

      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', x1);
      line.setAttribute('y1', y1);
      line.setAttribute('x2', x2);
      line.setAttribute('y2', y2);
      line.setAttribute('stroke', 'var(--text-tertiary)');
      line.setAttribute('stroke-width', '1.5');
      group.appendChild(line);

      // Label
      const textX = cx + (r + 20) * Math.cos(rad);
      const textY = cy + (r + 20) * Math.sin(rad);
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', textX);
      text.setAttribute('y', textY + 3);
      text.setAttribute('class', 'speedo-tick-text');
      text.textContent = Math.round(value);
      group.appendChild(text);
    }
  }

  // ── Update Digital Odometer ──
  window.updateOdometer = function(value) {
    const display = document.getElementById('odometerDisplay');
    if (!display) return;

    const padded = String(Math.round(value)).padStart(6, '0');
    const digits = display.querySelectorAll('.odo-digit');

    digits.forEach((digit, i) => {
      const newVal = padded[i] || '0';
      if (digit.textContent !== newVal) {
        digit.style.transition = 'none';
        digit.style.transform = 'translateY(-100%)';
        digit.style.opacity = '0';
        
        setTimeout(() => {
          digit.textContent = newVal;
          digit.style.transition = 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';
          digit.style.transform = 'translateY(0)';
          digit.style.opacity = '1';
        }, 50 + i * 80);
      }
    });
  };
})();

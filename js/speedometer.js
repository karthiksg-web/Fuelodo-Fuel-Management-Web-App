// ============================================
// FuelOdo - Speedometer / Gauge Widget v2
// Features: Dynamic zones (<30, 30-40, >40), efficiency labels
// ============================================

window.updateSpeedometer = function(mileageValue) {
  const arc = document.getElementById('speedoArc');
  const needle = document.getElementById('speedoNeedle');
  const valueText = document.getElementById('speedoValue');
  const ticksGroup = document.getElementById('speedoTicks');
  const labelText = document.getElementById('speedoLabelText');

  if (!arc || !needle || !valueText) return;

  const MAX_VAL = 80;
  const clamped = Math.min(Math.max(mileageValue, 0), MAX_VAL);
  
  // Calculate angle (0 to 180 degrees mapping to -90 to 90 for SVG rotation)
  // Max 80 means each unit is 180/80 = 2.25 degrees
  const angle = (clamped / MAX_VAL) * 180;
  const needleRotation = angle - 90;

  // Animate needle
  needle.style.transformOrigin = '140px 150px';
  needle.style.transition = 'transform 1s cubic-bezier(0.4, 0, 0.2, 1)';
  needle.style.transform = `rotate(${needleRotation}deg)`;

  // Update text
  valueText.textContent = clamped.toFixed(1);

  // Update efficiency label color and text
  if (labelText) {
    if (clamped === 0) {
      labelText.textContent = "No Data";
      labelText.style.fill = 'var(--text-tertiary)';
    } else if (clamped < 30) {
      labelText.textContent = "Efficiency: Low";
      labelText.style.fill = 'var(--danger-500)';
    } else if (clamped <= 40) {
      labelText.textContent = "Efficiency: Medium";
      labelText.style.fill = 'var(--warning-500)';
    } else if (clamped <= 60) {
      labelText.textContent = "Efficiency: High";
      labelText.style.fill = 'var(--success-500)';
    } else {
      labelText.textContent = "Efficiency: Excellent";
      labelText.style.fill = 'var(--success-500)';
    }
  }

  // Draw ticks
  if (ticksGroup && ticksGroup.children.length === 0) {
    for (let i = 0; i <= MAX_VAL; i += 10) {
      const a = (i / MAX_VAL) * Math.PI; // 0 to PI
      // Center is 140, 150
      // Radius outer = 110, inner = 100
      const x1 = 140 - 110 * Math.cos(a);
      const y1 = 150 - 110 * Math.sin(a);
      const x2 = 140 - 100 * Math.cos(a);
      const y2 = 150 - 100 * Math.sin(a);

      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", x1);
      line.setAttribute("y1", y1);
      line.setAttribute("x2", x2);
      line.setAttribute("y2", y2);
      line.setAttribute("stroke", "var(--border-color)");
      line.setAttribute("stroke-width", "2");

      if (i % 20 === 0) {
        line.setAttribute("stroke-width", "3");
        // Add text
        const tx = 140 - 85 * Math.cos(a);
        const ty = 150 - 85 * Math.sin(a);
        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x", tx);
        text.setAttribute("y", ty + 4);
        text.setAttribute("class", "speedo-tick-text");
        text.setAttribute("text-anchor", "middle");
        text.textContent = i;
        ticksGroup.appendChild(text);
      }
      
      ticksGroup.appendChild(line);
    }
  }
};

window.updateOdometer = function(odometerValue) {
  const display = document.getElementById('odometerDisplay');
  if (!display) return;

  const valStr = Math.floor(odometerValue || 0).toString().padStart(6, '0');
  const digits = display.querySelectorAll('.odo-digit');
  
  for (let i = 0; i < 6; i++) {
    const digitEl = digits[i];
    if (digitEl) {
      // Small animation effect
      if (digitEl.textContent !== valStr[i]) {
        digitEl.style.transform = 'translateY(-10px)';
        digitEl.style.opacity = '0';
        setTimeout(() => {
          digitEl.textContent = valStr[i];
          digitEl.style.transform = 'translateY(10px)';
          setTimeout(() => {
            digitEl.style.transform = 'translateY(0)';
            digitEl.style.opacity = '1';
          }, 50);
        }, 150);
      }
    }
  }
};

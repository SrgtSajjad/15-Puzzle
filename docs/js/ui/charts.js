/**
 * Lightweight zero-dependency SVG chart renderer for trajectory progress,
 * GA convergence, and multi-algorithm benchmark comparisons.
 */
function createSvgEl(tag, attrs = {}) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, String(v));
  }
  return el;
}

export function renderLineChart(
  container,
  {
    title,
    series,
    xLabel = "Generation",
    height = 240,
    highlightX = null,
    emptyText = "No data yet.",
  }
) {
  container.innerHTML = "";
  if (!series || series.length === 0 || series[0].points.length === 0) {
    container.innerHTML = `<div class="chart-empty">${emptyText}</div>`;
    return;
  }

  const width = 520;
  const pad = { top: 28, right: 18, bottom: 34, left: 48 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const s of series) {
    for (const pt of s.points) {
      if (pt.x < minX) minX = pt.x;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.y > maxY) maxY = pt.y;
    }
  }
  if (maxX === minX) maxX = minX + 1;
  if (maxY === minY) {
    maxY = minY + 1;
    minY = Math.max(0, minY - 1);
  }
  const yPad = (maxY - minY) * 0.08;
  minY = Math.max(0, minY - yPad);
  maxY += yPad;

  const scaleX = (x) => pad.left + ((x - minX) / (maxX - minX)) * plotW;
  const scaleY = (y) => pad.top + plotH - ((y - minY) / (maxY - minY)) * plotH;

  const svg = createSvgEl("svg", {
    viewBox: `0 0 ${width} ${height}`,
    class: "svg-chart",
    role: "img",
    "aria-label": title,
  });

  // Grid lines & Y ticks
  const yTicks = 4;
  for (let i = 0; i <= yTicks; i++) {
    const val = minY + ((maxY - minY) * i) / yTicks;
    const y = scaleY(val);
    svg.appendChild(
      createSvgEl("line", {
        x1: pad.left,
        y1: y,
        x2: width - pad.right,
        y2: y,
        class: "chart-grid",
      })
    );
    const label = createSvgEl("text", {
      x: pad.left - 8,
      y: y + 4,
      "text-anchor": "end",
      class: "chart-tick",
    });
    label.textContent = Math.abs(val) >= 100 ? Math.round(val) : val.toFixed(0);
    svg.appendChild(label);
  }

  // Axes
  svg.appendChild(
    createSvgEl("line", {
      x1: pad.left,
      y1: pad.top + plotH,
      x2: width - pad.right,
      y2: pad.top + plotH,
      class: "chart-axis",
    })
  );
  svg.appendChild(
    createSvgEl("line", {
      x1: pad.left,
      y1: pad.top,
      x2: pad.left,
      y2: pad.top + plotH,
      class: "chart-axis",
    })
  );

  // Highlight cursor
  if (highlightX !== null && highlightX >= minX && highlightX <= maxX) {
    const hx = scaleX(highlightX);
    svg.appendChild(
      createSvgEl("line", {
        x1: hx,
        y1: pad.top,
        x2: hx,
        y2: pad.top + plotH,
        stroke: "var(--accent)",
        "stroke-width": 1.6,
        "stroke-dasharray": "4 3",
      })
    );
  }

  // X ticks
  const xSteps = Math.min(4, Math.max(1, maxX - minX));
  for (let i = 0; i <= xSteps; i++) {
    const val = Math.round(minX + ((maxX - minX) * i) / xSteps);
    const x = scaleX(val);
    const label = createSvgEl("text", {
      x,
      y: pad.top + plotH + 15,
      "text-anchor": "middle",
      class: "chart-tick",
    });
    label.textContent = val;
    svg.appendChild(label);
  }

  const xTitle = createSvgEl("text", {
    x: pad.left + plotW / 2,
    y: height - 4,
    "text-anchor": "middle",
    class: "chart-label",
  });
  xTitle.textContent = xLabel;
  svg.appendChild(xTitle);

  // Plot series paths
  series.forEach((s) => {
    const d = s.points
      .map((pt, idx) => `${idx === 0 ? "M" : "L"}${scaleX(pt.x).toFixed(1)},${scaleY(pt.y).toFixed(1)}`)
      .join(" ");
    svg.appendChild(
      createSvgEl("path", {
        d,
        fill: "none",
        stroke: s.color,
        "stroke-width": 2.4,
        "stroke-linejoin": "round",
        "stroke-linecap": "round",
      })
    );
  });

  // Legend
  let legendX = pad.left;
  series.forEach((s) => {
    svg.appendChild(
      createSvgEl("rect", {
        x: legendX,
        y: 7,
        width: 10,
        height: 10,
        rx: 2,
        fill: s.color,
      })
    );
    const txt = createSvgEl("text", {
      x: legendX + 14,
      y: 16,
      class: "chart-legend",
    });
    txt.textContent = s.label;
    svg.appendChild(txt);
    legendX += s.label.length * 7 + 30;
  });

  container.appendChild(svg);
}

export function renderBarChart(
  container,
  { title, bars, valueFormatter = (v) => String(v), emptyText = "Run Compare All Algorithms to visualize comparison." }
) {
  container.innerHTML = "";
  if (!bars || bars.length === 0) {
    container.innerHTML = `<div class="chart-empty">${emptyText}</div>`;
    return;
  }

  const width = 560;
  const height = Math.max(220, bars.length * 28 + 44);
  const pad = { top: 24, right: 78, bottom: 20, left: 168 };
  const plotW = width - pad.left - pad.right;
  const maxVal = Math.max(1, ...bars.map((b) => b.value));

  const svg = createSvgEl("svg", {
    viewBox: `0 0 ${width} ${height}`,
    class: "svg-chart",
    role: "img",
    "aria-label": title,
  });

  const titleEl = createSvgEl("text", {
    x: pad.left,
    y: 15,
    class: "chart-legend",
  });
  titleEl.textContent = title;
  svg.appendChild(titleEl);

  bars.forEach((bar, idx) => {
    const y = pad.top + idx * 28;
    const barW = bar.value > 0 ? Math.max(3, (bar.value / maxVal) * plotW) : 2;

    const lbl = createSvgEl("text", {
      x: pad.left - 8,
      y: y + 15,
      "text-anchor": "end",
      class: "chart-tick",
    });
    lbl.textContent = bar.label;
    svg.appendChild(lbl);

    svg.appendChild(
      createSvgEl("rect", {
        x: pad.left,
        y: y + 3,
        width: barW,
        height: 16,
        rx: 4,
        fill: bar.color || "var(--accent)",
        opacity: bar.solved ? "0.94" : "0.35",
      })
    );

    const valLbl = createSvgEl("text", {
      x: pad.left + barW + 6,
      y: y + 15,
      class: "chart-tick",
    });
    const suffix = bar.solved ? "" : bar.status === "terminated" ? " (stopped)" : " (limit)";
    valLbl.textContent = `${valueFormatter(bar.value)}${suffix}`;
    svg.appendChild(valLbl);
  });

  container.appendChild(svg);
}

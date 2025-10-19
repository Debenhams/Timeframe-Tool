// === moved from HTML: time header builder ===
(function () {
  if (typeof window.renderTimeHeader !== 'function') {
    const DAY_START = 6 * 60;   // 06:00
    const DAY_END   = 20 * 60;  // 20:00

    window.renderTimeHeader = function (el) {
      if (!el) return;
      el.innerHTML = '';

      const wrap = document.createElement('div');
      wrap.className = 'time-scale';

      for (let m = DAY_START; m <= DAY_END; m += 60) {
        const tick = document.createElement('div');
        tick.className = 'tick';
        tick.style.left = `${((m - DAY_START) / (DAY_END - DAY_START)) * 100}%`;
        const h = Math.floor(m / 60);
        const mm = String(m % 60).padStart(2, '0');
        tick.textContent = `${h}:${mm}`;
        wrap.appendChild(tick);
      }

      el.appendChild(wrap);
    };
  }
})();

// ---- moved from HTML: renderPlanner (guarded) ----
(function () {
  // If already defined somewhere (e.g., inline), don't redefine
  if (typeof window.renderPlanner === 'function') return;

  // Helpers – must mirror what your HTML used
  const DAY_START = 6 * 60;   // 06:00
  const DAY_END   = 20 * 60;  // 20:00
  const SPAN = DAY_END - DAY_START;

  const toPct = (m) => ((m - DAY_START) / SPAN) * 100;

  const m2t = (mins) => {
    const h = String(Math.floor(mins / 60)).padStart(2, '0');
    const mm = String(mins % 60).padStart(2, '0');
    return `${h}:${mm}`;
  };

  // Map codes to existing CSS classes (match your current scheme)
  const classForCode = (code) => {
    const k = (code || '').toLowerCase();
    if (/\blunch\b/.test(k)) return 'c-lunch';
    if (/\bbreak\b/.test(k)) return 'c-break';
    if (/\bmeeting\b/.test(k)) return 'c-meeting';
    if (/\bovertime\b/.test(k)) return 'c-overtime';
    if (/\bmirakl\b/.test(k)) return 'c-mirakl';
    if (/\bsocial\b/.test(k)) return 'c-social';
    if (/\bemail\b/.test(k)) return 'c-email';
    return 'c-email';
  };

  // Main render function (moved from HTML)
  window.renderPlanner = function renderPlanner(rows) {
    try {
      const body = document.getElementById('plannerBody');
      const header = document.getElementById('timeHeader');
      if (!body || !header) return;

      // Clear previous content
      body.innerHTML = '';
      header.innerHTML = '';

      // Build time ticks in header
      const scale = document.createElement('div');
      scale.className = 'time-scale';
      for (let m = DAY_START; m <= DAY_END; m += 60) {
        const tick = document.createElement('div');
        tick.className = 'tick';
        tick.style.left = `${toPct(m)}%`;
        tick.textContent = m2t(m);
        scale.appendChild(tick);
      }
      header.appendChild(scale);

      // Build each row
      (rows || []).forEach((r) => {
        const row = document.createElement('div');
        row.className = 'planner__row';

        const name = document.createElement('div');
        name.className = 'planner__name';
        name.textContent = `${r.name || ''}${r.badge ? ` · ${r.badge}` : ''}`;
        row.appendChild(name);

        const timeline = document.createElement('div');
        timeline.className = 'planner__timeline';

        (r.segments || []).forEach((seg) => {
          const leftPct = toPct(seg.start);
          const rightPct = toPct(seg.end);
          const widthPct = Math.max(0, rightPct - leftPct);

          const bar = document.createElement('div');
          bar.className = `planner__bar ${classForCode(seg.code)}`;
          bar.style.left = `${leftPct}%`;
          bar.style.width = `${widthPct}%`;
          bar.title = `${seg.code} ${m2t(seg.start)}–${m2t(seg.end)}`;

          timeline.appendChild(bar);
        });

        row.appendChild(timeline);
        body.appendChild(row);
      });
    } catch (e) {
      console.warn('renderPlanner error', e);
    }
  };
})();
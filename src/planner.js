// src/planner.js
// Safe external implementations for planner render + time header.
// Guards ensure we don't overwrite anything if it already exists.

(() => {
  // ----- small helpers (local, no globals) -----
  const DAY_START = 6 * 60;   // 06:00
  const DAY_END   = 20 * 60;  // 20:00
  const SPAN = DAY_END - DAY_START;

  // mm -> "H:MM"
  function m2t(mins) {
    const h = Math.floor(mins / 60);
    const m = String(mins % 60).padStart(2, "0");
    return `${h}:${m}`;
  }

  // left/width percentages based on minutes
  function toPct(mins) {
    return ((mins - DAY_START) / SPAN) * 100;
  }

  // --- classForCode moved from HTML (guarded) ---
if (typeof window.classForCode !== 'function') {
  window.classForCode = function classForCode(code) {
    const k = (code || '').toLowerCase();
    if (/\blunch\b/.test(k)) return 'c-lunch';
    if (/\bbreak\b/.test(k)) return 'c-break';
    if (/\bovertime\b/.test(k)) return 'c-overtime';
    if (/\bmirakl\b/.test(k)) return 'c-mirakl';
    if (/\bsocial\b/.test(k)) return 'c-social';
    if (/\bemail\b/.test(k)) return 'c-email';
    if (/\b121\b/.test(k) || /\batl\b/.test(k) ||
        /\bcoaching\b/.test(k) || /\bhuddle\b/.test(k) ||
        /\biti\b/.test(k) || /\bprojects\b/.test(k) ||
        /\bteam\b/.test(k) || /\bmeeting\b/.test(k) ||
        /\btraining\b/.test(k))
      return 'c-email';
    return 'c-email';
  };
}
  // match existing colour classes
  function classFor(code) {
    const k = String(code || "").toLowerCase();
    if (/\blunch\b/.test(k))  return "c-lunch";
    if (/\bbreak\b/.test(k))  return "c-break";
    if (/\bmeeting\b/.test(k))return "c-meeting";
    if (/\bovertime\b/.test(k))return "c-overtime";
    if (/\bmiraki\b/.test(k)) return "c-miraki";
    if (/\bsocial\b/.test(k)) return "c-social";
    if (/\bemail\b/.test(k))  return "c-email";
    return "c-email"; // default you already used
  }

  // ----- time header (already working; keep guard) -----
  if (typeof window.renderTimeHeader !== "function") {
    window.renderTimeHeader = function renderTimeHeader(el) {
      if (!el) return;
      el.innerHTML = "";
      const scale = document.createElement("div");
      scale.className = "time-scale";

      for (let m = DAY_START; m <= DAY_END; m += 60) {
        const tick = document.createElement("div");
        tick.className = "tick";
        tick.style.left = `${toPct(m)}%`;
        tick.textContent = m2t(m);
        scale.appendChild(tick);
      }
      el.appendChild(scale);
    };
  }

  // ----- MISSING PART: rows/bars renderer -----
  if (typeof window.renderPlanner !== "function") {
    window.renderPlanner = function renderPlanner(rows) {
      const body   = document.getElementById("plannerBody");
      const header = document.getElementById("timeHeader");
      if (!body || !header) return;

      // wipe current UI
      body.innerHTML = "";
      header.innerHTML = "";

      // rebuild time header ticks
      window.renderTimeHeader(header);

      // build rows
      (rows || []).forEach(r => {
        const row = document.createElement("div");
        row.className = "planner__row";

        const name = document.createElement("div");
        name.className = "planner__name";
        name.innerHTML = `${r.name || ""}${r.badge ? ` <span class="planner__badge">${r.badge}</span>` : ""}`;

        const timeline = document.createElement("div");
        timeline.className = "planner__timeline";

        (r.segments || []).forEach(seg => {
          const leftPct  = toPct(seg.start);
          const rightPct = toPct(seg.end);
          const widthPct = Math.max(0, rightPct - leftPct);

          const bar = document.createElement("div");
          bar.className = `planner__bar ${classFor(seg.code)}`;
          bar.style.left  = `${leftPct}%`;
          bar.style.width = `${widthPct}%`;
          bar.title = `${seg.code} ${m2t(seg.start)}–${m2t(seg.end)}`;
          timeline.appendChild(bar);
        });

        row.appendChild(name);
        row.appendChild(timeline);
        body.appendChild(row);
      });
    };
  }
})();
// src/planner.js
// Safe external implementations for the horizontal planner + time header.
// All exports are guarded (defined only if missing) so we don't clobber
// anything that already exists elsewhere in your app.

(() => {
  // -----------------------------
  // Shared cache (ensure exists)
  // -----------------------------
  window.ROTAS = window.ROTAS || new Map(); // Map<key, weekJson>

  // -----------------------------
  // Small helpers (local)
  // -----------------------------
  const DAY_START = 6 * 60;   // 06:00
  const DAY_END   = 20 * 60;  // 20:00
  const SPAN = DAY_END - DAY_START;

  function m2t(mins) {
    const h = Math.floor(mins / 60);
    const m = String(mins % 60).padStart(2, "0");
    return `${h}:${m}`;
  }

  function toPct(mins) {
    return ((mins - DAY_START) / SPAN) * 100;
  }

  // Fallback minute parser if the app didn't expose toMin()/fmt()
  function toMinFallback(hhmm) {
    if (typeof hhmm !== "string") return 0;
    const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return 0;
    return (+m[1]) * 60 + (+m[2]);
  }
  const toMin = (typeof window.toMin === "function")
    ? window.toMin
    : toMinFallback;

  const fmt = (typeof window.fmt === "function")
    ? window.fmt
    : (x) => x;

  // -----------------------------
  // Colour classes
  // -----------------------------
  if (typeof window.classForCode !== "function") {
    window.classForCode = function classForCode(code) {
      const k = (code || "").toLowerCase();
      if (/\blunch\b/.test(k))     return "c-lunch";
      if (/\bbreak\b/.test(k))     return "c-break";
      if (/\bmeeting\b/.test(k))   return "c-meeting";
      if (/\bovertime\b/.test(k))  return "c-overtime";
      if (/\bmirakl?\b/.test(k))   return "c-mirakl";
      if (/\bsocial\b/.test(k))    return "c-social";
      if (/\bemail\b/.test(k))     return "c-email";
      return "c-email";
    };
  }
  const classFor = window.classForCode;

  // -----------------------------
  // Time header renderer
  // -----------------------------
  if (typeof window.renderTimeHeader !== "function") {
    window.renderTimeHeader = function renderTimeHeader(el) {
      if (!el) return;
      el.textContent = "";
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

  // -----------------------------
  // Horizontal planner renderer
  // -----------------------------
  if (typeof window.renderPlanner !== "function") {
    window.renderPlanner = function renderPlanner(rows) {
      const body   = document.getElementById("plannerBody");
      const header = document.getElementById("timeHeader");
      if (!body || !header) return;

      // Clear and rebuild header ticks
      body.textContent = "";
      header.textContent = "";
      window.renderTimeHeader(header);

      (rows || []).forEach((r) => {
        const row = document.createElement("div");
        row.className = "planner__row";

        const name = document.createElement("div");
        name.className = "planner__name";
        name.innerHTML = `${r.name || ""}${r.badge ? ` <span class="planner__badge">${r.badge}</span>` : ""}`;

        const timeline = document.createElement("div");
        timeline.className = "planner__timeline";

        (r.segments || []).forEach((seg) => {
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

  // ------------------------------------------------
  // Compute rows from current UI state (guarded)
  // ------------------------------------------------
  if (typeof window.computePlannerRowsFromState !== "function") {
    window.computePlannerRowsFromState = function computePlannerRowsFromState() {
      // Inputs
      const ws      = document.getElementById("weekStart")?.value;
      const teamSel = document.getElementById("advisorSelect")?.value || "__TEAM_SELECTED__";
      const dayName = document.getElementById("teamDay")?.value || "Monday";

      // Globals provided elsewhere in the app:
      // selectedAdvisors : Set<string>
      // ADVISORS_LIST    : Array<{name: string, ...}>
      // ADVISOR_BY_ID    : Map<advisorId -> name>
      // ADVISOR_BY_NAME  : Map<name -> advisorId>
      // TEMPLATES        : Record<string, Template>
      // ROTAS (we ensured window.ROTAS exists)

      let names = [];
      if (teamSel === "__TEAM_SELECTED__") {
        names = [...(window.selectedAdvisors || [])];
      } else if (teamSel === "__TEAM_ALL__") {
        names = (window.ADVISORS_LIST || []).map(a => a.name);
      } else if (teamSel?.startsWith?.("advisor::")) {
        const id = teamSel.split("::")[1];
        const n  = window.ADVISOR_BY_ID?.get?.(id);
        if (n) names = [n];
      } else if (window.ADVISOR_BY_NAME?.has?.(teamSel)) {
        names = [teamSel];
      } else {
        names = [...(window.selectedAdvisors || [])];
      }

      const rows = [];

      for (const name of names.sort((a, b) => a.localeCompare(b))) {
        const aId = window.ADVISOR_BY_NAME?.get?.(name);
        if (!aId) continue;

        // tolerate different historical key formats: "<id>::<ws>", "<id>:<ws>", "<id>|<ws>", "<id>"
        const weekData =
          (window.ROTAS?.get?.(`${aId}::${ws}`) ||
           window.ROTAS?.get?.(`${aId}:${ws}`)  ||
           window.ROTAS?.get?.(`${aId}|${ws}`)  ||
           window.ROTAS?.get?.(aId)) || {};

        const dayVal = weekData[dayName];
        let segs = [];

        // Structure 1: explicit segments
        if (dayVal && typeof dayVal === "object" && Array.isArray(dayVal.segments)) {
          segs = dayVal.segments
            .filter(s => s.start && s.end)
            .map(s => ({
              type:  "work",
              code:  s.code,
              start: toMin(fmt(s.start)),
              end:   toMin(fmt(s.end))
            }))
            .filter(s => s.end > s.start)
            .sort((a, b) => a.start - b.start);

        // Structure 2: template name -> expand with breaks
        } else if (typeof dayVal === "string" && window.TEMPLATES && window.TEMPLATES[dayVal]) {
          const t = window.TEMPLATES[dayVal];
          const s = toMin(fmt(t.start_time));
          const e = toMin(fmt(t.finish_time));

          if (e > s) {
            const pauses = [];
            if (t.break1) pauses.push({ type: "break", code: "Break", start: toMin(fmt(t.break1)), end: toMin(fmt(t.break1)) + 15 });
            if (t.lunch)  pauses.push({ type: "lunch", code: "Lunch", start: toMin(fmt(t.lunch)),  end: toMin(fmt(t.lunch)) + 30 });
            if (t.break2) pauses.push({ type: "break", code: "Break", start: toMin(fmt(t.break2)), end: toMin(fmt(t.break2)) + 15 });

            pauses.sort((a, b) => a.start - b.start);

            let cur = s;
            const out = [];

            for (const p of pauses) {
              if (p.start > cur) {
                out.push({
                  type:  "work",
                  code:  t.work_code || "Admin",
                  start: cur,
                  end:   Math.min(p.start, e)
                });
              }
              out.push({
                type:  p.type,
                code:  p.code,
                start: Math.max(p.start, s),
                end:   Math.min(p.end, e)
              });
              cur = Math.max(cur, p.end);
            }

            if (cur < e) {
              out.push({
                type:  "work",
                code:  t.work_code || "Admin",
                start: cur,
                end:   e
              });
            }

            segs = out;
          }
        }

        rows.push({ name, badge: "", segments: segs });
      }

      return rows;
    };
  }
})();
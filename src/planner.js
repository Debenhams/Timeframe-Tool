// src/planner.js
// Horizontal planner + time header (safe, drop-in). Guards prevent overwriting
// existing app functions. Works with #timeHeader and #plannerBody in your HTML.
(() => {
  /**********************
   * Helpers
   **********************/
  const DAY_START = 6 * 60;   // 06:00
  const DAY_END   = 20 * 60;  // 20:00
  const SPAN      = DAY_END - DAY_START;

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const pad   = (n) => String(n).padStart(2, "0");

  // "09:30" -> minutes; supports null/undefined
  function toMin(t) {
    if (!t) return null;
    if (typeof t === "number") return t;
    const [h, m] = String(t).split(":").map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    return h * 60 + m;
  }
  function m2t(mins) {
    if (mins == null) return "";
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${pad(h)}:${pad(m)}`;
  }
  function pct(mins) {
    return ((mins - DAY_START) / SPAN) * 100;
  }
  function currentDayName() {
    return document.getElementById("teamDay")?.value || "Monday";
  }

  // Colour map → your existing CSS classes
  function classForCode(code) {
    const k = String(code || "").toLowerCase();
    if (/\blunch\b/.test(k))     return "c-lunch";
    if (/\bbreak\b/.test(k))     return "c-break";
    if (/\bmeeting\b/.test(k))   return "c-meeting";
    if (/\bovertime\b/.test(k))  return "c-overtime";
    if (/\bmirakl\b/.test(k))    return "c-mirakl";
    if (/\bsocial\b/.test(k))    return "c-social";
    if (/\bemail\b/.test(k))     return "c-email";
    if (/\bal\b/.test(k) || /\bsick\b/.test(k) || /\brdo\b/.test(k) ||
        /\bmaternity\b/.test(k) || /\blts\b/.test(k)) return "c-absence";
    if (/\b121\b/.test(k) || /\batl\b/.test(k) || /\bcoaching\b/.test(k) ||
        /\bhuddle\b/.test(k) || /\biti\b/.test(k) || /\bprojects\b/.test(k) ||
        /\bteam\b/.test(k) || /\btraining\b/.test(k)) return "c-shrink";
    return "c-email";
  }

  // Don’t overwrite if app already defined one
  if (typeof window.classForCode !== "function") {
    window.classForCode = classForCode;
  }

  /**********************
   * Time header
   **********************/
  if (typeof window.renderTimeHeader !== "function") {
    window.renderTimeHeader = function renderTimeHeader(el) {
      if (!el) return;
      el.innerHTML = "";
      const scale = document.createElement("div");
      scale.className = "time-scale";
      for (let m = DAY_START; m <= DAY_END; m += 60) {
        const tick = document.createElement("div");
        tick.className = "tick";
        tick.style.left = `${pct(m)}%`;
        tick.textContent = m2t(m);
        scale.appendChild(tick);
      }
      el.appendChild(scale);
    };
  }

  /**********************
   * Compute rows (guarded)
   * If your app already defines computePlannerRowsFromState(),
   * we don’t replace it. Otherwise we provide a compatible version.
   **********************/
  if (typeof window.computePlannerRowsFromState !== "function") {
    window.computePlannerRowsFromState = function computePlannerRowsFromState() {
      try {
        const ws = document.getElementById("weekStart")?.value;
        const sel = document.getElementById("advisorSelect")?.value || "__TEAM_SELECTED__";
        const day = currentDayName();

        // globals expected on page (from your existing HTML):
        // ADVISOR_BY_NAME, ADVISOR_BY_ID, ADVISORS_LIST, ROTAS, TEMPLATES
        const haveGlobals =
          window.ADVISOR_BY_NAME && window.ADVISORS_LIST && window.ROTAS && window.TEMPLATES;
        if (!haveGlobals) return [];

        // Resolve names set
        let names = [];
        if (sel === "__TEAM_SELECTED__") {
          names = Array.from(window.selectedAdvisors || []);
        } else if (sel === "__TEAM_ALL__") {
          names = (window.ADVISORS_LIST || []).map((a) => a.name);
        } else if (sel?.startsWith?.("advisor::")) {
          const id = sel.split("::")[1];
          const n = window.ADVISOR_BY_ID?.get(id);
          if (n) names = [n];
        } else if (window.ADVISOR_BY_NAME?.has(sel)) {
          names = [sel];
        } else {
          names = Array.from(window.selectedAdvisors || []);
        }

        const rows = [];
        names.sort((a, b) => a.localeCompare(b)).forEach((name) => {
          const aId = window.ADVISOR_BY_NAME.get(name);
          if (!aId) return;
          const key = `${aId}::${ws}`;
          const weekData = window.ROTAS.get(key) || {};
          const dayVal = weekData[day];

          let segs = [];
          if (dayVal && typeof dayVal === "object" && Array.isArray(dayVal.segments)) {
            segs = dayVal.segments
              .map((s) => ({
                code: s.code,
                start: toMin(s.start),
                end: toMin(s.end),
              }))
              .filter((s) => s.start != null && s.end != null && s.end > s.start)
              .sort((a, b) => a.start - b.start);
          } else if (typeof dayVal === "string" && window.TEMPLATES[dayVal]) {
            const t = window.TEMPLATES[dayVal];
            const s = toMin(t.start_time);
            const e = toMin(t.finish_time);
            if (e != null && s != null && e > s) {
              const pauses = [];
              if (t.break1) pauses.push({ code: "Break",  start: toMin(t.break1),  end: toMin(t.break1) + 15 });
              if (t.lunch)  pauses.push({ code: "Lunch",  start: toMin(t.lunch),   end: toMin(t.lunch) + 30 });
              if (t.break2) pauses.push({ code: "Break",  start: toMin(t.break2),  end: toMin(t.break2) + 15 });
              pauses.sort((x, y) => x.start - y.start);
              let cur = s;
              const out = [];
              for (const p of pauses) {
                if (p.start > cur) out.push({ code: t.work_code || "Admin", start: cur, end: Math.min(p.start, e) });
                out.push({ code: p.code, start: clamp(p.start, s, e), end: clamp(p.end, s, e) });
                cur = Math.max(cur, p.end);
              }
              if (cur < e) out.push({ code: t.work_code || "Admin", start: cur, end: e });
              segs = out;
            }
          }

          rows.push({ name, segments: segs });
        });

        return rows;
      } catch (e) {
        console.warn("computePlannerRowsFromState failed", e);
        return [];
      }
    };
  }

  /**********************
   * Horizontal planner renderer
   **********************/
  if (typeof window.renderPlanner !== "function") {
    window.renderPlanner = function renderPlanner(rows) {
      try {
        const body   = document.getElementById("plannerBody");
        const header = document.getElementById("timeHeader");
        if (!body || !header) return;

        // Clear & ensure header
        body.innerHTML = "";
        header.innerHTML = "";
        if (typeof window.renderTimeHeader === "function") {
          window.renderTimeHeader(header);
        }

        const day = currentDayName();

        // Empty state
        if (!rows || !rows.length) {
          const empty = document.createElement("div");
          empty.className = "muted";
          empty.style.padding = "10px";
          empty.textContent = "No rows to display. Select advisors or a leader/team.";
          body.appendChild(empty);
          return;
        }

        rows.forEach((r) => {
          const row = document.createElement("div");
          row.className = "planner__row";

          const name = document.createElement("div");
          name.className = "planner__name";
          name.textContent = r.name || "";
          row.appendChild(name);

          const tl = document.createElement("div");
          tl.className = "planner__timeline";

          (r.segments || []).forEach((seg) => {
            const s = typeof seg.start === "number" ? seg.start : toMin(seg.start);
            const e = typeof seg.end   === "number" ? seg.end   : toMin(seg.end);
            if (s == null || e == null || e <= s) return;

            const left  = clamp(pct(s), 0, 100);
            const right = clamp(pct(e), 0, 100);
            const width = clamp(right - left, 0, 100);

            const bar = document.createElement("div");
            bar.className = `planner__bar ${classForCode(seg.code)}`;
            bar.style.left  = `${left}%`;
            bar.style.width = `${width}%`;
            bar.title = `${seg.code || ""} ${m2t(s)}–${m2t(e)}`;

            // Match vertical’s click-to-edit if available
            bar.dataset.day   = day;
            bar.dataset.adv   = r.name || "";
            bar.dataset.start = m2t(s);
            bar.dataset.end   = m2t(e);
            bar.dataset.code  = seg.code || "";

            bar.addEventListener("click", (ev) => {
              if (typeof window.onBlockClick === "function") {
                // Reuse the existing editor that expects currentTarget.dataset
                window.onBlockClick({ currentTarget: bar });
              } else if (typeof window.openAssign === "function") {
                // Fallback: open day editor
                window.openAssign(day, r.name || "");
              }
            });

            tl.appendChild(bar);
          });

          row.appendChild(tl);
          body.appendChild(row);
        });
      } catch (e) {
        console.warn("renderPlanner error", e);
      }
    };
  }
})();
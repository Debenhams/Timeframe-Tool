// src/planner.js
// Safe external implementations for planner render + time header.
// Guards ensure we don't overwrite anything if it already exists.
(() => {
  // ----- constants -----
  const DAY_START = 6 * 60; // 06:00
  const DAY_END = 20 * 60; // 20:00
  const SPAN = DAY_END - DAY_START;

  // ----- helpers -----
  function m2t(mins) {
    const h = Math.floor(mins / 60);
    const m = String(mins % 60).padStart(2, "0");
    return `${h}:${m}`;
  }
  function toPct(mins) {
    return ((mins - DAY_START) / SPAN) * 100;
  }
  function toMin(str) {
    if (!str) return 0;
    const [h, m] = String(str).split(":").map(Number);
    return h * 60 + (m || 0);
  }
  function fmt(x) {
    return String(x || "").trim();
  }

  // ----- class helpers -----
  if (typeof window.classForCode !== "function") {
    window.classForCode = function classForCode(code) {
      const k = (code || "").toLowerCase();
      if (/\blunch\b/.test(k)) return "c-lunch";
      if (/\bbreak\b/.test(k)) return "c-break";
      if (/\bovertime\b/.test(k)) return "c-overtime";
      if (/\bmirakl\b/.test(k)) return "c-mirakl";
      if (/\bsocial\b/.test(k)) return "c-social";
      if (/\bemail\b/.test(k)) return "c-email";
      if (/\bmeeting\b/.test(k) || /\btraining\b/.test(k)) return "c-meeting";
      return "c-email";
    };
  }

  // backup alias
  const classFor = window.classForCode;

  // ----- time header -----
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

  // ----- horizontal planner -----
  if (typeof window.renderPlanner !== "function") {
    window.renderPlanner = function renderPlanner(rows) {
      const body = document.getElementById("plannerBody");
      const header = document.getElementById("timeHeader");
      if (!body || !header) return;

      body.innerHTML = "";
      header.innerHTML = "";
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
          const leftPct = toPct(seg.start);
          const rightPct = toPct(seg.end);
          const widthPct = Math.max(0, rightPct - leftPct);
          const bar = document.createElement("div");
          bar.className = `planner__bar ${classFor(seg.code)}`;
          bar.style.left = `${leftPct}%`;
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

  // ----- compute planner rows -----
  if (typeof window.computePlannerRowsFromState !== "function") {
    window.computePlannerRowsFromState = function computePlannerRowsFromState() {
      const ws = document.getElementById("weekStart")?.value || "current";
      const teamSel = document.getElementById("advisorSelect")?.value || "__TEAM_SELECTED__";
      const dayName = document.getElementById("teamDay")?.value || "Monday";

      // safety for missing globals
      const selectedAdvisors = window.selectedAdvisors || new Set();
      const ADVISORS_LIST = window.ADVISORS_LIST || [];
      const ADVISOR_BY_ID = window.ADVISOR_BY_ID || new Map();
      const ADVISOR_BY_NAME = window.ADVISOR_BY_NAME || new Map();
      const ROTAS = window.ROTAS || new Map();
      const TEMPLATES = window.TEMPLATES || {};

      let names = [];
      if (teamSel === "__TEAM_SELECTED__") names = [...selectedAdvisors];
      else if (teamSel === "__TEAM_ALL__") names = ADVISORS_LIST.map((a) => a.name || a);
      else if (teamSel?.startsWith?.("advisor::")) {
        const id = teamSel.split("::")[1];
        const n = ADVISOR_BY_ID.get(id);
        if (n) names = [n];
      } else if (ADVISOR_BY_NAME.has(teamSel)) {
        names = [teamSel];
      } else {
        names = [...selectedAdvisors];
      }

      const rows = [];
      for (const name of names.sort((a, b) => a.localeCompare(b))) {
        const aId = ADVISOR_BY_NAME.get(name);
        if (!aId) continue;

        const key = `${aId}::${ws}`;
        const weekData = ROTAS.get(key) || {};
        const dayVal = weekData[dayName];
        let segs = [];

        // Existing structure
        if (dayVal && typeof dayVal === "object" && Array.isArray(dayVal.segments)) {
          segs = dayVal.segments
            .filter((s) => s.start && s.end)
            .map((s) => ({
              type: "work",
              code: s.code || "Shift",
              start: toMin(s.start),
              end: toMin(s.end),
            }))
            .filter((s) => s.end > s.start)
            .sort((a, b) => a.start - b.start);
        }
        // Template structure (string points to TEMPLATES)
        else if (typeof dayVal === "string" && TEMPLATES[dayVal]) {
          const t = TEMPLATES[dayVal];
          const s = toMin(fmt(t.start_time || t.start));
          const e = toMin(fmt(t.finish_time || t.end));
          if (e > s) {
            const pauses = [];
            if (t.break1)
              pauses.push({
                type: "break",
                code: "Break",
                start: toMin(fmt(t.break1)),
                end: toMin(fmt(t.break1)) + 15,
              });
            if (t.lunch)
              pauses.push({
                type: "lunch",
                code: "Lunch",
                start: toMin(fmt(t.lunch)),
                end: toMin(fmt(t.lunch)) + 30,
              });
            if (t.break2)
              pauses.push({
                type: "break",
                code: "Break",
                start: toMin(fmt(t.break2)),
                end: toMin(fmt(t.break2)) + 15,
              });

            pauses.sort((a, b) => a.start - b.start);
            let cur = s;
            const out = [];
            for (const p of pauses) {
              if (p.start > cur)
                out.push({
                  type: "work",
                  code: t.work_code || "Work",
                  start: cur,
                  end: Math.min(p.start, e),
                });
              out.push({
                type: p.type,
                code: p.code,
                start: Math.max(p.start, s),
                end: Math.min(p.end, e),
              });
              cur = Math.max(cur, p.end);
            }
            if (cur < e)
              out.push({
                type: "work",
                code: t.work_code || "Work",
                start: cur,
                end: e,
              });
            segs = out;
          }
        }

        rows.push({ name, badge: "", segments: segs });
      }

      return rows;
    };
  }
})();

// src/planner.js
(function () {
  "use strict";

  // ----- time utils -----
  function parseHHMM(s) {
    if (!s || typeof s !== "string") return null;
    var m = s.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    var h = parseInt(m[1], 10), mm = parseInt(m[2], 10);
    return h * 60 + mm;
  }

  function toPct(min, dayStart, dayEnd) {
    if (min < dayStart) min = dayStart;
    if (min > dayEnd) min = dayEnd;
    var span = dayEnd - dayStart;
    return span > 0 ? ((min - dayStart) / span) * 100 : 0;
  }

  // default window TEMPLATES fallback, only used if page has none
  function ensureDefaultTemplates() {
    if (window.TEMPLATES instanceof Map && window.TEMPLATES.size > 0) return;
    window.TEMPLATES = new Map(Object.entries({
      Early:  { start: "07:00", end: "16:00", breaks: [{ start: "12:00", end: "12:30" }] },
      Middle: { start: "11:00", end: "20:00", breaks: [{ start: "15:00", end: "15:15" }] },
      Late:   { start: "12:00", end: "21:00", breaks: [{ start: "17:30", end: "18:00" }] }
    }));
  }

  function buildSegmentsFromTemplate(tplName) {
    ensureDefaultTemplates();
    if (!(window.TEMPLATES instanceof Map)) return [];
    var t = window.TEMPLATES.get(tplName);
    if (!t || !t.start || !t.end) return [];
    var segs = [{ kind: "shift", start: t.start, end: t.end }];
    var br = Array.isArray(t.breaks) ? t.breaks : [];
    br.forEach(function (b) {
      if (b && b.start && b.end) segs.push({ kind: "break", start: b.start, end: b.end });
    });
    return segs;
  }

  // ----- build rows from current state -----
  function computePlannerRowsFromState() {
    var wsEl = document.getElementById("weekStart");
    var dayEl = document.getElementById("teamDay");
    var ws = wsEl && wsEl.value ? wsEl.value : "";
    var dayName = dayEl && dayEl.value ? dayEl.value : "Monday";

    if (!ws || !(window.ROTAS instanceof Map)) return [];

    var rows = [];
    window.ROTAS.forEach(function (weekObj, key) {
      var parts = String(key).split("::");
      var aId = parts[0] || "";
      var kWs = parts[1] || "";
      if (kWs !== ws) return;

      var tplName = weekObj && weekObj[dayName];
      if (!tplName) return;

      var segments = buildSegmentsFromTemplate(tplName);
      if (!segments.length) return;

      var name = (window.ADVISOR_BY_ID instanceof Map && window.ADVISOR_BY_ID.get(aId)) || aId;
      rows.push({ id: aId, name: name, badge: "", segments: segments });
    });

    rows.sort(function (a, b) { return a.name.localeCompare(b.name); });
    return rows;
  }
  window.computePlannerRowsFromState = computePlannerRowsFromState;

  // ----- render time header (07:00..19:00) -----
  function renderTimeHeader(el) {
    if (!el) return;
    el.innerHTML = "";
    var start = parseHHMM("07:00");
    var end = parseHHMM("19:00");
    for (var h = 7; h <= 19; h++) {
      var d = document.createElement("div");
      d.className = "time-tick";
      d.style.position = "absolute";
      d.style.left = toPct(h * 60, start, end) + "%";
      d.style.top = "0";
      d.style.transform = "translateX(-50%)";
      d.textContent = (h < 10 ? "0" + h : String(h)) + ":00";
      el.appendChild(d);
    }
    el.style.position = "relative";
    el.style.height = "18px";
  }
  window.renderTimeHeader = renderTimeHeader;

  // ----- render horizontal planner -----
  function renderPlanner(rows) {
    var body = document.getElementById("plannerBody");
    if (!body) return;

    var start = parseHHMM("07:00");
    var end = parseHHMM("19:00");

    body.innerHTML = "";

    rows.forEach(function (row) {
      var r = document.createElement("div");
      r.className = "planner-row";
      r.style.display = "grid";
      r.style.gridTemplateColumns = "220px 1fr";
      r.style.alignItems = "center";
      r.style.gap = "8px";
      r.style.margin = "6px 0";

      var name = document.createElement("div");
      name.className = "planner-name";
      name.textContent = row.name || row.id || "";
      name.style.fontWeight = "600";

      var track = document.createElement("div");
      track.className = "planner-track";
      track.style.position = "relative";
      track.style.height = "32px";
      track.style.background = "var(--track-bg, #f7f7fb)";
      track.style.border = "1px solid #e6e6ef";
      track.style.borderRadius = "8px";
      track.style.overflow = "hidden";

      row.segments.forEach(function (seg) {
        var s = parseHHMM(seg.start);
        var e = parseHHMM(seg.end);
        if (s == null || e == null || e <= s) return;

        var left = toPct(s, start, end);
        var right = toPct(e, start, end);
        var bar = document.createElement("div");
        bar.className = "seg " + (seg.kind === "break" ? "seg-break" : "seg-shift");
        bar.style.position = "absolute";
        bar.style.left = left + "%";
        bar.style.width = Math.max(0, right - left) + "%";
        bar.style.top = seg.kind === "break" ? "8px" : "4px";
        bar.style.bottom = seg.kind === "break" ? "8px" : "4px";
        bar.style.borderRadius = "6px";
        bar.style.background = seg.kind === "break" ? "#ffdb77" : "#57c97b";
        bar.title = (seg.kind === "break" ? "Break " : "Shift ") + seg.start + " - " + seg.end;
        track.appendChild(bar);
      });

      r.appendChild(name);
      r.appendChild(track);
      body.appendChild(r);
    });
  }
  window.renderPlanner = renderPlanner;

  // ----- (optional) render vertical week -----
  function renderAdvisorWeek(/* rows */) {
    // No-op here; your existing calendar renderer can keep handling the vertical view.
  }
  window.renderAdvisorWeek = renderAdvisorWeek;
})();
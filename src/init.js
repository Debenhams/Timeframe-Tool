// src/init.js
(function () {
  "use strict";

  // --- globals (safe defaults) ---
  if (!(window.ROTAS instanceof Map)) window.ROTAS = new Map();            // key: `${advisorId}::${weekStart}` -> { Monday: 'Early', ... }
  if (!(window.TEMPLATES instanceof Map)) window.TEMPLATES = new Map();    // 'Early' -> {start:'07:00', end:'16:00', breaks:[{start,end}]}
  if (!(window.ADVISOR_BY_NAME instanceof Map)) window.ADVISOR_BY_NAME = new Map(); // name -> id
  if (!(window.ADVISOR_BY_ID instanceof Map)) window.ADVISOR_BY_ID = new Map();     // id   -> name

  // ---------- helpers ----------
  function wireOnce(el, evt, fn, tag) {
    if (!el) return;
    var key = tag || ("_wired_" + evt);
    if (el.dataset && el.dataset[key]) return;
    el.addEventListener(evt, fn);
    if (el.dataset) el.dataset[key] = "1";
  }

  function ensureTimeHeader() {
    var headerEl = document.getElementById("timeHeader");
    if (headerEl && typeof window.renderTimeHeader === "function") {
      window.renderTimeHeader(headerEl);
    }
  }

  function refreshPlannerUI() {
    var rows = [];
    if (typeof window.computePlannerRowsFromState === "function") {
      rows = window.computePlannerRowsFromState() || [];
    }
    if (typeof window.renderPlanner === "function") window.renderPlanner(rows);
    if (typeof window.renderAdvisorWeek === "function") window.renderAdvisorWeek(rows);
  }
  window.refreshPlannerUI = refreshPlannerUI; // handy in console

  // ---------- prime from Master Assignment table ----------
  function rebuildAdvisorIndexesFromTable() {
    var table = document.getElementById("assignTable");
    if (!table) return 0;

    var names = Array.prototype.slice
      .call(table.querySelectorAll("tbody tr"))
      .map(function (tr) {
        var h = tr.querySelector("th,td");
        return (h && h.textContent ? h.textContent : "").trim();
      })
      .filter(Boolean);

    window.ADVISOR_BY_NAME = new Map(names.map(function (n) { return [n, n]; }));
    window.ADVISOR_BY_ID = new Map(names.map(function (n) { return [n, n]; }));
    return names.length;
  }

  function primeRotasFromAssignTable() {
    var table = document.getElementById("assignTable");
    var wsEl = document.getElementById("weekStart");
    var dayEl = document.getElementById("teamDay");

    if (!table || !wsEl || !(window.ADVISOR_BY_NAME instanceof Map)) return 0;

    var ws = (wsEl.value || "").trim();
    if (!ws) return 0;

    var dayName = (dayEl && dayEl.value ? dayEl.value : "Monday");
    var DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    var dayIdx = DAYS.indexOf(dayName);
    if (dayIdx < 0) return 0;

    if (!(window.ROTAS instanceof Map)) window.ROTAS = new Map();
    var primed = 0;

    Array.prototype.slice.call(table.querySelectorAll("tbody tr")).forEach(function (tr) {
      var nameCell = tr.querySelector("th,td");
      var name = (nameCell && nameCell.textContent ? nameCell.textContent : "").trim();
      if (!name) return;

      var aId = window.ADVISOR_BY_NAME.get(name) || name;

      var tds = tr.querySelectorAll("td");
      var cell = tds && tds[dayIdx];
      if (!cell) return;

      var sel = cell.querySelector("select,[data-template],[data-value]");
      var tpl = "";
      if (sel) {
        if ("value" in sel) tpl = sel.value || "";
        if (!tpl) tpl = sel.getAttribute("data-template") || "";
        if (!tpl) tpl = sel.getAttribute("data-value") || "";
      }
      if (!tpl) tpl = (cell.textContent || "").trim();

      tpl = tpl.replace(/[\r\n]/g, " ").replace(/\s+/g, " ").trim();
      if (!tpl || /^day\s*off$/i.test(tpl)) return;

      var key = aId + "::" + ws;
      var weekObj = window.ROTAS.get(key) || {};
      weekObj[dayName] = tpl;
      window.ROTAS.set(key, weekObj);
      primed++;
    });

    return primed;
  }

  function watchAssignmentTable() {
    var table = document.getElementById("assignTable");
    if (!table) return;
    if (table.dataset && table.dataset._primeWired) return;

    table.addEventListener("change", function () {
      rebuildAdvisorIndexesFromTable();
      var n = primeRotasFromAssignTable();
      if (typeof window.computePlannerRowsFromState === "function" &&
          typeof window.renderPlanner === "function") {
        var rows = window.computePlannerRowsFromState() || [];
        if (rows.length || n) window.renderPlanner(rows);
      }
    });

    if (table.dataset) table.dataset._primeWired = "1";
  }

  // ---------- wiring ----------
  function wireGenerateButton() {
    var btn = document.getElementById("btnGenerate");
    if (!btn) return;
    wireOnce(btn, "click", function () {
      try {
        refreshPlannerUI();
        console.log("Schedule generated.");
      } catch (e) {
        console.error("Generate failed:", e);
      }
    });
  }

  function wireTopViewDropdown() {
    var view = document.getElementById("advisorSelect");
    if (!view) return;
    wireOnce(view, "change", function () {
      if (typeof window.updateRangeLabel === "function") window.updateRangeLabel();
      if (typeof window.renderCalendar === "function") window.renderCalendar();
      if (typeof window.populateAssignTable === "function") window.populateAssignTable();
      refreshPlannerUI();
    }, "_wired_change_advisorSelect");
  }

  function wirePlannerRefreshSources() {
    var weekStart = document.getElementById("weekStart");
    var teamDay = document.getElementById("teamDay");
    var tree = document.getElementById("tree");

    wireOnce(weekStart, "change", function () {
      if (typeof window.updateRangeLabel === "function") window.updateRangeLabel();
      if (typeof window.fetchRotasForWeek === "function" && weekStart) {
        window.fetchRotasForWeek(weekStart.value).then(function () {
          if (typeof window.populateAssignTable === "function") window.populateAssignTable();
          if (typeof window.renderCalendar === "function") window.renderCalendar();
          refreshPlannerUI();
        });
      } else {
        if (typeof window.renderCalendar === "function") window.renderCalendar();
        refreshPlannerUI();
      }
    });

    wireOnce(teamDay, "change", function () {
      if (typeof window.updateRangeLabel === "function") window.updateRangeLabel();
      if (typeof window.renderCalendar === "function") window.renderCalendar();
      refreshPlannerUI();
    });

    wireOnce(tree, "change", refreshPlannerUI, "_wired_tree_change");
    wireOnce(tree, "click", refreshPlannerUI, "_wired_tree_click");
  }

  // ===== Rotations boot helpers =====

    // 1) Load templates and build variant families (e.g., "07:00x16:00" → ["7A","7B","7C","7D"])
    async function loadShiftTemplatesAndVariants() {
      const { data: templates, error } = await supabase
        .from("shift_templates")
        .select("code, start_time, break1, lunch, break2, end_time");
      if (error) { console.error("shift_templates error", error); return; }

      window.SHIFT_BY_CODE = Object.fromEntries(templates.map(function (t) { return [t.code, t]; }));
      var groups = {};
      var hhmm = function (x) { return (x || "").toString().slice(0, 5); };
      templates.forEach(function (t) {
        var key = hhmm(t.start_time) + "x" + hhmm(t.end_time);
        if (!groups[key]) groups[key] = [];
        groups[key].push(t.code);
      });
      Object.keys(groups).forEach(function (k) { groups[k].sort(); });
      window.VARIANTS_BY_START_END = groups; // { "07:00x16:00": ["7A","7B","7C","7D"], ... }
    }

    // 2) Load rotations-with-hours view
    async function loadRotationsWithHours() {
      const { data, error } = await supabase
        .from("v_rotations_with_hours")
        .select("name, week, dow, is_rdo, shift_code, start_hhmm, end_hhmm, start_end_key")
        .order("name")
        .order("week")
        .order("dow");
      if (error) { console.error("v_rotations_with_hours error", error); return; }

      var idx = {};
      data.forEach(function (r) {
        if (!idx[r.name]) idx[r.name] = {};
        if (!idx[r.name][r.week]) idx[r.name][r.week] = {};
        idx[r.name][r.week][r.dow] = {
          is_rdo: r.is_rdo,
          start_end_key: r.start_end_key
        };
      });
      window.ROTATION = idx;  // lookup: ROTATION[name][week][dow]
    }

    // 3) Round-robin assign A/B/C/D etc. within a (site,date,start_end) group
    function assignVariantsRoundRobin(advisorIdsInGroup, startEndKey) {
      var variants = (window.VARIANTS_BY_START_END && window.VARIANTS_BY_START_END[startEndKey]) || [];
      if (!variants.length) return {};
      var sorted = advisorIdsInGroup ? advisorIdsInGroup.slice().sort() : [];
      var result = {};
      for (var i = 0; i < sorted.length; i++) result[sorted[i]] = variants[i % variants.length];
      return result; // { advisorId: "7A" | "7B" | ... }
    }
    globalThis.assignVariantsRoundRobin = assignVariantsRoundRobin;

    // 4) Effective week in 6-week cycle
    function effectiveWeek(startDateStr, plannerWeekStartStr) {
      var start = new Date(startDateStr);
      var plan = new Date(plannerWeekStartStr);
      var diffDays = Math.floor((plan - start) / 86400000);
      var diffWeeks = Math.floor(diffDays / 7);
      return ((diffWeeks % 6) + 6) % 6 + 1; // 1..6
    }
    globalThis.effectiveWeek = effectiveWeek;

    // 5) Boot rotations
    async function bootRotations() {
      await loadShiftTemplatesAndVariants();
      await loadRotationsWithHours();
      console.log("Rotations booted", {
        templates: Object.keys(window.SHIFT_BY_CODE || {}).length,
        families: Object.keys(window.VARIANTS_BY_START_END || {}).length
      });
    }
    globalThis.bootRotations = bootRotations; 
    
    console.log("rotations helpers loaded");

    // ---------- boot ----------
    async function boot() {
      try {
        if (typeof window.loadOrg === "function") await window.loadOrg();
        if (typeof window.loadTemplates === "function") await window.loadTemplates();
        if (typeof window.loadAssignments === "function") await window.loadAssignments();

        var wsEl = document.getElementById("weekStart");
        if (wsEl && typeof window.fetchRotasForWeek === "function") {
          var ws = (wsEl.value || "").trim();
          if (ws) {
            try { await window.fetchRotasForWeek(ws); } catch (_) {}
          }
        }

        if (typeof window.rebuildAdvisorDropdown === "function") window.rebuildAdvisorDropdown();
        if (typeof window.rebuildTree === "function") window.rebuildTree();
        if (typeof window.refreshChips === "function") window.refreshChips();
        if (typeof window.populateTemplateEditor === "function") window.populateTemplateEditor();
        if (typeof window.populateAssignTable === "function") window.populateAssignTable();
        if (typeof window.updateRangeLabel === "function") window.updateRangeLabel();
        if (typeof window.renderCalendar === "function") window.renderCalendar();

        ensureTimeHeader();

        // Prime from table so ROTAS reflects visible selections
        rebuildAdvisorIndexesFromTable();
        primeRotasFromAssignTable();
        await window.bootRotations();

        refreshPlannerUI();
      } catch (e) {
        console.warn("planner boot skipped", e);
      }

      if (typeof window.subscribeRealtime === "function") window.subscribeRealtime();

      wireGenerateButton();
      wireTopViewDropdown();
      wirePlannerRefreshSources();
      watchAssignmentTable();
    }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
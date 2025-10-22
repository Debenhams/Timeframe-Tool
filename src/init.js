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
  document.addEventListener("DOMContentLoaded", function () {
    var hidden = false;

    function hideColorKey(node) {
      if (hidden) return;
      var keyEl = node || document.getElementById("colorKey");
      if (!keyEl) return;
      hidden = true;

      keyEl.style.setProperty("display", "none", "important");
      var headingEl = keyEl.previousElementSibling;
      if (headingEl && /^H[2-4]$/.test(headingEl.tagName)) {
        headingEl.style.setProperty("display", "none", "important");
      }
      console.log("Color palette hidden");
    }

    // Hide immediately if present, otherwise catch asynchronous renders.
    hideColorKey();

    if (!hidden && typeof MutationObserver === "function") {
      var observer = new MutationObserver(function (mutations, obs) {
        for (var i = 0; i < mutations.length; i++) {
          var added = mutations[i].addedNodes || [];
          for (var j = 0; j < added.length; j++) {
            var node = added[j];
            if (node && node.nodeType === 1) {
              if (node.id === "colorKey") {
                hideColorKey(node);
                obs.disconnect();
                return;
              }
              var match = node.querySelector && node.querySelector("#colorKey");
              if (match) {
                hideColorKey(match);
                obs.disconnect();
                return;
              }
            }
          }
        }
      });

      observer.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true
      });
    }
  });
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
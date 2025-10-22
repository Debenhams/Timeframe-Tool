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
  // --- hide Colours palette without removing markup ---
  var colorsPanelObserver = null;
  var colorsPanelLogDone = false;
  var colorsPanelBodyFlagged = false;
  var colorsPanelBodyListenerAttached = false;

  function flagBodyForHiddenColors() {
    if (colorsPanelBodyFlagged) return;
    var body = document.body;
    if (body && body.dataset) {
      body.dataset.hideColors = "1";
      colorsPanelBodyFlagged = true;
    } else if (!colorsPanelBodyListenerAttached) {
      colorsPanelBodyListenerAttached = true;
      document.addEventListener("DOMContentLoaded", function onBodyReady() {
        colorsPanelBodyListenerAttached = false;
        flagBodyForHiddenColors();
      }, { once: true });
    }
  }

  function findColorsPanelWrapper() {
    var explicit = document.getElementById("colorPalettePanel");
    if (explicit) return explicit;

    var keyEl = document.getElementById("colorKey");
    if (!keyEl) return null;

    var node = keyEl;
    while (node && node !== document.body) {
      var headings = node.querySelectorAll ? node.querySelectorAll("h2,h3,h4") : [];
      for (var i = 0; i < headings.length; i++) {
        if (/colou/i.test(headings[i].textContent || "")) {
          return node;
        }
      }
      node = node.parentElement;
    }
    return keyEl;
  }

  function hideColorsPanel() {
    var wrapper = findColorsPanelWrapper();
    if (!wrapper) return false;

    wrapper.style.setProperty("display", "none", "important");
    flagBodyForHiddenColors();

    if (!colorsPanelLogDone) {
      console.log("✅ Colours palette hidden (wrapper collapsed).");
      colorsPanelLogDone = true;
    }
    return true;
  }

  function ensureColorsPanelHidden() {
    hideColorsPanel();

    if (!colorsPanelObserver && typeof MutationObserver === "function") {
      var observerRoot = document.getElementById("settingsBox") || document.body || document.documentElement;
      if (!observerRoot) return;

      colorsPanelObserver = new MutationObserver(function (mutations) {
        for (var i = 0; i < mutations.length; i++) {
          var record = mutations[i];
          if ((record.addedNodes && record.addedNodes.length) ||
              (record.removedNodes && record.removedNodes.length)) {
            hideColorsPanel();
            break;
          }
        }
      });

      colorsPanelObserver.observe(observerRoot, {
        childList: true,
        subtree: true
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureColorsPanelHidden, { once: true });
    window.addEventListener("load", ensureColorsPanelHidden);
  } else {
    ensureColorsPanelHidden();
    window.addEventListener("load", ensureColorsPanelHidden);
  }
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
  // --- Hide the "Colours" section (heading + inputs + buttons) but keep DOM nodes ---
// Works on initial load and if the settings panel re-renders later.
(function () {
  let hidOnce = false;

  function hideColorsSection() {
    try {
      const settings =
        document.querySelector('#settingsBox .panel-body') ||
        document.getElementById('settingsBox') ||
        document.body;

      if (!settings) return;

      // Find the Colours heading (handles "Colour" / "Colors")
      let heading = Array.from(settings.querySelectorAll('h2,h3,h4'))
        .find(h => /colou?rs?/i.test((h.textContent || '').trim()));

      // Also locate the color key block if present
      const key = document.getElementById('colorKey');

      if (!heading && !key) return; // Nothing to do

      // If we found the heading, hide it…
      if (heading) {
        heading.style.setProperty('display', 'none', 'important');
      }

      // Hide the block(s) that belong to the Colours section:
      // from the heading's next sibling forward until the next heading,
      // or, if we didn't find a heading, at least hide #colorKey itself.
      let el = heading ? heading.nextElementSibling : key;
      while (el) {
        if (heading && /^H[2-4]$/.test(el.tagName)) break; // stop at next section
        el.style.setProperty('display', 'none', 'important');
        el = el.nextElementSibling;
      }

      // As a fallback, also collapse the smallest common ancestor that contains
      // both the heading and #colorKey (if both exist) to catch odd markups.
      if (heading && key) {
        let a = heading;
        while (a && !a.contains(key)) a = a.parentElement;
        if (a && a !== document.body && a !== settings) {
          a.style.setProperty('display', 'none', 'important');
        }
      }

      // CSS hook (optional defensive rules in planner.css can use this)
      document.documentElement.dataset.hideColors = '1';

      if (!hidOnce) {
        console.log('✅ Colours section hidden');
        hidOnce = true;
      }
    } catch (e) {
      console.warn('hideColorsSection failed:', e);
    }
  }

  // Run once on load (covers hard/soft reloads)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', hideColorsSection, { once: true });
  } else {
    hideColorsSection();
  }

  // Re-apply if that panel is rebuilt later
  const host = document.getElementById('settingsBox') || document.body;
  new MutationObserver(() => {
    // If the key is visible again, hide the section once more
    const key = document.getElementById('colorKey');
    if (key && getComputedStyle(key).display !== 'none') {
      hideColorsSection();
    }
  }).observe(host, { childList: true, subtree: true });
})();
})();
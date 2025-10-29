// src/init.js
(function () {
  "use strict";
  console.log("init.js loaded (wiring only)");

  // --- expose refresh so console checks work
  function refreshPlannerUI() {
    try {
      const rows = (typeof window.computePlannerRowsFromState === "function")
        ? (window.computePlannerRowsFromState() || [])
        : [];
      if (typeof window.renderPlanner === "function") window.renderPlanner(rows);
      if (typeof window.renderAdvisorWeek === "function") window.renderAdvisorWeek(rows);
    } catch (e) {
      console.warn("refreshPlannerUI error", e);
    }
  }
  window.refreshPlannerUI = refreshPlannerUI;

  // ---------- helpers ----------
  function wireOnce(el, evt, fn, tag) {
    if (!el) return;
    const key = tag || ("_wired_" + evt);
    if (el.dataset && el.dataset[key]) return;
    el.addEventListener(evt, fn);
    if (el.dataset) el.dataset[key] = "1";
  }

  function ensureTimeHeader() {
    const headerEl = document.getElementById("timeHeader");
    if (headerEl && typeof window.renderTimeHeader === "function") {
      window.renderTimeHeader(headerEl);
    }
  }

  // ---------- prime from Master Assignment table ----------
  function rebuildAdvisorIndexesFromTable() {
    const table = document.getElementById("assignTable");
    if (!table) return 0;

    const names = Array.prototype.slice
      .call(table.querySelectorAll("tbody tr"))
      .map(tr => {
        const h = tr.querySelector("th,td");
        return (h && h.textContent ? h.textContent : "").trim();
      })
      .filter(Boolean);

    window.ADVISOR_BY_NAME = new Map(names.map(n => [n, n]));
    window.ADVISOR_BY_ID   = new Map(names.map(n => [n, n]));
    return names.length;
  }

  function primeRotasFromAssignTable() {
    const table = document.getElementById("assignTable");
    const wsEl  = document.getElementById("weekStart");
    const dayEl = document.getElementById("teamDay");

    if (!table || !wsEl || !(window.ADVISOR_BY_NAME instanceof Map)) return 0;

    const ws = (wsEl.value || "").trim();
    if (!ws) return 0;

    const dayName = (dayEl && dayEl.value ? dayEl.value : "Monday");
    const DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
    const dayIdx = DAYS.indexOf(dayName);
    if (dayIdx < 0) return 0;

    if (!(window.ROTAS instanceof Map)) window.ROTAS = new Map();
    let primed = 0;

    Array.prototype.slice.call(table.querySelectorAll("tbody tr")).forEach(tr => {
      const nameCell = tr.querySelector("th,td");
      const name = (nameCell && nameCell.textContent ? nameCell.textContent : "").trim();
      if (!name) return;

      const aId = window.ADVISOR_BY_NAME.get(name) || name;

      const tds = tr.querySelectorAll("td");
      const cell = tds && tds[dayIdx];
      if (!cell) return;

      const sel = cell.querySelector("select,[data-template],[data-value]");
      let tpl = "";
      if (sel) {
        if ("value" in sel) tpl = sel.value || "";
        if (!tpl) tpl = sel.getAttribute("data-template") || "";
        if (!tpl) tpl = sel.getAttribute("data-value") || "";
      }
      if (!tpl) tpl = (cell.textContent || "").trim();

      tpl = tpl.replace(/[\r\n]/g, " ").replace(/\s+/g, " ").trim();
      if (!tpl || /^day\s*off$/i.test(tpl)) return;

      const key = aId + "::" + ws;
      const weekObj = window.ROTAS.get(key) || {};
      weekObj[dayName] = tpl;
      window.ROTAS.set(key, weekObj);
      primed++;
    });

    return primed;
  }

  function watchAssignmentTable() {
    const table = document.getElementById("assignTable");
    if (!table) return;
    if (table.dataset && table.dataset._primeWired) return;

    table.addEventListener("change", function () {
      rebuildAdvisorIndexesFromTable();
      const n = primeRotasFromAssignTable();
      const rows = (typeof window.computePlannerRowsFromState === "function") ? (window.computePlannerRowsFromState() || []) : [];
      if (rows.length || n) window.renderPlanner?.(rows);
    });

    if (table.dataset) table.dataset._primeWired = "1";
  }

  // ---------- wiring ----------
  function wireGenerateButton() {
    const btn = document.getElementById("btnGenerate");
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
    const view = document.getElementById("advisorSelect");
    if (!view) return;
    wireOnce(view, "change", function () {
      window.updateRangeLabel?.();
      window.renderCalendar?.();
      window.populateAssignTable?.();
      refreshPlannerUI();
    }, "_wired_change_advisorSelect");
  }

  function wirePlannerRefreshSources() {
    const weekStart = document.getElementById("weekStart");
    const teamDay   = document.getElementById("teamDay");
    const tree      = document.getElementById("tree");

    wireOnce(weekStart, "change", async function () {
      window.updateRangeLabel?.();
      if (typeof window.fetchRotasForWeek === "function" && weekStart) {
        try { await window.fetchRotasForWeek(weekStart.value); } catch (_) {}
        window.populateAssignTable?.();
        window.renderCalendar?.();
      } else {
        window.renderCalendar?.();
      }
      refreshPlannerUI();
    });

    wireOnce(teamDay, "change", function () {
      window.updateRangeLabel?.();
      window.renderCalendar?.();
      refreshPlannerUI();
    });

    wireOnce(tree, "change", refreshPlannerUI, "_wired_tree_change");
    wireOnce(tree, "click",  refreshPlannerUI, "_wired_tree_click");
  }

  // ---------- boot ----------
  async function boot() {
    try {
      // Load any org/templates/assignments you already have in your page scripts
      try { await window.loadOrg?.(); } catch(_) {}
      try { await window.loadTemplates?.(); } catch(_) {}
      try { await window.loadAssignments?.(); } catch(_) {}

      const wsEl = document.getElementById("weekStart");
      if (wsEl && typeof window.fetchRotasForWeek === "function") {
        const ws = (wsEl.value || "").trim();
        if (ws) { try { await window.fetchRotasForWeek(ws); } catch (_) {} }
      }

      // Build UI
      window.rebuildAdvisorDropdown?.();
      window.rebuildTree?.();
      window.refreshChips?.();
      window.populateTemplateEditor?.();
      window.populateAssignTable?.();
      window.updateRangeLabel?.();
      window.renderCalendar?.();

      ensureTimeHeader();
      rebuildAdvisorIndexesFromTable();
      primeRotasFromAssignTable();

      // Boot rotations + advisors and draw
      await window.bootAdvisors?.();
      await window.bootRotations?.();
      window.populateRotationSelect?.();
      refreshPlannerUI();
    } catch (e) {
      console.warn("planner boot skipped", e);
    }

    window.subscribeRealtime?.();
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

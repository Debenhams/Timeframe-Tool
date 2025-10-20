// src/init.js
(() => {
  // ---------- helpers ----------
  function refreshPlannerUI() {
    const rows =
      typeof window.computePlannerRowsFromState === "function"
        ? window.computePlannerRowsFromState()
        : [];

    if (typeof window.renderPlanner === "function") {
      window.renderPlanner(rows);
    }
    if (typeof window.renderAdvisorWeek === "function") {
      window.renderAdvisorWeek(rows);
    }
  }

  function wireOnce(el, ev, handler, flag = `_wired_${ev}`) {
    if (!el) return;
    if (el.dataset && el.dataset[flag]) return;
    el.addEventListener(ev, handler);
    if (el.dataset) el.dataset[flag] = "1";
  }

  function wirePlannerRefreshSources() {
    // week/day controls
    wireOnce(document.getElementById("weekStart"), "change", refreshPlannerUI);
    wireOnce(document.getElementById("teamDay"), "change", refreshPlannerUI);

    // right panel candidates (if they exist in this build)
    const candidates = [
      "#advisorTree",
      "#treePanel",
      "[data-tree-root]",
      ".advisor-tree",
      "[data-role='advisor-tree']",
      "[data-tree-panel]",
      ".schedules-panel",
    ];
    for (const sel of candidates) {
      const el = document.querySelector(sel);
      wireOnce(el, "change", refreshPlannerUI, "_wired_change_refresh");
      wireOnce(el, "click", refreshPlannerUI, "_wired_click_refresh");
    }
  }

  function wireGenerateButton() {
    const btn = document.getElementById("btnGenerate");
    if (!btn) return;
    wireOnce(
      btn,
      "click",
      async () => {
        try {
          // try to reload the week first (mirrors boot)
          const ws = document.getElementById("weekStart")?.value;
          if (ws && typeof window.fetchRotasForWeek === "function") {
            try {
              await window.fetchRotasForWeek(ws);
            } catch (e) {
              console.warn("fetchRotasForWeek (Generate) failed:", e);
            }
          }
          refreshPlannerUI();
          console.log("Schedule generated.");
        } catch (err) {
          console.error("Generate failed:", err);
        }
      },
      "_wired_click"
    );
  }

  function wireAdvisorSelect() {
    const sel =
      document.getElementById("advisorSelect") ||
      document.querySelector("[data-master-view-dropdown]");
    if (!sel) return;
    wireOnce(
      sel,
      "change",
      () => {
        // optional app hooks if they exist
        const opt = sel.selectedOptions?.[0];
        const val = opt?.value ?? sel.value;

        if (typeof window.onMasterSelectionChange === "function")
          window.onMasterSelectionChange(val, opt);
        if (typeof window.setActiveMasterAssignment === "function")
          window.setActiveMasterAssignment(val, opt);
        if (typeof window.renderMasterAssignment === "function")
          window.renderMasterAssignment(val, opt);
        if (typeof window.loadMasterAssignment === "function")
          window.loadMasterAssignment(val, opt);

        refreshPlannerUI();
      },
      "_wired_change"
    );
  }

  // ---------- SAFE BOOT ----------
  // Ensure the in-memory rota cache exists for the horizontal view logic
  window.ROTAS = window.ROTAS || new Map();

  const boot = async () => {
    try {
      // Load data (only if helpers exist)
      if (typeof window.loadOrg === "function") await window.loadOrg();
      if (typeof window.loadTemplates === "function")
        await window.loadTemplates();
      if (typeof window.loadAssignments === "function")
        await window.loadAssignments();

      // Rebuild UI (only if helpers exist)
      if (typeof window.rebuildAdvisorDropdown === "function")
        window.rebuildAdvisorDropdown();
      if (typeof window.rebuildTree === "function") window.rebuildTree();
      if (typeof window.refreshChips === "function") window.refreshChips();
      if (typeof window.populateTemplateEditor === "function")
        window.populateTemplateEditor();
      if (typeof window.populateAssignTable === "function")
        window.populateAssignTable();
      if (typeof window.updateRangeLabel === "function")
        window.updateRangeLabel();
      if (typeof window.renderCalendar === "function")
        window.renderCalendar();

      // Draw time header
      const headerEl = document.getElementById("timeHeader");
      if (headerEl && typeof window.renderTimeHeader === "function") {
        window.renderTimeHeader(headerEl);
      }

      // NEW: load the selected week's rotas so ROTAS is populated
      const ws = document.getElementById("weekStart")?.value;
      if (ws && typeof window.fetchRotasForWeek === "function") {
        try {
          await window.fetchRotasForWeek(ws); // fills window.ROTAS
        } catch (e) {
          console.warn("fetchRotasForWeek failed:", e);
        }
      }

      // Initial render
      refreshPlannerUI();

      // Wire interactions (once)
      wireAdvisorSelect();
      wireGenerateButton();
      wirePlannerRefreshSources();
    } catch (e) {
      console.warn("planner boot skipped", e);
    }

    // Live updates
    if (typeof window.subscribeRealtime === "function") {
      window.subscribeRealtime();
    }
  };

  // ---------- run once when DOM is ready ----------
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
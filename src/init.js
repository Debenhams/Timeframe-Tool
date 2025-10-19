// src/init.js
(() => {
  // ------------------------------------------------------------
  // Recompute + render both views (safe: guards around helpers)
  // ------------------------------------------------------------
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

  // ------------------------------------------------------------
  // One-time wiring helper
  // ------------------------------------------------------------
  function wireOnce(el, ev, handler, flag = `_wired_${ev}`) {
    if (!el) return;
    if (el.dataset && el.dataset[flag]) return;
    el.addEventListener(ev, handler);
    if (el.dataset) el.dataset[flag] = "1";
  }

  // ------------------------------------------------------------
  // Wire top “View” dropdown (Leader/Team) -> refresh
  // ------------------------------------------------------------
  function wireAdvisorSelect() {
    const sel =
      document.querySelector("[data-master-view-dropdown]") ||
      document.getElementById("advisorSelect") ||
      document.getElementById("viewSelect") ||
      document.getElementById("viewLeaderTeam") ||
      document.querySelector('select[name="viewLeaderTeam"]');

    if (!sel) return;

    wireOnce(
      sel,
      "change",
      (evt) => {
        const opt = evt.target.selectedOptions?.[0];
        const val = opt?.value ?? evt.target.value;

        // Keep hooks safe (only if present in your app)
        if (typeof window.onMasterSelectionChange === "function") {
          window.onMasterSelectionChange(val, opt);
        }
        if (typeof window.setActiveMasterAssignment === "function") {
          window.setActiveMasterAssignment(val, opt);
        }
        if (typeof window.renderMasterAssignment === "function") {
          window.renderMasterAssignment(val, opt);
        }
        if (typeof window.loadMasterAssignment === "function") {
          window.loadMasterAssignment(val, opt);
        }

        // Optional: mirror old behavior – click matching item in right panel
        const lookupId =
          opt?.dataset?.leaderId ||
          opt?.dataset?.teamId ||
          opt?.dataset?.assignmentId ||
          val;

        if (lookupId) {
          const targetEl =
            document.querySelector(`[data-leader-id="${lookupId}"]`) ||
            document.querySelector(`[data-team-id="${lookupId}"]`) ||
            document.querySelector(`[data-assignment-id="${lookupId}"]`);
          if (targetEl) {
            targetEl.dispatchEvent(
              new MouseEvent("click", { bubbles: true, cancelable: true })
            );
          }
        }

        refreshPlannerUI();
      },
      "_wired_change"
    );
  }

  // ------------------------------------------------------------
  // Wire Generate button -> recompute & render
  // ------------------------------------------------------------
  function wireGenerateButton() {
    const btn = document.getElementById("btnGenerate");
    if (!btn) return;

    wireOnce(
      btn,
      "click",
      async () => {
        try {
          refreshPlannerUI();
          console.log("Schedule generated.");
        } catch (err) {
          console.error("Generate failed:", err);
        }
      },
      "_wired_click"
    );
  }

  // ------------------------------------------------------------
  // Sources that should refresh the planner (week/day/right panel)
  // Includes weekStart handler that LOADS ROTAS for the chosen week
  // ------------------------------------------------------------
  function wirePlannerRefreshSources() {
    const wsEl = document.getElementById("weekStart");
    const dayEl = document.getElementById("teamDay");

    // week start -> (re)load ROTAS for that ISO date, then refresh
    if (wsEl && !wsEl.dataset._wiredLoadRotas) {
      wsEl.addEventListener("change", async () => {
        if (typeof fetchRotasForWeek === "function" && wsEl.value) {
          await fetchRotasForWeek(wsEl.value);
        }
        refreshPlannerUI();
      });
      wsEl.dataset._wiredLoadRotas = "1";
    }

    // day picker just refreshes
    if (dayEl) {
      wireOnce(dayEl, "change", refreshPlannerUI, "_wired_change_refresh");
    }

    // right panel tree / checkbox list (try several known selectors)
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

  // ------------------------------------------------------------
  // SAFE BOOT: load data, ensure weekStart, load ROTAS, then render
  // ------------------------------------------------------------
  const boot = async () => {
    try {
      // Ensure ROTAS exists
      if (typeof window.ROTAS === "undefined") window.ROTAS = new Map();

      // Load reference data (guards keep this safe)
      if (typeof loadOrg === "function")         await loadOrg();
      if (typeof loadTemplates === "function")   await loadTemplates();
      if (typeof loadAssignments === "function") await loadAssignments();

      // Ensure weekStart has a value (default Monday of current week)
      const wsEl = document.getElementById("weekStart");
      if (wsEl && !wsEl.value) {
        const d = new Date();
        const dow = (d.getDay() + 6) % 7; // Monday=0
        d.setDate(d.getDate() - dow);
        wsEl.value = d.toISOString().slice(0, 10);
      }
      const weekStartISO = wsEl?.value;

      // Load ROTAS for the selected week
      if (typeof fetchRotasForWeek === "function" && weekStartISO) {
        await fetchRotasForWeek(weekStartISO);
      }

      // Optional UI rebuild hooks
      if (typeof rebuildAdvisorDropdown === "function") rebuildAdvisorDropdown();
      if (typeof rebuildTree === "function")            rebuildTree();
      if (typeof refreshChips === "function")           refreshChips();
      if (typeof populateTemplateEditor === "function") populateTemplateEditor();
      if (typeof populateAssignTable === "function")    populateAssignTable();
      if (typeof updateRangeLabel === "function")       updateRangeLabel();
      if (typeof renderCalendar === "function")         renderCalendar();

      // Draw time header
      const headerEl = document.getElementById("timeHeader");
      if (headerEl && typeof window.renderTimeHeader === "function") {
        window.renderTimeHeader(headerEl);
      }

      // Wire interactions (only after DOM + initial data)
      wireAdvisorSelect();
      wireGenerateButton();
      wirePlannerRefreshSources();

      // Initial render (uses ROTAS now loaded)
      refreshPlannerUI();
    } catch (e) {
      console.warn("planner boot skipped", e);
    }

    // Live updates (if provided by your app)
    if (typeof window.subscribeRealtime === "function") {
      window.subscribeRealtime();
    }
  };

  // ------------------------------------------------------------
  // Run once when DOM is ready
  // ------------------------------------------------------------
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
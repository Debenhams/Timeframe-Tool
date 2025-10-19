// src/init.js
(() => {
  // ---- recompute + render both views (safe: guards around helpers) ----
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

  // ---- one-time wiring helper ----
  function wireOnce(el, ev, handler, flag = `_wired_${ev}`) {
    if (!el) return;
    if (el.dataset && el.dataset[flag]) return;
    el.addEventListener(ev, handler);
    if (el.dataset) el.dataset[flag] = "1";
  }

  // ---- sources that should trigger a refresh ----
  function wirePlannerRefreshSources() {
    // week/day controls
    wireOnce(document.getElementById("weekStart"), "change", refreshPlannerUI);
    wireOnce(document.getElementById("teamDay"), "change", refreshPlannerUI);

    // right panel tree / checkbox list (try several known selectors)
    const candidates = [
      "#advisorTree",
      "#treePanel",
      "[data-tree-root]",
      ".advisor-tree",
      "[data-role='advisor-tree']",
      "[data-tree-panel]",
      ".schedules-panel"
    ];
    for (const sel of candidates) {
      const el = document.querySelector(sel);
      wireOnce(el, "change", refreshPlannerUI, "_wired_change_refresh");
      wireOnce(el, "click",  refreshPlannerUI, "_wired_click_refresh");
    }
  }

  // ---- top view dropdown (Leader/Team) drives selection + refresh ----
  function wireTopViewDropdown() {
    const viewDropdown =
      document.querySelector("[data-master-view-dropdown]") ||
      document.getElementById("viewSelect") ||
      document.getElementById("viewLeaderTeam") ||
      document.querySelector('select[name="viewLeaderTeam"]');

    if (!viewDropdown) return;

    wireOnce(
      viewDropdown,
      "change",
      (evt) => {
        const opt = evt.target.selectedOptions?.[0];
        const val = opt?.value ?? evt.target.value;

        // Optional app hooks (only if present)
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

        // Try to mirror old behavior by “clicking” matching item in right panel
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

  // ---- Generate button: recompute & render ----
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

  // ---- SAFE BOOT ----
  const boot = async () => {
    try {
      // Load data (only if helpers exist)
      if (typeof loadOrg === "function")         await loadOrg();
      if (typeof loadTemplates === "function")   await loadTemplates();
      if (typeof loadAssignments === "function") await loadAssignments();

      // Rebuild UI (only if helpers exist)
      if (typeof rebuildAdvisorDropdown === "function") rebuildAdvisorDropdown();
      if (typeof rebuildTree === "function")            rebuildTree();
      if (typeof refreshChips === "function")           refreshChips();
      if (typeof populateTemplateEditor === "function") populateTemplateEditor();
      if (typeof populateAssignTable === "function")    populateAssignTable();
      if (typeof updateRangeLabel === "function")       updateRangeLabel();
      if (typeof renderCalendar === "function")         renderCalendar();

      // Time header
      const headerEl = document.getElementById("timeHeader");
      if (headerEl && typeof window.renderTimeHeader === "function") {
        window.renderTimeHeader(headerEl);
      }

      // Initial render
      refreshPlannerUI();
    } catch (e) {
      console.warn("planner boot skipped", e);
    }

    // Live updates
    if (typeof window.subscribeRealtime === "function") {
      window.subscribeRealtime();
    }

    // Wire interactions
    wireGenerateButton();
    wireTopViewDropdown();
    wirePlannerRefreshSources();
  };

  // Run once when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
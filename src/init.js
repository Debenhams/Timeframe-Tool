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
    // If you have a vertical renderer, it'll be called; otherwise this is a no-op
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
    wireOnce(document.getElementById("weekStart"), "change", () => {
      if (typeof updateRangeLabel === "function") updateRangeLabel();
      if (typeof renderCalendar === "function") renderCalendar();
      refreshPlannerUI();
    });

    wireOnce(document.getElementById("teamDay"), "change", () => {
      if (typeof updateRangeLabel === "function") updateRangeLabel();
      if (typeof renderCalendar === "function") renderCalendar();
      refreshPlannerUI();
    });

    // Right panel tree and chips (these are the actual IDs in your HTML)
    wireOnce(document.getElementById("tree"), "change", refreshPlannerUI);
    wireOnce(document.getElementById("tree"), "click", refreshPlannerUI);
    wireOnce(document.getElementById("activeChips"), "click", refreshPlannerUI);
  }

  // ---- top view dropdown (Leader/Team) drives selection + refresh ----
  function wireTopViewDropdown() {
    // Your page uses id="advisorSelect"
    const viewDropdown = document.getElementById("advisorSelect");
    if (!viewDropdown) return;

    wireOnce(
      viewDropdown,
      "change",
      (evt) => {
        // The inline HTML code already updates selectedAdvisors when a leader is chosen.
        // Here we simply keep the old behavior: update labels/calendar + refresh planner.
        if (typeof updateRangeLabel === "function") updateRangeLabel();
        if (typeof renderCalendar === "function") renderCalendar();
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
          // original flow: labels + calendar + planner
          if (typeof updateRangeLabel === "function") updateRangeLabel();
          if (typeof renderCalendar === "function") renderCalendar();
          refreshPlannerUI();
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

      // First render of planner/vertical
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
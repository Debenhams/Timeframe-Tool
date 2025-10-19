// src/init.js
(() => {
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

  function wireRefreshListener(element, eventName = "change") {
    if (!element) return;
    const datasetKey =
      "plannerRefresh" + eventName.charAt(0).toUpperCase() + eventName.slice(1);
    if (element.dataset && element.dataset[datasetKey]) return;
    element.addEventListener(eventName, () => refreshPlannerUI());
    if (element.dataset) {
      element.dataset[datasetKey] = "1";
    }
  }

  function wirePlannerRefreshSources() {
    wireRefreshListener(document.getElementById("weekStart"));
    wireRefreshListener(document.getElementById("teamDay"));
    [
      "#advisorTree",
      "#treePanel",
      "[data-tree-root]",
      ".advisor-tree",
      "[data-role='advisor-tree']",
      "[data-tree-panel]",
    ]
      .map((selector) => document.querySelector(selector))
      .forEach((el) => wireRefreshListener(el));
  }

  // Define once, if missing.
  if (typeof window.initPlanner !== "function") {
    window.initPlanner = function initPlanner() {
      // 1) Draw the time header ticks (if helper exists)
      const headerEl = document.getElementById("timeHeader");
      if (headerEl && typeof window.renderTimeHeader === "function") {
        window.renderTimeHeader(headerEl);
      }

      // 2) Wire the "Generate" button (only once)
      const btn = document.getElementById("btnGenerate");
      if (btn && !btn.dataset._wired) {
        btn.addEventListener("click", async () => {
          try {
            // Build rows from current UI state (if helper exists)
            const rows =
              typeof window.computePlannerRowsFromState === "function"
                ? window.computePlannerRowsFromState()
                : [];

            // Render the planner (if helper exists)
            if (typeof window.renderPlanner === "function") {
              window.renderPlanner(rows);
            }
            if (typeof window.renderAdvisorWeek === "function") {
              window.renderAdvisorWeek(rows);
            }
            console.log("Schedule generated.");
          } catch (err) {
            console.error("Generate failed:", err);
          }
        });
        btn.dataset._wired = "1";
      }
      const viewDropdown =
        document.querySelector('[data-master-view-dropdown]') ||
        document.getElementById("viewLeaderTeam") ||
        document.querySelector('select[name="viewLeaderTeam"]');
      if (viewDropdown && !viewDropdown.dataset._wired) {
        viewDropdown.addEventListener("change", (evt) => {
          const selectedOption = evt.target.selectedOptions?.[0];
          const selectedValue = selectedOption?.value ?? evt.target.value;
          if (typeof window.onMasterSelectionChange === "function") {
            window.onMasterSelectionChange(selectedValue, selectedOption);
          }
          if (typeof window.setActiveMasterAssignment === "function") {
            window.setActiveMasterAssignment(selectedValue, selectedOption);
          }
          if (typeof window.renderMasterAssignment === "function") {
            window.renderMasterAssignment(selectedValue, selectedOption);
          }
          if (typeof window.loadMasterAssignment === "function") {
            window.loadMasterAssignment(selectedValue, selectedOption);
          }
          const lookupId =
            selectedOption?.dataset?.leaderId ||
            selectedOption?.dataset?.teamId ||
            selectedOption?.dataset?.assignmentId ||
            selectedValue;
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
        });
        viewDropdown.dataset._wired = "1";
        viewDropdown.dispatchEvent(new Event("change", { bubbles: true }));
      }
      wirePlannerRefreshSources();
    };
  }

  // Auto-run when the DOM is ready
  if (document.readyState !== "loading") {
    if (typeof window.initPlanner === "function") window.initPlanner();
  } else {
    document.addEventListener("DOMContentLoaded", () => {
      if (typeof window.initPlanner === "function") window.initPlanner();
    });
  }
  // --- SAFE BOOT (runs once when DOM is ready) ---
  // --- SAFE BOOT (restored clean version) ---
  const boot = async () => {
    try {
      // Load data (only if helpers exist)
      if (typeof loadOrg === "function") await loadOrg();
      if (typeof loadTemplates === "function") await loadTemplates();
      if (typeof loadAssignments === "function") await loadAssignments();

      // Rebuild UI components
      if (typeof rebuildAdvisorDropdown === "function") rebuildAdvisorDropdown();
      if (typeof rebuildTree === "function") rebuildTree();
      if (typeof refreshChips === "function") refreshChips();
      if (typeof populateTemplateEditor === "function") populateTemplateEditor();
      if (typeof populateAssignTable === "function") populateAssignTable();
      if (typeof updateRangeLabel === "function") updateRangeLabel();
      if (typeof renderCalendar === "function") renderCalendar();

      // Draw header timeline
      const headerEl = document.getElementById("timeHeader");
      if (headerEl && typeof window.renderTimeHeader === "function") {
        window.renderTimeHeader(headerEl);
      }
      refreshPlannerUI();

      // Compute and render rows
      const rows =
        typeof window.computePlannerRowsFromState === "function"
          ? window.computePlannerRowsFromState()
          : [];

      if (typeof window.renderPlanner === "function") {
        window.renderPlanner(rows);
      }

      // Restore vertical view rendering (Advisor Week)
      if (typeof window.renderAdvisorWeek === "function") {
        window.renderAdvisorWeek(rows);
      }

      const viewDropdown = document.getElementById("viewSelect");
      if (viewDropdown && !viewDropdown.dataset._viewRefreshWired) {
        viewDropdown.addEventListener("change", () => {
          if (typeof rebuildAdvisorDropdown === "function")
            rebuildAdvisorDropdown();
          if (typeof updateRangeLabel === "function") updateRangeLabel();
          if (typeof renderCalendar === "function") renderCalendar();
          if (typeof window.renderPlanner === "function")
            window.renderPlanner(
              window.computePlannerRowsFromState
                ? window.computePlannerRowsFromState()
                : []
            );
          if (typeof window.renderAdvisorWeek === "function")
            window.renderAdvisorWeek(
              window.computePlannerRowsFromState
                ? window.computePlannerRowsFromState()
                : []
            );
          refreshPlannerUI();
        });
        viewDropdown.dataset._viewRefreshWired = "1";
      }
      wirePlannerRefreshSources();
    } catch (e) {
      console.warn("planner boot skipped", e);
    }

    // Real-time subscriptions if available
    if (typeof window.subscribeRealtime === "function") {
      window.subscribeRealtime();
    }
  };

  // Run once when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
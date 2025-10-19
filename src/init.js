// src/init.js
(() => {
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
        });
        viewDropdown.dataset._wired = "1";
        viewDropdown.dispatchEvent(new Event("change", { bubbles: true }));
      }
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

    // Hook up top dropdown auto-load
    const viewDropdown = document.getElementById("viewSelect");
    if (viewDropdown) {
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
      });
    }
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
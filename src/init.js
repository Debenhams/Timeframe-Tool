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
            console.log("Schedule generated.");
          } catch (err) {
            console.error("Generate failed:", err);
          }
        });
        btn.dataset._wired = "1";
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
})();
// src/init.js
(() => {
  /**********************
   * Small utils (safe)
   **********************/
  const $  = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const log = (...a) => console.log("[init]", ...a);
  const warn = (...a) => console.warn("[init]", ...a);

  // One-time wiring helper
  function wireOnce(el, ev, handler, flag = `_wired_${ev}`) {
    if (!el) return;
    if (el.dataset && el.dataset[flag]) return;
    el.addEventListener(ev, handler);
    if (el.dataset) el.dataset[flag] = "1";
  }

  /**********************
   * Compute planner rows
   * - Prefers your computePlannerRowsFromState()
   * - Falls back to loadTemplates+loadAssignments+buildRowsFrom()
   **********************/
  async function computeRows() {
    // Preferred: use your current page state (ROTAS, selection, templates, etc.)
    if (typeof window.computePlannerRowsFromState === "function") {
      try {
        const rows = window.computePlannerRowsFromState();
        return Array.isArray(rows) ? rows : [];
      } catch (e) {
        warn("computePlannerRowsFromState failed, falling back.", e);
      }
    }

    // Fallback: explicit pipeline if those helpers exist
    if (
      typeof window.loadTemplates === "function" &&
      typeof window.loadAssignments === "function" &&
      typeof window.buildRowsFrom === "function"
    ) {
      const [templates, assignments] = await Promise.all([
        window.loadTemplates(),
        window.loadAssignments(),
      ]);
      const rows = window.buildRowsFrom(assignments, templates);
      return Array.isArray(rows) ? rows : [];
    }

    // Nothing available
    return [];
  }

  /**********************
   * Render planner safely
   **********************/
  async function refreshPlannerUI() {
    try {
      const headerEl = document.getElementById("timeHeader");
      if (headerEl && typeof window.renderTimeHeader === "function") {
        window.renderTimeHeader(headerEl);
      }

      const rows = await computeRows();

      if (typeof window.renderPlanner === "function") {
        window.renderPlanner(rows);
      } else {
        warn("renderPlanner missing");
      }

      // Optional vertical view refresh if available
      if (typeof window.renderAdvisorWeek === "function") {
        window.renderAdvisorWeek(rows);
      }

      log("planner refreshed; rows=", Array.isArray(rows) ? rows.length : rows);
    } catch (e) {
      warn("refreshPlannerUI error", e);
    }
  }

  /**********************
   * Wire page controls
   **********************/
  function wireControls() {
    // Generate button = force rebuild now
    wireOnce($("#btnGenerate"), "click", async () => {
      try {
        // If the explicit pipeline is present, respect it (original acceptance)
        if (
          typeof window.loadTemplates === "function" &&
          typeof window.loadAssignments === "function" &&
          typeof window.buildRowsFrom === "function"
        ) {
          const [templates, assignments] = await Promise.all([
            window.loadTemplates(),
            window.loadAssignments(),
          ]);
          const rows = window.buildRowsFrom(assignments, templates);
          const headerEl = document.getElementById("timeHeader");
          if (headerEl && typeof window.renderTimeHeader === "function") {
            window.renderTimeHeader(headerEl);
          }
          if (typeof window.renderPlanner === "function") {
            window.renderPlanner(rows);
          }
          log("Generate (pipeline) ok; rows=", rows?.length ?? 0);
        } else {
          await refreshPlannerUI();
          log("Generate (state) ok");
        }
      } catch (err) {
        warn("Generate failed:", err);
      }
    });

    // Top dropdown: advisor/team/leader selector
    wireOnce($("#advisorSelect"), "change", async (evt) => {
      // Keep legacy helpers happy
      if (typeof window.updateRangeLabel === "function") window.updateRangeLabel();
      if (typeof window.updateViewSelector === "function") window.updateViewSelector();

      // If your app mirrors selection to the right tree (even if hidden)
      const val = evt.target.value;
      try {
        if (val && typeof val === "string") {
          const lookupEl =
            document.querySelector(`[data-leader-id="${val}"]`) ||
            document.querySelector(`[data-team-id="${val}"]`) ||
            document.querySelector(`[data-assignment-id="${val}"]`);
          if (lookupEl) {
            lookupEl.dispatchEvent(new MouseEvent("click", { bubbles: true }));
          }
        }
      } catch {}

      // Rebuild downstream UIs
      if (typeof window.populateAssignTable === "function") window.populateAssignTable();
      if (typeof window.renderCalendar === "function") window.renderCalendar();
      await refreshPlannerUI();
    });

    // Team day + week start
    wireOnce($("#teamDay"), "change", async () => {
      if (typeof window.updateRangeLabel === "function") window.updateRangeLabel();
      if (typeof window.renderCalendar === "function") window.renderCalendar();
      await refreshPlannerUI();
    });

    wireOnce($("#weekStart"), "change", async () => {
      const ws = $("#weekStart")?.value;
      if (ws && typeof window.fetchRotasForWeek === "function") {
        await window.fetchRotasForWeek(ws);
      }
      if (typeof window.updateRangeLabel === "function") window.updateRangeLabel();
      if (typeof window.renderCalendar === "function") window.renderCalendar();
      if (typeof window.populateAssignTable === "function") window.populateAssignTable();
      await refreshPlannerUI();
    });

    // Calendar nav
    wireOnce($("#btnToday"), "click", async () => {
      if (typeof window.setToMonday === "function") {
        const t = window.setToMonday(new Date());
        if ($("#weekStart")) $("#weekStart").value = t.toISOString().slice(0, 10);
      }
      if (typeof window.updateRangeLabel === "function") window.updateRangeLabel();
      const ws = $("#weekStart")?.value;
      if (ws && typeof window.fetchRotasForWeek === "function") {
        await window.fetchRotasForWeek(ws);
      }
      if (typeof window.renderCalendar === "function") window.renderCalendar();
      if (typeof window.populateAssignTable === "function") window.populateAssignTable();
      await refreshPlannerUI();
    });

    wireOnce($("#prevWeek"), "click", async () => {
      const d = new Date($("#weekStart")?.value || new Date());
      d.setDate(d.getDate() - 7);
      if ($("#weekStart")) $("#weekStart").value = d.toISOString().slice(0, 10);
      if (typeof window.updateRangeLabel === "function") window.updateRangeLabel();
      const ws = $("#weekStart")?.value;
      if (ws && typeof window.fetchRotasForWeek === "function") {
        await window.fetchRotasForWeek(ws);
      }
      if (typeof window.renderCalendar === "function") window.renderCalendar();
      if (typeof window.populateAssignTable === "function") window.populateAssignTable();
      await refreshPlannerUI();
    });

    wireOnce($("#nextWeek"), "click", async () => {
      const d = new Date($("#weekStart")?.value || new Date());
      d.setDate(d.getDate() + 7);
      if ($("#weekStart")) $("#weekStart").value = d.toISOString().slice(0, 10);
      if (typeof window.updateRangeLabel === "function") window.updateRangeLabel();
      const ws = $("#weekStart")?.value;
      if (ws && typeof window.fetchRotasForWeek === "function") {
        await window.fetchRotasForWeek(ws);
      }
      if (typeof window.renderCalendar === "function") window.renderCalendar();
      if (typeof window.populateAssignTable === "function") window.populateAssignTable();
      await refreshPlannerUI();
    });

    // “Right tree” (hidden) still triggers refresh if user clicks there
    const treeCandidates = [
      "#tree", "#advisorTree", "#treePanel", "[data-tree-root]",
      ".advisor-tree", "[data-role='advisor-tree']", "[data-tree-panel]", ".schedules-panel"
    ];
    for (const sel of treeCandidates) {
      const el = document.querySelector(sel);
      wireOnce(el, "change", refreshPlannerUI, "_wired_tree_change");
      wireOnce(el, "click",  refreshPlannerUI, "_wired_tree_click");
    }

    // Print
    wireOnce($("#btnPrint"), "click", () => window.print());
  }

  /**********************
   * Boot (load → render)
   **********************/
  const boot = async () => {
    try {
      // Hide palette + right sidebar defensively (HTML already hides via CSS)
      $("#colorKey")?.classList.add("visually-hidden");
      const colorsHdr = $("#colorKey")?.previousElementSibling;
      if (colorsHdr) colorsHdr.classList.add("visually-hidden");
      $("#rightSidebar")?.classList.add("visually-hidden");

      // Week start default (Monday)
      if ($("#weekStart") && typeof window.setToMonday === "function") {
        const t = window.setToMonday(new Date());
        $("#weekStart").value = t.toISOString().slice(0, 10);
      }

      // Load baseline data if helpers exist
      if (typeof window.loadOrg === "function")         await window.loadOrg();
      if (typeof window.loadTemplates === "function")   await window.loadTemplates();
      // If your app uses rotas per week
      if ($("#weekStart")?.value && typeof window.fetchRotasForWeek === "function") {
        await window.fetchRotasForWeek($("#weekStart").value);
      }

      // Build static UI pieces
      if (typeof window.rebuildAdvisorDropdown === "function") window.rebuildAdvisorDropdown();
      if (typeof window.rebuildTree === "function")            window.rebuildTree();
      if (typeof window.refreshChips === "function")           window.refreshChips();
      if (typeof window.populateTemplateEditor === "function") window.populateTemplateEditor();
      if (typeof window.populateAssignTable === "function")    window.populateAssignTable();
      if (typeof window.updateRangeLabel === "function")       window.updateRangeLabel();
      if (typeof window.renderCalendar === "function")         window.renderCalendar();

      // Initial planner render
      await refreshPlannerUI();

      // Realtime (if present)
      if (typeof window.subscribeRealtime === "function") {
        window.subscribeRealtime();
      }

      // Wire events last (to avoid double renders during boot)
      wireControls();

      log("boot complete");
    } catch (e) {
      warn("boot skipped", e);
    }
  };

  // Run once when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
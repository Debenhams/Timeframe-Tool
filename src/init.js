// src/init.js
(() => {
  // ---------- helpers ----------
  const get = (id) => document.getElementById(id);

  function refreshPlannerUI() {
    const rows =
      typeof window.computePlannerRowsFromState === "function"
        ? window.computePlannerRowsFromState()
        : [];
    if (typeof window.renderPlanner === "function") window.renderPlanner(rows);
    if (typeof window.renderAdvisorWeek === "function") window.renderAdvisorWeek(rows);
  }

  function wireOnce(el, ev, handler, key) {
    if (!el) return;
    key = key || `_wired_${ev}`;
    if (el.dataset && el.dataset[key]) return;
    el.addEventListener(ev, handler);
    if (el.dataset) el.dataset[key] = "1";
  }

  // Set #weekStart = Monday of current week if empty
  function ensureWeekStartDefault() {
    const el = get("weekStart");
    if (!el || el.value) return;
    const d = new Date();
    const offset = (d.getDay() + 6) % 7; // Monday=0
    d.setDate(d.getDate() - offset);
    el.value = d.toISOString().slice(0, 10);
  }

  // Keep top dropdown and right panel in sync
  function wireAdvisorSelect() {
    const sel = get("advisorSelect");
    if (!sel) return;
    wireOnce(
      sel,
      "change",
      (evt) => {
        const opt = evt.target.selectedOptions?.[0];
        const val = opt?.value ?? evt.target.value;

        // Try to mirror right-panel click so your old code runs
        const lookupId =
          opt?.dataset?.leaderId ||
          opt?.dataset?.teamId ||
          opt?.dataset?.assignmentId ||
          val;

        if (lookupId) {
          const target =
            document.querySelector(`[data-leader-id="${lookupId}"]`) ||
            document.querySelector(`[data-team-id="${lookupId}"]`) ||
            document.querySelector(`[data-assignment-id="${lookupId}"]`);
          if (target) {
            target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
          }
        }

        refreshPlannerUI();
      },
      "_wired_change"
    );
  }

  function wireGenerateButton() {
    const btn = get("btnGenerate");
    if (!btn) return;
    wireOnce(
      btn,
      "click",
      async () => {
        // make sure data for the chosen week is loaded before render
        if (typeof window.fetchRotasForWeek === "function") {
          const ws = get("weekStart")?.value;
          try { await window.fetchRotasForWeek(ws); } catch (e) {}
        }
        refreshPlannerUI();
        console.log("Schedule generated.");
      },
      "_wired_click"
    );
  }

  function wirePlannerRefreshSources() {
    wireOnce(get("weekStart"), "change", async () => {
      if (typeof window.fetchRotasForWeek === "function") {
        try { await window.fetchRotasForWeek(get("weekStart")?.value); } catch (e) {}
      }
      refreshPlannerUI();
    });

    wireOnce(get("teamDay"), "change", refreshPlannerUI, "_wired_day");

    // Right panel tree/checkboxes – trigger refresh on clicks or changes
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
      wireOnce(el, "click",  refreshPlannerUI, "_wired_click_refresh");
      wireOnce(el, "change", refreshPlannerUI, "_wired_change_refresh");
    }
  }

  async function loadAllDataForWeek() {
    // Base datasets
    if (typeof window.loadOrg === "function")         { try { await window.loadOrg(); } catch (e) {} }
    if (typeof window.loadTemplates === "function")   { try { await window.loadTemplates(); } catch (e) {} }
    if (typeof window.loadAssignments === "function") { try { await window.loadAssignments(); } catch (e) {} }

    // Week-specific rotas
    if (typeof window.fetchRotasForWeek === "function") {
      const ws = get("weekStart")?.value;
      try { await window.fetchRotasForWeek(ws); } catch (e) {}
    }
  }

  // ---------- boot ----------
  const boot = async () => {
    try {
      ensureWeekStartDefault();

      // draw hour ticks if renderer exists
      const headerEl = get("timeHeader");
      if (headerEl && typeof window.renderTimeHeader === "function") {
        window.renderTimeHeader(headerEl);
      }

      // load datasets (org, templates, assignments, rotas for week)
      await loadAllDataForWeek();

      // wire interactions
      wireAdvisorSelect();
      wireGenerateButton();
      wirePlannerRefreshSources();

      // initial render (after data is confirmed loaded)
      refreshPlannerUI();
    } catch (e) {
      console.warn("planner boot skipped", e);
    }

    if (typeof window.subscribeRealtime === "function") {
      window.subscribeRealtime();
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
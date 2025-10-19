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

  // ---- keep selectedAdvisors usable ----
  if (!("selectedAdvisors" in window)) {
    window.selectedAdvisors = new Set(); // names
  } else if (!(window.selectedAdvisors instanceof Set)) {
    window.selectedAdvisors = new Set(window.selectedAdvisors || []);
  }

  // ---- TOP DROPDOWN: build selection + refresh (ID = #advisorSelect) ----
  function wireAdvisorSelect() {
    const sel = document.getElementById("advisorSelect");
    if (!sel) return;

    wireOnce(sel, "change", (evt) => {
      const val = evt.target.value || "";

      // helper: best-effort resolve a single name by advisor id
      const nameForId = (id) => {
        if (id && typeof window.ADVISOR_BY_ID === "object") {
          return window.ADVISOR_BY_ID.get?.(id) || window.ADVISOR_BY_ID[id];
        }
        if (Array.isArray(window.ADVISORS_LIST)) {
          const hit = window.ADVISORS_LIST.find(a => String(a.id) === String(id));
          return hit?.name;
        }
        return undefined;
      };

      // helper: best-effort resolve team names by leader id
      const namesForLeader = (leaderId) => {
        if (typeof window.getLeaderTeamNames === "function") {
          return window.getLeaderTeamNames(leaderId) || [];
        }
        if (window.LEADER_TEAMS && typeof window.LEADER_TEAMS.get === "function") {
          return window.LEADER_TEAMS.get(leaderId) || [];
        }
        if (Array.isArray(window.ADVISORS_LIST)) {
          return window.ADVISORS_LIST
            .filter(a => String(a.leaderId) === String(leaderId))
            .map(a => a.name);
        }
        return [];
      };

      let changed = false;

      if (val.startsWith("leader::")) {
        const id = val.split("::")[1];
        const names = namesForLeader(id);
        if (names.length) {
          window.selectedAdvisors = new Set(names);
          changed = true;
        }
      } else if (val === "__TEAM_ALL__") {
        if (Array.isArray(window.ADVISORS_LIST)) {
          window.selectedAdvisors = new Set(window.ADVISORS_LIST.map(a => a.name));
          changed = true;
        }
      } else if (val.startsWith("advisor::")) {
        const id = val.split("::")[1];
        const nm = nameForId(id);
        if (nm) {
          window.selectedAdvisors = new Set([nm]);
          changed = true;
        }
      } else if (window.ADVISOR_BY_NAME?.has?.(val)) {
        window.selectedAdvisors = new Set([val]);
        changed = true;
      }

      // optional UI hooks (if present)
      if (changed) {
        if (typeof window.refreshChips === "function") window.refreshChips();
        if (typeof window.populateAssignTable === "function") window.populateAssignTable();
        if (typeof window.updateRangeLabel === "function") window.updateRangeLabel();
        if (typeof window.renderCalendar === "function") window.renderCalendar();
      }

      refreshPlannerUI();
    });
  }

  // ---- other sources that should trigger a refresh ----
  function wirePlannerRefreshSources() {
    // week/day controls
    wireOnce(document.getElementById("weekStart"), "change", refreshPlannerUI);
    wireOnce(document.getElementById("teamDay"),   "change", refreshPlannerUI);

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
      wireOnce(el, "click",  refreshPlannerUI, "_wired_click_refresh");
    }
  }

  // ---- Generate button: recompute & render ----
  function wireGenerateButton() {
    const btn = document.getElementById("btnGenerate");
    if (!btn) return;
    wireOnce(btn, "click", async () => {
      try {
        refreshPlannerUI();
        console.log("Schedule generated.");
      } catch (err) {
        console.error("Generate failed:", err);
      }
    });
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

      // Time header (horizontal view)
      const headerEl = document.getElementById("timeHeader");
      if (headerEl && typeof window.renderTimeHeader === "function") {
        window.renderTimeHeader(headerEl);
      }

      // Wire interactions
      wireAdvisorSelect();
      wireGenerateButton();
      wirePlannerRefreshSources();

      // Kick an initial compute+render
      refreshPlannerUI();

      // If the top dropdown already has a value, trigger its change once
      const sel = document.getElementById("advisorSelect");
      if (sel && sel.value) {
        sel.dispatchEvent(new Event("change", { bubbles: true }));
      }
    } catch (e) {
      console.warn("planner boot skipped", e);
    }

    // Live updates
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
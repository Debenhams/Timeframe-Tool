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
      ".schedules-panel",
    ];
    for (const sel of candidates) {
      const el = document.querySelector(sel);
      wireOnce(el, "change", refreshPlannerUI, "_wired_change_refresh");
      wireOnce(el, "click",  refreshPlannerUI, "_wired_click_refresh");
    }
  }

  // ---- TOP "View" dropdown (id="advisorSelect") -> populate selectedAdvisors + refresh ----
  function wireAdvisorSelect() {
    const sel = document.getElementById("advisorSelect");
    if (!sel) return;

    // helpers
    const nameForId = (id) => {
      if (id && typeof window.ADVISOR_BY_ID === "object") {
        return window.ADVISOR_BY_ID.get?.(id) || window.ADVISOR_BY_ID[id];
      }
      if (Array.isArray(window.ADVISORS_LIST)) {
        const hit = window.ADVISORS_LIST.find((a) => String(a.id) === String(id));
        return hit?.name;
      }
      return undefined;
    };

    const namesForLeader = (leaderIdOrName) => {
      if (typeof window.getLeaderTeamNames === "function") {
        const r = window.getLeaderTeamNames(leaderIdOrName);
        if (Array.isArray(r) && r.length) return r;
      }
      if (Array.isArray(window.ADVISORS_LIST)) {
        // by leaderId
        const byId = window.ADVISORS_LIST
          .filter((a) => String(a.leaderId) === String(leaderIdOrName))
          .map((a) => a.name);
        if (byId.length) return byId;

        // by leader display name fields if present
        const key = String(leaderIdOrName).toLowerCase();
        const byName = window.ADVISORS_LIST
          .filter(
            (a) =>
              (a.leaderName && String(a.leaderName).toLowerCase() === key) ||
              (a.leader && String(a.leader).toLowerCase() === key)
          )
          .map((a) => a.name);
        if (byName.length) return byName;
      }
      return [];
    };

    wireOnce(
      sel,
      "change",
      (evt) => {
        let val = evt.target.value || "";
        const txt = evt.target.selectedOptions?.[0]?.text?.trim() || "";
        let changed = false;

        if (val === "__TEAM_ALL__") {
          if (Array.isArray(window.ADVISORS_LIST)) {
            window.selectedAdvisors = new Set(window.ADVISORS_LIST.map((a) => a.name));
            changed = true;
          }
        } else if (val.startsWith("leader::")) {
          const id = val.split("::")[1];
          const names = namesForLeader(id);
          if (names.length) {
            window.selectedAdvisors = new Set(names);
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
        } else {
          // Fallbacks: sometimes the value is just the leader's display name
          const byLeaderName = namesForLeader(val) || namesForLeader(txt);
          if (byLeaderName.length) {
            window.selectedAdvisors = new Set(byLeaderName);
            changed = true;
          } else if (window.ADVISOR_BY_NAME?.has?.(txt)) {
            window.selectedAdvisors = new Set([txt]);
            changed = true;
          }
        }

        if (changed) {
          if (typeof window.refreshChips === "function") window.refreshChips();
          if (typeof window.populateAssignTable === "function") window.populateAssignTable();
          if (typeof window.updateRangeLabel === "function") window.updateRangeLabel();
          if (typeof window.renderCalendar === "function") window.renderCalendar();
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
      if (typeof loadOrg === "function") await loadOrg();
      if (typeof loadTemplates === "function") await loadTemplates();
      if (typeof loadAssignments === "function") await loadAssignments();

      // Rebuild UI (only if helpers exist)
      if (typeof rebuildAdvisorDropdown === "function") rebuildAdvisorDropdown();
      if (typeof rebuildTree === "function") rebuildTree();
      if (typeof refreshChips === "function") refreshChips();
      if (typeof populateTemplateEditor === "function") populateTemplateEditor();
      if (typeof populateAssignTable === "function") populateAssignTable();
      if (typeof updateRangeLabel === "function") updateRangeLabel();
      if (typeof renderCalendar === "function") renderCalendar();

      // Time header (horizontal view)
      const headerEl = document.getElementById("timeHeader");
      if (headerEl && typeof window.renderTimeHeader === "function") {
        window.renderTimeHeader(headerEl);
      }

      // Ensure rotas for current week are loaded before first render
      const wsInput = document.getElementById("weekStart");
      const ws = wsInput?.value;
      if (ws && typeof window.fetchRotasForWeek === "function") {
        try {
          await window.fetchRotasForWeek(ws);
        } catch (e) {
          console.warn("fetchRotasForWeek failed:", e);
        }
      }

      // Wire interactions
      wireAdvisorSelect();
      wireGenerateButton();
      wirePlannerRefreshSources();

      // Initial render
      refreshPlannerUI();
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
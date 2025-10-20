// src/init.js
(() => {
  // ------------------------------
  // Utilities
  // ------------------------------
  function wireOnce(el, ev, handler, flag = `_wired_${ev}`) {
    if (!el) return;
    if (el.dataset && el.dataset[flag]) return;
    el.addEventListener(ev, handler);
    if (el.dataset) el.dataset[flag] = "1";
  }

  // Recompute + render both views
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

  // Make sure weekStart always has a Monday ISO date
  function setMondayIfEmpty() {
    const el = document.getElementById("weekStart");
    if (!el) return;
    if (!el.value) {
      const d = new Date();
      const dow = (d.getDay() + 6) % 7; // Monday = 0
      d.setDate(d.getDate() - dow);
      el.value = d.toISOString().slice(0, 10);
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  // ------------------------------
  // Build advisor indexes from the Master Assignment table
  // ------------------------------
  function rebuildAdvisorIndexesFromTable() {
    const table = document.getElementById("assignTable");
    if (!table) return;

    const names = Array.from(table.querySelectorAll("tbody tr"))
      .map((tr) => (tr.querySelector("th,td")?.textContent || "").trim())
      .filter(Boolean);

    // Use the visible name as the stable ID (works for the in-page planner)
    window.ADVISOR_BY_NAME = new Map(names.map((n) => [n, n]));
    window.ADVISOR_BY_ID = new Map(names.map((n) => [n, n]));
  }

  // ------------------------------
  // Prime ROTAS from the Master Assignment table (for the selected week/day)
  // Writes entries like: ROTAS.set(`${advisorId}::${weekStart}`, { Monday: 'Early', ... })
  // ------------------------------
  function primeRotasFromAssignTable() {
    const ws = document.getElementById("weekStart")?.value;
    const dayName = document.getElementById("teamDay")?.value || "Monday";
    const table = document.getElementById("assignTable");
    if (!ws || !table || !(window.ADVISOR_BY_NAME instanceof Map)) return;

    const DAYS = [
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ];
    const dayIdx = DAYS.indexOf(dayName);
    if (dayIdx < 0) return;

    window.ROTAS = window.ROTAS instanceof Map ? window.ROTAS : new Map();

    Array.from(table.querySelectorAll("tbody tr")).forEach((tr) => {
      const name = (tr.querySelector("th,td")?.textContent || "").trim();
      if (!name) return;
      const aId = window.ADVISOR_BY_NAME.get(name);
      if (!aId) return;

      // Find where the day columns begin for this row
      const cells = Array.from(tr.children || []);
      let startIdx =
        cells.findIndex(
          (td) => td.querySelector("select") || /Early|Late|Middle|Day\s*Off/i.test(td.textContent)
        ) || 1;
      if (startIdx < 0) startIdx = 1; // fallback

      const cell = cells[startIdx + dayIdx];
      if (!cell) return;

      const sel = cell.querySelector("select,[data-template],[data-value]");
      let tpl =
        (sel && "value" in sel ? sel.value : null) ||
        sel?.getAttribute?.("data-template") ||
        sel?.getAttribute?.("data-value") ||
        cell.textContent;

      tpl = (tpl || "").replace(/\r|\n/g, " ").replace(/\s+/g, " ").trim();
      if (!tpl || /(^|\s)day\s*off(\s|$)/i.test(tpl)) return; // skip Day Off / empty

      const key = `${aId}::${ws}`;
      const weekObj = window.ROTAS.get(key) || {};
      weekObj[dayName] = tpl; // planner.js expands this template to segments
      window.ROTAS.set(key, weekObj);
    });
  }

  // ------------------------------
  // Wire sources that should trigger a refresh/prime
  // ------------------------------
  function wirePlannerRefreshSources() {
    // week/day controls
    wireOnce(document.getElementById("weekStart"), "change", () => {
      // reload week if a loader exists, then prime & render
      const ws = document.getElementById("weekStart")?.value;
      if (ws && typeof window.fetchRotasForWeek === "function") {
        window
          .fetchRotasForWeek(ws)
          .catch((e) => console.warn("fetchRotasForWeek failed:", e))
          .finally(() => {
            primeRotasFromAssignTable();
            refreshPlannerUI();
          });
      } else {
        primeRotasFromAssignTable();
        refreshPlannerUI();
      }
    });

    wireOnce(document.getElementById("teamDay"), "change", () => {
      primeRotasFromAssignTable();
      refreshPlannerUI();
    });

    // Master Assignment table changes -> re-prime + render
    const table = document.getElementById("assignTable");
    if (table) {
      wireOnce(
        table,
        "change",
        () => {
          primeRotasFromAssignTable();
          refreshPlannerUI();
        },
        "_wired_change_assign"
      );
    }
  }

  // ------------------------------
  // Top view dropdown (Leader/Team/Advisor) -> sync & refresh
  // ------------------------------
  function wireAdvisorSelect() {
    const viewDropdown =
      document.querySelector("[data-master-view-dropdown]") ||
      document.getElementById("viewSelect") ||
      document.getElementById("viewLeaderTeam") ||
      document.getElementById("advisorSelect");

    if (!viewDropdown) return;

    wireOnce(
      viewDropdown,
      "change",
      (evt) => {
        const opt = evt.target.selectedOptions?.[0];
        const val = opt?.value ?? evt.target.value;

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

        // mirror old behavior by “clicking” matching item in right panel
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

        // after a selection, re-prime & render (covers “Team (Selected)”)
        rebuildAdvisorIndexesFromTable();
        primeRotasFromAssignTable();
        refreshPlannerUI();
      },
      "_wired_change"
    );
  }

  // ------------------------------
  // Generate button just forces a recompute+render
  // ------------------------------
  function wireGenerateButton() {
    const btn = document.getElementById("btnGenerate");
    if (!btn) return;
    wireOnce(
      btn,
      "click",
      async () => {
        try {
          rebuildAdvisorIndexesFromTable();
          primeRotasFromAssignTable();
          refreshPlannerUI();
          console.log("Schedule generated.");
        } catch (err) {
          console.error("Generate failed:", err);
        }
      },
      "_wired_click"
    );
  }

  // ------------------------------
  // BOOT
  // ------------------------------
  // Ensure the in-memory rota cache exists for the horizontal view logic
  window.ROTAS = window.ROTAS || new Map();

  const boot = async () => {
    try {
      // 1) Load data (only if helpers exist)
      if (typeof window.loadOrg === "function") await window.loadOrg();
      if (typeof window.loadTemplates === "function") await window.loadTemplates();
      if (typeof window.loadAssignments === "function") await window.loadAssignments();

      // 2) Rebuild UI (only if helpers exist)
      if (typeof window.rebuildAdvisorDropdown === "function")
        window.rebuildAdvisorDropdown();
      if (typeof window.rebuildTree === "function") window.rebuildTree();
      if (typeof window.refreshChips === "function") window.refreshChips();
      if (typeof window.populateTemplateEditor === "function")
        window.populateTemplateEditor();
      if (typeof window.populateAssignTable === "function")
        window.populateAssignTable();
      if (typeof window.updateRangeLabel === "function") window.updateRangeLabel();
      if (typeof window.renderCalendar === "function") window.renderCalendar();

      // 3) Time header
      const headerEl = document.getElementById("timeHeader");
      if (headerEl && typeof window.renderTimeHeader === "function") {
        window.renderTimeHeader(headerEl);
      }

      // 4) Make sure weekStart has a Monday value
      setMondayIfEmpty();

      // 5) If you have a week-specific loader, fetch then prime ROTAS
      const ws = document.getElementById("weekStart")?.value;
      if (ws && typeof window.fetchRotasForWeek === "function") {
        try {
          await window.fetchRotasForWeek(ws); // should fill/extend window.ROTAS
        } catch (e) {
          console.warn("fetchRotasForWeek failed:", e);
        }
      }

      // 6) Build advisor indexes + prime ROTAS from the table, then render
      rebuildAdvisorIndexesFromTable();
      primeRotasFromAssignTable();
      refreshPlannerUI();

      // 7) Wire interactions
      wireAdvisorSelect();
      wireGenerateButton();
      wirePlannerRefreshSources();
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
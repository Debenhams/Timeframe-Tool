// src/init.js
(() => {
  // -----------------------
  // Template builder (from Settings/Templates UI)
  // -----------------------
  function buildTemplatesFromUI() {
    const root = document.getElementById('settingsBox') || document;
    const editor = root.querySelector('#templateEditor') || root;

    const cards = Array.from(
      editor.querySelectorAll(
        '[data-template-card], .template-card, .tpl, .row, .panel-body > div, #templateEditor > div'
      )
    ).filter(el => el.querySelector('input[type="time"]'));

    const map = {};
    cards.forEach(card => {
      const nameEl =
        card.querySelector('input[type="text"]') ||
        card.querySelector('[data-name]') ||
        card.querySelector('.tpl-name');

      const name = (nameEl?.value || nameEl?.textContent || '').trim();
      if (!name) return;

      const codeEl =
        card.querySelector('input[placeholder="New code"]') ||
        card.querySelector('input[name="code"]') ||
        card.querySelector('[data-code]');

      const times = Array.from(card.querySelectorAll('input[type="time"]'))
        .map(i => i.value?.trim())
        .filter(Boolean);

      const [start_time, finish_time, break1, lunch, break2] = times;

      map[name] = {
        start_time,
        finish_time,
        break1,
        lunch,
        break2,
        work_code: (codeEl?.value || codeEl?.textContent || name || 'Admin').trim()
      };
    });

    window.TEMPLATES = map;
    return map;
  }

  // Recompute and render both views
  function refreshPlannerUI() {
    // Ensure templates exist before building rows
    if (!window.TEMPLATES || !Object.keys(window.TEMPLATES).length) {
      buildTemplatesFromUI();
    }

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

  // One-time wiring helper
  function wireOnce(el, ev, handler, flag = `_wired_${ev}`) {
    if (!el) return;
    if (el.dataset && el.dataset[flag]) return;
    el.addEventListener(ev, handler);
    if (el.dataset) el.dataset[flag] = "1";
  }

  // Rebuild templates whenever the template editor changes
  function wireTemplateEditor() {
    const root = document.getElementById('settingsBox') || document;
    const editor = root.querySelector('#templateEditor') || root;
    const targets = [
      editor,
      ...editor.querySelectorAll('input[type="text"], input[type="time"], [data-code], [data-name]')
    ];
    targets.forEach(t => {
      wireOnce(t, 'change', () => { buildTemplatesFromUI(); refreshPlannerUI(); });
      wireOnce(t, 'input',  () => { buildTemplatesFromUI(); });
    });
  }

  // Sources that should trigger a refresh
  function wirePlannerRefreshSources() {
    wireOnce(document.getElementById("weekStart"), "change", refreshPlannerUI);
    wireOnce(document.getElementById("teamDay"), "change", refreshPlannerUI);
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

  // Top view dropdown (Leader/Team)
  function wireAdvisorSelect() {
    const viewDropdown =
      document.querySelector("[data-master-view-dropdown]") ||
      document.getElementById("advisorSelect") ||
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

        refreshPlannerUI();
      },
      "_wired_change"
    );
  }

  // Generate button
  function wireGenerateButton() {
    const btn = document.getElementById("btnGenerate");
    if (!btn) return;
    wireOnce(
      btn,
      "click",
      async () => {
        // Make sure templates exist at click time
        if (!window.TEMPLATES || !Object.keys(window.TEMPLATES).length) {
          buildTemplatesFromUI();
        }
        refreshPlannerUI();
        console.log("Schedule generated.");
      },
      "_wired_click"
    );
  }

  // -----------------------
  // SAFE BOOT
  // -----------------------
  window.ROTAS = window.ROTAS || new Map();

  const boot = async () => {
    try {
      // Load data (only if helpers exist)
      if (typeof window.loadOrg === "function")         await window.loadOrg();
      if (typeof window.loadTemplates === "function")   await window.loadTemplates().catch(()=>{});
      if (typeof window.loadAssignments === "function") await window.loadAssignments();

      // Build templates from UI if the loader didn’t populate them
      if (!window.TEMPLATES || !Object.keys(window.TEMPLATES).length) {
        buildTemplatesFromUI();
      }

      // Rebuild UI (only if helpers exist)
      if (typeof window.rebuildAdvisorDropdown === "function") window.rebuildAdvisorDropdown();
      if (typeof window.rebuildTree === "function")            window.rebuildTree();
      if (typeof window.refreshChips === "function")           window.refreshChips();
      if (typeof window.populateTemplateEditor === "function") window.populateTemplateEditor();
      if (typeof window.populateAssignTable === "function")    window.populateAssignTable();
      if (typeof window.updateRangeLabel === "function")       window.updateRangeLabel();
      if (typeof window.renderCalendar === "function")         window.renderCalendar();

      // Time header
      const headerEl = document.getElementById("timeHeader");
      if (headerEl && typeof window.renderTimeHeader === "function") {
        window.renderTimeHeader(headerEl);
      }

      // Wire interactions
      wireAdvisorSelect();
      wireGenerateButton();
      wirePlannerRefreshSources();
      wireTemplateEditor();

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
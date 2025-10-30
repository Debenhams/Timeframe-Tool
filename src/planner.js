/**
 * Professional Team Rota System - Main Application Logic (v10.0 - HYBRID PLAN START)
 *
 * This file contains the core logic for the new "Hybrid Adherence" planner.
 *
 * PLAN:
 * 1. (DONE) Load core data: sites, leaders, advisors, rotation_patterns, rotation_assignments.
 * 2. (NEW) Load the new 'schedule_components' table.
 * 3. (NEW) Build the "Advanced Day Editor" (Step 3 of Hybrid Plan).
 * 4. (NEW) Re-build the Rotation Editor tab to use the Advanced Day Editor.
 * 5. (NEW) Re-build the main schedule as a "Master Week View" (Step 4 of Hybrid Plan).
 */

(function () {
  "use strict";

  // --- GLOBALS ---
  if (!window.APP) {
    window.APP = {};
  }

  // App state
  const STATE = {
    sites: [],
    leaders: [],
    advisors: [],
    scheduleComponents: [], // <-- NEW: Replaces shiftTemplates
    rotationPatterns: [],
    rotationAssignments: [],
    selectedAdvisors: new Set(),
    selectedDay: 'Monday', // This will be removed later
    weekStart: null,
    currentRotation: null,
    isBooted: false,
    history: [],
    historyIndex: -1
  };

  // DOM element cache
  const ELS = {};

  // --- 1. DATA FETCHING (from Supabase) ---

  /**
   * Fetches all core data from Supabase in parallel.
   * This is the main data load on application boot.
   */
  async function loadCoreData() {
    if (!window.supabase) {
      showToast("Error: Supabase client not found", "danger");
      return;
    }

    try {
      const [
        sitesRes,
        leadersRes,
        advisorsRes,
        componentsRes, // <-- NEW: Fetching schedule_components
        patternsRes,
        assignmentsRes
      ] = await Promise.all([
        supabase.from('sites').select('*'),
        supabase.from('leaders').select('*'),
        supabase.from('advisors').select('*'),
        supabase.from('schedule_components').select('*').eq('is_active', true), // <-- NEW
        supabase.from('rotation_patterns').select('*'),
        supabase.from('rotation_assignments').select('*')
      ]);

      // Check for errors in any of the promises
      if (sitesRes.error) throw new Error(`Sites: ${sitesRes.error.message}`);
      if (leadersRes.error) throw new Error(`Leaders: ${leadersRes.error.message}`);
      if (advisorsRes.error) throw new Error(`Advisors: ${advisorsRes.error.message}`);
      if (componentsRes.error) throw new Error(`Components: ${componentsRes.error.message}`); // <-- NEW
      if (patternsRes.error) throw new Error(`Patterns: ${patternsRes.error.message}`);
      if (assignmentsRes.error) throw new Error(`Assignments: ${assignmentsRes.error.message}`);

      // All data fetched successfully, update state
      STATE.sites = sitesRes.data || [];
      STATE.leaders = leadersRes.data || [];
      STATE.advisors = advisorsRes.data || [];
      STATE.scheduleComponents = componentsRes.data || []; // <-- NEW
      STATE.rotationPatterns = patternsRes.data || [];
      STATE.rotationAssignments = assignmentsRes.data || [];

      console.log("Core data loaded (Hybrid System):", {
        sites: STATE.sites.length,
        leaders: STATE.leaders.length,
        advisors: STATE.advisors.length,
        components: STATE.scheduleComponents.length, // <-- NEW
        patterns: STATE.rotationPatterns.length,
        assignments: STATE.rotationAssignments.length,
      });

      // --- !!! CRITICAL CHECK !!! ---
      if (STATE.scheduleComponents.length === 0) {
        console.error("FATAL: No schedule components loaded. Did you run the SQL script?");
        showToast("Error: 'schedule_components' table is empty. App cannot start.", "danger");
        return; // Stop loading
      }

    } catch (error) {
      console.error("Boot Failed: Error loading core data", error);
      showToast(`Error loading data: ${error.message}`, "danger");
    }
  }

  // --- 2. STATE MANAGEMENT & HISTORY (Undo/Redo) ---
  // (This code remains largely the same as your V2 file)

  function saveHistory(reason = "Unknown change") {
    if (STATE.historyIndex < STATE.history.length - 1) {
      STATE.history = STATE.history.slice(0, STATE.historyIndex + 1);
    }
    const snapshot = {
      rotationPatterns: JSON.parse(JSON.stringify(STATE.rotationPatterns)),
      rotationAssignments: JSON.parse(JSON.stringify(STATE.rotationAssignments)),
      timestamp: new Date().toISOString(),
      reason: reason
    };
    STATE.history.push(snapshot);
    if (STATE.history.length > 20) STATE.history.shift();
    STATE.historyIndex = STATE.history.length - 1;
    updateUndoRedoButtons();
  }

  function applyHistory(direction) {
    if (direction === 'undo' && STATE.historyIndex > 0) {
      STATE.historyIndex--;
    } else if (direction === 'redo' && STATE.historyIndex < STATE.history.length - 1) {
      STATE.historyIndex++;
    } else {
      return;
    }
    const snapshot = STATE.history[STATE.historyIndex];
    if (!snapshot) return;
    STATE.rotationPatterns = JSON.parse(JSON.stringify(snapshot.rotationPatterns));
    STATE.rotationAssignments = JSON.parse(JSON.stringify(snapshot.rotationAssignments));
    renderAll();
    updateUndoRedoButtons();
  }

  function updateUndoRedoButtons() {
    ELS.btnUndo.disabled = STATE.historyIndex <= 0;
    ELS.btnRedo.disabled = STATE.historyIndex >= STATE.history.length - 1;
  }

  function getAssignmentForAdvisor(advisorId) {
    return STATE.rotationAssignments.find(a => a.advisor_id === advisorId) || null;
  }

  function getPatternByName(name) {
    if (!name) return null;
    return STATE.rotationPatterns.find(p => p.name === name) || null;
  }

  // --- 3. RENDERING ---

  function cacheDOMElements() {
    ELS.weekStart = document.getElementById('weekStart');
    ELS.prevWeek = document.getElementById('prevWeek');
    ELS.nextWeek = document.getElementById('nextWeek');
    ELS.btnCommit = document.getElementById('btnCommit');
    ELS.btnUndo = document.getElementById('btnUndo');
    ELS.btnRedo = document.getElementById('btnRedo');
    ELS.btnPrint = document.getElementById('btnPrint');

    ELS.tabNav = document.querySelector('.tab-nav');
    ELS.tabs = document.querySelectorAll('.tab-content');

    ELS.rotationFamily = document.getElementById('rotationFamily');
    ELS.btnNewRotation = document.getElementById('btnNewRotation');
    ELS.btnSaveRotation = document.getElementById('btnSaveRotation');
    ELS.btnDeleteRotation = document.getElementById('btnDeleteRotation');
    ELS.rotationGrid = document.getElementById('rotationGrid');

    ELS.assignmentGrid = document.getElementById('assignmentGrid');

    // Planner section (to be replaced)
    ELS.plannerSection = document.querySelector('.planner-section');

    ELS.schedulesTree = document.getElementById('schedulesTree');
    ELS.treeSearch = document.getElementById('treeSearch');
    ELS.btnClearSelection = document.getElementById('btnClearSelection');
    ELS.notificationContainer = document.getElementById('notification-container');
  }

  /**
   * Master function to re-render all dynamic UI components.
   */
  function renderAll() {
    if (!STATE.isBooted) return;
    renderSchedulesTree();
    renderRotationEditor();
    renderAssignmentGrid();
    renderPlanner(); // This will just show a "coming soon" message for now
  }

  /**
   * Renders the hierarchical schedules tree (Sites > Leaders > Advisors).
   * (This code is unchanged from your V2 file)
   */
  function renderSchedulesTree() {
    const { sites, leaders, advisors } = STATE;
    const filter = ELS.treeSearch.value.toLowerCase();
    let html = `
      <div class="tree-node">
        <label>
          <input type="checkbox" id="selectAllAdvisors" />
          <strong>Select All Advisors</strong>
        </label>
      </div>
    `;

    const siteMap = {};
    sites.forEach(s => {
      siteMap[s.id] = { ...s, leaders: {} };
    });
    leaders.forEach(l => {
      if (siteMap[l.site_id]) {
        siteMap[l.site_id].leaders[l.id] = { ...l, advisors: [] };
      }
    });
    advisors.forEach(a => {
      if (a.leader_id) {
        const leader = leaders.find(l => l.id === a.leader_id);
        if (leader && siteMap[leader.site_id]) {
          siteMap[leader.site_id].leaders[leader.id].advisors.push(a);
        }
      }
    });

    Object.values(siteMap).sort((a, b) => a.name.localeCompare(b.name)).forEach(site => {
      const leaderEntries = Object.values(site.leaders).sort((a, b) => a.name.localeCompare(b.name));
      const siteMatch = site.name.toLowerCase().includes(filter);
      const leaderMatch = leaderEntries.some(l => l.name.toLowerCase().includes(filter));
      const advisorMatch = leaderEntries.some(l => l.advisors.some(a => a.name.toLowerCase().includes(filter)));

      if (!filter || siteMatch || leaderMatch || advisorMatch) {
        html += `<details class="tree-node" open><summary>${site.name}</summary>`;
        leaderEntries.forEach(leader => {
          const advisorEntries = leader.advisors.sort((a, b) => a.name.localeCompare(b.name));
          const leaderMatch = leader.name.toLowerCase().includes(filter);
          const advMatch = advisorEntries.some(a => a.name.toLowerCase().includes(filter));
          if (!filter || siteMatch || leaderMatch || advMatch) {
            html += `<details class="tree-node-leader" open>
              <summary>
                <label>
                  <input type="checkbox" class="select-leader" data-leader-id="${leader.id}" />
                  ${leader.name}
                </label>
              </summary>`;
            advisorEntries.forEach(adv => {
              if (!filter || siteMatch || leaderMatch || adv.name.toLowerCase().includes(filter)) {
                const isChecked = STATE.selectedAdvisors.has(adv.id);
                html += `
                  <div class="tree-node-advisor">
                    <label>
                      <input type="checkbox" class="select-advisor" data-advisor-id="${adv.id}" ${isChecked ? 'checked' : ''} />
                      ${adv.name}
                    </label>
                  </div>`;
              }
            });
            html += `</details>`;
          }
        });
        html += `</details>`;
      }
    });

    ELS.schedulesTree.innerHTML = html || '<div class="loading-spinner">No schedules found.</div>';

    if (STATE.selectedAdvisors.size === 0 && STATE.advisors.length > 0) {
      const firstAdvisorId = STATE.advisors.sort((a, b) => a.name.localeCompare(b.name))[0].id;
      STATE.selectedAdvisors.add(firstAdvisorId);
      const firstCheckbox = ELS.schedulesTree.querySelector(`.select-advisor[data-advisor-id="${firstAdvisorId}"]`);
      if (firstCheckbox) {
        firstCheckbox.checked = true;
      }
    }
  }

  /**
   * Renders the "Rotation Editor" tab.
   * This will be heavily modified.
   */
  function renderRotationEditor() {
    // 1. Populate Rotation Family dropdown
    const patterns = STATE.rotationPatterns.sort((a, b) => a.name.localeCompare(b.name));
    let opts = '<option value="">-- Select Rotation --</option>';
    patterns.forEach(p => {
      opts += `<option value="${p.name}" ${p.name === STATE.currentRotation ? 'selected' : ''}>${p.name}</option>`;
    });
    ELS.rotationFamily.innerHTML = opts;

    // 2. Render the grid (NEW LOGIC)
    renderRotationGrid();
  }

  /**
   * Renders the 6-week grid for the selected rotation pattern.
   * NEW: Instead of dropdowns, this now shows buttons to launch the "Advanced Day Editor".
   */
  function renderRotationGrid() {
    const pattern = getPatternByName(STATE.currentRotation);
    const patternData = pattern ? (pattern.pattern || {}) : {}; // pattern.pattern is the JSONB
    const weeks = [1, 2, 3, 4, 5, 6];
    const days = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

    let html = '<table><thead><tr><th>WEEK</th>';
    days.forEach(d => html += `<th>${d}</th>`);
    html += '</tr></thead><tbody>';

    weeks.forEach(w => {
      html += `<tr><td>Week ${w}</td>`;
      days.forEach((d, i) => {
        const dow = i + 1; // 1=Mon, 7=Sun
        const weekKey = `Week ${w}`;
        const dayData = (patternData[weekKey] && patternData[weekKey][dow]) ? patternData[weekKey][dow] : null;

        let cellContent = '';
        if (pattern) {
          if (dayData && Array.isArray(dayData) && dayData.length > 0) {
            // Day has been built! Show a summary.
            const first = dayData[0];
            const last = dayData[dayData.length - 1];
            cellContent = `
              <button class="btn btn-secondary btn-day-editor" data-week="${w}" data-dow="${dow}">
                ${first.start_time} - ${last.end_time}
              </button>`;
          } else {
            // Day is empty (RDO)
            cellContent = `
              <button class="btn btn-secondary btn-day-editor" data-week="${w}" data-dow="${dow}">
                + Build Day
              </button>`;
          }
        } else {
          // No rotation selected
          cellContent = `<button class="btn btn-secondary" disabled>+ Build Day</button>`;
        }
        
        html += `<td>${cellContent}</td>`;
      });
      html += '</tr>';
    });
    html += '</tbody></table>';
    ELS.rotationGrid.innerHTML = html;

    // TODO: Add event listener for '.btn-day-editor' to launch the modal
  }

  /**
   * Renders the "Advisor Assignments" grid.
   * (This code is unchanged from your V2 file)
   */
  function renderAssignmentGrid() {
    const advisors = STATE.advisors.sort((a, b) => a.name.localeCompare(b.name));
    const patterns = STATE.rotationPatterns.sort((a, b) => a.name.localeCompare(b.name));
    const patternOpts = patterns
      .map(p => `<option value="${p.name}">${p.name}</option>`)
      .join('');

    let html = '<table><thead><tr><th>Advisor</th><th>Assigned Rotation</th><th>Rotation Start Date (Week 1)</th></tr></thead><tbody>';

    advisors.forEach(adv => {
      const assignment = getAssignmentForAdvisor(adv.id);
      const rotationName = (assignment && assignment.rotation_name) ? assignment.rotation_name : '';
      const startDate = (assignment && assignment.start_date) ? assignment.start_date : '';

      html += `
        <tr data-advisor-id="${adv.id}">
          <td>${adv.name}</td>
          <td>
            <select class="form-select assign-rotation" data-advisor-id="${adv.id}">
              <option value="">-- No Rotation --</option>
              ${patternOpts}
            </select>
          </td>
          <td>
            <input type="text" class="form-input assign-start-date" data-advisor-id="${adv.id}" value="${startDate}" placeholder="dd/mm/yyyy" />
          </td>
        </tr>`;
    });
    html += '</tbody></table>';
    ELS.assignmentGrid.innerHTML = html;

    // Now set values and init calendars
    advisors.forEach(adv => {
      const assignment = getAssignmentForAdvisor(adv.id);
      const row = ELS.assignmentGrid.querySelector(`tr[data-advisor-id="${adv.id}"]`);
      if (!row) return;

      const rotSelect = row.querySelector('.assign-rotation');
      if (rotSelect) {
        rotSelect.value = (assignment && assignment.rotation_name) ? assignment.rotation_name : '';
      }

      const dateInput = row.querySelector('.assign-start-date');
      if (dateInput) {
        flatpickr(dateInput, {
          dateFormat: "d/m/Y", // Note: Supabase needs YYYY-MM-DD, but flatpickr can show d/m/Y
          allowInput: true,
          onChange: function (selectedDates, dateStr, instance) {
            // Convert "d/m/Y" to "YYYY-MM-DD" for Supabase
            const parts = dateStr.split('/');
            const isoDate = (parts.length === 3) ? `${parts[2]}-${parts[1]}-${parts[0]}` : null;
            handleAssignmentChange(instance.element.dataset.advisorId, 'start_date', isoDate);
          }
        });
      }
    });
  }

  /**
   * Renders the main horizontal planner ("Team Schedule").
   * THIS IS DEACTIVATED. We will replace this with the new Master Week View.
   */
  function renderPlanner() {
    if (!ELS.plannerSection) return;
    ELS.plannerSection.innerHTML = `
      <div class="planner-header">
         <h2>Team Schedule</h2>
      </div>
      <div class="loading-spinner" style="padding: 40px; text-align: center;">
        The new "Master Week View" will be built here.
      </div>
    `;
    // All old logic (renderTimeHeader, renderSegmentsForAdvisor) is now GONE.
  }

  // --- 4. CORE LOGIC (Calculations) ---
  // All old calculation functions (calculateSegmentsForAdvisor, getEffectiveWeek,
  // sliceTemplateIntoSegments, getClassForCode) are DELETED.
  // We will add new logic here for the Advanced Day Editor.


  // --- 5. EVENT HANDLERS ---

  function wireEventHandlers() {
    // Top Bar
    flatpickr(ELS.weekStart, {
      dateFormat: "Y-m-d",
      defaultDate: STATE.weekStart,
      onChange: (selectedDates, dateStr) => {
        STATE.weekStart = dateStr;
        // renderPlanner(); // Will render new Master Week View
      }
    });
    ELS.prevWeek.addEventListener('click', () => updateWeek(-7));
    ELS.nextWeek.addEventListener('click', () => updateWeek(7));
    ELS.btnUndo.addEventListener('click', () => applyHistory('undo'));
    ELS.btnRedo.addEventListener('click', () => applyHistory('redo'));

    // Tab Navigation
    ELS.tabNav.addEventListener('click', (e) => {
      if (e.target.classList.contains('tab-link')) {
        const tabId = e.target.dataset.tab;
        ELS.tabNav.querySelectorAll('.tab-link').forEach(t => t.classList.remove('active'));
        ELS.tabs.forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        document.getElementById(tabId).classList.add('active');
      }
    });
    
    // Rotation Editor
    ELS.rotationFamily.addEventListener('change', () => {
      STATE.currentRotation = ELS.rotationFamily.value;
      renderRotationGrid();
    });
    ELS.btnNewRotation.addEventListener('click', handleNewRotation);
    ELS.btnSaveRotation.addEventListener('click', handleSaveRotation);
    ELS.btnDeleteRotation.addEventListener('click', handleDeleteRotation);
    // ELS.rotationGrid.addEventListener('change', ...); // OLD logic removed
    // TODO: Add click listener for '.btn-day-editor'

    // Advisor Assignments
    ELS.assignmentGrid.addEventListener('change', (e) => {
      const target = e.target;
      if (target.classList.contains('assign-rotation')) {
        handleAssignmentChange(target.dataset.advisorId, 'rotation_name', target.value);
      }
    });
    
    // Schedules Tree
    ELS.treeSearch.addEventListener('input', renderSchedulesTree);
    ELS.btnClearSelection.addEventListener('click', () => {
      STATE.selectedAdvisors.clear();
      renderSchedulesTree();
      // renderPlanner();
    });
    ELS.schedulesTree.addEventListener('change', handleTreeSelectionChange);

    // Planner
    // ELS.plannerDay.addEventListener('change', ...); // OLD logic removed
  }

  /**
   * Handles check/uncheck logic for the schedules tree
   * (Unchanged from V2)
   */
  function handleTreeSelectionChange(e) {
    const target = e.target;
    if (target.classList.contains('select-advisor')) {
      const id = target.dataset.advisorId;
      if (target.checked) {
        STATE.selectedAdvisors.add(id);
      } else {
        STATE.selectedAdvisors.delete(id);
      }
    }

    if (target.classList.contains('select-leader')) {
      const leaderId = target.dataset.leaderId;
      const advisorIds = STATE.advisors
        .filter(a => a.leader_id === leaderId)
        .map(a => a.id);
      const checkboxes = target.closest('details').querySelectorAll('.select-advisor');

      if (target.checked) {
        advisorIds.forEach(id => STATE.selectedAdvisors.add(id));
        checkboxes.forEach(cb => cb.checked = true);
      } else {
        advisorIds.forEach(id => STATE.selectedAdvisors.delete(id));
        checkboxes.forEach(cb => cb.checked = false);
      }
    }

    if (target.id === 'selectAllAdvisors') {
      const allCheckboxes = ELS.schedulesTree.querySelectorAll('input[type="checkbox"]');
      if (target.checked) {
        STATE.advisors.forEach(a => STATE.selectedAdvisors.add(a.id));
        allCheckboxes.forEach(cb => cb.checked = true);
      } else {
        STATE.selectedAdvisors.clear();
        allCheckboxes.forEach(cb => cb.checked = false);
      }
    }
    // renderPlanner();
  }

  /**
   * Handles saving a change to an advisor's assignment.
   * (Updated to handle YYYY-MM-DD date format)
   */
  async function handleAssignmentChange(advisorId, field, value) {
    if (!advisorId) return;
    let assignment = getAssignmentForAdvisor(advisorId);

    if (!assignment) {
      assignment = { advisor_id: advisorId, rotation_name: null, start_date: null };
      STATE.rotationAssignments.push(assignment);
    }

    // Ensure value is null, not empty string
    assignment[field] = value || null;

    // ** CRITICAL **
    // Supabase date fields require 'YYYY-MM-DD' or null.
    // The flatpickr onChange handler now provides this.
    
    // Create a clean object for upserting
    const upsertData = {
      advisor_id: assignment.advisor_id,
      rotation_name: assignment.rotation_name,
      start_date: assignment.start_date
    };

    try {
      const { data, error } = await supabase
        .from('rotation_assignments')
        .upsert(upsertData, { onConflict: 'advisor_id' })
        .select();

      if (error) throw error;

      const index = STATE.rotationAssignments.findIndex(a => a.advisor_id === advisorId);
      if (index > -1) {
        STATE.rotationAssignments[index] = data[0];
      }

      saveHistory('Update assignment');
      showToast("Assignment saved.", "success");
      // renderPlanner(); // Re-render the planner to show the change

    } catch (error) {
      console.error("Failed to save assignment:", error);
      showToast(`Error saving: ${error.message}`, "danger");
      // TODO: Revert local state on failure?
    }
  }

  // handleRotationGridChange is DELETED

  /**
   * Handles creating a new rotation pattern.
   * (Unchanged from V2)
   */
  async function handleNewRotation() {
    const name = prompt("Enter a name for the new rotation family (e.g., 'Flex 7'):");
    if (!name || name.trim() === '') return;

    if (getPatternByName(name)) {
      showToast(`Error: A rotation named '${name}' already exists.`, "danger");
      return;
    }

    const newPattern = {
      name: name,
      pattern: {} // Empty pattern
    };

    try {
      const { data, error } = await supabase
        .from('rotation_patterns')
        .insert(newPattern)
        .select();

      if (error) throw error;

      STATE.rotationPatterns.push(data[0]);
      STATE.currentRotation = name;
      saveHistory(`Create rotation ${name}`);
      renderRotationEditor();

    } catch (error) {
      console.error("Failed to create rotation:", error);
      showToast(`Error creating rotation: ${error.message}`, "danger");
    }
  }

  /**
   * Handles saving the currently edited rotation pattern.
   * (Unchanged from V2)
   */
  async function handleSaveRotation() {
    const rotationName = STATE.currentRotation;
    if (!rotationName) {
      showToast("No rotation selected to save.", "danger");
      return;
    }

    const pattern = getPatternByName(rotationName);
    if (!pattern) return;

    try {
      const { data, error } = await supabase
        .from('rotation_patterns')
        .update({ pattern: pattern.pattern }) // Only update the pattern JSON
        .eq('name', rotationName)
        .select();

      if (error) throw error;

      showToast(`Rotation '${rotationName}' saved.`, "success");
      saveHistory(`Save rotation ${rotationName}`);
      
    } catch (error) {
      console.error("Failed to save rotation:", error);
      showToast(`Error saving rotation: ${error.message}`, "danger");
    }
  }

  /**
   * Handles deleting the currently selected rotation pattern.
   * (Unchanged from V2)
   */
  async function handleDeleteRotation() {
    const rotationName = STATE.currentRotation;
    if (!rotationName) {
      showToast("No rotation selected to delete.", "danger");
      return;
    }

    if (!confirm(`Are you sure you want to PERMANENTLY delete the '${rotationName}' rotation? This cannot be undone.`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('rotation_patterns')
        .delete()
        .eq('name', rotationName);

      if (error) throw error;

      STATE.rotationPatterns = STATE.rotationPatterns.filter(p => p.name !== rotationName);
      STATE.currentRotation = null;

      showToast(`Rotation '${rotationName}' deleted.`, "success");
      saveHistory(`Delete rotation ${rotationName}`);
      renderRotationEditor();

      // TODO: We should also clear any advisor assignments that used this rotation.
      
    } catch (error) {
      console.error("Failed to delete rotation:", error);
      showToast(`Error deleting rotation: ${error.message}. It might be in use by an advisor.`, "danger");
    }
  }

  /**
   * Shifts the main weekStart date by a number of days.
   * (Unchanged from V2)
   */
  function updateWeek(days) {
    const flatpickrInstance = ELS.weekStart._flatpickr;
    if (!flatpickrInstance) return;

    const currentDate = flatpickrInstance.selectedDates[0] || new Date();
    currentDate.setDate(currentDate.getDate() + days);

    flatpickrInstance.setDate(currentDate, true); // true = trigger onChange
  }


  // --- 6. UTILITIES ---

  /**
   * Displays a notification toast at the bottom of the screen.
   * (Unchanged from V2)
   */
  function showToast(message, type = "success", duration = 3000) {
    const toast = document.createElement('div');
    toast.className = `toast is-${type}`;
    toast.textContent = message;

    ELS.notificationContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(20px)';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  // --- 7. APPLICATION BOOT ---

  /**
   * Sets a default Monday for the week picker.
   * (Unchanged from V2)
   */
  function setDefaultWeek() {
    let d = new Date();
    let day = d.getDay();
    let diff = d.getDate() - day + (day === 0 ? -6 : 1);

    const localMonday = new Date(d.getFullYear(), d.getMonth(), diff);
    const y = localMonday.getFullYear();
    const m = String(localMonday.getMonth() + 1).padStart(2, '0');
    const dStr = String(localMonday.getDate()).padStart(2, '0');
    STATE.weekStart = `${y}-${m}-${dStr}`;
  }

  /**
   * Main application boot sequence.
   */
  async function bootApplication() {
    console.log("Booting application (Hybrid System)...");

    // 1. Cache DOM elements
    cacheDOMElements();

    // 2. Set default date
    setDefaultWeek();

    // 3. Load all data from Supabase
    await loadCoreData();

    // 4. Set initial state and save "base" history
    STATE.isBooted = true;
    saveHistory("Initial Load");

    // 5. Render all UI components
    renderAll();

    // 6. Wire up event listeners
    wireEventHandlers();

    console.log("Boot complete. State:", STATE);
  }

  // Expose boot function to global scope
  window.APP.bootApplication = bootApplication;

})();
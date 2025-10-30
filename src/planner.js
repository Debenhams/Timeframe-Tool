/**
 * Professional Team Rota System - Main Application Logic (v10.3 - Event Delegation FIX)
 *
 * This file contains the core logic for the new "Hybrid Adherence" planner.
 * This version is designed to be called by 'init.js'.
 *
 * FIX v10.3: The click listener for '.btn-day-editor' was not firing because
 * the buttons are dynamically created.
 *
 * SOLUTION: Moved the listener from wireEventHandlers() into renderRotationGrid()
 * using event delegation on the parent ELS.rotationGrid.
 *
 * ---
 *
 * FIX v10.2: Moved utility functions (minutesToTime, etc.) to the top of the
 * file to prevent ReferenceErrors during rendering.
 */

(function () {
  "use strict";

  // --- GLOBALS ---
  // Expose the APP namespace for init.js
  if (!window.APP) {
    window.APP = {};
  }
  
  // App state
  const STATE = {
    sites: [],
    leaders: [],
    advisors: [],
    scheduleComponents: [],
    rotationPatterns: [],
    rotationAssignments: [],
    selectedAdvisors: new Set(),
    selectedDay: 'Monday',
    weekStart: null,
    currentRotation: null,
    isBooted: false,
    history: [],
    historyIndex: -1
  };

  // DOM element cache
  const ELS = {};
  
  // --- 0. UTILITIES (MOVED TO TOP) ---
  
  function timeToMinutes(timeStr) {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
  }

  function minutesToTime(totalMinutes) {
    if (typeof totalMinutes !== 'number' || isNaN(totalMinutes)) {
      console.warn("Invalid input to minutesToTime:", totalMinutes);
      return "00:00";
    }
    const h = Math.floor(totalMinutes / 60).toString().padStart(2, '0');
    const m = (totalMinutes % 60).toString().padStart(2, '0');
    return `${h}:${m}`;
  }

  function isColorDark(hexColor) {
    if (!hexColor) return true;
    try {
      let hex = hexColor.replace('#', '');
      if (hex.length === 3) {
        hex = hex.split('').map(c => c + c).join('');
      }
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      return luminance < 0.5;
    } catch (e) {
      return true;
    }
  }
  
  function showToast(message, type = "success", duration = 3000) {
    // This check is now safe because bootApplication()
    // isn't called until AFTER DOM load.
    if (!ELS.notificationContainer) {
      console.warn("Notification container not found. Toast:", message);
      return;
    }
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


  // --- 1. DATA FETCHING (from Supabase) ---

  async function loadCoreData() {
    if (!window.supabase) {
      throw new Error("Supabase client not found. Check HTML script tag.");
    }

    try {
      const [
        sitesRes,
        leadersRes,
        advisorsRes,
        componentsRes,
        patternsRes,
        assignmentsRes
      ] = await Promise.all([
        supabase.from('sites').select('*'),
        supabase.from('leaders').select('*'),
        supabase.from('advisors').select('*'),
        supabase.from('schedule_components').select('*').eq('is_active', true),
        supabase.from('rotation_patterns').select('*'),
        supabase.from('rotation_assignments').select('*')
      ]);

      if (sitesRes.error) throw new Error(`Sites: ${sitesRes.error.message}`);
      if (leadersRes.error) throw new Error(`Leaders: ${leadersRes.error.message}`);
      if (advisorsRes.error) throw new Error(`Advisors: ${advisorsRes.error.message}`);
      if (componentsRes.error) throw new Error(`Components: ${componentsRes.error.message}`);
      if (patternsRes.error) throw new Error(`Patterns: ${patternsRes.error.message}`);
      if (assignmentsRes.error) throw new Error(`Assignments: ${assignmentsRes.error.message}`);

      STATE.sites = sitesRes.data || [];
      STATE.leaders = leadersRes.data || [];
      STATE.advisors = advisorsRes.data || [];
      STATE.scheduleComponents = componentsRes.data || [];
      STATE.rotationPatterns = patternsRes.data || [];
      STATE.rotationAssignments = assignmentsRes.data || [];

      console.log("Core data loaded (Hybrid System):", {
        sites: STATE.sites.length,
        leaders: STATE.leaders.length,
        advisors: STATE.advisors.length,
        components: STATE.scheduleComponents.length,
        patterns: STATE.rotationPatterns.length,
        assignments: STATE.rotationAssignments.length,
      });

      if (STATE.scheduleComponents.length === 0) {
        throw new Error("'schedule_components' table is empty. Please run the SQL script to populate it.");
      }

    } catch (error) {
      console.error("Boot Failed: Error loading core data", error);
      throw error;
    }
  }

  // --- 2. STATE MANAGEMENT & HISTORY (Undo/Redo) ---

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
    console.log("Caching DOM elements...");
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

    ELS.plannerSection = document.querySelector('.planner-section');
    
    // MODAL ELEMENTS
    ELS.modal = document.getElementById('dayEditorModal');
    ELS.modalTitle = document.getElementById('dayEditorTitle');
    ELS.modalClose = document.getElementById('dayEditorClose');
    ELS.modalComponents = document.getElementById('dayEditorComponents');
    ELS.modalTimeTicks = document.getElementById('dayEditorTimeTicks');
    ELS.modalTrack = document.getElementById('dayEditorTrack');
    ELS.modalClear = document.getElementById('dayEditorClear');
    ELS.modalSave = document.getElementById('dayEditorSave');

    // SIDEBAR
    ELS.schedulesTree = document.getElementById('schedulesTree');
    ELS.treeSearch = document.getElementById('treeSearch');
    ELS.btnClearSelection = document.getElementById('btnClearSelection');
    
    // NOTIFICATION
    ELS.notificationContainer = document.getElementById('notification-container');
    console.log("DOM elements cached.");
  }

  function renderAll() {
    if (!STATE.isBooted) return;
    console.log("Rendering all components...");
    renderSchedulesTree();
    renderRotationEditor();
    renderAssignmentGrid();
    renderPlanner();
    console.log("All components rendered.");
  }

  function renderSchedulesTree() {
    const { sites, leaders, advisors } = STATE;
    if (!ELS.schedulesTree) {
        console.error("Schedules tree element not found during render.");
        return;
    }
    
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

  function renderRotationEditor() {
    const patterns = STATE.rotationPatterns.sort((a, b) => a.name.localeCompare(b.name));
    let opts = '<option value="">-- Select Rotation --</option>';
    patterns.forEach(p => {
      opts += `<option value="${p.name}" ${p.name === STATE.currentRotation ? 'selected' : ''}>${p.name}</option>`;
    });
    ELS.rotationFamily.innerHTML = opts;
    renderRotationGrid();
  }

  function renderRotationGrid() {
    const pattern = getPatternByName(STATE.currentRotation);
    const patternData = pattern ? (pattern.pattern || {}) : {};
    const weeks = [1, 2, 3, 4, 5, 6];
    const days = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

    let html = '<table><thead><tr><th>WEEK</th>';
    days.forEach(d => html += `<th>${d}</th>`);
    html += '</tr></thead><tbody>';

    weeks.forEach(w => {
      html += `<tr><td>Week ${w}</td>`;
      days.forEach((d, i) => {
        const dow = i + 1;
        const weekKey = `Week ${w}`;
        const dayData = (patternData[weekKey] && patternData[weekKey][dow]) ? patternData[weekKey][dow] : null;

        let cellContent = '';
        if (pattern) {
          if (dayData && Array.isArray(dayData) && dayData.length > 0) {
            const first = dayData[0];
            const last = dayData[dayData.length - 1];
            cellContent = `
              <button class="btn btn-secondary btn-day-editor" data-week="${w}" data-dow="${dow}">
                ${minutesToTime(first.start_min)} - ${minutesToTime(last.end_min)}
              </button>`;
          } else {
            cellContent = `
              <button class="btn btn-secondary btn-day-editor" data-week="${w}" data-dow="${dow}">
                + Build Day
              </button>`;
          }
        } else {
          cellContent = `<button class="btn btn-secondary" disabled>+ Build Day</button>`;
        }
        
        html += `<td>${cellContent}</td>`;
      });
      html += '</tr>';
    });
    html += '</tbody></table>';
    
    ELS.rotationGrid.innerHTML = html;
    
    // --- EVENT DELEGATION FIX (v10.3) ---
    // This listener is now attached to the parent grid, which always exists.
    ELS.rotationGrid.onclick = function(e) {
      const button = e.target.closest('.btn-day-editor');
      if (button) {
        e.preventDefault(); 
        const { week, dow } = button.dataset;
        openDayEditor(week, dow);
      }
    };
  }

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
      
      let displayDate = '';
      if (startDate) {
        try {
          const parts = startDate.split('-');
          if (parts.length === 3) {
            displayDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
          }
        } catch(e) { console.warn('Invalid start_date format', startDate); }
      }

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
            <input type="text" class="form-input assign-start-date" data-advisor-id="${adv.id}" value="${displayDate}" placeholder="dd/mm/yyyy" />
          </td>
        </tr>`;
    });
    html += '</tbody></table>';
    ELS.assignmentGrid.innerHTML = html;

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
          dateFormat: "d/m/Y",
          defaultDate: dateInput.value,
          allowInput: true,
          onChange: function (selectedDates, dateStr, instance) {
            const parts = dateStr.split('/');
            const isoDate = (parts.length === 3) ? `${parts[2]}-${parts[1]}-${parts[0]}` : null;
            handleAssignmentChange(instance.element.dataset.advisorId, 'start_date', isoDate);
          }
        });
      }
    });
  }

  function renderPlanner() {
    if (!ELS.plannerSection) {
        console.error("Planner section element not found during render.");
        return;
    }
    ELS.plannerSection.innerHTML = `
      <div class="planner-header">
         <h2>Team Schedule</h2>
      </div>
      <div class="loading-spinner" style="padding: 40px; text-align: center;">
        The new "Master Week View" will be built here.
      </div>
    `;
  }

  // --- 4. CORE LOGIC (Advanced Day Editor) ---

  const EDITOR_STATE = {
    week: null,
    dow: null,
    segments: []
  };
  
  const EDITOR_CONFIG = {
    startHour: 6,
    endHour: 22,
    totalHours: 16,
    totalMinutes: 16 * 60
  };

  function openDayEditor(week, dow) {
    console.log(`Opening editor for Week ${week}, DOW ${dow}`);
    EDITOR_STATE.week = week;
    EDITOR_STATE.dow = dow;
    
    const dayName = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][dow - 1];
    ELS.modalTitle.textContent = `Build Shift: Week ${week}, ${dayName}`;
    
    renderComponentBricks();
    renderTimeTicks();
    loadDaySegments();
    
    ELS.modal.style.display = 'flex';
  }

  function closeDayEditor() {
    ELS.modal.style.display = 'none';
    EDITOR_STATE.week = null;
    EDITOR_STATE.dow = null;
    EDITOR_STATE.segments = [];
    ELS.modalTrack.innerHTML = '';
  }

  function renderComponentBricks() {
    let html = '';
    const types = ['Work', 'Break', 'Exception'];
    
    types.forEach(type => {
      html += `<h4 class="component-type-header">${type}s</h4>`;
      STATE.scheduleComponents
        .filter(c => c.type === type)
        .sort((a,b) => a.name.localeCompare(b.name))
        .forEach(c => {
          html += `
            <div class="component-brick" 
                 style="background-color: ${c.color}; color: ${isColorDark(c.color) ? '#fff' : '#111'}"
                 draggable="true"
                 data-name="${c.name}"
                 data-type="${c.type}"
                 data-color="${c.color}">
              ${c.name}
            </div>
          `;
        });
    });
    ELS.modalComponents.innerHTML = html;
  }

  function renderTimeTicks() {
    const { startHour, endHour, totalHours } = EDITOR_CONFIG;
    const tickContainer = ELS.modalTimeTicks;
    const track = ELS.modalTrack;
    
    const totalWidth = totalHours * 100; // 1600px
    tickContainer.style.width = `${totalWidth}px`;
    track.style.width = `${totalWidth}px`;
    
    const pixelsPer15Min = 100 / 4; // 25px
    track.style.backgroundSize = `${pixelsPer15Min}px 100%`;

    let html = '';
    for (let h = startHour; h <= endHour; h++) {
      const pct = (h - startHour) / totalHours * 100;
      const label = h.toString().padStart(2, '0') + ':00';
      html += `<div class="time-tick" style="left: ${pct}%;">${label}</div>`;
    }
    tickContainer.innerHTML = html;
  }

  function loadDaySegments() {
    const pattern = getPatternByName(STATE.currentRotation);
    if (!pattern) return;
    
    const weekKey = `Week ${EDITOR_STATE.week}`;
    const dayData = (pattern.pattern && pattern.pattern[weekKey] && pattern.pattern[weekKey][EDITOR_STATE.dow]) 
      ? pattern.pattern[weekKey][EDITOR_STATE.dow] 
      : [];

    EDITOR_STATE.segments = JSON.parse(JSON.stringify(dayData));
    renderDaySegments();
  }
  
  function renderDaySegments() {
    ELS.modalTrack.innerHTML = '';
    let html = '';
    
    EDITOR_STATE.segments.sort((a,b) => a.start_min - b.start_min);
    
    EDITOR_STATE.segments.forEach((seg, index) => {
      const startPct = (seg.start_min - (EDITOR_CONFIG.startHour * 60)) / EDITOR_CONFIG.totalMinutes * 100;
      const widthPct = (seg.end_min - seg.start_min) / EDITOR_CONFIG.totalMinutes * 100;
      
      const startTime = minutesToTime(seg.start_min);
      const endTime = minutesToTime(seg.end_min);
      const label = `${seg.name} (${startTime} - ${endTime})`;
      const color = seg.color || '#333';
      
      let overlapClass = '';
      if (index < EDITOR_STATE.segments.length - 1) {
        if (seg.end_min > EDITOR_STATE.segments[index + 1].start_min) {
          overlapClass = 'is-overlap';
        }
      }
      
      html += `
        <div class="track-segment ${overlapClass}" 
             style="left: ${startPct}%; width: ${widthPct}%; background-color: ${color}; color: ${isColorDark(color) ? '#fff' : '#111'}"
             data-index="${index}">
          <span class="segment-label">${label}</span>
          <button class="segment-delete" data-index="${index}">&times;</button>
        </div>
      `;
    });
    
    ELS.modalTrack.innerHTML = html;
  }

  function handleSaveDay() {
    const pattern = getPatternByName(STATE.currentRotation);
    if (!pattern) {
      showToast("Error: No rotation selected.", "danger");
      return;
    }
    
    const finalSegments = EDITOR_STATE.segments.sort((a,b) => a.start_min - b.start_min);
    
    const weekKey = `Week ${EDITOR_STATE.week}`;
    if (!pattern.pattern) pattern.pattern = {};
    if (!pattern.pattern[weekKey]) pattern.pattern[weekKey] = {};
    
    pattern.pattern[weekKey][EDITOR_STATE.dow] = finalSegments;
    
    console.log(`Saved ${finalSegments.length} segments to ${weekKey}, DOW ${EDITOR_STATE.dow}`);
    
    closeDayEditor();
    renderRotationGrid();
    
    showToast("Day saved locally. Click 'Save' to commit to database.", "success");
  }

  function handleClearDay() {
    if (!confirm("Are you sure you want to clear this day and set it as RDO?")) {
      return;
    }
    EDITOR_STATE.segments = [];
    handleSaveDay();
  }


  // --- 5. EVENT HANDLERS ---

  function wireEventHandlers() {
    console.log("Wiring event handlers...");
    // Top Bar
    flatpickr(ELS.weekStart, {
      dateFormat: "Y-m-d",
      defaultDate: STATE.weekStart,
      onChange: (selectedDates, dateStr) => {
        STATE.weekStart = dateStr;
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
      renderRotationGrid(); // This will re-render and re-apply the click listener
    });
    ELS.btnNewRotation.addEventListener('click', handleNewRotation);
    ELS.btnSaveRotation.addEventListener('click', handleSaveRotation);
    ELS.btnDeleteRotation.addEventListener('click', handleDeleteRotation);
    
    // NOTE: The click listener for 'btn-day-editor' is now
    // applied *inside* the renderRotationGrid() function.

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
    });
    ELS.schedulesTree.addEventListener('change', handleTreeSelectionChange);
    
    // MODAL Listeners
    ELS.modalClose.addEventListener('click', closeDayEditor);
    ELS.modalSave.addEventListener('click', handleSaveDay);
    ELS.modalClear.addEventListener('click', handleClearDay);
    console.log("Event handlers wired.");
  }

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
  }

  async function handleAssignmentChange(advisorId, field, value) {
    if (!advisorId) return;
    let assignment = getAssignmentForAdvisor(advisorId);

    if (!assignment) {
      assignment = { advisor_id: advisorId, rotation_name: null, start_date: null };
      STATE.rotationAssignments.push(assignment);
    }

    assignment[field] = value || null;
    
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

    } catch (error) {
      console.error("Failed to save assignment:", error);
      showToast(`Error saving: ${error.message}`, "danger");
    }
  }

  async function handleNewRotation() {
    const name = prompt("Enter a name for the new rotation family (e.g., 'Flex 7'):");
    if (!name || name.trim() === '') return;

    if (getPatternByName(name)) {
      showToast(`Error: A rotation named '${name}' already exists.`, "danger");
      return;
    }

    const newPattern = {
      name: name,
      pattern: {}
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
        .update({ pattern: pattern.pattern })
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
      
    } catch (error) {
      console.error("Failed to delete rotation:", error);
      showToast(`Error deleting rotation: ${error.message}. It might be in use by an advisor.`, "danger");
    }
  }

  function updateWeek(days) {
    const flatpickrInstance = ELS.weekStart._flatpickr;
    if (!flatpickrInstance) return;

    const currentDate = flatpickrInstance.selectedDates[0] || new Date();
    currentDate.setDate(currentDate.getDate() + days);

    flatpickrInstance.setDate(currentDate, true);
  }

  // --- 6. UTILITIES ---
  // (Moved to top of file)


  // --- 7. APPLICATION BOOT ---

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
   * This is called by init.js AFTER the DOM is loaded.
   */
  async function bootApplication() {
    console.log("Booting application (Hybrid System v10.3)...");
    
    try {
      // 1. Cache elements *first*
      // This is now SAFE because init.js waited for DOMContentLoaded
      cacheDOMElements();
      
      // 2. Set defaults
      setDefaultWeek();
      
      // 3. Load data
      await loadCoreData();

      // 4. Set state
      STATE.isBooted = true;
      saveHistory("Initial Load");

      // 5. Render
      renderAll();
      
      // 6. Wire handlers
      wireEventHandlers();

      console.log("Boot complete. State:", STATE);
      showToast("Application Loaded", "success");
      
    } catch (e) {
      // Catch any fatal boot errors
      console.error("FATAL BOOT ERROR:", e);
      // We can use showToast because ELS is cached
      showToast(e.message, "danger", 10000);
    }
  }
  
  // Expose the boot function to the global scope
  // so init.js can call it.
  window.APP.bootApplication = bootApplication;

})();
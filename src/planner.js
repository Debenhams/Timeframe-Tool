/**
 * Professional Team Rota System - Main Application Logic (v10.5 - Component-Based Refactor)
 *
 * Implements the Hybrid Adherence model, Advanced Day Editor, Drag-and-Drop with Collision Detection, 
 * Component Management, and Core Schedule Calculation.
 */

(function () {
  "use strict";

  if (!window.APP) {
    window.APP = {};
  }
  
  // Core Application State
  const STATE = {
    sites: [],
    leaders: [],
    advisors: [],
    scheduleComponents: [], // NEW v10: The building blocks
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

  // Temporary state for the Advanced Day Editor Modal
  const EDITOR_STATE = {
    isOpen: false,
    rotationName: null,
    week: null,
    dow: null, // Day of week (1=Mon, 7=Sun)
    segments: [], 
    dragData: null,
  };

  // Constants for the timeline view (06:00 - 22:00)
  const TIMELINE_START_MIN = 6 * 60; // 360
  const TIMELINE_END_MIN = 22 * 60; // 1320
  const TIMELINE_DURATION_MIN = TIMELINE_END_MIN - TIMELINE_START_MIN; // 960 mins (16 hours)
  const SNAP_INTERVAL = 15; // Snap to 15 minutes

  // DOM element cache
  const ELS = {};

  // --- 1. DATA FETCHING (Supabase) ---

  async function loadCoreData() {
    if (!window.supabase) return;

    try {
      // Fetch the new schedule_components and remove shift_templates
      const [sitesRes, leadersRes, advisorsRes, componentsRes, patternsRes, assignmentsRes] = await Promise.all([
        supabase.from('sites').select('*'),
        supabase.from('leaders').select('*'),
        supabase.from('advisors').select('*'),
        supabase.from('schedule_components').select('*'), // NEW v10
        supabase.from('rotation_patterns').select('*'), 
        supabase.from('rotation_assignments').select('*')
      ]);

      // Basic error checking
      if (componentsRes.error) throw new Error(`Components: ${componentsRes.error.message}`);
      
      // Update state
      STATE.sites = sitesRes.data || [];
      STATE.leaders = leadersRes.data || [];
      STATE.advisors = advisorsRes.data || [];
      STATE.scheduleComponents = componentsRes.data || [];
      STATE.rotationPatterns = patternsRes.data || [];
      STATE.rotationAssignments = assignmentsRes.data || [];
      
      console.log("Core data loaded. Components:", STATE.scheduleComponents.length);

    } catch (error) {
      console.error("Boot Failed:", error);
      showToast(`Error loading data: ${error.message}`, "danger");
    }
  }

  // --- 2. STATE MANAGEMENT & HISTORY ---

  function saveHistory(reason = "Change") {
    if (STATE.historyIndex < STATE.history.length - 1) {
      STATE.history = STATE.history.slice(0, STATE.historyIndex + 1);
    }
    const snapshot = {
      rotationPatterns: JSON.parse(JSON.stringify(STATE.rotationPatterns)),
      rotationAssignments: JSON.parse(JSON.stringify(STATE.rotationAssignments)),
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
    STATE.rotationPatterns = JSON.parse(JSON.stringify(snapshot.rotationPatterns));
    STATE.rotationAssignments = JSON.parse(JSON.stringify(snapshot.rotationAssignments));
    renderAll();
    updateUndoRedoButtons();
  }

  function updateUndoRedoButtons() {
    if (ELS.btnUndo) ELS.btnUndo.disabled = STATE.historyIndex <= 0;
    if (ELS.btnRedo) ELS.btnRedo.disabled = STATE.historyIndex >= STATE.history.length - 1;
  }
  
  // State Helpers
  function getAssignmentForAdvisor(id) { return STATE.rotationAssignments.find(a => a.advisor_id === id) || null; }
  function getPatternByName(name) { return STATE.rotationPatterns.find(p => p.name === name) || null; }
  function getComponentById(id) { return STATE.scheduleComponents.find(c => c.id === id) || null; }

  // --- 3. RENDERING ---

  function cacheDOMElements() {
    ELS.weekStart = document.getElementById('weekStart');
    ELS.prevWeek = document.getElementById('prevWeek');
    ELS.nextWeek = document.getElementById('nextWeek');
    ELS.btnUndo = document.getElementById('btnUndo');
    ELS.btnRedo = document.getElementById('btnRedo');
    ELS.tabNav = document.querySelector('.tab-nav');
    ELS.tabs = document.querySelectorAll('.tab-content');
    ELS.rotationFamily = document.getElementById('rotationFamily');
    ELS.btnNewRotation = document.getElementById('btnNewRotation');
    ELS.btnSaveRotation = document.getElementById('btnSaveRotation');
    ELS.btnDeleteRotation = document.getElementById('btnDeleteRotation');
    ELS.rotationGrid = document.getElementById('rotationGrid');
    ELS.assignmentGrid = document.getElementById('assignmentGrid');
    ELS.componentManagerGrid = document.getElementById('componentManagerGrid');
    ELS.btnNewComponent = document.getElementById('btnNewComponent');
    ELS.plannerDay = document.getElementById('plannerDay');
    ELS.timeHeader = document.getElementById('timeHeader');
    ELS.plannerBody = document.getElementById('plannerBody');
    ELS.schedulesTree = document.getElementById('schedulesTree');
    ELS.treeSearch = document.getElementById('treeSearch');
    ELS.btnClearSelection = document.getElementById('btnClearSelection');
    ELS.notificationContainer = document.getElementById('notification-container');
    // Modal Elements
    ELS.dayEditorModal = document.getElementById('dayEditorModal');
    ELS.modalTitle = document.getElementById('modalTitle');
    ELS.modalClose = document.getElementById('modalClose');
    ELS.modalComponentList = document.getElementById('modalComponentList');
    ELS.modalTimeHeader = document.getElementById('modalTimeHeader');
    ELS.modalTrack = document.getElementById('modalTrack');
    ELS.modalTotalTime = document.getElementById('modalTotalTime');
    ELS.modalPaidTime = document.getElementById('modalPaidTime');
    ELS.modalClearDay = document.getElementById('modalClearDay');
    ELS.modalSaveDay = document.getElementById('modalSaveDay');
  }

  function renderAll() {
    if (!STATE.isBooted) return;
    renderSchedulesTree();
    renderRotationEditor();
    renderAssignmentGrid();
    renderComponentManager(); // New v10
    renderPlanner();
  }

  // (renderSchedulesTree and renderAssignmentGrid remain largely the same as V9.4)
  // Simplified implementations provided here for context.
  function renderSchedulesTree() {
    let html = '';
    STATE.advisors.sort((a,b) => a.name.localeCompare(b.name)).forEach(adv => {
        const isChecked = STATE.selectedAdvisors.has(adv.id);
        html += `<div class="tree-node-advisor" style="padding-left: 20px;"><label>
            <input type="checkbox" class="select-advisor" data-advisor-id="${adv.id}" ${isChecked ? 'checked' : ''} />
            ${adv.name}
        </label></div>`;
    });
    ELS.schedulesTree.innerHTML = html || '<div class="loading-spinner">No advisors loaded.</div>';

     // Auto-select first advisor if none selected
     if (STATE.selectedAdvisors.size === 0 && STATE.advisors.length > 0) {
        const firstAdvisor = STATE.advisors.sort((a,b) => a.name.localeCompare(b.name))[0];
        STATE.selectedAdvisors.add(firstAdvisor.id);
        renderSchedulesTree(); // Re-render to check the box
        renderPlanner();
    }
  }

  function renderAssignmentGrid() {
    const advisors = STATE.advisors.sort((a,b) => a.name.localeCompare(b.name));
    const patterns = STATE.rotationPatterns.sort((a,b) => a.name.localeCompare(b.name));
    
    const patternOpts = patterns.map(p => `<option value="${p.name}">${p.name}</option>`).join('');

    let html = '<table><thead><tr><th>Advisor</th><th>Assigned Rotation</th><th>Start Date (dd/mm/yyyy)</th></tr></thead><tbody>';

    advisors.forEach(adv => {
      const assignment = getAssignmentForAdvisor(adv.id);
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
          dateFormat: "d/m/Y",
          allowInput: true,
          "locale": { "firstDayOfWeek": 1 }, // Monday
          onChange: function(selectedDates, dateStr, instance) {
            const advisorId = instance.element.dataset.advisorId;
            handleAssignmentChange(advisorId, 'start_date', dateStr);
          }
        });
      }
    });
  }

  /**
   * Renders the "Rotation Editor" tab (dropdown).
   */
  function renderRotationEditor() {
    const patterns = STATE.rotationPatterns.sort((a,b) => a.name.localeCompare(b.name));
    let opts = '<option value="">-- Select Rotation --</option>';
    patterns.forEach(p => {
      opts += `<option value="${p.name}" ${p.name === STATE.currentRotation ? 'selected' : ''}>${p.name}</option>`;
    });
    ELS.rotationFamily.innerHTML = opts;
    renderRotationGrid();
  }
  
  /**
   * Renders the 6-week grid. REFACTORED v10: Cells are clickable summaries.
   */
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
        const weekData = patternData[weekKey] || {};
        const daySegments = weekData[dow] || []; 
        
        let cellContent = '';
        let cellAttributes = `data-week="${w}" data-dow="${dow}"`;

        if (!pattern) {
            cellContent = `<div class="rotation-cell-content"></div>`;
             cellAttributes = ''; // Disable interaction if no pattern selected
        } else if (daySegments.length > 0) {
            // Calculate summary (Start Time, End Time, Duration)
            // We assume segments are sorted when saved
            const startMin = daySegments[0].start_min;
            const endMin = daySegments[daySegments.length - 1].end_min;
            const durationMin = daySegments.reduce((acc, s) => acc + (s.end_min - s.start_min), 0);

            const startTime = formatMinutesToTime(startMin);
            const endTime = formatMinutesToTime(endMin);
            const duration = formatDuration(durationMin);

            cellContent = `
                <div class="rotation-cell-content">
                    <span class="cell-time">${startTime} - ${endTime}</span>
                    <span class="cell-duration">(${duration})</span>
                </div>`;
        } else {
            // Empty day
            cellContent = `<div class="rotation-cell-content"><span class="cell-build">+ Build Day</span></div>`;
        }
        
        // The TD is the clickable element
        html += `<td ${cellAttributes}>${cellContent}</td>`;
      });
      html += '</tr>';
    });
    html += '</tbody></table>';
    ELS.rotationGrid.innerHTML = html;
  }

  /**
   * Renders the "Component Manager" tab (New v10).
   */
  function renderComponentManager() {
    const components = STATE.scheduleComponents.sort((a,b) => a.name.localeCompare(b.name));

    let html = '<table><thead><tr><th>Name</th><th>Type</th><th>Color</th><th>Default Duration</th><th>Paid</th><th>Actions</th></tr></thead><tbody>';

    components.forEach(comp => {
        html += `
        <tr data-component-id="${comp.id}">
            <td>${comp.name}</td>
            <td>${comp.type}</td>
            <td><span style="display: inline-block; width: 20px; height: 20px; background-color: ${comp.color}; border-radius: 4px;"></span></td>
            <td>${comp.default_duration_min}m</td>
            <td>${comp.is_paid ? 'Yes' : 'No'}</td>
            <td>
                <button class="btn btn-sm btn-danger delete-component" data-component-id="${comp.id}">Delete</button>
            </td>
        </tr>`;
    });
    html += '</tbody></table>';
    ELS.componentManagerGrid.innerHTML = html;
  }


  /**
   * Renders the main horizontal planner ("Team Schedule").
   */
  function renderPlanner() {
    if (!ELS.timeHeader || !ELS.plannerBody) return;
    
    renderTimeHeader(ELS.timeHeader);
    
    const selected = Array.from(STATE.selectedAdvisors);
    if (selected.length === 0) {
      ELS.plannerBody.innerHTML = '';
      return;
    }

    const advisorsToRender = STATE.advisors
      .filter(a => selected.includes(a.id))
      .sort((a,b) => a.name.localeCompare(b.name));
      
    let html = '';
    
    advisorsToRender.forEach(adv => {
      html += `
        <div class="timeline-row">
          <div class="timeline-name">${adv.name}</div>
          <div class="timeline-track">
            ${renderSegmentsForAdvisor(adv.id)}
          </div>
        </div>
      `;
    });
    
    ELS.plannerBody.innerHTML = html;
  }
  
  /**
   * Renders the time ticks in a timeline header.
   */
  function renderTimeHeader(headerElement) {
    const startHour = Math.floor(TIMELINE_START_MIN / 60);
    const endHour = Math.floor(TIMELINE_END_MIN / 60);
    const totalHours = (TIMELINE_END_MIN - TIMELINE_START_MIN) / 60;
    
    let html = '';
    for (let h = startHour; h <= endHour; h++) {
      const pct = (h - startHour) / totalHours * 100;
      const label = h.toString().padStart(2, '0') + ':00';
      html += `<div class="time-tick" style="left: ${pct}%;">${label}</div>`;
    }
    headerElement.innerHTML = html;
  }
  
  /**
   * Calculates and renders the HTML for all segments for a given advisor.
   */
  function renderSegmentsForAdvisor(advisorId) {
    const segments = calculateSegmentsForAdvisor(advisorId);
    if (!segments || segments.length === 0) {
      return '<div class="no-data">RDO or Unassigned</div>';
    }
    
    return segments.map(seg => {
      // Find component details (color, name)
      const component = getComponentById(seg.component_id);
      if (!component) return '';

      // Calculate position and width
      const startPct = ((seg.start_min - TIMELINE_START_MIN) / TIMELINE_DURATION_MIN) * 100;
      const widthPct = ((seg.end_min - seg.start_min) / TIMELINE_DURATION_MIN) * 100;
      
      const startTime = formatMinutesToTime(seg.start_min);
      const endTime = formatMinutesToTime(seg.end_min);
      const textColor = getContrastingTextColor(component.color);

      return `
        <div class="timeline-bar" style="left: ${startPct}%; width: ${widthPct}%; background-color: ${component.color}; color: ${textColor};" title="${component.name} (${startTime} - ${endTime})">
          <span class="bar-label">${component.name}</span>
        </div>
      `;
    }).join('');
  }

  // --- 4. CORE LOGIC (Calculations) ---

  /**
   * Calculates segments for an advisor. REFACTORED v10: Reads component-based structure.
   */
  function calculateSegmentsForAdvisor(advisorId) {
    // Future Step: Check `rotas` table for live exceptions first.

    // Fallback to the rotation pattern
    const assignment = getAssignmentForAdvisor(advisorId);
    if (!assignment || !assignment.rotation_name || !assignment.start_date || !STATE.weekStart) return [];

    const effectiveWeek = getEffectiveWeek(assignment.start_date, STATE.weekStart, assignment);
    if (effectiveWeek === null) return [];
    
    const dayOfWeek = ELS.plannerDay.value;
    const dayIndex = (['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].indexOf(dayOfWeek) + 1).toString();

    const pattern = getPatternByName(assignment.rotation_name);
    if (!pattern || !pattern.pattern) return [];
    
    // Get the segments array for the specific week and day
    const weekPattern = pattern.pattern[`Week ${effectiveWeek}`] || {};
    const daySegments = weekPattern[dayIndex];
    
    return daySegments || [];
  }
  
  /**
   * Calculates the effective week number (1-N) of a rotation.
   * CRITICAL FUNCTIONALITY restored from V9.4 and refined.
   */
  function getEffectiveWeek(startDateStr, weekStartISO, assignment) {
    try {
      if (!startDateStr || !weekStartISO || !assignment) return null;
      
      // Parse "dd/mm/yyyy" (Format used in the Assignment Grid)
      const [d, m, y] = startDateStr.split('/').map(Number);
      if (isNaN(d) || isNaN(m) || isNaN(y)) {
          return null; 
      }
      
      // Parse "YYYY-MM-DD" (Format used by the Week Picker)
      const [y2, m2, d2] = weekStartISO.split('-').map(Number);
      if (isNaN(y2) || isNaN(m2) || isNaN(d2)) return null;

      // Use UTC to avoid timezone shifts
      const startUTC = Date.UTC(y, m - 1, d);
      const checkUTC = Date.UTC(y2, m2 - 1, d2);
      
      const diffTime = checkUTC - startUTC;
      
      // If the checked week is before the rotation start date, it's invalid for this rotation
      if (diffTime < 0) return null;

      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      const diffWeeks = Math.floor(diffDays / 7);
      
      // Determine rotation length (defaulting to 6 weeks)
      const pattern = getPatternByName(assignment.rotation_name);
      let numWeeksInRotation = 6; 
      if (pattern && pattern.pattern && Object.keys(pattern.pattern).length > 0) {
          const keys = Object.keys(pattern.pattern);
          // Find the highest numbered week defined (e.g., "Week 6")
          const maxWeek = Math.max(...keys.map(k => parseInt(k.replace('Week ', ''), 10) || 0));
          if (maxWeek > 0) {
              numWeeksInRotation = maxWeek;
          }
      }
            
      // Calculate the effective week number using modulo arithmetic (1-based index)
      const effectiveWeek = (diffWeeks % numWeeksInRotation) + 1;
      
      return effectiveWeek;
    } catch (e) {
      console.error("Error calculating effective week:", e);
      return null;
    }
  }
  

  // --- 5. EVENT HANDLERS ---

  function wireEventHandlers() {
    // Top Bar
    flatpickr(ELS.weekStart, {
      dateFormat: "Y-m-d",
      defaultDate: STATE.weekStart,
      "locale": { "firstDayOfWeek": 1 }, // Monday
      onChange: (selectedDates, dateStr) => {
        STATE.weekStart = dateStr;
        renderPlanner();
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
    
    // NEW v10: Click handler for the rotation grid (opens the modal)
    ELS.rotationGrid.addEventListener('click', handleRotationGridClick);

    // Assignment Grid
    ELS.assignmentGrid.addEventListener('change', (e) => {
        if (e.target.classList.contains('assign-rotation')) {
            handleAssignmentChange(e.target.dataset.advisorId, 'rotation_name', e.target.value);
        }
        // Date changes are handled by flatpickr instances
    });

    // Component Manager (New v10)
    ELS.btnNewComponent.addEventListener('click', handleNewComponent);
    ELS.componentManagerGrid.addEventListener('click', handleComponentManagerClick);

    // Schedules Tree (Simplified handler)
    ELS.schedulesTree.addEventListener('change', (e) => {
        if (e.target.classList.contains('select-advisor')) {
            const id = e.target.dataset.advisorId;
            e.target.checked ? STATE.selectedAdvisors.add(id) : STATE.selectedAdvisors.delete(id);
            renderPlanner();
        }
    });
    
    // Planner
    ELS.plannerDay.addEventListener('change', () => renderPlanner());

    // Advanced Day Editor Modal (New v10)
    ELS.modalClose.addEventListener('click', closeDayEditorModal);
    ELS.modalSaveDay.addEventListener('click', handleSaveDay);
    ELS.modalClearDay.addEventListener('click', handleClearDay);
    
    // Modal Drag and Drop Events
    // Note: Drag start listeners are added dynamically in renderComponentBricks
    ELS.modalTrack.addEventListener('dragover', handleDragOver);
    ELS.modalTrack.addEventListener('dragleave', handleDragLeave);
    ELS.modalTrack.addEventListener('drop', handleDrop);
    ELS.modalTrack.addEventListener('click', handleTrackClick); // For deleting segments
  }
  
  /**
   * Handles clicking on a cell in the rotation grid. Opens the Advanced Day Editor.
   */
  function handleRotationGridClick(e) {
    const cell = e.target.closest('td[data-week]');
    if (!cell) return;

    const { week, dow } = cell.dataset;
    const rotationName = STATE.currentRotation;

    if (!rotationName) {
        // If the user clicks a cell when "Select Rotation" is active, do nothing (handled by CSS pointer-events: none on the cell, but this is a fallback)
        return;
    }

    openDayEditorModal(rotationName, parseInt(week), parseInt(dow));
  }

  // --- 6. ADVANCED DAY EDITOR (Modal Logic - New v10) ---

  /**
   * Opens the modal and initializes the editor state.
   */
  function openDayEditorModal(rotationName, week, dow) {
    const pattern = getPatternByName(rotationName);
    if (!pattern) return;

    // 1. Load existing data for the day
    const weekKey = `Week ${week}`;
    const existingSegments = (pattern.pattern && pattern.pattern[weekKey] && pattern.pattern[weekKey][dow])
        ? JSON.parse(JSON.stringify(pattern.pattern[weekKey][dow]))
        : [];

    // 2. Set EDITOR_STATE
    EDITOR_STATE.isOpen = true;
    EDITOR_STATE.rotationName = rotationName;
    EDITOR_STATE.week = week;
    EDITOR_STATE.dow = dow;
    EDITOR_STATE.segments = existingSegments;

    // 3. Render the modal UI
    const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    ELS.modalTitle.textContent = `Edit Day: ${rotationName} - Week ${week}, ${dayNames[dow-1]}`;
    
    renderTimeHeader(ELS.modalTimeHeader);
    renderComponentBricks();
    renderDaySegments();

    // 4. Show the modal
    ELS.dayEditorModal.style.display = 'flex';
  }

  function closeDayEditorModal() {
    EDITOR_STATE.isOpen = false;
    ELS.dayEditorModal.style.display = 'none';
  }

  /**
   * Renders the draggable "bricks" in the modal sidebar, categorized by type.
   */
  function renderComponentBricks() {
    const types = ['Activity', 'Break', 'Lunch', 'Shrinkage', 'Absence'];
    let html = '';

    types.forEach(type => {
        const components = STATE.scheduleComponents
            .filter(c => c.type === type)
            .sort((a, b) => a.name.localeCompare(b.name));

        if (components.length > 0) {
            html += `<h4>${type}</h4>`;
            components.forEach(comp => {
                const textColor = getContrastingTextColor(comp.color);
                html += `
                    <div class="component-brick" draggable="true" data-component-id="${comp.id}" 
                         style="background-color: ${comp.color}; color: ${textColor};">
                        ${comp.name}
                    </div>
                `;
            });
        }
    });

    ELS.modalComponentList.innerHTML = html;

    // Add dragstart listeners
    ELS.modalComponentList.querySelectorAll('.component-brick').forEach(brick => {
        brick.addEventListener('dragstart', handleDragStart);
    });
  }

  /**
   * Renders the segments currently in EDITOR_STATE onto the modal track.
   */
  function renderDaySegments() {
    let html = '';
    let totalDuration = 0;
    let paidDuration = 0;

    // Sort segments by start time
    EDITOR_STATE.segments.sort((a, b) => a.start_min - b.start_min);

    EDITOR_STATE.segments.forEach((seg, index) => {
        const component = getComponentById(seg.component_id);
        if (!component) return;

        // Calculate position and width
        const startPct = ((seg.start_min - TIMELINE_START_MIN) / TIMELINE_DURATION_MIN) * 100;
        const widthPct = ((seg.end_min - seg.start_min) / TIMELINE_DURATION_MIN) * 100;

        const textColor = getContrastingTextColor(component.color);
        const startTime = formatMinutesToTime(seg.start_min);
        const endTime = formatMinutesToTime(seg.end_min);

        html += `
            <div class="track-segment" data-index="${index}" style="left: ${startPct}%; width: ${widthPct}%; background-color: ${component.color}; color: ${textColor};">
                <div class="segment-name">${component.name}</div>
                <div class="segment-time">${startTime} - ${endTime}</div>
                <button class="segment-delete" data-index="${index}" title="Delete segment">&times;</button>
            </div>
        `;
        const duration = seg.end_min - seg.start_min;
        totalDuration += duration;
        if (component.is_paid) {
            paidDuration += duration;
        }
    });

    ELS.modalTrack.innerHTML = html;
    ELS.modalTotalTime.textContent = formatDuration(totalDuration);
    ELS.modalPaidTime.textContent = formatDuration(paidDuration);
  }

  // --- 7. DRAG AND DROP LOGIC (New v10) ---

  function handleDragStart(e) {
    const componentId = e.target.dataset.componentId;
    const component = getComponentById(componentId);
    if (!component) return;

    // Store data about the dragged item
    EDITOR_STATE.dragData = {
        componentId: component.id,
        duration: component.default_duration_min,
        source: 'sidebar'
    };
    
    e.dataTransfer.setData('text/plain', componentId);
    e.dataTransfer.effectAllowed = 'copy';
  }

  function handleDragOver(e) {
    e.preventDefault(); // Necessary to allow drop
    e.dataTransfer.dropEffect = 'copy';
    ELS.modalTrack.classList.add('drag-over');
  }

  function handleDragLeave(e) {
    ELS.modalTrack.classList.remove('drag-over');
  }

  function handleDrop(e) {
    e.preventDefault();
    ELS.modalTrack.classList.remove('drag-over');

    if (!EDITOR_STATE.dragData || EDITOR_STATE.dragData.source !== 'sidebar') return;

    const dragData = EDITOR_STATE.dragData;
    
    // 1. Calculate drop position in minutes
    const trackRect = ELS.modalTrack.getBoundingClientRect();
    const dropX = e.clientX - trackRect.left;
    const trackWidth = trackRect.width;
    
    const dropPct = dropX / trackWidth;
    let startMin = TIMELINE_START_MIN + (dropPct * TIMELINE_DURATION_MIN);
    
    // 2. Adjust positioning (attempt to center on cursor initially)
    startMin = startMin - (dragData.duration / 2);

    // 3. Snap to grid
    startMin = Math.round(startMin / SNAP_INTERVAL) * SNAP_INTERVAL;
    
    // 4. Constrain to timeline boundaries
    startMin = Math.max(TIMELINE_START_MIN, startMin); 

    let endMin = startMin + dragData.duration;
    if (endMin > TIMELINE_END_MIN) {
        endMin = TIMELINE_END_MIN;
        startMin = endMin - dragData.duration;
        if (startMin < TIMELINE_START_MIN) startMin = TIMELINE_START_MIN; // Handle case where duration > total time
    }

    // 5. Check for overlaps (CRITICAL: Collision detection)
    const overlaps = EDITOR_STATE.segments.some(seg => {
        // Overlap occurs if StartA < EndB AND EndA > StartB
        return startMin < seg.end_min && endMin > seg.start_min;
    });

    if (overlaps) {
        showToast("Error: Segments cannot overlap.", "danger");
        return;
    }

    // 6. Create the new segment (We only store the ID and times)
    const newSegment = {
        component_id: dragData.componentId,
        start_min: startMin,
        end_min: endMin
    };

    // 7. Add to state and re-render
    EDITOR_STATE.segments.push(newSegment);
    renderDaySegments();

    EDITOR_STATE.dragData = null;
  }

  /**
   * Handles clicks on the modal track (specifically for deleting segments).
   */
  function handleTrackClick(e) {
    if (e.target.classList.contains('segment-delete')) {
        const index = parseInt(e.target.dataset.index, 10);
        if (!isNaN(index)) {
            // Since renderDaySegments sorts the array, we must remove based on the sorted index
            EDITOR_STATE.segments.sort((a, b) => a.start_min - b.start_min);
            EDITOR_STATE.segments.splice(index, 1);
            renderDaySegments();
        }
    }
  }

  /**
   * Saves the day from the modal back to the main STATE.
   */
  function handleSaveDay() {
    const { rotationName, week, dow, segments } = EDITOR_STATE;
    const pattern = getPatternByName(rotationName);

    if (!pattern) return;

    if (!pattern.pattern) pattern.pattern = {};
    const weekKey = `Week ${week}`;
    if (!pattern.pattern[weekKey]) pattern.pattern[weekKey] = {};

    if (segments.length > 0) {
        // Ensure segments are sorted and saved
        segments.sort((a, b) => a.start_min - b.start_min);
        pattern.pattern[weekKey][dow] = segments;
    } else {
        // If segments are empty, delete the day entry (RDO)
        delete pattern.pattern[weekKey][dow];
    }

    // Re-render the rotation grid to show the updated summary
    renderRotationGrid();
    closeDayEditorModal();
    showToast("Day updated locally. Click 'Save Pattern' to commit to database.", "success", 5000);
  }

  function handleClearDay() {
    if (confirm("Are you sure you want to clear all activities for this day (RDO)?")) {
        EDITOR_STATE.segments = [];
        renderDaySegments();
    }
  }

  // --- 8. CRUD HANDLERS (Rotations, Components & Assignments) ---

  async function handleNewRotation() {
    const name = prompt("Enter a name for the new rotation family:");
    if (!name || name.trim() === '' || getPatternByName(name)) return;
    
    const newPattern = { name: name, pattern: {} };
    try {
        const { data, error } = await supabase.from('rotation_patterns').insert(newPattern).select();
        if (error) throw error;
        STATE.rotationPatterns.push(data[0]);
        STATE.currentRotation = name;
        saveHistory(`Create rotation`);
        renderRotationEditor();
    } catch (error) {
        showToast(`Error creating rotation: ${error.message}`, "danger");
    }
  }

  async function handleSaveRotation() {
    const rotationName = STATE.currentRotation;
    if (!rotationName) return;
    const pattern = getPatternByName(rotationName);
    
    try {
      // The pattern object in STATE already contains the updated JSONB data
      const { error } = await supabase.from('rotation_patterns').update({ pattern: pattern.pattern }).eq('name', rotationName);
      if (error) throw error;
      
      showToast(`Rotation '${rotationName}' saved successfully.`, "success");
      saveHistory(`Save rotation`);
      renderPlanner(); // Re-render planner in case this rotation is active
      
    } catch (error) {
      showToast(`Error saving rotation: ${error.message}`, "danger");
    }
  }

  async function handleDeleteRotation() {
     const rotationName = STATE.currentRotation;
    if (!rotationName) return;
    
    if (!confirm(`Are you sure you want to delete '${rotationName}'?`)) return;
    
    try {
        const { error } = await supabase.from('rotation_patterns').delete().eq('name', rotationName);
        if (error) throw error;
        
        STATE.rotationPatterns = STATE.rotationPatterns.filter(p => p.name !== rotationName);
        STATE.currentRotation = null;
        saveHistory(`Delete rotation`);
        renderRotationEditor();
    } catch (error) {
        showToast(`Error deleting rotation: ${error.message}. It might be assigned to advisors.`, "danger");
    }
  }

  async function handleAssignmentChange(advisorId, field, value) {
    let assignment = getAssignmentForAdvisor(advisorId);
    
    if (!assignment) {
      assignment = { advisor_id: advisorId, rotation_name: null, start_date: null };
      STATE.rotationAssignments.push(assignment);
    }
    
    assignment[field] = value || null;

    try {
      const { data, error } = await supabase
        .from('rotation_assignments')
        .upsert(assignment, { onConflict: 'advisor_id' })
        .select();
        
      if (error) throw error;
      
      // Update state with the definitive data returned from DB
      const index = STATE.rotationAssignments.findIndex(a => a.advisor_id === advisorId);
      if (index > -1) {
        STATE.rotationAssignments[index] = data[0];
      }
      
      saveHistory('Update assignment');
      renderPlanner();
      
    } catch (error) {
      showToast(`Error saving assignment: ${error.message}`, "danger");
    }
  }

  // Component Management Handlers (Using basic prompts as requested)
  async function handleNewComponent() {
    const name = prompt("Enter component name (e.g., 'PLT WhatsApp'):");
    if (!name) return;
    const type = prompt("Enter type (Activity, Break, Lunch, Shrinkage, Absence):", "Activity");
    const color = prompt("Enter hex color code (e.g., '#3498db'):", "#3498db");
    const duration = parseInt(prompt("Enter default duration in minutes:", "60"), 10);
    const isPaid = confirm("Is this a paid activity?");

    if (!name || !type || !color || isNaN(duration)) {
        showToast("Invalid input for new component.", "danger");
        return;
    }

    const newComponent = { name, type, color, default_duration_min: duration, is_paid: isPaid };

    try {
        const { data, error } = await supabase
            .from('schedule_components')
            .insert(newComponent)
            .select();
        
        if (error) throw error;
        
        STATE.scheduleComponents.push(data[0]);
        renderComponentManager();
        showToast(`Component '${name}' created.`, "success");

    } catch (error) {
        showToast(`Error creating component: ${error.message}`, "danger");
    }
  }

  function handleComponentManagerClick(e) {
    if (e.target.classList.contains('delete-component')) {
        const componentId = e.target.dataset.componentId;
        handleDeleteComponent(componentId);
    }
  }

  async function handleDeleteComponent(componentId) {
    const component = getComponentById(componentId);
    if (!component) return;

    if (!confirm(`Are you sure you want to delete '${component.name}'? This may affect existing rotations.`)) return;

    try {
        const { error } = await supabase
            .from('schedule_components')
            .delete()
            .eq('id', componentId);
        
        if (error) throw error;

        STATE.scheduleComponents = STATE.scheduleComponents.filter(c => c.id !== componentId);
        renderComponentManager();
        showToast(`Component deleted.`, "success");

    } catch (error) {
        showToast(`Error deleting component: ${error.message}`, "danger");
    }
  }


  // --- 9. UTILITIES ---

  function showToast(message, type = "success", duration = 3000) {
    const toast = document.createElement('div');
    toast.className = `toast is-${type}`;
    toast.textContent = message;
    ELS.notificationContainer.appendChild(toast);
    setTimeout(() => { toast.remove(); }, duration);
  }

  function formatMinutesToTime(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  function formatDuration(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h ${String(m).padStart(2, '0')}m`;
  }

  // Determines if white or black text should be used on a given background color.
  function getContrastingTextColor(hexColor) {
    if (!hexColor) return '#000000';
    try {
        const r = parseInt(hexColor.substr(1, 2), 16);
        const g = parseInt(hexColor.substr(3, 2), 16);
        const b = parseInt(hexColor.substr(5, 2), 16);
        // Calculate perceived brightness (YIQ)
        const brightness = ((r * 299) + (g * 587) + (b * 114)) / 1000;
        return (brightness > 128) ? '#000000' : '#FFFFFF';
    } catch (e) {
        return '#FFFFFF'; // Fallback
    }
  }

  function updateWeek(days) {
    const flatpickrInstance = ELS.weekStart._flatpickr;
    if (!flatpickrInstance) return;
    const currentDate = flatpickrInstance.selectedDates[0] || new Date();
    currentDate.setDate(currentDate.getDate() + days);
    flatpickrInstance.setDate(currentDate, true);
  }

  // --- 10. APPLICATION BOOT ---
  
  function setDefaultWeek() {
    // Logic to set the current Monday
    let d = new Date();
    let day = d.getDay();
    let diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const localMonday = new Date(d.getFullYear(), d.getMonth(), diff);
    const y = localMonday.getFullYear();
    const m = String(localMonday.getMonth() + 1).padStart(2, '0');
    const dStr = String(localMonday.getDate()).padStart(2, '0');
    STATE.weekStart = `${y}-${m}-${dStr}`;
  }

  async function bootApplication() {
    console.log("Booting application (v10.5)...");
    cacheDOMElements();
    setDefaultWeek();
    await loadCoreData();
    STATE.isBooted = true;
    saveHistory("Initial Load");
    renderAll();
    wireEventHandlers();
    console.log("Boot complete.");
  }

  // Expose boot function
  window.APP.bootApplication = bootApplication;

})();
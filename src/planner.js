/**
 * Professional Team Rota System - Main Application Logic (v11.0 - Shift Definitions Architecture)
 *
 * Implements a system where detailed shifts are defined once (Shift Definitions) 
 * and then applied efficiently via dropdowns in the Rotation Editor.
 * Includes significant visual upgrades to the main planner view.
 */

(function () {
  "use strict";

  if (!window.APP) {
    window.APP = {};
  }
  
  // Core Application State
  const STATE = {
    advisors: [],
    scheduleComponents: [], 
    shiftDefinitions: [], // NEW v11: Library of predefined shifts
    rotationPatterns: [], 
    rotationAssignments: [],
    selectedAdvisors: new Set(),
    weekStart: null, 
    currentRotation: null,
    isBooted: false,
    history: [],
    historyIndex: -1
  };

  // Temporary state for the Editor Modal (Now used for Shift Definitions)
  const EDITOR_STATE = {
    isOpen: false,
    shiftDefinitionId: null, // The ID of the shift being edited
    segments: [], // The structure (JSONB) of the shift
    dragData: null,
  };

  // Constants for the timeline view (06:00 - 22:00)
  const TIMELINE_START_MIN = 6 * 60; // 360
  const TIMELINE_END_MIN = 22 * 60; // 1320
  const TIMELINE_DURATION_MIN = TIMELINE_END_MIN - TIMELINE_START_MIN; // 960 mins (16 hours)
  const SNAP_INTERVAL = 15; 

  // DOM element cache
  const ELS = {};

  // --- 1. DATA FETCHING (Supabase) ---

  async function loadCoreData() {
    if (!window.supabase) return;

    try {
      // Fetch the new shift_definitions table
      const [advisorsRes, componentsRes, definitionsRes, patternsRes, assignmentsRes] = await Promise.all([
        supabase.from('advisors').select('*'),
        supabase.from('schedule_components').select('*'),
        supabase.from('shift_definitions').select('*'), // NEW v11
        supabase.from('rotation_patterns').select('*'), 
        supabase.from('rotation_assignments').select('*')
      ]);

      // Basic error checking
      if (definitionsRes.error) throw new Error(`Shift Definitions: ${definitionsRes.error.message}`);
      
      // Update state
      STATE.advisors = advisorsRes.data || [];
      STATE.scheduleComponents = componentsRes.data || [];
      STATE.shiftDefinitions = definitionsRes.data || [];
      STATE.rotationPatterns = patternsRes.data || [];
      STATE.rotationAssignments = assignmentsRes.data || [];
      
      console.log("Core data loaded. Definitions:", STATE.shiftDefinitions.length);

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
      // V11: We now also track changes to shift definitions
      shiftDefinitions: JSON.parse(JSON.stringify(STATE.shiftDefinitions)),
      rotationPatterns: JSON.parse(JSON.stringify(STATE.rotationPatterns)),
      rotationAssignments: JSON.parse(JSON.stringify(STATE.rotationAssignments)),
    };
    STATE.history.push(snapshot);
    if (STATE.history.length > 30) STATE.history.shift();
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
    STATE.shiftDefinitions = JSON.parse(JSON.stringify(snapshot.shiftDefinitions));
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
  function getShiftDefinitionById(id) { return STATE.shiftDefinitions.find(d => d.id === id) || null; }
  function getShiftDefinitionByCode(code) { return STATE.shiftDefinitions.find(d => d.code === code) || null; }


  // --- 3. RENDERING ---

  function cacheDOMElements() {
    // Standard Elements
    ELS.weekStart = document.getElementById('weekStart');
    ELS.prevWeek = document.getElementById('prevWeek');
    ELS.nextWeek = document.getElementById('nextWeek');
    ELS.btnUndo = document.getElementById('btnUndo');
    ELS.btnRedo = document.getElementById('btnRedo');
    ELS.tabNav = document.querySelector('.tab-nav');
    ELS.tabs = document.querySelectorAll('.tab-content');
    // Rotation Editor
    ELS.rotationFamily = document.getElementById('rotationFamily');
    ELS.btnNewRotation = document.getElementById('btnNewRotation');
    ELS.btnDeleteRotation = document.getElementById('btnDeleteRotation');
    ELS.rotationGrid = document.getElementById('rotationGrid');
    // Shift Definitions (New V11)
    ELS.shiftDefinitionsGrid = document.getElementById('shiftDefinitionsGrid');
    ELS.btnNewShiftDefinition = document.getElementById('btnNewShiftDefinition');
    // Assignments and Components
    ELS.assignmentGrid = document.getElementById('assignmentGrid');
    ELS.componentManagerGrid = document.getElementById('componentManagerGrid');
    ELS.btnNewComponent = document.getElementById('btnNewComponent');
    // Planner View
    ELS.plannerDay = document.getElementById('plannerDay');
    ELS.timeHeader = document.getElementById('timeHeader');
    ELS.plannerBody = document.getElementById('plannerBody');
    // Sidebar
    ELS.schedulesTree = document.getElementById('schedulesTree');
    ELS.treeSearch = document.getElementById('treeSearch');
    ELS.btnClearSelection = document.getElementById('btnClearSelection');
    ELS.notificationContainer = document.getElementById('notification-container');
    // Modal Elements (Repurposed V11)
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
    renderShiftDefinitions(); // New V11
    renderRotationEditor();
    renderAssignmentGrid();
    renderComponentManager(); 
    renderPlanner();
  }

  // Simplified renderSchedulesTree
  function renderSchedulesTree() {
    let html = '';
    STATE.advisors.sort((a,b) => a.name.localeCompare(b.name)).forEach(adv => {
        const isChecked = STATE.selectedAdvisors.has(adv.id);
        html += `<div class="tree-node-advisor" style="padding-left: 10px;"><label>
            <input type="checkbox" class="select-advisor" data-advisor-id="${adv.id}" ${isChecked ? 'checked' : ''} />
            ${adv.name}
        </label></div>`;
    });
    ELS.schedulesTree.innerHTML = html || '<div class="loading-spinner">No advisors.</div>';

     if (STATE.selectedAdvisors.size === 0 && STATE.advisors.length > 0) {
        const firstAdvisor = STATE.advisors.sort((a,b) => a.name.localeCompare(b.name))[0];
        STATE.selectedAdvisors.add(firstAdvisor.id);
        renderSchedulesTree();
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
      
      html += `<tr data-advisor-id="${adv.id}">
          <td>${adv.name}</td>
          <td><select class="form-select assign-rotation" data-advisor-id="${adv.id}"><option value="">-- None --</option>${patternOpts}</select></td>
          <td><input type="text" class="form-input assign-start-date" data-advisor-id="${adv.id}" value="${startDate}" /></td>
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
          allowInput: true,
          "locale": { "firstDayOfWeek": 1 }, // Monday
          onChange: function(selectedDates, dateStr, instance) {
            handleAssignmentChange(instance.element.dataset.advisorId, 'start_date', dateStr);
          }
        });
      }
    });
  }
  
  function renderComponentManager() {
     const components = STATE.scheduleComponents.sort((a,b) => a.name.localeCompare(b.name));

    let html = '<table><thead><tr><th>Name</th><th>Type</th><th>Color</th><th>Default Duration</th><th>Paid</th><th>Actions</th></tr></thead><tbody>';

    components.forEach(comp => {
        html += `<tr data-component-id="${comp.id}">
            <td>${comp.name}</td>
            <td>${comp.type}</td>
            <td><span style="display: inline-block; width: 20px; height: 20px; background-color: ${comp.color}; border-radius: 4px;"></span></td>
            <td>${comp.default_duration_min}m</td>
            <td>${comp.is_paid ? 'Yes' : 'No'}</td>
            <td><button class="btn btn-sm btn-danger delete-component" data-component-id="${comp.id}">Delete</button></td>
        </tr>`;
    });
    html += '</tbody></table>';
    ELS.componentManagerGrid.innerHTML = html;
  }

  /**
   * Renders the "Shift Definitions" grid (New V11).
   */
  function renderShiftDefinitions() {
    const definitions = STATE.shiftDefinitions.sort((a,b) => a.name.localeCompare(b.name));

    let html = '<table><thead><tr><th>Code</th><th>Name</th><th>Total Duration</th><th>Paid Duration</th><th>Actions</th></tr></thead><tbody>';

    definitions.forEach(def => {
        // Calculate durations based on the structure
        let totalDuration = 0;
        let paidDuration = 0;

        if (def.structure && Array.isArray(def.structure)) {
            def.structure.forEach(seg => {
                const duration = seg.end_min - seg.start_min;
                totalDuration += duration;
                const component = getComponentById(seg.component_id);
                if (component && component.is_paid) {
                    paidDuration += duration;
                }
            });
        }

        html += `
        <tr data-definition-id="${def.id}">
            <td><strong>${def.code}</strong></td>
            <td>${def.name}</td>
            <td>${formatDuration(totalDuration)}</td>
            <td>${formatDuration(paidDuration)}</td>
            <td>
                <button class="btn btn-sm btn-primary edit-structure" data-definition-id="${def.id}">Edit Structure</button>
                <button class="btn btn-sm btn-danger delete-definition" data-definition-id="${def.id}">Delete</button>
            </td>
        </tr>`;
    });
    html += '</tbody></table>';
    ELS.shiftDefinitionsGrid.innerHTML = html;
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
   * Renders the 6-week grid. REFACTORED V11: Uses dropdowns of Shift Definitions.
   */
  function renderRotationGrid() {
    const pattern = getPatternByName(STATE.currentRotation);
    const patternData = pattern ? (pattern.pattern || {}) : {};
    const weeks = [1, 2, 3, 4, 5, 6];
    const days = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
    
    // Build Shift Definition options
    const definitionOpts = STATE.shiftDefinitions
      .sort((a,b) => (a.code || '').localeCompare(b.code || ''))
      .map(d => `<option value="${d.code}">${d.code} (${d.name})</option>`)
      .join('');
      
    let html = '<table><thead><tr><th>WEEK</th>';
    days.forEach(d => html += `<th>${d}</th>`);
    html += '</tr></thead><tbody>';

    weeks.forEach(w => {
      html += `<tr><td>Week ${w}</td>`;
      days.forEach((d, i) => {
        const dow = i + 1; 
        
        // V11: The grid now contains dropdowns
        html += `
          <td>
            <select class="form-select rotation-grid-select" data-week="${w}" data-dow="${dow}" ${!pattern ? 'disabled' : ''}>
              <option value="">-- RDO --</option>
              ${definitionOpts}
            </select>
          </td>`;
      });
      html += '</tr>';
    });
    html += '</tbody></table>';
    ELS.rotationGrid.innerHTML = html;
    
    // Now that HTML is in DOM, set the selected values
    if (pattern) {
      weeks.forEach(w => {
        days.forEach((d, i) => {
          const dow = i + 1;
          const weekData = patternData[`Week ${w}`] || {};
          // V11: The value stored is the shift definition CODE
          const code = weekData[dow] || ''; 
          const sel = ELS.rotationGrid.querySelector(`select[data-week="${w}"][data-dow="${dow}"]`);
          if (sel) {
            sel.value = code;
          }
        });
      });
    }
  }

  /**
   * Renders the main horizontal planner ("Team Schedule"). UPGRADED V11 Visuals.
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
    // Render ticks every hour
    for (let h = startHour; h < endHour; h++) {
      const pct = (h - startHour) / totalHours * 100;
      const label = h.toString().padStart(2, '0') + ':00';
      html += `<div class="time-tick" style="left: ${pct}%;">${label}</div>`;
    }
    headerElement.innerHTML = html;
  }
  
  /**
   * Renders the HTML for segments. UPGRADED V11 Visuals to match screenshot.
   */
  function renderSegmentsForAdvisor(advisorId) {
    const segments = calculateSegmentsForAdvisor(advisorId);
    if (!segments || segments.length === 0) {
      return ''; // RDO (empty track looks cleaner than text)
    }
    
    return segments.map(seg => {
      const component = getComponentById(seg.component_id);
      if (!component) return '';

      // Calculate position and width
      const startPct = ((seg.start_min - TIMELINE_START_MIN) / TIMELINE_DURATION_MIN) * 100;
      const widthPct = ((seg.end_min - seg.start_min) / TIMELINE_DURATION_MIN) * 100;
      
      // V11 Visual Upgrade: Determine bar styling based on type to match screenshot
      let barClass = '';
      // Use specific colors/styles if the component type matches the screenshot aesthetic
      if (component.type === 'Break' || component.type === 'Lunch') {
        // Breaks/Lunch appear as grey gaps
        barClass = 'is-gap';
      } else if (component.type === 'Activity') {
        // Work activities use the specific olive green color
        barClass = 'is-activity';
      }
      
      // For other types (Absence, Shrinkage), use their defined color from the database
      const style = (barClass === '') ? `background-color: ${component.color}; color: ${getContrastingTextColor(component.color)};` : '';

      return `
        <div class="timeline-bar ${barClass}" style="left: ${startPct}%; width: ${widthPct}%; ${style}" title="${component.name} (${formatMinutesToTime(seg.start_min)} - ${formatMinutesToTime(seg.end_min)})">
        </div>
      `;
    }).join('');
  }

  // --- 4. CORE LOGIC (Calculations) ---

  /**
   * Calculates segments for an advisor. REFACTORED V11: Uses Shift Definitions.
   */
  function calculateSegmentsForAdvisor(advisorId) {
    const assignment = getAssignmentForAdvisor(advisorId);
    if (!assignment || !assignment.rotation_name || !assignment.start_date || !STATE.weekStart) return [];

    const effectiveWeek = getEffectiveWeek(assignment.start_date, STATE.weekStart, assignment);
    if (effectiveWeek === null) return [];
    
    const dayOfWeek = ELS.plannerDay.value;
    const dayIndex = (['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].indexOf(dayOfWeek) + 1).toString();

    const pattern = getPatternByName(assignment.rotation_name);
    if (!pattern || !pattern.pattern) return [];
    
    // 1. Get the Shift Definition CODE from the rotation pattern
    const weekPattern = pattern.pattern[`Week ${effectiveWeek}`] || {};
    const shiftCode = weekPattern[dayIndex];

    if (!shiftCode) return []; // RDO

    // 2. Find the Shift Definition associated with the code
    const definition = getShiftDefinitionByCode(shiftCode);
    if (!definition || !definition.structure) return [];

    // 3. Return the segments defined in the structure
    return definition.structure;
  }
  
  // getEffectiveWeek (Robust implementation handling d/m/Y format)
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
      if (diffTime < 0) return null;

      const diffWeeks = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 7));
      
      const pattern = getPatternByName(assignment.rotation_name);
      let numWeeksInRotation = 6; 
      if (pattern && pattern.pattern && Object.keys(pattern.pattern).length > 0) {
          const keys = Object.keys(pattern.pattern);
          const maxWeek = Math.max(...keys.map(k => parseInt(k.replace('Week ', ''), 10) || 0));
          if (maxWeek > 0) {
              numWeeksInRotation = maxWeek;
          }
      }
            
      const effectiveWeek = (diffWeeks % numWeeksInRotation) + 1;
      return effectiveWeek;
    } catch (e) {
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
    ELS.btnDeleteRotation.addEventListener('click', handleDeleteRotation);
    // V11: Event listener for the dropdowns inside the grid (handles auto-save)
    ELS.rotationGrid.addEventListener('change', handleRotationGridChange);

    // Shift Definitions (New V11)
    ELS.btnNewShiftDefinition.addEventListener('click', handleNewShiftDefinition);
    ELS.shiftDefinitionsGrid.addEventListener('click', handleShiftDefinitionsClick);

    // Assignment Grid
    ELS.assignmentGrid.addEventListener('change', (e) => {
        if (e.target.classList.contains('assign-rotation')) {
            handleAssignmentChange(e.target.dataset.advisorId, 'rotation_name', e.target.value);
        }
    });

    // Component Manager
    ELS.btnNewComponent.addEventListener('click', handleNewComponent);
    ELS.componentManagerGrid.addEventListener('click', handleComponentManagerClick);

    // Schedules Tree
    ELS.schedulesTree.addEventListener('change', (e) => {
        if (e.target.classList.contains('select-advisor')) {
            const id = e.target.dataset.advisorId;
            e.target.checked ? STATE.selectedAdvisors.add(id) : STATE.selectedAdvisors.delete(id);
            renderPlanner();
        }
    });
    
    // Planner
    ELS.plannerDay.addEventListener('change', () => renderPlanner());

    // Editor Modal (Repurposed V11)
    ELS.modalClose.addEventListener('click', closeDayEditorModal);
    ELS.modalSaveDay.addEventListener('click', handleSaveShiftStructure); // Renamed handler
    ELS.modalClearDay.addEventListener('click', handleClearShiftStructure); // Renamed handler
    
    // Modal Drag and Drop Events
    ELS.modalTrack.addEventListener('dragover', handleDragOver);
    ELS.modalTrack.addEventListener('dragleave', handleDragLeave);
    ELS.modalTrack.addEventListener('drop', handleDrop);
    ELS.modalTrack.addEventListener('click', handleTrackClick); 
  }

  // --- 6. SHIFT DEFINITION EDITOR (Modal Logic - V11) ---

  /**
   * Handles clicks on the Shift Definitions grid (Edit Structure, Delete).
   */
  function handleShiftDefinitionsClick(e) {
    if (e.target.classList.contains('edit-structure')) {
        const definitionId = e.target.dataset.definitionId;
        openShiftEditorModal(definitionId);
    } else if (e.target.classList.contains('delete-definition')) {
        const definitionId = e.target.dataset.definitionId;
        handleDeleteShiftDefinition(definitionId);
    }
  }

  /**
   * Opens the modal to edit the structure of a Shift Definition.
   */
  function openShiftEditorModal(shiftDefinitionId) {
    const definition = getShiftDefinitionById(shiftDefinitionId);
    if (!definition) return;

    // 1. Load existing structure
    const existingSegments = (definition.structure && Array.isArray(definition.structure))
        ? JSON.parse(JSON.stringify(definition.structure))
        : [];

    // 2. Set EDITOR_STATE
    EDITOR_STATE.isOpen = true;
    EDITOR_STATE.shiftDefinitionId = shiftDefinitionId;
    EDITOR_STATE.segments = existingSegments;

    // 3. Render the modal UI
    ELS.modalTitle.textContent = `Edit Structure: ${definition.name} (${definition.code})`;
    
    renderTimeHeader(ELS.modalTimeHeader);
    renderComponentBricks();
    renderDaySegments(); // This function renders based on EDITOR_STATE.segments

    // 4. Show the modal
    ELS.dayEditorModal.style.display = 'flex';
  }

  function closeDayEditorModal() {
    EDITOR_STATE.isOpen = false;
    ELS.dayEditorModal.style.display = 'none';
  }

  // renderComponentBricks (Renders the draggable items in the modal sidebar)
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

  // renderDaySegments (Renders the segments onto the modal track)
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

  // --- 7. DRAG AND DROP LOGIC (V11 - Used for Shift Definitions) ---
  
  function handleDragStart(e) {
    const componentId = e.target.dataset.componentId;
    const component = getComponentById(componentId);
    if (!component) return;

    EDITOR_STATE.dragData = {
        componentId: component.id,
        duration: component.default_duration_min,
        source: 'sidebar'
    };
    
    e.dataTransfer.setData('text/plain', componentId);
    e.dataTransfer.effectAllowed = 'copy';
  }

  function handleDragOver(e) {
    e.preventDefault();
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
    
    // 1. Calculate drop position
    const trackRect = ELS.modalTrack.getBoundingClientRect();
    const dropX = e.clientX - trackRect.left;
    const trackWidth = trackRect.width;
    
    const dropPct = dropX / trackWidth;
    let startMin = TIMELINE_START_MIN + (dropPct * TIMELINE_DURATION_MIN);
    
    // 2. Adjust positioning and Snap
    startMin = startMin - (dragData.duration / 2);
    startMin = Math.round(startMin / SNAP_INTERVAL) * SNAP_INTERVAL;
    
    // 3. Constrain to boundaries
    startMin = Math.max(TIMELINE_START_MIN, startMin); 
    let endMin = startMin + dragData.duration;
    if (endMin > TIMELINE_END_MIN) {
        endMin = TIMELINE_END_MIN;
        startMin = endMin - dragData.duration;
         if (startMin < TIMELINE_START_MIN) startMin = TIMELINE_START_MIN;
    }

    // 4. Collision detection
    const overlaps = EDITOR_STATE.segments.some(seg => {
        return startMin < seg.end_min && endMin > seg.start_min;
    });

    if (overlaps) {
        showToast("Error: Segments cannot overlap.", "danger");
        return;
    }

    // 5. Create the new segment
    const newSegment = {
        component_id: dragData.componentId,
        start_min: startMin,
        end_min: endMin
    };

    // 6. Add to state and re-render
    EDITOR_STATE.segments.push(newSegment);
    renderDaySegments();

    EDITOR_STATE.dragData = null;
  }

  function handleTrackClick(e) {
    if (e.target.classList.contains('segment-delete')) {
        const index = parseInt(e.target.dataset.index, 10);
        if (!isNaN(index)) {
            EDITOR_STATE.segments.sort((a, b) => a.start_min - b.start_min);
            EDITOR_STATE.segments.splice(index, 1);
            renderDaySegments();
        }
    }
  }

  /**
   * Saves the structure from the modal back to the Shift Definition and persists to DB.
   */
  async function handleSaveShiftStructure() {
    const { shiftDefinitionId, segments } = EDITOR_STATE;
    const definition = getShiftDefinitionById(shiftDefinitionId);

    if (!definition) return;

    // Ensure segments are sorted
    segments.sort((a, b) => a.start_min - b.start_min);
    
    // Update local state
    definition.structure = segments;

    // Persist to Supabase
    try {
        const { error } = await supabase
            .from('shift_definitions')
            .update({ structure: segments })
            .eq('id', shiftDefinitionId);

        if (error) throw error;

        saveHistory("Update Shift Structure");
        renderShiftDefinitions(); // Re-render the definitions table
        renderRotationGrid(); // Re-render rotation grid (though options haven't changed)
        renderPlanner(); // Re-render planner as the shift structure might have changed
        closeDayEditorModal();
        showToast("Shift structure saved successfully.", "success");

    } catch (error) {
        showToast(`Error saving structure: ${error.message}`, "danger");
    }
  }

  function handleClearShiftStructure() {
    if (confirm("Are you sure you want to clear the entire structure for this shift definition?")) {
        EDITOR_STATE.segments = [];
        renderDaySegments();
    }
  }

  // --- 8. CRUD HANDLERS ---

  // Rotation Handlers (V11: Auto-save implemented)

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
        showToast(`Rotation '${name}' created.`, "success");
    } catch (error) {
        showToast(`Error creating rotation: ${error.message}`, "danger");
    }
  }

  /**
   * Handles changes to the rotation grid dropdowns AND saves immediately (V11).
   */
  async function handleRotationGridChange(e) {
    if (!e.target.classList.contains('rotation-grid-select')) return;
    
    const { week, dow } = e.target.dataset;
    const shiftCode = e.target.value; // The selected Shift Definition Code
    const rotationName = STATE.currentRotation;
    
    const pattern = getPatternByName(rotationName);
    if (!pattern) return;
    
    // 1. Update the local state object
    if (!pattern.pattern) pattern.pattern = {};
    const weekKey = `Week ${week}`;
    if (!pattern.pattern[weekKey]) pattern.pattern[weekKey] = {};
    
    if (shiftCode) {
      pattern.pattern[weekKey][dow] = shiftCode;
    } else {
      delete pattern.pattern[weekKey][dow]; // RDO
    }

    // 2. V11: Auto-save the entire pattern object immediately
    try {
        const { error } = await supabase
          .from('rotation_patterns')
          .update({ pattern: pattern.pattern })
          .eq('name', rotationName);
          
        if (error) throw error;
        
        // showToast(`Rotation updated.`, "success");
        saveHistory(`Update rotation cell`);
        renderPlanner(); // Re-render planner to reflect the change
        
      } catch (error) {
        showToast(`Error saving rotation change: ${error.message}`, "danger");
        // Optionally revert the change in STATE if save fails
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
        showToast(`Rotation deleted.`, "success");
    } catch (error) {
        showToast(`Error deleting rotation: ${error.message}. It might be assigned to advisors.`, "danger");
    }
  }

  // Shift Definition Handlers (New V11)

  async function handleNewShiftDefinition() {
    const name = prompt("Enter the full name for the new shift (e.g., 'Early 7am-4pm Flex'):");
    if (!name) return;
    const code = prompt("Enter a unique shortcode (e.g., 'E74F'):");
    if (!code) return;

    if (getShiftDefinitionByCode(code) || STATE.shiftDefinitions.find(d => d.name === name)) {
        showToast("Error: Name or Code already exists.", "danger");
        return;
    }

    const newDefinition = { name, code, structure: [] };

    try {
        const { data, error } = await supabase
            .from('shift_definitions')
            .insert(newDefinition)
            .select();
        
        if (error) throw error;
        
        STATE.shiftDefinitions.push(data[0]);
        saveHistory("Create Shift Definition");
        renderShiftDefinitions();
        renderRotationGrid(); // Update the dropdown options in the rotation editor
        showToast(`Shift '${name}' created. Now click 'Edit Structure'.`, "success");

    } catch (error) {
        showToast(`Error creating shift definition: ${error.message}`, "danger");
    }
  }

  async function handleDeleteShiftDefinition(definitionId) {
    const definition = getShiftDefinitionById(definitionId);
    if (!definition) return;

    if (!confirm(`Are you sure you want to delete '${definition.name}' (${definition.code})? This may affect existing rotations.`)) return;

    try {
        const { error } = await supabase
            .from('shift_definitions')
            .delete()
            .eq('id', definitionId);
        
        if (error) throw error;

        STATE.shiftDefinitions = STATE.shiftDefinitions.filter(d => d.id !== definitionId);
        saveHistory("Delete Shift Definition");
        renderShiftDefinitions();
        renderRotationGrid(); // Update the dropdown options
        showToast(`Shift deleted.`, "success");

    } catch (error) {
        showToast(`Error deleting shift definition: ${error.message}`, "danger");
    }
  }


  // Assignment Handlers
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

  // Component Handlers
  async function handleNewComponent() {
    // (Uses prompts as requested)
    const name = prompt("Enter component name:");
    if (!name) return;
    const type = prompt("Enter type (Activity, Break, Lunch, Shrinkage, Absence):", "Activity");
    const color = prompt("Enter hex color code:", "#3498db");
    const duration = parseInt(prompt("Enter default duration in minutes:", "60"), 10);
    const isPaid = confirm("Is this a paid activity?");

    if (!name || !type || !color || isNaN(duration)) return;

    const newComponent = { name, type, color, default_duration_min: duration, is_paid: isPaid };

    try {
        const { data, error } = await supabase.from('schedule_components').insert(newComponent).select();
        if (error) throw error;
        STATE.scheduleComponents.push(data[0]);
        renderComponentManager();
        showToast(`Component created.`, "success");
    } catch (error) {
        showToast(`Error creating component: ${error.message}`, "danger");
    }
  }

  function handleComponentManagerClick(e) {
    if (e.target.classList.contains('delete-component')) {
        handleDeleteComponent(e.target.dataset.componentId);
    }
  }

  async function handleDeleteComponent(componentId) {
    const component = getComponentById(componentId);
    if (!component) return;
    if (!confirm(`Are you sure you want to delete '${component.name}'?`)) return;

    try {
        const { error } = await supabase.from('schedule_components').delete().eq('id', componentId);
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

  function getContrastingTextColor(hexColor) {
    if (!hexColor) return '#000000';
    try {
        const r = parseInt(hexColor.substr(1, 2), 16);
        const g = parseInt(hexColor.substr(3, 2), 16);
        const b = parseInt(hexColor.substr(5, 2), 16);
        const brightness = ((r * 299) + (g * 587) + (b * 114)) / 1000;
        return (brightness > 128) ? '#000000' : '#FFFFFF';
    } catch (e) {
        return '#FFFFFF';
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
    console.log("Booting application (v11.0)...");
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
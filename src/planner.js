/**
 * WFM Enterprise Rota System - Main Application Logic (v12.0 - Sequential Builder)
 *
 * Implements a sequential, duration-based input system for defining shift structures efficiently.
 * Eliminates drag-and-drop. Includes aesthetic upgrades and full CRUD operations.
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
    shiftDefinitions: [], 
    rotationPatterns: [], 
    rotationAssignments: [],
    selectedAdvisors: new Set(),
    weekStart: null, 
    currentRotation: null,
    isBooted: false,
    history: [],
    historyIndex: -1
  };

  // State for the Sequential Builder Modal (V12.0)
  const EDITOR_STATE = {
    isOpen: false,
    shiftDefinitionId: null,
    startTimeMin: 480, // The absolute start time of the shift (default 8:00 AM)
    // Segments store only the definition (ID and duration); times are calculated dynamically.
    segments: [], // { component_id, duration_min }
  };

  // Constants for the timeline view (06:00 - 22:00)
  const TIMELINE_START_MIN = 6 * 60; 
  const TIMELINE_END_MIN = 22 * 60; 
  const TIMELINE_DURATION_MIN = TIMELINE_END_MIN - TIMELINE_START_MIN; 

  // DOM element cache
  const ELS = {};

  // --- 1. DATA FETCHING (Supabase) ---

  async function loadCoreData() {
    if (!window.supabase) return;

    try {
      const [advisorsRes, componentsRes, definitionsRes, patternsRes, assignmentsRes] = await Promise.all([
        supabase.from('advisors').select('*'),
        supabase.from('schedule_components').select('*'),
        supabase.from('shift_definitions').select('*'),
        supabase.from('rotation_patterns').select('*'), 
        supabase.from('rotation_assignments').select('*')
      ]);
      
       if (advisorsRes.error) throw new Error(`Advisors: ${advisorsRes.error.message}`);
       if (componentsRes.error) throw new Error(`Components: ${componentsRes.error.message}`);
       if (definitionsRes.error) throw new Error(`Definitions: ${definitionsRes.error.message}`);
       if (patternsRes.error) throw new Error(`Patterns: ${patternsRes.error.message}`);
       if (assignmentsRes.error) throw new Error(`Assignments: ${assignmentsRes.error.message}`);

      // Update state
      STATE.advisors = advisorsRes.data || [];
      STATE.scheduleComponents = componentsRes.data || [];
      STATE.shiftDefinitions = definitionsRes.data || [];
      STATE.rotationPatterns = patternsRes.data || [];
      STATE.rotationAssignments = assignmentsRes.data || [];
      
      console.log("Core data loaded (V12.0).");

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
    // Top Bar
    ELS.weekStart = document.getElementById('weekStart');
    ELS.prevWeek = document.getElementById('prevWeek');
    ELS.nextWeek = document.getElementById('nextWeek');
    ELS.btnUndo = document.getElementById('btnUndo');
    ELS.btnRedo = document.getElementById('btnRedo');
    // Navigation and Tabs
    ELS.tabNav = document.querySelector('.tab-nav');
    ELS.tabs = document.querySelectorAll('.tab-content');
    // Rotation Editor
    ELS.rotationFamily = document.getElementById('rotationFamily');
    ELS.btnNewRotation = document.getElementById('btnNewRotation');
    ELS.btnDeleteRotation = document.getElementById('btnDeleteRotation');
    ELS.rotationGrid = document.getElementById('rotationGrid');
    // Shift Definitions
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
    // Sidebar/Selection
    ELS.schedulesTree = document.getElementById('schedulesTree');
    ELS.treeSearch = document.getElementById('treeSearch');
    ELS.btnClearSelection = document.getElementById('btnClearSelection');
    ELS.notificationContainer = document.getElementById('notification-container');
    
    // Sequential Builder Modal (V12.0)
    ELS.shiftBuilderModal = document.getElementById('shiftBuilderModal');
    ELS.modalTitle = document.getElementById('modalTitle');
    ELS.modalClose = document.getElementById('modalClose');
    ELS.modalStartTime = document.getElementById('modalStartTime');
    ELS.modalAddActivity = document.getElementById('modalAddActivity');
    ELS.modalSequenceBody = document.getElementById('modalSequenceBody');
    ELS.modalTotalTime = document.getElementById('modalTotalTime');
    ELS.modalPaidTime = document.getElementById('modalPaidTime');
    ELS.modalSaveStructure = document.getElementById('modalSaveStructure');
  }

  function renderAll() {
    if (!STATE.isBooted) return;
    renderSchedulesTree();
    renderShiftDefinitions();
    renderRotationEditor();
    renderAssignmentGrid();
    renderComponentManager(); 
    renderPlanner();
  }

  // V12: Updated for the new layout (Schedule View tab)
  function renderSchedulesTree() {
    const filter = ELS.treeSearch.value.toLowerCase();
    let html = '';
    STATE.advisors.sort((a,b) => a.name.localeCompare(b.name)).forEach(adv => {
        if (!filter || adv.name.toLowerCase().includes(filter)) {
            const isChecked = STATE.selectedAdvisors.has(adv.id);
            html += `<div class="tree-node-advisor"><label>
                <input type="checkbox" class="select-advisor" data-advisor-id="${adv.id}" ${isChecked ? 'checked' : ''} />
                ${adv.name}
            </label></div>`;
        }
    });
    ELS.schedulesTree.innerHTML = html || '<div>No advisors found.</div>';

     // Auto-select first advisor if none selected
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
   * Renders the "Shift Definitions" grid.
   */
  function renderShiftDefinitions() {
    const definitions = STATE.shiftDefinitions.sort((a,b) => a.name.localeCompare(b.name));

    let html = '<table><thead><tr><th>Code</th><th>Name</th><th>Total Duration</th><th>Paid Duration</th><th>Actions</th></tr></thead><tbody>';

    definitions.forEach(def => {
        // Calculate durations based on the stored structure
        let totalDuration = 0;
        let paidDuration = 0;

        if (def.structure && Array.isArray(def.structure)) {
            def.structure.forEach(seg => {
                // The stored structure uses { component_id, start_min, end_min }
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
   * Renders the 6-week grid (Uses dropdowns of Shift Definitions).
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
    
    // Set the selected values
    if (pattern) {
      weeks.forEach(w => {
        days.forEach((d, i) => {
          const dow = i + 1;
          const weekData = patternData[`Week ${w}`] || {};
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
   * Renders the main horizontal planner (Visualization).
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
  
  function renderTimeHeader(headerElement) {
    const startHour = Math.floor(TIMELINE_START_MIN / 60);
    const endHour = Math.floor(TIMELINE_END_MIN / 60);
    const totalHours = (TIMELINE_END_MIN - TIMELINE_START_MIN) / 60;
    
    let html = '';
    for (let h = startHour; h < endHour; h++) {
      const pct = (h - startHour) / totalHours * 100;
      const label = h.toString().padStart(2, '0') + ':00';
      html += `<div class="time-tick" style="left: ${pct}%;">${label}</div>`;
    }
    headerElement.innerHTML = html;
  }
  
  function renderSegmentsForAdvisor(advisorId) {
    const segments = calculateSegmentsForAdvisor(advisorId);
    if (!segments || segments.length === 0) {
      return ''; // RDO
    }
    
    return segments.map(seg => {
      const component = getComponentById(seg.component_id);
      if (!component) return '';

      const startPct = ((seg.start_min - TIMELINE_START_MIN) / TIMELINE_DURATION_MIN) * 100;
      const widthPct = ((seg.end_min - seg.start_min) / TIMELINE_DURATION_MIN) * 100;
      
      let barClass = '';
      if (component.type === 'Break' || component.type === 'Lunch') {
        barClass = 'is-gap';
      } else if (component.type === 'Activity') {
        barClass = 'is-activity';
      }
      
      const style = (barClass === '') ? `background-color: ${component.color}; color: ${getContrastingTextColor(component.color)};` : '';

      return `
        <div class="timeline-bar ${barClass}" style="left: ${startPct}%; width: ${widthPct}%; ${style}" title="${component.name} (${formatMinutesToTime(seg.start_min)} - ${formatMinutesToTime(seg.end_min)})">
        </div>
      `;
    }).join('');
  }

  // --- 4. CORE LOGIC (Calculations) ---

  function calculateSegmentsForAdvisor(advisorId) {
    const assignment = getAssignmentForAdvisor(advisorId);
    if (!assignment || !assignment.rotation_name || !assignment.start_date || !STATE.weekStart) return [];

    const effectiveWeek = getEffectiveWeek(assignment.start_date, STATE.weekStart, assignment);
    if (effectiveWeek === null) return [];
    
    const dayOfWeek = ELS.plannerDay.value;
    const dayIndex = (['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].indexOf(dayOfWeek) + 1).toString();

    const pattern = getPatternByName(assignment.rotation_name);
    if (!pattern || !pattern.pattern) return [];
    
    const weekPattern = pattern.pattern[`Week ${effectiveWeek}`] || {};
    const shiftCode = weekPattern[dayIndex];

    if (!shiftCode) return []; // RDO

    const definition = getShiftDefinitionByCode(shiftCode);
    if (!definition || !definition.structure) return [];

    // Return the segments defined in the structure { component_id, start_min, end_min }
    return definition.structure;
  }
  
   function getEffectiveWeek(startDateStr, weekStartISO, assignment) {
    try {
      if (!startDateStr || !weekStartISO || !assignment) return null;
      
      // Parse "dd/mm/yyyy"
      const [d, m, y] = startDateStr.split('/').map(Number);
      if (isNaN(d) || isNaN(m) || isNaN(y)) return null; 
      
      // Parse "YYYY-MM-DD"
      const [y2, m2, d2] = weekStartISO.split('-').map(Number);
      if (isNaN(y2) || isNaN(m2) || isNaN(d2)) return null;

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
    // Top Bar & Navigation
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

    ELS.tabNav.addEventListener('click', (e) => {
      const target = e.target.closest('.tab-link');
      if (target) {
        const tabId = target.dataset.tab;
        ELS.tabNav.querySelectorAll('.tab-link').forEach(t => t.classList.remove('active'));
        ELS.tabs.forEach(t => t.classList.remove('active'));
        target.classList.add('active');
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
    ELS.rotationGrid.addEventListener('change', handleRotationGridChange);

    // Shift Definitions
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

    // Schedules Tree & Planner
    ELS.treeSearch.addEventListener('input', renderSchedulesTree);
    ELS.btnClearSelection.addEventListener('click', () => {
        STATE.selectedAdvisors.clear();
        renderSchedulesTree();
        renderPlanner();
    });
    ELS.schedulesTree.addEventListener('change', (e) => {
        if (e.target.classList.contains('select-advisor')) {
            const id = e.target.dataset.advisorId;
            e.target.checked ? STATE.selectedAdvisors.add(id) : STATE.selectedAdvisors.delete(id);
            renderPlanner();
        }
    });
    ELS.plannerDay.addEventListener('change', () => renderPlanner());

    // Sequential Builder Modal (V12.0)
    ELS.modalClose.addEventListener('click', closeShiftBuilderModal);
    ELS.modalSaveStructure.addEventListener('click', handleSaveShiftStructure);
    ELS.modalAddActivity.addEventListener('click', handleAddActivityToSequence);
    
    // Initialize the time picker for the modal start time
    flatpickr(ELS.modalStartTime, {
        enableTime: true,
        noCalendar: true,
        dateFormat: "H:i",
        time_24hr: true,
        minuteIncrement: 15,
        onChange: (selectedDates, dateStr) => {
            const [h, m] = dateStr.split(':').map(Number);
            EDITOR_STATE.startTimeMin = h * 60 + m;
            // Recalculate the entire sequence when the start time changes
            renderSequentialEditor();
        }
    });
    
    // Event delegation for changes and clicks within the dynamic sequence grid
    ELS.modalSequenceBody.addEventListener('change', handleSequenceChange);
    ELS.modalSequenceBody.addEventListener('click', handleSequenceClick);
  }
  

  // --- 6. SEQUENTIAL BUILDER (Modal Logic - V12.0) ---

  function handleShiftDefinitionsClick(e) {
    if (e.target.classList.contains('edit-structure')) {
        const definitionId = e.target.dataset.definitionId;
        openShiftBuilderModal(definitionId);
    } else if (e.target.classList.contains('delete-definition')) {
        const definitionId = e.target.dataset.definitionId;
        handleDeleteShiftDefinition(definitionId);
    }
  }

  /**
   * Opens the Sequential Builder modal and converts data formats.
   */
  function openShiftBuilderModal(shiftDefinitionId) {
    const definition = getShiftDefinitionById(shiftDefinitionId);
    if (!definition) return;

    // 1. V12: Convert stored structure (absolute times) to sequential format (duration)
    const sequentialSegments = [];
    let startTimeMin = 480; // Default 8:00 AM if empty

    if (definition.structure && Array.isArray(definition.structure) && definition.structure.length > 0) {
        // Ensure structure is sorted
        definition.structure.sort((a, b) => a.start_min - b.start_min);
        startTimeMin = definition.structure[0].start_min;
        
        definition.structure.forEach(seg => {
            sequentialSegments.push({
                component_id: seg.component_id,
                duration_min: seg.end_min - seg.start_min
            });
        });
    }

    // 2. Set EDITOR_STATE
    EDITOR_STATE.isOpen = true;
    EDITOR_STATE.shiftDefinitionId = shiftDefinitionId;
    EDITOR_STATE.startTimeMin = startTimeMin;
    EDITOR_STATE.segments = sequentialSegments;

    // 3. Render the modal UI
    ELS.modalTitle.textContent = `Sequential Builder: ${definition.name} (${definition.code})`;
    
    // Set the start time input using Flatpickr instance
    if (ELS.modalStartTime._flatpickr) {
        ELS.modalStartTime._flatpickr.setDate(formatMinutesToTime(startTimeMin), false);
    }
    
    renderSequentialEditor();

    // 4. Show the modal
    ELS.shiftBuilderModal.style.display = 'flex';
  }

  function closeShiftBuilderModal() {
    EDITOR_STATE.isOpen = false;
    ELS.shiftBuilderModal.style.display = 'none';
  }

  /**
   * Renders the Sequential Builder grid. CRITICAL: Calculates times dynamically.
   */
  function renderSequentialEditor() {
    let html = '';
    let currentTime = EDITOR_STATE.startTimeMin;
    let totalDuration = 0;
    let paidDuration = 0;

    // Generate component options HTML (optimization)
    const componentOptions = STATE.scheduleComponents
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(c => `<option value="${c.id}">${c.name}</option>`)
        .join('');

    EDITOR_STATE.segments.forEach((seg, index) => {
        const component = getComponentById(seg.component_id);
        
        // Calculate times dynamically (The Ripple Effect)
        const startTime = currentTime;
        const endTime = currentTime + seg.duration_min;

        html += `
            <tr data-index="${index}">
                <td>${index + 1}</td>
                <td>
                    <select class="form-select sequence-component" data-index="${index}">
                        <option value="">-- Select Activity --</option>
                        ${componentOptions}
                    </select>
                </td>
                <td>
                    <input type="number" class="form-input duration-input sequence-duration" data-index="${index}" value="${seg.duration_min}" min="5" step="5">
                </td>
                <td class="time-display">${formatMinutesToTime(startTime)}</td>
                <td class="time-display">${formatMinutesToTime(endTime)}</td>
                <td>
                    <button class="btn btn-sm btn-danger delete-sequence-item" data-index="${index}">Remove</button>
                </td>
            </tr>
        `;

        currentTime = endTime;
        totalDuration += seg.duration_min;
        if (component && component.is_paid) {
            paidDuration += seg.duration_min;
        }
    });

    ELS.modalSequenceBody.innerHTML = html;

    // Set the selected values for the dropdowns (required after innerHTML)
    EDITOR_STATE.segments.forEach((seg, index) => {
        const selectEl = ELS.modalSequenceBody.querySelector(`.sequence-component[data-index="${index}"]`);
        if (selectEl) {
            selectEl.value = seg.component_id || '';
        }
    });

    ELS.modalTotalTime.textContent = formatDuration(totalDuration);
    ELS.modalPaidTime.textContent = formatDuration(paidDuration);
  }

  /**
   * Adds a new empty activity row to the sequence.
   */
  function handleAddActivityToSequence() {
    // Add a default segment (e.g., 60 mins, no component selected yet)
    EDITOR_STATE.segments.push({
        component_id: null,
        duration_min: 60
    });
    // The render function handles the recalculation automatically
    renderSequentialEditor();
  }

  /**
   * Handles changes (Component selection or Duration input) in the sequence grid.
   */
  function handleSequenceChange(e) {
    const target = e.target;
    const index = parseInt(target.dataset.index, 10);

    if (isNaN(index) || index >= EDITOR_STATE.segments.length) return;

    if (target.classList.contains('sequence-component')) {
        const componentId = target.value;
        EDITOR_STATE.segments[index].component_id = componentId || null;
        
        // Optimization: Auto-set the default duration when a component is selected
        const component = getComponentById(componentId);
        if (component) {
            EDITOR_STATE.segments[index].duration_min = component.default_duration_min;
        }

    } else if (target.classList.contains('sequence-duration')) {
        const duration = parseInt(target.value, 10);
        if (isNaN(duration) || duration < 5) {
            // Handle invalid input gracefully
            target.value = EDITOR_STATE.segments[index].duration_min; // Revert display
            return; 
        }
        EDITOR_STATE.segments[index].duration_min = duration;
    }

    // Recalculate times and re-render (The ripple effect happens here)
    renderSequentialEditor();
  }

  /**
   * Handles clicks (Remove button) in the sequence grid.
   */
  function handleSequenceClick(e) {
    if (e.target.classList.contains('delete-sequence-item')) {
        const index = parseInt(e.target.dataset.index, 10);
        if (!isNaN(index)) {
            EDITOR_STATE.segments.splice(index, 1);
            // Recalculate and re-render (The shift backward happens here)
            renderSequentialEditor();
        }
    }
  }

  /**
   * Saves the structure from the modal. V12: Converts sequential data back to absolute times.
   */
  async function handleSaveShiftStructure() {
    const { shiftDefinitionId, segments, startTimeMin } = EDITOR_STATE;
    const definition = getShiftDefinitionById(shiftDefinitionId);

    if (!definition) return;

    // V12: Validate and Convert sequential format back to absolute time format
    const absoluteTimeSegments = [];
    let currentTime = startTimeMin;

    for (const seg of segments) {
        if (!seg.component_id) {
            showToast("Error: All activities must have a component selected.", "danger");
            return;
        }
        if (seg.duration_min < 5) {
             showToast("Error: Durations must be at least 5 minutes.", "danger");
            return;
        }

        const start = currentTime;
        const end = currentTime + seg.duration_min;

        absoluteTimeSegments.push({
            component_id: seg.component_id,
            start_min: start,
            end_min: end
        });

        currentTime = end;
    }

    // Update local state
    definition.structure = absoluteTimeSegments;

    // Persist to Supabase
    try {
        const { error } = await supabase
            .from('shift_definitions')
            .update({ structure: absoluteTimeSegments })
            .eq('id', shiftDefinitionId);

        if (error) throw error;

        saveHistory("Update Shift Structure (Sequential)");
        renderShiftDefinitions(); 
        renderPlanner(); 
        closeShiftBuilderModal();
        showToast("Shift structure saved successfully.", "success");

    } catch (error) {
        showToast(`Error saving structure: ${error.message}`, "danger");
    }
  }


  // --- 8. CRUD HANDLERS (Rotations, Definitions, Components & Assignments) ---

    // Rotation Handlers (Auto-save implemented)

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
   * Handles changes to the rotation grid dropdowns AND saves immediately.
   */
  async function handleRotationGridChange(e) {
    if (!e.target.classList.contains('rotation-grid-select')) return;
    
    const { week, dow } = e.target.dataset;
    const shiftCode = e.target.value; 
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

    // 2. Auto-save the entire pattern object immediately
    try {
        const { error } = await supabase
          .from('rotation_patterns')
          .update({ pattern: pattern.pattern })
          .eq('name', rotationName);
          
        if (error) throw error;
        
        saveHistory(`Update rotation cell`);
        renderPlanner(); // Re-render planner to reflect the change
        
      } catch (error) {
        showToast(`Error saving rotation change: ${error.message}`, "danger");
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
  
  // Shift Definition Handlers

  async function handleNewShiftDefinition() {
    const name = prompt("Enter the full name for the new shift (e.g., 'Early 7am-4pm Flex'):");
    if (!name) return;
    const code = prompt("Enter a unique shortcode (e.g., 'E74F'):");
    if (!code) return;

    if (getShiftDefinitionByCode(code) || STATE.shiftDefinitions.find(d => d.name === name)) {
        showToast("Error: Name or Code already exists.", "danger");
        return;
    }

    // Structure is empty initially
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
        renderRotationGrid(); // Update dropdown options
        showToast(`Shift '${name}' created. Now click 'Edit Structure'.`, "success");

    } catch (error) {
        showToast(`Error creating shift definition: ${error.message}`, "danger");
    }
  }

  async function handleDeleteShiftDefinition(definitionId) {
    const definition = getShiftDefinitionById(definitionId);
    if (!definition) return;

    if (!confirm(`Are you sure you want to delete '${definition.name}' (${definition.code})?`)) return;

    try {
        const { error } = await supabase
            .from('shift_definitions')
            .delete()
            .eq('id', definitionId);
        
        if (error) throw error;

        STATE.shiftDefinitions = STATE.shiftDefinitions.filter(d => d.id !== definitionId);
        saveHistory("Delete Shift Definition");
        renderShiftDefinitions();
        renderRotationGrid(); 
        showToast(`Shift deleted.`, "success");

    } catch (error) {
        showToast(`Error deleting shift definition: ${error.message}`, "danger");
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

  // Component Handlers (Using basic prompts as requested)
  async function handleNewComponent() {
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
    if (minutes === null || isNaN(minutes)) return "";
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
    console.log("Booting application (v12.0)...");
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
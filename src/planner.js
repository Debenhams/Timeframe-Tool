/**
 * Professional Team Rota System - Main Application Logic (v9 - DB Table Fix)
 *
 * This file contains all the core logic for the planner, including:
 * - Data fetching from Supabase (advisors, leaders, rotations, templates)
 * - State management (state, history for undo/redo)
 * - Rendering (Schedules tree, rotation editor, assignment grid, planner)
 * - Core calculation logic (effective week, segment slicing)
 * - Event handlers and UI interactions
 */

(function () {
  "use strict";

  // --- GLOBALS ---
  // Ensure a global app namespace
  if (!window.APP) {
    window.APP = {};
  }
  
  // App state
  const STATE = {
    sites: [],
    leaders: [],
    advisors: [],
    shiftTemplates: [], // All shift templates (e.g., "7A", "RDO")
    rotationPatterns: [], // All rotation families (e.g., "Flex 1")
    rotationAssignments: [], // Link between advisor and rotation
    selectedAdvisors: new Set(),
    selectedDay: 'Monday',
    weekStart: null, // ISO Date string
    currentRotation: null, // Name of rotation being edited
    isBooted: false,
    history: [], // For undo/redo
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
    // We assume supabase client is globally available (from HTML)
    if (!window.supabase) {
      showToast("Error: Supabase client not found", "danger");
      return;
    }

    try {
      const [
        sitesRes,
        leadersRes,
        advisorsRes,
        templatesRes,
        patternsRes,
        assignmentsRes
      ] = await Promise.all([
        supabase.from('sites').select('*'),
        supabase.from('leaders').select('*'),
        supabase.from('advisors').select('*'),
        supabase.from('shift_templates').select('*'),
        // FIX v9: Read from 'rotation_patterns' table
        supabase.from('rotation_patterns').select('*'), 
        supabase.from('rotation_assignments').select('*')
      ]);

      // Check for errors in any of the promises
      if (sitesRes.error) throw new Error(`Sites: ${sitesRes.error.message}`);
      if (leadersRes.error) throw new Error(`Leaders: ${leadersRes.error.message}`);
      if (advisorsRes.error) throw new Error(`Advisors: ${advisorsRes.error.message}`);
      if (templatesRes.error) throw new Error(`Templates: ${templatesRes.error.message}`);
      if (patternsRes.error) throw new Error(`Patterns: ${patternsRes.error.message}`);
      if (assignmentsRes.error) throw new Error(`Assignments: ${assignmentsRes.error.message}`);
      
      // All data fetched successfully, update state
      STATE.sites = sitesRes.data || [];
      STATE.leaders = leadersRes.data || [];
      STATE.advisors = advisorsRes.data || [];
      STATE.shiftTemplates = templatesRes.data || [];
      // FIX v9: Data is already in the correct format, no transform needed
      STATE.rotationPatterns = patternsRes.data || [];
      STATE.rotationAssignments = assignmentsRes.data || [];
      
      console.log("Core data loaded:", {
        sites: STATE.sites.length,
        leaders: STATE.leaders.length,
        advisors: STATE.advisors.length,
        templates: STATE.shiftTemplates.length,
        patterns: STATE.rotationPatterns.length,
        assignments: STATE.rotationAssignments.length,
      });

    } catch (error) {
      console.error("Boot Failed: Error loading core data", error);
      showToast(`Error loading data: ${error.message}`, "danger");
    }
  }

  // --- 2. STATE MANAGEMENT & HISTORY (Undo/Redo) ---

  /**
   * Saves a snapshot of the current mutable state for undo/redo.
   * @param {string} reason - A description of the change
   */
  function saveHistory(reason = "Unknown change") {
    // Clear any 'redo' history
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
    // Limit history to 20 steps
    if (STATE.history.length > 20) {
      STATE.history.shift();
    }
    STATE.historyIndex = STATE.history.length - 1;
    updateUndoRedoButtons();
  }

  /**
   * Restores state from the history buffer.
   * @param {'undo' | 'redo'} direction
   */
  function applyHistory(direction) {
    if (direction === 'undo' && STATE.historyIndex > 0) {
      STATE.historyIndex--;
    } else if (direction === 'redo' && STATE.historyIndex < STATE.history.length - 1) {
      STATE.historyIndex++;
    } else {
      return; // Nothing to do
    }

    const snapshot = STATE.history[STATE.historyIndex];
    if (!snapshot) return;

    // Restore state from snapshot
    STATE.rotationPatterns = JSON.parse(JSON.stringify(snapshot.rotationPatterns));
    STATE.rotationAssignments = JSON.parse(JSON.stringify(snapshot.rotationAssignments));

    // Re-render everything
    renderAll();
    updateUndoRedoButtons();
  }

  /**
   * Updates the disabled state of undo/redo buttons
   */
  function updateUndoRedoButtons() {
    ELS.btnUndo.disabled = STATE.historyIndex <= 0;
    ELS.btnRedo.disabled = STATE.historyIndex >= STATE.history.length - 1;
  }
  
  /**
   * Finds the assignment for a given advisor ID.
   * @param {string} advisorId
   * @returns {object | null} The assignment object or null
   */
  function getAssignmentForAdvisor(advisorId) {
    return STATE.rotationAssignments.find(a => a.advisor_id === advisorId) || null;
  }
  
  /**
   * Finds a shift template by its code (e.g., "7A").
   * @param {string} code
   * @returns {object | null} The template object or null
   */
  function getTemplateByCode(code) {
    if (!code) return null;
    return STATE.shiftTemplates.find(t => t.code === code) || null;
  }
  
  /**
   * Finds a rotation pattern by its name (e.g., "Flex 1").
   * @param {string} name
   * @returns {object | null} The pattern object or null
   */
  function getPatternByName(name) {
    if (!name) return null;
    return STATE.rotationPatterns.find(p => p.name === name) || null;
  }

  // --- 3. RENDERING ---

  /**
   * Caches all important DOM elements.
   */
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
    
    ELS.plannerSection = document.querySelector('.planner-section');
    ELS.plannerDay = document.getElementById('plannerDay');
    ELS.timeHeader = document.getElementById('timeHeader');
    ELS.plannerBody = document.getElementById('plannerBody');

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
    renderRotationEditor(); // This calls renderRotationGrid
    renderAssignmentGrid();
    renderPlanner();
  }

  /**
   * Renders the hierarchical schedules tree (Sites > Leaders > Advisors).
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

    // Build a nested structure
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

    // Render HTML from the structure
    Object.values(siteMap).sort((a,b) => a.name.localeCompare(b.name)).forEach(site => {
      const leaderEntries = Object.values(site.leaders).sort((a,b) => a.name.localeCompare(b.name));
      
      // Filter logic: show site if...
      const siteMatch = site.name.toLowerCase().includes(filter);
      const leaderMatch = leaderEntries.some(l => l.name.toLowerCase().includes(filter));
      const advisorMatch = leaderEntries.some(l => l.advisors.some(a => a.name.toLowerCase().includes(filter)));
      
      if (!filter || siteMatch || leaderMatch || advisorMatch) {
        html += `<details class="tree-node" open>
          <summary>${site.name}</summary>`;
        
        leaderEntries.forEach(leader => {
          const advisorEntries = leader.advisors.sort((a,b) => a.name.localeCompare(b.name));
          
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
            html += `</details>`; // end leader
          }
        });
        html += `</details>`; // end site
      }
    });

    ELS.schedulesTree.innerHTML = html || '<div class="loading-spinner">No schedules found.</div>';
    
    // Auto-select first advisor if none are selected (fixes blank screen)
    if (STATE.selectedAdvisors.size === 0 && STATE.advisors.length > 0) {
      const firstAdvisorId = STATE.advisors.sort((a,b) => a.name.localeCompare(b.name))[0].id;
      STATE.selectedAdvisors.add(firstAdvisorId);
      // Re-check the box in the newly rendered HTML
      const firstCheckbox = ELS.schedulesTree.querySelector(`.select-advisor[data-advisor-id="${firstAdvisorId}"]`);
      if (firstCheckbox) {
        firstCheckbox.checked = true;
      }
      renderPlanner(); // Re-render planner with this one advisor
    }
  }

  /**
   * Renders the "Rotation Editor" tab, including the dropdown and grid.
   */
  function renderRotationEditor() {
    // 1. Populate Rotation Family dropdown
    const patterns = STATE.rotationPatterns.sort((a,b) => a.name.localeCompare(b.name));
    let opts = '<option value="">-- Select Rotation --</option>';
    patterns.forEach(p => {
      opts += `<option value="${p.name}" ${p.name === STATE.currentRotation ? 'selected' : ''}>${p.name}</option>`;
    });
    ELS.rotationFamily.innerHTML = opts;

    // 2. Render the grid
    renderRotationGrid();
  }
  
  /**
   * Renders the 6-week grid for the selected rotation pattern.
   */
  function renderRotationGrid() {
    const pattern = getPatternByName(STATE.currentRotation);
    const patternData = pattern ? (pattern.pattern || {}) : {}; // pattern.pattern is the JSONB
    const weeks = [1, 2, 3, 4, 5, 6];
    const days = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
    
    // Build shift template options
    const templateOpts = STATE.shiftTemplates
      .sort((a,b) => (a.code || '').localeCompare(b.code || ''))
      .map(t => `<option value="${t.code}">${t.code}</option>`)
      .join('');
      
    let html = '<table><thead><tr><th>WEEK</th>';
    days.forEach(d => html += `<th>${d}</th>`);
    html += '</tr></thead><tbody>';

    weeks.forEach(w => {
      html += `<tr><td>Week ${w}</td>`;
      days.forEach((d, i) => {
        const dow = i + 1; // 1=Mon, 7=Sun
        const weekData = patternData[`Week ${w}`] || {};
        const code = weekData[dow] || ''; // 'dow' is the key in the JSON
        
        html += `
          <td>
            <select class="form-select rotation-grid-select" data-week="${w}" data-dow="${dow}" ${!pattern ? 'disabled' : ''}>
              <option value="">-- RDO --</option>
              ${templateOpts}
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
   * Renders the "Advisor Assignments" grid.
   */
  function renderAssignmentGrid() {
    const advisors = STATE.advisors.sort((a,b) => a.name.localeCompare(b.name));
    const patterns = STATE.rotationPatterns.sort((a,b) => a.name.localeCompare(b.name));
    
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
        // Init flatpickr
        flatpickr(dateInput, {
          dateFormat: "d/m/Y",
          allowInput: true,
          onChange: function(selectedDates, dateStr, instance) {
            // This is the event handler from handleAssignmentChange
            const advisorId = instance.element.dataset.advisorId;
            handleAssignmentChange(advisorId, 'start_date', dateStr);
          }
        });
      }
    });
  }

  /**
   * Renders the main horizontal planner ("Team Schedule").
   */
  function renderPlanner() {
    // FIX v7: Check if elements exist before reading properties
    if (!ELS.timeHeader || !ELS.plannerBody || !ELS.plannerDay) {
      console.warn("Planner elements not found. Skipping render.");
      return;
    }
    
    renderTimeHeader();
    
    const selected = Array.from(STATE.selectedAdvisors);
    if (selected.length === 0) {
      ELS.plannerBody.innerHTML = '<div class="timeline-row no-data">No advisors selected. Check boxes in the "Schedules" panel.</div>';
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
   * Renders the time ticks in the planner header.
   */
  function renderTimeHeader() {
    const startHour = 6;
    const endHour = 22;
    const totalHours = endHour - startHour;
    
    let html = '';
    for (let h = startHour; h <= endHour; h++) {
      const pct = (h - startHour) / totalHours * 100;
      const label = h.toString().padStart(2, '0') + ':00';
      html += `<div class="time-tick" style="left: ${pct}%;">${label}</div>`;
    }
    ELS.timeHeader.innerHTML = html;
  }
  
  /**
   * Calculates and renders the HTML for all segments for a given advisor.
   * @param {string} advisorId
   * @returns {string} HTML string of segments
   */
  function renderSegmentsForAdvisor(advisorId) {
    const segments = calculateSegmentsForAdvisor(advisorId);
    if (!segments || segments.length === 0) {
      return '<div class="no-data">No shift scheduled</div>';
    }
    
    return segments.map(seg => {
      const { startMin, endMin, label, code, colorClass } = seg;
      const startPct = (startMin - (6 * 60)) / (16 * 60) * 100; // 6am to 10pm = 16 hours
      const widthPct = (endMin - startMin) / (16 * 60) * 100;
      
      const startTime = String(Math.floor(startMin / 60)).padStart(2, '0') + ':' + String(startMin % 60).padStart(2, '0');
      const endTime = String(Math.floor(endMin / 60)).padStart(2, '0') + ':' + String(endMin % 60).padStart(2, '0');

      return `
        <div class="timeline-bar ${colorClass}" style="left: ${startPct}%; width: ${widthPct}%;" title="${label} (${startTime} - ${endTime})">
          <span class="bar-label">${label}</span>
          <span class="bar-time">${startTime} - ${endTime}</span>
        </div>
      `;
    }).join('');
  }

  // --- 4. CORE LOGIC (Calculations) ---

  /**
   * Calculates all visual segments for an advisor for the selected day.
   * This is the core logic that renders the bars.
   * @param {string} advisorId
   * @returns {Array<object>} Array of segment objects
   */
  function calculateSegmentsForAdvisor(advisorId) {
    const assignment = getAssignmentForAdvisor(advisorId);
    if (!assignment || !assignment.rotation_name || !assignment.start_date || !STATE.weekStart) {
      return []; // No rotation assigned
    }

    const effectiveWeek = getEffectiveWeek(assignment.start_date, STATE.weekStart, assignment);
    if (effectiveWeek === null) {
      return []; // Invalid date
    }
    
    const dayOfWeek = ELS.plannerDay.value; // "Monday", "Tuesday", etc.
    const dayIndex = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].indexOf(dayOfWeek) + 1; // 1-7

    const pattern = getPatternByName(assignment.rotation_name);
    if (!pattern || !pattern.pattern) {
      return []; // Rotation pattern not found
    }
    
    // Get the shift code (e.g., "7A")
    const weekPattern = pattern.pattern[`Week ${effectiveWeek}`] || {};
    const shiftCode = weekPattern[dayIndex]; // Get code for e.g., "Monday" (1)
    
    if (!shiftCode) {
      return []; // RDO
    }
    
    const template = getTemplateByCode(shiftCode);
    if (!template) {
      return []; // Shift code (e.g., "7A") doesn't map to a template
    }
    
    // Now we have a full template, slice it into segments
    return sliceTemplateIntoSegments(template);
  }
  
  /**
   * Calculates the effective week number (1-6) of a rotation.
   * FIX v8: This function is now timezone-proof by parsing dates as local.
   * @param {string} startDateStr - "dd/mm/yyyy" start of Week 1
   * @param {string} weekStartISO - "YYYY-MM-DD" of the week to check
   * @returns {number | null} The week number (1-6) or null
   */
  function getEffectiveWeek(startDateStr, weekStartISO) {
    try {
      if (!startDateStr || !weekStartISO) return null;
      
      // Parse "dd/mm/yyyy" as local date
      const [d, m, y] = startDateStr.split('/').map(Number);
      const startDate = new Date(y, m - 1, d); // JS Date: month is 0-indexed
      
      // Parse "YYYY-MM-DD" as local date
      const [y2, m2, d2] = weekStartISO.split('-').map(Number);
      const checkDate = new Date(y2, m2 - 1, d2);

      // We must use UTC methods to get a clean day/week count,
      // but first, we create UTC-equivalent dates from our local parts.
      // This avoids timezone shifts entirely.
      const startUTC = Date.UTC(y, m - 1, d);
      const checkUTC = Date.UTC(y2, m2 - 1, d2);

      // Check if start date is a Monday (1)
      const startDay = (startDate.getDay() + 6) % 7; // 0=Mon, 6=Sun
      if (startDay !== 0) {
        // This is a warning, but we can proceed
        // console.warn(`Rotation start date ${startDateStr} is not a Monday.`);
      }

      const diffTime = checkUTC - startUTC;
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      const diffWeeks = Math.floor(diffDays / 7);
      
      const numWeeksInRotation = 6; // TODO: Make this dynamic from pattern
      
      const effectiveWeek = (diffWeeks % numWeeksInRotation + numWeeksInRotation) % numWeeksInRotation + 1;
      
      return effectiveWeek;
    } catch (e) {
      console.error("Error in getEffectiveWeek", e, { startDateStr, weekStartISO });
      return null;
    }
  }
  
  /**
   * Converts a shift template into an array of visual segments.
   * @param {object} template - The shift_template object from Supabase
   * @returns {Array<object>} Array of segments for rendering
   */
  function sliceTemplateIntoSegments(template) {
    const segments = [];
    const parseTime = (t) => {
      if (!t) return null;
      const [h, m] = t.split(':').map(Number);
      return h * 60 + m;
    };

    const startMin = parseTime(template.start_time);
    const endMin = parseTime(template.end_time);
    if (startMin === null || endMin === null || startMin >= endMin) {
      return []; // Invalid shift
    }

    let currentTime = startMin;

    // Collate all breaks
    const breaks = [
      { type: 'Break', time: parseTime(template.break1), duration: 15, color: 'bar-color-break', label: 'Break' },
      { type: 'Lunch', time: parseTime(template.lunch), duration: 30, color: 'bar-color-lunch', label: 'Lunch' },
      { type: 'Break', time: parseTime(template.break2), duration: 15, color: 'bar-color-break', label: 'Break' }
    ].filter(b => b.time !== null && b.time >= startMin && b.time < endMin)
     .sort((a,b) => a.time - b.time);

    const workLabel = template.code || 'Work';
    const workColor = getClassForCode(template.code);

    // Add work segments around breaks
    for (const br of breaks) {
      if (br.time > currentTime) {
        // Add work segment before this break
        segments.push({
          startMin: currentTime,
          endMin: br.time,
          label: workLabel,
          code: template.code,
          colorClass: workColor
        });
      }
      // Add the break segment
      segments.push({
        startMin: br.time,
        endMin: br.time + br.duration,
        label: br.label,
        code: br.type,
        colorClass: br.color
      });
      currentTime = br.time + br.duration;
    }

    // Add final work segment
    if (currentTime < endMin) {
      segments.push({
        startMin: currentTime,
        endMin: endMin,
        label: workLabel,
        code: template.code,
        colorClass: workColor
      });
    }

    return segments;
  }
  
  /**
   * Gets a CSS color class based on a shift code.
   * @param {string} code
   * @returns {string} The CSS class name
   */
  function getClassForCode(code) {
    const k = (code || '').toLowerCase();
    if (k.includes('lunch')) return 'bar-color-lunch';
    if (k.includes('break')) return 'bar-color-break';
    if (k.includes('overtime')) return 'bar-color-overtime';
    if (k.includes('mirakl')) return 'bar-color-mirakl';
    if (k.includes('social')) return 'bar-color-social';
    if (k.includes('email')) return 'bar-color-email';
    if (['al','sick','rdo','maternity','lts'].some(w=>k.includes(w))) return 'bar-color-absence';
    if (['121','coaching','huddle','meeting','training'].some(w=>k.includes(w))) return 'bar-color-meeting';
    return 'bar-color-default'; // Fallback
  }

  // --- 5. EVENT HANDLERS ---

  /**
   * Wires up all static event listeners for the application.
   */
  function wireEventHandlers() {
    // Top Bar
    flatpickr(ELS.weekStart, {
      dateFormat: "Y-m-d",
      defaultDate: STATE.weekStart,
      onChange: (selectedDates, dateStr) => {
        STATE.weekStart = dateStr;
        renderPlanner();
      }
    });
    ELS.prevWeek.addEventListener('click', () => updateWeek(-7));
    ELS.nextWeek.addEventListener('click', () => updateWeek(7));
    ELS.btnUndo.addEventListener('click', () => applyHistory('undo'));
    ELS.btnRedo.addEventListener('click', () => applyHistory('redo'));
    // ELS.btnCommit.addEventListener('click', handleCommit); // TODO
    // ELS.btnPrint.addEventListener('click', () => window.print()); // TODO

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
    ELS.rotationGrid.addEventListener('change', handleRotationGridChange);

    // Advisor Assignments
    ELS.assignmentGrid.addEventListener('change', (e) => {
      const target = e.target;
      if (target.classList.contains('assign-rotation')) {
        handleAssignmentChange(target.dataset.advisorId, 'rotation_name', target.value);
      }
      // Date changes are handled by flatpickr's onChange
    });

    // Schedules Tree
    ELS.treeSearch.addEventListener('input', renderSchedulesTree);
    ELS.btnClearSelection.addEventListener('click', () => {
      STATE.selectedAdvisors.clear();
      renderSchedulesTree(); // Re-render to uncheck all
      renderPlanner(); // Clear planner
    });
    ELS.schedulesTree.addEventListener('change', handleTreeSelectionChange);
    
    // Planner
    ELS.plannerDay.addEventListener('change', (e) => {
      STATE.selectedDay = e.target.value;
      renderPlanner();
    });
  }
  
  /**
   * Handles check/uncheck logic for the schedules tree
   */
  function handleTreeSelectionChange(e) {
    const target = e.target;
    
    // 1. Single Advisor
    if (target.classList.contains('select-advisor')) {
      const id = target.dataset.advisorId;
      if (target.checked) {
        STATE.selectedAdvisors.add(id);
      } else {
        STATE.selectedAdvisors.delete(id);
      }
    }
    
    // 2. Select All Team (Leader)
    if (target.classList.contains('select-leader')) {
      const leaderId = target.dataset.leaderId;
      const leader = STATE.leaders.find(l => l.id === leaderId);
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
    
    // 3. Select All Advisors (Top level)
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
    
    // Re-render the planner
    renderPlanner();
  }

  /**
   * Handles saving a change to an advisor's assignment.
   * @param {string} advisorId
   * @param {'rotation_name' | 'start_date'} field
   * @param {string} value
   */
  async function handleAssignmentChange(advisorId, field, value) {
    if (!advisorId) return;

    let assignment = getAssignmentForAdvisor(advisorId);
    
    // Create new assignment if one doesn't exist
    if (!assignment) {
      assignment = { advisor_id: advisorId, rotation_name: null, start_date: null };
      STATE.rotationAssignments.push(assignment);
    }
    
    // Update the local state
    assignment[field] = value || null;

    // Persist to Supabase
    try {
      const { data, error } = await supabase
        .from('rotation_assignments')
        .upsert(assignment, { onConflict: 'advisor_id' })
        .select();
        
      if (error) throw error;
      
      // Update state with the returned data (in case of new row)
      const index = STATE.rotationAssignments.findIndex(a => a.advisor_id === advisorId);
      if (index > -1) {
        STATE.rotationAssignments[index] = data[0];
      }
      
      saveHistory('Update assignment');
      showToast("Assignment saved.", "success");
      renderPlanner(); // Re-render the planner to show the change
      
    } catch (error) {
      console.error("Failed to save assignment:", error);
      showToast(`Error saving: ${error.message}`, "danger");
      // TODO: Revert local state on failure?
    }
  }
  
  /**
   * Handles changes to the rotation grid dropdowns (local state only)
   */
  function handleRotationGridChange(e) {
    if (!e.target.classList.contains('rotation-grid-select')) return;
    
    const { week, dow } = e.target.dataset;
    const code = e.target.value;
    const rotationName = STATE.currentRotation;
    
    const pattern = getPatternByName(rotationName);
    if (!pattern) return;
    
    // Update the local state object
    if (!pattern.pattern) {
      pattern.pattern = {};
    }
    const weekKey = `Week ${week}`;
    if (!pattern.pattern[weekKey]) {
      pattern.pattern[weekKey] = {};
    }
    
    if (code) {
      pattern.pattern[weekKey][dow] = code;
    } else {
      delete pattern.pattern[weekKey][dow]; // RDO
    }
  }

  /**
   * Handles creating a new rotation pattern.
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
      // FIX v9: Save to 'rotation_patterns'
      const { data, error } = await supabase
        .from('rotation_patterns')
        .insert(newPattern)
        .select();
        
      if (error) throw error;
      
      // Add to local state
      STATE.rotationPatterns.push(data[0]);
      STATE.currentRotation = name;
      saveHistory(`Create rotation ${name}`);
      renderRotationEditor(); // Re-render to show the new pattern
      
    } catch (error) {
      console.error("Failed to create rotation:", error);
      showToast(`Error creating rotation: ${error.message}`, "danger");
    }
  }

  /**
   * Handles saving the currently edited rotation pattern.
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
      // FIX v9: Update 'rotation_patterns'
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
      // FIX v9: Delete from 'rotation_patterns'
      const { error } = await supabase
        .from('rotation_patterns')
        .delete()
        .eq('name', rotationName);
        
      if (error) throw error;
      
      // Remove from local state
      STATE.rotationPatterns = STATE.rotationPatterns.filter(p => p.name !== rotationName);
      STATE.currentRotation = null;
      
      showToast(`Rotation '${rotationName}' deleted.`, "success");
      saveHistory(`Delete rotation ${rotationName}`);
      renderRotationEditor(); // Re-render dropdown and grid
      
      // TODO: We should also clear any advisor assignments that used this rotation.
      
    } catch (error) {
      console.error("Failed to delete rotation:", error);
      showToast(`Error deleting rotation: ${error.message}. It might be in use by an advisor.`, "danger");
    }
  }
  
  /**
   * Shifts the main weekStart date by a number of days.
   * @param {number} days - e.g., 7 or -7
   */
  function updateWeek(days) {
    // FIX v8: Use _flatpickr to access the instance
    const flatpickrInstance = ELS.weekStart._flatpickr;
    if (!flatpickrInstance) return;

    const currentDate = flatpickrInstance.selectedDates[0] || new Date();
    currentDate.setDate(currentDate.getDate() + days);
    
    flatpickrInstance.setDate(currentDate, true); // true = trigger onChange
  }


  // --- 6. UTILITIES ---

  /**
   * Displays a notification toast at the bottom of the screen.
   * @param {string} message - The text to display.
   * @param {'success' | 'danger'} type - The color/style of the toast.
   * @param {number} duration - How long to show the toast (in ms).
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
   * FIX v8: Use local date parsing to avoid timezone shift.
   */
  function setDefaultWeek() {
    let d = new Date(); // Local time
    // Find previous Monday
    let day = d.getDay();
    let diff = d.getDate() - day + (day === 0 ? -6 : 1); // 0=Sun, 1=Mon
    
    // Create new date object from clean local parts
    const localMonday = new Date(d.getFullYear(), d.getMonth(), diff);
    
    const y = localMonday.getFullYear();
    const m = String(localMonday.getMonth() + 1).padStart(2, '0');
    const dStr = String(localMonday.getDate()).padStart(2, '0');
    STATE.weekStart = `${y}-${m}-${d}`;
  }

  /**
   * Main application boot sequence.
   */
  async function bootApplication() {
    console.log("Booting application...");
    
    // 1. Cache DOM elements
    cacheDOMElements();
    
    // 2. Set default date *before* initializing anything
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


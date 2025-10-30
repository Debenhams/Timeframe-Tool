/* ========================================================================
    APPLICATION LOGIC (src/planner.js)
    - Fetches data from Supabase
    - Contains all business logic for rotations
    - Contains all rendering functions for the UI
======================================================================== */

// --- Globals & App State ---
(function (global) {
    "use strict";

    // Globals to hold our database state
    global.APP_STATE = {
        advisors: new Map(), // (id -> {id, name, ...})
        leaders: new Map(),  // (id -> {id, name, site_id, ...})
        sites: new Map(),    // (id -> {id, name, ...})
        
        shiftTemplates: new Map(), // (code -> {code, start_time, ...})
        
        rotationPatterns: new Map(), // (name -> {name, pattern: {week1: {...}, ...}})
        rotationAssignments: new Map(), // (advisor_id -> {advisor_id, rotation_name, start_date})

        selectedAdvisors: new Set(), // Set of advisor IDs
        
        // Undo/Redo buffer for advisor assignments
        history: [],
        historyIndex: -1,
        isUndoing: false, // Flag to prevent re-triggering history save

        // Caches
        advisorSelectOptions: '', // HTML for advisor dropdowns
    };

    // --- Utility Functions ---
    const $ = (s) => document.querySelector(s);
    const $$ = (s) => Array.from(document.querySelectorAll(s));

    /**
     * Sets the Monday of a given date.
     * @param {Date} d - The input date.
     * @returns {Date} A new Date object set to the Monday of that week.
     */
    function setToMonday(d) {
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Sunday
        return new Date(d.setDate(diff));
    }
    global.setToMonday = setToMonday;

    /**
     * Formats a Date object to "YYYY-MM-DD" string.
     * @param {Date} d - The input date.
     * @returns {string} The formatted date string.
     */
    function toISODate(d) {
        return d.toISOString().split('T')[0];
    }
    global.toISODate = toISODate;

    /**
     * Converts "HH:MM:SS" or "HH:MM" to total minutes from midnight.
     * @param {string} timeStr - The time string.
     * @returns {number | null} Total minutes or null if invalid.
     */
    function timeToMinutes(timeStr) {
        if (!timeStr) return null;
        const [hours, minutes] = String(timeStr).split(':').map(Number);
        if (isNaN(hours) || isNaN(minutes)) return null;
        return hours * 60 + minutes;
    }
    global.timeToMinutes = timeToMinutes;

    /**
     * Converts total minutes from midnight to "HH:MM" format.
     * @param {number} minutes - The total minutes.
     * @returns {string} The formatted "HH:MM" string.
     */
    function minutesToTime(minutes) {
        if (minutes === null || isNaN(minutes)) return "--:--";
        const hours = Math.floor(minutes / 60).toString().padStart(2, '0');
        const mins = (minutes % 60).toString().padStart(2, '0');
        return `${hours}:${mins}`;
    }
    global.minutesToTime = minutesToTime;

    /**
     * Calculates the effective week number (1-6) of a rotation.
     * @param {string} rotationStartDateISO - The "Week 1" start date (YYYY-MM-DD).
     * @param {string} plannerDateISO - The date to check (YYYY-MM-DD).
     * @returns {number} The effective week number (1 to 6).
     */
    function getEffectiveWeek(rotationStartDateISO, plannerDateISO) {
        const start = new Date(rotationStartDateISO + 'T00:00:00');
        const plan = new Date(plannerDateISO + 'T00:00:00');
        
        // Get the Monday of the planner date
        const planMonday = setToMonday(plan);
        
        // Get the Monday of the rotation start date
        const startMonday = setToMonday(start);

        const diffTime = planMonday.getTime() - startMonday.getTime();
        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
        const diffWeeks = Math.floor(diffDays / 7);

        // Use a 6-week cycle
        const weekNum = (diffWeeks % 6);
        // Ensure result is 1-6, handling negative mods
        return (weekNum < 0 ? weekNum + 6 : weekNum) + 1;
    }
    global.getEffectiveWeek = getEffectiveWeek;

    /**
     * Shows a status message next to the save button.
     * @param {string} text - The message to display.
     * @param {'saving' | 'saved' | 'error' | 'idle'} type - The message type.
     */
    function showRotationStatus(text, type = 'idle') {
        const el = $('#rotationStatus');
        if (!el) return;
        el.textContent = text;
        el.className = 'form-status-label'; // Reset
        if (type !== 'idle') {
            el.classList.add(type);
        }
        // Clear "saved" message after a delay
        if (type === 'saved') {
            setTimeout(() => {
                if (el.textContent === text) {
                    el.textContent = '';
                    el.className = 'form-status-label';
                }
            }, 2000);
        }
    }

    // ========================================================================
    //      DATABASE: LOADERS (Called by init.js)
    // ========================================================================

    /**
     * Loads all foundational data from Supabase in parallel.
     */
    async function loadAllData() {
        console.log("Loading data from Supabase...");
        showRotationStatus("Loading data...", "saving");
        try {
            const [orgData, templates, patterns, assignments] = await Promise.all([
                loadOrgData(),
                loadShiftTemplates(),
                loadRotationPatterns(),
                loadRotationAssignments()
            ]);
            console.log("Data Loaded.", {
                org: orgData,
                templates: templates.size,
                patterns: patterns.size,
                assignments: assignments.size
            });
            showRotationStatus("Data Loaded", "saved");
        } catch (error) {
            console.error("Error loading all data:", error);
            showRotationStatus("Error loading data!", "error");
        }
    }
    global.loadAllData = loadAllData;

    /**
     * Loads sites, leaders, and advisors.
     */
    async function loadOrgData() {
        const { data, error } = await supabase
            .from('sites')
            .select(`
                id, name,
                leaders ( id, name, site_id,
                    advisors ( id, name, leader_id, email )
                )
            `);
        
        if (error) throw error;

        // Clear old maps
        APP_STATE.sites.clear();
        APP_STATE.leaders.clear();
        APP_STATE.advisors.clear();

        // Populate new maps
        for (const site of data) {
            APP_STATE.sites.set(site.id, site);
            for (const leader of site.leaders) {
                APP_STATE.leaders.set(leader.id, leader);
                for (const advisor of leader.advisors) {
                    APP_STATE.advisors.set(advisor.id, advisor);
                }
            }
        }
        return { sites: APP_STATE.sites.size, leaders: APP_STATE.leaders.size, advisors: APP_STATE.advisors.size };
    }
    global.loadOrgData = loadOrgData;

    /**
     * Loads all shift templates (e.g., "7A", "RDO").
     */
    async function loadShiftTemplates() {
        const { data, error } = await supabase
            .from('shift_templates')
            .select('code, start_time, end_time, break1, lunch, break2')
            .order('code');

        if (error) throw error;

        APP_STATE.shiftTemplates.clear();
        data.forEach(t => APP_STATE.shiftTemplates.set(t.code, t));
        
        // Cache the <option> HTML for all dropdowns
        APP_STATE.advisorSelectOptions = '<option value="">--</option>';
        APP_STATE.advisorSelectOptions += data.map(t => 
            `<option value="${t.code}">${t.code}</option>`
        ).join('');

        return APP_STATE.shiftTemplates;
    }
    global.loadShiftTemplates = loadShiftTemplates;

    /**
     * Loads all saved rotation patterns from the new `rotation_patterns` table.
     */
    async function loadRotationPatterns() {
        // Use the new, unique table name
        const { data, error } = await supabase
            .from('rotation_patterns')
            .select('name, pattern');

        if (error) throw error;

        APP_STATE.rotationPatterns.clear();
        data.forEach(p => APP_STATE.rotationPatterns.set(p.name, p));
        return APP_STATE.rotationPatterns;
    }
    global.loadRotationPatterns = loadRotationPatterns;

    /**
     * Loads all advisor assignments from the new `rotation_assignments` table.
     */
    async function loadRotationAssignments() {
        // Use the new, unique table name
        const { data, error } = await supabase
            .from('rotation_assignments')
            .select('advisor_id, rotation_name, start_date');

        if (error) throw error;

        APP_STATE.rotationAssignments.clear();
        data.forEach(a => APP_STATE.rotationAssignments.set(a.advisor_id, a));
        return APP_STATE.rotationAssignments;
    }
    global.loadRotationAssignments = loadRotationAssignments;

    // ========================================================================
    //      DATABASE: SAVERS (Called by UI events)
    // ========================================================================

    /**
     * Saves (upserts) the currently displayed rotation pattern.
     */
    async function saveRotationPattern() {
        const select = $('#rotationNameSelect');
        const rotationName = select.value;
        if (!rotationName) return;

        showRotationStatus("Saving...", "saving");
        const pattern = {};
        let hasData = false;

        // Read the 6x7 grid
        for (let week = 1; week <= 6; week++) {
            const weekKey = `week${week}`;
            pattern[weekKey] = {};
            const weekRow = $(`#rotationEditorGrid tr[data-week="${weekKey}"]`);
            if (weekRow) {
                const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
                days.forEach(day => {
                    const sel = weekRow.querySelector(`select[data-day="${day}"]`);
                    if (sel && sel.value) {
                        pattern[weekKey][day] = sel.value;
                        hasData = true;
                    } else {
                        pattern[weekKey][day] = null;
                    }
                });
            }
        }

        if (!hasData) {
            showRotationStatus("Cannot save an empty rotation.", "error");
            return;
        }

        // Use the new, unique table name
        const { error } = await supabase
            .from('rotation_patterns')
            .upsert({ name: rotationName, pattern: pattern }, { onConflict: 'name' });

        if (error) {
            console.error("Error saving rotation:", error);
            showRotationStatus(error.message, "error");
        } else {
            APP_STATE.rotationPatterns.set(rotationName, { name: rotationName, pattern });
            showRotationStatus("Saved!", "saved");
            $('#btnSaveRotation').disabled = true;
        }
    }
    global.saveRotationPattern = saveRotationPattern;

    /**
     * Deletes the currently selected rotation pattern.
     */
    async function deleteRotationPattern() {
        const select = $('#rotationNameSelect');
        const rotationName = select.value;
        if (!rotationName) return;

        if (!confirm(`Are you sure you want to delete the "${rotationName}" rotation pattern? This cannot be undone.`)) {
            return;
        }

        showRotationStatus("Deleting...", "saving");

        // Use the new, unique table name
        const { error } = await supabase
            .from('rotation_patterns')
            .delete()
            .eq('name', rotationName);
        
        if (error) {
            console.error("Error deleting rotation:", error);
            showRotationStatus(error.message, "error");
        } else {
            APP_STATE.rotationPatterns.delete(rotationName);
            showRotationStatus("Deleted!", "saved");
            populateRotationFamilySelect(); // Re-populate the main dropdown
            displayRotationPattern(null); // Clear the grid
        }
    }
    global.deleteRotationPattern = deleteRotationPattern;

    /**
     * Saves a single advisor's rotation assignment.
     * @param {string} advisorId - The UUID of the advisor.
     * @param {string} rotationName - The name of the rotation family.
     * @param {string} startDate - The "Week 1" start date (YYYY-MM-DD).
     */
    async function saveAdvisorAssignment(advisorId, rotationName, startDate) {
        if (!advisorId) return;

        // Find the row and show a saving indicator
        const row = $(`#advisorAssignmentBody tr[data-advisor-id="${advisorId}"]`);
        if (row) row.classList.add('saving');

        const assignment = {
            advisor_id: advisorId,
            rotation_name: rotationName || null,
            start_date: startDate || null
        };
        
        // Use the new, unique table name
        const { error } = await supabase
            .from('rotation_assignments')
            .upsert(assignment, { onConflict: 'advisor_id' });

        if (row) row.classList.remove('saving');

        if (error) {
            console.error("Error saving assignment:", error);
            if (row) row.classList.add('error');
        } else {
            console.log("Saved assignment for", advisorId);
            APP_STATE.rotationAssignments.set(advisorId, assignment);
            if (row) {
                row.classList.add('saved');
                setTimeout(() => row.classList.remove('saved'), 1500);
            }
            // Re-render the planners
            refreshAllUI();
        }
    }
    global.saveAdvisorAssignment = saveAdvisorAssignment;

    // ========================================================================
    //      UI: RENDERERS (Populate the page)
    // ========================================================================

    /**
     * Re-draws all UI components that depend on data.
     */
    function refreshAllUI() {
        rebuildAdvisorTree();
        populateRotationFamilySelect();
        populateRotationEditorGrid();
        populateAdvisorAssignmentTable();
        renderTimeHeader();
        renderPlanner();
        // NOTE: Vertical calendar is not part of this "v3" build
    }
    global.refreshAllUI = refreshAllUI;

    /**
     * Rebuilds the Advisor "Schedules" tree on the right.
     * This version ONLY shows advisors, as requested by the "Big Leap" plan.
     */
    function rebuildAdvisorTree() {
        const treeEl = $('#tree');
        if (!treeEl) return;

        const advisors = Array.from(APP_STATE.advisors.values());
        advisors.sort((a, b) => a.name.localeCompare(b.name));

        const filter = ($('#treeSearch').value || '').toLowerCase();

        const advisorNodes = advisors
            .filter(a => a.name.toLowerCase().includes(filter))
            .map(a => `
                <div class="node">
                    <label>
                        <input type="checkbox" class="advisor-tree-checkbox" value="${a.id}" ${APP_STATE.selectedAdvisors.has(a.id) ? 'checked' : ''}>
                        <span>${a.name}</span>
                    </label>
                </div>
            `);

        treeEl.innerHTML = `
            <details class="tree" open>
                <summary>
                    <span class="twisty">▼</span>
                    <strong>All Advisors</strong>
                </summary>
                ${advisorNodes.join('') || '<div class="node-muted">No advisors found.</div>'}
            </details>
        `;
    }
    global.rebuildAdvisorTree = rebuildAdvisorTree;

    /**
     * Updates the "Selected Advisors" chips below the tree.
     */
    function refreshAdvisorChips() {
        const chipsEl = $('#activeChips');
        if (!chipsEl) return;

        const selected = Array.from(APP_STATE.selectedAdvisors);
        selected.sort((a, b) => {
            const nameA = APP_STATE.advisors.get(a)?.name || '';
            const nameB = APP_STATE.advisors.get(b)?.name || '';
            return nameA.localeCompare(nameB);
        });

        chipsEl.innerHTML = selected.map(id => {
            const advisor = APP_STATE.advisors.get(id);
            if (!advisor) return '';
            return `
                <span class="chip" data-advisor-id="${id}">
                    ${advisor.name}
                    <button class="chip-remove" data-id="${id}">&times;</button>
                </span>
            `;
        }).join('');
    }
    global.refreshAdvisorChips = refreshAdvisorChips;

    /**
     * Populates the "Rotation Family" <select> dropdown.
     */
    function populateRotationFamilySelect() {
        const select = $('#rotationNameSelect');
        if (!select) return;

        const currentVal = select.value;
        const families = Array.from(APP_STATE.rotationPatterns.keys());
        families.sort();

        select.innerHTML = '<option value="">-- Select a Rotation --</option>';
        select.innerHTML += families.map(name =>
            `<option value="${name}">${name}</option>`
        ).join('');
        
        // Try to re-select the previous value
        if (APP_STATE.rotationPatterns.has(currentVal)) {
            select.value = currentVal;
        }
    }
    global.populateRotationFamilySelect = populateRotationFamilySelect;

    /**
     * Populates the 6x7 "Rotation Editor" grid with dropdowns.
     */
    function populateRotationEditorGrid() {
        const gridBody = $('#rotationEditorGrid');
        if (!gridBody) return;

        gridBody.innerHTML = ''; // Clear it
        for (let week = 1; week <= 6; week++) {
            const row = document.createElement('tr');
            row.dataset.week = `week${week}`;
            row.innerHTML = `
                <td>Week ${week}</td>
                <td><select class="form-select" data-day="mon">${APP_STATE.advisorSelectOptions}</select></td>
                <td><select class="form-select" data-day="tue">${APP_STATE.advisorSelectOptions}</select></td>
                <td><select class="form-select" data-day="wed">${APP_STATE.advisorSelectOptions}</select></td>
                <td><select class="form-select" data-day="thu">${APP_STATE.advisorSelectOptions}</select></td>
                <td><select class="form-select" data-day="fri">${APP_STATE.advisorSelectOptions}</select></td>
                <td><select class="form-select" data-day="sat">${APP_STATE.advisorSelectOptions}</select></td>
                <td><select class="form-select" data-day="sun">${APP_STATE.advisorSelectOptions}</select></td>
                <td>
                    <button class="form-button subtle form-button-sm btn-copy-week" title="Copy this week's pattern down">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M1 8a.5.5 0 0 1 .5-.5h11.793l-3.147-3.146a.5.5 0 0 1 .708-.708l4 4a.5.5 0 0 1 0 .708l-4 4a.5.5 0 0 1-.708-.708L13.293 8.5H1.5A.5.5 0 0 1 1 8z"/></svg>
                    </button>
                </td>
            `;
            gridBody.appendChild(row);
        }
    }
    global.populateRotationEditorGrid = populateRotationEditorGrid;

    /**
     * Fills the "Rotation Editor" grid with a pattern's data.
     * @param {string | null} rotationName - The name of the rotation to display.
     */
    function displayRotationPattern(rotationName) {
        const pattern = rotationName ? APP_STATE.rotationPatterns.get(rotationName)?.pattern : null;

        for (let week = 1; week <= 6; week++) {
            const weekKey = `week${week}`;
            const weekRow = $(`#rotationEditorGrid tr[data-week="${weekKey}"]`);
            if (weekRow) {
                const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
                days.forEach(day => {
                    const sel = weekRow.querySelector(`select[data-day="${day}"]`);
                    if (sel) {
                        sel.value = pattern?.[weekKey]?.[day] || '';
                    }
                });
            }
        }
        
        // Enable/disable buttons based on selection
        $('#btnSaveRotation').disabled = !rotationName;
        $('#btnDeleteRotation').disabled = !rotationName;
        // Mark as "un-dirty"
        showRotationStatus(rotationName ? "Loaded pattern" : "Select or create a pattern");
    }
    global.displayRotationPattern = displayRotationPattern;

    /**
     * Populates the "Advisor Assignments" table.
     */
    function populateAdvisorAssignmentTable() {
        const tableBody = $('#advisorAssignmentBody');
        if (!tableBody) return;

        const advisors = Array.from(APP_STATE.advisors.values());
        advisors.sort((a, b) => a.name.localeCompare(b.name));

        const rotationNames = ['<option value="">-- No Rotation --</option>'];
        rotationNames.push(
            ...Array.from(APP_STATE.rotationPatterns.keys()).sort().map(name =>
                `<option value="${name}">${name}</option>`
            )
        );

        tableBody.innerHTML = ''; // Clear old data
        advisors.forEach(a => {
            const assignment = APP_STATE.rotationAssignments.get(a.id);
            const tr = document.createElement('tr');
            tr.dataset.advisorId = a.id;
            tr.innerHTML = `
                <td>${a.name}</td>
                <td>
                    <select class="form-select assign-rotation-name" data-advisor-id="${a.id}">
                        ${rotationNames.join('')}
                    </select>
                </td>
                <td>
                    <input type="date" class="form-input assign-start-date" data-advisor-id="${a.id}" />
                </td>
            `;
            // Set current values
            if (assignment) {
                tr.querySelector('.assign-rotation-name').value = assignment.rotation_name || '';
                tr.querySelector('.assign-start-date').value = assignment.start_date || '';
            }
            tableBody.appendChild(tr);
        });
        
        // Save to history for undo/redo
        saveHistory();
    }
    global.populateAdvisorAssignmentTable = populateAdvisorAssignmentTable;


    // ========================================================================
    //      UI: HORIZONTAL PLANNER (Main Schedule)
    // ========================================================================

    /**
     * Renders the hour ticks (e.g., "06:00", "07:00") in the header.
     */
    function renderTimeHeader() {
        const el = $('#timeHeader');
        if (!el) return;

        const startHour = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--timeline-start-hour') || '6', 10);
        const endHour = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--timeline-end-hour') || '20', 10);
        const hourWidth = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--timeline-hour-width') || '60', 10);

        el.innerHTML = '';
        for (let h = startHour; h <= endHour; h++) {
            const tick = document.createElement('div');
            tick.className = 'tick';
            tick.textContent = `${h.toString().padStart(2, '0')}:00`;
            tick.style.left = `${(h - startHour) * hourWidth}px`;
            el.appendChild(tick);
        }
    }
    global.renderTimeHeader = renderTimeHeader;

    /**
     * Main function to calculate and render the horizontal planner.
     */
    function renderPlanner() {
        const body = $('#plannerBody');
        if (!body) return;

        const rows = computeScheduleRows();
        
        body.innerHTML = ''; // Clear old rows
        if (!rows.length) {
            body.innerHTML = '<div class="planner-row-empty">No advisors selected or no shifts scheduled for this day.</div>';
            return;
        }

        const startHour = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--timeline-start-hour') || '6', 10);
        const hourWidth = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--timeline-hour-width') || '60', 10);
        const startMinutes = startHour * 60;
        const pxPerMinute = hourWidth / 60;

        rows.forEach(row => {
            const rowEl = document.createElement('div');
            rowEl.className = 'planner-row';
            
            // Name Column
            const nameEl = document.createElement('div');
            nameEl.className = 'planner-name';
            nameEl.textContent = row.name;
            nameEl.title = row.name;
            rowEl.appendChild(nameEl);

            // Timeline Column
            const timelineEl = document.createElement('div');
            timelineEl.className = 'planner-timeline';

            row.segments.forEach(seg => {
                const bar = document.createElement('div');
                bar.className = `planner-bar ${seg.cssClass || 'c-email'}`;
                
                const left = (seg.start - startMinutes) * pxPerMinute;
                const width = (seg.end - seg.start) * pxPerMinute;

                bar.style.left = `${left}px`;
                bar.style.width = `${width}px`;

                bar.innerHTML = `
                    <span class="planner-bar-label">${seg.code}</span>
                    <span class="planner-bar-time">${minutesToTime(seg.start)} - ${minutesToTime(seg.end)}</span>
                `;
                
                // Add tooltip data
                bar.dataset.tooltip = `
                    ${row.name}<br>
                    <span>${seg.code}</span>
                    <span>${minutesToTime(seg.start)} - ${minutesToTime(seg.end)}</span>
                `;
                timelineEl.appendChild(bar);
            });
            rowEl.appendChild(timelineEl);
            body.appendChild(rowEl);
        });
    }
    global.renderPlanner = renderPlanner;

    /**
     * Calculates the schedule rows for the selected advisors and day.
     * This is the "brains" of the auto-scheduler.
     * @returns {Array<object>} An array of row objects for the renderer.
     */
    function computeScheduleRows() {
        const weekStartISO = $('#weekStart').value;
        const dayName = $('#teamDay').value; // "Monday", "Tuesday", ...
        if (!weekStartISO || !dayName) return [];
        
        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        const dayIndex = days.indexOf(dayName);
        const dayKey = dayName.toLowerCase().substring(0, 3); // "mon", "tue", ...

        // Get the specific date for the selected day
        const plannerDate = new Date(weekStartISO + 'T00:00:00');
        plannerDate.setDate(plannerDate.getDate() + dayIndex);
        const plannerDateISO = toISODate(plannerDate);

        const scheduledRows = [];

        // Loop over only the selected advisors
        for (const advisorId of APP_STATE.selectedAdvisors) {
            const advisor = APP_STATE.advisors.get(advisorId);
            if (!advisor) continue;

            const assignment = APP_STATE.rotationAssignments.get(advisorId);
            
            // If no assignment, add a blank row
            if (!assignment || !assignment.rotation_name || !assignment.start_date) {
                scheduledRows.push({ name: advisor.name, segments: [] });
                continue;
            }

            // 1. Get the rotation pattern
            const pattern = APP_STATE.rotationPatterns.get(assignment.rotation_name);
            if (!pattern) {
                scheduledRows.push({ name: advisor.name, segments: [] }); // Pattern deleted?
                continue;
            }

            // 2. Find the effective week (1-6)
            const weekNum = getEffectiveWeek(assignment.start_date, plannerDateISO);
            const weekKey = `week${weekNum}`;
            
            // 3. Get the shift code for that day (e.g., "7A")
            const shiftCode = pattern.pattern?.[weekKey]?.[dayKey];
            if (!shiftCode || shiftCode === "RDO") {
                scheduledRows.push({ name: advisor.name, segments: [] }); // Day off
                continue;
            }

            // 4. Get the shift template details
            const template = APP_STATE.shiftTemplates.get(shiftCode);
            if (!template) {
                scheduledRows.push({ name: advisor.name, segments: [] }); // Unknown code
                continue;
            }

            // 5. Build segments (shift, breaks, lunch)
            const segments = [];
            const workStart = timeToMinutes(template.start_time);
            const workEnd = timeToMinutes(template.end_time);

            if (workStart === null || workEnd === null || workEnd <= workStart) {
                scheduledRows.push({ name: advisor.name, segments: [] }); // Invalid template
                continue;
            }
            
            // Add work segment
            segments.push({
                code: shiftCode,
                start: workStart,
                end: workEnd,
                cssClass: 'c-email' // Default class, can be improved
            });
            
            // Add breaks/lunch
            if (template.break1) {
                const start = timeToMinutes(template.break1);
                if (start) segments.push({ code: 'Break', start, end: start + 15, cssClass: 'c-break' });
            }
            if (template.lunch) {
                const start = timeToMinutes(template.lunch);
                if (start) segments.push({ code: 'Lunch', start, end: start + 30, cssClass: 'c-lunch' });
            }
            if (template.break2) {
                const start = timeToMinutes(template.break2);
                if (start) segments.push({ code: 'Break', start, end: start + 15, cssClass: 'c-break' });
            }

            scheduledRows.push({ name: advisor.name, segments });
        }

        // Sort rows by name
        scheduledRows.sort((a, b) => a.name.localeCompare(b.name));
        return scheduledRows;
    }

    // ========================================================================
    //      UI: HISTORY (Undo/Redo)
    // ========================================================================

    /**
     * Saves the current state of `rotationAssignments` to the history buffer.
     */
    function saveHistory() {
        if (APP_STATE.isUndoing) return; // Don't save history *while* undoing

        const currentState = JSON.stringify(Array.from(APP_STATE.rotationAssignments.entries()));

        // If current state is same as last state, do nothing
        if (APP_STATE.historyIndex > -1 && APP_STATE.history[APP_STATE.historyIndex] === currentState) {
            return;
        }
        
        // Truncate history if we've undone
        APP_STATE.history = APP_STATE.history.slice(0, APP_STATE.historyIndex + 1);
        
        // Add new state
        APP_STATE.history.push(currentState);
        
        // Limit history size
        if (APP_STATE.history.length > 20) {
            APP_STATE.history.shift();
        }
        
        APP_STATE.historyIndex = APP_STATE.history.length - 1;
        
        updateUndoRedoButtons();
    }
    global.saveHistory = saveHistory;

    /**
     * Restores the previous state from history.
     */
    function undo() {
        if (APP_STATE.historyIndex <= 0) return; // Nothing to undo

        APP_STATE.isUndoing = true;
        APP_STATE.historyIndex--;
        
        const oldState = JSON.parse(APP_STATE.history[APP_STATE.historyIndex]);
        APP_STATE.rotationAssignments = new Map(oldState);
        
        // Re-render the assignment table (which triggers planner render)
        populateAdvisorAssignmentTable();
        refreshAllUI();
        
        updateUndoRedoButtons();
        APP_STATE.isUndoing = false;
    }
    global.undo = undo;

    /**
     * Restores the next state from history.
     */
    function redo() {
        if (APP_STATE.historyIndex >= APP_STATE.history.length - 1) return; // Nothing to redo
        
        APP_STATE.isUndoing = true;
        APP_STATE.historyIndex++;

        const newState = JSON.parse(APP_STATE.history[APP_STATE.historyIndex]);
        APP_STATE.rotationAssignments = new Map(newState);

        // Re-render
        populateAdvisorAssignmentTable();
        refreshAllUI();
        
        updateUndoRedoButtons();
        APP_STATE.isUndoing = false;
    }
    global.redo = redo;

    /**
     * Updates the disabled state of the Undo/Redo buttons.
     */
    function updateUndoRedoButtons() {
        const btnUndo = $('#btnUndo');
        const btnRedo = $('#btnRedo');
        if (btnUndo) btnUndo.disabled = APP_STATE.historyIndex <= 0;
        if (btnRedo) btnRedo.disabled = APP_STATE.historyIndex >= APP_STATE.history.length - 1;
    }
    global.updateUndoRedoButtons = updateUndoRedoButtons;


})(window);


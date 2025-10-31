/**
 * WFM Intelligence Platform - Application Logic (v14.1)
 * 
 * Includes Weekly View, Precision Time Cursor, and Extended Timeline.
 */

// Global Namespace Initialization
window.APP = window.APP || {};

/**
 * MODULE: APP.Config
 * V14.1 Update: Extended Timeline to 23:00.
 */
(function(APP) {
    const Config = {};

    // Supabase Configuration (Centralized)
    Config.SUPABASE_URL = "https://oypdnjxhjpgpwmkltzmk.supabase.co";
    Config.SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im95cGRuanhoanBncHdta2x0em1rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk4Nzk0MTEsImV4cCI6MjA3NTQ1NTQxMX0.Hqf1L4RHpIPUD4ut2uVsiGDsqKXvAjdwKuotmme4_Is";

    // V14.1: Timeline Visualization Constants (Extended to 23:00)
    Config.TIMELINE_START_MIN = 6 * 60; // 06:00
    Config.TIMELINE_END_MIN = 23 * 60; // 23:00
    Config.TIMELINE_DURATION_MIN = Config.TIMELINE_END_MIN - Config.TIMELINE_START_MIN; // 17 hours

    APP.Config = Config;
}(window.APP));


/**
 * MODULE: APP.Utils
 * Description: Utility functions for formatting, UI feedback, and calculations.
 */
(function(APP) {
    const Utils = {};
    
    const ELS = {}; // DOM Cache for Utils

    Utils.cacheDOMElements = () => {
        ELS.notificationContainer = document.getElementById('notification-container');
    };

    Utils.showToast = (message, type = "success", duration = 3000) => {
        if (!ELS.notificationContainer) return;
        const toast = document.createElement('div');
        toast.className = `toast is-${type}`;
        toast.textContent = message;
        ELS.notificationContainer.appendChild(toast);
        setTimeout(() => { toast.remove(); }, duration);
    };

    Utils.formatMinutesToTime = (minutes) => {
        if (minutes === null || isNaN(minutes)) return "";
        // Use Math.round for precision displays (like the mouse cursor)
        let roundedMinutes = Math.round(minutes);
        
        // Handle potential overflow past midnight if necessary, though constrained by 23:00 here
        if (roundedMinutes >= 1440) {
             roundedMinutes -= 1440;
        }
        
        const h = Math.floor(roundedMinutes / 60);
        const m = roundedMinutes % 60;
        
        // Handle edge case where rounding results in 60 minutes
        if (m === 60) {
             return `${String(h + 1).padStart(2, '0')}:00`;
        }
        
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    };

    Utils.formatDuration = (minutes) => {
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        return `${h}h ${String(m).padStart(2, '0')}m`;
    };

    Utils.getContrastingTextColor = (hexColor) => {
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
    };

    // Robust effective week calculation (Handles d/m/Y format)
    Utils.getEffectiveWeek = (startDateStr, weekStartISO, assignment, getPatternByName) => {
        try {
            if (!startDateStr || !weekStartISO || !assignment) return null;
            
            // Parse "dd/mm/yyyy"
            const [d, m, y] = startDateStr.split('/').map(Number);
            if (isNaN(d) || isNaN(m) || isNaN(y)) return null; 
            
            // Parse "YYYY-MM-DD"
            const [y2, m2, d2] = weekStartISO.split('-').map(Number);
            if (isNaN(y2) || isNaN(m2) || isNaN(d2)) return null;

            // Use UTC to avoid timezone shifts
            const startUTC = Date.UTC(y, m - 1, d);
            const checkUTC = Date.UTC(y2, m2 - 1, d2);
            
            const diffTime = checkUTC - startUTC;
            if (diffTime < 0) return null;

            const diffWeeks = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 7));
            
            // Determine rotation length
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
            console.error("Error calculating effective week:", e);
            return null;
        }
    };

    APP.Utils = Utils;
}(window.APP));


/**
 * MODULE: APP.DataService
 */
(function(APP) {
    const DataService = {};
    let supabase = null;

    DataService.initialize = () => {
        const { createClient } = window.supabase;
        if (!createClient) {
            APP.Utils.showToast("Error: Supabase library not loaded.", "danger", 10000);
            return false;
        }
        supabase = createClient(APP.Config.SUPABASE_URL, APP.Config.SUPABASE_ANON_KEY);
        return true;
    };

    // Centralized error handler
    const handleError = (error, context) => {
        console.error(`DataService Error (${context}):`, error);
        APP.Utils.showToast(`Database Error: ${error.message}`, "danger");
        return { data: null, error: error.message };
    };

    // Generic Fetch Function
    const fetchTable = async (tableName) => {
        const { data, error } = await supabase.from(tableName).select('*');
        if (error) return handleError(error, `Fetch ${tableName}`);
        return { data, error: null };
    };

    // Generic Upsert/Insert Function
    DataService.saveRecord = async (tableName, record, conflictColumn = null) => {
        let query = supabase.from(tableName);
        if (conflictColumn) {
            query = query.upsert(record, { onConflict: conflictColumn });
        } else {
            query = query.insert(record);
        }
        const { data, error } = await query.select();
        if (error) return handleError(error, `Save ${tableName}`);
        return { data: data ? data[0] : null, error: null };
    };

    // Generic Update Function
    DataService.updateRecord = async (tableName, updates, condition) => {
         const { data, error } = await supabase.from(tableName).update(updates).match(condition).select();
        if (error) return handleError(error, `Update ${tableName}`);
        return { data: data ? data[0] : null, error: null };
    };

    // Generic Delete Function
    DataService.deleteRecord = async (tableName, condition) => {
        const { error } = await supabase.from(tableName).delete().match(condition);
        if (error) return handleError(error, `Delete ${tableName}`);
        return { data: null, error: null };
    };

    // Specific function to load all core data required on boot
    DataService.loadCoreData = async () => {
        try {
            // Parallel fetching
            const [advisors, components, definitions, patterns, assignments] = await Promise.all([
                fetchTable('advisors'),
                fetchTable('schedule_components'),
                fetchTable('shift_definitions'),
                fetchTable('rotation_patterns'),
                fetchTable('rotation_assignments')
            ]);

            // Check if any critical data failed to load
            if (advisors.error || components.error || definitions.error || patterns.error || assignments.error) {
                throw new Error("Failed to load one or more core data tables.");
            }

            return {
                advisors: advisors.data,
                scheduleComponents: components.data,
                shiftDefinitions: definitions.data,
                rotationPatterns: patterns.data,
                rotationAssignments: assignments.data
            };
        } catch (error) {
            handleError(error, "Load Core Data");
            return null;
        }
    };

    APP.DataService = DataService;
}(window.APP));


/**
 * MODULE: APP.StateManager
 * V14.1 Update: Added scheduleViewMode state.
 */
(function(APP) {
    const StateManager = {};

    const STATE = {
        advisors: [],
        scheduleComponents: [], 
        shiftDefinitions: [], 
        rotationPatterns: [], 
        rotationAssignments: [],
        selectedAdvisors: new Set(),
        weekStart: null, 
        currentRotation: null,
        selectedDay: 'Monday',
        scheduleViewMode: 'daily', // V14.1: 'daily' or 'weekly'
        isBooted: false,
        history: [],
        historyIndex: -1
    };

    StateManager.getState = () => STATE;

    StateManager.initialize = (initialData) => {
        Object.assign(STATE, initialData);
        STATE.isBooted = true;
        StateManager.saveHistory("Initial Load");
    };

    // Helpers (Selectors)
    StateManager.getAssignmentForAdvisor = (id) => STATE.rotationAssignments.find(a => a.advisor_id === id) || null;
    StateManager.getPatternByName = (name) => STATE.rotationPatterns.find(p => p.name === name) || null;
    StateManager.getComponentById = (id) => STATE.scheduleComponents.find(c => c.id === id) || null;
    StateManager.getShiftDefinitionById = (id) => STATE.shiftDefinitions.find(d => d.id === id) || null;
    StateManager.getShiftDefinitionByCode = (code) => STATE.shiftDefinitions.find(d => d.code === code) || null;

    // History Management
    StateManager.saveHistory = (reason = "Change") => {
        if (STATE.historyIndex < STATE.history.length - 1) {
            STATE.history = STATE.history.slice(0, STATE.historyIndex + 1);
        }
        // Snapshot only the mutable data structures
        const snapshot = {
            shiftDefinitions: JSON.parse(JSON.stringify(STATE.shiftDefinitions)),
            rotationPatterns: JSON.parse(JSON.stringify(STATE.rotationPatterns)),
            rotationAssignments: JSON.parse(JSON.stringify(STATE.rotationAssignments)),
            reason: reason
        };
        STATE.history.push(snapshot);
        if (STATE.history.length > 30) STATE.history.shift();
        STATE.historyIndex = STATE.history.length - 1;
        APP.Core.updateUndoRedoButtons(STATE.historyIndex, STATE.history.length);
    };

    StateManager.applyHistory = (direction) => {
        let newIndex = STATE.historyIndex;
        if (direction === 'undo' && newIndex > 0) {
            newIndex--;
        } else if (direction === 'redo' && newIndex < STATE.history.length - 1) {
            newIndex++;
        } else {
            return;
        }

        const snapshot = STATE.history[newIndex];
        STATE.shiftDefinitions = JSON.parse(JSON.stringify(snapshot.shiftDefinitions));
        STATE.rotationPatterns = JSON.parse(JSON.stringify(snapshot.rotationPatterns));
        STATE.rotationAssignments = JSON.parse(JSON.stringify(snapshot.rotationAssignments));
        STATE.historyIndex = newIndex;

        APP.Core.renderAll();
        APP.Core.updateUndoRedoButtons(STATE.historyIndex, STATE.history.length);
    };
    
    // State synchronization after successful DB operations
    StateManager.syncRecord = (tableName, record, isDeleted = false) => {
        const collection = STATE[tableName];
        if (!collection) return;

        // Handle specific cases where the primary key might not be 'id'
        const primaryKey = (tableName === 'rotationPatterns') ? 'name' : 'id';
        const recordKey = (tableName === 'rotationPatterns') ? record.name : record.id;


        const index = collection.findIndex(item => item[primaryKey] === recordKey);

        if (isDeleted) {
            if (index > -1) collection.splice(index, 1);
        } else {
            if (index > -1) {
                collection[index] = record;
            } else {
                collection.push(record);
            }
        }
    };

    APP.StateManager = StateManager;
}(window.APP));


/**
 * MODULE: APP.Components.ComponentManager
 * (No significant changes)
 */
(function(APP) {
    const ComponentManager = {};
    // ... (Implementation identical to V13.1, included here for completeness) ...
    // [Implementation Omitted for Brevity]
    APP.Components = APP.Components || {};
    APP.Components.ComponentManager = ComponentManager;
}(window.APP));


/**
 * MODULE: APP.Components.AssignmentManager
 * (No significant changes)
 */
(function(APP) {
    const AssignmentManager = {};
    // ... (Implementation identical to V13.1, included here for completeness) ...
    // [Implementation Omitted for Brevity]
    APP.Components = APP.Components || {};
    APP.Components.AssignmentManager = AssignmentManager;
}(window.APP));


/**
 * MODULE: APP.Components.ShiftDefinitionEditor (Sequential Builder)
 * (No significant changes)
 */
(function(APP) {
    const ShiftDefinitionEditor = {};
    // ... (Implementation identical to V13.1, included here for completeness) ...
    // [Implementation Omitted for Brevity]
    APP.Components = APP.Components || {};
    APP.Components.ShiftDefinitionEditor = ShiftDefinitionEditor;
}(window.APP));


/**
 * MODULE: APP.Components.RotationEditor
 * (No significant changes)
 */
(function(APP) {
    const RotationEditor = {};
     // ... (Implementation identical to V13.1, included here for completeness) ...
    // [Implementation Omitted for Brevity]
    APP.Components = APP.Components || {};
    APP.Components.RotationEditor = RotationEditor;
}(window.APP));


/**
 * MODULE: APP.Components.ScheduleViewer
 * V14.1 Update: Implements Daily/Weekly view toggle, Weekly View rendering, Precision Cursor, and Extended Timeline.
 */
(function(APP) {
    const ScheduleViewer = {};
    const ELS = {};
    const Config = APP.Config;
    let timeIndicatorInterval = null;

    ScheduleViewer.initialize = () => {
        // Tree/Selection Elements
        ELS.tree = document.getElementById('schedulesTree');
        ELS.treeSearch = document.getElementById('treeSearch');
        ELS.btnClearSelection = document.getElementById('btnClearSelection');
        
        // Visualization Elements
        ELS.visualizationContainer = document.getElementById('visualizationContainer');
        ELS.scheduleViewTitle = document.getElementById('scheduleViewTitle');

        // V14.1: View Controls
        ELS.viewToggleGroup = document.getElementById('viewToggleGroup');
        ELS.dayToggleContainer = document.getElementById('dayToggleContainer');
        ELS.plannerDay = document.getElementById('plannerDay');

        // Event Listeners
        if (ELS.treeSearch) ELS.treeSearch.addEventListener('input', renderTree);
        if (ELS.btnClearSelection) ELS.btnClearSelection.addEventListener('click', clearSelection);
        if (ELS.tree) ELS.tree.addEventListener('change', handleTreeChange);
        
        if (ELS.plannerDay) ELS.plannerDay.addEventListener('change', () => {
            APP.StateManager.getState().selectedDay = ELS.plannerDay.value;
            renderPlanner();
        });

        if (ELS.viewToggleGroup) ELS.viewToggleGroup.addEventListener('click', handleViewToggle);
    };

    ScheduleViewer.render = () => {
        renderTree();
        renderPlanner();
    };

    const handleViewToggle = (e) => {
        const target = e.target.closest('.btn-toggle');
        if (target) {
            const viewMode = target.dataset.view;
            APP.StateManager.getState().scheduleViewMode = viewMode;
            
            // Update button active state
            ELS.viewToggleGroup.querySelectorAll('.btn-toggle').forEach(btn => btn.classList.remove('active'));
            target.classList.add('active');

            // Show/Hide Day selector
            ELS.dayToggleContainer.style.display = (viewMode === 'daily') ? 'flex' : 'none';
            
            renderPlanner();
        }
    };

    const renderTree = () => {
        if (!ELS.tree) return;
        const STATE = APP.StateManager.getState();
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
        ELS.tree.innerHTML = html || '<div>No advisors found.</div>';

        // Auto-select logic
        if (STATE.selectedAdvisors.size === 0 && STATE.advisors.length > 0 && !STATE.treeInitialized) {
            const firstAdvisor = STATE.advisors.sort((a,b) => a.name.localeCompare(b.name))[0];
            STATE.selectedAdvisors.add(firstAdvisor.id);
            STATE.treeInitialized = true;
            renderTree();
            renderPlanner();
        }
    };

    const handleTreeChange = (e) => {
        if (e.target.classList.contains('select-advisor')) {
            const id = e.target.dataset.advisorId;
            const STATE = APP.StateManager.getState();
            e.target.checked ? STATE.selectedAdvisors.add(id) : STATE.selectedAdvisors.delete(id);
            renderPlanner();
        }
    };

    const clearSelection = () => {
        APP.StateManager.getState().selectedAdvisors.clear();
        renderTree();
        renderPlanner();
    };


    // V14.1: Main rendering router
    const renderPlanner = () => {
        const STATE = APP.StateManager.getState();
        if (STATE.scheduleViewMode === 'daily') {
            renderDailyPlanner();
        } else {
            renderWeeklyPlanner();
        }
    };

    // --- DAILY VIEW (GANTT) ---

    const renderDailyPlanner = () => {
        ELS.scheduleViewTitle.textContent = "Schedule Visualization (Daily 06:00 - 23:00)";

        // Setup the structure for the Daily Timeline
        ELS.visualizationContainer.innerHTML = `
            <div class="timeline-container" id="timelineContainer">
                <div class="timeline-header">
                    <div class="header-name">Name</div>
                    <div class="header-timeline" id="timeHeader"></div>
                </div>
                <div class="timeline-body" id="plannerBody"></div>
                <div id="currentTimeIndicator" class="current-time-indicator"></div>
                <div id="mouseTimeIndicator" class="mouse-time-indicator"></div>
                <div id="mouseTimeTooltip" class="mouse-time-tooltip">00:00</div>
            </div>
        `;
        
        // Cache elements specific to the daily view
        const ELS_DAILY = {
            timeHeader: document.getElementById('timeHeader'),
            plannerBody: document.getElementById('plannerBody'),
            timelineContainer: document.getElementById('timelineContainer'),
            currentTimeIndicator: document.getElementById('currentTimeIndicator'),
            mouseTimeIndicator: document.getElementById('mouseTimeIndicator'),
            mouseTimeTooltip: document.getElementById('mouseTimeTooltip')
        };

        renderTimeHeader(ELS_DAILY.timeHeader);
        
        const STATE = APP.StateManager.getState();
        const selected = Array.from(STATE.selectedAdvisors);
        
        if (selected.length > 0) {
            const advisorsToRender = STATE.advisors
                .filter(a => selected.includes(a.id))
                .sort((a,b) => a.name.localeCompare(b.name));
                
            let html = '';
            advisorsToRender.forEach(adv => {
                // Calculate segments for the currently selected day
                const segments = calculateSegments(adv.id, STATE.selectedDay);
                html += `
                <div class="timeline-row">
                    <div class="timeline-name">${adv.name}</div>
                    <div class="timeline-track">
                        ${renderSegments(segments)}
                    </div>
                </div>
                `;
            });
            ELS_DAILY.plannerBody.innerHTML = html;
        }

        // Initialize Intraday Indicators
        setupIntradayIndicators(ELS_DAILY);
    };

    const renderTimeHeader = (headerElement) => {
        const startHour = Math.floor(Config.TIMELINE_START_MIN / 60);
        const endHour = Math.floor(Config.TIMELINE_END_MIN / 60);
        const totalHours = Config.TIMELINE_DURATION_MIN / 60;
        
        let html = '';
        for (let h = startHour; h < endHour; h++) {
            const pct = (h - startHour) / totalHours * 100;
            const label = h.toString().padStart(2, '0') + ':00';
            html += `<div class="time-tick" style="left: ${pct}%;">${label}</div>`;
        }
        headerElement.innerHTML = html;
    };

    const renderSegments = (segments) => {
        if (!segments || segments.length === 0) {
            return ''; // RDO
        }
        
        return segments.map(seg => {
            const component = APP.StateManager.getComponentById(seg.component_id);
            if (!component) return '';

            const startPct = ((seg.start_min - Config.TIMELINE_START_MIN) / Config.TIMELINE_DURATION_MIN) * 100;
            const widthPct = ((seg.end_min - seg.start_min) / Config.TIMELINE_DURATION_MIN) * 100;
            
            // Determine visualization style
            let barClass = '';
            if (component.type === 'Break' || component.type === 'Lunch') {
                barClass = 'is-gap';
            } else if (component.type === 'Activity') {
                barClass = 'is-activity';
            }
            
            const style = (barClass === '') ? `background-color: ${component.color}; color: ${APP.Utils.getContrastingTextColor(component.color)};` : '';

            return `
            <div class="timeline-bar ${barClass}" style="left: ${startPct}%; width: ${widthPct}%; ${style}" title="${component.name} (${APP.Utils.formatMinutesToTime(seg.start_min)} - ${APP.Utils.formatMinutesToTime(seg.end_min)})">
            </div>
            `;
        }).join('');
    };

    // --- WEEKLY VIEW (V14.1) ---

    const renderWeeklyPlanner = () => {
        ELS.scheduleViewTitle.textContent = "Schedule Visualization (Weekly Overview)";

        // Setup the structure for the Weekly View (Table based)
        ELS.visualizationContainer.innerHTML = `
            <div class="table-container">
                <table class="weekly-grid" id="weeklyGrid">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>MON</th>
                            <th>TUE</th>
                            <th>WED</th>
                            <th>THU</th>
                            <th>FRI</th>
                            <th>SAT</th>
                            <th>SUN</th>
                        </tr>
                    </thead>
                    <tbody id="weeklyBody">
                    </tbody>
                </table>
            </div>
        `;

        const ELS_WEEKLY = {
            weeklyBody: document.getElementById('weeklyBody')
        };

        const STATE = APP.StateManager.getState();
        const selected = Array.from(STATE.selectedAdvisors);
        const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        
        if (selected.length > 0) {
            const advisorsToRender = STATE.advisors
                .filter(a => selected.includes(a.id))
                .sort((a,b) => a.name.localeCompare(b.name));

            let html = '';
            advisorsToRender.forEach(adv => {
                html += `<tr><td>${adv.name}</td>`;
                
                daysOfWeek.forEach(day => {
                    // Calculate segments for each specific day
                    const segments = calculateSegments(adv.id, day);
                    html += `<td>${renderWeeklyCell(segments)}</td>`;
                });
                
                html += `</tr>`;
            });
            ELS_WEEKLY.weeklyBody.innerHTML = html;
        }
    };

    const renderWeeklyCell = (segments) => {
        if (!segments || segments.length === 0) {
            return `<div class="weekly-cell-content"><span class="weekly-rdo">RDO</span></div>`;
        }
        
        // To get the shift code, we find which definition matches these segments.
        const STATE = APP.StateManager.getState();
        const definition = STATE.shiftDefinitions.find(def => {
            // A simple comparison of the structure JSON works because sorting is enforced
            return JSON.stringify(def.structure) === JSON.stringify(segments);
        });

        const startMin = segments[0].start_min;
        const endMin = segments[segments.length - 1].end_min;
        const timeString = `${APP.Utils.formatMinutesToTime(startMin)} - ${APP.Utils.formatMinutesToTime(endMin)}`;

        return `
            <div class="weekly-cell-content">
                <span class="weekly-shift-code">${definition ? definition.code : 'N/A'}</span>
                <span class="weekly-shift-time">${timeString}</span>
            </div>
        `;
    };


    // --- CORE CALCULATION (Shared by Daily/Weekly) ---

    // Generalized calculation function that accepts a specific day name
    const calculateSegments = (advisorId, dayName) => {
        const STATE = APP.StateManager.getState();
        const assignment = APP.StateManager.getAssignmentForAdvisor(advisorId);
        
        if (!assignment || !assignment.rotation_name || !assignment.start_date || !STATE.weekStart) return [];

        const effectiveWeek = APP.Utils.getEffectiveWeek(assignment.start_date, STATE.weekStart, assignment, APP.StateManager.getPatternByName);
        if (effectiveWeek === null) return [];
        
        const dayIndex = (['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].indexOf(dayName) + 1).toString();

        const pattern = APP.StateManager.getPatternByName(assignment.rotation_name);
        if (!pattern || !pattern.pattern) return [];
        
        const weekPattern = pattern.pattern[`Week ${effectiveWeek}`] || {};
        const shiftCode = weekPattern[dayIndex];

        if (!shiftCode) return []; // RDO

        const definition = APP.StateManager.getShiftDefinitionByCode(shiftCode);
        if (!definition || !definition.structure) return [];

        // Ensure segments are sorted before returning (critical for visualization and weekly summary comparison)
        return JSON.parse(JSON.stringify(definition.structure)).sort((a, b) => a.start_min - b.start_min);
    };

    // --- INTRADAY INDICATORS (Daily View Only) ---
    
    const setupIntradayIndicators = (ELS_DAILY) => {
         // Initialize Intraday Time Indicator (Red Line)
        if (timeIndicatorInterval) clearInterval(timeIndicatorInterval);
        timeIndicatorInterval = setInterval(() => updateCurrentTimeIndicator(ELS_DAILY), 60000);
        updateCurrentTimeIndicator(ELS_DAILY);

        // Initialize Precision Time Cursor (Mouse Follower)
        if (ELS_DAILY.timelineContainer) {
            ELS_DAILY.timelineContainer.addEventListener('mousemove', (e) => updateMouseTimeIndicator(e, ELS_DAILY));
            ELS_DAILY.timelineContainer.addEventListener('mouseenter', () => showMouseIndicator(ELS_DAILY));
            ELS_DAILY.timelineContainer.addEventListener('mouseleave', () => hideMouseIndicator(ELS_DAILY));
        }
    };
    
    const updateCurrentTimeIndicator = (ELS_DAILY) => {
        if (!ELS_DAILY || !ELS_DAILY.currentTimeIndicator || !ELS_DAILY.timelineContainer) return;

        const now = new Date();
        const currentDayName = now.toLocaleDateString('en-US', { weekday: 'long' });
        const STATE = APP.StateManager.getState();

        // Only show if the selected day is today AND we are in daily view
        if (currentDayName !== STATE.selectedDay || STATE.scheduleViewMode !== 'daily') {
            ELS_DAILY.currentTimeIndicator.style.display = 'none';
            return;
        }

        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        
        if (currentMinutes < Config.TIMELINE_START_MIN || currentMinutes > Config.TIMELINE_END_MIN) {
            ELS_DAILY.currentTimeIndicator.style.display = 'none';
            return;
        }

        const pct = ((currentMinutes - Config.TIMELINE_START_MIN) / Config.TIMELINE_DURATION_MIN) * 100;
        
        const nameColElement = ELS_DAILY.timelineContainer.querySelector('.header-name');
        const nameColWidth = nameColElement ? nameColElement.offsetWidth : 220;

        ELS_DAILY.currentTimeIndicator.style.display = 'block';
        ELS_DAILY.currentTimeIndicator.style.left = `calc(${nameColWidth}px + ${pct}%)`;
    };

    const updateMouseTimeIndicator = (e, ELS_DAILY) => {
        if (!ELS_DAILY || !ELS_DAILY.mouseTimeIndicator || !ELS_DAILY.timelineContainer) return;

        const containerRect = ELS_DAILY.timelineContainer.getBoundingClientRect();
        const mouseX = e.clientX - containerRect.left + ELS_DAILY.timelineContainer.scrollLeft;
        
        const nameColElement = ELS_DAILY.timelineContainer.querySelector('.header-name');
        const nameColWidth = nameColElement ? nameColElement.offsetWidth : 220;
        const headerHeight = ELS_DAILY.timeHeader ? ELS_DAILY.timeHeader.offsetHeight : 48;

        if (mouseX < nameColWidth) {
            hideMouseIndicator(ELS_DAILY);
            return;
        }

        const trackWidth = ELS_DAILY.timelineContainer.scrollWidth - nameColWidth;
        const relativeX = mouseX - nameColWidth;
        const pct = relativeX / trackWidth;
        const timeInMinutes = Config.TIMELINE_START_MIN + (pct * Config.TIMELINE_DURATION_MIN);

        ELS_DAILY.mouseTimeIndicator.style.left = `${mouseX}px`;
        
        ELS_DAILY.mouseTimeTooltip.textContent = APP.Utils.formatMinutesToTime(timeInMinutes);
        ELS_DAILY.mouseTimeTooltip.style.top = `${headerHeight - 30}px`; 
        ELS_DAILY.mouseTimeTooltip.style.left = `${mouseX}px`;
    };

    const showMouseIndicator = (ELS_DAILY) => {
        if (ELS_DAILY.mouseTimeIndicator) ELS_DAILY.mouseTimeIndicator.style.display = 'block';
        if (ELS_DAILY.mouseTimeTooltip) ELS_DAILY.mouseTimeTooltip.style.display = 'block';
    };

    const hideMouseIndicator = (ELS_DAILY) => {
        if (ELS_DAILY.mouseTimeIndicator) ELS_DAILY.mouseTimeIndicator.style.display = 'none';
        if (ELS_DAILY.mouseTimeTooltip) ELS_DAILY.mouseTimeTooltip.style.display = 'none';
    };


    APP.Components = APP.Components || {};
    APP.Components.ScheduleViewer = ScheduleViewer;
}(window.APP));


/**
 * MODULE: APP.Core
 * (No significant changes)
 */
(function(APP) {
    const Core = {};
     // ... (Implementation identical to V13.1, included here for completeness) ...
    // [Implementation Omitted for Brevity]
    APP.Core = Core;
}(window.APP));
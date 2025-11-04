/**
 * WFM Intelligence Platform - Application Logic (v15.5.2)
 * 
 * V15.5.2: STABILITY FIX: Added robust null checks in SequentialBuilder.open/initialize 
 *          to prevent crashes if index.html is truncated/incomplete (e.g., missing modalStartTime).
 * V15.5.1: CRITICAL FIX: Robust Rotation Parsing.
 * V15.1: Implementation of Phase 2 (Live Editing, Exceptions), Finite Rotations (06:00-20:00).
 */

// Global Namespace Initialization
window.APP = window.APP || {};

/**
 * MODULE: APP.Config
 */
(function(APP) {
    const Config = {};

    // Supabase Configuration (Centralized)
    // SECURITY NOTE: RLS should be enabled on the Supabase tables in production.
    Config.SUPABASE_URL = "https://oypdnjxhjpgpwmkltzmk.supabase.co";
    Config.SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im95cGRuanhoanBncHdta2x0em1rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk4Nzk0MTEsImV4cCI6MjA3NTQ1NTQxMX0.Hqf1L4RHpIPUD4ut2uVsiGDsqKXvAjdwKuotmme4_Is";

    // Timeline Visualization Constants (V15.1: Adjusted to 06:00-20:00)
    Config.TIMELINE_START_MIN = 6 * 60; // 06:00
    Config.TIMELINE_END_MIN = 20 * 60; // 20:00
    Config.TIMELINE_DURATION_MIN = Config.TIMELINE_END_MIN - Config.TIMELINE_START_MIN; // 14 hours

    APP.Config = Config;
}(window.APP));


/**
 * MODULE: APP.Utils
 * Utility functions for date handling, formatting, and UI feedback.
 */
(function(APP) {
    const Utils = {};
    
    const ELS = {}; // DOM Cache for Utils

    Utils.cacheDOMElements = () => {
        ELS.notificationContainer = document.getElementById('notification-container');
    };

    // Display a toast notification
    Utils.showToast = (message, type = "success", duration = 3000) => {
        if (!ELS.notificationContainer) return;
        const toast = document.createElement('div');
        toast.className = `toast is-${type}`;
        toast.textContent = message;
        ELS.notificationContainer.appendChild(toast);
        // Auto-remove the toast
        setTimeout(() => { 
            if (ELS.notificationContainer && toast.parentNode === ELS.notificationContainer) {
                ELS.notificationContainer.removeChild(toast);
            }
        }, duration);
    };

    // Format minutes since midnight (e.g., 480) to HH:MM (e.g., "08:00")
    Utils.formatMinutesToTime = (minutes) => {
        if (minutes === null || isNaN(minutes)) return "";
        let roundedMinutes = Math.round(minutes);
        
        // Handle times past midnight gracefully for display
        if (roundedMinutes >= 1440) {
             roundedMinutes -= 1440;
        }
        
        const h = Math.floor(roundedMinutes / 60);
        const m = roundedMinutes % 60;
        
        // Handle rounding resulting in 60 minutes
        if (m === 60) {
             return `${String(h + 1).padStart(2, '0')}:00`;
        }
        
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    };

    // Format duration in minutes (e.g., 90) to hours and minutes (e.g., "1h 30m")
    Utils.formatDuration = (minutes) => {
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        return `${h}h ${String(m).padStart(2, '0')}m`;
    };

    // Determine contrasting text color (black or white) based on background brightness
    Utils.getContrastingTextColor = (hexColor) => {
        if (!hexColor) return '#000000';
        try {
            const r = parseInt(hexColor.substr(1, 2), 16);
            const g = parseInt(hexColor.substr(3, 2), 16);
            const b = parseInt(hexColor.substr(5, 2), 16);
            // Formula for luminance perception
            const brightness = ((r * 299) + (g * 587) + (b * 114)) / 1000;
            return (brightness > 128) ? '#000000' : '#FFFFFF';
        } catch (e) {
            // Fallback if hex color is invalid
            return '#FFFFFF';
        }
    };

    // Converts dd/mm/yyyy (UK format) to yyyy-mm-dd (ISO format)
    Utils.convertUKToISODate = (ukDateStr) => {
        if (!ukDateStr) return null;
        const parts = ukDateStr.split('/');
        if (parts.length !== 3) return null;
        const d = parts[0].padStart(2, '0');
        const m = parts[1].padStart(2, '0');
        const y = parts[2];
        return `${y}-${m}-${d}`;
    };

    // V15.1: Converts yyyy-mm-dd (ISO format) to dd/mm/yyyy (UK format)
    Utils.convertISOToUKDate = (isoDateStr) => {
        if (!isoDateStr) return '';
        const parts = isoDateStr.split('-');
        if (parts.length !== 3) return isoDateStr;
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    };

    // V15.1: Get ISO date for a specific day name within a given week (defined by weekStartISO)
    Utils.getISODateForDayName = (weekStartISO, dayName) => {
        if (!weekStartISO) return null;
        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        const dayIndex = days.indexOf(dayName);
        if (dayIndex === -1) return null;

        const [y, m, d] = weekStartISO.split('-').map(Number);
        // Use local time calculation for visualization consistency
        const date = new Date(y, m - 1, d);
        date.setDate(date.getDate() + dayIndex);

        return Utils.formatDateToISO(date);
    };

    // V15.1: Helper to format Date object to YYYY-MM-DD
    Utils.formatDateToISO = (dateObj) => {
         const yyyy = dateObj.getFullYear();
        const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
        const dd = String(dateObj.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    };

    // V15.1: Helper to get the Monday ISO date for any given ISO date
    Utils.getMondayForDate = (isoDateStr) => {
        const [y, m, d] = isoDateStr.split('-').map(Number);
        const date = new Date(y, m - 1, d);
        const day = date.getDay();
        // Calculate difference to Monday (1 for Monday, 0 for Sunday)
        const diff = date.getDate() - day + (day === 0 ? -6 : 1); 
        const monday = new Date(date.setDate(diff));
        return Utils.formatDateToISO(monday);
    };


    // V15.1 FIX: Updated for FINITE (Non-Repeating) Rotations
    // Calculates the effective week number based on the assignment start date.
    Utils.getEffectiveWeek = (startDateISO, weekStartISO, assignment, getPatternByName) => {
        try {
            if (!startDateISO || !weekStartISO || !assignment) return null;
            
            // Robust parsing of "YYYY-MM-DD"
            const [y1, m1, d1] = startDateISO.split('-').map(Number);
            const [y2, m2, d2] = weekStartISO.split('-').map(Number);

            if (isNaN(y1) || isNaN(y2)) {
                 console.error("Failed to parse dates:", startDateISO, weekStartISO);
                 return null; 
            }
            
            // Use UTC to avoid timezone shifts affecting week boundaries
            const startUTC = Date.UTC(y1, m1 - 1, d1);
            const checkUTC = Date.UTC(y2, m2 - 1, d2);
            
            const diffTime = checkUTC - startUTC;
            
            // If the checked week is before the rotation's "Week 1 Day 1", it's invalid.
            if (diffTime < 0) return null;

            // Calculate the number of weeks elapsed since the start date (0-based index)
            const diffWeeks = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 7));
            
            // Determine rotation length
            const pattern = getPatternByName(assignment.rotation_name);
            let numWeeksInRotation = 6; // Default fallback
            if (pattern && pattern.pattern && Object.keys(pattern.pattern).length > 0) {
                const keys = Object.keys(pattern.pattern);
                // Robust method to find the max week number defined in the pattern
                // V15.5.1 FIX: Updated regex to support "Week1" and "Week 1" (optional space)
                const weekNumbers = keys.map(k => {
                    const match = k.match(/^Week ?(\d+)$/i);
                    return match ? parseInt(match[1], 10) : 0;
                });
                const maxWeek = Math.max(0, ...weekNumbers);

                if (maxWeek > 0) {
                    numWeeksInRotation = maxWeek;
                }
            }
                
            // V15.1 FIX: Check if the elapsed weeks exceed the rotation length.
            // If it does, the rotation is finished (Finite Rotation).
            if (diffWeeks >= numWeeksInRotation) {
                return null;
            }

            // Calculate the effective week number (1-based index)
            const effectiveWeek = diffWeeks + 1;
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
 * Handles all interactions with the Supabase backend.
 */
(function(APP) {
    const DataService = {};
    let supabase = null;

    // Initialize the Supabase client
    DataService.initialize = () => {
        if (typeof window.supabase === 'undefined' || !window.supabase.createClient) {
             APP.Utils.showToast("Error: Database library (Supabase) not loaded.", "danger", 10000);
            return false;
        }
        const { createClient } = window.supabase;

        supabase = createClient(APP.Config.SUPABASE_URL, APP.Config.SUPABASE_ANON_KEY);
        return true;
    };

    // Centralized error handling
    const handleError = (error, context) => {
        console.error(`DataService Error (${context}):`, error);
        APP.Utils.showToast(`Database Error: ${error.message}`, "danger");
        return { data: null, error: error.message };
    };

    // Generic table fetch
    const fetchTable = async (tableName) => {
        const { data, error } = await supabase.from(tableName).select('*');
        if (error) return handleError(error, `Fetch ${tableName}`);
        return { data, error: null };
    };

    // Generalized save/upsert function
    DataService.saveRecord = async (tableName, record, conflictColumn = null) => {
        let query = supabase.from(tableName);
        if (conflictColumn) {
            // V15.1: Use upsert for saving exceptions or assignments based on unique constraints
            query = query.upsert(record, { onConflict: conflictColumn });
        } else {
            query = query.insert(record);
        }
        // .select() ensures the saved record is returned
        const { data, error } = await query.select();
        if (error) return handleError(error, `Save ${tableName}`);
        // Return the saved record (first element of the returned array)
        return { data: data ? data[0] : null, error: null };
    };

    // Generalized update function
    DataService.updateRecord = async (tableName, updates, condition) => {
         const { data, error } = await supabase.from(tableName).update(updates).match(condition).select();
        if (error) return handleError(error, `Update ${tableName}`);
        return { data: data ? data[0] : null, error: null };
    };

    // Generalized delete function
    DataService.deleteRecord = async (tableName, condition) => {
        const { error } = await supabase.from(tableName).delete().match(condition);
        if (error) return handleError(error, `Delete ${tableName}`);
        return { data: null, error: null };
    };

    // V15.1: Load all necessary data tables
    DataService.loadCoreData = async () => {
        try {
            // Fetch tables in parallel for efficiency
            const [advisors, leaders, components, definitions, patterns, assignments, exceptions] = await Promise.all([
                fetchTable('advisors'),
                fetchTable('leaders'),
                fetchTable('schedule_components'),
                fetchTable('shift_definitions'),
                fetchTable('rotation_patterns'),
                fetchTable('rotation_assignments'),
                fetchTable('schedule_exceptions') // V15.1
            ]);

            // Check if any critical data failed to load
            if (advisors.error || leaders.error || components.error || definitions.error || patterns.error || assignments.error) {
                throw new Error("Failed to load one or more core data tables.");
            }

            // Handle exceptions table load failure gracefully
            if (exceptions.error) {
                 console.warn("Warning: Failed to load schedule_exceptions. Ensure V15 schema is applied.", exceptions.error);
                 // Continue initialization but without exception data
                 exceptions.data = [];
            }

            return {
                advisors: advisors.data,
                leaders: leaders.data,
                scheduleComponents: components.data,
                shiftDefinitions: definitions.data,
                rotationPatterns: patterns.data,
                rotationAssignments: assignments.data,
                scheduleExceptions: exceptions.data // V15.1
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
 * Manages the application's state, selectors, synchronization, and history (Undo/Redo).
 */
(function(APP) {
    const StateManager = {};

    // The central state object
    const STATE = {
        advisors: [],
        leaders: [],
        scheduleComponents: [], 
        shiftDefinitions: [], 
        rotationPatterns: [], 
        rotationAssignments: [],
        scheduleExceptions: [], // V15.1
        selectedAdvisors: new Set(),
        weekStart: null, // Stored internally as YYYY-MM-DD
        currentRotation: null,
        selectedDay: 'Monday',
        scheduleViewMode: 'daily',
        isBooted: false,
        history: [],
        historyIndex: -1
    };

    StateManager.getState = () => STATE;

    // Initialize state with data loaded from DataService
    StateManager.initialize = (initialData) => {
        Object.assign(STATE, initialData);
        STATE.isBooted = true;
        StateManager.saveHistory("Initial Load");
    };

    // Helpers (Selectors) - Efficient ways to query the state
    StateManager.getAssignmentForAdvisor = (id) => STATE.rotationAssignments.find(a => a.advisor_id === id) || null;
    StateManager.getPatternByName = (name) => STATE.rotationPatterns.find(p => p.name === name) || null;
    StateManager.getComponentById = (id) => STATE.scheduleComponents.find(c => c.id === id) || null;
    StateManager.getShiftDefinitionById = (id) => STATE.shiftDefinitions.find(d => d.id === id) || null;
    StateManager.getAdvisorById = (id) => STATE.advisors.find(a => a.id === id) || null; // V15.1

    // Robust lookup for shift codes (handles whitespace and type differences)
    StateManager.getShiftDefinitionByCode = (code) => {
        if (!code) return null;
        const trimmedCode = String(code).trim();
        return STATE.shiftDefinitions.find(d => (d.code && String(d.code).trim()) === trimmedCode) || null;
    };

    StateManager.getAdvisorsByLeader = (leaderId) => STATE.advisors.filter(a => a.leader_id === leaderId);

    // V15.1: Selector for Hybrid Adherence (Exceptions)
    StateManager.getExceptionForAdvisorDate = (advisorId, dateISO) => {
        return STATE.scheduleExceptions.find(e => e.advisor_id === advisorId && e.exception_date === dateISO) || null;
    };

    // History Management (V15.1: Updated to include exceptions)
    StateManager.saveHistory = (reason = "Change") => {
        // Clear forward history if we make a new change after undoing
        if (STATE.historyIndex < STATE.history.length - 1) {
            STATE.history = STATE.history.slice(0, STATE.historyIndex + 1);
        }
        // Create a snapshot of the mutable data structures (Deep Copy)
        const snapshot = {
            shiftDefinitions: JSON.parse(JSON.stringify(STATE.shiftDefinitions)),
            rotationPatterns: JSON.parse(JSON.stringify(STATE.rotationPatterns)),
            rotationAssignments: JSON.parse(JSON.stringify(STATE.rotationAssignments)),
            scheduleExceptions: JSON.parse(JSON.stringify(STATE.scheduleExceptions)), // V15.1
            reason: reason
        };
        STATE.history.push(snapshot);
        // Limit history stack size
        if (STATE.history.length > 30) STATE.history.shift();
        STATE.historyIndex = STATE.history.length - 1;
        
        // Update UI buttons
        if (APP.Core && APP.Core.updateUndoRedoButtons) {
             APP.Core.updateUndoRedoButtons(STATE.historyIndex, STATE.history.length);
        }
    };

    // Apply a history state (Undo/Redo)
    StateManager.applyHistory = (direction) => {
        let newIndex = STATE.historyIndex;
        if (direction === 'undo' && newIndex > 0) {
            newIndex--;
        } else if (direction === 'redo' && newIndex < STATE.history.length - 1) {
            newIndex++;
        } else {
            return;
        }

        // Restore state from snapshot (Deep Copy)
        const snapshot = STATE.history[newIndex];
        STATE.shiftDefinitions = JSON.parse(JSON.stringify(snapshot.shiftDefinitions));
        STATE.rotationPatterns = JSON.parse(JSON.stringify(snapshot.rotationPatterns));
        STATE.rotationAssignments = JSON.parse(JSON.stringify(snapshot.rotationAssignments));
        STATE.scheduleExceptions = JSON.parse(JSON.stringify(snapshot.scheduleExceptions)); // V15.1
        STATE.historyIndex = newIndex;

        // Re-render application and update UI
        if (APP.Core && APP.Core.renderAll && APP.Core.updateUndoRedoButtons) {
            APP.Core.renderAll();
            APP.Core.updateUndoRedoButtons(STATE.historyIndex, STATE.history.length);
        }
    };
    
    // State synchronization (Update local state after successful DB operations)
    StateManager.syncRecord = (tableName, record, isDeleted = false) => {
        
        // V15.1: Map DB table names to State keys
        let stateKey = null;
        switch (tableName) {
            case 'schedule_exceptions': stateKey = 'scheduleExceptions'; break;
            case 'shift_definitions': stateKey = 'shiftDefinitions'; break;
            case 'rotation_patterns': stateKey = 'rotationPatterns'; break;
            case 'rotation_assignments': stateKey = 'rotationAssignments'; break;
            case 'schedule_components': stateKey = 'scheduleComponents'; break;
            default: stateKey = tableName;
        }

        const collection = STATE[stateKey];
        if (!collection) return;

        // Determine primary key (patterns by name, assignments by advisor_id, else id)
        let primaryKey = 'id';
        if (tableName === 'rotation_patterns') primaryKey = 'name';
        if (tableName === 'rotation_assignments') primaryKey = 'advisor_id';

        
        if (!record.hasOwnProperty(primaryKey)) {
            console.error("SyncRecord failed: Record missing primary key", primaryKey, record);
            return;
        }
        
        const recordKey = record[primaryKey];
        const index = collection.findIndex(item => item[primaryKey] === recordKey);

        if (isDeleted) {
            if (index > -1) collection.splice(index, 1);
        } else {
            if (index > -1) {
                // Update existing record
                collection[index] = record;
            } else {
                // Add new record
                collection.push(record);
            }
        }
    };

    APP.StateManager = StateManager;
}(window.APP));


/**
 * MODULE: APP.Components.ComponentManager
 * Manages the CRUD operations for Schedule Components (Activities, Breaks, etc.).
 */
(function(APP) {
    const ComponentManager = {};
    const ELS = {};

    ComponentManager.initialize = () => {
        ELS.grid = document.getElementById('componentManagerGrid');
        ELS.btnNew = document.getElementById('btnNewComponent');

        if (ELS.btnNew) ELS.btnNew.addEventListener('click', handleNew);
        if (ELS.grid) ELS.grid.addEventListener('click', handleClick);
    };

    ComponentManager.render = () => {
        if (!ELS.grid) return;
        const STATE = APP.StateManager.getState();
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
        ELS.grid.innerHTML = html;
    };

    const handleNew = async () => {
        // Basic prompt-based input for simplicity
        const name = prompt("Enter component name (e.g., 'Email Support', 'Meeting'):");
        if (!name) return;
        const type = prompt("Enter type (Activity, Break, Lunch, Shrinkage, Absence):", "Activity");
        const color = prompt("Enter hex color code (e.g., '#3498db'):", "#3498db");
        const duration = parseInt(prompt("Enter default duration in minutes:", "60"), 10);
        const isPaid = confirm("Is this a paid activity?");

        if (!name || !type || !color || isNaN(duration)) {
            APP.Utils.showToast("Invalid input provided.", "danger");
            return;
        }

        const newComponent = { name, type, color, default_duration_min: duration, is_paid: isPaid };

        const { data, error } = await APP.DataService.saveRecord('schedule_components', newComponent);
        if (!error) {
            APP.StateManager.syncRecord('schedule_components', data);
            APP.Utils.showToast(`Component '${name}' created.`, "success");
            ComponentManager.render();
        }
    };

    const handleClick = (e) => {
        if (e.target.classList.contains('delete-component')) {
            handleDelete(e.target.dataset.componentId);
        }
    };

    const handleDelete = async (id) => {
        const component = APP.StateManager.getComponentById(id);
        if (!component || !confirm(`Are you sure you want to delete '${component.name}'?`)) return;

        // NOTE: Should ideally check if component is in use before deleting
        const { error } = await APP.DataService.deleteRecord('schedule_components', { id });
        if (!error) {
            APP.StateManager.syncRecord('schedule_components', { id: id }, true);
            APP.Utils.showToast(`Component deleted.`, "success");
            ComponentManager.render();
        }
    };

    APP.Components = APP.Components || {};
    APP.Components.ComponentManager = ComponentManager;
}(window.APP));


/**
 * MODULE: APP.Components.AssignmentManager
 * Manages the assignment of Rotations to Advisors, including the critical Start Date.
 */
(function(APP) {
    const AssignmentManager = {};
    const ELS = {};

    AssignmentManager.initialize = () => {
        ELS.grid = document.getElementById('assignmentGrid');
        if (ELS.grid) ELS.grid.addEventListener('change', handleChange);
    };

    AssignmentManager.render = () => {
        if (!ELS.grid) return;
        const STATE = APP.StateManager.getState();
        const advisors = STATE.advisors.sort((a,b) => a.name.localeCompare(b.name));
        const patterns = STATE.rotationPatterns.sort((a,b) => a.name.localeCompare(b.name));
        const patternOpts = patterns.map(p => `<option value="${p.name}">${p.name}</option>`).join('');

        let html = '<table><thead><tr><th>Advisor</th><th>Assigned Rotation</th><th>Start Date (dd/mm/yyyy)</th></tr></thead><tbody>';

        advisors.forEach(adv => {
            const assignment = APP.StateManager.getAssignmentForAdvisor(adv.id);
            // Dates are stored in State as YYYY-MM-DD. We pass this ISO string to the input value.
            // Flatpickr handles the display conversion.
            const startDate = (assignment && assignment.start_date) ? assignment.start_date : '';
            
            html += `<tr data-advisor-id="${adv.id}">
                <td>${adv.name}</td>
                <td><select class="form-select assign-rotation" data-advisor-id="${adv.id}"><option value="">-- None --</option>${patternOpts}</select></td>
                <td><input type="text" class="form-input assign-start-date" data-advisor-id="${adv.id}" value="${startDate}" /></td>
            </tr>`;
        });
        html += '</tbody></table>';
        ELS.grid.innerHTML = html;

        // Initialize Flatpickr and set dropdown values after HTML insertion
        advisors.forEach(adv => {
            const assignment = APP.StateManager.getAssignmentForAdvisor(adv.id);
            const row = ELS.grid.querySelector(`tr[data-advisor-id="${adv.id}"]`);
            if (!row) return;

            const rotSelect = row.querySelector('.assign-rotation');
            if (rotSelect) {
                rotSelect.value = (assignment && assignment.rotation_name) ? assignment.rotation_name : '';
            }
            
            const dateInput = row.querySelector('.assign-start-date');
            if (dateInput && typeof flatpickr !== 'undefined') {
                // Configure Flatpickr to display and output as d/m/Y (UK format).
                flatpickr(dateInput, {
                    dateFormat: "d/m/Y",
                    allowInput: true,
                    "locale": { "firstDayOfWeek": 1 }, // Monday
                    // Use onChange hook to capture the date selection event
                    onChange: function(selectedDates, dateStr, instance) {
                        // dateStr is in d/m/Y format here.
                        handleAssignmentUpdate(instance.element.dataset.advisorId, 'start_date', dateStr);
                    }
                });
            }
        });
    };

    const handleChange = (e) => {
        // Handle dropdown changes (Flatpickr handles its own changes via the hook)
        if (e.target.classList.contains('assign-rotation')) {
            handleAssignmentUpdate(e.target.dataset.advisorId, 'rotation_name', e.target.value);
        }
    };

    // Handles updates to assignments, including date format conversion.
    const handleAssignmentUpdate = async (advisorId, field, value) => {
        let assignment = APP.StateManager.getAssignmentForAdvisor(advisorId);
        
        // Initialize if no assignment exists yet
        if (!assignment) {
            assignment = { advisor_id: advisorId, rotation_name: null, start_date: null };
        }
        
        let processedValue = value || null;

        // Convert UK date format (from UI) to ISO format (for DB/State)
        if (field === 'start_date') {
            processedValue = APP.Utils.convertUKToISODate(value);
            if (value && !processedValue) {
                APP.Utils.showToast("Error: Invalid date format. Please use dd/mm/yyyy.", "danger");
                AssignmentManager.render(); // Re-render to revert the UI state
                return;
            }
        }

        // Create the record for the database operation
        const recordToSave = { ...assignment, [field]: processedValue };
        // Remove the 'id' if it exists, as upserting on 'advisor_id' constraint is safer
        delete recordToSave.id; 

        // Use DataService for persistence (Upsert based on advisor_id)
        const { data, error } = await APP.DataService.saveRecord('rotation_assignments', recordToSave, 'advisor_id');
        
        if (!error) {
            // Sync the state with the definitive data returned from DB
            APP.StateManager.syncRecord('rotation_assignments', data);
            APP.StateManager.saveHistory('Update assignment');
            
            // Re-render the main schedule view as assignments directly affect visualization
            if (APP.Components.ScheduleViewer) {
                APP.Components.ScheduleViewer.render();
            }
        } else {
            // If save failed, re-render the assignments to revert the UI state
            AssignmentManager.render();
        }
    };

    APP.Components = APP.Components || {};
    APP.Components.AssignmentManager = AssignmentManager;
}(window.APP));

/**
 * MODULE: APP.Components.SequentialBuilder (Shared Modal Logic)
 * V15.5.2: Extracted module to support both Shift Definitions and Exceptions (Live Editing). Includes stability fixes.
 */
(function(APP) {
    const SequentialBuilder = {};
    const ELS = {};

    // State specific to the Builder Modal
    const BUILDER_STATE = {
        isOpen: false,
        mode: null, // 'definition' or 'exception'
        contextId: null, // definitionId or advisorId
        exceptionDate: null, // YYYY-MM-DD
        startTimeMin: 480, // Default 08:00
        segments: [], // { component_id, duration_min }
        reason: null,
    };

    SequentialBuilder.initialize = () => {
        // Cache Modal Elements
        ELS.modal = document.getElementById('shiftBuilderModal');
        ELS.modalTitle = document.getElementById('modalTitle');
        ELS.modalClose = document.getElementById('modalClose');
        ELS.modalStartTime = document.getElementById('modalStartTime');
        ELS.modalAddActivity = document.getElementById('modalAddActivity');
        ELS.modalSequenceBody = document.getElementById('modalSequenceBody');
        ELS.modalTotalTime = document.getElementById('modalTotalTime');
        ELS.modalPaidTime = document.getElementById('modalPaidTime');
        ELS.modalSave = document.getElementById('modalSaveStructure');

        // V15.1: Exception specific elements
        ELS.exceptionReasonGroup = document.getElementById('exceptionReasonGroup');
        ELS.modalExceptionReason = document.getElementById('modalExceptionReason');

        // V15.5.2: Check if critical elements are found during initialization
        if (!ELS.modal || !ELS.modalSave || !ELS.modalSequenceBody || !ELS.modalStartTime) {
            console.error("CRITICAL ERROR: SequentialBuilder failed to find necessary modal elements (e.g., modalStartTime) in index.html during initialization. Check HTML integrity.");
            // We allow initialization to continue so the rest of the app might work, 
            // but SequentialBuilder.open() will catch the error when trying to use it.
        }

        // Event Listeners
        if (ELS.modalClose) ELS.modalClose.addEventListener('click', SequentialBuilder.close);
        if (ELS.modalAddActivity) ELS.modalAddActivity.addEventListener('click', handleAddActivity);
        if (ELS.modalSave) ELS.modalSave.addEventListener('click', handleSave);
        
        if (ELS.modalSequenceBody) {
            ELS.modalSequenceBody.addEventListener('change', handleSequenceChange);
            ELS.modalSequenceBody.addEventListener('click', handleSequenceClick);
        }

        if (ELS.modalExceptionReason) {
            ELS.modalExceptionReason.addEventListener('input', (e) => {
                BUILDER_STATE.reason = e.target.value;
            });
        }

        // Initialize Time Picker (Flatpickr)
        if (ELS.modalStartTime) {
            // Check if flatpickr library is loaded before using it
            if (typeof flatpickr === 'undefined') {
                console.error("CRITICAL ERROR: flatpickr library not loaded during SequentialBuilder init.");
                return;
            }
            flatpickr(ELS.modalStartTime, {
                enableTime: true,
                noCalendar: true,
                dateFormat: "H:i",
                time_24hr: true,
                minuteIncrement: 5,
                onChange: (selectedDates, dateStr) => {
                    const [h, m] = dateStr.split(':').map(Number);
                    BUILDER_STATE.startTimeMin = h * 60 + m;
                    render(); // Recalculate sequence times on start time change
                }
            });
        }
    };

    // Generalized open function
    // config: { mode, id, title, structure, date (optional), reason (optional) }
    SequentialBuilder.open = (config) => {
        
        // V15.5.2 FIX: Ensure modal elements exist before attempting to open.
        if (!ELS.modal || !ELS.modalStartTime) {
            console.error("ERROR: Attempted to open SequentialBuilder, but critical modal elements (modal or startTime) are missing. Check index.html integrity.");
            APP.Utils.showToast("Fatal UI Error: Editor component missing. Please ensure index.html is complete.", "danger", 10000);
            return;
        }

        // 1. Convert absolute times (structure) to sequential format (segments)
        const sequentialSegments = [];
        let startTimeMin = 480; // Default 8:00 AM

        if (config.structure && config.structure.length > 0) {
            // Ensure input structure is sorted
            const sortedStructure = JSON.parse(JSON.stringify(config.structure)).sort((a, b) => a.start_min - b.start_min);
            startTimeMin = sortedStructure[0].start_min;
            
            sortedStructure.forEach(seg => {
                sequentialSegments.push({
                    component_id: seg.component_id,
                    duration_min: seg.end_min - seg.start_min
                });
            });
        }

        // 2. Set BUILDER_STATE
        BUILDER_STATE.isOpen = true;
        BUILDER_STATE.mode = config.mode;
        BUILDER_STATE.contextId = config.id;
        BUILDER_STATE.exceptionDate = config.date || null;
        BUILDER_STATE.startTimeMin = startTimeMin;
        // Deep copy segments to prevent mutation before save
        BUILDER_STATE.segments = JSON.parse(JSON.stringify(sequentialSegments));
        BUILDER_STATE.reason = config.reason || null;

        // 3. Initialize UI
        ELS.modalTitle.textContent = config.title;
        
        // V15.5.2 FIX: Added check for ELS.modalStartTime existence before accessing _flatpickr
        // This prevents the "Cannot read properties of null" crash if the HTML is incomplete.
        if (ELS.modalStartTime && ELS.modalStartTime._flatpickr) {
            ELS.modalStartTime._flatpickr.setDate(APP.Utils.formatMinutesToTime(startTimeMin), false);
        }

        // V15.1: Show/Hide exception reason input based on mode
        if (config.mode === 'exception') {
            ELS.exceptionReasonGroup.style.display = 'block';
            ELS.modalExceptionReason.value = BUILDER_STATE.reason || '';
            ELS.modalSave.textContent = "Save Exception";
        } else {
            ELS.exceptionReasonGroup.style.display = 'none';
            ELS.modalSave.textContent = "Save Definition";
        }
        
        render();
        ELS.modal.style.display = 'flex';
    };

    SequentialBuilder.close = () => {
        BUILDER_STATE.isOpen = false;
        if (ELS.modal) ELS.modal.style.display = 'none';
    };

    // Renders the dynamic sequence grid (The Ripple Effect)
    const render = () => {
        let html = '';
        let currentTime = BUILDER_STATE.startTimeMin;
        let totalDuration = 0;
        let paidDuration = 0;
        const STATE = APP.StateManager.getState();

        // Generate component options HTML
        const componentOptions = STATE.scheduleComponents
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(c => `<option value="${c.id}">${c.name} (${c.type})</option>`)
            .join('');

        BUILDER_STATE.segments.forEach((seg, index) => {
            const component = APP.StateManager.getComponentById(seg.component_id);
            
            // Calculate times dynamically based on previous segments
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
                    <td class="time-display">${APP.Utils.formatMinutesToTime(startTime)}</td>
                    <td class="time-display">${APP.Utils.formatMinutesToTime(endTime)}</td>
<td class="actions-cell">
  <div class="btn-group">
    <button class="btn btn-sm" data-action="insert-before" data-index="${index}">+ Above</button>
    <button class="btn btn-sm" data-action="insert-after" data-index="${index}">+ Below</button>
    <button class="btn btn-sm" data-action="split-row" data-index="${index}">Split</button>
    <button class="btn btn-sm btn-danger delete-sequence-item" data-index="${index}">Remove</button>
  </div>
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

        // Set selected values for dropdowns (must be done after HTML insertion)
        BUILDER_STATE.segments.forEach((seg, index) => {
            const selectEl = ELS.modalSequenceBody.querySelector(`.sequence-component[data-index="${index}"]`);
            if (selectEl) {
                selectEl.value = seg.component_id || '';
            }
        });

        ELS.modalTotalTime.textContent = APP.Utils.formatDuration(totalDuration);
        ELS.modalPaidTime.textContent = APP.Utils.formatDuration(paidDuration);
    };

    const handleAddActivity = () => {
        BUILDER_STATE.segments.push({ component_id: null, duration_min: 60 });
        render();
    };

    const handleSequenceChange = (e) => {
        const target = e.target;
        const index = parseInt(target.dataset.index, 10);
        if (isNaN(index)) return;

        if (target.classList.contains('sequence-component')) {
            const componentId = target.value;
            BUILDER_STATE.segments[index].component_id = componentId || null;
            
            // Auto-set default duration if the component is known
            const component = APP.StateManager.getComponentById(componentId);
            if (component) {
                // When a component is selected, update the duration to its default.
                BUILDER_STATE.segments[index].duration_min = component.default_duration_min;
            }

        } else if (target.classList.contains('sequence-duration')) {
            const duration = parseInt(target.value, 10);
            if (isNaN(duration) || duration < 5) {
                target.value = BUILDER_STATE.segments[index].duration_min; // Revert display if invalid
                return; 
            }
            BUILDER_STATE.segments[index].duration_min = duration;
        }
        render(); // Recalculate ripple effect
    };

    const handleSequenceClick = (e) => {
    const target = e.target;
    if (!target.closest('button')) return;

    const index = parseInt(target.dataset.index, 10);
    if (isNaN(index)) return;

    // Helper: clamp duration to minimum 5 minutes
    const clamp = (v) => Math.max(5, Math.round(v));

    if (target.classList.contains('delete-sequence-item')) {
        BUILDER_STATE.segments.splice(index, 1);
        render();
        return;
    }

    const action = target.dataset.action;

    if (action === 'insert-before' || action === 'insert-after') {
        // Default new block: 30 minutes, no component selected yet
        const NEW_DURATION = 30;
        const insertAt = action === 'insert-before' ? index : index + 1;

        // Insert a blank segment
        BUILDER_STATE.segments.splice(insertAt, 0, { component_id: null, duration_min: NEW_DURATION });

        // Auto-adjust a neighbor so total end time stays aligned.
        // First try to subtract from the row we inserted next to.
        const adjustIndex = action === 'insert-before' ? index + 1 /* the original row moved down */ : index;
        if (BUILDER_STATE.segments[adjustIndex]) {
            const cur = BUILDER_STATE.segments[adjustIndex];
            if (cur.duration_min > NEW_DURATION + 5) {
                cur.duration_min = clamp(cur.duration_min - NEW_DURATION);
            } else {
                // Not enough room: borrow from the next segment if it exists
                const nextIdx = adjustIndex + 1;
                if (BUILDER_STATE.segments[nextIdx] && BUILDER_STATE.segments[nextIdx].duration_min > NEW_DURATION + 5) {
                    BUILDER_STATE.segments[nextIdx].duration_min = clamp(BUILDER_STATE.segments[nextIdx].duration_min - NEW_DURATION);
                }
            }
        }

        render();
        return;
    }

    if (action === 'split-row') {
        const seg = BUILDER_STATE.segments[index];
        if (!seg) return;

        // Split into two halves (minimum 10m each; fall back to 5 if very small)
        let first = Math.max(10, Math.floor(seg.duration_min / 2));
        let second = Math.max(10, seg.duration_min - first);

        // Ensure sum stays the same and both >= 5
        if (first < 5) first = 5;
        if (second < 5) second = 5;
        const diff = (first + second) - seg.duration_min;
        if (diff !== 0) second = clamp(second - diff);

        // Replace current with first half, insert second half after, same component
        seg.duration_min = first;
        BUILDER_STATE.segments.splice(index + 1, 0, { component_id: seg.component_id, duration_min: second });

        render();
        return;
    }
};


    // Generalized save function
    const handleSave = async () => {
        const { mode, contextId, segments, startTimeMin, exceptionDate, reason } = BUILDER_STATE;
        
        // 1. Convert sequential format (segments) back to absolute time format (structure)
        const absoluteTimeSegments = [];
        let currentTime = startTimeMin;

        for (const seg of segments) {
            if (!seg.component_id) {
                APP.Utils.showToast("Error: All activities must have a component selected.", "danger");
                return;
            }
            const start = currentTime;
            const end = currentTime + seg.duration_min;
            absoluteTimeSegments.push({ component_id: seg.component_id, start_min: start, end_min: end });
            currentTime = end;
        }

        // 2. Call the appropriate persistence handler
        let result;
        if (mode === 'definition') {
            result = await saveShiftDefinition(contextId, absoluteTimeSegments);
        } else if (mode === 'exception') {
            result = await saveScheduleException(contextId, exceptionDate, absoluteTimeSegments, reason);
        }

        // 3. Handle post-save actions
        if (result && !result.error) {
            SequentialBuilder.close();
            // Always re-render the main visualization
            if (APP.Components.ScheduleViewer) {
                APP.Components.ScheduleViewer.render(); 
            }
        }
    };

    // Specific save handler for Shift Definitions
    const saveShiftDefinition = async (definitionId, structure) => {
        const { data, error } = await APP.DataService.updateRecord('shift_definitions', { structure: structure }, { id: definitionId });
        
        if (!error) {
            APP.StateManager.syncRecord('shift_definitions', data);
            APP.StateManager.saveHistory("Update Shift Structure");
            APP.Utils.showToast("Shift definition saved successfully.", "success");
            // Specific re-render for the definitions tab
            if (APP.Components.ShiftDefinitionEditor) {
                APP.Components.ShiftDefinitionEditor.render();
            }
        }
        return { data, error };
    };

    // V15.1: Specific save handler for Schedule Exceptions
    const saveScheduleException = async (advisorId, dateISO, structure, reason) => {
        const record = {
            advisor_id: advisorId,
            exception_date: dateISO,
            structure: structure,
            reason: reason || null
        };

        // Upsert based on composite key constraint (advisor_id, exception_date)
        const { data, error } = await APP.DataService.saveRecord('schedule_exceptions', record, 'advisor_id, exception_date');

        if (!error) {
            APP.StateManager.syncRecord('schedule_exceptions', data);
            APP.StateManager.saveHistory("Save Schedule Exception");
            APP.Utils.showToast("Schedule exception saved successfully.", "success");
        }
        return { data, error };
    };

    APP.Components = APP.Components || {};
    APP.Components.SequentialBuilder = SequentialBuilder;
}(window.APP));


/**
 * MODULE: APP.Components.ShiftDefinitionEditor
 * Manages the list of Shift Definitions and triggers the SequentialBuilder.
 */
(function(APP) {
    const ShiftDefinitionEditor = {};
    const ELS = {};

    ShiftDefinitionEditor.initialize = () => {
        ELS.grid = document.getElementById('shiftDefinitionsGrid');
        ELS.btnNew = document.getElementById('btnNewShiftDefinition');

        if (ELS.btnNew) ELS.btnNew.addEventListener('click', handleNewDefinition);
        if (ELS.grid) ELS.grid.addEventListener('click', handleGridClick);
    };

    ShiftDefinitionEditor.render = () => {
        if (!ELS.grid) return;
        const STATE = APP.StateManager.getState();
        const definitions = STATE.shiftDefinitions.sort((a,b) => a.name.localeCompare(b.name));

        let html = '<table><thead><tr><th>Code</th><th>Name</th><th>Total Duration</th><th>Paid Duration</th><th>Actions</th></tr></thead><tbody>';

        definitions.forEach(def => {
            let totalDuration = 0;
            let paidDuration = 0;

            // Calculate durations based on the structure
            if (def.structure && Array.isArray(def.structure)) {
                def.structure.forEach(seg => {
                    const duration = seg.end_min - seg.start_min;
                    totalDuration += duration;
                    const component = APP.StateManager.getComponentById(seg.component_id);
                    if (component && component.is_paid) {
                        paidDuration += duration;
                    }
                });
            }

            html += `
            <tr data-definition-id="${def.id}">
                <td><strong>${def.code}</strong></td>
                <td>${def.name}</td>
                <td>${APP.Utils.formatDuration(totalDuration)}</td>
                <td>${APP.Utils.formatDuration(paidDuration)}</td>
                <td>
                    <button class="btn btn-sm btn-primary edit-structure" data-definition-id="${def.id}">Edit Structure</button>
                    <button class="btn btn-sm btn-danger delete-definition" data-definition-id="${def.id}">Delete</button>
                </td>
            </tr>`;
        });
        html += '</tbody></table>';
ELS.grid.innerHTML = html;


    };

    // --- CRUD Handlers ---

    const handleNewDefinition = async () => {
        const nameInput = prompt("Enter the full name (e.g., 'Early 7am-4pm Flex'):");
        if (!nameInput) return;
        const name = nameInput.trim();

        const codeInput = prompt("Enter a unique shortcode (e.g., 'E74F' or '2'):");
        if (!codeInput) return;
        const code = codeInput.trim();

        if (!name || !code) return;

        // Check for duplicate code
        if (APP.StateManager.getShiftDefinitionByCode(code)) {
            APP.Utils.showToast("Error: Code already exists.", "danger");
            return;
        }

        // Ensure code is explicitly stored as a string
        const newDefinition = { name, code: String(code), structure: [] };

        const { data, error } = await APP.DataService.saveRecord('shift_definitions', newDefinition);
        if (!error) {
            APP.StateManager.syncRecord('shift_definitions', data);
            APP.StateManager.saveHistory("Create Shift Definition");
            APP.Utils.showToast(`Shift '${name}' created. Now click 'Edit Structure'.`, "success");
            ShiftDefinitionEditor.render();
            // Update rotation editor dropdowns
            if (APP.Components.RotationEditor) {
                 APP.Components.RotationEditor.renderGrid();
            }
        }
    };
    
    const handleGridClick = (e) => {
        if (e.target.classList.contains('edit-structure')) {
            // V15.1: Open the shared Sequential Builder in 'definition' mode
            const definitionId = e.target.dataset.definitionId;
            const definition = APP.StateManager.getShiftDefinitionById(definitionId);
            if (definition && APP.Components.SequentialBuilder) {
                APP.Components.SequentialBuilder.open({
                    mode: 'definition',
                    id: definitionId,
                    title: `Sequential Builder: ${definition.name} (${definition.code})`,
                    structure: definition.structure
                });
            }
        } else if (e.target.classList.contains('delete-definition')) {
            handleDeleteDefinition(e.target.dataset.definitionId);
        }
    };

    const handleDeleteDefinition = async (id) => {
        const definition = APP.StateManager.getShiftDefinitionById(id);
        if (!definition || !confirm(`Delete '${definition.name}' (${definition.code})?`)) return;

        // NOTE: Should ideally check if definition is used in rotations before deleting
        const { error } = await APP.DataService.deleteRecord('shift_definitions', { id });
        if (!error) {
            APP.StateManager.syncRecord('shift_definitions', { id: id }, true);
            APP.StateManager.saveHistory("Delete Shift Definition");
            APP.Utils.showToast(`Shift deleted.`, "success");
            ShiftDefinitionEditor.render();
            if (APP.Components.RotationEditor) {
                APP.Components.RotationEditor.renderGrid();
            }
        }
    };

    APP.Components = APP.Components || {};
    APP.Components.ShiftDefinitionEditor = ShiftDefinitionEditor;
}(window.APP));


/**
 * MODULE: APP.Components.RotationEditor
 * Manages the creation and modification of rotation patterns (Auto-Save Architecture).
 */
(function(APP) {
    const RotationEditor = {};
    const ELS = {};

    RotationEditor.initialize = () => {
        ELS.familySelect = document.getElementById('rotationFamily');
        ELS.btnNew = document.getElementById('btnNewRotation');
        ELS.btnDelete = document.getElementById('btnDeleteRotation');
        ELS.btnAddWeek = document.getElementById('btnAddWeek'); // V15.1
        ELS.grid = document.getElementById('rotationGrid');
        ELS.autoSaveStatus = document.getElementById('autoSaveStatus');

        if (ELS.familySelect) ELS.familySelect.addEventListener('change', handleFamilyChange);
        if (ELS.btnNew) ELS.btnNew.addEventListener('click', handleNewRotation);
        if (ELS.btnDelete) ELS.btnDelete.addEventListener('click', handleDeleteRotation);
        if (ELS.btnAddWeek) ELS.btnAddWeek.addEventListener('click', handleAddWeek); // V15.1
        if (ELS.grid) ELS.grid.addEventListener('change', handleGridChange);
    };

    RotationEditor.render = () => {
        renderDropdown();
        RotationEditor.renderGrid();
    };

    const renderDropdown = () => {
        if (!ELS.familySelect) return;
        const STATE = APP.StateManager.getState();
        const patterns = STATE.rotationPatterns.sort((a,b) => a.name.localeCompare(b.name));
        
        let opts = '<option value="">-- Select Rotation --</option>';
        patterns.forEach(p => {
            opts += `<option value="${p.name}" ${p.name === STATE.currentRotation ? 'selected' : ''}>${p.name}</option>`;
        });
        ELS.familySelect.innerHTML = opts;
    };

    RotationEditor.renderGrid = () => {
        if (!ELS.grid) return;
        const STATE = APP.StateManager.getState();
        const pattern = APP.StateManager.getPatternByName(STATE.currentRotation);
        const patternData = pattern ? (pattern.pattern || {}) : {};
        
        // V15.1: Dynamically determine the number of weeks
        let numWeeks = 6; // Default minimum if pattern selected
        if (pattern) {
             if (pattern.pattern && Object.keys(pattern.pattern).length > 0) {
                const keys = Object.keys(pattern.pattern);
                // V15.5.1 FIX: Updated regex to support "Week1" and "Week 1" (optional space)
                const weekNumbers = keys.map(k => {
                    const match = k.match(/^Week ?(\d+)$/i);
                    return match ? parseInt(match[1], 10) : 0;
                });
                const maxWeek = Math.max(0, ...weekNumbers);
                if (maxWeek > numWeeks) {
                    numWeeks = maxWeek;
                }
            }
        } else {
            numWeeks = 0; // No pattern selected
        }
       
        const weeks = Array.from({length: numWeeks}, (_, i) => i + 1);
        const days = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
        
        // Generate shift definition options
        const definitionOpts = STATE.shiftDefinitions
            .sort((a,b) => (String(a.code) || '').localeCompare(String(b.code) || ''))
            .map(d => `<option value="${d.code}">${d.code} (${d.name})</option>`)
            .join('');
            
        let html = '<table><thead><tr><th>WEEK</th>';
        days.forEach(d => html += `<th>${d}</th>`);
        html += '</tr></thead><tbody>';

        weeks.forEach(w => {
            html += `<tr><td>Week ${w}</td>`;
            days.forEach((d, i) => {
                const dow = i + 1; // Day of week index (1-7)
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

// Inline "Add Week" (only when a rotation is selected)
if (pattern) {
  html += `
    <div class="table-footer-inline">
      <button id="btnAddWeekInline" class="btn btn-secondary">[+] Add Week</button>
    </div>
  `;
}

        
        if (numWeeks === 0) {
             html = '<div class="visualization-empty">Select or create a rotation to begin editing.</div>';
        }

        ELS.grid.innerHTML = html;
        // Wire inline Add Week button (appears under the table)
const inlineAdd = document.getElementById('btnAddWeekInline');
if (inlineAdd) inlineAdd.addEventListener('click', handleAddWeek);

        // Set selected values (must be done after HTML insertion)
        if (pattern) {
            weeks.forEach(w => {
                // V15.5.1 FIX: Need a robust way to find the week data regardless of key format
                const weekKey = findWeekKey(patternData, w);
                const weekData = weekKey ? patternData[weekKey] : {};
                
                days.forEach((d, i) => {
                    const dow = i + 1;
                    // V15.5.1 FIX: Handle legacy DOW keys (e.g., 'mon') if numerical key is missing
                    const legacyDayKey = d.toLowerCase();
                    const code = weekData[dow] || weekData[legacyDayKey] || ''; 

                    const sel = ELS.grid.querySelector(`select[data-week="${w}"][data-dow="${dow}"]`);
                    if (sel) {
                        sel.value = code;
                    }
                });
            });
        }

        // V15.1: Enable/Disable Add Week button based on selection
        if (ELS.btnAddWeek) {
            ELS.btnAddWeek.disabled = !pattern;
        }
    };

    // V15.5.1 Helper: Finds the correct key in the pattern data (handles "Week 1", "Week1", "week1" etc.)
    const findWeekKey = (patternData, weekNumber) => {
        const keys = Object.keys(patternData);
        // Find the key that matches the week number using the robust regex
        return keys.find(k => {
            const match = k.match(/^Week ?(\d+)$/i);
            return match && parseInt(match[1], 10) === weekNumber;
        });
    };

    const handleFamilyChange = () => {
        APP.StateManager.getState().currentRotation = ELS.familySelect.value;
        RotationEditor.renderGrid();
    };

    const handleNewRotation = async () => {
        const name = prompt("Enter a name for the new rotation family:");
        if (!name) return;
        
        if (APP.StateManager.getPatternByName(name)) {
            APP.Utils.showToast("Error: Rotation name already exists.", "danger");
            return;
        }
        
        // Initialize with a standard 6-week structure (Using standard "Week N" format)
        const initialPattern = {};
        for (let i = 1; i <= 6; i++) {
            initialPattern[`Week ${i}`] = {};
        }

        const newPatternRecord = { name: name, pattern: initialPattern };
        const { data, error } = await APP.DataService.saveRecord('rotation_patterns', newPatternRecord);
        
        if (!error) {
            APP.StateManager.syncRecord('rotation_patterns', data);
            APP.StateManager.getState().currentRotation = name;
            APP.StateManager.saveHistory(`Create rotation`);
            APP.Utils.showToast(`Rotation '${name}' created (6 weeks).`, "success");
            RotationEditor.render();
            if (APP.Components.AssignmentManager) {
                APP.Components.AssignmentManager.render(); // Update assignment dropdowns
            }
        }
    };

    // V15.1: Handle adding a new week to the existing rotation
    const handleAddWeek = async () => {
        const STATE = APP.StateManager.getState();
        const rotationName = STATE.currentRotation;
        const pattern = APP.StateManager.getPatternByName(rotationName);

        if (!pattern) return;

        // Determine the next week number
        const keys = Object.keys(pattern.pattern || {});
        // V15.5.1 FIX: Updated regex to support "Week1" and "Week 1" (optional space)
        const weekNumbers = keys.map(k => {
            const match = k.match(/^Week ?(\d+)$/i);
            return match ? parseInt(match[1], 10) : 0;
        });
        const maxWeek = Math.max(0, ...weekNumbers);
        const nextWeek = maxWeek + 1;

        // Update the pattern structure locally (Using standard "Week N" format)
        if (!pattern.pattern) pattern.pattern = {};
        const nextWeekKey = `Week ${nextWeek}`;
        pattern.pattern[nextWeekKey] = {};

        // Save the updated structure (Auto-Save Architecture)
        const { error } = await APP.DataService.updateRecord('rotation_patterns', { pattern: pattern.pattern }, { name: rotationName });

        if (!error) {
            APP.StateManager.saveHistory(`Add Week ${nextWeek}`);
            APP.Utils.showToast(`Week ${nextWeek} added to rotation.`, "success");
            RotationEditor.renderGrid(); // Re-render the grid to show the new week
        } else {
            // Rollback local change if save failed
            delete pattern.pattern[nextWeekKey];
        }
    };

    const handleDeleteRotation = async () => {
        const STATE = APP.StateManager.getState();
        const rotationName = STATE.currentRotation;
        if (!rotationName || !confirm(`Delete '${rotationName}'?`)) return;
        
        // NOTE: Should ideally check if rotation is assigned before deleting
        const { error } = await APP.DataService.deleteRecord('rotation_patterns', { name: rotationName });
        
        if (!error) {
            APP.StateManager.syncRecord('rotation_patterns', { name: rotationName }, true);
            STATE.currentRotation = null;
            APP.StateManager.saveHistory(`Delete rotation`);
            APP.Utils.showToast(`Rotation deleted.`, "success");
            RotationEditor.render();
            if (APP.Components.AssignmentManager) {
                APP.Components.AssignmentManager.render(); // Update assignment dropdowns
            }
        }
    };

    // Auto-save functionality for grid cell changes
    const handleGridChange = async (e) => {
        if (!e.target.classList.contains('rotation-grid-select')) return;
        
        // Show saving indicator
        if (ELS.autoSaveStatus) {
            ELS.autoSaveStatus.textContent = "Saving...";
            ELS.autoSaveStatus.style.opacity = 1;
        }

        const { week, dow } = e.target.dataset;
        const shiftCode = e.target.value;
        const STATE = APP.StateManager.getState();
        const rotationName = STATE.currentRotation;
        
        const pattern = APP.StateManager.getPatternByName(rotationName);
        if (!pattern) return;
        
        // 1. Update the local state object
        if (!pattern.pattern) pattern.pattern = {};

        // V15.5.1 FIX: Find the correct week key format or create it if missing (using standard format)
        let weekKey = findWeekKey(pattern.pattern, parseInt(week, 10));
        if (!weekKey) {
            weekKey = `Week ${week}`; // Use standard format for new entries
        }

        if (!pattern.pattern[weekKey]) pattern.pattern[weekKey] = {};
        
        // V15.5.1: Normalize the update by removing legacy keys and using the standard numerical DOW key
        const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
        const legacyDayKey = days[parseInt(dow, 10) - 1];

        if (shiftCode) {
            // Ensure the shift code is stored consistently as a string
            pattern.pattern[weekKey][dow] = String(shiftCode);
            // Remove the legacy key if it exists (Normalization)
            if (pattern.pattern[weekKey].hasOwnProperty(legacyDayKey)) {
                delete pattern.pattern[weekKey][legacyDayKey];
            }
        } else {
            // RDO (Remove the keys)
            delete pattern.pattern[weekKey][dow]; 
            if (pattern.pattern[weekKey].hasOwnProperty(legacyDayKey)) {
                delete pattern.pattern[weekKey][legacyDayKey];
            }
        }

        // 2. Auto-save the entire pattern object
        const { error } = await APP.DataService.updateRecord('rotation_patterns', { pattern: pattern.pattern }, { name: rotationName });
            
        if (!error) {
            APP.StateManager.saveHistory(`Update rotation cell`);
            if (ELS.autoSaveStatus) {
                ELS.autoSaveStatus.textContent = "✓ Saved";
                setTimeout(() => {
                    ELS.autoSaveStatus.style.opacity = 0;
                }, 2000);
            }
            // Re-render visualization as rotations affect schedules
            if (APP.Components.ScheduleViewer) {
                APP.Components.ScheduleViewer.render();
            }
        } else {
             if (ELS.autoSaveStatus) {
                ELS.autoSaveStatus.textContent = "Error Saving";
            }
            APP.Utils.showToast("Failed to auto-save rotation change.", "danger");
            // NOTE: Ideally, revert the local state change if save fails
        }
    };

    APP.Components = APP.Components || {};
    APP.Components.RotationEditor = RotationEditor;
}(window.APP));

/**
 * MODULE: APP.Components.ScheduleViewer
 * Manages the visualization (Daily Gantt and Weekly Grid), including Hybrid Adherence and Live Editing triggers.
 */
(function(APP) {
    const ScheduleViewer = {};
    const ELS = {};
    const Config = APP.Config;
    let timeIndicatorInterval = null;

    ScheduleViewer.initialize = () => {
        // Cache Elements
        ELS.tree = document.getElementById('schedulesTree');
        ELS.treeSearch = document.getElementById('treeSearch');
        ELS.btnClearSelection = document.getElementById('btnClearSelection');
        ELS.visualizationContainer = document.getElementById('visualizationContainer');
        ELS.scheduleViewTitle = document.getElementById('scheduleViewTitle');
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

        // V15.1: Add listener for Live Editing clicks
        if (ELS.visualizationContainer) ELS.visualizationContainer.addEventListener('click', handleVisualizationClick);
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
            
            ELS.viewToggleGroup.querySelectorAll('.btn-toggle').forEach(btn => btn.classList.remove('active'));
            target.classList.add('active');

            ELS.dayToggleContainer.style.display = (viewMode === 'daily') ? 'flex' : 'none';
            
            renderPlanner();
        }
    };

    // V15.1: Handle clicks on the visualization (for Live Editing)
    const handleVisualizationClick = (e) => {
        const STATE = APP.StateManager.getState();
        let advisorId, dateISO, dayName;

        // Determine context based on view mode
        if (STATE.scheduleViewMode === 'daily') {
            const row = e.target.closest('.timeline-row');
            if (row && row.dataset.advisorId) {
                advisorId = row.dataset.advisorId;
                dayName = STATE.selectedDay;
                // Calculate the specific ISO date for the selected day
                dateISO = APP.Utils.getISODateForDayName(STATE.weekStart, dayName);
            }
        } else if (STATE.scheduleViewMode === 'weekly') {
             const cell = e.target.closest('.weekly-cell');
             // The cell already has the required data attributes
             if (cell && cell.dataset.advisorId && cell.dataset.date) {
                 advisorId = cell.dataset.advisorId;
                 dateISO = cell.dataset.date;
                 // Calculate dayName from dateISO (primarily for the modal title)
                 // Use UTC to ensure correct date parsing across timezones
                 try {
                    const [y, m, d] = dateISO.split('-').map(Number);
                    const dateObj = new Date(Date.UTC(y, m - 1, d));
                    dayName = dateObj.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
                 } catch (err) {
                     console.error("Error parsing date for visualization click:", dateISO, err);
                     return;
                 }
             }
        }

        if (advisorId && dateISO) {
            const advisor = APP.StateManager.getAdvisorById(advisorId);
            if (!advisor) return;
            
            // Calculate the current segments for this specific date to initialize the builder.
            // We must calculate the Monday for that specific date to ensure rotation calculation is correct
            const weekStartISO = APP.Utils.getMondayForDate(dateISO); 
            
            // Use the robust calculateSegments
            const { segments, reason } = calculateSegments(advisorId, dayName, weekStartISO);

            // Open the Sequential Builder in 'exception' mode
            if (APP.Components.SequentialBuilder) {
                APP.Components.SequentialBuilder.open({
                    mode: 'exception',
                    id: advisorId,
                    date: dateISO,
                    title: `Live Editor: ${advisor.name} (${dayName}, ${APP.Utils.convertISOToUKDate(dateISO)})`,
                    structure: segments,
                    reason: reason
                });
            } else {
                 APP.Utils.showToast("Error: Live Editor module not initialized.", "danger");
            }
        }
    };

    // Render the hierarchical team selection tree
    const renderTree = () => {
        if (!ELS.tree) return;
        const STATE = APP.StateManager.getState();
        const filter = ELS.treeSearch ? ELS.treeSearch.value.toLowerCase() : '';
        let html = '';

        const leaders = STATE.leaders.sort((a, b) => a.name.localeCompare(b.name));
        const advisors = STATE.advisors.sort((a, b) => a.name.localeCompare(b.name));

        leaders.forEach(leader => {
            const teamAdvisors = advisors.filter(a => a.leader_id === leader.id);
            
            // Determine if the leader or any team member matches the filter
            const matchesFilter = !filter || leader.name.toLowerCase().includes(filter) || teamAdvisors.some(a => a.name.toLowerCase().includes(filter));

            if (matchesFilter && teamAdvisors.length > 0) {
                // Check if all advisors in the team are currently selected
                const allSelected = teamAdvisors.every(a => STATE.selectedAdvisors.has(a.id));

                html += `<div class="tree-node-leader">
                    <label>
                        <input type="checkbox" class="select-leader" data-leader-id="${leader.id}" ${allSelected ? 'checked' : ''} />
                        ${leader.name} (Team Leader)
                    </label>
                </div>`;

                teamAdvisors.forEach(adv => {
                    // Show advisor if filter matches or if the leader matches (to show the whole team)
                    if (!filter || adv.name.toLowerCase().includes(filter) || leader.name.toLowerCase().includes(filter)) {
                         const isChecked = STATE.selectedAdvisors.has(adv.id);
                        html += `<div class="tree-node-advisor">
                            <label>
                                <input type="checkbox" class="select-advisor" data-advisor-id="${adv.id}" data-leader-id="${leader.id}" ${isChecked ? 'checked' : ''} />
                                ${adv.name}
                            </label>
                        </div>`;
                    }
                });
            }
        });
        
        ELS.tree.innerHTML = html || '<div class="visualization-empty">No teams or advisors found.</div>';

        // Auto-select the first advisor on initial load if none are selected (Bootstrapping UI)
        if (STATE.selectedAdvisors.size === 0 && STATE.advisors.length > 0 && !STATE.treeInitialized) {
            const firstAdvisor = advisors.find(a => a.leader_id);
             if (firstAdvisor) {
                STATE.selectedAdvisors.add(firstAdvisor.id);
                STATE.treeInitialized = true;
                renderTree();
                renderPlanner();
            }
        }
    };

    const handleTreeChange = (e) => {
        const target = e.target;
        const STATE = APP.StateManager.getState();

        if (target.classList.contains('select-leader')) {
            const leaderId = target.dataset.leaderId;
            const isChecked = target.checked;
            const teamAdvisors = APP.StateManager.getAdvisorsByLeader(leaderId);

            // Select/Deselect the entire team
            teamAdvisors.forEach(adv => {
                if (isChecked) {
                    STATE.selectedAdvisors.add(adv.id);
                } else {
                    STATE.selectedAdvisors.delete(adv.id);
                }
            });
            renderTree(); // Re-render to update individual checkboxes

        } else if (target.classList.contains('select-advisor')) {
            const id = target.dataset.advisorId;
            target.checked ? STATE.selectedAdvisors.add(id) : STATE.selectedAdvisors.delete(id);
            // Re-render tree to update the leader checkbox state (if all are now selected/deselected)
            renderTree();
        }
        
        renderPlanner();
    };

    const clearSelection = () => {
        APP.StateManager.getState().selectedAdvisors.clear();
        renderTree();
        renderPlanner();
    };

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
        // V15.1: Updated time range in title
        ELS.scheduleViewTitle.textContent = "Schedule Visualization (Daily 06:00 - 20:00)";

        // Setup the structure for the Gantt chart
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
        
        // Cache dynamic elements
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
                // V15.1: Calculate segments AND determine source (Hybrid Adherence)
                const { segments, source } = calculateSegments(adv.id, STATE.selectedDay);
                
                // V15.1: Add exception styling class if source is 'exception'
                const rowClass = (source === 'exception') ? 'is-exception' : '';

                // V15.1: Add data-advisor-id for click handling
                html += `
                <div class="timeline-row ${rowClass}" data-advisor-id="${adv.id}">
                    <div class="timeline-name">${adv.name}</div>
                    <div class="timeline-track">
                        ${renderSegments(segments)}
                    </div>
                </div>
                `;
            });
            ELS_DAILY.plannerBody.innerHTML = html;
        } else {
             ELS_DAILY.plannerBody.innerHTML = '<div class="visualization-empty">Select advisors to view schedules.</div>';
        }

        setupIntradayIndicators(ELS_DAILY);
    };

    const renderTimeHeader = (headerElement) => {
        const startHour = Math.floor(Config.TIMELINE_START_MIN / 60);
        const endHour = Math.floor(Config.TIMELINE_END_MIN / 60);
        const totalHours = Config.TIMELINE_DURATION_MIN / 60;
        
        let html = '';
        // Loop through each hour in the range
        for (let h = startHour; h < endHour; h++) {
            const pct = (h - startHour) / totalHours * 100;
            const label = h.toString().padStart(2, '0') + ':00';
            html += `<div class="time-tick" style="left: ${pct}%;">${label}</div>`;
        }
        // Note: The final tick (e.g., 20:00) is often omitted as the lines represent the start of the hour block.

        headerElement.innerHTML = html;
    };

    const renderSegments = (segments) => {
        if (!segments || segments.length === 0) {
            return ''; // RDO
        }
        
        return segments.map(seg => {
            const component = APP.StateManager.getComponentById(seg.component_id);
            if (!component) return '';

            // Calculate position and width percentage
            const startPct = ((seg.start_min - Config.TIMELINE_START_MIN) / Config.TIMELINE_DURATION_MIN) * 100;
            const widthPct = ((seg.end_min - seg.start_min) / Config.TIMELINE_DURATION_MIN) * 100;
            
            // Determine styling class based on component type
            let barClass = '';
            if (component.type === 'Break' || component.type === 'Lunch') {
                barClass = 'is-gap';
            } else if (component.type === 'Activity') {
                barClass = 'is-activity';
            }
            
            // Apply specific color if no predefined class matches
            const style = (barClass === '') ? `background-color: ${component.color}; color: ${APP.Utils.getContrastingTextColor(component.color)};` : '';

            // The 'title' attribute provides the native browser tooltip on hover.
            return `
            <div class="timeline-bar ${barClass}" style="left: ${startPct}%; width: ${widthPct}%; ${style}" title="${component.name} (${APP.Utils.formatMinutesToTime(seg.start_min)} - ${APP.Utils.formatMinutesToTime(seg.end_min)})">
            </div>
            `;
        }).join('');
    };

    // --- WEEKLY VIEW ---

    const renderWeeklyPlanner = () => {
        ELS.scheduleViewTitle.textContent = "Schedule Visualization (Weekly Overview)";

        // Initialize the structure of the weekly planner
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
                    // V15.1: Calculate segments and source (Hybrid Adherence)
                    const { segments, source } = calculateSegments(adv.id, day);
                    
                    // V15.1: Determine class and get the specific date for this cell
                    const cellClass = (source === 'exception') ? 'is-exception' : '';
                    const dateISO = APP.Utils.getISODateForDayName(STATE.weekStart, day);

                    // V15.1: Add 'weekly-cell' class and data attributes for click handling
                    html += `<td class="weekly-cell ${cellClass}" data-advisor-id="${adv.id}" data-date="${dateISO}">
                                ${renderWeeklyCell(segments, source)}
                             </td>`;
                });
                
                html += `</tr>`;
            });
            ELS_WEEKLY.weeklyBody.innerHTML = html;
        } else {
             ELS_WEEKLY.weeklyBody.innerHTML = `<tr><td colspan="8" class="visualization-empty">Select advisors to view schedules.</td></tr>`;
        }
    };

    // V15.1: Updated to handle source for exception visualization
    const renderWeeklyCell = (segments, source) => {
        if (!segments || segments.length === 0) {
            return `<div class="weekly-cell-content"><span class="weekly-rdo">RDO</span></div>`;
        }
        
        let shiftCode = 'N/A';

        // If the source is 'rotation', try to find the matching definition code.
        if (source === 'rotation') {
            const STATE = APP.StateManager.getState();
            // Match by structure comparison (requires segments to be sorted consistently)
            const definition = STATE.shiftDefinitions.find(def => {
                if (!def.structure) return false;
                // Ensure comparison is robust by sorting the definition structure as well
                const sortedDefStructure = JSON.parse(JSON.stringify(def.structure)).sort((a, b) => a.start_min - b.start_min);
                return JSON.stringify(sortedDefStructure) === JSON.stringify(segments);
            });
            if (definition) {
                shiftCode = definition.code;
            }
        } else if (source === 'exception') {
            // V15.1: If it's an exception, label it as 'Custom'.
            shiftCode = 'Custom';
        }
        
        const startMin = segments[0].start_min;
        const endMin = segments[segments.length - 1].end_min;
        const timeString = `${APP.Utils.formatMinutesToTime(startMin)} - ${APP.Utils.formatMinutesToTime(endMin)}`;

        return `
            <div class="weekly-cell-content">
                <span class="weekly-shift-code">${shiftCode}</span>
                <span class="weekly-shift-time">${timeString}</span>
            </div>
        `;
    };


    // --- CORE CALCULATION (Hybrid Adherence) ---

    // V15.1: Calculates the schedule for an advisor on a specific day, prioritizing exceptions.
    // Returns { segments, source, reason }
    const calculateSegments = (advisorId, dayName, weekStartISO = null) => {
        const STATE = APP.StateManager.getState();
        // Use the provided context or the global state context
        const effectiveWeekStart = weekStartISO || STATE.weekStart;
        
        if (!effectiveWeekStart) return { segments: [], source: null, reason: null };

        // 1. Determine the specific date
        const dateISO = APP.Utils.getISODateForDayName(effectiveWeekStart, dayName);
        if (!dateISO) return { segments: [], source: null, reason: null };

        // 2. Check for an Exception (Priority 1)
        const exception = APP.StateManager.getExceptionForAdvisorDate(advisorId, dateISO);
        if (exception && exception.structure && exception.structure.length > 0) {
            // If an exception exists, use its structure.
            // Ensure segments are sorted (critical for visualization and comparison)
            const sortedSegments = JSON.parse(JSON.stringify(exception.structure)).sort((a, b) => a.start_min - b.start_min);
            return { segments: sortedSegments, source: 'exception', reason: exception.reason };
        }

        // 3. Calculate based on Rotation (Priority 2)
        const assignment = APP.StateManager.getAssignmentForAdvisor(advisorId);
        
        if (!assignment || !assignment.rotation_name || !assignment.start_date) {
            return { segments: [], source: 'rotation', reason: null };
        }

        // Calculate the effective week number using the finite rotation logic
        const effectiveWeek = APP.Utils.getEffectiveWeek(assignment.start_date, effectiveWeekStart, assignment, APP.StateManager.getPatternByName);
        
        // If null, the advisor is outside their finite rotation period or hasn't started yet.
        if (effectiveWeek === null) return { segments: [], source: 'rotation', reason: null };
        
        // Determine the day index (1-7)
        const dayIndex = (['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].indexOf(dayName) + 1);
        const dayIndexStr = dayIndex.toString();


        const pattern = APP.StateManager.getPatternByName(assignment.rotation_name);
        if (!pattern || !pattern.pattern) return { segments: [], source: 'rotation', reason: null };
        
        // Look up the shift code in the rotation pattern
        // V15.5.1 FIX: Use the robust key finder helper
        const weekKey = findWeekKey(pattern.pattern, effectiveWeek);
        const weekPattern = weekKey ? pattern.pattern[weekKey] : {};

        // V15.5.1 FIX: Handle legacy DOW keys (e.g., 'mon') if numerical key is missing
        const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
        const legacyDayKey = days[dayIndex - 1];
        
        const shiftCode = weekPattern[dayIndexStr] || weekPattern[legacyDayKey];


        if (!shiftCode) return { segments: [], source: 'rotation', reason: null }; // RDO

        // Find the shift definition corresponding to the code
        const definition = APP.StateManager.getShiftDefinitionByCode(shiftCode);
        
        if (!definition || !definition.structure) {
            console.warn(`Shift Definition not found or invalid for Code: '${shiftCode}' (Advisor ${advisorId} on ${dayName}, Week ${effectiveWeek})`);
            return { segments: [], source: 'rotation', reason: null };
        }

        // Ensure segments are sorted
        const sortedRotation = JSON.parse(JSON.stringify(definition.structure)).sort((a, b) => a.start_min - b.start_min);
        return { segments: sortedRotation, source: 'rotation', reason: null };
    };

    // V15.5.1 Helper: Duplicated from RotationEditor for use in calculateSegments
    const findWeekKey = (patternData, weekNumber) => {
        const keys = Object.keys(patternData);
        // Find the key that matches the week number using the robust regex
        return keys.find(k => {
            const match = k.match(/^Week ?(\d+)$/i);
            return match && parseInt(match[1], 10) === weekNumber;
        });
    };

    // --- INTRADAY INDICATORS (Daily View Only) ---
    
    const setupIntradayIndicators = (ELS_DAILY) => {
       // Clear previous interval to prevent stacking
       if (timeIndicatorInterval) clearInterval(timeIndicatorInterval);
       // Update current time indicator every minute
       timeIndicatorInterval = setInterval(() => updateCurrentTimeIndicator(ELS_DAILY), 60000);
       updateCurrentTimeIndicator(ELS_DAILY);

       // Setup mouse tracking for precision cursor
       if (ELS_DAILY.timelineContainer) {
           ELS_DAILY.timelineContainer.addEventListener('mousemove', (e) => updateMouseTimeIndicator(e, ELS_DAILY));
           ELS_DAILY.timelineContainer.addEventListener('mouseenter', () => showMouseIndicator(ELS_DAILY));
           ELS_DAILY.timelineContainer.addEventListener('mouseleave', () => hideMouseIndicator(ELS_DAILY));
       }
   };
   
   const updateCurrentTimeIndicator = (ELS_DAILY) => {
       if (!ELS_DAILY || !ELS_DAILY.currentTimeIndicator || !ELS_DAILY.timelineContainer) return;

        // NOTE: This relies on the client's local time.
       const now = new Date();
       
       const STATE = APP.StateManager.getState();
       // Get the specific date ISO for the selected day in the view
       const viewDateISO = APP.Utils.getISODateForDayName(STATE.weekStart, STATE.selectedDay);
       const todayISO = APP.Utils.formatDateToISO(now);

       // Only show if the view is 'daily' AND the date being viewed is today's date
       if (STATE.scheduleViewMode !== 'daily' || viewDateISO !== todayISO) {
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
       // Use offsetWidth for accurate measurement of the sticky name column
       const nameColWidth = nameColElement ? nameColElement.offsetWidth : 220;

       ELS_DAILY.currentTimeIndicator.style.display = 'block';
       // Position correctly relative to the start of the container, accounting for the name column width
       ELS_DAILY.currentTimeIndicator.style.left = `calc(${nameColWidth}px + ${pct}%)`;
   };

   const updateMouseTimeIndicator = (e, ELS_DAILY) => {
       if (!ELS_DAILY || !ELS_DAILY.mouseTimeIndicator || !ELS_DAILY.timelineContainer) return;

       const containerRect = ELS_DAILY.timelineContainer.getBoundingClientRect();
       // Calculate mouse position relative to the container, accounting for scrolling
       const mouseX = e.clientX - containerRect.left + ELS_DAILY.timelineContainer.scrollLeft;
       
       const nameColElement = ELS_DAILY.timelineContainer.querySelector('.header-name');
       const nameColWidth = nameColElement ? nameColElement.offsetWidth : 220;
       const headerHeight = ELS_DAILY.timeHeader ? ELS_DAILY.timeHeader.offsetHeight : 48;

       // Hide if the mouse is over the name column
       if (mouseX < nameColWidth) {
           hideMouseIndicator(ELS_DAILY);
           return;
       }

       // Calculate the width of the actual timeline track area
       const trackWidth = ELS_DAILY.timeHeader.offsetWidth;
       const relativeX = mouseX - nameColWidth;
       
       // Calculate time based on percentage position within the track
       const pct = relativeX / trackWidth;
       
       // Constrain percentage between 0 and 1
       const constrainedPct = Math.max(0, Math.min(1, pct));
       
       const timeInMinutes = Config.TIMELINE_START_MIN + (constrainedPct * Config.TIMELINE_DURATION_MIN);

       // Position the vertical line at the mouse X position
       ELS_DAILY.mouseTimeIndicator.style.left = `${mouseX}px`;
       
       // Update and position the tooltip
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
 * The main application controller responsible for initialization, global event wiring, and rendering coordination.
 */
(function(APP) {
    const Core = {};
    const ELS = {};

    // This function is exposed so init.js can call it.
    Core.initialize = async () => {
        console.log("WFM Intelligence Platform (v15.5.2) Initializing...");
        
        // Initialize foundational services
        APP.Utils.cacheDOMElements();
        if (!APP.DataService.initialize()) {
            console.error("Fatal Error: DataService failed to initialize.");
            return;
        }

        // Cache Core DOM elements
        cacheCoreDOMElements();
        
        // Set the default week to the current week
        setDefaultWeek();

        // Load data
        const initialData = await APP.DataService.loadCoreData();
        if (!initialData) {
            console.error("Fatal Error: Failed to load core data.");
             if (document.body) {
                document.body.innerHTML = "<h1>Fatal Error: Failed to load core data from database. Check connection.</h1>";
            }
            return;
        }

        // Initialize State Manager
        APP.StateManager.initialize(initialData);

        // Initialize UI Components
        try {
            APP.Components.ComponentManager.initialize();
            APP.Components.AssignmentManager.initialize();
            // V15.1: Initialize the shared builder first
            APP.Components.SequentialBuilder.initialize(); 
            APP.Components.ShiftDefinitionEditor.initialize();
            APP.Components.RotationEditor.initialize();
            APP.Components.ScheduleViewer.initialize();
        } catch (error) {
            console.error("CRITICAL ERROR during UI Component Initialization:", error);
            APP.Utils.showToast("Fatal Error during UI initialization. Check console logs.", "danger", 10000);
            return; 
        }

        // Render all components
        Core.renderAll();

        // Wire global event handlers
        wireGlobalEvents();
        
        console.log("Initialization complete.");
    };

    const cacheCoreDOMElements = () => {
        ELS.weekStart = document.getElementById('weekStart');
        ELS.prevWeek = document.getElementById('prevWeek');
        ELS.nextWeek = document.getElementById('nextWeek');
        ELS.btnUndo = document.getElementById('btnUndo');
        ELS.btnRedo = document.getElementById('btnRedo');
        ELS.tabNav = document.getElementById('main-navigation');
        ELS.tabs = document.querySelectorAll('.tab-content');
    };

    // Set the default week view to the Monday of the current week.
    const setDefaultWeek = () => {
        let d = new Date();
        let day = d.getDay();
        // Calculate the date of the current week's Monday
        let diff = d.getDate() - day + (day === 0 ? -6 : 1);
        const localMonday = new Date(d.getFullYear(), d.getMonth(), diff);
        
        // Format as YYYY-MM-DD and set in state
        APP.StateManager.getState().weekStart = APP.Utils.formatDateToISO(localMonday);
    };

    const wireGlobalEvents = () => {
        // Week Navigation
        if (ELS.weekStart) {
            if (typeof flatpickr !== 'function') {
                console.error("CRITICAL ERROR: flatpickr library not loaded (Global Events).");
            } else {
                // Configure Week Picker (Flatpickr)
                flatpickr(ELS.weekStart, {
                    dateFormat: "Y-m-d", // ISO format for consistency
                    defaultDate: APP.StateManager.getState().weekStart,
                    "locale": { "firstDayOfWeek": 1 }, // Monday start
                    onChange: (selectedDates, dateStr) => {
                        // Update state and re-render visualization on date change
                        APP.StateManager.getState().weekStart = dateStr;
                        APP.Components.ScheduleViewer.render();
                    }
                });
            }
        }
        if (ELS.prevWeek) ELS.prevWeek.addEventListener('click', () => updateWeek(-7));
        if (ELS.nextWeek) ELS.nextWeek.addEventListener('click', () => updateWeek(7));

        // Undo/Redo
        if (ELS.btnUndo) ELS.btnUndo.addEventListener('click', () => APP.StateManager.applyHistory('undo'));
        if (ELS.btnRedo) ELS.btnRedo.addEventListener('click', () => APP.StateManager.applyHistory('redo'));

        // Tab Navigation
        if (ELS.tabNav) ELS.tabNav.addEventListener('click', handleTabNavigation);
    };
    
    const handleTabNavigation = (e) => {
        const target = e.target.closest('.tab-link');
        if (target && !target.classList.contains('disabled')) {
            const tabId = target.dataset.tab;
            
            // Deactivate all tabs and links
            ELS.tabNav.querySelectorAll('.tab-link').forEach(t => t.classList.remove('active'));
            ELS.tabs.forEach(t => t.classList.remove('active'));
            
            // Activate the selected one
            target.classList.add('active');
            const activeTab = document.getElementById(tabId);
            if (activeTab) activeTab.classList.add('active');
            
            // Force re-render on tab switch to ensure visualization is updated correctly
            if (tabId === 'tab-schedule-view') {
                APP.Components.ScheduleViewer.render();
            }
        }
    };

    const updateWeek = (days) => {
        if (!ELS.weekStart || !ELS.weekStart._flatpickr) return;

        const flatpickrInstance = ELS.weekStart._flatpickr;
        
        const currentDate = flatpickrInstance.selectedDates[0] || new Date();
        currentDate.setDate(currentDate.getDate() + days);
        // Set the new date and trigger the onChange event
        flatpickrInstance.setDate(currentDate, true);
    };

    // Expose function to update Undo/Redo button states
    Core.updateUndoRedoButtons = (index, length) => {
        if (ELS.btnUndo) ELS.btnUndo.disabled = index <= 0;
        if (ELS.btnRedo) ELS.btnRedo.disabled = index >= length - 1;
    };

    // Expose function to trigger a full application re-render
    Core.renderAll = () => {
        if (!APP.StateManager.getState().isBooted) return;
        APP.Components.ComponentManager.render();
        APP.Components.AssignmentManager.render();
        APP.Components.ShiftDefinitionEditor.render();
        APP.Components.RotationEditor.render();
        APP.Components.ScheduleViewer.render();
    };

    APP.Core = Core;
}(window.APP));
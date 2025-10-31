/**
 * WFM Intelligence Platform - Application Logic (v14.0)
 * 
 * Modular architecture. Includes Precision Time Cursor and Extended Timeline.
 */

// Global Namespace Initialization
window.APP = window.APP || {};

/**
 * MODULE: APP.Config
 * V14.0 Update: Extended Timeline to 23:00.
 */
(function(APP) {
    const Config = {};

    // Supabase Configuration (Centralized)
    Config.SUPABASE_URL = "https://oypdnjxhjpgpwmkltzmk.supabase.co";
    Config.SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im95cGRuanhoanBncHdta2x0em1rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk4Nzk0MTEsImV4cCI6MjA3NTQ1NTQxMX0.Hqf1L4RHpIPUD4ut2uVsiGDsqKXvAjdwKuotmme4_Is";

    // V14.0: Timeline Visualization Constants (Extended to 23:00)
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
 * (No significant changes, included for completeness)
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
 * (No significant changes, included for completeness)
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
        selectedDay: 'Monday', // Default view
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
 * (No significant changes, included for completeness)
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
        // Basic prompt interface remains for simplicity as requested previously
        const name = prompt("Enter component name:");
        if (!name) return;
        const type = prompt("Enter type (Activity, Break, Lunch, Shrinkage, Absence):", "Activity");
        const color = prompt("Enter hex color code:", "#3498db");
        const duration = parseInt(prompt("Enter default duration in minutes:", "60"), 10);
        const isPaid = confirm("Is this a paid activity?");

        if (!name || !type || !color || isNaN(duration)) return;

        const newComponent = { name, type, color, default_duration_min: duration, is_paid: isPaid };

        const { data, error } = await APP.DataService.saveRecord('schedule_components', newComponent);
        if (!error) {
            APP.StateManager.syncRecord('scheduleComponents', data);
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

        const { error } = await APP.DataService.deleteRecord('schedule_components', { id });
        if (!error) {
            APP.StateManager.syncRecord('scheduleComponents', { id }, true);
            APP.Utils.showToast(`Component deleted.`, "success");
            ComponentManager.render();
        }
    };

    APP.Components = APP.Components || {};
    APP.Components.ComponentManager = ComponentManager;
}(window.APP));


/**
 * MODULE: APP.Components.AssignmentManager
 * (No significant changes, included for completeness)
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
            const startDate = (assignment && assignment.start_date) ? assignment.start_date : '';
            
            html += `<tr data-advisor-id="${adv.id}">
                <td>${adv.name}</td>
                <td><select class="form-select assign-rotation" data-advisor-id="${adv.id}"><option value="">-- None --</option>${patternOpts}</select></td>
                <td><input type="text" class="form-input assign-start-date" data-advisor-id="${adv.id}" value="${startDate}" /></td>
            </tr>`;
        });
        html += '</tbody></table>';
        ELS.grid.innerHTML = html;

        // Initialize Flatpickr and set dropdown values
        advisors.forEach(adv => {
            const assignment = APP.StateManager.getAssignmentForAdvisor(adv.id);
            const row = ELS.grid.querySelector(`tr[data-advisor-id="${adv.id}"]`);
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
                        // Use the dedicated handler for date changes
                        handleAssignmentUpdate(instance.element.dataset.advisorId, 'start_date', dateStr);
                    }
                });
            }
        });
    };

    const handleChange = (e) => {
        if (e.target.classList.contains('assign-rotation')) {
            handleAssignmentUpdate(e.target.dataset.advisorId, 'rotation_name', e.target.value);
        }
    };

    const handleAssignmentUpdate = async (advisorId, field, value) => {
        let assignment = APP.StateManager.getAssignmentForAdvisor(advisorId);
        
        if (!assignment) {
            // If no assignment exists, create a base object for upsert
            assignment = { advisor_id: advisorId, rotation_name: null, start_date: null };
        }
        
        // Create the record for the database operation
        const recordToSave = { ...assignment, [field]: value || null };

        // Use DataService for persistence
        const { data, error } = await APP.DataService.saveRecord('rotation_assignments', recordToSave, 'advisor_id');
        
        if (!error) {
            // Sync the state with the definitive data returned from DB
            const STATE = APP.StateManager.getState();
            const index = STATE.rotationAssignments.findIndex(a => a.advisor_id === advisorId);
            if (index > -1) {
                STATE.rotationAssignments[index] = data;
            } else {
                STATE.rotationAssignments.push(data);
            }

            APP.StateManager.saveHistory('Update assignment');
            // Re-render the main schedule view as assignments affect visualization
            APP.Components.ScheduleViewer.render();
        }
    };

    APP.Components = APP.Components || {};
    APP.Components.AssignmentManager = AssignmentManager;
}(window.APP));


/**
 * MODULE: APP.Components.ShiftDefinitionEditor (Sequential Builder)
 * (No significant changes, included for completeness)
 */
(function(APP) {
    const ShiftDefinitionEditor = {};
    const ELS = {};
    
    // State specific to the Sequential Builder Modal
    const EDITOR_STATE = {
        isOpen: false,
        shiftDefinitionId: null,
        startTimeMin: 480, // Default 8:00 AM
        segments: [], // { component_id, duration_min }
    };

    ShiftDefinitionEditor.initialize = () => {
        ELS.grid = document.getElementById('shiftDefinitionsGrid');
        ELS.btnNew = document.getElementById('btnNewShiftDefinition');
        
        // Modal Elements
        ELS.modal = document.getElementById('shiftBuilderModal');
        ELS.modalTitle = document.getElementById('modalTitle');
        ELS.modalClose = document.getElementById('modalClose');
        ELS.modalStartTime = document.getElementById('modalStartTime');
        ELS.modalAddActivity = document.getElementById('modalAddActivity');
        ELS.modalSequenceBody = document.getElementById('modalSequenceBody');
        ELS.modalTotalTime = document.getElementById('modalTotalTime');
        ELS.modalPaidTime = document.getElementById('modalPaidTime');
        ELS.modalSaveStructure = document.getElementById('modalSaveStructure');

        if (ELS.btnNew) ELS.btnNew.addEventListener('click', handleNewDefinition);
        if (ELS.grid) ELS.grid.addEventListener('click', handleGridClick);
        
        // Modal Event Listeners
        if (ELS.modalClose) ELS.modalClose.addEventListener('click', closeShiftBuilderModal);
        if (ELS.modalAddActivity) ELS.modalAddActivity.addEventListener('click', handleAddActivityToSequence);
        if (ELS.modalSaveStructure) ELS.modalSaveStructure.addEventListener('click', handleSaveShiftStructure);
        if (ELS.modalSequenceBody) {
            ELS.modalSequenceBody.addEventListener('change', handleSequenceChange);
            ELS.modalSequenceBody.addEventListener('click', handleSequenceClick);
        }

        // Initialize Time Picker
        if (ELS.modalStartTime) {
            flatpickr(ELS.modalStartTime, {
                enableTime: true,
                noCalendar: true,
                dateFormat: "H:i",
                time_24hr: true,
                minuteIncrement: 5, // Increased precision
                onChange: (selectedDates, dateStr) => {
                    const [h, m] = dateStr.split(':').map(Number);
                    EDITOR_STATE.startTimeMin = h * 60 + m;
                    renderSequentialEditor(); // Recalculate on start time change
                }
            });
        }
    };

    ShiftDefinitionEditor.render = () => {
        if (!ELS.grid) return;
        const STATE = APP.StateManager.getState();
        const definitions = STATE.shiftDefinitions.sort((a,b) => a.name.localeCompare(b.name));

        let html = '<table><thead><tr><th>Code</th><th>Name</th><th>Total Duration</th><th>Paid Duration</th><th>Actions</th></tr></thead><tbody>';

        definitions.forEach(def => {
            let totalDuration = 0;
            let paidDuration = 0;

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
        const name = prompt("Enter the full name (e.g., 'Early 7am-4pm Flex'):");
        if (!name) return;
        const code = prompt("Enter a unique shortcode (e.g., 'E74F'):");
        if (!code) return;

        if (APP.StateManager.getShiftDefinitionByCode(code)) {
            APP.Utils.showToast("Error: Code already exists.", "danger");
            return;
        }

        const newDefinition = { name, code, structure: [] };

        const { data, error } = await APP.DataService.saveRecord('shift_definitions', newDefinition);
        if (!error) {
            APP.StateManager.syncRecord('shiftDefinitions', data);
            APP.StateManager.saveHistory("Create Shift Definition");
            APP.Utils.showToast(`Shift '${name}' created. Now click 'Edit Structure'.`, "success");
            ShiftDefinitionEditor.render();
            APP.Components.RotationEditor.renderGrid(); // Update rotation dropdowns
        }
    };

    const handleGridClick = (e) => {
        if (e.target.classList.contains('edit-structure')) {
            openShiftBuilderModal(e.target.dataset.definitionId);
        } else if (e.target.classList.contains('delete-definition')) {
            handleDeleteDefinition(e.target.dataset.definitionId);
        }
    };

    const handleDeleteDefinition = async (id) => {
        const definition = APP.StateManager.getShiftDefinitionById(id);
        if (!definition || !confirm(`Delete '${definition.name}' (${definition.code})?`)) return;

        const { error } = await APP.DataService.deleteRecord('shift_definitions', { id });
        if (!error) {
            APP.StateManager.syncRecord('shiftDefinitions', { id }, true);
            APP.StateManager.saveHistory("Delete Shift Definition");
            APP.Utils.showToast(`Shift deleted.`, "success");
            ShiftDefinitionEditor.render();
            APP.Components.RotationEditor.renderGrid(); // Update rotation dropdowns
        }
    };

    // --- Sequential Builder Modal Logic ---

    const openShiftBuilderModal = (id) => {
        const definition = APP.StateManager.getShiftDefinitionById(id);
        if (!definition) return;

        // Convert absolute times (stored format) to sequential format (editor format)
        const sequentialSegments = [];
        let startTimeMin = 480; 

        if (definition.structure && definition.structure.length > 0) {
            definition.structure.sort((a, b) => a.start_min - b.start_min);
            startTimeMin = definition.structure[0].start_min;
            
            definition.structure.forEach(seg => {
                sequentialSegments.push({
                    component_id: seg.component_id,
                    duration_min: seg.end_min - seg.start_min
                });
            });
        }

        // Set EDITOR_STATE
        EDITOR_STATE.isOpen = true;
        EDITOR_STATE.shiftDefinitionId = id;
        EDITOR_STATE.startTimeMin = startTimeMin;
        // Deep copy segments to prevent mutation before save
        EDITOR_STATE.segments = JSON.parse(JSON.stringify(sequentialSegments));

        // Initialize UI
        ELS.modalTitle.textContent = `Sequential Builder: ${definition.name} (${definition.code})`;
        if (ELS.modalStartTime._flatpickr) {
            ELS.modalStartTime._flatpickr.setDate(APP.Utils.formatMinutesToTime(startTimeMin), false);
        }
        
        renderSequentialEditor();
        ELS.modal.style.display = 'flex';
    };

    const closeShiftBuilderModal = () => {
        EDITOR_STATE.isOpen = false;
        ELS.modal.style.display = 'none';
    };

    // Renders the dynamic sequence grid (The Ripple Effect)
    const renderSequentialEditor = () => {
        let html = '';
        let currentTime = EDITOR_STATE.startTimeMin;
        let totalDuration = 0;
        let paidDuration = 0;
        const STATE = APP.StateManager.getState();

        // Generate component options HTML
        const componentOptions = STATE.scheduleComponents
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(c => `<option value="${c.id}">${c.name} (${c.type})</option>`)
            .join('');

        EDITOR_STATE.segments.forEach((seg, index) => {
            const component = APP.StateManager.getComponentById(seg.component_id);
            
            // Calculate times dynamically
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

        // Set selected values for dropdowns
        EDITOR_STATE.segments.forEach((seg, index) => {
            const selectEl = ELS.modalSequenceBody.querySelector(`.sequence-component[data-index="${index}"]`);
            if (selectEl) {
                selectEl.value = seg.component_id || '';
            }
        });

        ELS.modalTotalTime.textContent = APP.Utils.formatDuration(totalDuration);
        ELS.modalPaidTime.textContent = APP.Utils.formatDuration(paidDuration);
    };

    const handleAddActivityToSequence = () => {
        EDITOR_STATE.segments.push({ component_id: null, duration_min: 60 });
        renderSequentialEditor();
    };

    const handleSequenceChange = (e) => {
        const target = e.target;
        const index = parseInt(target.dataset.index, 10);
        if (isNaN(index)) return;

        if (target.classList.contains('sequence-component')) {
            const componentId = target.value;
            EDITOR_STATE.segments[index].component_id = componentId || null;
            
            // Auto-set default duration
            const component = APP.StateManager.getComponentById(componentId);
            if (component) {
                EDITOR_STATE.segments[index].duration_min = component.default_duration_min;
            }

        } else if (target.classList.contains('sequence-duration')) {
            const duration = parseInt(target.value, 10);
            if (isNaN(duration) || duration < 5) {
                target.value = EDITOR_STATE.segments[index].duration_min; // Revert display
                return; 
            }
            EDITOR_STATE.segments[index].duration_min = duration;
        }
        renderSequentialEditor(); // Recalculate ripple effect
    };

    const handleSequenceClick = (e) => {
        if (e.target.classList.contains('delete-sequence-item')) {
            const index = parseInt(e.target.dataset.index, 10);
            EDITOR_STATE.segments.splice(index, 1);
            renderSequentialEditor(); // Recalculate ripple effect
        }
    };

    const handleSaveShiftStructure = async () => {
        const { shiftDefinitionId, segments, startTimeMin } = EDITOR_STATE;
        
        // Convert sequential format back to absolute time format (required for storage/visualization)
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

        // Persist using DataService
        const { data, error } = await APP.DataService.updateRecord('shift_definitions', { structure: absoluteTimeSegments }, { id: shiftDefinitionId });
        
        if (!error) {
            APP.StateManager.syncRecord('shiftDefinitions', data);
            APP.StateManager.saveHistory("Update Shift Structure");
            APP.Utils.showToast("Shift structure saved successfully.", "success");
            ShiftDefinitionEditor.render();
            APP.Components.ScheduleViewer.render(); // Re-render visualization
            closeShiftBuilderModal();
        }
    };

    APP.Components = APP.Components || {};
    APP.Components.ShiftDefinitionEditor = ShiftDefinitionEditor;
}(window.APP));


/**
 * MODULE: APP.Components.RotationEditor
 * (No significant changes, included for completeness)
 */
(function(APP) {
    const RotationEditor = {};
    const ELS = {};

    RotationEditor.initialize = () => {
        ELS.familySelect = document.getElementById('rotationFamily');
        ELS.btnNew = document.getElementById('btnNewRotation');
        ELS.btnDelete = document.getElementById('btnDeleteRotation');
        ELS.grid = document.getElementById('rotationGrid');

        if (ELS.familySelect) ELS.familySelect.addEventListener('change', handleFamilyChange);
        if (ELS.btnNew) ELS.btnNew.addEventListener('click', handleNewRotation);
        if (ELS.btnDelete) ELS.btnDelete.addEventListener('click', handleDeleteRotation);
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
        ELS.grid.innerHTML = html;
        
        // Set selected values
        if (pattern) {
            weeks.forEach(w => {
                days.forEach((d, i) => {
                    const dow = i + 1;
                    const weekData = patternData[`Week ${w}`] || {};
                    const code = weekData[dow] || ''; 
                    const sel = ELS.grid.querySelector(`select[data-week="${w}"][data-dow="${dow}"]`);
                    if (sel) {
                        sel.value = code;
                    }
                });
            });
        }
    };

    const handleFamilyChange = () => {
        APP.StateManager.getState().currentRotation = ELS.familySelect.value;
        RotationEditor.renderGrid();
    };

    const handleNewRotation = async () => {
        const name = prompt("Enter a name for the new rotation family:");
        if (!name || APP.StateManager.getPatternByName(name)) return;
        
        const newPattern = { name: name, pattern: {} };
        const { data, error } = await APP.DataService.saveRecord('rotation_patterns', newPattern);
        
        if (!error) {
            APP.StateManager.syncRecord('rotationPatterns', data);
            APP.StateManager.getState().currentRotation = name;
            APP.StateManager.saveHistory(`Create rotation`);
            APP.Utils.showToast(`Rotation '${name}' created.`, "success");
            RotationEditor.render();
        }
    };

    const handleDeleteRotation = async () => {
        const STATE = APP.StateManager.getState();
        const rotationName = STATE.currentRotation;
        if (!rotationName || !confirm(`Delete '${rotationName}'?`)) return;
        
        const { error } = await APP.DataService.deleteRecord('rotation_patterns', { name: rotationName });
        
        if (!error) {
            APP.StateManager.syncRecord('rotationPatterns', { name: rotationName }, true);
            STATE.currentRotation = null;
            APP.StateManager.saveHistory(`Delete rotation`);
            APP.Utils.showToast(`Rotation deleted.`, "success");
            RotationEditor.render();
        }
    };

    // Auto-save functionality when a dropdown changes
    const handleGridChange = async (e) => {
        if (!e.target.classList.contains('rotation-grid-select')) return;
        
        const { week, dow } = e.target.dataset;
        const shiftCode = e.target.value;
        const STATE = APP.StateManager.getState();
        const rotationName = STATE.currentRotation;
        
        const pattern = APP.StateManager.getPatternByName(rotationName);
        if (!pattern) return;
        
        // 1. Update the local state object (required for history snapshot)
        if (!pattern.pattern) pattern.pattern = {};
        const weekKey = `Week ${week}`;
        if (!pattern.pattern[weekKey]) pattern.pattern[weekKey] = {};
        
        if (shiftCode) {
            pattern.pattern[weekKey][dow] = shiftCode;
        } else {
            delete pattern.pattern[weekKey][dow]; // RDO
        }

        // 2. Auto-save the entire pattern object
        const { error } = await APP.DataService.updateRecord('rotation_patterns', { pattern: pattern.pattern }, { name: rotationName });
            
        if (!error) {
            APP.StateManager.saveHistory(`Update rotation cell`);
            // Re-render visualization as the schedule has changed
            APP.Components.ScheduleViewer.render();
        } else {
            // If save fails, the DataService already showed a toast.
            APP.Utils.showToast("Failed to auto-save rotation change.", "danger");
        }
    };

    APP.Components = APP.Components || {};
    APP.Components.RotationEditor = RotationEditor;
}(window.APP));


/**
 * MODULE: APP.Components.ScheduleViewer
 * V14.0 Update: Implements Precision Time Cursor and updates visualization for 06:00-23:00.
 */
(function(APP) {
    const ScheduleViewer = {};
    const ELS = {};
    const Config = APP.Config;
    let timeIndicatorInterval = null;

    ScheduleViewer.initialize = () => {
        ELS.tree = document.getElementById('schedulesTree');
        ELS.treeSearch = document.getElementById('treeSearch');
        ELS.btnClearSelection = document.getElementById('btnClearSelection');
        ELS.plannerDay = document.getElementById('plannerDay');
        ELS.timeHeader = document.getElementById('timeHeader');
        ELS.plannerBody = document.getElementById('plannerBody');
        ELS.timelineContainer = document.getElementById('timelineContainer');
        ELS.currentTimeIndicator = document.getElementById('currentTimeIndicator');
        
        // V14.0: Precision Cursor Elements
        ELS.mouseTimeIndicator = document.getElementById('mouseTimeIndicator');
        ELS.mouseTimeTooltip = document.getElementById('mouseTimeTooltip');

        if (ELS.treeSearch) ELS.treeSearch.addEventListener('input', renderTree);
        if (ELS.btnClearSelection) ELS.btnClearSelection.addEventListener('click', clearSelection);
        if (ELS.tree) ELS.tree.addEventListener('change', handleTreeChange);
        if (ELS.plannerDay) ELS.plannerDay.addEventListener('change', () => {
            APP.StateManager.getState().selectedDay = ELS.plannerDay.value;
            renderPlanner();
            updateCurrentTimeIndicator();
        });

        // Initialize Intraday Time Indicator (Red Line)
        if (timeIndicatorInterval) clearInterval(timeIndicatorInterval);
        timeIndicatorInterval = setInterval(updateCurrentTimeIndicator, 60000);
        updateCurrentTimeIndicator();

        // V14.0: Initialize Precision Time Cursor (Mouse Follower)
        if (ELS.timelineContainer) {
            ELS.timelineContainer.addEventListener('mousemove', updateMouseTimeIndicator);
            ELS.timelineContainer.addEventListener('mouseenter', showMouseIndicator);
            ELS.timelineContainer.addEventListener('mouseleave', hideMouseIndicator);
        }
    };

    ScheduleViewer.render = () => {
        renderTree();
        renderPlanner();
    };

    // (renderTree, handleTreeChange, clearSelection remain the same)
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

    const renderPlanner = () => {
        if (!ELS.timeHeader || !ELS.plannerBody) return;
        
        renderTimeHeader(ELS.timeHeader);
        
        const STATE = APP.StateManager.getState();
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
        updateCurrentTimeIndicator(); // Ensure indicator position is correct after render
    };

    // V14.0: Updated for 06:00-23:00
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

    const renderSegmentsForAdvisor = (advisorId) => {
        const segments = calculateSegmentsForAdvisor(advisorId);
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

    // (calculateSegmentsForAdvisor remains the same)
    const calculateSegmentsForAdvisor = (advisorId) => {
         const STATE = APP.StateManager.getState();
        const assignment = APP.StateManager.getAssignmentForAdvisor(advisorId);
        
        if (!assignment || !assignment.rotation_name || !assignment.start_date || !STATE.weekStart) return [];

        const effectiveWeek = APP.Utils.getEffectiveWeek(assignment.start_date, STATE.weekStart, assignment, APP.StateManager.getPatternByName);
        if (effectiveWeek === null) return [];
        
        const dayOfWeek = STATE.selectedDay;
        const dayIndex = (['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].indexOf(dayOfWeek) + 1).toString();

        const pattern = APP.StateManager.getPatternByName(assignment.rotation_name);
        if (!pattern || !pattern.pattern) return [];
        
        const weekPattern = pattern.pattern[`Week ${effectiveWeek}`] || {};
        const shiftCode = weekPattern[dayIndex];

        if (!shiftCode) return []; // RDO

        const definition = APP.StateManager.getShiftDefinitionByCode(shiftCode);
        if (!definition || !definition.structure) return [];

        return definition.structure;
    };

    // Intraday Time Indicator (Red Line)
    const updateCurrentTimeIndicator = () => {
        if (!ELS.currentTimeIndicator || !ELS.timelineContainer) return;

        const now = new Date();
        const currentDayName = now.toLocaleDateString('en-US', { weekday: 'long' });
        const STATE = APP.StateManager.getState();

        if (currentDayName !== STATE.selectedDay) {
            ELS.currentTimeIndicator.style.display = 'none';
            return;
        }

        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        
        if (currentMinutes < Config.TIMELINE_START_MIN || currentMinutes > Config.TIMELINE_END_MIN) {
            ELS.currentTimeIndicator.style.display = 'none';
            return;
        }

        const pct = ((currentMinutes - Config.TIMELINE_START_MIN) / Config.TIMELINE_DURATION_MIN) * 100;
        
        const nameColElement = ELS.timelineContainer.querySelector('.header-name');
        const nameColWidth = nameColElement ? nameColElement.offsetWidth : 220;

        ELS.currentTimeIndicator.style.display = 'block';
        ELS.currentTimeIndicator.style.left = `calc(${nameColWidth}px + ${pct}%)`;
    };

    // V14.0: Precision Time Cursor (Mouse Follower)
    const updateMouseTimeIndicator = (e) => {
        if (!ELS.mouseTimeIndicator || !ELS.timelineContainer) return;

        const containerRect = ELS.timelineContainer.getBoundingClientRect();
        // Calculate mouseX relative to the container, accounting for horizontal scroll
        const mouseX = e.clientX - containerRect.left + ELS.timelineContainer.scrollLeft;
        
        const nameColElement = ELS.timelineContainer.querySelector('.header-name');
        const nameColWidth = nameColElement ? nameColElement.offsetWidth : 220;
        const headerHeight = ELS.timeHeader ? ELS.timeHeader.offsetHeight : 48;

        // Hide if over the names column
        if (mouseX < nameColWidth) {
            hideMouseIndicator();
            return;
        }

        // Calculate time based on mouse position within the track area
        // Use scrollWidth for the total width of the track
        const trackWidth = ELS.timelineContainer.scrollWidth - nameColWidth;
        const relativeX = mouseX - nameColWidth;
        const pct = relativeX / trackWidth;
        const timeInMinutes = Config.TIMELINE_START_MIN + (pct * Config.TIMELINE_DURATION_MIN);

        // Update line position
        ELS.mouseTimeIndicator.style.left = `${mouseX}px`;
        
        // Update tooltip position and text
        ELS.mouseTimeTooltip.textContent = APP.Utils.formatMinutesToTime(timeInMinutes);
        // Position tooltip slightly above the header area
        ELS.mouseTimeTooltip.style.top = `${headerHeight - 30}px`; 
        ELS.mouseTimeTooltip.style.left = `${mouseX}px`;
    };

    const showMouseIndicator = () => {
        if (ELS.mouseTimeIndicator) ELS.mouseTimeIndicator.style.display = 'block';
        if (ELS.mouseTimeTooltip) ELS.mouseTimeTooltip.style.display = 'block';
    };

    const hideMouseIndicator = () => {
        if (ELS.mouseTimeIndicator) ELS.mouseTimeIndicator.style.display = 'none';
        if (ELS.mouseTimeTooltip) ELS.mouseTimeTooltip.style.display = 'none';
    };


    APP.Components = APP.Components || {};
    APP.Components.ScheduleViewer = ScheduleViewer;
}(window.APP));


/**
 * MODULE: APP.Core
 * Description: Main application controller, handles navigation, initialization, and event wiring.
 */
(function(APP) {
    const Core = {};
    const ELS = {};

    // This function is exposed so init.js can call it.
    Core.initialize = async () => {
        console.log("WFM Intelligence Platform (v14.0) Initializing...");
        
        // Initialize foundational services
        APP.Utils.cacheDOMElements();
        if (!APP.DataService.initialize()) {
            console.error("Fatal Error: DataService failed to initialize.");
            return;
        }

        // Cache Core DOM elements
        cacheCoreDOMElements();
        
        // Set the default week
        setDefaultWeek();

        // Load data
        const initialData = await APP.DataService.loadCoreData();
        if (!initialData) {
            console.error("Fatal Error: Failed to load core data.");
            return;
        }

        // Initialize State Manager
        APP.StateManager.initialize(initialData);

        // Initialize UI Components
        APP.Components.ComponentManager.initialize();
        APP.Components.AssignmentManager.initialize();
        APP.Components.ShiftDefinitionEditor.initialize();
        APP.Components.RotationEditor.initialize();
        APP.Components.ScheduleViewer.initialize();

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

    const setDefaultWeek = () => {
        let d = new Date();
        let day = d.getDay();
        let diff = d.getDate() - day + (day === 0 ? -6 : 1);
        const localMonday = new Date(d.getFullYear(), d.getMonth(), diff);
        const y = localMonday.getFullYear();
        const m = String(localMonday.getMonth() + 1).padStart(2, '0');
        const dStr = String(localMonday.getDate()).padStart(2, '0');
        APP.StateManager.getState().weekStart = `${y}-${m}-${dStr}`;
    };

    const wireGlobalEvents = () => {
        // Week Navigation
        if (ELS.weekStart) {
            flatpickr(ELS.weekStart, {
                dateFormat: "Y-m-d",
                defaultDate: APP.StateManager.getState().weekStart,
                "locale": { "firstDayOfWeek": 1 },
                onChange: (selectedDates, dateStr) => {
                    APP.StateManager.getState().weekStart = dateStr;
                    APP.Components.ScheduleViewer.render();
                }
            });
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
            
            ELS.tabNav.querySelectorAll('.tab-link').forEach(t => t.classList.remove('active'));
            ELS.tabs.forEach(t => t.classList.remove('active'));
            target.classList.add('active');
            const activeTab = document.getElementById(tabId);
            if (activeTab) activeTab.classList.add('active');
            
            // Ensure the ScheduleViewer updates its state if navigated back to
            if (tabId === 'tab-schedule-view') {
                APP.Components.ScheduleViewer.render();
            }
        }
    };

    const updateWeek = (days) => {
        const flatpickrInstance = ELS.weekStart._flatpickr;
        if (!flatpickrInstance) return;
        const currentDate = flatpickrInstance.selectedDates[0] || new Date();
        currentDate.setDate(currentDate.getDate() + days);
        flatpickrInstance.setDate(currentDate, true);
    };

    Core.updateUndoRedoButtons = (index, length) => {
        if (ELS.btnUndo) ELS.btnUndo.disabled = index <= 0;
        if (ELS.btnRedo) ELS.btnRedo.disabled = index >= length - 1;
    };

    // Centralized rendering function
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
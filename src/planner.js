/**
 * WFM Intelligence Platform - Application Logic (v15.8.3)
 * 
 * V15.8.3: Resolved "Edit Structure" button failure by restoring legacy editor support in SequentialBuilder and index.html.
 *          Implemented "Pending Changes" in AssignmentManager to fix button behavior and date synchronization issues.
 * V15.8.1: Added "Delete Last Week" functionality to Rotation Editor.
 *          Incorporated AssignmentManager sync fix (fetchSnapshotForAdvisor).
 *          Fixed error handling logic in DataService (insertError check).
 * V15.8:   CRITICAL FIX: Resolved major structural/syntax errors.
 *          CRITICAL FIX: Fixed Assignments tab "Button Spam".
 *          CRITICAL FIX: Implemented missing DataService functions for assignment history.
 */

// Global Namespace Initialization
window.APP = window.APP || {};

/**
 * MODULE: APP.Config
 */
(function(APP) {
    const Config = {};

    // Supabase Configuration (Centralized)
    // NOTE: These are placeholder credentials. Replace with environment variables in production.
    Config.SUPABASE_URL = "https://oypdnjxhjpgpwmkltzmk.supabase.co";
    Config.SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im95cGRuanhoanBncHdta2x0em1rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk4Nzk0MTEsImV4cCI6MjA3NTQ1NTQxMX0.Hqf1L4RHpIPUD4ut2uVsiGDsqKXvAjdwKuotmme4_Is";

    // Timeline Visualization Constants (05:00-23:00)
Config.TIMELINE_START_MIN = 5 * 60; // 05:00
Config.TIMELINE_END_MIN = 23 * 60; // 23:00
Config.TIMELINE_DURATION_MIN = Config.TIMELINE_END_MIN - Config.TIMELINE_START_MIN; // 18 hours

    APP.Config = Config;
}(window.APP));


/**
 * MODULE: APP.Utils
 * Utility functions for date handling, formatting, and UI feedback.
 * V16.13: Updated getEffectiveWeek to handle start_week_offset.
 */
(function(APP) {
    const Utils = {};
    
    const ELS = {}; // DOM Cache for Utils

    Utils.cacheDOMElements = () => {
        ELS.notificationContainer = document.getElementById('notification-container');
    };

    // Display a toast notification
    Utils.showToast = (message, type = "success", duration = 3000) => {
        if (!ELS.notificationContainer) Utils.cacheDOMElements();
        if (!ELS.notificationContainer) return;
        
        let toastClass = 'is-success';
        if (type === 'danger' || type === 'error' || type === 'warning') {
            toastClass = 'is-danger';
        }
        
        const toast = document.createElement('div');
        toast.className = `toast ${toastClass}`;
        toast.textContent = message;
        ELS.notificationContainer.appendChild(toast);
        
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
        if (roundedMinutes >= 1440) roundedMinutes -= 1440;
        const h = Math.floor(roundedMinutes / 60);
        const m = roundedMinutes % 60;
        if (m === 60) return `${String(h + 1).padStart(2, '0')}:00`;
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
            const brightness = ((r * 299) + (g * 587) + (b * 114)) / 1000;
            return (brightness > 128) ? '#000000' : '#FFFFFF';
        } catch (e) {
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

    // Converts yyyy-mm-dd (ISO format) to dd/mm/yyyy (UK format)
    Utils.convertISOToUKDate = (isoDateStr) => {
        if (!isoDateStr) return '';
        const parts = isoDateStr.split('-');
        if (parts.length !== 3) return isoDateStr;
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    };

    // Get ISO date for a specific day name within a given week (defined by weekStartISO)
    Utils.getISODateForDayName = (weekStartISO, dayName) => {
        if (!weekStartISO) return null;
        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        const dayIndex = days.indexOf(dayName);
        if (dayIndex === -1) return null;
        const [y, m, d] = weekStartISO.split('-').map(Number);
        const date = new Date(y, m - 1, d);
        date.setDate(date.getDate() + dayIndex);
        return Utils.formatDateToISO(date);
    };

    // Helper to format Date object to YYYY-MM-DD
    Utils.formatDateToISO = (dateObj) => {
         const yyyy = dateObj.getFullYear();
         const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
         const dd = String(dateObj.getDate()).padStart(2, '0');
         return `${yyyy}-${mm}-${dd}`;
    };

    // Helper to get the Monday ISO date for any given ISO date
    Utils.getMondayForDate = (isoDateStr) => {
        if (!isoDateStr || typeof isoDateStr !== 'string' || isoDateStr.split('-').length !== 3) {
            console.error("Invalid ISO date string provided to getMondayForDate:", isoDateStr);
            return null;
        }
        const [y, m, d] = isoDateStr.split('-').map(Number);
        const date = new Date(y, m - 1, d);
         if (isNaN(date.getTime())) {
            console.error("Invalid Date object created in getMondayForDate:", isoDateStr);
            return null;
        }
        const day = date.getDay();
        const diff = date.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(date.setDate(diff));
        return Utils.formatDateToISO(monday);
    };

     // Helper to get the Day Name from an ISO Date
    Utils.getDayNameFromISO = (isoDateStr) => {
        if (!isoDateStr) return null;
        try {
            const [y, m, d] = isoDateStr.split('-').map(Number);
            const dateObj = new Date(Date.UTC(y, m - 1, d));
            return dateObj.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
         } catch (err) {
             console.error("Error parsing date for getDayNameFromISO:", isoDateStr, err);
             return null;
         }
    };

    // Helper: Calculate the length (in weeks) of a rotation pattern
    Utils.calculateRotationLength = (pattern) => {
        let numWeeks = 0;
        if (pattern && pattern.pattern && Object.keys(pattern.pattern).length > 0) {
            const keys = Object.keys(pattern.pattern);
            const weekNumbers = keys.map(k => {
                const match = k.match(/^Week ?(\d+)$/i);
                return match ? parseInt(match[1], 10) : 0;
            });
            const maxWeek = Math.max(0, ...weekNumbers);
            if (maxWeek > 0) numWeeks = maxWeek;
        }
        return numWeeks;
    };

    // V16.13 FIX: Calculates effective week using the start_week_offset
    Utils.getEffectiveWeek = (weekStartISO, assignment, getPatternByName) => {
        try {
            if (!assignment || !assignment.start_date || !weekStartISO) return null;

            const [y1, m1, d1] = assignment.start_date.split('-').map(Number);
            const [y2, m2, d2] = weekStartISO.split('-').map(Number);

            if (isNaN(y1) || isNaN(y2)) return null; 
            
            const startUTC = Date.UTC(y1, m1 - 1, d1);
            const checkUTC = Date.UTC(y2, m2 - 1, d2);
            
            const diffTime = checkUTC - startUTC;
            if (diffTime < 0) return null; // Check week is before assignment started

            // Calculate 0-based week difference
            const diffWeeks = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 7));
            
            const pattern = getPatternByName(assignment.rotation_name);
            let numWeeksInRotation = Utils.calculateRotationLength(pattern);
            if (numWeeksInRotation === 0) return null;
            
            // Get the offset, defaulting to 1
const offset = assignment.start_week_offset || 1;

// Calculate total weeks elapsed (1-based)
const rawWeek = diffWeeks + offset;

// INFINITE LOOP FIX: Wrap around using modulo arithmetic
// Formula: ((Input - 1) % Length) + 1
const effectiveWeek = ((rawWeek - 1) % numWeeksInRotation) + 1;

return effectiveWeek;
        } catch (e) {
            console.error("Error calculating effective week:", e);
            return null;
        }
    };

    // Robust ISO date arithmetic using UTC
    Utils.addDaysISO = (iso, days) => {
      if (!iso) return null;
      const d = new Date(iso + 'T00:00:00Z');
      if (isNaN(d.getTime())) return null;
      d.setUTCDate(d.getUTCDate() + days);
      return d.toISOString().slice(0,10);
    };

    APP.Utils = Utils;
}(window.APP));


/**
 * MODULE: APP.DataService
 * V16.13: Added fetchAssignmentHistoryForAdvisor and support for start_week_offset.
 */
(function(APP) {
    const DataService = {};
    let supabase = null;
    
    const HISTORY_TABLE = 'rotation_assignments_history';
    const SNAPSHOT_TABLE = 'rotation_assignments';
    const EXCEPTIONS_TABLE = 'schedule_exceptions';

    DataService.initialize = () => {
        if (typeof window.supabase === 'undefined' || !window.supabase.createClient) {
             APP.Utils.showToast("Error: Database library (Supabase) not loaded.", "danger", 10000);
            return false;
        }
        const { createClient } = window.supabase;
        supabase = createClient(APP.Config.SUPABASE_URL, APP.Config.SUPABASE_ANON_KEY);
        return true;
    };

    const handleError = (error, context) => {
        console.error(`DataService Error (${context}):`, error);
        const errorMessage = error && error.message ? error.message : 'Unknown database error';
        if (error && (error.code === 'PGRST116' || error.code === '42P01') && context.includes(HISTORY_TABLE)) {
             console.warn(`Note: ${HISTORY_TABLE} table not found.`);
        } else {
            APP.Utils.showToast(`Database Error: ${errorMessage}`, "danger");
        }
        return { data: null, error: errorMessage };
    };

    const fetchTable = async (tableName) => {
        const { data, error } = await supabase.from(tableName).select('*');
        if (error) return handleError(error, `Fetch ${tableName}`);
        return { data, error: null };
    };

    DataService.saveRecord = async (tableName, record, conflictColumn = null) => {
        let query = supabase.from(tableName);
        if (conflictColumn) {
            query = query.upsert(record, { onConflict: conflictColumn });
        } else {
            query = query.insert(record);
        }
        // V16.13: Added start_week_offset to selection
        const { data, error } = await query.select('*');
        if (error) return handleError(error, `Save ${tableName}`);
        return { data: data ? data[0] : null, error: null };
    };

    DataService.updateRecord = async (tableName, updates, condition) => {
        let query = supabase.from(tableName).update(updates);
        if (condition) {
            Object.keys(condition).forEach(key => {
                const value = condition[key];
                if (value === null) query = query.is(key, null);
                else query = query.eq(key, value);
            });
        }
        const { data, error } = await query.select();
        if (error) return handleError(error, `Update ${tableName}`);
        return { data: data ? data[0] : null, error: null };
    };

    DataService.deleteRecord = async (tableName, condition) => {
        const { error } = await supabase.from(tableName).delete().match(condition);
        if (error) return handleError(error, `Delete ${tableName}`);
        return { data: null, error: null };
    };

    DataService.fetchEffectiveAssignmentsForDate = async (isoDate) => {
      try {
        const weekEndISO = APP.Utils.addDaysISO(isoDate, 6);
        
        const { data, error } = await supabase
          .from(HISTORY_TABLE)
          // V16.13: Added start_week_offset to selection
          .select('id, advisor_id, rotation_name, start_date, end_date, reason, start_week_offset')
          .lte('start_date', weekEndISO)
          .or(`end_date.is.null,end_date.gte.${isoDate}`)
          .order('id', { ascending: true });

        if (error && (error.code === '42P01' || error.code === 'PGRST116')) {
            return await fetchSnapshotAssignments();
        }
        if (error) return handleError(error, 'Fetch effective assignments');

        const byAdvisor = new Map();
        (data || []).forEach(row => {
          const existing = byAdvisor.get(row.advisor_id);
          if (!existing) {
            byAdvisor.set(row.advisor_id, row);
            return;
          }
          
          if (row.start_date > existing.start_date) {
            byAdvisor.set(row.advisor_id, row);
          } else if (row.start_date === existing.start_date) {
            const existingIsBounded = !!existing.end_date;
            const rowIsBounded = !!row.end_date;
            if (rowIsBounded && !existingIsBounded) {
                 byAdvisor.set(row.advisor_id, row);
            } else if (rowIsBounded === existingIsBounded) {
                 byAdvisor.set(row.advisor_id, row); 
            }
          }
        });
        return { data: byAdvisor, error: null };
      } catch (err) {
        return handleError(err, 'Fetch effective assignments (Catch)');
      }
    };

    const fetchSnapshotAssignments = async () => {
        const { data, error } = await fetchTable(SNAPSHOT_TABLE);
        if (error) return { data: new Map(), error: error.error };
        const byAdvisor = new Map();
        (data || []).forEach(row => {
            byAdvisor.set(row.advisor_id, {
                advisor_id: row.advisor_id,
                rotation_name: row.rotation_name,
                start_date: row.start_date,
                end_date: null,
                reason: 'Snapshot Fallback',
                start_week_offset: 1 // Snapshot doesn't have this, default to 1
            });
        });
        return { data: byAdvisor, error: null };
    };

    DataService.loadCoreData = async () => {
        try {
            const [advisors, leaders, components, definitions, patterns, assignments, exceptions] = await Promise.all([
                fetchTable('advisors'),
                supabase.from('leaders').select('*, sites(name)'),
                fetchTable('schedule_components'),
                fetchTable('shift_definitions'),
                fetchTable('rotation_patterns'),
                fetchTable(SNAPSHOT_TABLE), 
                fetchTable('schedule_exceptions')
            ]);

            if (advisors.error || leaders.error || components.error || definitions.error || patterns.error) {
                throw new Error("Failed to load core data.");
            }
            if (assignments.error) assignments.data = [];
            if (exceptions.error) exceptions.data = [];

            return {
                advisors: advisors.data,
                leaders: leaders.data,
                scheduleComponents: components.data,
                shiftDefinitions: definitions.data,
                rotationPatterns: patterns.data,
                rotationAssignments: assignments.data,
                scheduleExceptions: exceptions.data
            };
        } catch (error) {
            handleError(error, "Load Core Data");
            return null;
        }
    };

    const updateSnapshotAssignment = async (advisorId) => {
        const { data, error } = await supabase
            .from(HISTORY_TABLE)
            .select('rotation_name, start_date')
            .eq('advisor_id', advisorId)
            .order('start_date', { ascending: false })
            .order('end_date', { ascending: false, nullsFirst: true });

        if (error && (error.code === 'PGRST116' || error.code === '42P01')) return;
        if (error) { console.error("Snapshot update failed", error); return; }

        if (data && data.length > 0) {
            await supabase.from(SNAPSHOT_TABLE).upsert({
                advisor_id: advisorId,
                rotation_name: data[0].rotation_name,
                start_date: data[0].start_date
            }, { onConflict: 'advisor_id' });
        } else {
            await supabase.from(SNAPSHOT_TABLE).delete().eq('advisor_id', advisorId);
        }
    };

    DataService.assignFromWeek = async ({ advisor_id, rotation_name, start_date, start_week_offset = 1, reason = 'New Assignment' }) => {
        try {
            const dateMinusOne = APP.Utils.addDaysISO(start_date, -1);
            
            const { error: updateError } = await supabase
                .from(HISTORY_TABLE)
                .update({ end_date: dateMinusOne })
                .eq('advisor_id', advisor_id)
                .is('end_date', null)
            

            if (updateError && !updateError.code.startsWith('PGRST')) throw new Error("Failed to clip previous.");

            const newRecord = {
                advisor_id: advisor_id,
                rotation_name: rotation_name || null,
                start_date: start_date,
                end_date: null,
                start_week_offset: start_week_offset, // Save the offset
                reason: reason
            };
            const { data, error } = await DataService.saveRecord(HISTORY_TABLE, newRecord, 'advisor_id, start_date');
            if (error && !error.includes('PGRST')) throw new Error("Failed to insert assignment.");

            await supabase.from(EXCEPTIONS_TABLE)
                .delete()
                .eq('advisor_id', advisor_id)
                .gte('exception_date', start_date);

            await updateSnapshotAssignment(advisor_id);
            return { data, error: null };
        } catch (err) {
            return handleError(err, "assignFromWeek");
        }
    };

    DataService.changeOnlyWeek = async ({ advisor_id, rotation_name, week_start, week_end, start_week_offset = 1 }) => {
        try {
            if (!rotation_name) throw new Error("Rotation name required for swap.");

            const swapRecord = {
                advisor_id: advisor_id,
                rotation_name: rotation_name,
                start_date: week_start,
                end_date: week_end,
                start_week_offset: start_week_offset, // Save the offset
                reason: 'One Week Swap'
            };
            
            const { data, error } = await DataService.saveRecord(HISTORY_TABLE, swapRecord, 'advisor_id, start_date');
            if (error && !error.includes('PGRST')) throw new Error("Failed to insert swap.");

            await supabase.from(EXCEPTIONS_TABLE)
                .delete()
                .eq('advisor_id', advisor_id)
                .gte('exception_date', week_start)
                .lte('exception_date', week_end);

            await updateSnapshotAssignment(advisor_id);
            return { data, error: null };
        } catch (err) {
             return handleError(err, "Change Only Week");
        }
    };

    DataService.fetchSnapshotForAdvisor = async (advisorId) => {
        if (!supabase) return { data: null, error: "DB not initialized." };
        const { data, error } = await supabase.from(SNAPSHOT_TABLE).select('*').eq('advisor_id', advisorId).maybeSingle();
        if (error && (error.code === 'PGRST116' || error.code === '42P01')) return { data: null, error: null };
        if (error) return handleError(error, `Fetch Snapshot`);
        return { data, error: null };
    };
// V16.13: New function to get full history for one advisor
    DataService.fetchAssignmentHistoryForAdvisor = async (advisorId) => {
        if (!supabase) return { data: null, error: "DB not initialized."
};
        
        const { data, error } = await supabase
            .from(HISTORY_TABLE)
            .select('*')
            .eq('advisor_id', advisorId)
            .order('start_date', { ascending: false });
// Show newest first
            
        if (error) return handleError(error, `Fetch History for ${advisorId}`);
return { data, error: null };
    };

    // --- NEW FUNCTION TO FIX LIVE UPDATE ---
    // This gives other parts of the app access to the 'supabase' object
    DataService.getSupabaseClient = () => {
        return supabase;
    };
    // --- END NEW FUNCTION ---

    APP.DataService = DataService;
}(window.APP));

/**
 * MODULE: APP.StateManager
 * (No changes, but included for restore integrity)
 */
(function(APP) {
    const StateManager = {};

    const STATE = {
        advisors: [],
        leaders: [],
        scheduleComponents: [], 
        shiftDefinitions: [], 
        rotationPatterns: [], 
        rotationAssignments: [], 
        scheduleExceptions: [],
        selectedAdvisors: new Set(),
        weekStart: null, 
        currentRotation: null,
        selectedDay: 'Monday',
        scheduleViewMode: 'daily',
        isBooted: false,
        history: [],
        historyIndex: -1,
        effectiveAssignmentsCache: new Map(), 
    };

    StateManager.getState = () => STATE;

    StateManager.initialize = (initialData) => {
        Object.assign(STATE, initialData);
        STATE.isBooted = true;
        StateManager.saveHistory("Initial Load");
    };

    // Selectors
    StateManager.getAssignmentForAdvisor = (id) => STATE.rotationAssignments.find(a => a.advisor_id === id) || null;
    StateManager.getPatternByName = (name) => STATE.rotationPatterns.find(p => p.name === name) || null;
    StateManager.getComponentById = (id) => STATE.scheduleComponents.find(c => c.id === id) || null;
    StateManager.getShiftDefinitionById = (id) => STATE.shiftDefinitions.find(d => d.id === id) || null;
    StateManager.getAdvisorById = (id) => STATE.advisors.find(a => a.id === id) || null;
    StateManager.getShiftDefinitionByCode = (code) => {
        if (!code) return null;
        const trimmedCode = String(code).trim();
        return STATE.shiftDefinitions.find(d => (d.code && String(d.code).trim()) === trimmedCode) || null;
    };
    StateManager.getAdvisorsByLeader = (leaderId) => STATE.advisors.filter(a => a.leader_id === leaderId);

    StateManager.getExceptionForAdvisorDate = (advisorId, dateISO) => {
        return STATE.scheduleExceptions.find(e => e.advisor_id === advisorId && e.exception_date === dateISO) || null;
    };

    StateManager.loadEffectiveAssignments = async (dateISO) => {
        if (STATE.effectiveAssignmentsCache.has(dateISO)) return;
        const { data, error } = await APP.DataService.fetchEffectiveAssignmentsForDate(dateISO);
        if (!error && data) {
            STATE.effectiveAssignmentsCache.set(dateISO, data);
        } else {
            STATE.effectiveAssignmentsCache.set(dateISO, new Map());
        }
    };

    StateManager.clearEffectiveAssignmentsCache = () => {
        STATE.effectiveAssignmentsCache.clear();
    };

    // History & Sync
    StateManager.saveHistory = (reason = "Change") => {
        if (STATE.historyIndex < STATE.history.length - 1) {
            STATE.history = STATE.history.slice(0, STATE.historyIndex + 1);
        }
        const snapshot = {
            shiftDefinitions: JSON.parse(JSON.stringify(STATE.shiftDefinitions)),
            rotationPatterns: JSON.parse(JSON.stringify(STATE.rotationPatterns)),
            rotationAssignments: JSON.parse(JSON.stringify(STATE.rotationAssignments)),
            scheduleExceptions: JSON.parse(JSON.stringify(STATE.scheduleExceptions)),
            reason: reason
        };
        STATE.history.push(snapshot);
        if (STATE.history.length > 30) STATE.history.shift();
        STATE.historyIndex = STATE.history.length - 1;
        
        if (APP.Core && APP.Core.updateUndoRedoButtons) {
             APP.Core.updateUndoRedoButtons(STATE.historyIndex, STATE.history.length);
        }
        StateManager.clearEffectiveAssignmentsCache();
    };

    StateManager.applyHistory = (direction) => {
        let newIndex = STATE.historyIndex;
        if (direction === 'undo' && newIndex > 0) newIndex--;
        else if (direction === 'redo' && newIndex < STATE.history.length - 1) newIndex++;
        else return;

        const snapshot = STATE.history[newIndex];
        STATE.shiftDefinitions = JSON.parse(JSON.stringify(snapshot.shiftDefinitions));
        STATE.rotationPatterns = JSON.parse(JSON.stringify(snapshot.rotationPatterns));
        STATE.rotationAssignments = JSON.parse(JSON.stringify(snapshot.rotationAssignments));
        STATE.scheduleExceptions = JSON.parse(JSON.stringify(snapshot.scheduleExceptions));
        STATE.historyIndex = newIndex;
        StateManager.clearEffectiveAssignmentsCache();
        
        if (APP.Core && APP.Core.renderAll && APP.Core.updateUndoRedoButtons) {
            APP.Core.renderAll();
            APP.Core.updateUndoRedoButtons(STATE.historyIndex, STATE.history.length);
        }
    };
    
    StateManager.syncRecord = (tableName, record, isDeleted = false) => {
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
        if (tableName === 'rotation_assignments_history' || tableName === 'rotation_patterns') {
            StateManager.clearEffectiveAssignmentsCache();
        }

        if (!collection) return;

        let primaryKey = 'id';
        if (tableName === 'rotation_patterns') primaryKey = 'name';
        if (tableName === 'rotation_assignments') primaryKey = 'advisor_id';
        if (tableName === 'schedule_exceptions') primaryKey = 'id';

        if (!record || !record.hasOwnProperty(primaryKey)) return;
        
        const recordKey = record[primaryKey];
        const index = collection.findIndex(item => item[primaryKey] === recordKey);

        if (isDeleted) {
            if (index > -1) collection.splice(index, 1);
        } else {
            if (index > -1) collection[index] = record;
            else collection.push(record);
        }
        
        if (tableName === 'rotation_assignments') StateManager.clearEffectiveAssignmentsCache();
    };

    APP.StateManager = StateManager;
}(window.APP));


/**
 * MODULE: APP.ScheduleCalculator
 * V16.13: Updated to use new getEffectiveWeek signature.
 */
(function(APP) {
    const ScheduleCalculator = {};

    const findWeekKey = (patternData, weekNumber) => {
        const keys = Object.keys(patternData);
        return keys.find(k => {
            const match = k.match(/^Week ?(\d+)$/i);
            return match && parseInt(match[1], 10) === weekNumber;
        });
    };

    ScheduleCalculator.calculateSegments = (advisorId, dayName, weekStartISO = null) => {
        const STATE = APP.StateManager.getState();
        const effectiveWeekStart = weekStartISO || STATE.weekStart;
        
        if (!effectiveWeekStart) return { segments: [], source: null, reason: null };
        const dateISO = APP.Utils.getISODateForDayName(effectiveWeekStart, dayName);
        if (!dateISO) return { segments: [], source: null, reason: null };

        // 1. Exception
        const exception = APP.StateManager.getExceptionForAdvisorDate(advisorId, dateISO);
        if (exception && exception.structure) {
            if (exception.structure.length === 0) return { segments: [], source: 'exception', reason: exception.reason };
            const sortedSegments = JSON.parse(JSON.stringify(exception.structure)).sort((a, b) => a.start_min - b.start_min);
            return { segments: sortedSegments, source: 'exception', reason: exception.reason };
        }

        // 2. Rotation
        const effectiveMap = STATE.effectiveAssignmentsCache.get(effectiveWeekStart);
        let assignment = null;
        if (effectiveMap && effectiveMap.has(advisorId)) assignment = effectiveMap.get(advisorId);
        if (!assignment || !assignment.rotation_name || !assignment.start_date) {
            return { segments: [], source: 'rotation', reason: null };
        }

        // V16.13 FIX: Pass assignment object to getEffectiveWeek
        const effectiveWeek = APP.Utils.getEffectiveWeek(effectiveWeekStart, assignment, APP.StateManager.getPatternByName);
        if (effectiveWeek === null) return { segments: [], source: 'rotation', reason: null };

        const dayIndex = (['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].indexOf(dayName) + 1);
        const dayIndexStr = dayIndex.toString();

        const pattern = APP.StateManager.getPatternByName(assignment.rotation_name);
        if (!pattern || !pattern.pattern) return { segments: [], source: 'rotation', reason: null };

        const weekKey = findWeekKey(pattern.pattern, effectiveWeek);
        const weekPattern = weekKey ? pattern.pattern[weekKey] : {};
        const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
        const legacyDayKey = days[dayIndex - 1];
        
        const shiftCode = weekPattern[dayIndexStr] || weekPattern[legacyDayKey];
        if (!shiftCode) return { segments: [], source: 'rotation', reason: null };

        const definition = APP.StateManager.getShiftDefinitionByCode(shiftCode);
        if (!definition || !definition.structure) return { segments: [], source: 'rotation', reason: null };

        const sortedRotation = JSON.parse(JSON.stringify(definition.structure)).sort((a, b) => a.start_min - b.start_min);
        return { segments: sortedRotation, source: 'rotation', reason: null };
    };

    APP.ScheduleCalculator = ScheduleCalculator;
}(window.APP));

/**
 * MODULE: APP.Components.ComponentManager
 * (No changes, but included for restore integrity)
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
        let html = '<table><thead><tr><th>Name</th><th>Type</th><th>Color</th><th>Default Duration</th><th>Paid</th><th>Override</th><th>Actions</th></tr></thead><tbody>';
        components.forEach(comp => {
            html += `<tr data-component-id="${comp.id}">
                <td><span class="display-value">${comp.name}</span><input type="text" class="form-input edit-value" name="comp-name" value="${comp.name}" style="display:none;"></td>
                <td><span class="display-value">${comp.type}</span>
                   <select class="form-select edit-value" name="comp-type" style="display:none;">
                        <option value="Activity" ${comp.type === 'Activity' ? 'selected' : ''}>Activity</option>
                        <option value="Break" ${comp.type === 'Break' ? 'selected' : ''}>Break</option>
                        <option value="Lunch" ${comp.type === 'Lunch' ? 'selected' : ''}>Lunch</option>
                        <option value="Shrinkage" ${comp.type === 'Shrinkage' ? 'selected' : ''}>Shrinkage</option>
                        <option value="Absence" ${comp.type === 'Absence' ? 'selected' : ''}>Absence</option>
                    </select>
                </td>
                <td><span class="display-value" style="display: inline-block; width: 20px; height: 20px; background-color: ${comp.color}; border-radius: 4px;"></span><input type="color" class="form-input-color edit-value" name="comp-color" value="${comp.color}" style="display:none;"></td>
                <td><span class="display-value">${comp.default_duration_min}m</span><input type="number" class="form-input edit-value" name="comp-duration" value="${comp.default_duration_min}" style="display:none; width: 70px;"></td>
                <td><span class="display-value">${comp.is_paid ? 'Yes' : 'No'}</span>
                    <select class="form-select edit-value" name="comp-paid" style="display:none; width: 70px;">
                        <option value="true" ${comp.is_paid ? 'selected' : ''}>Yes</option>
                        <option value="false" ${!comp.is_paid ? 'selected' : ''}>No</option>
                    </select>
                </td>
                <td>
                    <span class="display-value">${comp.is_full_day_override ? 'Yes' : 'No'}</span>
                    <select class="form-select edit-value" name="comp-override" style="display:none; width: 70px;">
                        <option value="true" ${comp.is_full_day_override ? 'selected' : ''}>Yes</option>
                        <option value="false" ${!comp.is_full_day_override ? 'selected' : ''}>No</option>
                    </select>
                </td>
                <td class="actions">
                    <button class="btn btn-sm btn-primary edit-component" data-component-id="${comp.id}">Edit</button>
                    <button class="btn btn-sm btn-danger delete-component" data-component-id="${comp.id}">Delete</button>
                    <button class="btn btn-sm btn-success save-component" data-component-id="${comp.id}" style="display:none;">Save</button>
                    <button class="btn btn-sm btn-secondary cancel-edit-component" data-component-id="${comp.id}" style="display:none;">Cancel</button>
                </td>
             </tr>`;
        });
        html += '</tbody></table>';
        ELS.grid.innerHTML = html;
    };

    const handleNew = async () => {
        const name = prompt("Enter component name:");
        if (!name) return;
        const type = prompt("Enter type (Activity, Break, Lunch, Shrinkage, Absence):", "Activity");
        const color = prompt("Enter hex color code:", "#3498db");
        const duration = parseInt(prompt("Enter default duration in minutes:", "60"), 10);
        const isPaid = confirm("Is this a paid activity?");
        const isOverride = confirm("Is this a 'Full Day Override' component (e.g., Sick, Holiday)?");
        if (!name || !type || !color || isNaN(duration)) {
            APP.Utils.showToast("Invalid input.", "danger");
            return;
        }
        const newComponent = { name, type, color, default_duration_min: duration, is_paid: isPaid, is_full_day_override: isOverride };
const { data, error } = await APP.DataService.saveRecord('schedule_components', newComponent);
        if (!error) {
            APP.StateManager.syncRecord('schedule_components', data);
            APP.Utils.showToast(`Component '${name}' created.`, "success");
            ComponentManager.render();
        }
    };

    const handleClick = (e) => {
        const target = e.target;
        const id = target.dataset.componentId;
        if (!id) return;
        if (target.classList.contains('delete-component')) handleDelete(id);
        else if (target.classList.contains('edit-component')) toggleRowEditMode(id, true);
        else if (target.classList.contains('cancel-edit-component')) toggleRowEditMode(id, false);
        else if (target.classList.contains('save-component')) handleInlineSave(id);
    };

    const toggleRowEditMode = (id, isEditing) => {
        const row = ELS.grid.querySelector(`tr[data-component-id="${id}"]`);
        if (!row) return;
        row.querySelectorAll('.display-value').forEach(el => el.style.display = isEditing ? 'none' : '');
        row.querySelectorAll('.edit-value').forEach(el => el.style.display = isEditing ? 'block' : 'none');
        row.querySelector('.edit-component').style.display = isEditing ? 'none' : '';
        row.querySelector('.delete-component').style.display = isEditing ? 'none' : '';
        row.querySelector('.save-component').style.display = isEditing ? 'block' : 'none';
        row.querySelector('.cancel-edit-component').style.display = isEditing ? 'block' : 'none';
        if (!isEditing) ComponentManager.render();
    };

    const handleInlineSave = async (id) => {
        const row = ELS.grid.querySelector(`tr[data-component-id="${id}"]`);
        if (!row) return;
        const name = row.querySelector('[name="comp-name"]').value;
        const type = row.querySelector('[name="comp-type"]').value;
        const color = row.querySelector('[name="comp-color"]').value;
        const duration = parseInt(row.querySelector('[name="comp-duration"]').value, 10);
        const isPaid = row.querySelector('[name="comp-paid"]').value === 'true';
        const isOverride = row.querySelector('[name="comp-override"]').value === 'true';
        if (!name || !type || !color || isNaN(duration) || duration < 0) {
            APP.Utils.showToast("Invalid data.", "danger");
            return;
        }
        const updatedComponent = { id: id, name, type, color, default_duration_min: duration, is_paid: isPaid, is_full_day_override: isOverride };
const { data, error } = await APP.DataService.updateRecord('schedule_components', updatedComponent, { id: id });
        if (!error) {
            APP.StateManager.syncRecord('schedule_components', data);
            APP.Utils.showToast(`Component '${name}' updated.`, "success");
            ComponentManager.render();
        }
    };

    const handleDelete = async (id) => {
        const component = APP.StateManager.getComponentById(id);
        if (!component || !confirm(`Delete '${component.name}'?`)) return;
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
 * V16.13: Added "Start Wk #" input and "View Plan" button.
 */
(function(APP) {
    const AssignmentManager = {};
    const ELS = {};
    const PENDING_CHANGES = new Map(); 

    AssignmentManager.initialize = () => {
        ELS.grid = document.getElementById('assignmentGrid');
        
        // V16.13: Cache and wire up the new "View Plan" modal
        ELS.planModal = document.getElementById('planModal');
        ELS.planModalTitle = document.getElementById('planModalTitle');
        ELS.planModalBody = document.getElementById('planModalBody');
        ELS.planModalClose = document.getElementById('planModalClose');

        if (ELS.planModalClose) ELS.planModalClose.addEventListener('click', () => {
            if (ELS.planModal) ELS.planModal.style.display = 'none';
        });
    };

    AssignmentManager.render = async () => {
        if (!ELS.grid) return;

        const STATE = APP.StateManager.getState();
        // Get leaders sorted by name
        const leaders = STATE.leaders.sort((a, b) => a.name.localeCompare(b.name));

        // Create a new array for our team-grouped advisors
        const sortedAdvisors = [];

        // Loop through each leader to get their team
        leaders.forEach(leader => {
            // Get all advisors for this leader
            const teamAdvisors = APP.StateManager.getAdvisorsByLeader(leader.id);

            // Sort that small team alphabetically
            const sortedTeam = teamAdvisors.sort((a, b) => a.name.localeCompare(b.name));

            // Add this sorted team to our main list
            sortedAdvisors.push(...sortedTeam);
        });

        // Also get any advisors without a leader and add them at the end
        const unassignedAdvisors = STATE.advisors
            .filter(a => !a.leader_id)
            .sort((a, b) => a.name.localeCompare(b.name));

        sortedAdvisors.push(...unassignedAdvisors);
        const patterns = STATE.rotationPatterns.sort((a,b) => a.name.localeCompare(b.name));
        const patternOpts = patterns.map(p => `<option value="${p.name}">${p.name}</option>`).join('');
        const weekStartISO = STATE.weekStart;

        if (weekStartISO) {
            await APP.StateManager.loadEffectiveAssignments(weekStartISO);
        }

        const effectiveMap = STATE.effectiveAssignmentsCache.get(weekStartISO);
        
        // V16.13: Update table header to match HTML
        let html = '<table><thead><tr><th>Advisor</th><th>Assigned Rotation (This Week)</th><th>Start Date (Week 1)</th><th>Start Wk #</th><th>View Plan</th><th>Actions</th></tr></thead><tbody>';

        // Loop through each leader to create team groups
        leaders.forEach(leader => {
            // Get the site/brand name, or use an empty string if it doesn't exist
            const brandName = (leader.sites && leader.sites.name) ? `(${leader.sites.name})` : '';

            // Add a header row for the team
            html += `
                <tr class="team-header-row">
                    <td colspan="6">${leader.name}'s Team ${brandName}</td>
                </tr>
            `;

            // Get and sort this leader's team

            // Get and sort this leader's team
            const teamAdvisors = APP.StateManager.getAdvisorsByLeader(leader.id);
            teamAdvisors.sort((a, b) => a.name.localeCompare(b.name));

            // Now loop through just this team's advisors
            teamAdvisors.forEach(adv => {
                const effective = (effectiveMap && effectiveMap.get(adv.id)) ? effectiveMap.get(adv.id) : null;
                let displayRotation = effective ? effective.rotation_name : '';
                let displayStartDate = effective ? effective.start_date : '';
                let displayOffset = effective ? (effective.start_week_offset || 1) : 1;

                if (PENDING_CHANGES.has(adv.id)) {
                    const pending = PENDING_CHANGES.get(adv.id);
                    if (pending.rotation_name !== undefined) displayRotation = pending.rotation_name;
                    if (pending.start_date !== undefined) displayStartDate = pending.start_date;
                    if (pending.start_week_offset !== undefined) displayOffset = pending.start_week_offset;
                }

                 html += `<tr data-advisor-id="${adv.id}">
                  <td>${adv.name}</td>
                  <td><select class="form-select assign-rotation" data-advisor-id="${adv.id}"><option value="">-- None --</option>${patternOpts}</select></td>
                  <td><input type="text" class="form-input assign-start-date" data-advisor-id="${adv.id}" value="${displayStartDate}" /></td>
                  <td><input type="number" class="form-input assign-start-week" data-advisor-id="${adv.id}" value="${displayOffset}" min="1" /></td>

                  <td>
                      <button class="btn btn-sm btn-secondary act-view-plan" data-advisor-id="${adv.id}">View Plan</button>
                  </td>

                  <td class="actions">
                      <button class="btn btn-sm btn-primary act-assign-week" data-advisor-id="${adv.id}">Assign</button>
                      <button class="btn btn-sm btn-primary act-change-forward" data-advisor-id="${adv.id}">Change Forward</button>
                      <button class="btn btn-sm btn-secondary act-change-week" data-advisor-id="${adv.id}">Swap Week</button>
                  </td>
             </tr>`;
            });
        });

        // NOTE: We are intentionally skipping unassigned advisors for now to keep this clean.
        // We can add them later if needed.

        html += '</tbody></table>';
        ELS.grid.innerHTML = html;

        // Wire Buttons
ELS.grid.querySelectorAll('.act-assign-week').forEach(btn => {
  btn.addEventListener('click', () => handleRowAction('assign_from_week', btn.dataset.advisorId));
});
ELS.grid.querySelectorAll('.act-change-week, .act-change-forward').forEach(btn => {
  btn.addEventListener('click', () => handleRowAction('change_one_week', btn.dataset.advisorId));
});
        ELS.grid.querySelectorAll('.act-view-plan').forEach(btn => {
          btn.addEventListener('click', () => handleViewPlan(btn.dataset.advisorId));
        });

        // Initialize Inputs
        STATE.advisors.forEach(adv => {
            const effective = (effectiveMap && effectiveMap.get(adv.id)) ? effectiveMap.get(adv.id) : null;
            let displayRotation = effective ? effective.rotation_name : '';
            
            if (PENDING_CHANGES.has(adv.id)) {
                const pending = PENDING_CHANGES.get(adv.id);
                if (pending.rotation_name !== undefined) displayRotation = pending.rotation_name;
            }

            const row = ELS.grid.querySelector(`tr[data-advisor-id="${adv.id}"]`);
            if (!row) return;

            const rotSelect = row.querySelector('.assign-rotation');
            const dateInput = row.querySelector('.assign-start-date');
            const startWeekInput = row.querySelector('.assign-start-week');

            if (rotSelect) {
                rotSelect.value = displayRotation || '';
                rotSelect.addEventListener('change', (e) => {
                    const pending = PENDING_CHANGES.get(adv.id) || {};
                    pending.rotation_name = e.target.value;
                    
                    const globalWeekStart = APP.StateManager.getState().weekStart;
                    if (globalWeekStart) {
                        pending.start_date = globalWeekStart;
                        if (dateInput && dateInput._flatpickr) {
                            dateInput._flatpickr.setDate(globalWeekStart, true); 
                        }
                    }
                    // Reset offset to 1 when rotation changes
                    pending.start_week_offset = 1;
                    if(startWeekInput) startWeekInput.value = 1;
                    
                    PENDING_CHANGES.set(adv.id, pending);
                });
            }

            if (dateInput && typeof flatpickr !== 'undefined') {
                flatpickr(dateInput, {
                  dateFormat: 'Y-m-d', altInput: true, altFormat: 'd/m/Y', allowInput: true, locale: { "firstDayOfWeek": 1 },
                  onChange: function(selectedDates, dateStr) {
                    const pending = PENDING_CHANGES.get(adv.id) || {};
                    pending.start_date = dateStr;
                    PENDING_CHANGES.set(adv.id, pending);
                  }
                });
            }
            
            if (startWeekInput) {
                startWeekInput.addEventListener('change', (e) => {
                    const pending = PENDING_CHANGES.get(adv.id) || {};
                    let val = parseInt(e.target.value, 10);
                    if (isNaN(val) || val < 1) val = 1;
                    e.target.value = val; // Correct the input field
                    pending.start_week_offset = val;
                    PENDING_CHANGES.set(adv.id, pending);
                });
            }
        });
    };

    // V16.13: New handler for "View Plan"
    const handleViewPlan = async (advisorId) => {
        if (!ELS.planModal) return;

        const advisor = APP.StateManager.getAdvisorById(advisorId);
        if (!advisor) return;

        ELS.planModalTitle.textContent = `Assignment Plan for: ${advisor.name}`;
        ELS.planModalBody.innerHTML = `<tr><td colspan="5">Loading...</td></tr>`;
        ELS.planModal.style.display = 'flex';

        const { data, error } = await APP.DataService.fetchAssignmentHistoryForAdvisor(advisorId);

        if (error) {
            ELS.planModalBody.innerHTML = `<tr><td colspan="5" style="color: red;">Error loading history.</td></tr>`;
            return;
        }

        if (!data || data.length === 0) {
            ELS.planModalBody.innerHTML = `<tr><td colspan="5">No assignment history found for this advisor.</td></tr>`;
            return;
        }

        let html = '';
        data.forEach(row => {
            html += `
                <tr>
                    <td>${APP.Utils.convertISOToUKDate(row.start_date)}</td>
                    <td>${row.end_date ? APP.Utils.convertISOToUKDate(row.end_date) : '(Ongoing)'}</td>
                    <td>${row.rotation_name || 'None'}</td>
                    <td>${row.start_week_offset || 1}</td>
                    <td>${row.reason || ''}</td>
                </tr>
            `;
        });
        ELS.planModalBody.innerHTML = html;
    };

    const handleRowAction = async (action, advisorId) => {
      try {
        const row = document.querySelector(`tr[data-advisor-id="${advisorId}"]`);
        if (!row) return APP.Utils.showToast('Row not found', 'danger');

        let rotationName, inputStartDateISO, startWeekOffset;

        // 1. Get from pending
        if (PENDING_CHANGES.has(advisorId)) {
            const pending = PENDING_CHANGES.get(advisorId);
            rotationName = pending.rotation_name;
            inputStartDateISO = pending.start_date;
            startWeekOffset = pending.start_week_offset;
        }
        
        // 2. Fallback to DOM
        if (rotationName === undefined) rotationName = row.querySelector('.assign-rotation')?.value;
        if (inputStartDateISO === undefined) inputStartDateISO = row.querySelector('.assign-start-date')?.value.trim();
        if (startWeekOffset === undefined) startWeekOffset = parseInt(row.querySelector('.assign-start-week')?.value, 10) || 1;


        const globalWeekStartISO = APP.StateManager.getState().weekStart;

        if (!rotationName && action === 'change_one_week') {
             return APP.Utils.showToast('Pick a rotation first.', 'warning');
        }

        let actionStartISO = globalWeekStartISO; 

        if (action === 'assign_from_week') {
            if (!inputStartDateISO) return APP.Utils.showToast('Start date required.', 'danger');
            actionStartISO = inputStartDateISO.includes('/') ? APP.Utils.convertUKToISODate(inputStartDateISO) : inputStartDateISO;
            if (!actionStartISO) return APP.Utils.showToast('Invalid date format.', 'danger');
        }

        if (!/^\d{4}-\d{2}-\d{2}$/.test(actionStartISO)) {
          if (!globalWeekStartISO && action === 'change_one_week') return APP.Utils.showToast('Select a week first.', 'danger');
          return APP.Utils.showToast('Invalid date.', 'danger');
        }

        let res;
        const STATE = APP.StateManager.getState();

        if (action === 'assign_from_week') {
          res = await APP.DataService.assignFromWeek({
            advisor_id: advisorId,
            rotation_name: rotationName,
            start_date: actionStartISO,
            start_week_offset: startWeekOffset
          });
          
          // V16.1 FIX: Locally remove conflicting future exceptions so UI updates instantly
          if (!res.error) {
              STATE.scheduleExceptions = STATE.scheduleExceptions.filter(ex => {
                  return ex.advisor_id !== advisorId || ex.exception_date < actionStartISO;
              });
          }

        } else if (action === 'change_one_week') {
          const weekStart = APP.Utils.getMondayForDate(actionStartISO);
          if (!weekStart) return APP.Utils.showToast('Invalid week start.', 'danger');
          const weekEnd = APP.Utils.addDaysISO(weekStart, 6);

          res = await APP.DataService.changeOnlyWeek({
            advisor_id: advisorId,
            rotation_name: rotationName,
            week_start: weekStart,
            week_end: weekEnd,
            start_week_offset: startWeekOffset
          });

          // V16.1 FIX: Locally remove conflicting week exceptions so UI updates instantly
          if (!res.error) {
              STATE.scheduleExceptions = STATE.scheduleExceptions.filter(ex => {
                  return ex.advisor_id !== advisorId || (ex.exception_date < weekStart || ex.exception_date > weekEnd);
              });
          }
        }

        if (res?.error) return;

        // Cleanup and Refresh
        PENDING_CHANGES.delete(advisorId);
        
        // 1. Clear cache to force re-calculation of rotation
        APP.StateManager.clearEffectiveAssignmentsCache();
        
        // 2. Update local rotation snapshot
        const { data: updatedSnapshot } = await APP.DataService.fetchSnapshotForAdvisor(advisorId);
        if (updatedSnapshot) {
            APP.StateManager.syncRecord('rotation_assignments', updatedSnapshot);
        } else {
            APP.StateManager.syncRecord('rotation_assignments', { advisor_id: advisorId }, true);
        }

        APP.StateManager.saveHistory(`Assignment Action: ${action}`);
        
        // 3. Force Re-render immediately
        if (APP.Components.ScheduleViewer) {
             await APP.Components.ScheduleViewer.render(); 
        }

        APP.Utils.showToast('Assignment updated successfully.', 'success');
      } catch (e) {
        console.error("Error:", e);
        APP.Utils.showToast('Error updating assignment.', 'danger');
      }
    }

    APP.Components = APP.Components || {};
    APP.Components.AssignmentManager = AssignmentManager;

}(window.APP));

/**
 * MODULE: APP.Components.SequentialBuilder (v16.12 - Toolbox Drag & Resize)
 * Supports Shift Definitions (legacy) and Visual Exceptions (Live Editing).
 * V16.12 FEATURES:
 * 1. TOOLBOX DRAG: Drag items from toolbox to insert into timeline.
 * 2. RESIZE: Drag right edge of segments to expand/reduce (pushes/pulls neighbors).
 * 3. WATER PIPE: Fixed shift length maintained automatically.
 * * CUSTOM MODIFICATION: 'Break' and 'Lunch' components are now "anchored".
 * Normalization (trim/expand) logic now targets the last non-anchored segment
 * to preserve the start times of breaks/lunches.
 */
(function(APP) {
    const SequentialBuilder = {};
    const ELS = {}; 

    const BUILDER_STATE = {
        isOpen: false,
        mode: null, 
        contextId: null,
        exceptionDate: null,
        startTimeMin: 480, 
        fixedShiftLength: 0, 
        segments: [], 
 
        reason: null,
        
        // Interaction State
        interaction: {
            type: null, // 'move', 'resize', 'toolbox-drag'
            segmentIndex: -1,
            startX: 0,
            startDuration: 0,
         
           draggedSegment: null,
            baseSegments: [] // Snapshot before manipulation
        },
        
        addPopupState: { isOpen: false, componentId: null, componentName: null, isEditing: false, editIndex: -1 },
        visualHistory: [],
        visualHistoryIndex: -1,
        contextMenuIndex: -1
    };

    const parseTimeToMinutes = (timeStr) => {
   
         const parts = (timeStr || "").split(':');
        if (parts.length !== 2) return null;
        const h = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        if (isNaN(h) || isNaN(m)) return null;
        return h * 60 + m;
    };

    /**
     * NEW HELPER: Checks if a component type should be anchored.
     * Anchored segments (Breaks, Lunch) will not be automatically
     * trimmed or expanded by the normalization logic.
     */
    const isAnchored = (componentId) => {
        const component = APP.StateManager.getComponentById(componentId);
        // Check for component and component.name
        if (!component || !component.name) return false;
        
        // Convert NAME to uppercase for a case-insensitive comparison
        const componentName = component.name.toUpperCase();
        
        // --- THIS IS THE FIX ---
        // We now check if the name *includes* these words.
        // This will anchor "Break", "AM Break", "Lunch", "Paid Lunch", etc.
        return componentName.includes('BREAK') || componentName.includes('LUNCH');
    };
    SequentialBuilder.initialize = () => {
        // Modal Elements
        ELS.modal = document.getElementById('shiftBuilderModal');
        ELS.modalTitle = document.getElementById('modalTitle');
        ELS.modalClose = document.getElementById('modalClose');
        ELS.modalSave = document.getElementById('modalSaveStructure');
        ELS.modalTotalTime = document.getElementById('modalTotalTime');
        ELS.modalPaidTime = document.getElementById('modalPaidTime');
        ELS.exceptionReasonGroup = document.getElementById('exceptionReasonGroup');
        ELS.modalExceptionReason = document.getElementById('modalExceptionReason');
        
        // Visual Editor Elements
        ELS.visualEditorContainer = document.getElementById('visualEditorContainer');
        ELS.visualEditorControlsGroup = document.getElementById('visualEditorControlsGroup');
        ELS.visualEditorToolbox = document.getElementById('visualEditorToolbox');
        ELS.visualEditorTimeline = document.getElementById('visualEditorTimeline');
        ELS.visualEditorTimeRuler = document.getElementById('visualEditorTimeRuler');
        ELS.visualEditorDropCursor = document.getElementById('visualEditorDropCursor');
        ELS.visualEditorContextMenu = document.getElementById('visualEditorContextMenu');
        ELS.veUndo = document.getElementById('ve-undo');
        ELS.veRedo = document.getElementById('ve-redo');
        
        // Popups
        ELS.visualEditorAddPopup = document.getElementById('visualEditorAddPopup');
        ELS.veAddPopupTitle = document.getElementById('ve-add-popup-title');
        ELS.veAddStartTime = document.getElementById('ve-add-start-time');
        ELS.veAddEndTime = document.getElementById('ve-add-end-time');
        ELS.veAddDurationDisplay = document.getElementById('ve-add-duration-display');
        ELS.veAddPopupCancel = document.getElementById('ve-add-popup-cancel');
        ELS.veAddPopupSave = document.getElementById('ve-add-popup-save');
        
        // Add listeners to auto-calculate duration
        if (ELS.veAddStartTime) ELS.veAddStartTime.addEventListener('change', updateDurationDisplay);
        if (ELS.veAddEndTime) ELS.veAddEndTime.addEventListener('change', updateDurationDisplay);

// Legacy Elements
        ELS.legacyEditorContainer = document.getElementById('legacyEditorContainer');
        ELS.modalStartTime = document.getElementById('modalStartTime');
        ELS.modalAddActivity = document.getElementById('modalAddActivity');
        ELS.modalSequenceBody = document.getElementById('modalSequenceBody');

        // Listeners
        if (ELS.modalClose) ELS.modalClose.addEventListener('click', SequentialBuilder.close);
        if (ELS.modalSave) ELS.modalSave.addEventListener('click', handleSave);
        if (ELS.modalExceptionReason) {
            ELS.modalExceptionReason.addEventListener('input', (e) => {
                BUILDER_STATE.reason = e.target.value;
            });
        }
        
        // Toolbox Listeners
        if (ELS.visualEditorToolbox) {
            ELS.visualEditorToolbox.addEventListener('click', handleToolboxClick);
            ELS.visualEditorToolbox.addEventListener('dragstart', handleToolboxDragStart);
            ELS.visualEditorToolbox.addEventListener('dragend', handleToolboxDragEnd);
        }

        // Timeline Listeners
        if (ELS.visualEditorTimeline) {
            ELS.visualEditorTimeline.addEventListener('mousedown', handleTimelineMouseDown);
            ELS.visualEditorTimeline.addEventListener('contextmenu', handleTimelineContextMenu);
            // Native Drag & Drop for Toolbox items
            ELS.visualEditorTimeline.addEventListener('dragover', handleTimelineDragOver);
            ELS.visualEditorTimeline.addEventListener('drop', handleTimelineDrop);
            ELS.visualEditorTimeline.addEventListener('dragleave', handleTimelineDragLeave);
        }
        
        // Global Mouse (for Resize & Move interaction)
        document.addEventListener('mousemove', handleGlobalMouseMove);
        document.addEventListener('mouseup', handleGlobalMouseUp);
        document.addEventListener('click', closeContextMenu);

        if (ELS.veAddPopupCancel) ELS.veAddPopupCancel.addEventListener('click', closeAddPopup);
        if (ELS.veAddPopupSave) ELS.veAddPopupSave.addEventListener('click', handleAddPopupSave);
        
        if (ELS.visualEditorContextMenu) ELS.visualEditorContextMenu.addEventListener('click', handleContextMenuClick);
        if (ELS.veUndo) ELS.veUndo.addEventListener('click', handleUndo);
        if (ELS.veRedo) ELS.veRedo.addEventListener('click', handleRedo);

        if (ELS.modalSequenceBody) {
            ELS.modalSequenceBody.addEventListener('change', handleLegacySequenceChange);
            ELS.modalSequenceBody.addEventListener('click', handleLegacySequenceClick);
        }
        if (ELS.modalAddActivity) {
            ELS.modalAddActivity.addEventListener('click', handleLegacyAddActivity);
        }

        if (ELS.modalStartTime && typeof flatpickr !== 'undefined') {
             flatpickr(ELS.modalStartTime, {
                enableTime: true, noCalendar: true, dateFormat: "H:i", time_24hr: true, minuteIncrement: 5,
                onChange: (selectedDates, dateStr) => {
                    const newTimeMin = parseTimeToMinutes(dateStr);
   
                     if (newTimeMin !== null && newTimeMin !== BUILDER_STATE.startTimeMin) {
                        BUILDER_STATE.startTimeMin = newTimeMin;
                        if (BUILDER_STATE.isOpen && BUILDER_STATE.mode === 'definition') renderLegacyTable();
                   
     }
                }
            });
        }
    };

    SequentialBuilder.open = (config) => {
        const sequentialSegments = [];
        let startTimeMin = 480;

        if (config.structure && config.structure.length > 0) {
            const sortedStructure = JSON.parse(JSON.stringify(config.structure)).sort((a, b) => a.start_min - b.start_min);
            startTimeMin = sortedStructure[0].start_min;
            sortedStructure.forEach(seg => {
                sequentialSegments.push({
                    component_id: seg.component_id,
                    duration_min: seg.end_min - seg.start_min
                });
            });
        }

        BUILDER_STATE.isOpen = true;
        BUILDER_STATE.mode = config.mode;
        BUILDER_STATE.contextId = config.id;
        BUILDER_STATE.exceptionDate = config.date || null;
        BUILDER_STATE.startTimeMin = startTimeMin;
        BUILDER_STATE.segments = JSON.parse(JSON.stringify(sequentialSegments));
        // FIXED PIPE CAPACITY: Locked to initial length
        BUILDER_STATE.fixedShiftLength = BUILDER_STATE.segments.reduce((sum, s) => sum + s.duration_min, 0);
        if (BUILDER_STATE.fixedShiftLength === 0) BUILDER_STATE.fixedShiftLength = 60;

        BUILDER_STATE.reason = config.reason || null;
        BUILDER_STATE.visualHistory = [];
        BUILDER_STATE.visualHistoryIndex = -1;
        ELS.modalTitle.textContent = config.title;
        if (ELS.visualEditorContainer) ELS.visualEditorContainer.style.display = 'none';
        if (ELS.legacyEditorContainer) ELS.legacyEditorContainer.style.display = 'none';
        if (ELS.visualEditorControlsGroup) ELS.visualEditorControlsGroup.style.display = 'none';
        if (config.mode === 'exception') {
            if (ELS.visualEditorContainer) ELS.visualEditorContainer.style.display = 'block';
            if (ELS.visualEditorControlsGroup) ELS.visualEditorControlsGroup.style.display = 'flex';
            ELS.exceptionReasonGroup.style.display = 'block';
            ELS.modalExceptionReason.value = BUILDER_STATE.reason || '';
            ELS.modalSave.textContent = "Save Exception";
            // Auto-fuse on load
            BUILDER_STATE.segments = fuseNeighbors(BUILDER_STATE.segments);
            
            renderToolbox();
            renderTimeline();
} else {
            if (ELS.legacyEditorContainer) ELS.legacyEditorContainer.style.display = 'flex';
ELS.exceptionReasonGroup.style.display = 'none';
            ELS.modalSave.textContent = "Save Definition";
            if (ELS.modalStartTime && ELS.modalStartTime._flatpickr) {
                ELS.modalStartTime._flatpickr.setDate(APP.Utils.formatMinutesToTime(startTimeMin), false);
            }
            renderLegacyTable();
        }
        saveVisualHistory();
        updateUndoRedoButtons(); 
        ELS.modal.style.display = 'flex';
    };
    SequentialBuilder.close = () => {
        BUILDER_STATE.isOpen = false;
        if (ELS.modal) ELS.modal.style.display = 'none';
        closeAddPopup();
        closeContextMenu();
    };

    const renderToolbox = () => {
        if (!ELS.visualEditorToolbox) return;
        const STATE = APP.StateManager.getState();
        const components = STATE.scheduleComponents.sort((a, b) => a.name.localeCompare(b.name));
        ELS.visualEditorToolbox.innerHTML = components.map(comp => {
            const textColor = APP.Utils.getContrastingTextColor(comp.color);
            return `
            <div class="ve-toolbox-item" draggable="true" data-component-id="${comp.id}" data-component-name="${comp.name}" style="border-left: 4px solid ${comp.color};">
                ${comp.name}
            </div>
        `}).join('');
    };

    const renderTimeline = () => {
        if (!ELS.visualEditorTimeline) return;
        renderTimeRuler();
        const totalDuration = BUILDER_STATE.fixedShiftLength > 0 ? BUILDER_STATE.fixedShiftLength : 60;
        if (BUILDER_STATE.segments.length === 0) {
            ELS.visualEditorTimeline.innerHTML = '<div style="padding: 16px; color: #6B7280;">Empty Schedule (RDO).</div>';
            renderSummary();
            return;
        }

        let html = '';
        let currentTime = BUILDER_STATE.startTimeMin;
        BUILDER_STATE.segments.forEach((seg, index) => {
            const component = APP.StateManager.getComponentById(seg.component_id);
            if (!component) return;

            const widthPct = (seg.duration_min / totalDuration) * 100;
            const startStr = APP.Utils.formatMinutesToTime(currentTime);
            const endStr = APP.Utils.formatMinutesToTime(currentTime + seg.duration_min);
            const tooltip = `${component.name}\n${startStr} - ${endStr}\n(${seg.duration_min}m)`;
            const textColor = APP.Utils.getContrastingTextColor(component.color);

            html += `
                <div class="ve-segment" style="width: ${widthPct}%; background-color: ${component.color}; color: ${textColor};" 
                     data-index="${index}" title="${tooltip}">
                    <span class="ve-segment-label" style="padding-left:4px; white-space:nowrap; overflow:hidden; pointer-events:none;">
                        ${component.name}
                    </span>
                    <div class="ve-drag-handle" data-handle-index="${index}"></div>
                </div>
            `;
            currentTime += seg.duration_min;
        });

        ELS.visualEditorTimeline.innerHTML = html;
        renderSummary();
    };
    
    const renderTimeRuler = () => {
        if (!ELS.visualEditorTimeRuler) return;
        const { startTimeMin, fixedShiftLength } = BUILDER_STATE;
        if (fixedShiftLength === 0) {
            ELS.visualEditorTimeRuler.innerHTML = '';
            return;
        }
        let html = '';
        const endTime = startTimeMin + fixedShiftLength;
        let firstHourMarker = Math.ceil(startTimeMin / 60) * 60;
        for (let time = firstHourMarker; time < endTime; time += 60) {
            const pct = ((time - startTimeMin) / fixedShiftLength) * 100;
            if (pct > 0 && pct < 100) {
                html += `<div class="ve-time-marker" style="left: ${pct}%;">${APP.Utils.formatMinutesToTime(time)}</div>`;
            }
        }
        ELS.visualEditorTimeRuler.innerHTML = html;
    };
    const renderSummary = () => {
        let totalDuration = 0;
        let paidDuration = 0;
        BUILDER_STATE.segments.forEach(seg => {
            const component = APP.StateManager.getComponentById(seg.component_id);
            totalDuration += seg.duration_min;
            if (component && component.is_paid) paidDuration += seg.duration_min;
        });
        if (ELS.modalTotalTime) ELS.modalTotalTime.textContent = APP.Utils.formatDuration(totalDuration);
        if (ELS.modalPaidTime) ELS.modalPaidTime.textContent = APP.Utils.formatDuration(paidDuration);
    };
    // --- LOGIC: NEIGHBOR FUSION & NORMALIZATION ---
    const fuseNeighbors = (segments) => {
        if (segments.length < 2) return segments;
        const fused = [];
        let current = segments[0];
        for (let i = 1; i < segments.length; i++) {
            const next = segments[i];
            if (current.component_id === next.component_id) {
                current.duration_min += next.duration_min;
            } else {
                fused.push(current);
                current = next;
            }
        }
        fused.push(current);
        return fused;
    };

    /**
     * MODIFIED: Ensures total duration equals fixed shift length
     * by trimming or extending the LAST NON-ANCHORED segment.
     */
    const normalizeShiftLength = (segments) => {
        let currentTotal = segments.reduce((sum, s) => sum + s.duration_min, 0);
        const target = BUILDER_STATE.fixedShiftLength;

        if (currentTotal === target) return segments;
        
        // Create a copy to avoid mutation issues
        let adjusted = JSON.parse(JSON.stringify(segments));

        // 1. Trim Excess (Drain)
        while (currentTotal > target && adjusted.length > 0) {
            const excess = currentTotal - target;
            
            // --- MODIFIED LOGIC ---
            // Find the *largest* non-anchored segment
            let largestFlexibleIndex = -1;
            let maxDuration = 0;
            
            for (let i = 0; i < adjusted.length; i++) {
                if (!isAnchored(adjusted[i].component_id)) {
                    if (adjusted[i].duration_min > maxDuration) {
                        maxDuration = adjusted[i].duration_min;
                        largestFlexibleIndex = i;
                    }
                }
            }

            if (largestFlexibleIndex === -1) {
                 console.warn("Normalize: Shift is too long but no non-anchored segments found to trim.");
                 break; 
            }

            const segmentToTrim = adjusted[largestFlexibleIndex];

            if (segmentToTrim.duration_min > excess) {
                // Segment is long enough to absorb the excess. Trim it.
                segmentToTrim.duration_min -= excess;
                currentTotal -= excess; 
            } else {
                // Segment is shorter than the excess. Remove it entirely.
                currentTotal -= segmentToTrim.duration_min;
                adjusted.splice(largestFlexibleIndex, 1);
            }
        }

        // 2. Fill Gap (Refill)
        if (currentTotal < target) {
            const deficit = target - currentTotal;
            
            // Find the *last* non-anchored segment (filling at the end is fine)
            let lastNonAnchoredIndex = -1;
            for (let i = adjusted.length - 1; i >= 0; i--) {
                if (!isAnchored(adjusted[i].component_id)) {
                    lastNonAnchoredIndex = i;
                    break;
                }
            }

            if (lastNonAnchoredIndex !== -1) {
                // Add the deficit to this segment
                adjusted[lastNonAnchoredIndex].duration_min += deficit;
                currentTotal += deficit;
            } else {
                console.warn("Normalize: Shift is too short but no non-anchored segments found to expand.");
            }
        }
        
        // Filter out any zero-duration segments that might have been created
        const finalSegments = adjusted.filter(seg => seg.duration_min > 0);

        // We must fuse *after* normalizing to clean up
        return fuseNeighbors(finalSegments);
    };
    
    // --- LOGIC: CORE MANIPULATIONS ---

    const liftStone = (segments, indexToRemove) => {
        const newSegments = JSON.parse(JSON.stringify(segments));
        newSegments.splice(indexToRemove, 1); 
        // Gap closes, fuse neighbors, then fill gap at the end
        let fused = fuseNeighbors(newSegments);
        return normalizeShiftLength(fused);
    };

    const insertStone = (baseSegments, componentId, duration, insertTimeAbs) => {
        let segments = JSON.parse(JSON.stringify(baseSegments));
        let runningTime = BUILDER_STATE.startTimeMin;
        let inserted = false;
        const result = [];
        for (let i = 0; i < segments.length; i++) {
            const seg = segments[i];
            const segStart = runningTime;
            const segEnd = runningTime + seg.duration_min;
            if (!inserted && insertTimeAbs >= segStart && insertTimeAbs < segEnd) {
                // WEDGE IN
                const timeBefore = insertTimeAbs - segStart;
                const timeAfter = segEnd - insertTimeAbs;

                if (timeBefore > 0) result.push({ component_id: seg.component_id, duration_min: timeBefore });
                result.push({ component_id: componentId, duration_min: duration });
                if (timeAfter > 0) result.push({ component_id: seg.component_id, duration_min: timeAfter });
                
                inserted = true;
            } else {
                result.push(seg);
            }
            runningTime += seg.duration_min;
        }

        if (!inserted) {
            result.push({ component_id: componentId, duration_min: duration });
        }

        // Clean up
        let merged = fuseNeighbors(result);
        return normalizeShiftLength(merged); // <-- Calls the new normalizeShiftLength
    };

    // --- INTERACTION HANDLERS ---
// NEW FUNCTION: Replaces time instead of inserting
    const carveOutTime = (baseSegments, componentId, newDuration, insertTimeAbs) => {
        let segments = JSON.parse(JSON.stringify(baseSegments));
        let runningTime = BUILDER_STATE.startTimeMin;
        const result = [];
        let inserted = false;

        for (let i = 0; i < segments.length; i++) {
            const seg = segments[i];
            const segStart = runningTime;
            const segEnd = runningTime + seg.duration_min;

            // Is this the segment we're dropping onto?
            if (!inserted && insertTimeAbs >= segStart && insertTimeAbs < segEnd) {
                
                // This is the target segment.
                // It MUST be flexible.
                if (isAnchored(seg.component_id)) {
                    APP.Utils.showToast("Cannot modify an anchored segment (Break/Lunch).", "warning");
                    return null; // Return null to indicate failure
                }
                
                // Calculate the remaining duration *after* the new block is placed
                const part1Duration = insertTimeAbs - segStart;
                const part2Duration = segEnd - (insertTimeAbs + newDuration);

                // Check if there's enough space
                if (part2Duration < 0) {
                     APP.Utils.showToast(`Not enough space. Needs ${newDuration}m.`, "warning");
                     return null; // Return null to indicate failure
                }

                // Rebuild the segment
                if (part1Duration > 0) {
                    result.push({ component_id: seg.component_id, duration_min: part1Duration });
                }
                result.push({ component_id: componentId, duration_min: newDuration });
                if (part2Duration > 0) {
                    result.push({ component_id: seg.component_id, duration_min: part2Duration });
                }
                
                inserted = true;
            } else {
                // This is not the target segment, just add it.
                result.push(seg);
            }
            runningTime += seg.duration_min;
        }
        
        if (!inserted) {
             console.error("carveOutTime failed to find an insertion point.");
             return null;
        }

        // Clean up by fusing any new neighbors
        return fuseNeighbors(result);
    };
    const handleTimelineMouseDown = (e) => {
        const handle = e.target.closest('.ve-drag-handle');
        const segmentEl = e.target.closest('.ve-segment');
        
        if (handle && segmentEl) {
            // === START RESIZE ===
            e.preventDefault();
            const index = parseInt(segmentEl.dataset.index, 10);
            BUILDER_STATE.interaction = {
                type: 'resize',
                segmentIndex: index,
                startX: e.clientX,
                startDuration: BUILDER_STATE.segments[index].duration_min,
                baseSegments: JSON.parse(JSON.stringify(BUILDER_STATE.segments))
            };
        } else if (segmentEl) {
            // === START POTENTIAL-MOVE ===
            // This is the fix for the click-vs-drag issue.
            // We are no longer blocking anchored items here.
            e.preventDefault();
            const index = parseInt(segmentEl.dataset.index, 10);

            const stone = BUILDER_STATE.segments[index];
            const baseWater = liftStone(BUILDER_STATE.segments, index);
            
            BUILDER_STATE.interaction = {
                type: 'potential-move', // <-- Set to 'potential-move'
                startX: e.clientX,         // <-- Store startX
                draggedSegment: stone,
                baseSegments: baseWater
            };
        }
    };

    const handleGlobalMouseMove = (e) => {
        const { type } = BUILDER_STATE.interaction;

        // --- NEW "POTENTIAL-MOVE" PROMOTION LOGIC ---
        // This is the fix for the click-vs-drag issue.
        if (type === 'potential-move') {
            const { startX } = BUILDER_STATE.interaction;
            const pixelDiff = Math.abs(e.clientX - startX);
            
            // Only promote to a "move" if mouse moves more than 5 pixels
            if (pixelDiff > 5) {
                BUILDER_STATE.interaction.type = 'move'; // <-- Promote to 'move'
                // We re-call handleGlobalMouseMove to immediately start the move logic
                handleGlobalMouseMove(e); 
                return;
            }
            // If not over threshold, do nothing. Wait.
            return; 
        }
        // --- END NEW LOGIC ---

        if (!type || !ELS.visualEditorTimeline) return;

        const rect = ELS.visualEditorTimeline.getBoundingClientRect();
        const pipeCapacity = BUILDER_STATE.fixedShiftLength;
        
        if (type === 'resize') {
            // === HANDLE RESIZE ===
            const { startX, startDuration, segmentIndex, baseSegments } = BUILDER_STATE.interaction;
            const pixelDiff = e.clientX - startX;
            // Calculate minutes delta based on pixels
            const pxPerMin = rect.width / pipeCapacity;
            const minDiff = Math.round(pixelDiff / pxPerMin / 5) * 5;
            // Snap to 5m

            let newDuration = Math.max(5, startDuration + minDiff);
            // Clone base segments to manipulate
            let workingSegments = JSON.parse(JSON.stringify(baseSegments));
            workingSegments[segmentIndex].duration_min = newDuration;
            
            // Apply fixed shift logic (Trim or Extend end)
            BUILDER_STATE.segments = normalizeShiftLength(workingSegments);
            renderTimeline();

        } else if (type === 'move') {
            // === HANDLE MOVE (STONE) ===
            let relativeX = e.clientX - rect.left;
            relativeX = Math.max(0, Math.min(relativeX, rect.width));
            const pct = relativeX / rect.width;
            const relativeMinutes = Math.round(pct * pipeCapacity);
            const snappedMinutes = Math.round(relativeMinutes / 5) * 5;
            const insertTimeAbs = BUILDER_STATE.startTimeMin + snappedMinutes;

            // Check if insertion point is inside an anchored segment
            let runningTime = BUILDER_STATE.startTimeMin;
            let isInsideAnchored = false;
            // We check against the 'baseSegments' (the timeline *without* the stone)
            for (const seg of BUILDER_STATE.interaction.baseSegments) {
                const segStart = runningTime;
                const segEnd = runningTime + seg.duration_min;
                if (isAnchored(seg.component_id) && insertTimeAbs > segStart && insertTimeAbs < segEnd) {
                    isInsideAnchored = true;
                    break;
                }
                runningTime += seg.duration_min;
            }

            if (isInsideAnchored) {
                // Don't render the change, just return
                return;
            }

            const previewSegments = insertStone(
                BUILDER_STATE.interaction.baseSegments, 
                BUILDER_STATE.interaction.draggedSegment.component_id, 
                BUILDER_STATE.interaction.draggedSegment.duration_min, 
                insertTimeAbs
            );
            BUILDER_STATE.segments = previewSegments;
            renderTimeline();
        }
    };

    const handleGlobalMouseUp = (e) => {
        if (BUILDER_STATE.interaction.type) {
            // Only save history if it was a completed move or resize
            if (BUILDER_STATE.interaction.type === 'move' || BUILDER_STATE.interaction.type === 'resize') {
                saveVisualHistory();
            }
            // Reset the interaction state, cancelling any 'potential-move'
            BUILDER_STATE.interaction = { type: null };
        }
    };

    // --- TOOLBOX DRAG & DROP HANDLERS ---

    const handleToolboxDragStart = (e) => {
        const item = e.target.closest('.ve-toolbox-item');
        if (!item) return;
        e.dataTransfer.setData('text/plain', item.dataset.componentId);
        e.dataTransfer.effectAllowed = 'copy';
    };

    const handleToolboxDragEnd = (e) => {
        if (ELS.visualEditorDropCursor) ELS.visualEditorDropCursor.style.display = 'none';
    };

    const handleTimelineDragOver = (e) => {
        e.preventDefault();
        // Allow drop
        const rect = ELS.visualEditorTimeline.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const width = ELS.visualEditorTimeline.clientWidth;
        const pct = Math.max(0, Math.min(1, x / width));
        
        // Calculate insert time to check if it's in an anchored segment
        const pipeCapacity = BUILDER_STATE.fixedShiftLength;
        const relativeMinutes = Math.round(pct * pipeCapacity);
        const snappedMinutes = Math.round(relativeMinutes / 5) * 5;
        const insertTimeAbs = BUILDER_STATE.startTimeMin + snappedMinutes;

        // Check if insertion point is inside an anchored segment
        let runningTime = BUILDER_STATE.startTimeMin;
        let isInsideAnchored = false;
        for (const seg of BUILDER_STATE.segments) {
            const segStart = runningTime;
            const segEnd = runningTime + seg.duration_min;
            if (isAnchored(seg.component_id) && insertTimeAbs > segStart && insertTimeAbs < segEnd) {
                isInsideAnchored = true;
                break;
            }
            runningTime += seg.duration_min;
        }

        if (isInsideAnchored) {
            // Disallow drop
            if (ELS.visualEditorDropCursor) ELS.visualEditorDropCursor.style.display = 'none';
            e.dataTransfer.dropEffect = 'none';
        } else {
            // Allow drop
            if (ELS.visualEditorDropCursor) {
                ELS.visualEditorDropCursor.style.display = 'block';
                ELS.visualEditorDropCursor.style.left = `${pct * 100}%`;
            }
            e.dataTransfer.dropEffect = 'copy';
        }
    };
    const handleTimelineDragLeave = (e) => {
        if (ELS.visualEditorDropCursor) ELS.visualEditorDropCursor.style.display = 'none';
    };
    const handleTimelineDrop = (e) => {
        e.preventDefault();
        if (ELS.visualEditorDropCursor) ELS.visualEditorDropCursor.style.display = 'none';
        const componentId = e.dataTransfer.getData('text/plain');
        const component = APP.StateManager.getComponentById(componentId);
        if (!component) return;

        // --- NEW OVERRIDE LOGIC ---
        if (component && component.is_full_day_override) {
            // This component is a "Full Day Override" (e.g., Sick, Holiday)
            // It will replace the *entire* schedule, ignoring all anchors.

            // 1. Create the new single-segment schedule
            const newSegments = [{ 
                component_id: componentId, 
                duration_min: BUILDER_STATE.fixedShiftLength 
            }];
            
            // 2. Apply it to the state
            BUILDER_STATE.segments = newSegments;

            // 3. Re-render and save history
            renderTimeline();
            saveVisualHistory();
        
        } else {
            // --- ORIGINAL LOGIC (for non-override components) ---
            if (isAnchored(componentId)) {
                APP.Utils.showToast("Breaks and Lunches cannot be added this way. Please edit them manually.", "warning");
                return;
            }

            const rect = ELS.visualEditorTimeline.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const pct = Math.max(0, Math.min(1, x / rect.width));
            
            const pipeCapacity = BUILDER_STATE.fixedShiftLength;
            const relativeMinutes = Math.round(pct * pipeCapacity);
            const snappedMinutes = Math.round(relativeMinutes / 5) * 5;
            const insertTimeAbs = BUILDER_STATE.startTimeMin + snappedMinutes;

            const newSegments = carveOutTime(
                BUILDER_STATE.segments,
                componentId,
                component.default_duration_min,
                insertTimeAbs
            );

            if (newSegments) {
                BUILDER_STATE.segments = newSegments;
                renderTimeline();
                saveVisualHistory();
            }
        }
        // --- END OF NEW LOGIC ---
    };
const updateDurationDisplay = () => {
        const startMin = parseTimeToMinutes(ELS.veAddStartTime.value);
        const endMin = parseTimeToMinutes(ELS.veAddEndTime.value);

        if (startMin !== null && endMin !== null) {
            let duration = endMin - startMin;
            if (duration < 0) {
                // Handle overnight (e.g., 22:00 to 02:00)
                duration = (1440 - startMin) + endMin;
            }
            
            if (duration < 0) duration = 0;
            
            if (ELS.veAddDurationDisplay) {
                ELS.veAddDurationDisplay.value = `${duration} minutes`;
            }
        } else {
            if (ELS.veAddDurationDisplay) {
                ELS.veAddDurationDisplay.value = '';
            }
        }
    };
    // --- POPUP & MENU ---
    
    const handleToolboxClick = (e) => {
        // Click fallback for touch/non-drag users
        const item = e.target.closest('.ve-toolbox-item');
        if (!item) return;
        const { componentId, componentName } = item.dataset;
        
        // Don't allow adding anchored components this way
        if (isAnchored(componentId)) {
            APP.Utils.showToast("Breaks and Lunches are anchored. Please edit them directly on the timeline.", "warning");
            return;
        }

        BUILDER_STATE.addPopupState = { isOpen: true, componentId, componentName, isEditing: false, editIndex: -1 };
        ELS.veAddPopupTitle.textContent = `Add: ${componentName}`;
        ELS.veAddStartTime.value = '';
        ELS.veAddEndTime.value = '';
        ELS.veAddDurationDisplay.value = '';
        ELS.visualEditorAddPopup.style.display = 'block';
        ELS.veAddStartTime.focus();
    };

    const closeAddPopup = () => {
        BUILDER_STATE.addPopupState.isOpen = false;
        if (ELS.visualEditorAddPopup) ELS.visualEditorAddPopup.style.display = 'none';
    };

    const handleAddPopupSave = () => {
        const { componentId, isEditing, editIndex } = BUILDER_STATE.addPopupState;
const startTime = parseTimeToMinutes(ELS.veAddStartTime.value);
        const endTime = parseTimeToMinutes(ELS.veAddEndTime.value);
        
        // --- NEW DURATION CALCULATION ---
        if (startTime === null || endTime === null) {
            APP.Utils.showToast("Invalid Start or End time. Use HH:MM format.", "danger");
            return;
        }

        let durationToAdd = endTime - startTime;
        if (durationToAdd < 0) {
            // Handle overnight
            durationToAdd = (1440 - startTime) + endTime;
        }
        
        if (isNaN(durationToAdd) || durationToAdd <= 0) {
            APP.Utils.showToast("Invalid duration. End time must be after start time.", "danger");
return;
        }
        // --- END NEW DURATION CALCULATION ---

        if (isEditing) {
             // --- EDIT LOGIC (Unchanged) ---
             // If editing, we just update the duration and let normalization handle it
             let base = BUILDER_STATE.segments;
             base[editIndex].duration_min = durationToAdd;
             BUILDER_STATE.segments = normalizeShiftLength(base);
             // --- END EDIT LOGIC ---

        } else {
            // --- ADD LOGIC (CHANGED) ---
            if (startTime === null) {
                 APP.Utils.showToast("Invalid start time. Use HH:MM format.", "danger");
                return;
            }
            
            // We now call carveOutTime, which REPLACES time.
            const newSegments = carveOutTime(
                BUILDER_STATE.segments,
                componentId,
                durationToAdd,
                startTime
            );
            
            // newSegments will be null if the carve-out failed
            if (!newSegments) {
                // Error toast was already shown by carveOutTime
                return;
            }
            BUILDER_STATE.segments = newSegments;
            // --- END ADD LOGIC ---
        }

        renderTimeline();
        saveVisualHistory();
        closeAddPopup();
    };
    // --- CONTEXT MENU ---
    const handleTimelineContextMenu = (e) => {
        e.preventDefault();
        closeContextMenu();
        const segment = e.target.closest('.ve-segment');
        if (!segment) return;
        const index = parseInt(segment.dataset.index, 10);
        BUILDER_STATE.contextMenuIndex = index;

        // Customize context menu
        const segmentId = BUILDER_STATE.segments[index].component_id;
        const allowDelete = !isAnchored(segmentId);

        const deleteButton = ELS.visualEditorContextMenu.querySelector('[data-action="delete"]');
        if (deleteButton) {
            deleteButton.style.display = allowDelete ? 'flex' : 'none';
        }

        ELS.visualEditorContextMenu.style.display = 'block';
        ELS.visualEditorContextMenu.style.left = `${e.clientX}px`;
        ELS.visualEditorContextMenu.style.top = `${e.clientY}px`;
    };

    const closeContextMenu = () => {
        if (ELS.visualEditorContextMenu) ELS.visualEditorContextMenu.style.display = 'none';
    };

    const handleContextMenuClick = (e) => {
        const item = e.target.closest('.ve-context-menu-item');
        if (!item) return;
        const action = item.dataset.action;
        const index = BUILDER_STATE.contextMenuIndex;
        if (index === -1 || index >= BUILDER_STATE.segments.length) {
            closeContextMenu();
            return;
        }

        if (action === 'delete') {
            BUILDER_STATE.segments = liftStone(BUILDER_STATE.segments, index);
        } else if (action === 'edit') {
            const seg = BUILDER_STATE.segments[index];
            const component = APP.StateManager.getComponentById(seg.component_id);
            // Find start time
            let time = BUILDER_STATE.startTimeMin;
            for(let i=0; i<index; i++) time += BUILDER_STATE.segments[i].duration_min;

            BUILDER_STATE.addPopupState = {
                isOpen: true, componentId: seg.component_id, componentName: component.name,
                isEditing: true, editIndex: index
            };
            ELS.veAddPopupTitle.textContent = `Edit: ${component.name}`;
            ELS.veAddStartTime.value = APP.Utils.formatMinutesToTime(time);
            ELS.veAddEndTime.value = APP.Utils.formatMinutesToTime(time + seg.duration_min);
            ELS.veAddDurationDisplay.value = `${seg.duration_min} minutes`;

// Don't allow changing start time for anchored items
            ELS.veAddStartTime.disabled = isAnchored(seg.component_id);

            ELS.visualEditorAddPopup.style.display = 'block';
            ELS.veAddDuration.focus();
        }
        renderTimeline();
        saveVisualHistory();
        closeContextMenu();
    };
    // --- HISTORY & SAVE ---
    const saveVisualHistory = () => {
        if (BUILDER_STATE.visualHistoryIndex < BUILDER_STATE.visualHistory.length - 1) {
            BUILDER_STATE.visualHistory = BUILDER_STATE.visualHistory.slice(0, BUILDER_STATE.visualHistoryIndex + 1);
        }
        BUILDER_STATE.visualHistory.push(JSON.parse(JSON.stringify(BUILDER_STATE.segments)));
        BUILDER_STATE.visualHistoryIndex++;
        updateUndoRedoButtons();
    };
    const handleUndo = () => {
        if (BUILDER_STATE.visualHistoryIndex > 0) {
            BUILDER_STATE.visualHistoryIndex--;
            BUILDER_STATE.segments = JSON.parse(JSON.stringify(BUILDER_STATE.visualHistory[BUILDER_STATE.visualHistoryIndex]));
            renderTimeline();
            updateUndoRedoButtons();
        }
    };
    const handleRedo = () => {
        if (BUILDER_STATE.visualHistoryIndex < BUILDER_STATE.visualHistory.length - 1) {
            BUILDER_STATE.visualHistoryIndex++;
            BUILDER_STATE.segments = JSON.parse(JSON.stringify(BUILDER_STATE.visualHistory[BUILDER_STATE.visualHistoryIndex]));
            renderTimeline();
            updateUndoRedoButtons();
        }
    };
    const updateUndoRedoButtons = () => {
        if (ELS.veUndo) ELS.veUndo.disabled = BUILDER_STATE.visualHistoryIndex <= 0;
        if (ELS.veRedo) ELS.veRedo.disabled = BUILDER_STATE.visualHistoryIndex >= BUILDER_STATE.visualHistory.length - 1;
    };
    const handleSave = async () => {
        const { mode, contextId, segments, startTimeMin, exceptionDate, reason } = BUILDER_STATE;
        const absoluteTimeSegments = [];
        let currentTime = startTimeMin;

        // --- BEGIN FIX ---
        let finalSegments;
        if (BUILDER_STATE.mode === 'exception') { // Apply normalization ONLY for exceptions
            // For exceptions, we MUST normalize to maintain the fixed shift length
            const normalized = normalizeShiftLength(segments);
            // Final check for zero-duration segments (from aggressive trimming)
            finalSegments = normalized.filter(seg => seg.duration_min > 0);
        } else {
            // For definitions, the length is dynamic. DO NOT normalize.
            // Just filter out any accidental zero-duration segments.
            finalSegments = segments.filter(seg => seg.duration_min > 0);
        }
        // --- END FIX ---

        for (const seg of finalSegments) {
            if (!seg.component_id) {
                APP.Utils.showToast("Error: Invalid activity.", "danger");
                return;
            }
            const start = currentTime;
            const end = currentTime + seg.duration_min;
            absoluteTimeSegments.push({ component_id: seg.component_id, start_min: start, end_min: end });
            currentTime = end;
        }

        // Final check on total duration
        const finalDuration = currentTime - startTimeMin;
        if (finalDuration !== BUILDER_STATE.fixedShiftLength) {
             APP.Utils.showToast(`Warning: Final duration (${finalDuration}m) does not match target (${BUILDER_STATE.fixedShiftLength}m). Saving anyway.`, "warning");
        }


        let result;
        if (mode === 'definition') {
            result = await APP.DataService.updateRecord('shift_definitions', { structure: absoluteTimeSegments }, { id: contextId });
if (!result.error) {
                APP.StateManager.syncRecord('shift_definitions', result.data);
APP.StateManager.saveHistory("Update Shift Structure");
                APP.Utils.showToast("Shift definition saved.", "success");
                if (APP.Components.ShiftDefinitionEditor) APP.Components.ShiftDefinitionEditor.render();
}
        } else if (mode === 'exception') {
            const record = { advisor_id: contextId, exception_date: exceptionDate, structure: absoluteTimeSegments, reason: reason ||
null };
            result = await APP.DataService.saveRecord('schedule_exceptions', record, 'advisor_id, exception_date');
            if (!result.error) {
                APP.StateManager.syncRecord('schedule_exceptions', result.data);
APP.StateManager.saveHistory("Save Schedule Exception");
                APP.Utils.showToast("Schedule exception saved.", "success");

                // --- START OF NEW CODE TO FIX LIVE UPDATE ---
                try {
                    // This is the "Walkie-Talkie" channel from the Advisor Portal
                    const channel = APP.DataService.getSupabaseClient().channel('rota-changes-advisor-portal-v3');
                    
                    // This sends the "signal" over the channel
                    channel.send({
                        type: 'broadcast',
                        event: 'schedule_update',
                        payload: { 
                            message: 'A schedule was updated', 
                            advisor_id: contextId, // Tell the portal *who* was updated
                            date: exceptionDate
                        }
                    });
                    
                    // We don't need to stay connected, so we unsubscribe.
                    // This is a "fire-and-forget" message.
                    APP.DataService.getSupabaseClient().removeChannel(channel);

                } catch (e) {
                    console.warn("Realtime broadcast failed:", e);
                }
                // --- END OF NEW CODE ---

            }
        }

        if (result && !result.error) {
            SequentialBuilder.close();
if (APP.Components.ScheduleViewer) APP.Components.ScheduleViewer.render();
        }
    };

    // --- LEGACY FUNCTIONS ---
    const renderLegacyTable = () => {
        if (!ELS.modalSequenceBody) return;
        let html = '';
        let currentTime = BUILDER_STATE.startTimeMin;
        const STATE = APP.StateManager.getState();
        const componentOptions = STATE.scheduleComponents.sort((a, b) => a.name.localeCompare(b.name))
            .map(c => `<option value="${c.id}">${c.name} (${c.type})</option>`).join('');
        BUILDER_STATE.segments.forEach((seg, index) => {
            const start = currentTime;
            const end = currentTime + seg.duration_min;
            html += `<tr data-index="${index}"><td>${index + 1}</td><td><select class="form-select sequence-component" data-index="${index}"><option value="">-- Select --</option>${componentOptions}</select></td><td><input type="number" class="form-input sequence-duration" data-index="${index}" value="${seg.duration_min}" min="5" step="5"></td><td><input type="text" class="form-input sequence-start-time" data-index="${index}" value="${APP.Utils.formatMinutesToTime(start)}" data-minutes="${start}"></td><td><input type="text" class="form-input sequence-end-time" data-index="${index}" value="${APP.Utils.formatMinutesToTime(end)}" data-minutes="${end}"></td><td class="actions-cell"><div class="btn-group"><button class="btn btn-sm" data-action="insert-before" data-index="${index}">+ Above</button><button class="btn btn-sm" data-action="insert-after" data-index="${index}">+ Below</button><button class="btn btn-sm" data-action="split-row" data-index="${index}">Split</button><button class="btn btn-sm btn-danger delete-sequence-item" data-index="${index}">X</button></div></td></tr>`;
            currentTime = end;
        });
        ELS.modalSequenceBody.innerHTML = html;
        BUILDER_STATE.segments.forEach((seg, index) => {
            const el = ELS.modalSequenceBody.querySelector(`.sequence-component[data-index="${index}"]`);
            if (el) el.value = seg.component_id || '';
        });
        renderSummary();
    };

    const handleLegacyAddActivity = () => {
        BUILDER_STATE.segments.push({ component_id: null, duration_min: 60 });
        renderLegacyTable();
    };

    const handleLegacySequenceChange = (e) => {
        const target = e.target;
        const index = parseInt(target.dataset.index, 10);
        if (isNaN(index)) return;
        if (target.classList.contains('sequence-component')) {
            const componentId = target.value;
            BUILDER_STATE.segments[index].component_id = componentId || null;
            const component = APP.StateManager.getComponentById(componentId);
            if (component) BUILDER_STATE.segments[index].duration_min = component.default_duration_min;
        } else if (target.classList.contains('sequence-duration')) {
            const duration = parseInt(target.value, 10);
            if (isNaN(duration) || duration < 5) {
                target.value = BUILDER_STATE.segments[index].duration_min;
                return;
            }
            BUILDER_STATE.segments[index].duration_min = duration;
        } else if (target.classList.contains('sequence-start-time')) {
            const newStartTimeMin = parseTimeToMinutes(target.value);
            const originalStartTimeMin = parseInt(target.dataset.minutes, 10);
            if (newStartTimeMin === null || newStartTimeMin === originalStartTimeMin) {
                target.value = APP.Utils.formatMinutesToTime(originalStartTimeMin);
                return;
            }
            if (index === 0) {
                BUILDER_STATE.startTimeMin = newStartTimeMin;
                if (ELS.modalStartTime && ELS.modalStartTime._flatpickr) {
                     ELS.modalStartTime._flatpickr.setDate(APP.Utils.formatMinutesToTime(newStartTimeMin), false);
                }
            } else {
                const durationDiff = newStartTimeMin - originalStartTimeMin;
                const prevDuration = BUILDER_STATE.segments[index - 1].duration_min;
                const currDuration = BUILDER_STATE.segments[index].duration_min;
                const newPrevDuration = prevDuration + durationDiff;
                const newCurrDuration = currDuration - durationDiff;
                if (newPrevDuration < 5 || newCurrDuration < 5) {
                    APP.Utils.showToast("Cannot adjust: activity too short.", "warning");
                    target.value = APP.Utils.formatMinutesToTime(originalStartTimeMin);
                    return;
                }
                BUILDER_STATE.segments[index - 1].duration_min = newPrevDuration;
                BUILDER_STATE.segments[index].duration_min = newCurrDuration;
}
} else if (target.classList.contains('sequence-end-time')) {
                const newEndTimeMin = parseTimeToMinutes(target.value);
                const originalEndTimeMin = parseInt(target.dataset.minutes, 10);

                if (newEndTimeMin === null || newEndTimeMin === originalEndTimeMin) {
                    target.value = APP.Utils.formatMinutesToTime(originalEndTimeMin);
                    return; // No change or invalid, so just exit
                }

                // Find the start time of this row to calculate duration
                const row = target.closest('tr');
                if (!row) return; // Safety check
                const startTimeInput = row.querySelector('.sequence-start-time');
                if (!startTimeInput) return; // Safety check
                
                const startTimeMin = parseInt(startTimeInput.dataset.minutes, 10);
                const newDuration = newEndTimeMin - startTimeMin;

                if (isNaN(newDuration) || newDuration < 5) {
                    APP.Utils.showToast("Duration must be at least 5 minutes.", "warning");
                    target.value = APP.Utils.formatMinutesToTime(originalEndTimeMin); // Revert
                    return; // Exit
                }

                // Update the state
                BUILDER_STATE.segments[index].duration_min = newDuration;
            }
renderLegacyTable();
    };

    const handleLegacySequenceClick = (e) => {
        const target = e.target.closest('button');
        if (!target) return;
        const index = parseInt(target.dataset.index, 10);
        if (isNaN(index)) return;
        const clamp = (v) => Math.max(5, Math.round(v / 5) * 5);
        if (target.classList.contains('delete-sequence-item')) {
            BUILDER_STATE.segments.splice(index, 1);
            renderLegacyTable();
            return;
        }
        const action = target.dataset.action;
        if (action === 'insert-before' || action === 'insert-after') {
            const NEW_DURATION = 30;
            const insertAt = action === 'insert-before' ? index : index + 1;
            BUILDER_STATE.segments.splice(insertAt, 0, { component_id: null, duration_min: NEW_DURATION });
            const adjustIndex = action === 'insert-before' ? index + 1 : index;
            if (BUILDER_STATE.segments[adjustIndex]) {
                const cur = BUILDER_STATE.segments[adjustIndex];
                if (cur.duration_min > NEW_DURATION + 5) cur.duration_min -= NEW_DURATION;
            }
            renderLegacyTable();
            return;
        }
        if (action === 'split-row') {
            const seg = BUILDER_STATE.segments[index];
            if (!seg || seg.duration_min < 10) {
                APP.Utils.showToast("Too short to split.", "warning");
                return;
            }
            let first = clamp(Math.floor(seg.duration_min / 2));
            let second = seg.duration_min - first;
            seg.duration_min = first;
            BUILDER_STATE.segments.splice(index + 1, 0, { component_id: seg.component_id, duration_min: second });
            renderLegacyTable();
        }
    };
    
    APP.Components = APP.Components || {};
    APP.Components.SequentialBuilder = SequentialBuilder;
}(window.APP));


/**
 * MODULE: APP.Components.ShiftDefinitionEditor
 * Manages the list of Shift Definitions and triggers the SequentialBuilder.
 * V16.14: Added inline edit for Code and Name.
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
                <td>
                    <strong class="display-value">${def.code}</strong>
                    <input type="text" class="form-input edit-value" name="def-code" value="${def.code}" style="display:none;">
                </td>
                <td>
                    <span class="display-value">${def.name}</span>
                    <input type="text" class="form-input edit-value" name="def-name" value="${def.name}" style="display:none;">
                </td>

                <td>${APP.Utils.formatDuration(totalDuration)}</td>
                <td>${APP.Utils.formatDuration(paidDuration)}</td>

                <td class="actions">
                    <button class="btn btn-sm btn-secondary btn-edit-shift" data-definition-id="${def.id}">Edit</button>
                    <button class="btn btn-sm btn-secondary btn-duplicate-shift" data-definition-id="${def.id}">Duplicate</button>
                    <button class="btn btn-sm btn-primary edit-structure" data-definition-id="${def.id}">Edit Structure</button>
               
     <button class="btn btn-sm btn-danger delete-definition" data-definition-id="${def.id}">Delete</button>

                    <button class="btn btn-sm btn-success btn-save-shift" data-definition-id="${def.id}" style="display:none;">Save</button>
                    <button class="btn btn-sm btn-secondary btn-cancel-shift" data-definition-id="${def.id}" style="display:none;">Cancel</button>
                </td>
            </tr>`;
        });
        html += '</tbody></table>';
        ELS.grid.innerHTML = html;
    };

    // --- NEW HELPER FUNCTIONS ---
    const toggleRowEdit = (row, isEditing) => {
        if (!row) return;
        // Toggle display/edit fields
        row.querySelectorAll('.display-value').forEach(el => el.style.display = isEditing ? 'none' : '');
        row.querySelectorAll('.edit-value').forEach(el => el.style.display = isEditing ? 'block' : 'none');

        // Toggle buttons
        row.querySelector('.btn-edit-shift').style.display = isEditing ? 'none' : '';
        row.querySelector('.edit-structure').style.display = isEditing ? 'none' : '';
        row.querySelector('.delete-definition').style.display = isEditing ? 'none' : '';
        row.querySelector('.btn-save-shift').style.display = isEditing ? 'inline-block' : 'none';
        row.querySelector('.btn-cancel-shift').style.display = isEditing ? 'inline-block' : 'none';

        if (!isEditing) {
            // Reset values on cancel
            const code = row.querySelector('.edit-value[name="def-code"]');
            const name = row.querySelector('.edit-value[name="def-name"]');
            // Find the original values from the display spans and reset the inputs
            code.value = row.querySelector('td:nth-child(1) .display-value').textContent;
            name.value = row.querySelector('td:nth-child(2) .display-value').textContent;
        }
    };

    const handleSave = async (id, row) => {
        const newCode = row.querySelector('input[name="def-code"]').value.trim();
        const newName = row.querySelector('input[name="def-name"]').value.trim();

        if (!newCode || !newName) {
            APP.Utils.showToast("Code and Name are required.", "danger");
            return;
        }

        const originalDefinition = APP.StateManager.getShiftDefinitionById(id);

        // Check if code already exists (and it's not the original code)
        if (newCode !== originalDefinition.code && APP.StateManager.getShiftDefinitionByCode(newCode)) {
            APP.Utils.showToast("Error: That code already exists.", "danger");
            return;
        }

        const updates = { code: String(newCode), name: newName };

        const { data, error } = await APP.DataService.updateRecord('shift_definitions', updates, { id: id });

        if (!error) {
            APP.StateManager.syncRecord('shift_definitions', data);
            APP.StateManager.saveHistory("Edit Shift Definition");
            APP.Utils.showToast("Shift definition updated.", "success");
            ShiftDefinitionEditor.render(); // Re-render this table

            // Re-render rotation editor to update dropdowns
            if (APP.Components.RotationEditor) {
                 APP.Components.RotationEditor.renderGrid();
            }
        } else {
            APP.Utils.showToast("Error updating shift. Check console.", "danger");
        }
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
        if (APP.StateManager.getShiftDefinitionByCode(code)) {
            APP.Utils.showToast("Error: Code already exists.", "danger");
            return;
        }

        const newDefinition = { name, code: String(code), structure: [] };
        const { data, error } = await APP.DataService.saveRecord('shift_definitions', newDefinition);
        if (!error) {
            APP.StateManager.syncRecord('shift_definitions', data);
            APP.StateManager.saveHistory("Create Shift Definition");
            APP.Utils.showToast(`Shift '${name}' created. Now click 'Edit Structure'.`, "success");
            ShiftDefinitionEditor.render();
            if (APP.Components.RotationEditor) {
                 APP.Components.RotationEditor.renderGrid();
            }
        }
    };

    // --- UPDATED CLICK HANDLER ---
    const handleGridClick = (e) => {
        const row = e.target.closest('tr');
        if (!row) return;
        const definitionId = row.dataset.definitionId;
        if (!definitionId) return;

        if (e.target.classList.contains('edit-structure')) {
            // Open the shared Sequential Builder
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
            handleDeleteDefinition(definitionId);
        } else if (e.target.classList.contains('btn-duplicate-shift')) {
            handleDuplicateShift(definitionId);
// --- NEW LOGIC FOR NEW BUTTONS ---
        } else if (e.target.classList.contains('btn-edit-shift')) {
            toggleRowEdit(row, true);
        } else if (e.target.classList.contains('btn-cancel-shift')) {
            toggleRowEdit(row, false);
        } else if (e.target.classList.contains('btn-save-shift')) {
            handleSave(definitionId, row);
        }
    };

    const handleDeleteDefinition = async (id) => {
        const definition = APP.StateManager.getShiftDefinitionById(id);
        if (!definition || !confirm(`Delete '${definition.name}' (${definition.code})?`)) return;

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
const handleDuplicateShift = async (originalId) => {
        const originalShift = APP.StateManager.getShiftDefinitionById(originalId);
        if (!originalShift) {
            APP.Utils.showToast(`Could not find data for shift`, "danger");
            return;
        }

        const newCode = prompt(`Enter a new UNIQUE CODE for the copy of "${originalShift.code}":`, `${originalShift.code}_COPY`);

        if (!newCode || newCode.trim() === '') {
            return; // User cancelled
        }
        
        const newName = prompt(`Enter a new name:`, `${originalShift.name} (Copy)`);

        if (!newName || newName.trim() === '') {
            return; // User cancelled
        }

        if (newCode === originalShift.code) {
             APP.Utils.showToast("The new code must be different from the original.", "warning");
             return;
        }

        if (APP.StateManager.getShiftDefinitionByCode(newCode)) {
            APP.Utils.showToast(`A shift with the code "${newCode}" already exists.`, "danger");
            return;
        }

        // Create the new shift object, deep copying the structure
        const newShift = {
            code: String(newCode),
            name: newName,
            start_time_min: originalShift.start_time_min,
            structure: JSON.parse(JSON.stringify(originalShift.structure)) // Deep copy
        };

        // Save to database
        const { data, error } = await APP.DataService.saveRecord('shift_definitions', newShift);

        if (error) {
            // Error is handled by DataService
            return;
        }

        // Update local state
        APP.StateManager.syncRecord('shift_definitions', data);
        APP.StateManager.saveHistory("Duplicate Shift Definition");
        
        APP.Utils.showToast(`Shift duplicated as "${newName}".`, "success");
        ShiftDefinitionEditor.render(); // Re-render the list
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
        ELS.btnAddWeek = document.getElementById('btnAddWeek'); // (Top Button)
        ELS.btnDeleteFirstWeek = document.getElementById('btnDeleteFirstWeek'); // <-- ADD THIS LINE
        ELS.grid = document.getElementById('rotationGrid');
        ELS.autoSaveStatus = document.getElementById('autoSaveStatus');

        if (ELS.familySelect) ELS.familySelect.addEventListener('change', handleFamilyChange);
   
     if (ELS.btnNew) ELS.btnNew.addEventListener('click', handleNewRotation);
        if (ELS.btnDelete) ELS.btnDelete.addEventListener('click', handleDeleteRotation);
        ELS.btnDuplicate = document.getElementById('btnDuplicateRotation');
if (ELS.btnDuplicate) ELS.btnDuplicate.addEventListener('click', handleDuplicateRotation);
        if (ELS.btnAddWeek) ELS.btnAddWeek.addEventListener('click', handleAddWeekTop);
        if (ELS.btnDeleteFirstWeek) ELS.btnDeleteFirstWeek.addEventListener('click', handleDeleteFirstWeek); // <-- ADD THIS LINE
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
        
        // Use the utility function to determine the number of weeks
        let numWeeks = 0;
        if (pattern) {
            numWeeks = APP.Utils.calculateRotationLength(pattern);
// Ensure a minimum of 6 weeks is displayed if the pattern exists but has fewer than 6 defined.
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
const toggleRowEdit = (row, isEditing) => {
        if (!row) return;
        // Toggle display/edit fields
        row.querySelectorAll('.display-value').forEach(el => el.style.display = isEditing ? 'none' : '');
        row.querySelectorAll('.edit-value').forEach(el => el.style.display = isEditing ? 'block' : 'none');

        // Toggle buttons
        row.querySelector('.btn-edit-shift').style.display = isEditing ? 'none' : '';
        row.querySelector('.edit-structure').style.display = isEditing ? 'none' : '';
        row.querySelector('.delete-definition').style.display = isEditing ? 'none' : '';
        row.querySelector('.btn-save-shift').style.display = isEditing ? 'inline-block' : 'none';
        row.querySelector('.btn-cancel-shift').style.display = isEditing ? 'inline-block' : 'none';

        if (!isEditing) {
            // Reset values on cancel
            const code = row.querySelector('.edit-value[name="def-code"]');
            const name = row.querySelector('.edit-value[name="def-name"]');
            // Find the original values from the display spans and reset the inputs
            code.value = row.querySelector('td:nth-child(1) .display-value').textContent;
            name.value = row.querySelector('td:nth-child(2) .display-value').textContent;
        }
    };

    const handleSave = async (id, row) => {
        const newCode = row.querySelector('input[name="def-code"]').value.trim();
        const newName = row.querySelector('input[name="def-name"]').value.trim();

        if (!newCode || !newName) {
            APP.Utils.showToast("Code and Name are required.", "danger");
            return;
        }

        const originalDefinition = APP.StateManager.getShiftDefinitionById(id);

        // Check if code already exists (and it's not the original code)
        if (newCode !== originalDefinition.code && APP.StateManager.getShiftDefinitionByCode(newCode)) {
            APP.Utils.showToast("Error: That code already exists.", "danger");
            return;
        }

        const updates = { code: String(newCode), name: newName };

        const { data, error } = await APP.DataService.updateRecord('shift_definitions', updates, { id: id });

        if (!error) {
            APP.StateManager.syncRecord('shift_definitions', data);
            APP.StateManager.saveHistory("Edit Shift Definition");
            APP.Utils.showToast("Shift definition updated.", "success");
            ShiftDefinitionEditor.render(); // Re-render this table

            // Re-render rotation editor to update dropdowns
            if (APP.Components.RotationEditor) {
                 APP.Components.RotationEditor.renderGrid();
            }
        } else {
            APP.Utils.showToast("Error updating shift. Check console.", "danger");
        }
    };
        // V15.8.1: Added "Delete Last Week" button
        // Inline "Add Week" and "Delete Week" (only when a rotation is selected)
        if (pattern) {
          html += `
            <div class="table-footer-inline">
              <button id="btnAddWeekInline" class="btn btn-secondary">[+] Add Week (Bottom)</button>
              <button id="btnDeleteWeekInline" class="btn btn-danger" ${numWeeks === 0 ? 'disabled' : ''}>[-] Delete Last Week</button>
            </div>
          `;
        }

        
        if (numWeeks === 0 && !pattern) {
             html = '<div class="visualization-empty">Select or create a rotation to begin editing.</div>';
        }

        ELS.grid.innerHTML = html;


        // Wire inline buttons (appears under the table)
        const inlineAdd = document.getElementById('btnAddWeekInline');
        if (inlineAdd) inlineAdd.addEventListener('click', handleAddWeek);

        // V15.8.1: Wire the new Delete Last Week button
        const inlineDelete = document.getElementById('btnDeleteWeekInline');
        if (inlineDelete) inlineDelete.addEventListener('click', handleDeleteLastWeek);


        // Set selected values (must be done after HTML insertion)
        if (pattern) {
            weeks.forEach(w => {
                // Need a robust way to find the week data regardless of key format
                const weekKey = findWeekKey(patternData, w);
                const weekData = weekKey ? patternData[weekKey] : {};
                
                days.forEach((d, i) => {
                    const dow = i + 1;
                    // Handle legacy DOW keys (e.g., 'mon') if numerical key is missing
                    const legacyDayKey = d.toLowerCase();
                    const code = weekData[dow] || weekData[legacyDayKey] || ''; 

                    const sel = ELS.grid.querySelector(`select[data-week="${w}"][data-dow="${dow}"]`);
                    if (sel) {
                        sel.value = code;
                    }
                });
            });
}

        // Enable/Disable Add Week button based on selection
        if (ELS.btnAddWeek) {
            ELS.btnAddWeek.disabled = !pattern;
}
        if (ELS.btnDeleteFirstWeek) { // <-- ADD THIS
            ELS.btnDeleteFirstWeek.disabled = !pattern || numWeeks === 0; // <-- ADD THIS
        } // <-- ADD THIS
    };

    // Helper: Finds the correct key in the pattern data (handles "Week 1", "Week1", "week1" etc.)
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
            
            // Update related components
            if (APP.Components.AssignmentManager) {
                APP.Components.AssignmentManager.render(); // Update assignment dropdowns
            }
        }
    };
    const handleDuplicateRotation = async () => {
        const STATE = APP.StateManager.getState();
        const currentRotationName = STATE.currentRotation;
        
        // 1. Validate that a rotation is currently selected
        if (!currentRotationName) {
            APP.Utils.showToast("Please select a rotation to duplicate first.", "warning");
            return;
        }

        const currentPattern = APP.StateManager.getPatternByName(currentRotationName);
        if (!currentPattern) return;

        // 2. Prompt for new name
        const newName = prompt(`Enter name for the duplicate of '${currentRotationName}':`, `${currentRotationName} (Copy)`);
        if (!newName || newName.trim() === '') return;

        // 3. Check if name already exists
        if (APP.StateManager.getPatternByName(newName)) {
            APP.Utils.showToast("Error: A rotation with that name already exists.", "danger");
            return;
        }

        // 4. Create copy (Deep copy the pattern object to avoid reference issues)
        const newPatternData = JSON.parse(JSON.stringify(currentPattern.pattern));
        const newRecord = { name: newName, pattern: newPatternData };

        // 5. Save to database
        const { data, error } = await APP.DataService.saveRecord('rotation_patterns', newRecord);

        if (!error) {
            // Sync to local state
            APP.StateManager.syncRecord('rotation_patterns', data);
            
            // Switch focus to the new rotation
            STATE.currentRotation = newName;
            
            APP.StateManager.saveHistory(`Duplicate Rotation: ${newName}`);
            APP.Utils.showToast(`Rotation duplicated as '${newName}'.`, "success");
            
            // Re-render the editor to show the new rotation
            RotationEditor.render();
            
            // Update AssignmentManager dropdowns so the new rotation is available for assignment immediately
            if (APP.Components.AssignmentManager) {
                APP.Components.AssignmentManager.render(); 
            }
        }
    };
// Handle adding a new week to the *top* of the rotation (shifts all other weeks down)
    const handleAddWeekTop = async () => {
        const STATE = APP.StateManager.getState();
        const rotationName = STATE.currentRotation;
        const pattern = APP.StateManager.getPatternByName(rotationName);

        if (!pattern) return;

        // 1. Create a new, empty pattern object
        const newPatternData = {};
        
        // 2. Add the new "Week 1"
        newPatternData["Week 1"] = {};

        // 3. Get the current max week number
        const maxWeek = APP.Utils.calculateRotationLength(pattern);

        // 4. Re-index and copy all existing weeks
        if (pattern.pattern) {
            for (let w = 1; w <= maxWeek; w++) {
                // Find the key for the old week (e.g., "Week 1")
                const oldWeekKey = findWeekKey(pattern.pattern, w);
                if (oldWeekKey) {
                    // Create the new key (e.g., "Week 2")
                    const newWeekKey = `Week ${w + 1}`;
                    // Copy the data
                    newPatternData[newWeekKey] = pattern.pattern[oldWeekKey];
                }
            }
        }

        // 5. Save the new, re-indexed pattern (Auto-Save Architecture)
        const { error } = await APP.DataService.updateRecord('rotation_patterns', { pattern: newPatternData }, { name: rotationName });
        
        if (!error) {
            // Manually update the local state to match
            pattern.pattern = newPatternData;
            APP.StateManager.saveHistory(`Add Week 1 (Top)`);
            APP.Utils.showToast(`Week 1 added to top of rotation.`, "success");
            RotationEditor.renderGrid(); // Re-render the grid
        }
    };
    // Handle adding a new week to the existing rotation
    const handleAddWeek = async () => {
        const STATE = APP.StateManager.getState();
        const rotationName = STATE.currentRotation;
        const pattern = APP.StateManager.getPatternByName(rotationName);

        if (!pattern) return;

        // Determine the next week number
        // Use the utility function
        const maxWeek = APP.Utils.calculateRotationLength(pattern);
        // If the length was 0 (empty pattern), we ensure it starts at 1.
        const nextWeek = (maxWeek === 0) ? 1 : maxWeek + 1;


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

    // V15.8.1: Handle deleting the last week from the existing rotation
    const handleDeleteLastWeek = async () => {
        const STATE = APP.StateManager.getState();
        const rotationName = STATE.currentRotation;
        const pattern = APP.StateManager.getPatternByName(rotationName);

        if (!pattern || !pattern.pattern) return;

        // Determine the current maximum week number
        const maxWeek = APP.Utils.calculateRotationLength(pattern);

        if (maxWeek === 0) {
            APP.Utils.showToast("Rotation is already empty.", "warning");
            return;
        }

        if (!confirm(`Are you sure you want to delete Week ${maxWeek} from ${rotationName}? This cannot be undone easily.`)) {
            return;
        }

        // Find the key for the last week
        const lastWeekKey = findWeekKey(pattern.pattern, maxWeek);

        if (!lastWeekKey) {
            console.error("Error: Could not find the key for the last week, even though length > 0.");
            return;
        }

        // Store the week data for potential rollback if the save fails
        const deletedWeekData = JSON.parse(JSON.stringify(pattern.pattern[lastWeekKey]));

        // 1. Delete the week locally
        delete pattern.pattern[lastWeekKey];

        // 2. Save the updated structure (Auto-Save Architecture)
        const { error } = await APP.DataService.updateRecord('rotation_patterns', { pattern: pattern.pattern }, { name: rotationName });

        if (!error) {
            APP.StateManager.saveHistory(`Delete Week ${maxWeek}`);
            APP.Utils.showToast(`Week ${maxWeek} deleted from rotation.`, "success");
            RotationEditor.renderGrid(); // Re-render the grid to show the change
        } else {
            // Rollback local change if save failed
            pattern.pattern[lastWeekKey] = deletedWeekData;
          // Error toast is shown by DataService
        }
    };

    // V16.15: Handle deleting the *first* week from the existing rotation
    const handleDeleteFirstWeek = async () => {
        const STATE = APP.StateManager.getState();
        const rotationName = STATE.currentRotation;
        const pattern = APP.StateManager.getPatternByName(rotationName);

        if (!pattern || !pattern.pattern) return;
        
        // Determine the current maximum week number
        const maxWeek = APP.Utils.calculateRotationLength(pattern);
        if (maxWeek === 0) {
            APP.Utils.showToast("Rotation is already empty.", "warning");
            return;
        }

        if (!confirm(`Are you sure you want to delete Week 1 from ${rotationName}?\n\nThis will shift all other weeks up. This action cannot be undone easily.`)) {
            return;
        }

        // 1. Create a new, empty pattern object
        const newPatternData = {};
        const originalPatternData = JSON.parse(JSON.stringify(pattern.pattern)); // For rollback

        // 2. Re-index and copy all existing weeks, skipping Week 1
        for (let w = 2; w <= maxWeek; w++) {
            // Find the key for the old week (e.g., "Week 2")
            const oldWeekKey = findWeekKey(pattern.pattern, w);
            if (oldWeekKey) {
                // Create the new key (e.g., "Week 1")
                const newWeekKey = `Week ${w - 1}`;
                // Copy the data
                newPatternData[newWeekKey] = pattern.pattern[oldWeekKey];
            }
        }
        
        // 3. Save the new, re-indexed pattern (Auto-Save Architecture)
        const { error } = await APP.DataService.updateRecord('rotation_patterns', { pattern: newPatternData }, { name: rotationName });
        
        if (!error) {
            // Manually update the local state to match
            pattern.pattern = newPatternData;
            APP.StateManager.saveHistory(`Delete Week 1 (Top)`);
            APP.Utils.showToast(`Week 1 deleted and rotation re-indexed.`, "success");
            RotationEditor.renderGrid(); // Re-render the grid
        } else {
            // Rollback local change if save failed
            pattern.pattern = originalPatternData;
            // Error toast is shown by DataService
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

        // Find the correct week key format or create it if missing (using standard format)
        let weekKey = findWeekKey(pattern.pattern, parseInt(week, 10));
        if (!weekKey) {
            weekKey = `Week ${week}`; // Use standard format for new entries
        }

        if (!pattern.pattern[weekKey]) pattern.pattern[weekKey] = {};
        
        // Normalize the update by removing legacy keys and using the standard numerical DOW key
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
            // Syncing the pattern also clears the historical cache in StateManager
            APP.StateManager.syncRecord('rotation_patterns', pattern); 
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
            // Error toast handled in DataService
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

        // NEW: Cache Day Toggle Buttons
        ELS.btnPrevDay = document.getElementById('btnPrevDay');
        ELS.btnNextDay = document.getElementById('btnNextDay');

        // Event Listeners
        if (ELS.treeSearch) ELS.treeSearch.addEventListener('input', renderTree);
        if (ELS.btnClearSelection) ELS.btnClearSelection.addEventListener('click', clearSelection);
        if (ELS.tree) ELS.tree.addEventListener('change', handleTreeChange);
        
        if (ELS.plannerDay) ELS.plannerDay.addEventListener('change', () => {
            APP.StateManager.getState().selectedDay = ELS.plannerDay.value;
            renderPlannerContent();
        });

        // NEW: Day Toggle Listeners
        if (ELS.btnPrevDay) ELS.btnPrevDay.addEventListener('click', () => cycleDay(-1));
        if (ELS.btnNextDay) ELS.btnNextDay.addEventListener('click', () => cycleDay(1));

        if (ELS.viewToggleGroup) ELS.viewToggleGroup.addEventListener('click', handleViewToggle);

        // Add listener for Live Editing clicks
        if (ELS.visualizationContainer) ELS.visualizationContainer.addEventListener('click', handleVisualizationClick);
    };

    // NEW: Helper to cycle days (prev/next)
    const cycleDay = (offset) => {
        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        const current = APP.StateManager.getState().selectedDay || 'Monday';
        let idx = days.indexOf(current);
        if (idx === -1) idx = 0;
        
        // Wrap around logic
        let newIdx = (idx + offset);
        if (newIdx < 0) newIdx = 6;
        if (newIdx > 6) newIdx = 0;
        
        const newDay = days[newIdx];
        
        // Update State
        APP.StateManager.getState().selectedDay = newDay;
        
        // Update Dropdown
        if (ELS.plannerDay) ELS.plannerDay.value = newDay;
        
        // Trigger Render
        renderPlannerContent();
    };

    // Main render function (coordinates tree and planner rendering)
    ScheduleViewer.render = async () => {
        // Ensure historical data is loaded before rendering the planner visualization.
        const STATE = APP.StateManager.getState();
        if (STATE.weekStart) {
            // Pre-load the effective assignments for the selected week start date.
            await APP.StateManager.loadEffectiveAssignments(STATE.weekStart);
        }
        
        renderTree();
        renderPlannerContent();

        // Also ensure Assignments tab is up-to-date if visible (as it relies on the same historical data)
        const assignmentsTab = document.getElementById('tab-advisor-assignments');
        if (assignmentsTab && assignmentsTab.classList.contains('active') && APP.Components.AssignmentManager) {
             APP.Components.AssignmentManager.render();
        }
    };


    const handleViewToggle = (e) => {
        const target = e.target.closest('.btn-toggle');
        if (target) {
            const viewMode = target.dataset.view;
            APP.StateManager.getState().scheduleViewMode = viewMode;
            
            ELS.viewToggleGroup.querySelectorAll('.btn-toggle').forEach(btn => btn.classList.remove('active'));
            target.classList.add('active');

            ELS.dayToggleContainer.style.display = (viewMode === 'daily') ? 'flex' : 'none';
            
            renderPlannerContent();
        }
    };

    // Handle clicks on the visualization (for Live Editing)
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
                 // Use utility function for consistency
                 dayName = APP.Utils.getDayNameFromISO(dateISO);
             }
        }

        if (advisorId && dateISO && dayName) {
            const advisor = APP.StateManager.getAdvisorById(advisorId);
            if (!advisor) return;
            
            // Calculate the Monday for that specific date
            const weekStartISO = APP.Utils.getMondayForDate(dateISO); 
            
            // Use the centralized ScheduleCalculator
            // NOTE: This relies on the historical data for weekStartISO being loaded. 
            const { segments, reason } = APP.ScheduleCalculator.calculateSegments(advisorId, dayName, weekStartISO);

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

                // Get the site name (if it exists) from the data we fetched in Fix 1
                const site = leader.sites ? leader.sites.name : '';
                const siteHTML = site ? `<span class="team-brand">${site}</span>` : '';

                html += `<div class="tree-node-leader">
                    <label>
                   
                     <input type="checkbox" class="select-leader" data-leader-id="${leader.id}" ${allSelected ? 'checked' : ''} />
                        ${leader.name} (Team Leader)
                        ${siteHTML}
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
        
        // Render the content based on the selection change
        renderPlannerContent();
    };

    const clearSelection = () => {
        APP.StateManager.getState().selectedAdvisors.clear();
        renderTree();
        // Render the content based on the selection change
        renderPlannerContent();
    };

    // Renamed from renderPlanner. This assumes data is already loaded/cached.
    const renderPlannerContent = () => {
        const STATE = APP.StateManager.getState();
        if (STATE.scheduleViewMode === 'daily') {
            renderDailyPlanner();
        } else {
            renderWeeklyPlanner();
        }
    };

    // --- DAILY VIEW (GANTT) ---

    const renderDailyPlanner = () => {
        const STATE = APP.StateManager.getState();

        // 1. Calculate the specific date for the selected day
        // This uses the weekStart (e.g., 2023-11-13) and selectedDay (e.g., "Tuesday")
        const dateISO = APP.Utils.getISODateForDayName(STATE.weekStart, STATE.selectedDay);
        const dateFriendly = dateISO ? APP.Utils.convertISOToUKDate(dateISO) : "";

        // 2. Update the Title dynamically (e.g., "Tuesday, 14/11/2023")
        ELS.scheduleViewTitle.textContent = `Schedule Visualization (${STATE.selectedDay}, ${dateFriendly})`;

        // 3. Setup the structure for the Gantt chart
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

        // 4. Cache dynamic elements
        const ELS_DAILY = {
            timeHeader: document.getElementById('timeHeader'),
            plannerBody: document.getElementById('plannerBody'),
            timelineContainer: document.getElementById('timelineContainer'),
            currentTimeIndicator: document.getElementById('currentTimeIndicator'),
            mouseTimeIndicator: document.getElementById('mouseTimeIndicator'),
            mouseTimeTooltip: document.getElementById('mouseTimeTooltip')
        };

        renderTimeHeader(ELS_DAILY.timeHeader);
        
        const selected = Array.from(STATE.selectedAdvisors);
        if (selected.length > 0) {
            const advisorsToRender = STATE.advisors
                .filter(a => selected.includes(a.id))
                .sort((a,b) => a.name.localeCompare(b.name));

            let html = '';
            advisorsToRender.forEach(adv => {
                // Use the centralized ScheduleCalculator
                const { segments, source } = APP.ScheduleCalculator.calculateSegments(adv.id, STATE.selectedDay);
                
                // Add exception styling class if source is 'exception'
                const rowClass = (source === 'exception') ? 'is-exception' : '';

                // Add data-advisor-id for click handling
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
        for (let h = startHour; h <= endHour; h++) {
            const pct = (h - startHour) / totalHours * 100;
            const label = h.toString().padStart(2, '0') + ':00';
            html += `<div class="time-tick" style="left: ${pct}%;">${label}</div>`;
        }
        // Note: The final tick (e.g., 20:00) is often omitted as the lines represent the start of the hour block.

        headerElement.innerHTML = html;
    };

    // Made public as it's used by TradeCenter preview as well
    ScheduleViewer.renderSegments = (segments) => {
        if (!segments || segments.length === 0) {
            // Show "RD" label instead of blank space
            return '<div class="timeline-rdo-fill">RD</div>';
        }
        
        return segments.map(seg => {
            const component = APP.StateManager.getComponentById(seg.component_id);
            if (!component) return '';

            // Calculate position and width percentage
            const startPct = ((seg.start_min - Config.TIMELINE_START_MIN) / Config.TIMELINE_DURATION_MIN) * 100;
            const widthPct = ((seg.end_min - seg.start_min) / Config.TIMELINE_DURATION_MIN) * 100;
            
            // FIXED: Use strict component color and calculate contrast for text
            const textColor = APP.Utils.getContrastingTextColor(component.color);

            // The 'title' attribute provides the native browser tooltip on hover.
            return `
            <div class="timeline-bar" style="left: ${startPct}%; width: ${widthPct}%; background-color: ${component.color}; color: ${textColor};" title="${component.name} (${APP.Utils.formatMinutesToTime(seg.start_min)} - ${APP.Utils.formatMinutesToTime(seg.end_min)})">
                <span style="padding-left: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${component.name}</span>
            </div>
            `;
        }).join('');
    };
    // Alias for internal use
    const renderSegments = ScheduleViewer.renderSegments;

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
                    // Use the centralized ScheduleCalculator
                    const { segments, source } = APP.ScheduleCalculator.calculateSegments(adv.id, day);
                    
                    // Determine class and get the specific date for this cell
                    const cellClass = (source === 'exception') ? 'is-exception' : '';
                    const dateISO = APP.Utils.getISODateForDayName(STATE.weekStart, day);

                    // Add 'weekly-cell' class and data attributes for click handling
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

    // Updated to handle source for exception visualization
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
            // If it's an exception, label it as 'Custom'.
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


    // --- INTRADAY INDICATORS (Daily View Only) ---
    
    const setupIntradayIndicators = (ELS_DAILY) => {
       // We have removed the red "current time" indicator lines
       
       // Setup mouse tracking for precision cursor
       
       // We attach mousemove to the main container, as it bubbles up
       if (ELS_DAILY.timelineContainer) {
           ELS_DAILY.timelineContainer.addEventListener('mousemove', (e) => updateMouseTimeIndicator(e, ELS_DAILY));
       }
       
       // We attach mouseenter/leave to the *children* (header and body)
       // because these events do not bubble. This fixes the bug.
       if (ELS_DAILY.timeHeader) {
           ELS_DAILY.timeHeader.addEventListener('mouseenter', () => showMouseIndicator(ELS_DAILY));
           ELS_DAILY.timeHeader.addEventListener('mouseleave', () => hideMouseIndicator(ELS_DAILY));
       }
       if (ELS_DAILY.plannerBody) {
            ELS_DAILY.plannerBody.addEventListener('mouseenter', () => showMouseIndicator(ELS_DAILY));
            ELS_DAILY.plannerBody.addEventListener('mouseleave', () => hideMouseIndicator(ELS_DAILY));
       }
   };
   
   const updateCurrentTimeIndicator = (ELS_DAILY) => {
    if (!ELS_DAILY || !ELS_DAILY.currentTimeIndicator || !ELS_DAILY.timelineContainer) return;

    // Get the current time *in the UK (London)*
    const now = new Date();
    let ukTimeStr;
    let ukDateStr;

    try {
        // Get the time in HH:MM format for London
        ukTimeStr = now.toLocaleTimeString('en-GB', { 
            timeZone: 'Europe/London', 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: false 
        });

        // Get the date in YYYY-MM-DD format for London
        ukDateStr = now.toLocaleDateString('en-CA', { 
            timeZone: 'Europe/London' 
        });

    } catch (e) {
        console.error("Timezone 'Europe/London' not supported, falling back to local time.");
        // Fallback for older browsers
        const fallbackMinutes = (now.getUTCHours() * 60 + now.getUTCMinutes()) - now.getTimezoneOffset();
        ukTimeStr = `${String(Math.floor(fallbackMinutes / 60)).padStart(2, '0')}:${String(fallbackMinutes % 60).padStart(2, '0')}`;
        ukDateStr = APP.Utils.formatDateToISO(now);
    }

    const [h, m] = ukTimeStr.split(':').map(Number);
    const currentMinutes = h * 60 + m;

    // --- The rest of the function is the same ---

    const STATE = APP.StateManager.getState();
    // Get the specific date ISO for the selected day in the view
    const viewDateISO = APP.Utils.getISODateForDayName(STATE.weekStart, STATE.selectedDay);

    const todayISO = ukDateStr; // 'en-CA' format is YYYY-MM-DD

    // Only show if the view is 'daily' AND the date being viewed is today's date
    if (STATE.scheduleViewMode !== 'daily' || viewDateISO !== todayISO) {
        ELS_DAILY.currentTimeIndicator.style.display = 'none';
        return;
    }

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

   // Updated mouse tracking to correctly account for horizontal scrolling
   const updateMouseTimeIndicator = (e, ELS_DAILY) => {
       if (!ELS_DAILY || !ELS_DAILY.mouseTimeIndicator || !ELS_DAILY.timelineContainer) return;

       // We need the container element of the visualization area for scroll position
       const vizContainer = document.getElementById('visualizationContainer');
       if (!vizContainer) return;

       const containerRect = ELS_DAILY.timelineContainer.getBoundingClientRect();
       // Calculate mouse position relative to the container, accounting for the visualization container's scrollLeft
       const mouseX = e.clientX - containerRect.left + vizContainer.scrollLeft;
       
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
 * MODULE: APP.Components.ShiftTradeCenter
 * Manages the interface and logic for swapping shifts between two advisors.
 */
(function(APP) {
    const ShiftTradeCenter = {};
    const ELS = {};

    // Local state for the trade center
    const TRADE_STATE = {
        advisor1: null,
        date1: null,
        schedule1: null,
        advisor2: null,
        date2: null,
        schedule2: null,
        reason: null,
    };

    ShiftTradeCenter.initialize = () => {
        ELS.advisor1 = document.getElementById('tradeAdvisor1');
        ELS.date1 = document.getElementById('tradeDate1');
        ELS.preview1 = document.getElementById('tradePreview1');
        ELS.advisor2 = document.getElementById('tradeAdvisor2');
        ELS.date2 = document.getElementById('tradeDate2');
        ELS.preview2 = document.getElementById('tradePreview2');
        ELS.btnExecuteTrade = document.getElementById('btnExecuteTrade');
        ELS.reasonInput = document.getElementById('tradeReason');

        // Event Listeners
        if (ELS.advisor1) ELS.advisor1.addEventListener('change', (e) => handleSelectionChange('1', 'advisor', e.target.value));
        if (ELS.advisor2) ELS.advisor2.addEventListener('change', (e) => handleSelectionChange('2', 'advisor', e.target.value));
        if (ELS.btnExecuteTrade) ELS.btnExecuteTrade.addEventListener('click', executeTrade);
        if (ELS.reasonInput) ELS.reasonInput.addEventListener('input', (e) => {
            TRADE_STATE.reason = e.target.value;
            validateTrade();
        });


        // Initialize Date Pickers (Flatpickr)
        if (typeof flatpickr !== 'undefined') {
            if (ELS.date1) {
                flatpickr(ELS.date1, {
                    dateFormat: 'Y-m-d',
                    altInput: true,
                    altFormat: 'D, d M Y', // Friendly display format
                    onChange: (selectedDates, dateStr) => handleSelectionChange('1', 'date', dateStr)
                });
            }
            if (ELS.date2) {
                 flatpickr(ELS.date2, {
                    dateFormat: 'Y-m-d',
                    altInput: true,
                    altFormat: 'D, d M Y',
                    onChange: (selectedDates, dateStr) => handleSelectionChange('2', 'date', dateStr)
                });
            }
        }
    };

    ShiftTradeCenter.render = () => {
        renderAdvisorDropdowns();
        // Previews are rendered dynamically on selection change
    };

    const renderAdvisorDropdowns = () => {
        // Check if elements exist (they might not if the tab content was manipulated)
        if (!ELS.advisor1 || !ELS.advisor2) return;

        // Check if already populated to prevent redundant rendering
        if (ELS.advisor1.options.length > 1) return;

        const STATE = APP.StateManager.getState();
        const advisors = STATE.advisors.sort((a,b) => a.name.localeCompare(b.name));
        
        let opts = '<option value="">-- Select Advisor --</option>';
        advisors.forEach(adv => {
            opts += `<option value="${adv.id}">${adv.name}</option>`;
        });

        ELS.advisor1.innerHTML = opts;
        ELS.advisor2.innerHTML = opts;
    };

    const handleSelectionChange = async (slot, type, value) => {
        TRADE_STATE[`${type}${slot}`] = value || null;
        
        const advisorId = TRADE_STATE[`advisor${slot}`];
        const dateISO = TRADE_STATE[`date${slot}`];

        if (advisorId && dateISO) {
            // Fetch and render the schedule preview
            TRADE_STATE[`schedule${slot}`] = await fetchScheduleForDate(advisorId, dateISO);
            renderPreview(slot);
        } else {
            // Clear the preview
            TRADE_STATE[`schedule${slot}`] = null;
            renderPreview(slot);
        }
        validateTrade();
    };

    // Helper to fetch the schedule for a specific advisor and date.
    const fetchScheduleForDate = async (advisorId, dateISO) => {
        try {
            // 1. Determine Day Name and Week Start
            const weekStartISO = APP.Utils.getMondayForDate(dateISO);

            // Check if date calculation was successful
            if (!weekStartISO) {
                console.error("Could not determine week start for date:", dateISO);
                return null;
            }

            const dayName = APP.Utils.getDayNameFromISO(dateISO);
            

            // 2. Ensure historical data is loaded for that specific week start
            // This leverages the StateManager's caching mechanism.
            await APP.StateManager.loadEffectiveAssignments(weekStartISO);

            // 3. Use the centralized calculation logic.
             const result = APP.ScheduleCalculator.calculateSegments(advisorId, dayName, weekStartISO);
             return result;

        } catch (e) {
            console.error("Error fetching schedule for trade preview:", e);
            return null;
        }
    };

    // Renders the preview panel for the specified slot
    const renderPreview = (slot) => {
        const previewEl = ELS[`preview${slot}`];
        const schedule = TRADE_STATE[`schedule${slot}`];

        if (!previewEl) return;

        if (!schedule) {
            previewEl.innerHTML = 'Select advisor and date to preview schedule.';
            return;
        }

        if (schedule.segments.length === 0) {
            previewEl.innerHTML = `<div class="trade-preview-details"><h4>Rest Day Off (RDO)</h4></div>`;
            return;
        }

        const startMin = schedule.segments[0].start_min;
        const endMin = schedule.segments[schedule.segments.length - 1].end_min;
        const timeString = `${APP.Utils.formatMinutesToTime(startMin)} - ${APP.Utils.formatMinutesToTime(endMin)}`;

        let html = `<div class="trade-preview-details">
            <h4>${timeString} (${schedule.source === 'exception' ? 'Exception' : 'Rotation'})</h4>
            <ul>`;
        
        schedule.segments.forEach(seg => {
            const component = APP.StateManager.getComponentById(seg.component_id);
            const duration = seg.end_min - seg.start_min;
            html += `<li>${APP.Utils.formatMinutesToTime(seg.start_min)}: ${component ? component.name : 'Unknown'} (${duration}m)</li>`;
        });

        html += `</ul></div>`;
        previewEl.innerHTML = html;
    };

    // Validates if the trade is possible and enables/disables the button
    const validateTrade = () => {
        const { advisor1, date1, schedule1, advisor2, date2, schedule2, reason } = TRADE_STATE;
        
        let isValid = true;

        // 1. All inputs must be selected and reason provided
        if (!advisor1 || !date1 || !advisor2 || !date2 || !reason || reason.trim() === '') {
            isValid = false;
        }

        // 2. Schedules must be successfully loaded
        else if (!schedule1 || !schedule2) {
             isValid = false;
        }

        // 3. Cannot trade with oneself on the same day
        else if (advisor1 === advisor2 && date1 === date2) {
             isValid = false;
        }
        
        if (ELS.btnExecuteTrade) {
            ELS.btnExecuteTrade.disabled = !isValid;
        }
        return isValid;
    };

    const executeTrade = async () => {
        if (!validateTrade()) return;

        const { advisor1, date1, schedule1, advisor2, date2, schedule2, reason } = TRADE_STATE;

        const adv1Name = APP.StateManager.getAdvisorById(advisor1)?.name || advisor1;
        const adv2Name = APP.StateManager.getAdvisorById(advisor2)?.name || advisor2;

        if (!confirm(`Confirm Trade:\n\n${adv1Name} on ${APP.Utils.convertISOToUKDate(date1)} will receive ${adv2Name}'s schedule from ${APP.Utils.convertISOToUKDate(date2)}.\n\n${adv2Name} on ${APP.Utils.convertISOToUKDate(date2)} will receive ${adv1Name}'s schedule from ${APP.Utils.convertISOToUKDate(date1)}.\n\nReason: ${reason}\n\nProceed?`)) {
            return;
        }

        // Create the two exceptions
        // Exception 1: Advisor 1 gets Schedule 2 on Date 1
        const exception1 = {
            advisor_id: advisor1,
            exception_date: date1,
            // Must use a deep copy of the segments (handle RDO by setting structure to empty array)
            structure: schedule2.segments.length > 0 ? JSON.parse(JSON.stringify(schedule2.segments)) : [], 
            reason: `${reason} (Trade with ${adv2Name} on ${APP.Utils.convertISOToUKDate(date2)})`
        };

        // Exception 2: Advisor 2 gets Schedule 1 on Date 2
        const exception2 = {
            advisor_id: advisor2,
            exception_date: date2,
            // Must use a deep copy of the segments
            structure: schedule1.segments.length > 0 ? JSON.parse(JSON.stringify(schedule1.segments)) : [],
            reason: `${reason} (Trade with ${adv1Name} on ${APP.Utils.convertISOToUKDate(date1)})`
        };

        // Save both exceptions (ideally in a transaction, but sequentially here)
        const res1 = await APP.DataService.saveRecord('schedule_exceptions', exception1, 'advisor_id, exception_date');
        const res2 = await APP.DataService.saveRecord('schedule_exceptions', exception2, 'advisor_id, exception_date');

        if (!res1.error && !res2.error) {
            APP.StateManager.syncRecord('schedule_exceptions', res1.data);
            APP.StateManager.syncRecord('schedule_exceptions', res2.data);
            APP.StateManager.saveHistory("Execute Shift Trade");
            APP.Utils.showToast("Shift trade executed successfully.", "success");
            
            // Clear the form and re-render previews
            clearTradeForm();
            
            // Re-render the main schedule view if it's currently active
            if (APP.Components.ScheduleViewer) {
                 APP.Components.ScheduleViewer.render();
            }
            
        } else {
            // Error toasts handled by DataService
            if (res1.error) console.error("Trade Error (Part 1):", res1.error);
            if (res2.error) console.error("Trade Error (Part 2):", res2.error);
        }
    };

    const clearTradeForm = () => {
        // Reset state
        Object.keys(TRADE_STATE).forEach(key => TRADE_STATE[key] = null);
        
        // Reset UI elements
        if (ELS.advisor1) ELS.advisor1.value = "";
        if (ELS.advisor2) ELS.advisor2.value = "";
        if (ELS.date1 && ELS.date1._flatpickr) ELS.date1._flatpickr.clear();
        if (ELS.date2 && ELS.date2._flatpickr) ELS.date2._flatpickr.clear();
        if (ELS.reasonInput) ELS.reasonInput.value = '';
        
        renderPreview('1');
        renderPreview('2');
        validateTrade();
    };


    APP.Components = APP.Components || {};
    APP.Components.ShiftTradeCenter = ShiftTradeCenter;
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
        // Updated version logging
        console.log("WFM Intelligence Platform (v15.8.3) Initializing...");
        
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
                document.body.innerHTML = "<h1>Fatal Error: Failed to load core data from database. Check connection and schema.</h1>";
            }
            return;
        }

        // Initialize State Manager
        APP.StateManager.initialize(initialData);

        // Initialize UI Components
        try {
            APP.Components.ComponentManager.initialize();
            APP.Components.AssignmentManager.initialize();
            // Initialize the shared builder first
            APP.Components.SequentialBuilder.initialize(); 
            APP.Components.ShiftDefinitionEditor.initialize();
            APP.Components.RotationEditor.initialize();
            APP.Components.ScheduleViewer.initialize();
            // Initialize the Trade Center
            if (APP.Components.ShiftTradeCenter) {
                APP.Components.ShiftTradeCenter.initialize();
                APP.Components.AdvisorAdmin.initialize();
                
                APP.Components.Dashboard.initialize();
            }
        } catch (error) {
            console.error("CRITICAL ERROR during UI Component Initialization:", error);
            APP.Utils.showToast("Fatal Error during UI initialization. Check console logs.", "danger", 10000);
            return; 
        }

        // Render all components
        // This triggers the initial render chain, including the first historical data fetch.
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

    // This is the NEW code to paste
const wireGlobalEvents = () => {
    // Week Navigation
    if (ELS.weekStart) {
        if (typeof flatpickr !== 'function') {
            console.error("CRITICAL ERROR: flatpickr library not loaded (Global Events)."); //
        } else {
            // Configure Week Picker (Flatpickr)
            flatpickr(ELS.weekStart, {
                dateFormat: "Y-m-d", // ISO format for consistency
                defaultDate: APP.StateManager.getState().weekStart,
          
                "locale": { "firstDayOfWeek": 1 }, // Monday start
                onChange: (selectedDates, dateStr) => {
                    // Update state and re-render visualization on date change
                    APP.StateManager.getState().weekStart = dateStr;
 
                    // ScheduleViewer.render() coordinates the historical data fetch and subsequent renders.
                    APP.Components.ScheduleViewer.render(); //
                }
            });
        }
    }
    if (ELS.prevWeek) ELS.prevWeek.addEventListener('click', () => updateWeek(-7)); //
    if (ELS.nextWeek) ELS.nextWeek.addEventListener('click', () => updateWeek(7)); //

    // Undo/Redo
    if (ELS.btnUndo) ELS.btnUndo.addEventListener('click', () => APP.StateManager.applyHistory('undo')); //
    if (ELS.btnRedo) ELS.btnRedo.addEventListener('click', () => APP.StateManager.applyHistory('redo')); //

    // Tab Navigation
    if (ELS.tabNav) ELS.tabNav.addEventListener('click', handleTabNavigation); //

    // --- BEGIN CACHE-BYPASS FIX (v2) ---
    // Forcefully injects the 'Shift Swop' button AND panel if 
    // a stale, cached index.html file is loaded without them.
    try {
        // 1. INJECT THE BUTTON (if missing)
        if (ELS.tabNav) {
            const tradeButtonExists = ELS.tabNav.querySelector('[data-tab="tab-trade-center"]');
            if (!tradeButtonExists) {
                console.warn("WFM: 'Shift Swop' button not found. Injecting manually...");
                
                const buttonHTML = `
                <button class="tab-link" data-tab="tab-trade-center" title="Shift Swop">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 17l5-5-5-5M19.8 12H9M8 7l-5 5 5 5"/></svg>
                    <span>Shift Swop</span>
                </button>
                `;

                let planningSeparator = null;
                ELS.tabNav.querySelectorAll('.nav-separator').forEach(sep => {
                    if (sep.textContent.trim().toUpperCase() === 'PLANNING') {
                        planningSeparator = sep;
                    }
                });

                if (planningSeparator) {
                    planningSeparator.insertAdjacentHTML('afterend', buttonHTML);
                    console.log("WFM: Successfully injected 'Shift Swop' button.");
                }
            }
        }

        // 2. INJECT THE PANEL (if missing)
        const tradePanelExists = document.getElementById('tab-trade-center');
        if (!tradePanelExists) {
            console.warn("WFM: 'Shift Swop' panel not found. Injecting manually...");
            
            // This is the full HTML for the panel, copied from your correct index.html file
            const panelHTML = `
            <section id="tab-trade-center" class="tab-content">
              <div class="card">
                <h2>Shift Swop</h2>
                <p class="helper-text">Select two advisors and the corresponding dates to trade their schedules. This creates exceptions for the selected dates only.</p>
                <div class="trade-layout">
                  <div class="trade-panel">
                    <h3>Trade Slot 1</h3>
                    <div class="form-group">
                      <label for="tradeAdvisor1">Advisor 1</label>
                      <select id="tradeAdvisor1" class="form-select trade-advisor"></select>
                    </div>
                    <div class="form-group">
                      <label for="tradeDate1">Date 1</label>
                      <input type="text" id="tradeDate1" class="form-input trade-date-picker" placeholder="Select date...">
                    </div>
                    <div class="trade-preview" id="tradePreview1">Select advisor and date to preview schedule.</div>
                  </div>
                  <div class="trade-swap-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 17l5-5-5-5M19.8 12H9M8 7l-5 5 5 5"/></svg>
                  </div>
                  <div class="trade-panel">
                    <h3>Trade Slot 2</h3>
                    <div class="form-group">
                      <label for="tradeAdvisor2">Advisor 2</label>
                      <select id="tradeAdvisor2" class="form-select trade-advisor"></select>
                    </div>
                    <div class="form-group">
                      <label for="tradeDate2">Date 2</label>
                      <input type="text" id="tradeDate2" class="form-input trade-date-picker" placeholder="Select date...">
                    </div>
                    <div class="trade-preview" id="tradePreview2">Select advisor and date to preview schedule.</div>
                  </div>
                </div>
                <div class="trade-actions">
                  <div class="form-group" style="max-width: 500px; margin: 0 auto 16px auto;">
                    <label for="tradeReason">Reason for Trade (Required)</label>
                    <input type="text" id="tradeReason" class="form-input" placeholder="e.g., Mutual agreement, Operational need...">
                  </div>
                  <button id="btnExecuteTrade" class="btn btn-primary btn-lg" disabled>Execute Trade</button>
                </div>
              </div>
            </section>
            `;

            const mainContentArea = document.getElementById('main-content-area'); //
            
            if (mainContentArea) {
                mainContentArea.insertAdjacentHTML('beforeend', panelHTML);
                console.log("WFM: Successfully injected 'Shift Swop' panel.");
                
                // 3. CRITICAL: Re-run the initialize for that specific component
                // This wires up all the new buttons and dropdowns inside the panel.
                if (APP.Components.ShiftTradeCenter) {
                    APP.Components.ShiftTradeCenter.initialize(); //
                    console.log("WFM: Re-initialized ShiftTradeCenter component.");
                }
                
                // 4. CRITICAL: Re-cache the ELS.tabs NodeList so the tab switcher works
                ELS.tabs = document.querySelectorAll('.tab-content'); //
            } else {
                console.error("WFM: Could not find 'main-content-area' to inject panel.");
            }
        }
    } catch (e) {
        console.error("WFM: Error during cache-bypass fix:", e);
    }
    // --- END CACHE-BYPASS FIX ---

    // V15.8 FIX: Removed the unnecessary JS injection of the Shift Swop button here.
    // It is now correctly defined in index.html.
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
            if (tabId === 'tab-home') {
    // Render the dashboard
    if (APP.Components.Dashboard) {
        APP.Components.Dashboard.render();
    }
} else
            
            // Force re-render on tab switch to ensure visualization is updated correctly
            // This also handles fetching historical data if switching to ScheduleView or Assignments
            if (tabId === 'tab-schedule-view') {
                APP.Components.ScheduleViewer.render();
            } else if (tabId === 'tab-advisor-assignments') {
                // When switching to the Assignments tab, we must ensure the data is loaded and rendered.
                // ScheduleViewer.render() handles the coordination of fetching data and rendering the AssignmentManager if the tab is active.
                APP.Components.ScheduleViewer.render();
            } else if (tabId === 'tab-trade-center') {
                // Ensure Trade Center is rendered when activated
                if (APP.Components.ShiftTradeCenter) {
                    APP.Components.ShiftTradeCenter.render();
                }
            } else if (tabId === 'tab-advisor-admin') {
                // Ensure Advisor Admin is rendered when activated
                if (APP.Components.AdvisorAdmin) {
                    APP.Components.AdvisorAdmin.render();
                }
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
        // AssignmentManager.render() is implicitly called by ScheduleViewer.render() coordination
        APP.Components.ShiftDefinitionEditor.render();
        APP.Components.RotationEditor.render();
        
        // Render the Trade Center
        if (APP.Components.ShiftTradeCenter) {
         APP.Components.ShiftTradeCenter.render();
    }
    // Render the new Advisor Admin
if (APP.Components.AdvisorAdmin) {
     APP.Components.AdvisorAdmin.render();
}
// Render the dashboard
if (APP.Components.Dashboard) {
     APP.Components.Dashboard.render();
}

// ScheduleViewer.render() coordinates historical data fetch and rendering of both Viewer and Assignments tabs.
APP.Components.ScheduleViewer.render();
}; // <-- This brace closes Core.renderAll

APP.Core = Core;
}(window.APP));
/**
 * MODULE: APP.Components.AdvisorAdmin
 * Manages CRUD operations for Advisors.
 */
(function(APP) {
    const AdvisorAdmin = {};
    const ELS = {};

    AdvisorAdmin.initialize = () => {
        ELS.grid = document.getElementById('advisorAdminGrid');
        ELS.btnNew = document.getElementById('btnNewAdvisor');

        if (ELS.btnNew) ELS.btnNew.addEventListener('click', handleNew);
        if (ELS.grid) ELS.grid.addEventListener('click', handleGridClick);
    };

    AdvisorAdmin.render = () => {
        if (!ELS.grid) return;

        const STATE = APP.StateManager.getState();
        // Get all advisors and leaders
        const advisors = STATE.advisors.sort((a,b) => a.name.localeCompare(b.name));
        const leaders = STATE.leaders.sort((a,b) => a.name.localeCompare(b.name));

        // Create the HTML for the leader dropdown (for editing)
        const leaderOptions = leaders.map(leader => 
            `<option value="${leader.id}">${leader.name}</option>`
        ).join('');

        let html = `
            <table>
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Team Leader</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
        `;

        advisors.forEach(adv => {
            const leader = STATE.leaders.find(l => l.id === adv.leader_id);
            const leaderName = leader ? leader.name : 'N/A';

            html += `
                <tr data-advisor-id="${adv.id}">
                    <td><span class="display-value">${adv.name}</span></td>
                    <td><span class="display-value">${adv.email || ''}</span></td>
                    <td><span class="display-value">${leaderName}</span></td>

                    <td style="display:none;" class="edit-mode-cell">
                        <input type="text" class="form-input edit-name" value="${adv.name}">
                    </td>
                    <td style="display:none;" class="edit-mode-cell">
                        <input type="email" class="form-input edit-email" value="${adv.email || ''}">
                    </td>
                    <td style="display:none;" class="edit-mode-cell">
                        <select class="form-select edit-leader">
                            <option value="">-- No Leader --</option>
                            ${leaderOptions}
                        </select>
                    </td>

                    <td class="actions">
                        <button class="btn btn-sm btn-primary btn-edit-advisor">Edit</button>
                        <button class="btn btn-sm btn-danger btn-delete-advisor">Delete</button>

                        <button class="btn btn-sm btn-success btn-save-advisor" style="display:none;">Save</button>
                        <button class="btn btn-sm btn-secondary btn-cancel-advisor" style="display:none;">Cancel</button>
                    </td>
                </tr>
            `;
        });

        html += `</tbody></table>`;
        ELS.grid.innerHTML = html;

        // Now, set the correct selected leader for each row's edit mode
        advisors.forEach(adv => {
            const row = ELS.grid.querySelector(`tr[data-advisor-id="${adv.id}"]`);
            if (row) {
                const select = row.querySelector('.edit-leader');
                if (select) {
                    select.value = adv.leader_id || "";
                }
            }
        });
    };

    const handleGridClick = (e) => {
        const target = e.target;
        const row = target.closest('tr');
        if (!row) return;

        const advisorId = row.dataset.advisorId;
        if (!advisorId) return;

        if (target.classList.contains('btn-edit-advisor')) {
            toggleRowEdit(row, true);
        } else if (target.classList.contains('btn-cancel-advisor')) {
            toggleRowEdit(row, false);
        } else if (target.classList.contains('btn-delete-advisor')) {
            handleDelete(advisorId, row);
        } else if (target.classList.contains('btn-save-advisor')) {
            handleSave(advisorId, row);
        }
    };

    const toggleRowEdit = (row, isEditing) => {
        // Hide all display-value cells
        row.querySelectorAll('.display-value').forEach(el => el.parentElement.style.display = isEditing ? 'none' : '');
        // Show all edit-mode-cell cells
        row.querySelectorAll('.edit-mode-cell').forEach(el => el.style.display = isEditing ? 'table-cell' : 'none');

        // Toggle buttons
        row.querySelector('.btn-edit-advisor').style.display = isEditing ? 'none' : '';
        row.querySelector('.btn-delete-advisor').style.display = isEditing ? 'none' : '';
        row.querySelector('.btn-save-advisor').style.display = isEditing ? 'inline-block' : 'none';
        row.querySelector('.btn-cancel-advisor').style.display = isEditing ? 'inline-block' : 'none';
    };

    const handleNew = async () => {
        const name = prompt("Enter new advisor's full name:");
        if (!name) return;

        const email = prompt("Enter new advisor's email (optional):");

        const newAdvisor = {
            name: name,
            email: email || null,
            leader_id: null // They can assign this using the "Edit" button
        };

        const { data, error } = await APP.DataService.saveRecord('advisors', newAdvisor);

        if (error) {
            APP.Utils.showToast("Error creating advisor. Check console.", "danger");
            return;
        }

        // Add to state and re-render
        APP.StateManager.getState().advisors.push(data);
        AdvisorAdmin.render();
        APP.Utils.showToast("Advisor created successfully.", "success");

        // Also need to re-render the main schedule tree
        if (APP.Components.ScheduleViewer) APP.Components.ScheduleViewer.render();
    };

    const handleSave = async (advisorId, row) => {
        const name = row.querySelector('.edit-name').value;
        const email = row.querySelector('.edit-email').value;
        const leaderId = row.querySelector('.edit-leader').value;

        if (!name) {
            APP.Utils.showToast("Name cannot be empty.", "danger");
            return;
        }

        const updates = {
            name: name,
            email: email || null,
            leader_id: leaderId || null
        };

        // We get the original advisor data from state
        const originalAdvisor = APP.StateManager.getAdvisorById(advisorId);
        const originalData = { ...originalAdvisor }; // Make a copy

        // --- Optimistic UI Update ---
        // 1. Update the state object immediately
        const stateAdvisors = APP.StateManager.getState().advisors;
        const index = stateAdvisors.findIndex(a => a.id == advisorId);
        if (index > -1) {
            Object.assign(stateAdvisors[index], updates);
        }
        // 2. Re-render this tab and the tree
        AdvisorAdmin.render();
        if (APP.Components.ScheduleViewer) APP.Components.ScheduleViewer.render();
        // ---------------------------

        const { data, error } = await APP.DataService.updateRecord('advisors', updates, { id: advisorId });

        if (error) {
            APP.Utils.showToast("Error saving advisor. Reverting change.", "danger");
            // --- Rollback on Error ---
            if (index > -1) {
                Object.assign(stateAdvisors[index], originalData); // Restore original data
            }
            AdvisorAdmin.render();
            if (APP.Components.ScheduleViewer) APP.Components.ScheduleViewer.render();
            return;
        }

        // Success! No need to re-render, it's already done.
        APP.Utils.showToast("Advisor updated.", "success");
    };

    const handleDelete = async (advisorId, row) => {
        const advisor = APP.StateManager.getAdvisorById(advisorId);
        if (!advisor) return;

        if (!confirm(`Are you sure you want to delete ${advisor.name}?\n\nThis will also delete all their assignments and exceptions. This action cannot be undone.`)) {
            return;
        }

        // Note: We assume cascade deletes are set up on the database
        // for assignments, exceptions, etc.
        const { error } = await APP.DataService.deleteRecord('advisors', { id: advisorId });

        if (error) {
            APP.Utils.showToast(`Error: ${error.message}. Advisor might be linked to other data.`, "danger");
            return;
        }

        // Remove from state
        const stateAdvisors = APP.StateManager.getState().advisors;
        const index = stateAdvisors.findIndex(a => a.id == advisorId);
        if (index > -1) {
            stateAdvisors.splice(index, 1);
        }

        AdvisorAdmin.render();
        APP.Utils.showToast("Advisor deleted.", "success");

        // Also need to re-render the main schedule tree
        if (APP.Components.ScheduleViewer) APP.Components.ScheduleViewer.render();
    };

    APP.Components = APP.Components || {};
    APP.Components.AdvisorAdmin = AdvisorAdmin;
}(window.APP));

/**
 * MODULE: APP.Components.Dashboard
 * Manages the new "App Icon" home dashboard.
 */
(function(APP) {
    const Dashboard = {};
    const ELS = {}; // Cache for our widget elements
const ACKNOWLEDGED_ALERTS = new Set(); // This will store IDs of "read" exceptions

    Dashboard.initialize = () => {
        // Cache the "App" buttons
        ELS.btnStats = document.getElementById('btn-dash-stats');
        ELS.btnAlerts = document.getElementById('btn-dash-alerts');
        ELS.btnUnassigned = document.getElementById('btn-dash-unassigned');

        // Cache the "Badges"
        ELS.badgeStats = document.getElementById('badge-dash-stats');
        ELS.badgeAlerts = document.getElementById('badge-dash-alerts');
        ELS.badgeUnassigned = document.getElementById('badge-dash-unassigned');

        // Cache the new modal elements
        ELS.modal = document.getElementById('dashboardModal');
        ELS.modalTitle = document.getElementById('dashboardModalTitle');
        ELS.modalBody = document.getElementById('dashboardModalBody');
        ELS.modalClose = document.getElementById('dashboardModalClose');

        // Wire up click listeners
        if (ELS.btnStats) ELS.btnStats.addEventListener('click', handleStatsClick);
        if (ELS.btnAlerts) ELS.btnAlerts.addEventListener('click', handleAlertsClick);
        if (ELS.btnUnassigned) ELS.btnUnassigned.addEventListener('click', handleUnassignedClick);
        if (ELS.modalClose) ELS.modalClose.addEventListener('click', closeModal);
        if (ELS.modalBody) ELS.modalBody.addEventListener('click', handleAcknowledgeClick);
    };

    // The main render function for the dashboard
    Dashboard.render = async () => {
        if (!ELS.btnStats) return; // Haven't been initialized yet

        const STATE = APP.StateManager.getState();
        if (!STATE.isBooted) return; // Data isn't ready

        const weekStart = STATE.weekStart;
        if (!weekStart) {
            // We can't show stats without a week
            return;
        }

        // We must ensure the assignments for this week are loaded
        await APP.StateManager.loadEffectiveAssignments(weekStart);

        // Now we have the data, let's get it
        const effectiveMap = STATE.effectiveAssignmentsCache.get(weekStart);
        const allAdvisors = STATE.advisors;
        const allExceptions = STATE.scheduleExceptions;

        // Run the logic for each widget
        renderDailyStats(allExceptions, weekStart);
        renderRotationAlerts(effectiveMap, allAdvisors, weekStart);
        renderUnassigned(effectiveMap, allAdvisors);
    };

    // --- Widget-Specific Logic ---

    // 1. Daily Stats Widget
const renderDailyStats = (allExceptions, weekStart) => {
    const weekEnd = APP.Utils.addDaysISO(weekStart, 6);
    const exceptionsThisWeek = allExceptions.filter(ex => {
        // Find exceptions this week that are NOT in our "read" list
        return ex.exception_date >= weekStart && ex.exception_date <= weekEnd && !ACKNOWLEDGED_ALERTS.has(ex.id);
    });
    const count = exceptionsThisWeek.length;

    ELS.badgeStats.textContent = count;
    ELS.badgeStats.style.display = count > 0 ? 'flex' : 'none';
};

    // 2. Rotation Alerts Widget
    const renderRotationAlerts = (effectiveMap, allAdvisors, weekStart) => {
        const weekEnd = APP.Utils.addDaysISO(weekStart, 6);
        const alerts = [];

        effectiveMap.forEach((assignment, advisorId) => {
            if (assignment.end_date && assignment.end_date >= weekStart && assignment.end_date <= weekEnd) {
                const advisor = allAdvisors.find(a => a.id == advisorId);
                if (advisor) {
                    alerts.push({
                        name: advisor.name,
                        endDate: APP.Utils.convertISOToUKDate(assignment.end_date)
                    });
                }
            }
        });

        const count = alerts.length;
        ELS.badgeAlerts.textContent = count;
        ELS.badgeAlerts.style.display = count > 0 ? 'flex' : 'none';
    };

    // 3. Unassigned Advisors Widget
    const renderUnassigned = (effectiveMap, allAdvisors) => {
        const unassigned = allAdvisors.filter(adv => !effectiveMap.has(adv.id));
        const count = unassigned.length;

        ELS.badgeUnassigned.textContent = count;
        ELS.badgeUnassigned.style.display = count > 0 ? 'flex' : 'none';
    };

    // --- Click Handlers ---

    const handleStatsClick = () => {
    const weekStart = APP.StateManager.getState().weekStart;
    const weekEnd = APP.Utils.addDaysISO(weekStart, 6);
    // Get ALL exceptions for the week (including acknowledged ones)
    const exceptionsThisWeek = APP.StateManager.getState().scheduleExceptions.filter(ex => {
        return ex.exception_date >= weekStart && ex.exception_date <= weekEnd;
    });

    let html = '<p style="padding: 24px;">No live exceptions found for this week.</p>';
    if (exceptionsThisWeek.length > 0) {
        html = '<ul class="dashboard-detail-list">';
        exceptionsThisWeek.forEach(ex => {
            const advisor = APP.StateManager.getAdvisorById(ex.advisor_id);
            const isAcknowledged = ACKNOWLEDGED_ALERTS.has(ex.id);

            html += `
                <li class="${isAcknowledged ? 'is-acknowledged' : ''}">
                    <div class="list-item-content">
                        <strong>${advisor ? advisor.name : 'Unknown'}</strong> has an exception on ${APP.Utils.convertISOToUKDate(ex.exception_date)} (${ex.reason || 'No reason'})
                    </div>
                    <div class="list-item-action">
                        <button class="btn btn-sm btn-secondary btn-acknowledge" data-exception-id="${ex.id}" ${isAcknowledged ? 'disabled' : ''}>
                            ${isAcknowledged ? '✓ Cleared' : 'Clear'}
                        </button>
                    </div>
                </li>`;
        });
        html += '</ul>';
    }
    openModal("Daily Stats", html);
};

    const handleAlertsClick = () => {
        const weekStart = APP.StateManager.getState().weekStart;
        const weekEnd = APP.Utils.addDaysISO(weekStart, 6);
        const effectiveMap = APP.StateManager.getState().effectiveAssignmentsCache.get(weekStart);
        const allAdvisors = APP.StateManager.getState().advisors;
        const alerts = [];

        effectiveMap.forEach((assignment, advisorId) => {
            if (assignment.end_date && assignment.end_date >= weekStart && assignment.end_date <= weekEnd) {
                const advisor = allAdvisors.find(a => a.id == advisorId);
                if (advisor) alerts.push({ name: advisor.name, endDate: APP.Utils.convertISOToUKDate(assignment.end_date) });
            }
        });

        let html = '<p style="padding: 24px;">No rotations are ending this week.</p>';
        if (alerts.length > 0) {
            html = '<ul class="dashboard-detail-list">';
            alerts.forEach(alert => {
                html += `<li><strong>${alert.name}</strong>'s current assignment ends on ${alert.endDate}.</li>`;
            });
            html += '</ul>';
        }
        openModal("Rotation Alerts", html);
    };

    const handleUnassignedClick = () => {
        const weekStart = APP.StateManager.getState().weekStart;
        const effectiveMap = APP.StateManager.getState().effectiveAssignmentsCache.get(weekStart);
        const allAdvisors = APP.StateManager.getState().advisors;
        const unassigned = allAdvisors.filter(adv => !effectiveMap.has(adv.id));

        let html = '<p style="padding: 24px;">All advisors have an assignment for this week.</p>';
        if (unassigned.length > 0) {
            html = '<ul class="dashboard-detail-list">';
            unassigned.forEach(adv => {
                html += `<li><strong>${adv.name}</strong> has no rotation assigned for this week.</li>`;
            });
            html += '</ul>';
        }
        openModal("Unassigned Advisors", html);
    };
const handleAcknowledgeClick = (e) => {
    const target = e.target.closest('.btn-acknowledge');
    if (target && !target.disabled) {
        const exceptionId = target.dataset.exceptionId;
        if (exceptionId) {
            // 1. Add to our "read" list
            ACKNOWLEDGED_ALERTS.add(exceptionId);

            // 2. Disable the button
            target.disabled = true;
            target.textContent = '✓ Cleared';

            // 3. Mark the row
            target.closest('li').classList.add('is-acknowledged');

            // 4. Re-render the dashboard to update the badge count
            Dashboard.render();
        }
    }
};
    // --- Modal Functions ---
    const openModal = (title, content) => {
        ELS.modalTitle.textContent = title;
        ELS.modalBody.innerHTML = content;
        ELS.modal.style.display = 'flex';
    };

    const closeModal = () => {
        ELS.modal.style.display = 'none';
    };

    // Expose the component
    APP.Components = APP.Components || {};
    APP.Components.Dashboard = Dashboard;
}(window.APP));
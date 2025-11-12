/**
 * WFM Intelligence Platform - Application Logic (v15.8.1)
 * 
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
        
        // Map various types to standard classes
        let toastClass = 'is-success';
        if (type === 'danger' || type === 'error' || type === 'warning') {
            toastClass = 'is-danger';
        }
        
        const toast = document.createElement('div');
        toast.className = `toast ${toastClass}`;
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
        // Use local time calculation for visualization consistency
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
        // Calculate difference to Monday (1 for Monday, 0 for Sunday)
        const diff = date.getDate() - day + (day === 0 ? -6 : 1); 
        const monday = new Date(date.setDate(diff));
        return Utils.formatDateToISO(monday);
    };

     // Helper to get the Day Name from an ISO Date
    Utils.getDayNameFromISO = (isoDateStr) => {
        if (!isoDateStr) return null;
        try {
            const [y, m, d] = isoDateStr.split('-').map(Number);
            // Use UTC to ensure consistent day name regardless of client timezone
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
            // Robust method to find the max week number defined in the pattern (supports "Week1" and "Week 1")
            const weekNumbers = keys.map(k => {
                const match = k.match(/^Week ?(\d+)$/i);
                return match ? parseInt(match[1], 10) : 0;
            });
            const maxWeek = Math.max(0, ...weekNumbers);

            if (maxWeek > 0) {
                numWeeks = maxWeek;
            }
        }
        return numWeeks;
    };


    // Updated for FINITE (Non-Repeating) Rotations
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
            
            // Use the helper function for consistency
            let numWeeksInRotation = Utils.calculateRotationLength(pattern);
            
            if (numWeeksInRotation === 0) {
                // Fallback if pattern is empty or invalid
                return null;
            }
                
            // Check if the elapsed weeks exceed the rotation length.
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

// Robust ISO date arithmetic using UTC
Utils.addDaysISO = (iso, days) => {
  if (!iso) return null;
  // Use UTC midnight to prevent timezone issues when calculating date differences
  const d = new Date(iso + 'T00:00:00Z');
  if (isNaN(d.getTime())) {
      console.error("Invalid ISO date provided to addDaysISO:", iso);
      return null;
  }
  d.setUTCDate(d.getUTCDate() + days);
  // Return the YYYY-MM-DD part of the ISO string (toISOString slice works correctly because we are in UTC)
  return d.toISOString().slice(0,10);
};

    APP.Utils = Utils;
}(window.APP));


/**
 * MODULE: APP.DataService
 * Handles all interactions with the Supabase backend.
 * V15.8: Added specific helper functions for managing rotation_assignments_history.
 */
(function(APP) {
    const DataService = {};
    let supabase = null;
    
    // Define the table name for historical assignments (centralized)
    const HISTORY_TABLE = 'rotation_assignments_history';
    const SNAPSHOT_TABLE = 'rotation_assignments';

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
        const errorMessage = error && error.message ? error.message : 'Unknown database error';
        
        // Suppress specific known warning if the history table doesn't exist yet (PGRST116 or 42P01).
        if (error && (error.code === 'PGRST116' || error.code === '42P01') && context.includes(HISTORY_TABLE)) {
             console.warn(`Note: ${HISTORY_TABLE} table not found. Time-based assignments may not function correctly until schema is updated.`);
        } else {
            APP.Utils.showToast(`Database Error: ${errorMessage}`, "danger");
        }
        return { data: null, error: errorMessage };
    };

    // Generic table fetch (Private)
    const fetchTable = async (tableName) => {
        const { data, error } = await supabase.from(tableName).select('*');
        if (error) return handleError(error, `Fetch ${tableName}`);
        return { data, error: null };
    };

    // Generalized save/upsert function
    DataService.saveRecord = async (tableName, record, conflictColumn = null) => {
        let query = supabase.from(tableName);
        if (conflictColumn) {
            // Use upsert for saving exceptions or assignments based on unique constraints
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
        let query = supabase.from(tableName).update(updates);

        // Apply conditions using explicit filters (.eq/.is)
        if (condition) {
            Object.keys(condition).forEach(key => {
                const value = condition[key];
                if (value === null) {
                    // Explicitly use .is() for NULL checks
                    query = query.is(key, null);
                } else {
                    // Use .eq() for standard equality checks
                    query = query.eq(key, value);
                }
            });
        }

         const { data, error } = await query.select();
        if (error) return handleError(error, `Update ${tableName}`);
        // Return the first updated record if available
        return { data: data ? data[0] : null, error: null };
    };

    // Generalized delete function
    DataService.deleteRecord = async (tableName, condition) => {
        const { error } = await supabase.from(tableName).delete().match(condition);
        if (error) return handleError(error, `Delete ${tableName}`);
        return { data: null, error: null };
    };

    // V15.8 FIX: Reads effective rotation rows for a given date (YYYY-MM-DD).
    // Includes prioritization logic and fallback if history table is missing.
    DataService.fetchEffectiveAssignmentsForDate = async (isoDate) => {
      try {
        // 1) Pull only rows that *cover* this date from history:
        //    start_date <= isoDate AND (end_date IS NULL OR end_date >= isoDate)
        const { data, error } = await supabase
          .from(HISTORY_TABLE)
          .select('advisor_id, rotation_name, start_date, end_date, reason')
          .lte('start_date', isoDate)
          .or(`end_date.is.null,end_date.gte.${isoDate}`);

        // Handle specific error if the history table is missing (PostgREST error code PGRST116 or 42P01)
        if (error && (error.code === '42P01' || error.code === 'PGRST116')) {
            console.warn(`${HISTORY_TABLE} not found. Falling back to ${SNAPSHOT_TABLE} snapshot.`);
            return await fetchSnapshotAssignments();
        }

        if (error) return handleError(error, 'Fetch effective assignments for date');

        // 2) For each advisor, pick the row with the *latest* start_date (closest to isoDate).
        //    If there are ties, prefer a bounded swap (has end_date) over an open-ended row.
        const byAdvisor = new Map();
        (data || []).forEach(row => {
          const existing = byAdvisor.get(row.advisor_id);
          if (!existing) {
            byAdvisor.set(row.advisor_id, row);
            return;
          }
          // choose the row with the later start_date
          if (row.start_date > existing.start_date) {
            byAdvisor.set(row.advisor_id, row);
          } else if (row.start_date === existing.start_date) {
            // tie-breaker: prefer bounded swap (end_date not null)
            const existingIsBounded = !!existing.end_date;
            const rowIsBounded = !!row.end_date;
            if (rowIsBounded && !existingIsBounded) {
              byAdvisor.set(row.advisor_id, row);
            }
          }
        });

        return { data: byAdvisor, error: null };
      } catch (err) {
        return handleError(err, 'Fetch effective assignments for date (Catch)');
      }
    };

    // Fallback function if history table is missing. (Private)
    const fetchSnapshotAssignments = async () => {
        const { data, error } = await fetchTable(SNAPSHOT_TABLE);
        if (error) return { data: new Map(), error: error.error };
        
        const byAdvisor = new Map();
        (data || []).forEach(row => {
            // Adapt the snapshot structure to the expected history structure
            byAdvisor.set(row.advisor_id, {
                advisor_id: row.advisor_id,
                rotation_name: row.rotation_name,
                start_date: row.start_date,
                end_date: null,
                reason: 'Snapshot Fallback'
            });
        });
        return { data: byAdvisor, error: null };
    };


    // Load all necessary data tables
    DataService.loadCoreData = async () => {
        try {
            // Fetch tables in parallel for efficiency
            const [advisors, leaders, components, definitions, patterns, assignments, exceptions] = await Promise.all([
                fetchTable('advisors'),
                supabase.from('leaders').select('*, sites(name)'),
                fetchTable('schedule_components'),
                fetchTable('shift_definitions'),
                fetchTable('rotation_patterns'),
                fetchTable(SNAPSHOT_TABLE), 
                fetchTable('schedule_exceptions')
            ]);

            // Check if any critical data failed to load
            if (advisors.error || leaders.error || components.error || definitions.error || patterns.error) {
                throw new Error("Failed to load one or more core data tables (Advisors, Leaders, Components, Definitions, or Patterns).");
            }

            // Handle assignments/exceptions table load failure gracefully
            if (assignments.error) {
                 console.warn("Warning: Failed to load rotation_assignments snapshot.", assignments.error);
                 assignments.data = [];
            }
            if (exceptions.error) {
                 console.warn("Warning: Failed to load schedule_exceptions.", exceptions.error);
                 exceptions.data = [];
            }

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

    // --- V15.8 FIX: Implementation of missing History Management Functions (Bug 2) ---
    // These functions manage the rotation_assignments_history table.

    // V15.8: Helper function to update the 'rotation_assignments' snapshot table. (Private)
    // This keeps the snapshot table in sync with the latest effective assignment from history.
    const updateSnapshotAssignment = async (advisorId) => {
        // Find the latest effective assignment (start_date DESC, end_date IS NULL prioritized)
        const { data, error } = await supabase
            .from(HISTORY_TABLE)
            .select('rotation_name, start_date')
            .eq('advisor_id', advisorId)
            .order('start_date', { ascending: false })
            .order('end_date', { ascending: false, nullsFirst: true }); // Prefer NULL end_date (ongoing)

        // Handle missing table gracefully during snapshot update
        if (error && (error.code === 'PGRST116' || error.code === '42P01')) {
            return;
        }

        if (error) {
            console.error("Failed to update snapshot assignment for advisor:", advisorId, error);
            return;
        }

        if (data && data.length > 0) {
            const latest = data[0];
            await supabase
                .from(SNAPSHOT_TABLE)
                .upsert({
                    advisor_id: advisorId,
                    rotation_name: latest.rotation_name,
                    start_date: latest.start_date
                }, { onConflict: 'advisor_id' });
        } else {
            // If no history exists, remove from snapshot
            await supabase
                .from(SNAPSHOT_TABLE)
                .delete()
                .eq('advisor_id', advisorId);
        }
    };


    // V15.8 FIX: Implements "Assign from this week" and "Change from this week forward"
    // These actions are logically similar: they set a new rotation starting on a date and going forward indefinitely.
    DataService.assignFromWeek = async ({ advisor_id, rotation_name, start_date, reason = 'New Assignment/Change Forward' }) => {
        try {
            const dateMinusOne = APP.Utils.addDaysISO(start_date, -1);

            // 1. Truncate existing open-ended assignments that started before this date.
            // Update where end_date IS NULL AND start_date < start_date.
            const { error: updateError } = await supabase
                .from(HISTORY_TABLE)
                .update({ end_date: dateMinusOne })
                .eq('advisor_id', advisor_id)
                .is('end_date', null)
                .lt('start_date', start_date);

            // Handle missing table gracefully
            if (updateError && !(updateError.code === 'PGRST116' || updateError.code === '42P01')) {
                 throw new Error("Failed to clip previous assignments.");
            }
                
            // 2. Insert/Overwrite the new ongoing assignment into history
            const newRecord = {
                advisor_id: advisor_id,
                rotation_name: rotation_name || null, // Allow null for unassignment
                start_date: start_date,
                end_date: null,
                reason: reason
            };
            // Use upsert on (advisor_id, start_date) to handle overwriting existing records starting on the same day.
            const { data: historyData, error: insertError } = await DataService.saveRecord(HISTORY_TABLE, newRecord, 'advisor_id, start_date');
            
            // Handle missing table gracefully during insert
            // V15.8.1 FIX: insertError is the error string itself, not an object with an .error property.
            if (insertError && (insertError.includes('PGRST116') || insertError.includes('42P01'))) {
                 console.warn("History table missing during insert. Proceeding with snapshot only.");
            } else if (insertError) {
                throw new Error("Failed to insert new assignment history.");
            }

            // 3. Update the snapshot table
            await updateSnapshotAssignment(advisor_id);

            // Return the history record data as the primary result
            return { data: historyData, error: null };

        } catch (err) {
            return handleError(err, "assignFromWeek/changeForward");
        }
    };

    // V15.8 FIX: Implements "Change only this week (Swap)"
    // This is complex as it requires potentially splitting an existing record.
    DataService.changeOnlyWeek = async ({ advisor_id, rotation_name, week_start, week_end }) => {
        try {
            if (!rotation_name) {
                throw new Error("Rotation name is required for a one-week swap.");
            }

            // 1. Insert the one-week swap assignment.
            const swapRecord = {
                advisor_id: advisor_id,
                rotation_name: rotation_name,
                start_date: week_start,
                end_date: week_end,
                reason: 'One Week Swap'
            };
            // Use upsert to handle overwriting existing records starting exactly on week_start
            const { data, error: insertError } = await DataService.saveRecord(HISTORY_TABLE, swapRecord, 'advisor_id, start_date');
            
            // V15.8.1 FIX: insertError is the error string itself, not an object with an .error property.
            if (insertError && (insertError.includes('PGRST116') || insertError.includes('42P01'))) {
                APP.Utils.showToast("Cannot perform one-week swap as history table is missing.", "danger");
                return { data: null, error: "History table missing." };
            } else if (insertError) {
                 throw new Error("Failed to insert swap record.");
            }

            // 2. Update the snapshot table
            await updateSnapshotAssignment(advisor_id);

            return { data, error: null };

        } catch (err) {
             return handleError(err, "Change Only Week");
        }
    };

    // V15.8.1 FIX: Helper to fetch the current snapshot record for a specific advisor. (Public)
    DataService.fetchSnapshotForAdvisor = async (advisorId) => {
        // Ensure supabase client is initialized
        if (!supabase) return { data: null, error: "Database not initialized." };

        // Efficiently fetch only the required record using maybeSingle()
        const { data, error } = await supabase.from(SNAPSHOT_TABLE).select('*').eq('advisor_id', advisorId).maybeSingle();
        
        // Handle missing table gracefully during fetch (PGRST116 or 42P01)
        if (error && (error.code === 'PGRST116' || error.code === '42P01')) {
             // If the snapshot table is missing, it's not a critical error, just return null data.
             return { data: null, error: null };
        }
        
        if (error) return handleError(error, `Fetch Snapshot ${advisorId}`);
        
        // Returns data (which might be null if the record doesn't exist) and null error
        return { data, error: null };
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
        rotationAssignments: [], // Current snapshot
        scheduleExceptions: [],
        selectedAdvisors: new Set(),
        weekStart: null, // Stored internally as YYYY-MM-DD
        currentRotation: null,
        selectedDay: 'Monday',
        scheduleViewMode: 'daily',
        isBooted: false,
        history: [],
        historyIndex: -1,
        // Cache for historical assignments lookups (Key: DateISO, Value: Map<AdvisorId, Assignment>)
        effectiveAssignmentsCache: new Map(), 
    };

    StateManager.getState = () => STATE;

    // Initialize state with data loaded from DataService
    StateManager.initialize = (initialData) => {
        Object.assign(STATE, initialData);
        STATE.isBooted = true;
        StateManager.saveHistory("Initial Load");
    };

    // Helpers (Selectors) - Efficient ways to query the state
    // NOTE: This selector gets the current snapshot from rotation_assignments.
    StateManager.getAssignmentForAdvisor = (id) => STATE.rotationAssignments.find(a => a.advisor_id === id) || null;
    StateManager.getPatternByName = (name) => STATE.rotationPatterns.find(p => p.name === name) || null;
    StateManager.getComponentById = (id) => STATE.scheduleComponents.find(c => c.id === id) || null;
    StateManager.getShiftDefinitionById = (id) => STATE.shiftDefinitions.find(d => d.id === id) || null;
    StateManager.getAdvisorById = (id) => STATE.advisors.find(a => a.id === id) || null;

    // Robust lookup for shift codes (handles whitespace and type differences)
    StateManager.getShiftDefinitionByCode = (code) => {
        if (!code) return null;
        const trimmedCode = String(code).trim();
        return STATE.shiftDefinitions.find(d => (d.code && String(d.code).trim()) === trimmedCode) || null;
    };

    StateManager.getAdvisorsByLeader = (leaderId) => STATE.advisors.filter(a => a.leader_id === leaderId);

    // Selector for Hybrid Adherence (Exceptions)
    StateManager.getExceptionForAdvisorDate = (advisorId, dateISO) => {
        return STATE.scheduleExceptions.find(e => e.advisor_id === advisorId && e.exception_date === dateISO) || null;
    };

    // Function to pre-load effective assignments for a specific date into the cache
    StateManager.loadEffectiveAssignments = async (dateISO) => {
        if (STATE.effectiveAssignmentsCache.has(dateISO)) {
            return; // Already loaded
        }
        // This calls DataService which handles the history query and prioritization.
        const { data, error } = await APP.DataService.fetchEffectiveAssignmentsForDate(dateISO);
        if (!error && data) {
            STATE.effectiveAssignmentsCache.set(dateISO, data);
        } else {
            // Handle error if needed, set an empty map to prevent re-fetching on failure
            STATE.effectiveAssignmentsCache.set(dateISO, new Map());
        }
    };

    // Clear cache when history changes or assignments are modified
    StateManager.clearEffectiveAssignmentsCache = () => {
        STATE.effectiveAssignmentsCache.clear();
    };

    // History Management (Updated to include exceptions)
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
            scheduleExceptions: JSON.parse(JSON.stringify(STATE.scheduleExceptions)),
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
        
        // Clear history cache when state changes
        StateManager.clearEffectiveAssignmentsCache();
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
        STATE.scheduleExceptions = JSON.parse(JSON.stringify(snapshot.scheduleExceptions));
        STATE.historyIndex = newIndex;

        // Clear history cache when state changes
        StateManager.clearEffectiveAssignmentsCache();

        // Re-render application and update UI
        if (APP.Core && APP.Core.renderAll && APP.Core.updateUndoRedoButtons) {
            APP.Core.renderAll();
            APP.Core.updateUndoRedoButtons(STATE.historyIndex, STATE.history.length);
        }
    };
    
    // State synchronization (Update local state after successful DB operations)
    StateManager.syncRecord = (tableName, record, isDeleted = false) => {
        
        // Map DB table names to State keys
        let stateKey = null;
        switch (tableName) {
            case 'schedule_exceptions': stateKey = 'scheduleExceptions'; break;
            case 'shift_definitions': stateKey = 'shiftDefinitions'; break;
            case 'rotation_patterns': stateKey = 'rotationPatterns'; break;
            case 'rotation_assignments': stateKey = 'rotationAssignments'; break;
            case 'schedule_components': stateKey = 'scheduleComponents'; break;
            // NOTE: rotation_assignments_history is not synced here, but managed via the cache.
            default: stateKey = tableName;
        }

        const collection = STATE[stateKey];
        
        // Handle cache clearing for history updates even if collection doesn't map directly.
        if (tableName === 'rotation_assignments_history' || tableName === 'rotation_patterns') {
            StateManager.clearEffectiveAssignmentsCache();
        }

        if (!collection) {
            return;
        }


        // Determine primary key (patterns by name, assignments by advisor_id, else id)
        let primaryKey = 'id';
        if (tableName === 'rotation_patterns') primaryKey = 'name';
        if (tableName === 'rotation_assignments') primaryKey = 'advisor_id';

        
        // Handle sync for exceptions
        // Since we rely on upsert for exceptions, the returned record always has the 'id'.
        if (tableName === 'schedule_exceptions') {
            primaryKey = 'id'; 
        }

        
        if (!record || !record.hasOwnProperty(primaryKey)) {
            // console.error("SyncRecord warning: Record missing or missing primary key", primaryKey, record);
            // Still proceed if cache clearing is needed (handled above)
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
        
         // If assignments snapshot changes, clear the cache.
         if (tableName === 'rotation_assignments') {
            StateManager.clearEffectiveAssignmentsCache();
        }
    };

    APP.StateManager = StateManager;
}(window.APP));


/**
 * MODULE: APP.ScheduleCalculator
 * Centralized service for calculating effective schedules based on Hybrid Adherence (Exceptions + History).
 */
(function(APP) {
    const ScheduleCalculator = {};

    // Helper: Finds the correct key in the pattern data (handles "Week 1", "Week1", "week1" etc.)
    const findWeekKey = (patternData, weekNumber) => {
        const keys = Object.keys(patternData);
        // Find the key that matches the week number using the robust regex
        return keys.find(k => {
            const match = k.match(/^Week ?(\d+)$/i);
            return match && parseInt(match[1], 10) === weekNumber;
        });
    };

    // Calculates the schedule for an advisor on a specific day.
    // Returns { segments, source, reason }
    ScheduleCalculator.calculateSegments = (advisorId, dayName, weekStartISO = null) => {
        const STATE = APP.StateManager.getState();
        // Use the provided context or the global state context
        const effectiveWeekStart = weekStartISO || STATE.weekStart;
        
        if (!effectiveWeekStart) return { segments: [], source: null, reason: null };

        // 1. Determine the specific date
        const dateISO = APP.Utils.getISODateForDayName(effectiveWeekStart, dayName);
        if (!dateISO) return { segments: [], source: null, reason: null };

        // 2. Check for an Exception (Priority 1)
        const exception = APP.StateManager.getExceptionForAdvisorDate(advisorId, dateISO);
        if (exception && exception.structure) {
            // If an exception exists, use its structure.
            // Handle RDO via exception (empty structure)
            if (exception.structure.length === 0) {
                return { segments: [], source: 'exception', reason: exception.reason };
            }
            // Ensure segments are sorted (critical for visualization and comparison)
            const sortedSegments = JSON.parse(JSON.stringify(exception.structure)).sort((a, b) => a.start_min - b.start_min);
            return { segments: sortedSegments, source: 'exception', reason: exception.reason };
        }

        // 3. Calculate based on Rotation (Priority 2)
        
        // Use the EFFECTIVE assignment from the cache for this specific week.
        const effectiveMap = STATE.effectiveAssignmentsCache.get(effectiveWeekStart);
        let assignment = null;

        if (effectiveMap && effectiveMap.has(advisorId)) {
            assignment = effectiveMap.get(advisorId);
        } 
        // We rely on the effectiveMap (which includes fallback logic in DataService if history is missing). 
        // If the advisor is not in the map, they have no assignment for this period.

        
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
        const weekKey = findWeekKey(pattern.pattern, effectiveWeek);
        const weekPattern = weekKey ? pattern.pattern[weekKey] : {};

        // Handle legacy DOW keys (e.g., 'mon') if numerical key is missing
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

    APP.ScheduleCalculator = ScheduleCalculator;
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
                <td class="actions"><button class="btn btn-sm btn-danger delete-component" data-component-id="${comp.id}">Delete</button></td>
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
 * Manages the assignment of Rotations to Advisors, utilizing the rotation_assignments_history table.
 */
(function(APP) {
    const AssignmentManager = {};
    const ELS = {};

    AssignmentManager.initialize = () => {
        ELS.grid = document.getElementById('assignmentGrid');
        // Actions are handled exclusively by the buttons via handleRowAction, wired during render.
    };

    // Renders the assignment grid, showing the effective rotation for the selected week.
    AssignmentManager.render = async () => {
        if (!ELS.grid) return;
        const STATE = APP.StateManager.getState();
        const advisors = STATE.advisors.sort((a,b) => a.name.localeCompare(b.name));
        const patterns = STATE.rotationPatterns.sort((a,b) => a.name.localeCompare(b.name));
        const patternOpts = patterns.map(p => `<option value="${p.name}">${p.name}</option>`).join('');
        
        // Get the selected Week Start (YYYY-MM-DD) from the global state
        const weekStartISO = STATE.weekStart;

        // Ensure effective assignments for the selected week start date are loaded into the cache.
        if (weekStartISO) {
            await APP.StateManager.loadEffectiveAssignments(weekStartISO);
        }

        // Get the map from the cache.
        const effectiveMap = STATE.effectiveAssignmentsCache.get(weekStartISO);


        let html = '<table><thead><tr><th>Advisor</th><th>Assigned Rotation (This Week)</th><th>Start Date (Week 1)</th><th>Actions</th></tr></thead><tbody>';

        advisors.forEach(adv => {
            // Determine the effective assignment for this week based on the history cache.
            const effective = (effectiveMap && effectiveMap.get(adv.id)) ? effectiveMap.get(adv.id) : null;

            // We rely on the effective map (which includes history logic and fallback logic in DataService)
            const assignment = effective
                ? { advisor_id: adv.id, rotation_name: effective.rotation_name, start_date: effective.start_date }
                : null; 

            const startDate = (assignment && assignment.start_date) ? assignment.start_date : '';

            
            // V15.8 FIX (Bug 2): Corrected the HTML structure to resolve button duplication ("spam").
            // Ensured all buttons are within the single <td> and removed invalid <div> wrappers inside <tr>.
            html += `<tr data-advisor-id="${adv.id}">
                  <td>${adv.name}</td>
                  <td><select class="form-select assign-rotation" data-advisor-id="${adv.id}"><option value="">-- None --</option>${patternOpts}</select></td>
                  <td><input type="text" class="form-input assign-start-date" data-advisor-id="${adv.id}" value="${startDate}" /></td>
                  <td class="actions">
                      <button class="btn btn-sm btn-primary act-assign-week" data-advisor-id="${adv.id}">Assign from this week</button>
                      <button class="btn btn-sm btn-primary act-change-forward" data-advisor-id="${adv.id}">Change from this week forward</button>
                      <button class="btn btn-sm btn-secondary act-change-week" data-advisor-id="${adv.id}">Change only this week (Swap)</button>
                </td>
            </tr>`;

        });
        html += '</tbody></table>';
        
        // V15.8 FIX: Removed duplicate innerHTML assignment.
        ELS.grid.innerHTML = html;

        // V15.8 FIX: Wire actions efficiently after HTML insertion.
        ELS.grid.querySelectorAll('.act-assign-week').forEach(btn => {
          btn.addEventListener('click', () => handleRowAction('assign_from_week', btn.dataset.advisorId));
        });
        ELS.grid.querySelectorAll('.act-change-forward').forEach(btn => {
          // Note: We map the UI 'change_forward' action to the DataService 'assignFromWeek' logic as they are identical.
          btn.addEventListener('click', () => handleRowAction('assign_from_week', btn.dataset.advisorId));
        });
        ELS.grid.querySelectorAll('.act-change-week').forEach(btn => {
          btn.addEventListener('click', () => handleRowAction('change_one_week', btn.dataset.advisorId));
        });

        // Initialize Flatpickr and set dropdown values after HTML insertion
        advisors.forEach(adv => {
            // Re-determine the assignment used for rendering to set the correct dropdown value
            const effective = (effectiveMap && effectiveMap.get(adv.id)) ? effectiveMap.get(adv.id) : null;
             const assignment = effective
                ? { rotation_name: effective.rotation_name, start_date: effective.start_date }
                : null;

            const row = ELS.grid.querySelector(`tr[data-advisor-id="${adv.id}"]`);
            if (!row) return;

            const rotSelect = row.querySelector('.assign-rotation');
            if (rotSelect) {
                // Set the dropdown to the currently effective rotation for this week.
                rotSelect.value = (assignment && assignment.rotation_name) ? assignment.rotation_name : '';
            }
            
            const dateInput = row.querySelector('.assign-start-date');
            if (dateInput && typeof flatpickr !== 'undefined') {
                // Configure Flatpickr
                flatpickr(dateInput, {
                  // Store as ISO (Y-m-d) for database compatibility
                  dateFormat: 'Y-m-d',           
                  // Display as UK format (d/m/Y) for user friendliness
                  altInput: true,                 
                  altFormat: 'd/m/Y',             
                  allowInput: true,
                  locale: { "firstDayOfWeek": 1 }, // Monday
                  // Changes are handled exclusively by the action buttons.
                  onChange: function(selectedDates, dateStr, instance) {
                    // Do nothing here.
                  }
                });
            }
        });
    };

    // Handle per-row actions (change forward / one-week swap)
    // V15.8 FIX (Bug 2): Implemented logic using the newly added DataService methods.
    const handleRowAction = async (action, advisorId) => {
      try {
        // Row + inputs
        const row = document.querySelector(`tr[data-advisor-id="${advisorId}"]`);
        if (!row) return APP.Utils.showToast('Row not found', 'danger');

        const rotationSel = row.querySelector('.assign-rotation');
        const dateInput   = row.querySelector('.assign-start-date');
        const globalWeekStartISO = APP.StateManager.getState().weekStart; // Use global context

        const rotationName = rotationSel ? rotationSel.value : '';
        
        // Validation: For swaps, rotation must be selected.
        if (!rotationName && action === 'change_one_week') {
             return APP.Utils.showToast('Pick a rotation first for the swap.', 'warning');
        }

        // Determine the start date for the action.
        let startISO = globalWeekStartISO; // Default to current week context for swaps

        if (action === 'assign_from_week') {
            // For these actions, we use the date specified in the input field.
            
            // Get the underlying ISO value managed by Flatpickr if available, otherwise the raw value.
            let rawInput = '';
            if (dateInput) {
                 // Flatpickr stores the ISO value in the actual input element when altInput is used.
                 rawInput = dateInput.value.trim();
            }
            
            if (!rawInput) {
                return APP.Utils.showToast('Start date is required for this action.', 'danger');
            }
            
            // Handle potential UK format if user somehow typed manually and Flatpickr didn't parse
            if (rawInput.includes('/')) {
                const iso = APP.Utils.convertUKToISODate(rawInput);
                if (!iso) return APP.Utils.showToast('Invalid date format (dd/mm/yyyy expected).', 'danger');
                startISO = iso;
            } else {
                startISO = rawInput;
            }
        }

        
        if (!/^\d{4}-\d{2}-\d{2}$/.test(startISO)) {
          return APP.Utils.showToast('Start date looks invalid (YYYY-MM-DD expected).', 'danger');
        }


        // V15.8 FIX: Route to the correct, implemented DB helper
        let res;
        if (action === 'assign_from_week') {
          // Handles both "Assign from this week" and "Change from this week forward"
          res = await APP.DataService.assignFromWeek({
            advisor_id: advisorId,
            rotation_name: rotationName,
            start_date: startISO
          });
        } else if (action === 'change_one_week') {
          // Ensure the start date is a Monday for the one-week swap (important if user changed date context)
          const weekStart = APP.Utils.getMondayForDate(startISO);
          if (!weekStart) return APP.Utils.showToast('Invalid week start date for swap.', 'danger');

          res = await APP.DataService.changeOnlyWeek({
            advisor_id: advisorId,
            rotation_name: rotationName,
            week_start: weekStart,
            week_end: APP.Utils.addDaysISO(weekStart, 6)
          });
        } else {
          return APP.Utils.showToast('Unknown action.', 'danger');
        }

        if (res?.error) {
          // Error handling is primarily done within DataService, but we check here too.
          return;
        }

        // V15.8: Clear the cache explicitly as data has changed.
        // We don't need to syncRecord for history table, just clear the cache.
        APP.StateManager.clearEffectiveAssignmentsCache();
        
        // V15.8.1 FIX: Corrected synchronization logic (Replaced fetchTable with fetchSnapshotForAdvisor)
        // The snapshot table (rotation_assignments) is updated automatically by the DataService helpers in the DB.
        // We need to refresh the local state's snapshot view (STATE.rotationAssignments) for history tracking.

        // Fetch the updated snapshot specifically for this advisor using the new public function.
        const { data: updatedSnapshot, error: snapshotError } = await APP.DataService.fetchSnapshotForAdvisor(advisorId);

        if (snapshotError) {
            console.warn("Failed to refresh local assignment snapshot after update.", snapshotError);
            // We continue anyway, as the history cache is cleared and the UI will mostly rely on that.
        } else if (updatedSnapshot) {
            // If a record exists (data is not null), update the local state
            APP.StateManager.syncRecord('rotation_assignments', updatedSnapshot);
        } else {
            // If the record is null (and no error), it means the advisor is now unassigned (removed from snapshot).
            // We sync this deletion locally.
            APP.StateManager.syncRecord('rotation_assignments', { advisor_id: advisorId }, true);
        }


        APP.StateManager.saveHistory(`Assignment Action: ${action}`);

        // Refresh both views so changes are instant (this triggers a fresh cache load)
        // ScheduleViewer.render() handles rendering both itself and the AssignmentManager if active.
        if (APP.Components.ScheduleViewer) {
             APP.Components.ScheduleViewer.render();
        }
        
        APP.Utils.showToast('Assignment updated successfully.', 'success');

      } catch (e) {
        console.error("Error in handleRowAction:", e);
        APP.Utils.showToast('Unexpected error during assignment update. See console.', 'danger');
      }
    }

    APP.Components = APP.Components || {};
    APP.Components.AssignmentManager = AssignmentManager;

}(window.APP));

/**
 * MODULE: APP.Components.SequentialBuilder (Shared Modal Logic)
 * Supports both Shift Definitions and Exceptions (Live Editing).
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
// Helper to parse HH:MM string to minutes
    const parseTimeToMinutes = (timeStr) => {
        const parts = (timeStr || "").split(':');
        if (parts.length !== 2) return null;
        const h = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        if (isNaN(h) || isNaN(m)) return null;
        return h * 60 + m;
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

        // Exception specific elements
        ELS.exceptionReasonGroup = document.getElementById('exceptionReasonGroup');
        ELS.modalExceptionReason = document.getElementById('modalExceptionReason');

        // Check if critical elements are found during initialization
        if (!ELS.modal || !ELS.modalSave || !ELS.modalSequenceBody || !ELS.modalStartTime) {
            console.error("CRITICAL ERROR: SequentialBuilder failed to find necessary modal elements (e.g., modalStartTime) in index.html during initialization. Check HTML integrity.");
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
        
        // Ensure modal elements exist before attempting to open.
        if (!ELS.modal || !ELS.modalStartTime) {
            console.error("ERROR: Attempted to open SequentialBuilder, but critical modal elements are missing.");
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
        
        if (ELS.modalStartTime && ELS.modalStartTime._flatpickr) {
            ELS.modalStartTime._flatpickr.setDate(APP.Utils.formatMinutesToTime(startTimeMin), false);
        }

        // Show/Hide exception reason input based on mode
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
                    <td>
                        <input type="text" 
                               class="form-input duration-input sequence-start-time" 
                               data-index="${index}" 
                               value="${APP.Utils.formatMinutesToTime(startTime)}" 
                               data-minutes="${startTime}">
                    </td>
                    <td>
                        <input type="text" 
                               class="form-input duration-input sequence-end-time" 
                               data-index="${index}" 
                               value="${APP.Utils.formatMinutesToTime(endTime)}" 
                               data-minutes="${endTime}">
                    </td>
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
        
        } else if (target.classList.contains('sequence-start-time')) {
            // --- Handle Start Time Change ---
            const newStartTimeMin = parseTimeToMinutes(target.value);
            const originalStartTimeMin = parseInt(target.dataset.minutes, 10);

            if (newStartTimeMin === null || newStartTimeMin === originalStartTimeMin) {
                target.value = APP.Utils.formatMinutesToTime(originalStartTimeMin); // Revert if invalid
                return;
            }
            
            if (index === 0) {
                // --- 1. Overall Shift Start Change (Ripple Effect) ---
                // This is the "lateness" scenario.
                // We just update the global start time and let render() recalculate everything.
                BUILDER_STATE.startTimeMin = newStartTimeMin;
                
            } else {
                // --- 2. Internal Boundary Change (Zero-Sum Adjustment) ---
                // This adjusts the durations of the two adjacent segments.
                const durationDiff = newStartTimeMin - originalStartTimeMin;
                const prevDuration = BUILDER_STATE.segments[index - 1].duration_min;
                const currDuration = BUILDER_STATE.segments[index].duration_min;
                const newPrevDuration = prevDuration + durationDiff;
                const newCurrDuration = currDuration - durationDiff;

                // Validate that neither segment becomes too small
                if (newPrevDuration < 5 || newCurrDuration < 5) {
                    APP.Utils.showToast("Cannot adjust: an activity would become too short.", "warning");
                    target.value = APP.Utils.formatMinutesToTime(originalStartTimeMin); // Revert
                    return;
                }
                
                // All checks passed. Apply duration changes.
                BUILDER_STATE.segments[index - 1].duration_min = newPrevDuration;
                BUILDER_STATE.segments[index].duration_min = newCurrDuration;
            }
        
        } else if (target.classList.contains('sequence-end-time')) {
            // --- Handle End Time Change ---
            const newEndTimeMin = parseTimeToMinutes(target.value);
            const originalEndTimeMin = parseInt(target.dataset.minutes, 10);

            if (newEndTimeMin === null || newEndTimeMin === originalEndTimeMin) {
                target.value = APP.Utils.formatMinutesToTime(originalEndTimeMin); // Revert if invalid
                return;
            }
            
            const isLastRow = index === BUILDER_STATE.segments.length - 1;

            if (isLastRow) {
                // --- 1. Overall Shift End Change (Adjusts last segment) ---
                // This is the "leaving early/staying late" scenario.
                // We just adjust the duration of this (the last) segment.
                const durationDiff = newEndTimeMin - originalEndTimeMin;
                const newLastDuration = BUILDER_STATE.segments[index].duration_min + durationDiff;

                if (newLastDuration < 5) {
                     APP.Utils.showToast("Cannot adjust: the last activity would be too short.", "warning");
                     target.value = APP.Utils.formatMinutesToTime(originalEndTimeMin); // Revert
                     return;
                }
                BUILDER_STATE.segments[index].duration_min = newLastDuration;
                
            } else {
                // --- 2. Internal Boundary Change (Zero-Sum Adjustment) ---
                // This adjusts the durations of the two adjacent segments.
                const durationDiff = newEndTimeMin - originalEndTimeMin;
                const currDuration = BUILDER_STATE.segments[index].duration_min;
                const nextDuration = BUILDER_STATE.segments[index + 1].duration_min;
                const newCurrDuration = currDuration + durationDiff;
                const newNextDuration = nextDuration - durationDiff;

                if (newCurrDuration < 5 || newNextDuration < 5) {
                    APP.Utils.showToast("Cannot adjust: an activity would become too short.", "warning");
                    target.value = APP.Utils.formatMinutesToTime(originalEndTimeMin); // Revert
                    return;
                }
                
                // All checks passed. Apply duration changes.
                BUILDER_STATE.segments[index].duration_min = newCurrDuration;
                BUILDER_STATE.segments[index + 1].duration_min = newNextDuration;
            }
        }
        render(); // Recalculate ripple effect
    };

    const handleSequenceClick = (e) => {
        const target = e.target.closest('button');
        if (!target) return;

        const index = parseInt(target.dataset.index, 10);
        if (isNaN(index)) return;

        // Helper: clamp duration to minimum 5 minutes and round to nearest 5
        const clamp = (v) => Math.max(5, Math.round(v / 5) * 5);

        if (target.classList.contains('delete-sequence-item')) {
            BUILDER_STATE.segments.splice(index, 1);
            render();
            return;
        }

        const action = target.dataset.action;

        if (action === 'insert-before' || action === 'insert-after') {
            // Default new block duration
            const NEW_DURATION = 30;
            const insertAt = action === 'insert-before' ? index : index + 1;

            // Insert a blank segment
            BUILDER_STATE.segments.splice(insertAt, 0, { component_id: null, duration_min: NEW_DURATION });

            // Optional: Auto-adjust a neighbor so total end time stays aligned.
            const adjustIndex = action === 'insert-before' ? index + 1 /* the original row moved down */ : index;
            if (BUILDER_STATE.segments[adjustIndex]) {
                const cur = BUILDER_STATE.segments[adjustIndex];
                // Check if the current segment is long enough to subtract the new duration and still have at least 5 mins left
                if (cur.duration_min > NEW_DURATION + 5) {
                    cur.duration_min = cur.duration_min - NEW_DURATION;
                }
            }

            render();
            return;
        }

        if (action === 'split-row') {
            const seg = BUILDER_STATE.segments[index];
            if (!seg || seg.duration_min < 10) {
                APP.Utils.showToast("Cannot split activity shorter than 10 minutes.", "warning");
                return;
            }

            // Split into two halves, rounding to nearest 5 minutes
            let first = clamp(Math.floor(seg.duration_min / 2));
            let second = seg.duration_min - first;

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

        // If there are no segments, this is an RDO/Absence exception or an empty definition
        if (segments.length === 0) {
             if (mode === 'definition') {
                 // Allow saving empty definitions
             } else if (mode === 'exception') {
                if (!confirm("This will clear the schedule for the selected day (RDO/Absence). Proceed?")) {
                    return;
                }
             }
        }

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

    // Specific save handler for Schedule Exceptions
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
                <td class="actions">
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
            // Open the shared Sequential Builder in 'definition' mode
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
        ELS.btnAddWeek = document.getElementById('btnAddWeek'); // (Top Button)
        ELS.grid = document.getElementById('rotationGrid');
        ELS.autoSaveStatus = document.getElementById('autoSaveStatus');

        if (ELS.familySelect) ELS.familySelect.addEventListener('change', handleFamilyChange);
        if (ELS.btnNew) ELS.btnNew.addEventListener('click', handleNewRotation);
        if (ELS.btnDelete) ELS.btnDelete.addEventListener('click', handleDeleteRotation);
        if (ELS.btnAddWeek) ELS.btnAddWeek.addEventListener('click', handleAddWeek);
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
            if (numWeeks < 6) numWeeks = 6; 
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

        // Event Listeners
        if (ELS.treeSearch) ELS.treeSearch.addEventListener('input', renderTree);
        if (ELS.btnClearSelection) ELS.btnClearSelection.addEventListener('click', clearSelection);
        if (ELS.tree) ELS.tree.addEventListener('change', handleTreeChange);
        
        if (ELS.plannerDay) ELS.plannerDay.addEventListener('change', () => {
            APP.StateManager.getState().selectedDay = ELS.plannerDay.value;
            renderPlannerContent();
        });

        if (ELS.viewToggleGroup) ELS.viewToggleGroup.addEventListener('click', handleViewToggle);

        // Add listener for Live Editing clicks
        if (ELS.visualizationContainer) ELS.visualizationContainer.addEventListener('click', handleVisualizationClick);
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

        // Auto-select the first advisor on initial load if none are selected (Bootstrapping UI)
        if (STATE.selectedAdvisors.size === 0 && STATE.advisors.length > 0 && !STATE.treeInitialized) {
            const firstAdvisor = advisors.find(a => a.leader_id);
             if (firstAdvisor) {
                STATE.selectedAdvisors.add(firstAdvisor.id);
                STATE.treeInitialized = true;
                // Trigger the main render function to ensure coordination
                ScheduleViewer.render();
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
        // Updated time range in title
        ELS.scheduleViewTitle.textContent = "Schedule Visualization (Daily 05:00 - 23:00)";

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
        console.log("WFM Intelligence Platform (v15.8.1) Initializing...");
        
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

        // ScheduleViewer.render() coordinates historical data fetch and rendering of both Viewer and Assignments tabs.
        APP.Components.ScheduleViewer.render();
    };

    APP.Core = Core;
}(window.APP));
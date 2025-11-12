/**
 * WFM Intelligence Platform - Application Logic (v15.9)
 * 
 * V15.9:   ENHANCEMENT: Advanced Live Editor (SequentialBuilder) with interactive timeline visualization and drag/resize handles.
 *          FIX: Restored "Edit" button functionality in Component Manager.
 * V15.8.1: Added "Delete Last Week" functionality to Rotation Editor.
 *          Incorporated AssignmentManager sync fix (fetchSnapshotForAdvisor).
 *          Fixed error handling logic in DataService (insertError check).
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

    // V15.9: Enhanced robustness for color contrast detection.
    // Determine contrasting text color (black or white) based on background brightness
    Utils.getContrastingTextColor = (hexColor) => {
        if (!hexColor) return '#000000';
        
        // Handle CSS variables (common in the new visualization)
        if (hexColor.startsWith('var(')) {
            // This is complex to resolve client-side without computed styles, fallback to black for safety
            return '#000000';
        }

        // Standardize input (remove # if present)
        const hex = hexColor.replace('#', '');

        // Handle short hex codes (e.g., "FFF")
        let r, g, b;
        if (hex.length === 3) {
            r = parseInt(hex.charAt(0) + hex.charAt(0), 16);
            g = parseInt(hex.charAt(1) + hex.charAt(1), 16);
            b = parseInt(hex.charAt(2) + hex.charAt(2), 16);
        } else if (hex.length === 6) {
            r = parseInt(hex.substr(0, 2), 16);
            g = parseInt(hex.substr(2, 2), 16);
            b = parseInt(hex.substr(4, 2), 16);
        } else {
            // Fallback for invalid hex strings or named colors
            return '#000000';
        }

        if (isNaN(r) || isNaN(g) || isNaN(b)) return '#000000';

        try {
            // Formula for luminance perception
            const brightness = ((r * 299) + (g * 587) + (b * 114)) / 1000;
            return (brightness > 128) ? '#000000' : '#FFFFFF';
        } catch (e) {
            // Fallback if calculation fails
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
            // Note: leadersResult structure is different due to the join query
            const [advisors, leadersResult, components, definitions, patterns, assignments, exceptions] = await Promise.all([
                fetchTable('advisors'),
                supabase.from('leaders').select('*, sites(name)'),
                fetchTable('schedule_components'),
                fetchTable('shift_definitions'),
                fetchTable('rotation_patterns'),
                fetchTable(SNAPSHOT_TABLE), 
                fetchTable('schedule_exceptions')
            ]);

            // Handle potential error from the joined query
            if (leadersResult.error) {
                handleError(leadersResult.error, "Fetch leaders with sites");
                // Convert to the structure expected by the rest of the checks
                leadersResult.data = []; 
            }

            // Check if any critical data failed to load
            // We check leadersResult.error explicitly as it wasn't handled by fetchTable
            if (advisors.error || leadersResult.error || components.error || definitions.error || patterns.error) {
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
                leaders: leadersResult.data, // Use data from the result object
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

    // V15.9 FIX: Restored Edit button in render.
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
                <td class="actions">
                    <button class="btn btn-sm btn-secondary edit-component" data-component-id="${comp.id}">Edit</button>
                    <button class="btn btn-sm btn-danger delete-component" data-component-id="${comp.id}">Delete</button>
                </td>
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

    // V15.9 FIX: Updated handleClick to include edit action.
    const handleClick = (e) => {
        if (e.target.classList.contains('delete-component')) {
            handleDelete(e.target.dataset.componentId);
        } else if (e.target.classList.contains('edit-component')) {
            handleEdit(e.target.dataset.componentId);
        }
    };

    // V15.9 FIX: Implemented handleEdit using prompts for consistency.
    const handleEdit = async (id) => {
        const component = APP.StateManager.getComponentById(id);
        if (!component) return;

        const name = prompt("Edit component name:", component.name);
        if (!name) return; // User cancelled
        const type = prompt("Edit type:", component.type);
        const color = prompt("Edit hex color code:", component.color);
        const duration = parseInt(prompt("Edit default duration in minutes:", component.default_duration_min), 10);
        const isPaid = confirm(`Is this a paid activity? (Currently: ${component.is_paid ? 'Yes' : 'No'})`);

        if (!name || !type || !color || isNaN(duration)) {
            APP.Utils.showToast("Invalid input provided during edit.", "danger");
            return;
        }

        const updates = { name, type, color, default_duration_min: duration, is_paid: isPaid };

        const { data, error } = await APP.DataService.updateRecord('schedule_components', updates, { id });
        if (!error) {
            APP.StateManager.syncRecord('schedule_components', data);
            APP.Utils.showToast(`Component '${name}' updated.`, "success");
            ComponentManager.render();
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
        
        // Check if the Assignments tab is active before proceeding with heavy rendering
        const activeTab = document.querySelector('.tab-content.active');
        if (!activeTab || activeTab.id !== 'tab-advisor-assignments') {
            return;
        }

        const advisors = STATE.advisors.sort((a,b) => a.name.localeCompare(b.name));
        const patterns = STATE.rotationPatterns.sort((a,b) => a.name.localeCompare(b.name));
        const patternOpts = patterns.map(p => `<option value="${p.name}">${p.name}</option>`).join('');
        
        // Get the selected Week Start (YYYY-MM-DD) from the global state
        const weekStartISO = STATE.weekStart;

        // Ensure effective assignments for the selected week start date are loaded into the cache.
        // Note: ScheduleViewer.render often calls this first, but we ensure it here if accessed directly.
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
 * V15.9: Major enhancements including interactive timeline visualization and drag/resize handles.
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
        // V15.9: New state for drag interactions
        isDragging: false,
        dragContext: null, 
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
        // V15.9: New element for visualization
        ELS.modalVisualization = document.getElementById('modalVisualization');


        // Exception specific elements
        ELS.exceptionReasonGroup = document.getElementById('exceptionReasonGroup');
        ELS.modalExceptionReason = document.getElementById('modalExceptionReason');

        // Check if critical elements are found during initialization
        if (!ELS.modal || !ELS.modalSave || !ELS.modalSequenceBody || !ELS.modalStartTime || !ELS.modalVisualization) {
            console.error("CRITICAL ERROR: SequentialBuilder failed to find necessary modal elements (e.g., modalStartTime, modalVisualization) in index.html during initialization. Check HTML integrity.");
        }

        // Event Listeners
        if (ELS.modalClose) ELS.modalClose.addEventListener('click', SequentialBuilder.close);
        if (ELS.modalAddActivity) ELS.modalAddActivity.addEventListener('click', handleAddActivity);
        if (ELS.modalSave) ELS.modalSave.addEventListener('click', handleSave);
        
        if (ELS.modalSequenceBody) {
            ELS.modalSequenceBody.addEventListener('change', handleSequenceChange);
            ELS.modalSequenceBody.addEventListener('click', handleSequenceClick);
        }

        // V15.9: Event listeners for drag interactions on the visualization
        if (ELS.modalVisualization) {
            ELS.modalVisualization.addEventListener('mousedown', handleDragStart);
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
        // V15.9: Reset drag state
        BUILDER_STATE.isDragging = false;
        BUILDER_STATE.dragContext = null;

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

    // V15.9: Enhanced close function to ensure drag state is cleaned up.
    SequentialBuilder.close = () => {
        // Ensure any ongoing drag operations are cancelled
        if (BUILDER_STATE.isDragging) {
            handleDragEnd();
        }
        BUILDER_STATE.isOpen = false;
        if (ELS.modal) ELS.modal.style.display = 'none';
    };

    // V15.9: Updated Render function to call both grid and visualization renderers.
    // Renders the dynamic sequence grid AND the visualization (The Ripple Effect)
    const render = () => {
        renderGrid();
        renderVisualization();
    };

    // V15.9: Separated Grid rendering logic.
    const renderGrid = () => {
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

    // V15.9: New function to render the interactive visualization.
    const renderVisualization = () => {
        if (!ELS.modalVisualization) return;

        const segments = BUILDER_STATE.segments;
        if (segments.length === 0) {
            ELS.modalVisualization.innerHTML = '<div class="visualization-empty">Add activities to visualize the shift.</div>';
            return;
        }

        // Calculate total duration of the shift being edited
        const totalDurationMin = segments.reduce((sum, seg) => sum + seg.duration_min, 0);
        if (totalDurationMin === 0) {
            ELS.modalVisualization.innerHTML = '';
            return;
        }

        let html = '<div class="builder-timeline">';
        let currentTime = BUILDER_STATE.startTimeMin;

        segments.forEach((seg, index) => {
            const component = APP.StateManager.getComponentById(seg.component_id);
            const widthPct = (seg.duration_min / totalDurationMin) * 100;
            const color = component ? component.color : '#999';
            const textColor = APP.Utils.getContrastingTextColor(color);
            const name = component ? component.name : 'N/A';

            const startTime = currentTime;
            const endTime = currentTime + seg.duration_min;
            currentTime = endTime;

            // Add data attributes for interaction
            html += `<div class="builder-timeline-bar" 
                          style="width: ${widthPct}%; background-color: ${color}; color: ${textColor};"
                          data-index="${index}"
                          title="${name} (${APP.Utils.formatMinutesToTime(startTime)} - ${APP.Utils.formatMinutesToTime(endTime)})">
                        ${name}
                        <div class="resize-handle left" data-index="${index}" data-action="resize-left"></div>
                        <div class="resize-handle right" data-index="${index}" data-action="resize-right"></div>
                     </div>`;
        });

        html += '</div>';
        ELS.modalVisualization.innerHTML = html;
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
        render(); // V15.9: Recalculate ripple effect (updates grid and visualization)
    };

    // --- V15.9: Drag Interaction Logic ---

    const handleDragStart = (e) => {
        const handle = e.target.closest('.resize-handle');
        // We only support resizing via handles currently. Moving blocks is complex due to ripple effects.
        if (!handle) return;

        const index = parseInt(handle.dataset.index, 10);
        const action = handle.dataset.action;

        if (isNaN(index) || !action) return;

        // Calculate pixels per minute based on current visualization width
        const timelineElement = ELS.modalVisualization.querySelector('.builder-timeline');
        if (!timelineElement) return;

        const totalDurationMin = BUILDER_STATE.segments.reduce((sum, seg) => sum + seg.duration_min, 0);
        const timelineWidthPx = timelineElement.offsetWidth;
        const pixelsPerMinute = timelineWidthPx / totalDurationMin;

        // Determine constraints for the drag operation
        // The logic depends on which handle is being dragged and the adjacent segments.
        
        let indexA, indexB; // The two segments involved in the zero-sum adjustment

        if (action === 'resize-left') {
            if (index === 0) {
                // Dragging the start of the first activity changes the overall shift start time.
                // This is a different interaction type.
                // For now, we disable dragging the very start/end of the shift via visualization.
                return; 
            }
            indexA = index - 1;
            indexB = index;
        } else if (action === 'resize-right') {
            if (index === BUILDER_STATE.segments.length - 1) {
                // Dragging the end of the last activity changes the overall shift end time.
                return; 
            }
            indexA = index;
            indexB = index + 1;
        }

        const segA = BUILDER_STATE.segments[indexA];
        const segB = BUILDER_STATE.segments[indexB];

        // Calculate the maximum movement allowed (in minutes)
        // Constraint: Neither segment can be less than 5 minutes.
        const maxMoveRightMin = segB.duration_min - 5;
        const maxMoveLeftMin = segA.duration_min - 5;

        BUILDER_STATE.isDragging = true;
        BUILDER_STATE.dragContext = {
            startX: e.clientX,
            pixelsPerMinute: pixelsPerMinute,
            indexA: indexA,
            indexB: indexB,
            originalDurationA: segA.duration_min,
            originalDurationB: segB.duration_min,
            maxMoveRightMin: maxMoveRightMin,
            maxMoveLeftMin: maxMoveLeftMin,
        };

        // Add global listeners for move and end
        document.addEventListener('mousemove', handleDragMove);
        document.addEventListener('mouseup', handleDragEnd);
        
        // Add visual feedback class
        if (ELS.modalVisualization) ELS.modalVisualization.classList.add('is-dragging');

        e.preventDefault(); // Prevent text selection
    };

    const handleDragMove = (e) => {
        if (!BUILDER_STATE.isDragging || !BUILDER_STATE.dragContext) return;

        const context = BUILDER_STATE.dragContext;
        const deltaX = e.clientX - context.startX;
        
        // Convert pixel movement to minutes
        let deltaMin = deltaX / context.pixelsPerMinute;

        // Apply constraints
        if (deltaMin > 0) { // Moving Right
            deltaMin = Math.min(deltaMin, context.maxMoveRightMin);
        } else if (deltaMin < 0) { // Moving Left
            deltaMin = Math.max(deltaMin, -context.maxMoveLeftMin);
        }

        // Snap to 5-minute increments
        deltaMin = Math.round(deltaMin / 5) * 5;

        if (deltaMin === 0) return;

        // Calculate new durations (Zero-Sum)
        const newDurationA = context.originalDurationA + deltaMin;
        const newDurationB = context.originalDurationB - deltaMin;

        // Update the state
        BUILDER_STATE.segments[context.indexA].duration_min = newDurationA;
        BUILDER_STATE.segments[context.indexB].duration_min = newDurationB;

        // Re-render visualization in real-time (and the grid)
        render();
    };

    const handleDragEnd = () => {
        if (!BUILDER_STATE.isDragging) return;

        // Cleanup
        document.removeEventListener('mousemove', handleDragMove);
        document.removeEventListener('mouseup', handleDragEnd);
        
        if (ELS.modalVisualization) ELS.modalVisualization.classList.remove('is-dragging');

        BUILDER_STATE.isDragging = false;
        BUILDER_STATE.dragContext = null;

        // Final render (ensures grid and visualization are perfectly in sync)
        render();
    };

    // --- End of Drag Interaction Logic ---


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
        // V15.9: Ensure any ongoing drag is finalized before saving
        if (BUILDER_STATE.isDragging) {
            handleDragEnd();
        }

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
        // V15.8.1: Added click listener for the grid to handle dynamic buttons (like delete week) - Handled in renderGrid now
        // if (ELS.grid) ELS.grid.addEventListener('click', handleGridClick);
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

    // V15.8.1: Refactored renderGrid to include "Delete Last Week" button handling.
    RotationEditor.renderGrid = () => {
        if (!ELS.grid) return;
        const STATE = APP.StateManager.getState();
        const currentRotationName = STATE.currentRotation;
        const pattern = APP.StateManager.getPatternByName(currentRotationName);
        
        // Enable/Disable buttons based on selection
        const isDisabled = !pattern;
        if (ELS.btnAddWeek) ELS.btnAddWeek.disabled = isDisabled;
        if (ELS.btnDelete) ELS.btnDelete.disabled = isDisabled;

        if (!pattern) {
            ELS.grid.innerHTML = '<p style="margin-top: 16px;">Please select or create a rotation pattern.</p>';
            return;
        }

        // Generate shift definition options HTML
        const shiftOptions = STATE.shiftDefinitions
            .sort((a, b) => a.code.localeCompare(b.code))
            .map(s => `<option value="${s.code}">${s.code} (${s.name})</option>`)
            .join('');
        
        // Determine the number of weeks
        const numWeeks = APP.Utils.calculateRotationLength(pattern);

        // V15.8.1: Added 'Actions' column header - Removed as button is now inline footer
        let html = '<table><thead><tr><th>Week</th><th>Monday</th><th>Tuesday</th><th>Wednesday</th><th>Thursday</th><th>Friday</th><th>Saturday</th><th>Sunday</th></tr></thead><tbody>';
        
        for (let i = 1; i <= numWeeks; i++) {
            // Use the robust key finder
            const weekKey = Object.keys(pattern.pattern).find(k => {
                const match = k.match(/^Week ?(\d+)$/i);
                return match && parseInt(match[1], 10) === i;
            });

            const weekData = weekKey ? pattern.pattern[weekKey] : {};
            
            html += `<tr><td>Week ${i}</td>`;
            
            // Define standard day keys (numerical) and legacy keys (DOW abbreviations)
            const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

            for (let j = 1; j <= 7; j++) {
                const dayKey = j.toString();
                const legacyDayKey = days[j-1];
                
                // Prioritize numerical key, fallback to legacy key
                const shiftCode = weekData[dayKey] || weekData[legacyDayKey] || '';
                
                // V15.8.1: Ensure data attributes use standard numerical format (data-day="${j}")
                html += `<td><select class="form-select rotation-input" data-week="${i}" data-day="${j}">
                            <option value="">-- RDO --</option>
                            ${shiftOptions}
                         </select></td>`;
            }

            html += `</tr>`;
        }
        html += '</tbody></table>';
        // Inline footer buttons
        html += `<div class="table-footer-inline">
                    <button id="btnRemoveWeekBottom" class="btn btn-sm btn-danger" ${numWeeks <= 1 ? 'disabled' : ''}>[-] Delete Last Week</button>
                    <button id="btnAddWeekBottom" class="btn btn-sm btn-secondary">[+] Add Week (Bottom)</button>
                 </div>`;


        ELS.grid.innerHTML = html;

        // Set selected values (must be done after HTML insertion)
        ELS.grid.querySelectorAll('.rotation-input').forEach(input => {
            const weekNum = parseInt(input.dataset.week, 10);
            const dayNum = parseInt(input.dataset.day, 10);

            // Re-find the key for setting the value
            const weekKey = Object.keys(pattern.pattern).find(k => {
                const match = k.match(/^Week ?(\d+)$/i);
                return match && parseInt(match[1], 10) === weekNum;
            });
            const weekData = weekKey ? pattern.pattern[weekKey] : {};
            
            const dayKey = dayNum.toString();
            const legacyDayKey = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'][dayNum-1];
            const shiftCode = weekData[dayKey] || weekData[legacyDayKey] || '';

            input.value = shiftCode;
        });

        // Wire up the bottom buttons
        const btnAddBottom = document.getElementById('btnAddWeekBottom');
        if (btnAddBottom) {
            btnAddBottom.addEventListener('click', handleAddWeek);
        }
        const btnRemoveBottom = document.getElementById('btnRemoveWeekBottom');
        if (btnRemoveBottom) {
            btnRemoveBottom.addEventListener('click', handleRemoveLastWeek);
        }
    };

    // --- Event Handlers ---

    const handleFamilyChange = (e) => {
        const STATE = APP.StateManager.getState();
        STATE.currentRotation = e.target.value;
        RotationEditor.renderGrid();
    };

    const handleGridChange = (e) => {
        if (!e.target.classList.contains('rotation-input')) return;
        
        const input = e.target;
        // V15.8.1: Use data-day instead of data-day-index for consistency with renderGrid
        const weekNum = parseInt(input.dataset.week, 10);
        const dayNum = input.dataset.day; // Keep as string "1"-"7"
        const shiftCode = input.value;
        
        const STATE = APP.StateManager.getState();
        const pattern = APP.StateManager.getPatternByName(STATE.currentRotation);
        
        if (!pattern) return;

        // Find the specific week key (e.g., "Week1" or "Week 1")
        const weekKey = Object.keys(pattern.pattern).find(k => {
             const match = k.match(/^Week ?(\d+)$/i);
            return match && parseInt(match[1], 10) === weekNum;
        });

        if (!weekKey) {
            console.error("Error: Could not find matching week key in pattern object for Week", weekNum);
            return;
        }

        // Update the pattern object in memory
        if (shiftCode) {
            pattern.pattern[weekKey][dayNum] = shiftCode;
        } else {
            // If RDO selected, remove the entry for that day
            delete pattern.pattern[weekKey][dayNum];
        }
        
        // Auto-save the updated pattern structure
        saveRotation(pattern);
    };

    // --- CRUD Operations ---

    const handleNewRotation = async () => {
        const name = prompt("Enter name for the new rotation pattern:");
        if (!name) return;

        if (APP.StateManager.getPatternByName(name)) {
            APP.Utils.showToast("Error: Rotation name already exists.", "danger");
            return;
        }

        // Start with an empty pattern containing Week 1
        const newRotation = { name, pattern: { "Week 1": {} } };

        const { data, error } = await APP.DataService.saveRecord('rotation_patterns', newRotation);
        if (!error) {
            APP.StateManager.syncRecord('rotation_patterns', data);
            APP.StateManager.getState().currentRotation = name;
            APP.StateManager.saveHistory("Create Rotation");
            APP.Utils.showToast(`Rotation '${name}' created.`, "success");
            RotationEditor.render(); // Re-render dropdown and grid
        }
    };

    const handleDeleteRotation = async () => {
        const STATE = APP.StateManager.getState();
        const name = STATE.currentRotation;
        if (!name || !confirm(`Are you sure you want to delete '${name}'?`)) return;

        // NOTE: Should ideally check if rotation is assigned before deleting
        const { error } = await APP.DataService.deleteRecord('rotation_patterns', { name });
        if (!error) {
            APP.StateManager.syncRecord('rotation_patterns', { name: name }, true);
            STATE.currentRotation = null;
            APP.StateManager.saveHistory("Delete Rotation");
            APP.Utils.showToast(`Rotation deleted.`, "success");
            RotationEditor.render();
        }
    };

    // V15.8.1: Implementation for removing the last week.
    const handleRemoveLastWeek = async () => {
        const STATE = APP.StateManager.getState();
        const pattern = APP.StateManager.getPatternByName(STATE.currentRotation);
        if (!pattern) return;

        const numWeeks = APP.Utils.calculateRotationLength(pattern);

        if (numWeeks <= 1) {
            APP.Utils.showToast("Cannot delete the only week in the rotation.", "warning");
            return;
        }

        if (!confirm(`Are you sure you want to remove Week ${numWeeks}?`)) return;

        // Find the key corresponding to the last week number
        const lastWeekKey = Object.keys(pattern.pattern).find(k => {
            const match = k.match(/^Week ?(\d+)$/i);
            return match && parseInt(match[1], 10) === numWeeks;
        });

        if (lastWeekKey) {
            // Remove the last week from the pattern object in memory
            delete pattern.pattern[lastWeekKey];
            
            // Save the updated pattern structure and re-render
            await saveRotation(pattern);
            RotationEditor.renderGrid(); 
        } else {
            console.error("Could not find the key for the last week.");
        }
    };


    const handleAddWeek = async (e) => {
        const STATE = APP.StateManager.getState();
        const pattern = APP.StateManager.getPatternByName(STATE.currentRotation);
        if (!pattern) return;

        const numWeeks = APP.Utils.calculateRotationLength(pattern);
        const newWeekNum = numWeeks + 1;
        const newWeekKey = `Week ${newWeekNum}`;

        // Check if the key somehow already exists
        if (pattern.pattern[newWeekKey]) {
            APP.Utils.showToast("Error: New week key already exists.", "danger");
            return;
        }

        // Determine insertion method based on which button was clicked (Top or Bottom)
        // The current implementation always adds to the bottom (increases week count).
        // If "Add Week (Top)" requires inserting a new Week 1 and shifting others down, 
        // that logic is significantly more complex and is deferred for now.
        
        // Add the new week to the pattern object in memory
        pattern.pattern[newWeekKey] = {};
        
        // Save the updated pattern structure and re-render
        await saveRotation(pattern);
        RotationEditor.renderGrid(); 
    };

    // Debounced save function to prevent excessive DB calls during rapid input
    let saveTimeout = null;
    const saveRotation = (pattern) => {
        clearTimeout(saveTimeout);
        
        if (ELS.autoSaveStatus) {
            ELS.autoSaveStatus.style.opacity = 0.5;
            ELS.autoSaveStatus.textContent = "Saving...";
        }

        saveTimeout = setTimeout(async () => {
            // V15.8.1: Ensure we save the pattern.pattern (the actual data structure), not the whole object.
            const { data, error } = await APP.DataService.updateRecord('rotation_patterns', { pattern: pattern.pattern }, { name: pattern.name });
            
            if (!error) {
                APP.StateManager.syncRecord('rotation_patterns', data);
                APP.StateManager.saveHistory("Edit Rotation Pattern");
                if (ELS.autoSaveStatus) {
                    ELS.autoSaveStatus.textContent = "Saved";
                    // Fade out the status indicator
                    setTimeout(() => { 
                        if (ELS.autoSaveStatus) ELS.autoSaveStatus.style.opacity = 0; 
                    }, 1000);
                }
            } else {
                if (ELS.autoSaveStatus) {
                    ELS.autoSaveStatus.style.opacity = 1;
                    ELS.autoSaveStatus.textContent = "Save Failed";
                }
            }
        }, 500); // 500ms debounce time
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

    ScheduleViewer.initialize = () => {
        ELS.tree = document.getElementById('schedulesTree');
        ELS.treeSearch = document.getElementById('treeSearch');
        ELS.btnClearSelection = document.getElementById('btnClearSelection');
        ELS.container = document.getElementById('visualizationContainer');
        ELS.viewToggleGroup = document.getElementById('viewToggleGroup');
        ELS.plannerDay = document.getElementById('plannerDay');
        ELS.dayToggleContainer = document.getElementById('dayToggleContainer');
        ELS.scheduleViewTitle = document.getElementById('scheduleViewTitle');

        
        if (ELS.tree) ELS.tree.addEventListener('change', handleTreeSelection);
        if (ELS.treeSearch) ELS.treeSearch.addEventListener('input', renderTree); // Use renderTree for filtering
        if (ELS.btnClearSelection) ELS.btnClearSelection.addEventListener('click', clearTreeSelection);
        if (ELS.viewToggleGroup) ELS.viewToggleGroup.addEventListener('click', handleViewToggle);
        if (ELS.plannerDay) ELS.plannerDay.addEventListener('change', handleDayChange);

        // V15.1: Add click listener to the container for Live Editing
        if (ELS.container) ELS.container.addEventListener('click', handleVisualizationClick);
    };

    // Renders the entire Schedule View (Tree and Visualization)
    ScheduleViewer.render = async () => {
        const STATE = APP.StateManager.getState();
        
        // Ensure the effective assignments for the selected week are loaded first.
        if (STATE.weekStart) {
            await APP.StateManager.loadEffectiveAssignments(STATE.weekStart);
        }

        // Only render the tree and visualization if the Schedule View tab is active
        const activeTab = document.querySelector('.tab-content.active');
        if (activeTab && activeTab.id === 'tab-schedule-view') {
            renderTree();
            renderVisualization();
        }
        
        // Set the selected day dropdown
        if (ELS.plannerDay) ELS.plannerDay.value = STATE.selectedDay;

        // If the Assignments tab is currently active, it also needs a refresh 
        // because its data depends on the effective assignments cache.
        if (activeTab && activeTab.id === 'tab-advisor-assignments' && APP.Components.AssignmentManager) {
            APP.Components.AssignmentManager.render();
        }
    };

    // --- Tree View Logic ---

    const renderTree = () => {
        if (!ELS.tree) return;
        const STATE = APP.StateManager.getState();
        const leaders = STATE.leaders;
        const advisors = STATE.advisors;
        const filterText = ELS.treeSearch ? ELS.treeSearch.value.toLowerCase() : '';
        
        let html = '';

        leaders.forEach(leader => {
            const teamAdvisors = APP.StateManager.getAdvisorsByLeader(leader.id);
            
            // Apply filter
            const filteredAdvisors = teamAdvisors.filter(a => 
                a.name.toLowerCase().includes(filterText) || 
                leader.name.toLowerCase().includes(filterText)
            );

            if (filteredAdvisors.length > 0) {
                // V15.6.3: Added Site/Brand Tag
                const siteName = (leader.sites && leader.sites.name) ? leader.sites.name : 'Unknown Site';

                html += `<div class="tree-node-leader">
                            <label>
                                <input type="checkbox" data-leader-id="${leader.id}">
                                ${leader.name}
                                <span class="team-brand">${siteName}</span>
                            </label>
                         </div>`;
                
                filteredAdvisors.forEach(advisor => {
                    html += `<div class="tree-node-advisor">
                                <label>
                                    <input type="checkbox" data-advisor-id="${advisor.id}" ${STATE.selectedAdvisors.has(advisor.id) ? 'checked' : ''}>
                                    ${advisor.name}
                                </label>
                             </div>`;
                });
            }
        });

        ELS.tree.innerHTML = html;
    };

    const handleTreeSelection = (e) => {
        const checkbox = e.target;
        const leaderId = checkbox.dataset.leaderId;
        const advisorId = checkbox.dataset.advisorId;
        const STATE = APP.StateManager.getState();

        if (leaderId && !advisorId) {
            // Leader checkbox clicked: Toggle all advisors under this leader
            const teamAdvisors = APP.StateManager.getAdvisorsByLeader(leaderId);
            teamAdvisors.forEach(advisor => {
                if (checkbox.checked) {
                    STATE.selectedAdvisors.add(advisor.id);
                } else {
                    STATE.selectedAdvisors.delete(advisor.id);
                }
            });
            // Re-render tree to update checkboxes visually (necessary for leader toggle)
            renderTree(); 
        } else if (advisorId) {
            // Advisor checkbox clicked
            if (checkbox.checked) {
                STATE.selectedAdvisors.add(advisorId);
            } else {
                STATE.selectedAdvisors.delete(advisorId);
            }
        }

        // Re-render visualization based on new selection
        renderVisualization();
    };

    const clearTreeSelection = () => {
        const STATE = APP.StateManager.getState();
        STATE.selectedAdvisors.clear();
        ScheduleViewer.render();
    };

    // --- View Mode Logic (Daily/Weekly) ---

    const handleViewToggle = (e) => {
        const button = e.target.closest('.btn-toggle');
        if (!button) return;
        
        const view = button.dataset.view;
        const STATE = APP.StateManager.getState();
        STATE.scheduleViewMode = view;

        // Update button active state
        ELS.viewToggleGroup.querySelectorAll('.btn-toggle').forEach(btn => {
            btn.classList.remove('active');
        });
        button.classList.add('active');

        renderVisualization();
    };

    const handleDayChange = (e) => {
        const STATE = APP.StateManager.getState();
        STATE.selectedDay = e.target.value;
        renderVisualization();
    };

    // --- Visualization Logic (Gantt/Grid) ---

    // V15.1: Handler for clicking on the visualization (Live Editing Trigger)
    const handleVisualizationClick = (e) => {
        const STATE = APP.StateManager.getState();
        
        let advisorId = null;
        let dayName = STATE.selectedDay; // Default for Daily view

        if (STATE.scheduleViewMode === 'daily') {
            // Check if a timeline row (or name/track within it) was clicked
            const row = e.target.closest('.timeline-row');
            if (row) {
                advisorId = row.dataset.advisorId;
            }
        } else if (STATE.scheduleViewMode === 'weekly') {
            // Check if a weekly grid cell was clicked
            const cell = e.target.closest('.weekly-cell');
            if (cell) {
                advisorId = cell.dataset.advisorId;
                // Note: Ensure weekly render uses data-day-name attribute
                dayName = cell.dataset.dayName; 
            }
        }

        if (advisorId && dayName && STATE.weekStart) {
            // We have the necessary context, trigger the Live Editor (SequentialBuilder)
            openLiveEditor(advisorId, dayName, STATE.weekStart);
        }
    };

    // V15.1: Function to open the SequentialBuilder in 'exception' mode.
    const openLiveEditor = (advisorId, dayName, weekStartISO) => {
        const advisor = APP.StateManager.getAdvisorById(advisorId);
        if (!advisor) return;

        // Determine the specific date
        const dateISO = APP.Utils.getISODateForDayName(weekStartISO, dayName);
        if (!dateISO) return;

        // Calculate the current effective schedule for this day
        const { segments, reason } = APP.ScheduleCalculator.calculateSegments(advisorId, dayName, weekStartISO);

        // Open the builder
        if (APP.Components.SequentialBuilder) {
            APP.Components.SequentialBuilder.open({
                mode: 'exception',
                id: advisorId,
                title: `Live Editor: ${advisor.name} (${dayName}, ${APP.Utils.convertISOToUKDate(dateISO)})`,
                structure: segments,
                date: dateISO,
                reason: reason // Pass existing reason if it was an exception
            });
        }
    };


    const renderVisualization = () => {
        if (!ELS.container) return;
        const STATE = APP.StateManager.getState();
        
        // Filter advisors to only those selected AND present in the current data load
        const selectedAdvisors = Array.from(STATE.selectedAdvisors)
                                      .map(id => APP.StateManager.getAdvisorById(id))
                                      .filter(Boolean)
                                      .sort((a, b) => a.name.localeCompare(b.name));

        if (selectedAdvisors.length === 0) {
            ELS.container.innerHTML = '<div class="visualization-empty">Select advisors from the list to view their schedules.</div>';
            if (ELS.scheduleViewTitle) ELS.scheduleViewTitle.textContent = "Schedule Visualization";
            return;
        }

        if (ELS.scheduleViewTitle) ELS.scheduleViewTitle.textContent = `Schedule Visualization (${selectedAdvisors.length} Advisors)`;


        if (STATE.scheduleViewMode === 'daily') {
            renderDailyTimeline(selectedAdvisors);
            // Show the day toggle
            if (ELS.dayToggleContainer) ELS.dayToggleContainer.style.display = 'flex';
        } else {
            renderWeeklyGrid(selectedAdvisors);
            // Hide the day toggle
            if (ELS.dayToggleContainer) ELS.dayToggleContainer.style.display = 'none';
        }
    };

    // --- Daily Timeline (Gantt) Renderer ---
    const renderDailyTimeline = (advisors) => {
        const STATE = APP.StateManager.getState();
        const dayName = STATE.selectedDay;
        const weekStartISO = STATE.weekStart;

        let html = '<div class="timeline-container">';
        
        // 1. Header
        html += `<div class="timeline-header">
                    <div class="header-name">Advisor</div>
                    <div class="header-timeline" id="headerTimeline">
                        ${generateTimeTicks()}
                    </div>
                 </div>`;

        // 2. Body Rows
        advisors.forEach(advisor => {
            // Calculate schedule for the selected day
            const { segments, source } = APP.ScheduleCalculator.calculateSegments(advisor.id, dayName, weekStartISO);
            
            // V15.1: Add 'is-exception' class if the source is an exception
            const rowClass = source === 'exception' ? 'timeline-row is-exception' : 'timeline-row';

            // V15.1: Add data-advisor-id for click handling
            html += `<div class="${rowClass}" data-advisor-id="${advisor.id}">
                        <div class="timeline-name">${advisor.name}</div>
                        <div class="timeline-track">
                            ${generateTimelineBars(segments)}
                        </div>
                     </div>`;
        });

        html += '</div>';
        ELS.container.innerHTML = html;
    };

    const generateTimeTicks = () => {
        const { TIMELINE_START_MIN, TIMELINE_END_MIN, TIMELINE_DURATION_MIN } = APP.Config;
        let ticksHtml = '';
        // Generate ticks every hour
        for (let min = TIMELINE_START_MIN; min <= TIMELINE_END_MIN; min += 60) {
            const positionPct = ((min - TIMELINE_START_MIN) / TIMELINE_DURATION_MIN) * 100;
            const timeLabel = APP.Utils.formatMinutesToTime(min);
            ticksHtml += `<div class="time-tick" style="left: ${positionPct}%">${timeLabel}</div>`;
        }
        return ticksHtml;
    };

    const generateTimelineBars = (segments) => {
        const { TIMELINE_START_MIN, TIMELINE_DURATION_MIN } = APP.Config;
        let barsHtml = '';

        segments.forEach(seg => {
            const component = APP.StateManager.getComponentById(seg.component_id);
            if (!component) return;

            // Calculate position and width
            const startPos = ((seg.start_min - TIMELINE_START_MIN) / TIMELINE_DURATION_MIN) * 100;
            const duration = seg.end_min - seg.start_min;
            const width = (duration / TIMELINE_DURATION_MIN) * 100;

            // Basic clipping for visualization (if shift starts before/ends after visualized range)
            const visibleStart = Math.max(0, startPos);
            const visibleEnd = Math.min(100, startPos + width);
            const visibleWidth = visibleEnd - visibleStart;

            if (visibleWidth <= 0) return;

            // Determine styling based on component type (for visualization matching screenshot)
            let barClass = 'timeline-bar';
            if (component.type === 'Break' || component.type === 'Lunch') {
                barClass += ' is-gap';
            } else if (component.type === 'Activity') {
                barClass += ' is-activity';
            }
            // We use CSS classes for primary styling now, but keep the component color as a fallback or for other visualizations
            const color = component.color; 
            // const textColor = APP.Utils.getContrastingTextColor(color);

            barsHtml += `<div class="${barClass}" 
                              style="left: ${visibleStart}%; width: ${visibleWidth}%; /* background-color: ${color}; color: ${textColor}; */"
                              title="${component.name} (${APP.Utils.formatMinutesToTime(seg.start_min)} - ${APP.Utils.formatMinutesToTime(seg.end_min)})">
                         </div>`;
        });
        return barsHtml;
    };

    // --- Weekly Grid Renderer ---
    const renderWeeklyGrid = (advisors) => {
        const STATE = APP.StateManager.getState();
        const weekStartISO = STATE.weekStart;
        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

        let html = '<table class="weekly-grid">';
        
        // 1. Header
        html += '<thead><tr><th>Advisor</th>';
        days.forEach(day => {
            const dateISO = APP.Utils.getISODateForDayName(weekStartISO, day);
            const dateUK = APP.Utils.convertISOToUKDate(dateISO);
            html += `<th>${day} (${dateUK})</th>`;
        });
        html += '</tr></thead><tbody>';

        // 2. Body Rows
        advisors.forEach(advisor => {
            html += `<tr><td>${advisor.name}</td>`;
            
            days.forEach(dayName => {
                const { segments, source } = APP.ScheduleCalculator.calculateSegments(advisor.id, dayName, weekStartISO);
                
                // V15.1: Add 'is-exception' class and data attributes for click handling
                const cellClass = source === 'exception' ? 'weekly-cell is-exception' : 'weekly-cell';

                html += `<td class="${cellClass}" data-advisor-id="${advisor.id}" data-day-name="${dayName}">`;

                if (segments.length > 0) {
                    // Determine shift summary (start/end times)
                    const startTime = segments[0].start_min;
                    const endTime = segments[segments.length - 1].end_min;
                    
                    // Determine the "Code" to display. If it's a rotation, we can try to find the original code.
                    // If it's an exception, or if the structure changed, we might just show "Custom".
                    // For simplicity here, we show the times.
                    
                    html += `<div class="weekly-cell-content">
                                <span class="weekly-shift-code">${APP.Utils.formatMinutesToTime(startTime)} - ${APP.Utils.formatMinutesToTime(endTime)}</span>
                             </div>`;
                } else {
                    html += '<div class="weekly-rdo">RDO</div>';
                }
                html += `</td>`;
            });
            html += `</tr>`;
        });

        html += '</tbody></table>';
        ELS.container.innerHTML = html;
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
        reason: '',
    };

    ShiftTradeCenter.initialize = () => {
        ELS.advisor1Select = document.getElementById('tradeAdvisor1');
        ELS.date1Input = document.getElementById('tradeDate1');
        ELS.preview1 = document.getElementById('tradePreview1');
        ELS.advisor2Select = document.getElementById('tradeAdvisor2');
        ELS.date2Input = document.getElementById('tradeDate2');
        ELS.preview2 = document.getElementById('tradePreview2');
        ELS.reasonInput = document.getElementById('tradeReason');
        ELS.btnExecute = document.getElementById('btnExecuteTrade');

        // Event Listeners
        if (ELS.advisor1Select) ELS.advisor1Select.addEventListener('change', (e) => updateTradeState('advisor1', e.target.value));
        if (ELS.advisor2Select) ELS.advisor2Select.addEventListener('change', (e) => updateTradeState('advisor2', e.target.value));
        if (ELS.reasonInput) ELS.reasonInput.addEventListener('input', (e) => {
            TRADE_STATE.reason = e.target.value;
            validateTrade();
        });
        if (ELS.btnExecute) ELS.btnExecute.addEventListener('click', executeTrade);

        // Initialize Date Pickers (Flatpickr)
        if (typeof flatpickr !== 'undefined') {
            if (ELS.date1Input) {
                flatpickr(ELS.date1Input, {
                    dateFormat: 'Y-m-d', altInput: true, altFormat: 'd/m/Y',
                    onChange: (dates, dateStr) => updateTradeState('date1', dateStr)
                });
            }
            if (ELS.date2Input) {
                 flatpickr(ELS.date2Input, {
                    dateFormat: 'Y-m-d', altInput: true, altFormat: 'd/m/Y',
                    onChange: (dates, dateStr) => updateTradeState('date2', dateStr)
                });
            }
        }
    };

    // Renders the initial state (populates dropdowns)
    ShiftTradeCenter.render = () => {
        const STATE = APP.StateManager.getState();
        const advisors = STATE.advisors.sort((a,b) => a.name.localeCompare(b.name));
        
        let opts = '<option value="">-- Select Advisor --</option>';
        advisors.forEach(adv => {
            opts += `<option value="${adv.id}">${adv.name}</option>`;
        });

        if (ELS.advisor1Select) ELS.advisor1Select.innerHTML = opts;
        if (ELS.advisor2Select) ELS.advisor2Select.innerHTML = opts;
        
        // Reset local state when view is rendered
        Object.keys(TRADE_STATE).forEach(key => TRADE_STATE[key] = null);
        TRADE_STATE.reason = '';
        if (ELS.reasonInput) ELS.reasonInput.value = '';
        if (ELS.date1Input && ELS.date1Input._flatpickr) ELS.date1Input._flatpickr.clear();
        if (ELS.date2Input && ELS.date2Input._flatpickr) ELS.date2Input._flatpickr.clear();

        renderPreview(1);
        renderPreview(2);
        validateTrade();
    };

    // Updates the local state and triggers preview/validation
    const updateTradeState = async (field, value) => {
        TRADE_STATE[field] = value;
        
        const slotNum = field.includes('1') ? 1 : 2;
        const advisorId = TRADE_STATE[`advisor${slotNum}`];
        const dateISO = TRADE_STATE[`date${slotNum}`];

        if (advisorId && dateISO) {
            // Calculate the schedule for the preview
            const dayName = APP.Utils.getDayNameFromISO(dateISO);
            // We must determine the Monday start for this specific date to calculate correctly
            const weekStartISO = APP.Utils.getMondayForDate(dateISO);
            
            // Crucial: Ensure historical data for that specific week is loaded before calculation
            await APP.StateManager.loadEffectiveAssignments(weekStartISO);

            const { segments } = APP.ScheduleCalculator.calculateSegments(advisorId, dayName, weekStartISO);
            TRADE_STATE[`schedule${slotNum}`] = segments;
        } else {
            TRADE_STATE[`schedule${slotNum}`] = null;
        }

        renderPreview(slotNum);
        validateTrade();
    };

    // Renders the schedule preview panel
    const renderPreview = (slotNum) => {
        const previewEl = ELS[`preview${slotNum}`];
        const schedule = TRADE_STATE[`schedule${slotNum}`];

        if (!previewEl) return;

        if (!schedule) {
            previewEl.innerHTML = 'Select advisor and date to preview schedule.';
            return;
        }

        let html = '<div class="trade-preview-details">';

        if (schedule.length === 0) {
            html += '<h4>Rest Day Off (RDO)</h4>';
        } else {
            const startTime = schedule[0].start_min;
            const endTime = schedule[schedule.length - 1].end_min;
            html += `<h4>Shift: ${APP.Utils.formatMinutesToTime(startTime)} - ${APP.Utils.formatMinutesToTime(endTime)}</h4>`;
            html += '<ul>';
            schedule.forEach(seg => {
                const component = APP.StateManager.getComponentById(seg.component_id);
                const name = component ? component.name : 'Unknown';
                html += `<li>${APP.Utils.formatMinutesToTime(seg.start_min)} - ${APP.Utils.formatMinutesToTime(seg.end_min)}: ${name}</li>`;
            });
            html += '</ul>';
        }
        html += '</div>';
        previewEl.innerHTML = html;
    };

    // Validates if the trade can proceed
    const validateTrade = () => {
        if (!ELS.btnExecute) return;
        
        const isValid = TRADE_STATE.advisor1 && TRADE_STATE.date1 &&
                        TRADE_STATE.advisor2 && TRADE_STATE.date2 &&
                        TRADE_STATE.reason && TRADE_STATE.reason.trim().length > 0;

        // Prevent trading with self on the same day
        const isSelfTrade = TRADE_STATE.advisor1 === TRADE_STATE.advisor2 && TRADE_STATE.date1 === TRADE_STATE.date2;

        ELS.btnExecute.disabled = !isValid || isSelfTrade;
    };

    // Executes the trade by creating two exceptions
    const executeTrade = async () => {
        if (ELS.btnExecute.disabled) return;

        // Confirmation dialog
        const adv1Name = APP.StateManager.getAdvisorById(TRADE_STATE.advisor1).name;
        const adv2Name = APP.StateManager.getAdvisorById(TRADE_STATE.advisor2).name;
        const date1UK = APP.Utils.convertISOToUKDate(TRADE_STATE.date1);
        const date2UK = APP.Utils.convertISOToUKDate(TRADE_STATE.date2);

        if (!confirm(`Confirm Trade:\n\n${adv1Name}'s schedule on ${date1UK} will be replaced by ${adv2Name}'s schedule from ${date2UK}.\n\nAND\n\n${adv2Name}'s schedule on ${date2UK} will be replaced by ${adv1Name}'s schedule from ${date1UK}.\n\nProceed?`)) {
            return;
        }

        // Define the two exceptions
        // Exception 1: Advisor 1 gets Advisor 2's schedule
        const exception1 = {
            advisor_id: TRADE_STATE.advisor1,
            exception_date: TRADE_STATE.date1,
            structure: TRADE_STATE.schedule2, // Advisor 1 gets Schedule 2
            reason: `Trade with ${adv2Name} (${TRADE_STATE.reason})`
        };

        // Exception 2: Advisor 2 gets Advisor 1's schedule
        const exception2 = {
            advisor_id: TRADE_STATE.advisor2,
            exception_date: TRADE_STATE.date2,
            structure: TRADE_STATE.schedule1, // Advisor 2 gets Schedule 1
            reason: `Trade with ${adv1Name} (${TRADE_STATE.reason})`
        };

        // Execute database operations (Upsert based on advisor_id, exception_date)
        const [res1, res2] = await Promise.all([
            APP.DataService.saveRecord('schedule_exceptions', exception1, 'advisor_id, exception_date'),
            APP.DataService.saveRecord('schedule_exceptions', exception2, 'advisor_id, exception_date')
        ]);

        if (!res1.error && !res2.error) {
            // Sync state and save history
            APP.StateManager.syncRecord('schedule_exceptions', res1.data);
            APP.StateManager.syncRecord('schedule_exceptions', res2.data);
            APP.StateManager.saveHistory("Execute Shift Trade");

            APP.Utils.showToast("Shift trade executed successfully!", "success");
            
            // Re-render the view to clear the form and update previews (which now reflect the trade)
            ShiftTradeCenter.render();

        } else {
            APP.Utils.showToast("Error executing trade. Please check console for details.", "danger");
        }
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
        console.log("WFM Intelligence Platform (v15.9) Initializing...");
        
        // Initialize foundational services
        APP.Utils.cacheDOMElements();
        if (!APP.DataService.initialize()) {
            console.error("DataService failed to initialize. Halting boot.");
            return;
        }

        // Load initial data
        const initialData = await APP.DataService.loadCoreData();
        if (!initialData) {
            console.error("Failed to load core data. Halting boot.");
            return;
        }

        // Initialize State Manager
        APP.StateManager.initialize(initialData);

        // Cache Core DOM elements
        ELS.mainNavigation = document.getElementById('main-navigation');
        ELS.weekStartInput = document.getElementById('weekStart');
        ELS.prevWeekBtn = document.getElementById('prevWeek');
        ELS.nextWeekBtn = document.getElementById('nextWeek');
        ELS.btnUndo = document.getElementById('btnUndo');
        ELS.btnRedo = document.getElementById('btnRedo');

        // Initialize Components
        APP.Components.ComponentManager.initialize();
        APP.Components.ShiftDefinitionEditor.initialize();
        APP.Components.RotationEditor.initialize();
        APP.Components.AssignmentManager.initialize();
        APP.Components.ScheduleViewer.initialize();
        APP.Components.SequentialBuilder.initialize();
        APP.Components.ShiftTradeCenter.initialize();

        // Wire global events
        if (ELS.mainNavigation) ELS.mainNavigation.addEventListener('click', handleTabNavigation);
        if (ELS.prevWeekBtn) ELS.prevWeekBtn.addEventListener('click', () => changeWeek(-7));
        if (ELS.nextWeekBtn) ELS.nextWeekBtn.addEventListener('click', () => changeWeek(7));
        if (ELS.btnUndo) ELS.btnUndo.addEventListener('click', () => APP.StateManager.applyHistory('undo'));
        if (ELS.btnRedo) ELS.btnRedo.addEventListener('click', () => APP.StateManager.applyHistory('redo'));


        // Initialize Week Picker (Flatpickr)
        if (ELS.weekStartInput && typeof flatpickr !== 'undefined') {
            flatpickr(ELS.weekStartInput, {
                // Configure Flatpickr to select weeks starting on Monday
                weekNumbers: true,
                dateFormat: 'Y-m-d', // Store as ISO
                altInput: true,
                altFormat: 'd/m/Y', // Display as UK format
                locale: {
                    "firstDayOfWeek": 1 // Monday
                },
                onChange: function(selectedDates, dateStr, instance) {
                    // When a date is picked, find the Monday of that week
                    if (selectedDates.length > 0) {
                        const date = selectedDates[0];
                        const day = date.getDay();
                        const diff = date.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
                        const monday = new Date(date.setDate(diff));
                        const mondayISO = APP.Utils.formatDateToISO(monday);
                        
                        // Update the input display and the state
                        instance.setDate(mondayISO, false);
                        handleWeekChange(mondayISO);
                    }
                }
            });
        }

        // Initial Render
        // Set initial week to the current week
        const today = new Date();
        const initialWeekStart = APP.Utils.getMondayForDate(APP.Utils.formatDateToISO(today));
        if (ELS.weekStartInput && ELS.weekStartInput._flatpickr) {
             ELS.weekStartInput._flatpickr.setDate(initialWeekStart, false);
        }
        handleWeekChange(initialWeekStart); // This triggers the initial renderAll()

        console.log("Initialization Complete.");
    };

    // Handles tab switching
    const handleTabNavigation = (e) => {
        const tabLink = e.target.closest('.tab-link');
        if (!tabLink || tabLink.classList.contains('disabled')) return;

        const tabId = tabLink.dataset.tab;
        if (!tabId) return;

        // Deactivate current tabs
        document.querySelectorAll('.tab-link').forEach(link => link.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));

        // Activate new tab
        tabLink.classList.add('active');
        const activeTab = document.getElementById(tabId);
        if (activeTab) activeTab.classList.add('active');

        // Trigger render for the newly active tab
        Core.renderAll();
    };

    // Handles the change of the global week context
    const handleWeekChange = (weekStartISO) => {
        if (!weekStartISO) return;
        APP.StateManager.getState().weekStart = weekStartISO;
        // Changing the week requires a full application re-render
        Core.renderAll();
    };

    // Helper to change week by +/- days
    const changeWeek = (days) => {
        const currentWeekStart = APP.StateManager.getState().weekStart;
        if (!currentWeekStart) return;
        
        const newWeekStart = APP.Utils.addDaysISO(currentWeekStart, days);
        
        if (ELS.weekStartInput && ELS.weekStartInput._flatpickr) {
             ELS.weekStartInput._flatpickr.setDate(newWeekStart, false);
        }
        handleWeekChange(newWeekStart);
    };
    
    // Centralized rendering function (calls specific component renders)
    Core.renderAll = () => {
        // Optimization: Only render the active tab's components
        const activeTab = document.querySelector('.tab-content.active');
        if (!activeTab) return;

        // Note: ScheduleViewer.render() handles the necessary data loading (history cache) 
        // required by both the Schedule View and the Assignments View.

        switch (activeTab.id) {
            case 'tab-schedule-view':
            case 'tab-advisor-assignments':
                // Calling ScheduleViewer.render() will ensure data is loaded and then 
                // render the appropriate view (ScheduleViewer or AssignmentManager) based on the active tab ID.
                APP.Components.ScheduleViewer.render();
                break;
            case 'tab-rotation-editor':
                APP.Components.RotationEditor.render();
                break;
            case 'tab-shift-definitions':
                APP.Components.ShiftDefinitionEditor.render();
                break;
            case 'tab-component-manager':
                APP.Components.ComponentManager.render();
                break;
            case 'tab-trade-center':
                APP.Components.ShiftTradeCenter.render();
                break;
        }
        
        // Update global UI elements
        Core.updateUndoRedoButtons(APP.StateManager.getState().historyIndex, APP.StateManager.getState().history.length);
    };

    // Update the state of Undo/Redo buttons
    Core.updateUndoRedoButtons = (index, length) => {
        if (ELS.btnUndo) ELS.btnUndo.disabled = (index <= 0);
        if (ELS.btnRedo) ELS.btnRedo.disabled = (index >= length - 1);
    };

    APP.Core = Core;
}(window.APP));
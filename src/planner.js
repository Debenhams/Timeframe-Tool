/**
 * WFM Intelligence Platform - Application Logic (v16.3 FINAL)
 * * INCLUDES:
 * 1. Smart Visual Editor (Timeline, Drag-drop, Undo/Redo, Time Ruler).
 * 2. Assignment Manager Fix (Event Delegation for robust buttons).
 * 3. Layout Fix (Professional footer layout).
 * 4. Tie-Breaker Logic (Prioritizes swaps over rotations).
 */

// Global Namespace Initialization
window.APP = window.APP || {};

/**
 * MODULE: APP.Config
 */
(function(APP) {
    const Config = {};

    // Supabase Configuration
    Config.SUPABASE_URL = "https://oypdnjxhjpgpwmkltzmk.supabase.co";
    Config.SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im95cGRuanhoanBncHdta2x0em1rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk4Nzk0MTEsImV4cCI6MjA3NTQ1NTQxMX0.Hqf1L4RHpIPUD4ut2uVsiGDsqKXvAjdwKuotmme4_Is";

    // Timeline Visualization Constants (05:00-23:00)
    Config.TIMELINE_START_MIN = 5 * 60; // 05:00
    Config.TIMELINE_END_MIN = 23 * 60; // 23:00
    Config.TIMELINE_DURATION_MIN = Config.TIMELINE_END_MIN - Config.TIMELINE_START_MIN;

    APP.Config = Config;
}(window.APP));

/**
 * MODULE: APP.Utils
 */
(function(APP) {
    const Utils = {};
    const ELS = {}; 

    Utils.cacheDOMElements = () => {
        ELS.notificationContainer = document.getElementById('notification-container');
    };

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

    Utils.formatMinutesToTime = (minutes) => {
        if (minutes === null || isNaN(minutes)) return "";
        let roundedMinutes = Math.round(minutes);
        if (roundedMinutes >= 1440) roundedMinutes -= 1440;
        const h = Math.floor(roundedMinutes / 60);
        const m = roundedMinutes % 60;
        if (m === 60) return `${String(h + 1).padStart(2, '0')}:00`;
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
        } catch (e) { return '#FFFFFF'; }
    };

    Utils.convertUKToISODate = (ukDateStr) => {
        if (!ukDateStr) return null;
        const parts = ukDateStr.split('/');
        if (parts.length !== 3) return null;
        return `${parts[2]}-${parts[1]}-${parts[0].padStart(2, '0')}`;
    };

    Utils.convertISOToUKDate = (isoDateStr) => {
        if (!isoDateStr) return '';
        const parts = isoDateStr.split('-');
        if (parts.length !== 3) return isoDateStr;
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    };

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

    Utils.formatDateToISO = (dateObj) => {
         const yyyy = dateObj.getFullYear();
        const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
        const dd = String(dateObj.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    };

    Utils.getMondayForDate = (isoDateStr) => {
        if (!isoDateStr || typeof isoDateStr !== 'string') return null;
        if (isoDateStr.split('-').length !== 3) {
            const maybeISO = Utils.convertUKToISODate(isoDateStr);
            if (maybeISO) return Utils.getMondayForDate(maybeISO);
            return null;
        }
        const [y, m, d] = isoDateStr.split('-').map(Number);
        const date = new Date(y, m - 1, d);
        if (isNaN(date.getTime())) return null;
        const day = date.getDay();
        const diff = date.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(date.setDate(diff));
        return Utils.formatDateToISO(monday);
    };

    Utils.getDayNameFromISO = (isoDateStr) => {
        if (!isoDateStr) return null;
        try {
            const [y, m, d] = isoDateStr.split('-').map(Number);
            const dateObj = new Date(Date.UTC(y, m - 1, d));
            return dateObj.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
         } catch (err) { return null; }
    };

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

    Utils.getEffectiveWeek = (startDateISO, weekStartISO, assignment, getPatternByName) => {
        try {
            if (!startDateISO || !weekStartISO || !assignment) return null;
            const [y1, m1, d1] = startDateISO.split('-').map(Number);
            const [y2, m2, d2] = weekStartISO.split('-').map(Number);
            if (isNaN(y1) || isNaN(y2)) return null; 
            
            const startUTC = Date.UTC(y1, m1 - 1, d1);
            const checkUTC = Date.UTC(y2, m2 - 1, d2);
            const diffTime = checkUTC - startUTC;
            if (diffTime < 0) return null;

            const diffWeeks = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 7));
            const pattern = getPatternByName(assignment.rotation_name);
            let numWeeksInRotation = Utils.calculateRotationLength(pattern);
            if (numWeeksInRotation === 0) return null;
            if (diffWeeks >= numWeeksInRotation) return null;

            return diffWeeks + 1;
        } catch (e) { return null; }
    };

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
 */
(function(APP) {
    const DataService = {};
    let supabase = null;
    const HISTORY_TABLE = 'rotation_assignments_history';
    const SNAPSHOT_TABLE = 'rotation_assignments';

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
        if (conflictColumn) query = query.upsert(record, { onConflict: conflictColumn });
        else query = query.insert(record);
        const { data, error } = await query.select();
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
        const { data, error } = await supabase
          .from(HISTORY_TABLE)
          .select('advisor_id, rotation_name, start_date, end_date, reason')
          .lte('start_date', isoDate)
          .or(`end_date.is.null,end_date.gte.${isoDate}`);

        if (error && (error.code === '42P01' || error.code === 'PGRST116')) {
            return await fetchSnapshotAssignments();
        }
        if (error) return handleError(error, 'Fetch effective assignments for date');

        // 2) Tie-breaker logic
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
                reason: 'Snapshot Fallback'
            });
        });
        return { data: byAdvisor, error: null };
    };

    DataService.loadCoreData = async () => {
        try {
            const [advisors, leadersResult, components, definitions, patterns, assignments, exceptions] = await Promise.all([
                fetchTable('advisors'),
                supabase.from('leaders').select('*, sites(name)'),
                fetchTable('schedule_components'),
                fetchTable('shift_definitions'),
                fetchTable('rotation_patterns'),
                fetchTable(SNAPSHOT_TABLE), 
                fetchTable('schedule_exceptions')
            ]);
            
            const leaders = { data: leadersResult.data, error: leadersResult.error };

            if (advisors.error || leaders.error || components.error || definitions.error || patterns.error) {
                throw new Error("Failed to load one or more core data tables.");
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
        if (error) return;

        if (data && data.length > 0) {
            const latest = data[0];
            await supabase.from(SNAPSHOT_TABLE).upsert({
                    advisor_id: advisorId,
                    rotation_name: latest.rotation_name,
                    start_date: latest.start_date
            }, { onConflict: 'advisor_id' });
        } else {
            await supabase.from(SNAPSHOT_TABLE).delete().eq('advisor_id', advisorId);
        }
    };

    DataService.assignFromWeek = async ({ advisor_id, rotation_name, start_date, reason = 'New Assignment/Change Forward' }) => {
        try {
            const dateMinusOne = APP.Utils.addDaysISO(start_date, -1);
            const { error: updateError } = await supabase
                .from(HISTORY_TABLE).update({ end_date: dateMinusOne })
                .eq('advisor_id', advisor_id).is('end_date', null).lt('start_date', start_date);

            if (updateError && !(updateError.code === 'PGRST116' || updateError.code === '42P01')) throw new Error("Failed to clip previous assignments.");
                
            const newRecord = {
                advisor_id: advisor_id,
                rotation_name: rotation_name || null,
                start_date: start_date,
                end_date: null,
                reason: reason
            };
            const { data: historyData, error: insertError } = await DataService.saveRecord(HISTORY_TABLE, newRecord, 'advisor_id, start_date');
            if (insertError && (insertError.includes('PGRST116') || insertError.includes('42P01'))) {
                 console.warn("History table missing during insert.");
            } else if (insertError) {
                throw new Error("Failed to insert new assignment history.");
            }
            await updateSnapshotAssignment(advisor_id);
            return { data: historyData, error: null };
        } catch (err) { return handleError(err, "assignFromWeek/changeForward"); }
    };

    DataService.changeOnlyWeek = async ({ advisor_id, rotation_name, week_start, week_end }) => {
        try {
            if (!rotation_name) throw new Error("Rotation name is required for a one-week swap.");
            const swapRecord = {
                advisor_id: advisor_id,
                rotation_name: rotation_name,
                start_date: week_start,
                end_date: week_end,
                reason: 'One Week Swap'
            };
            const { data, error: insertError } = await DataService.saveRecord(HISTORY_TABLE, swapRecord, 'advisor_id, start_date');
            if (insertError && (insertError.includes('PGRST116') || insertError.includes('42P01'))) {
                APP.Utils.showToast("Cannot perform one-week swap as history table is missing.", "danger");
                return { data: null, error: "History table missing." };
            } else if (insertError) {
                 throw new Error("Failed to insert swap record.");
            }
            await updateSnapshotAssignment(advisor_id);
            return { data, error: null };
        } catch (err) { return handleError(err, "Change Only Week"); }
    };

    DataService.fetchSnapshotForAdvisor = async (advisorId) => {
        if (!supabase) return { data: null, error: "Database not initialized." };
        const { data, error } = await supabase.from(SNAPSHOT_TABLE).select('*').eq('advisor_id', advisorId).maybeSingle();
        if (error && (error.code === 'PGRST116' || error.code === '42P01')) return { data: null, error: null };
        if (error) return handleError(error, `Fetch Snapshot ${advisorId}`);
        return { data, error: null };
    };

    APP.DataService = DataService;
}(window.APP));

/**
 * MODULE: APP.StateManager
 */
(function(APP) {
    const StateManager = {};
    const STATE = {
        advisors: [], leaders: [], scheduleComponents: [], shiftDefinitions: [], 
        rotationPatterns: [], rotationAssignments: [], scheduleExceptions: [],
        selectedAdvisors: new Set(), weekStart: null, currentRotation: null,
        selectedDay: 'Monday', scheduleViewMode: 'daily', isBooted: false,
        history: [], historyIndex: -1, effectiveAssignmentsCache: new Map(), 
    };

    StateManager.getState = () => STATE;

    StateManager.initialize = (initialData) => {
        Object.assign(STATE, initialData);
        STATE.isBooted = true;
        StateManager.saveHistory("Initial Load");
    };

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
        if (!dateISO) return;
        if (STATE.effectiveAssignmentsCache.has(dateISO)) return;
        const { data, error } = await APP.DataService.fetchEffectiveAssignmentsForDate(dateISO);
        if (!error && data) STATE.effectiveAssignmentsCache.set(dateISO, data);
        else STATE.effectiveAssignmentsCache.set(dateISO, new Map());
    };

    StateManager.clearEffectiveAssignmentsCache = () => { STATE.effectiveAssignmentsCache.clear(); };

    StateManager.saveHistory = (reason = "Change") => {
        if (STATE.historyIndex < STATE.history.length - 1) STATE.history = STATE.history.slice(0, STATE.historyIndex + 1);
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
        if (APP.Core && APP.Core.updateUndoRedoButtons) APP.Core.updateUndoRedoButtons(STATE.historyIndex, STATE.history.length);
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
        if (tableName === 'rotation_assignments_history' || tableName === 'rotation_patterns') StateManager.clearEffectiveAssignmentsCache();
        if (!collection) return;

        let primaryKey = 'id';
        if (tableName === 'rotation_patterns') primaryKey = 'name';
        if (tableName === 'rotation_assignments') primaryKey = 'advisor_id';
        if (tableName === 'schedule_exceptions') primaryKey = 'id';

        if (!record || !record.hasOwnProperty(primaryKey)) {
             if (isDeleted && record && record.hasOwnProperty(primaryKey)) {} else return;
        }
        
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

        const exception = APP.StateManager.getExceptionForAdvisorDate(advisorId, dateISO);
        if (exception && exception.structure) {
            if (exception.structure.length === 0) return { segments: [], source: 'exception', reason: exception.reason };
            const sortedSegments = JSON.parse(JSON.stringify(exception.structure)).sort((a, b) => a.start_min - b.start_min);
            return { segments: sortedSegments, source: 'exception', reason: exception.reason };
        }

        const effectiveMap = STATE.effectiveAssignmentsCache.get(effectiveWeekStart);
        let assignment = null;
        if (effectiveMap && effectiveMap.has(advisorId)) assignment = effectiveMap.get(advisorId);
        
        if (!assignment || !assignment.rotation_name || !assignment.start_date) return { segments: [], source: 'rotation', reason: null };

        const effectiveWeek = APP.Utils.getEffectiveWeek(assignment.start_date, effectiveWeekStart, assignment, APP.StateManager.getPatternByName);
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
 */
(function(APP) {
    const ComponentManager = {};
    const ELS = {};

    ComponentManager.initialize = () => {
        ELS.grid = document.getElementById('componentManagerGrid');
        ELS.btnNew = document.getElementById('btnNewComponent');
        if (ELS.btnNew) ELS.btnNew.addEventListener('click', handleNew);
        if (ELS.grid) ELS.grid.addEventListener('click', handleClick);
        
        // Cache new modal elements
        ELS.compEditModal = document.getElementById('componentEditorModal');
        ELS.compEditForm = document.getElementById('comp-edit-form');
        ELS.compEditTitle = document.getElementById('comp-edit-title');
        ELS.compEditId = document.getElementById('comp-edit-id');
        ELS.compEditName = document.getElementById('comp-edit-name');
        ELS.compEditType = document.getElementById('comp-edit-type');
        ELS.compEditDuration = document.getElementById('comp-edit-duration');
        ELS.compEditColor = document.getElementById('comp-edit-color');
        ELS.compEditPaid = document.getElementById('comp-edit-paid');
        ELS.btnCompEditSave = document.getElementById('compEditSave');
        ELS.btnCompEditCancel = document.getElementById('compEditCancel');
        ELS.btnCompEditClose = document.getElementById('compEditClose');

        // Wire up new modal buttons
        if (ELS.btnCompEditSave) ELS.btnCompEditSave.addEventListener('click', handleSaveComponent);
        if (ELS.btnCompEditCancel) ELS.btnCompEditCancel.addEventListener('click', handleCloseComponentModal);
        if (ELS.btnCompEditClose) ELS.btnCompEditClose.addEventListener('click', handleCloseComponentModal);
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
                <td class="actions">
                    <button class="btn btn-sm btn-primary edit-component" data-component-id="${comp.id}">Edit</button>
                    <button class="btn btn-sm btn-danger delete-component" data-component-id="${comp.id}">Delete</button>
                </td>
            </tr>`;
        });
        html += '</tbody></table>';
        ELS.grid.innerHTML = html;
    };

    const handleNew = async () => {
        ELS.compEditTitle.textContent = "New Component";
        ELS.compEditId.value = "";
        ELS.compEditForm.reset();
        if(ELS.compEditModal) ELS.compEditModal.style.display = 'flex';
    };

    const handleClick = (e) => {
        if (e.target.classList.contains('delete-component')) {
            handleDelete(e.target.dataset.componentId);
        } else if (e.target.classList.contains('edit-component')) {
            handleEdit(e.target.dataset.componentId);
        }
    };

    const handleEdit = (id) => {
        const component = APP.StateManager.getComponentById(id);
        if (!component) return;
        ELS.compEditTitle.textContent = "Edit Component";
        ELS.compEditId.value = component.id;
        ELS.compEditName.value = component.name;
        ELS.compEditType.value = component.type;
        ELS.compEditDuration.value = component.default_duration_min;
        ELS.compEditColor.value = component.color;
        ELS.compEditPaid.checked = component.is_paid;
        ELS.compEditModal.style.display = 'flex';
    };

    const handleCloseComponentModal = () => {
        if (ELS.compEditModal) ELS.compEditModal.style.display = 'none';
    };

    const handleSaveComponent = async () => {
        const id = ELS.compEditId.value;
        const name = ELS.compEditName.value;
        const type = ELS.compEditType.value;
        const duration = parseInt(ELS.compEditDuration.value, 10);
        const color = ELS.compEditColor.value;
        const isPaid = ELS.compEditPaid.checked;

        if (!name || !type || !color || isNaN(duration)) {
            APP.Utils.showToast("Invalid input provided.", "danger");
            return;
        }

        const componentData = { name, type, color, default_duration_min: duration, is_paid: isPaid };
        let result;
        if (id) {
             result = await APP.DataService.updateRecord('schedule_components', componentData, { id: id });
        } else {
             result = await APP.DataService.saveRecord('schedule_components', componentData);
        }
        
        if (!result.error) {
            APP.StateManager.syncRecord('schedule_components', result.data);
            APP.Utils.showToast(`Component '${name}' saved.`, "success");
            ComponentManager.render(); 
            handleCloseComponentModal(); 
        }
    };

    const handleDelete = async (id) => {
        const component = APP.StateManager.getComponentById(id);
        if (!component || !confirm(`Are you sure you want to delete '${component.name}'?`)) return;
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
 */
(function(APP) {
    const AssignmentManager = {};
    const ELS = {};

    AssignmentManager.initialize = () => {
        ELS.grid = document.getElementById('assignmentGrid');
        // FIX: Use event delegation for robust button handling
        if (ELS.grid) {
            ELS.grid.addEventListener('click', handleGridClick);
        }
    };

    const handleGridClick = (e) => {
        const target = e.target.closest('button');
        if (!target || !target.dataset.advisorId) return;
        const advisorId = target.dataset.advisorId;
        if (target.classList.contains('act-assign-week')) {
            handleRowAction('assign_from_week', advisorId);
        } else if (target.classList.contains('act-change-forward')) {
            handleRowAction('assign_from_week', advisorId);
        } else if (target.classList.contains('act-change-week')) {
            handleRowAction('change_one_week', advisorId);
        }
    };

    AssignmentManager.render = async () => {
        if (!ELS.grid) return;
        const STATE = APP.StateManager.getState();
        const advisors = STATE.advisors.sort((a,b) => a.name.localeCompare(b.name));
        const patterns = STATE.rotationPatterns.sort((a,b) => a.name.localeCompare(b.name));
        const patternOpts = patterns.map(p => `<option value="${p.name}">${p.name}</option>`).join('');
        const weekStartISO = STATE.weekStart;

        if (weekStartISO) await APP.StateManager.loadEffectiveAssignments(weekStartISO);
        const effectiveMap = STATE.effectiveAssignmentsCache.get(weekStartISO);

        // DOM Preservation Logic
        const existingTbody = ELS.grid.querySelector('tbody');
        if (existingTbody) {
            const existingRows = existingTbody.querySelectorAll('tr');
            const advisorsMatch = existingRows.length === advisors.length && advisors.every((adv, index) => adv.id === existingRows[index].dataset.advisorId);
            if (advisorsMatch) {
                advisors.forEach((adv, index) => {
                    const row = existingRows[index];
                    const effective = (effectiveMap && effectiveMap.get(adv.id)) ? effectiveMap.get(adv.id) : null;
                    const assignment = effective ? { rotation_name: effective.rotation_name } : null;
                    const rotSelect = row.querySelector('.assign-rotation');
                    if (rotSelect) {
                        if (rotSelect.options.length <= 1) rotSelect.innerHTML = `<option value="">-- None --</option>${patternOpts}`;
                        rotSelect.value = (assignment && assignment.rotation_name) ? assignment.rotation_name : '';
                    }
                });
                return;
            }
        }

        let html = '<table><thead><tr><th>Advisor</th><th>Assigned Rotation (This Week)</th><th>Start Date (Week 1)</th><th>Actions</th></tr></thead><tbody>';
        advisors.forEach(adv => {
            const effective = (effectiveMap && effectiveMap.get(adv.id)) ? effectiveMap.get(adv.id) : null;
            const assignment = effective ? { advisor_id: adv.id, rotation_name: effective.rotation_name, start_date: effective.start_date } : null; 
            const startDate = (assignment && assignment.start_date) ? assignment.start_date : '';

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
        ELS.grid.innerHTML = html;

        advisors.forEach(adv => {
            const row = ELS.grid.querySelector(`tr[data-advisor-id="${adv.id}"]`);
            if (!row) return;
            const effective = (effectiveMap && effectiveMap.get(adv.id)) ? effectiveMap.get(adv.id) : null;
            const assignment = effective ? { rotation_name: effective.rotation_name, start_date: effective.start_date } : null;
            const rotSelect = row.querySelector('.assign-rotation');
            if (rotSelect) rotSelect.value = (assignment && assignment.rotation_name) ? assignment.rotation_name : '';
            const dateInput = row.querySelector('.assign-start-date');
            if (dateInput && typeof flatpickr !== 'undefined') {
                flatpickr(dateInput, {
                  dateFormat: 'Y-m-d', altInput: true, altFormat: 'd/m/Y', allowInput: true, locale: { "firstDayOfWeek": 1 }, 
                  onChange: function(selectedDates, dateStr, instance) {}
                });
            }
        });
    };

    const handleRowAction = async (action, advisorId) => {
      try {
        const row = ELS.grid.querySelector(`tr[data-advisor-id="${advisorId}"]`);
        if (!row) return APP.Utils.showToast('Row not found', 'danger');
        const rotationSel = row.querySelector('.assign-rotation');
        const dateInput   = row.querySelector('.assign-start-date');
        const globalWeekStartISO = APP.StateManager.getState().weekStart;
        const rotationName = rotationSel ? rotationSel.value : '';

        if (!rotationName && action === 'change_one_week') return APP.Utils.showToast('Pick a rotation first for the swap.', 'warning');

        let startISO = globalWeekStartISO;
        if (action === 'assign_from_week') {
            let rawInput = '';
            if (dateInput) rawInput = dateInput.value.trim();
            if (!rawInput) return APP.Utils.showToast('Start date is required for this action.', 'danger');
            
            if (rawInput.includes('/')) {
                const iso = APP.Utils.convertUKToISODate(rawInput);
                if (!iso) return APP.Utils.showToast('Invalid date format (dd/mm/yyyy expected).', 'danger');
                startISO = iso;
            } else {
                startISO = rawInput;
            }
        }

        if (!/^\d{4}-\d{2}-\d{2}$/.test(startISO)) {
          const recoveredISO = APP.Utils.getMondayForDate(startISO);
          if (!recoveredISO) return APP.Utils.showToast('Start date looks invalid (YYYY-MM-DD or DD/MM/YYYY expected).', 'danger');
          startISO = recoveredISO;
        }

        let res;
        if (action === 'assign_from_week') {
          res = await APP.DataService.assignFromWeek({ advisor_id: advisorId, rotation_name: rotationName, start_date: startISO });
        } else if (action === 'change_one_week') {
          const weekStart = APP.Utils.getMondayForDate(startISO);
          if (!weekStart) return APP.Utils.showToast('Invalid week start date for swap.', 'danger');
          res = await APP.DataService.changeOnlyWeek({ advisor_id: advisorId, rotation_name: rotationName, week_start: weekStart, week_end: APP.Utils.addDaysISO(weekStart, 6) });
        } else {
          return APP.Utils.showToast('Unknown action.', 'danger');
        }

        if (res?.error) return;

        APP.StateManager.clearEffectiveAssignmentsCache();
        const { data: updatedSnapshot, error: snapshotError } = await APP.DataService.fetchSnapshotForAdvisor(advisorId);
        if (updatedSnapshot) APP.StateManager.syncRecord('rotation_assignments', updatedSnapshot);
        else APP.StateManager.syncRecord('rotation_assignments', { advisor_id: advisorId }, true);

        APP.StateManager.saveHistory(`Assignment Action: ${action}`);
        if (APP.Core) APP.Core.renderAll();
        else if (APP.Components.ScheduleViewer) APP.Components.ScheduleViewer.render();
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
 * MODULE: APP.Components.SequentialBuilder (v16.3 - TYPO FIX)
 * Supports Shift Definitions (legacy) and Visual Exceptions (Live Editing).
 * INCLUDES: Time Ruler, Smart Tooltips, Drag-Drop, Ripple-Pay fix.
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
        segments: [], 
        reason: null,
        dragState: { isDragging: false, segmentIndex: -1, startX: 0, originalDurations: [], minDuration: 5 },
        addPopupState: { isOpen: false, componentId: null, componentName: null, isEditing: false, editIndex: -1 },
        visualHistory: [], visualHistoryIndex: -1, contextMenuIndex: -1
    };

    const parseTimeToMinutes = (timeStr) => {
        const parts = (timeStr || "").split(':');
        if (parts.length !== 2) return null;
        const h = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        if (isNaN(h) || isNaN(m)) return null;
        return h * 60 + m;
    };

    SequentialBuilder.initialize = () => {
        ELS.modal = document.getElementById('shiftBuilderModal');
        ELS.modalTitle = document.getElementById('modalTitle');
        ELS.modalClose = document.getElementById('modalClose');
        ELS.modalSave = document.getElementById('modalSaveStructure');
        ELS.modalTotalTime = document.getElementById('modalTotalTime');
        ELS.modalPaidTime = document.getElementById('modalPaidTime');
        
        ELS.exceptionReasonGroup = document.getElementById('exceptionReasonGroup');
        ELS.modalExceptionReason = document.getElementById('modalExceptionReason');

        ELS.visualEditorBody = document.getElementById('visualEditorBody');
        ELS.visualEditorToolbox = document.getElementById('visualEditorToolbox');
        ELS.visualEditorTimeline = document.getElementById('visualEditorTimeline');
        ELS.visualEditorTimeRuler = document.getElementById('visualEditorTimeRuler');
        ELS.visualEditorDropCursor = document.getElementById('visualEditorDropCursor');
        ELS.visualEditorContextMenu = document.getElementById('visualEditorContextMenu');
        ELS.veUndo = document.getElementById('ve-undo');
        ELS.veRedo = document.getElementById('ve-redo');
        
        ELS.visualEditorAddPopup = document.getElementById('visualEditorAddPopup');
        ELS.veAddPopupTitle = document.getElementById('ve-add-popup-title');
        ELS.veAddStartTime = document.getElementById('ve-add-start-time');
        ELS.veAddDuration = document.getElementById('ve-add-duration');
        ELS.veAddPopupCancel = document.getElementById('ve-add-popup-cancel');
        ELS.veAddPopupSave = document.getElementById('ve-add-popup-save');

        ELS.modalStartTime = document.getElementById('modalStartTime');
        ELS.modalAddActivity = document.getElementById('modalAddActivity');
        ELS.modalSequenceBody = document.getElementById('modalSequenceBody');

        if (ELS.modalClose) ELS.modalClose.addEventListener('click', SequentialBuilder.close);
        if (ELS.modalSave) ELS.modalSave.addEventListener('click', handleSave);

        if (ELS.modalExceptionReason) {
            ELS.modalExceptionReason.addEventListener('input', (e) => { BUILDER_STATE.reason = e.target.value; });
        }
        
        if (ELS.visualEditorToolbox) {
            ELS.visualEditorToolbox.addEventListener('click', handleToolboxClick); 
            ELS.visualEditorToolbox.addEventListener('dragstart', handleToolboxDragStart); 
            ELS.visualEditorToolbox.addEventListener('dragend', handleToolboxDragEnd); 
        }
        if (ELS.visualEditorTimeline) {
            ELS.visualEditorTimeline.addEventListener('mousedown', handleDragStart); 
            ELS.visualEditorTimeline.addEventListener('dragenter', handleTimelineDragEnter); 
            ELS.visualEditorTimeline.addEventListener('dragover', handleTimelineDragOver); 
            ELS.visualEditorTimeline.addEventListener('dragleave', handleTimelineDragLeave); 
            ELS.visualEditorTimeline.addEventListener('drop', handleTimelineDrop); 
            ELS.visualEditorTimeline.addEventListener('contextmenu', handleTimelineContextMenu); 
        }
        if (ELS.veAddPopupCancel) ELS.veAddPopupCancel.addEventListener('click', closeAddPopup);
        if (ELS.veAddPopupSave) ELS.veAddPopupSave.addEventListener('click', handleAddPopupSave);

        document.addEventListener('mousemove', handleDragMove);
        document.addEventListener('mouseup', handleDragEnd);
        document.addEventListener('click', closeContextMenu); 
        if (ELS.visualEditorContextMenu) ELS.visualEditorContextMenu.addEventListener('click', handleContextMenuClick); 
        if (ELS.veUndo) ELS.veUndo.addEventListener('click', handleUndo); 
        if (ELS.veRedo) ELS.veRedo.addEventListener('click', handleRedo); 
    };

    SequentialBuilder.open = (config) => {
        const sequentialSegments = [];
        let startTimeMin = 480; 

        if (config.structure && config.structure.length > 0) {
            const sortedStructure = JSON.parse(JSON.stringify(config.structure)).sort((a, b) => a.start_min - b.start_min);
            startTimeMin = sortedStructure[0].start_min;
            sortedStructure.forEach(seg => {
                sequentialSegments.push({ component_id: seg.component_id, duration_min: seg.end_min - seg.start_min });
            });
        }

        BUILDER_STATE.isOpen = true;
        BUILDER_STATE.mode = config.mode;
        BUILDER_STATE.contextId = config.id;
        BUILDER_STATE.exceptionDate = config.date || null;
        BUILDER_STATE.startTimeMin = startTimeMin;
        BUILDER_STATE.segments = JSON.parse(JSON.stringify(sequentialSegments));
        BUILDER_STATE.reason = config.reason || null;
        BUILDER_STATE.visualHistory = [];
        BUILDER_STATE.visualHistoryIndex = -1;

        ELS.modalTitle.textContent = config.title;

        if (config.mode === 'exception') {
            if (ELS.visualEditorBody) ELS.visualEditorBody.style.display = 'block';
            if (ELS.modalSequenceBody) ELS.visualEditorBody.closest('.modal-body').style.display = 'block'; 
            if (ELS.modalSequenceBody) ELS.modalSequenceBody.closest('.modal-body').style.display = 'none'; 

            ELS.exceptionReasonGroup.style.display = 'none'; // Handled by new footer layout
            if (ELS.modalExceptionReason) ELS.modalExceptionReason.value = BUILDER_STATE.reason || '';
            ELS.modalSave.textContent = "Save Exception";
            
            renderToolbox();
            renderTimeline();
            
        } else {
            if (ELS.visualEditorBody) ELS.visualEditorBody.style.display = 'none';
            if (ELS.modalSequenceBody) ELS.visualEditorBody.closest('.modal-body').style.display = 'none'; 
            if (ELS.modalSequenceBody) ELS.modalSequenceBody.closest('.modal-body').style.display = 'block'; 

            ELS.exceptionReasonGroup.style.display = 'none';
            ELS.modalSave.textContent = "Save Definition";

            if (ELS.modalStartTime && ELS.modalStartTime._flatpickr) {
                ELS.modalStartTime._flatpickr.setDate(APP.Utils.formatMinutesToTime(startTimeMin), false);
            }
            if (ELS.modalSequenceBody) {
                ELS.modalSequenceBody.addEventListener('change', handleLegacySequenceChange);
                ELS.modalSequenceBody.addEventListener('click', handleLegacySequenceClick);
            }
            if (ELS.modalAddActivity) {
                ELS.modalAddActivity.addEventListener('click', handleLegacyAddActivity);
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
        if (ELS.modalSequenceBody) {
            ELS.modalSequenceBody.removeEventListener('change', handleLegacySequenceChange);
            ELS.modalSequenceBody.removeEventListener('click', handleLegacySequenceClick);
        }
    };

    const renderToolbox = () => {
        const STATE = APP.StateManager.getState();
        const components = STATE.scheduleComponents.sort((a, b) => a.name.localeCompare(b.name));
        ELS.visualEditorToolbox.innerHTML = components.map(comp => `
            <div class="ve-toolbox-item" draggable="true" data-component-id="${comp.id}" data-component-name="${comp.name}">
                <div class="ve-toolbox-color" style="background-color: ${comp.color};"></div>
                ${comp.name}
            </div>
        `).join('');
    };

    const renderTimeline = () => {
        renderTimeRuler(); 
        const totalDuration = BUILDER_STATE.segments.reduce((total, seg) => total + seg.duration_min, 0);
        if (totalDuration === 0) {
            ELS.visualEditorTimeline.innerHTML = '<div style="padding: 16px; color: #6B7280;">No activities in this shift (RDO).</div>';
            renderSummary();
            return;
        }

        ELS.visualEditorTimeline.innerHTML = BUILDER_STATE.segments.map((seg, index) => {
            const component = APP.StateManager.getComponentById(seg.component_id);
            if (!component) return '';
            const widthPct = (seg.duration_min / totalDuration) * 100;
            let currentTime = BUILDER_STATE.startTimeMin;
            for (let i = 0; i < index; i++) {
                currentTime += BUILDER_STATE.segments[i].duration_min;
            }
            const startTime = currentTime;
            const endTime = currentTime + seg.duration_min;
            const tooltip = `${component.name}\nTime: ${APP.Utils.formatMinutesToTime(startTime)} - ${APP.Utils.formatMinutesToTime(endTime)}\nDuration: ${seg.duration_min}m`;

            return `
                <div class="ve-segment" style="width: ${widthPct}%; background-color: ${component.color};" data-index="${index}" title="${tooltip}">
                    <div class="ve-drag-handle" data-handle-index="${index}"></div>
                </div>
            `;
        }).join('');
        renderSummary(); 
    };
    
    const renderTimeRuler = () => {
        if (!ELS.visualEditorTimeRuler) return;
        const { startTimeMin } = BUILDER_STATE;
        const totalDuration = BUILDER_STATE.segments.reduce((total, seg) => total + seg.duration_min, 0);
        
        if (totalDuration === 0) {
            ELS.visualEditorTimeRuler.innerHTML = ''; 
            return;
        }
        let html = '';
        const endTime = startTimeMin + totalDuration;
        let firstHourMarker = Math.ceil(startTimeMin / 60) * 60;

        for (let time = firstHourMarker; time < endTime; time += 60) {
            const pct = ((time - startTimeMin) / totalDuration) * 100;
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
        ELS.modalTotalTime.textContent = APP.Utils.formatDuration(totalDuration);
        ELS.modalPaidTime.textContent = APP.Utils.formatDuration(paidDuration);
    };

    const handleToolboxClick = (e) => {
        const item = e.target.closest('.ve-toolbox-item');
        if (!item) return;
        const { componentId, componentName } = item.dataset;
        BUILDER_STATE.addPopupState = { isOpen: true, componentId, componentName, isEditing: false, editIndex: -1 };
        ELS.veAddPopupTitle.textContent = `Add: ${componentName}`;
        ELS.veAddStartTime.value = '';
        ELS.veAddDuration.value = '30';
        ELS.visualEditorAddPopup.style.display = 'block';
        ELS.veAddStartTime.focus();
    };

    const closeAddPopup = () => {
        BUILDER_STATE.addPopupState.isOpen = false;
        ELS.visualEditorAddPopup.style.display = 'none';
    };

    const handleAddComponent = (componentId, startTime, durationToAdd) => {
        const MIN_SEGMENT_DUR = 5; 
        if (startTime === null) { APP.Utils.showToast("Invalid start time. Use HH:MM format.", "danger"); return false; }
        if (isNaN(durationToAdd) || durationToAdd < MIN_SEGMENT_DUR) { APP.Utils.showToast(`Invalid duration. Must be at least ${MIN_SEGMENT_DUR} minutes.`, "danger"); return false; }

        const relativeStartTime = startTime - BUILDER_STATE.startTimeMin;
        const totalShiftDuration = BUILDER_STATE.segments.reduce((total, seg) => total + seg.duration_min, 0);

        if (relativeStartTime < 0 || relativeStartTime >= totalShiftDuration) {
            APP.Utils.showToast("Start time is outside the shift boundaries.", "danger");
            return false;
        }

        let timeElapsed = 0;
        let inserted = false;
        const newSegments = [];

        for (const seg of BUILDER_STATE.segments) {
            const segStart = timeElapsed;
            const segEnd = timeElapsed + seg.duration_min;

            if (!inserted && relativeStartTime >= segStart && relativeStartTime < segEnd) {
                inserted = true;
                const timeIntoSegment = relativeStartTime - segStart;
                if (timeIntoSegment >= MIN_SEGMENT_DUR) newSegments.push({ component_id: seg.component_id, duration_min: timeIntoSegment });
                newSegments.push({ component_id: componentId, duration_min: durationToAdd });
                const remainingDurationInSegment = seg.duration_min - timeIntoSegment;
                if (remainingDurationInSegment >= MIN_SEGMENT_DUR) newSegments.push({ component_id: seg.component_id, duration_min: remainingDurationInSegment });
            } else {
                newSegments.push(seg);
            }
            timeElapsed += seg.duration_min;
        }

        let debt = durationToAdd;
        for (let i = newSegments.length - 1; i >= 0; i--) {
            if (debt <= 0) break; 
            if (newSegments[i].component_id === componentId && newSegments[i].duration_min === durationToAdd) continue; 
            const availableToPay = Math.max(0, newSegments[i].duration_min - MIN_SEGMENT_DUR);
            const payment = Math.min(debt, availableToPay);
            newSegments[i].duration_min -= payment;
            debt -= payment;
        }

        BUILDER_STATE.segments = newSegments.filter(s => s.duration_min >= MIN_SEGMENT_DUR);
        if (debt > 0) {
             APP.Utils.showToast("Warning: Activity was too long and was trimmed to fit.", "warning");
             const newSeg = BUILDER_STATE.segments.find(s => s.component_id === componentId && s.duration_min === durationToAdd);
             if (newSeg) {
                 newSeg.duration_min -= debt;
                 BUILDER_STATE.segments = BUILDER_STATE.segments.filter(s => s.duration_min >= MIN_SEGMENT_DUR);
             }
        }
        renderTimeline();
        saveVisualHistory(); 
        return true; 
    };

    const handleAddPopupSave = () => {
        const { componentId, isEditing, editIndex } = BUILDER_STATE.addPopupState;
        const startTime = parseTimeToMinutes(ELS.veAddStartTime.value);
        const durationToAdd = parseInt(ELS.veAddDuration.value, 10);
        
        if (isEditing) {
            const deletedDuration = BUILDER_STATE.segments[editIndex].duration_min;
            BUILDER_STATE.segments.splice(editIndex, 1);
            const paybackIndex = (editIndex > 0) ? editIndex - 1 : 0;
            if (BUILDER_STATE.segments[paybackIndex]) BUILDER_STATE.segments[paybackIndex].duration_min += deletedDuration;
            const success = handleAddComponent(componentId, startTime, durationToAdd);
            if (success) closeAddPopup();
            else renderTimeline(); 
        } else {
            const success = handleAddComponent(componentId, startTime, durationToAdd);
            if (success) closeAddPopup();
        }
    };

    const handleDragStart = (e) => {
        const handle = e.target.closest('.ve-drag-handle');
        if (!handle) return;
        e.preventDefault(); 
        const segmentIndex = parseInt(handle.dataset.handleIndex, 10);
        BUILDER_STATE.dragState = {
            isDragging: true,
            segmentIndex: segmentIndex,
            startX: e.clientX,
            originalDurations: [
                BUILDER_STATE.segments[segmentIndex].duration_min,
                BUILDER_STATE.segments[segmentIndex + 1].duration_min
            ],
            minDuration: 5
        };
    };

    const handleDragMove = (e) => {
        if (!BUILDER_STATE.dragState.isDragging) return;
        const { segmentIndex, startX, originalDurations, minDuration } = BUILDER_STATE.dragState;
        const totalDuration = originalDurations[0] + originalDurations[1];
        const deltaX = e.clientX - startX;
        const deltaMinutes = Math.round(deltaX / 2); 
        let newDurationA = originalDurations[0] + deltaMinutes;
        let newDurationB = originalDurations[1] - deltaMinutes;

        if (newDurationA < minDuration) {
            newDurationA = minDuration;
            newDurationB = totalDuration - minDuration;
        } else if (newDurationB < minDuration) {
            newDurationB = minDuration;
            newDurationA = totalDuration - minDuration;
        }
        BUILDER_STATE.segments[segmentIndex].duration_min = newDurationA;
        BUILDER_STATE.segments[segmentIndex + 1].duration_min = newDurationB;
        renderTimeline();
    };

    const handleDragEnd = () => {
        if (BUILDER_STATE.dragState.isDragging) {
            BUILDER_STATE.dragState.isDragging = false;
            saveVisualHistory(); 
        }
    };

    const handleToolboxDragStart = (e) => {
        const item = e.target.closest('.ve-toolbox-item');
        if (!item) { e.preventDefault(); return; }
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData('text/plain', item.dataset.componentId);
        setTimeout(() => { item.classList.add('is-dragging'); }, 0);
    };

    const handleToolboxDragEnd = (e) => {
        const item = e.target.closest('.ve-toolbox-item.is-dragging'); 
        if (item) item.classList.remove('is-dragging');
    };

    const handleTimelineDragEnter = (e) => {
        e.preventDefault();
        if (ELS.visualEditorDropCursor) ELS.visualEditorDropCursor.style.display = 'block';
    };

    const handleTimelineDragLeave = (e) => {
        if (ELS.visualEditorDropCursor) ELS.visualEditorDropCursor.style.display = 'none';
    };

    const handleTimelineDragOver = (e) => {
        e.preventDefault(); 
        if (!ELS.visualEditorTimeline) return;
        const rect = ELS.visualEditorTimeline.getBoundingClientRect();
        const x = e.clientX - rect.left; 
        const width = ELS.visualEditorTimeline.clientWidth;
        const pct = Math.max(0, Math.min(1, x / width)); 
        const totalDuration = BUILDER_STATE.segments.reduce((total, seg) => total + seg.duration_min, 0);
        const relativeTime = Math.round(pct * totalDuration);
        const absoluteTime = BUILDER_STATE.startTimeMin + relativeTime;
        if (ELS.visualEditorDropCursor) {
            ELS.visualEditorDropCursor.style.left = `${pct * 100}%`;
            ELS.visualEditorDropCursor.title = `Drop at: ${APP.Utils.formatMinutesToTime(absoluteTime)}`;
        }
    };

    const handleTimelineDrop = (e) => {
        e.preventDefault();
        if (ELS.visualEditorDropCursor) ELS.visualEditorDropCursor.style.display = 'none'; 
        const componentId = e.dataTransfer.getData('text/plain');
        const component = APP.StateManager.getComponentById(componentId);
        if (!component) return;
        const rect = ELS.visualEditorTimeline.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const width = ELS.visualEditorTimeline.clientWidth;
        const pct = Math.max(0, Math.min(1, x / width));
        const totalDuration = BUILDER_STATE.segments.reduce((total, seg) => total + seg.duration_min, 0);
        const relativeTime = Math.round(pct * totalDuration);
        const absoluteTime = BUILDER_STATE.startTimeMin + relativeTime;
        handleAddComponent(componentId, absoluteTime, component.default_duration_min);
    };
    
    const handleTimelineContextMenu = (e) => {
        e.preventDefault(); 
        closeContextMenu(); 
        const segment = e.target.closest('.ve-segment');
        if (!segment) return; 
        const index = parseInt(segment.dataset.index, 10);
        if (isNaN(index)) return;
        BUILDER_STATE.contextMenuIndex = index; 
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
        if (isNaN(index) || !BUILDER_STATE.segments[index]) return;
        const segment = BUILDER_STATE.segments[index];
        const MIN_SEGMENT_DUR = 5;

        if (action === 'delete') {
            const deletedDuration = segment.duration_min;
            BUILDER_STATE.segments.splice(index, 1);
            const paybackIndex = (index > 0) ? index - 1 : 0;
            if (BUILDER_STATE.segments[paybackIndex]) BUILDER_STATE.segments[paybackIndex].duration_min += deletedDuration;
        }
        else if (action === 'split') {
            if (segment.duration_min < (MIN_SEGMENT_DUR * 2)) { APP.Utils.showToast("Segment is too short to split.", "warning"); return; }
            const dur1 = Math.floor(segment.duration_min / 2);
            const dur2 = segment.duration_min - dur1;
            segment.duration_min = dur1;
            BUILDER_STATE.segments.splice(index + 1, 0, { component_id: segment.component_id, duration_min: dur2 });
        }
        else if (action === 'edit') {
            const component = APP.StateManager.getComponentById(segment.component_id);
            BUILDER_STATE.addPopupState = { isOpen: true, componentId: segment.component_id, componentName: component.name, isEditing: true, editIndex: index };
            let startTime = BUILDER_STATE.startTimeMin;
            for(let i = 0; i < index; i++) startTime += BUILDER_STATE.segments[i].duration_min;
            ELS.veAddPopupTitle.textContent = `Edit: ${component.name}`;
            ELS.veAddStartTime.value = APP.Utils.formatMinutesToTime(startTime);
            ELS.veAddDuration.value = segment.duration_min;
            ELS.visualEditorAddPopup.style.display = 'block';
            ELS.veAddStartTime.focus();
        }
        renderTimeline();
        saveVisualHistory(); 
        closeContextMenu();
    };

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
            const segments = JSON.parse(JSON.stringify(BUILDER_STATE.visualHistory[BUILDER_STATE.visualHistoryIndex]));
            BUILDER_STATE.segments = segments;
            renderTimeline(); 
            updateUndoRedoButtons();
        }
    };

    const handleRedo = () => {
        if (BUILDER_STATE.visualHistoryIndex < BUILDER_STATE.visualHistory.length - 1) {
            BUILDER_STATE.visualHistoryIndex++;
            const segments = JSON.parse(JSON.stringify(BUILDER_STATE.visualHistory[BUILDER_STATE.visualHistoryIndex]));
            BUILDER_STATE.segments = segments;
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

        if (segments.length === 0) {
             if (mode === 'exception') {
                if (!confirm("This will clear the schedule for the selected day (RDO/Absence). Proceed?")) return;
             }
        }

        for (const seg of segments) {
            if (!seg.component_id) { APP.Utils.showToast("Error: All activities must have a component selected.", "danger"); return; }
            const start = currentTime;
            const end = currentTime + seg.duration_min;
            absoluteTimeSegments.push({ component_id: seg.component_id, start_min: start, end_min: end });
            currentTime = end;
        }

        let result;
        if (mode === 'definition') result = await saveShiftDefinition(contextId, absoluteTimeSegments);
        else if (mode === 'exception') result = await saveScheduleException(contextId, exceptionDate, absoluteTimeSegments, reason);

        if (result && !result.error) {
            SequentialBuilder.close();
            if (APP.Components.ScheduleViewer) APP.Components.ScheduleViewer.render();
        }
    };

    const saveShiftDefinition = async (definitionId, structure) => {
        const { data, error } = await APP.DataService.updateRecord('shift_definitions', { structure: structure }, { id: definitionId });
        if (!error) {
            APP.StateManager.syncRecord('shift_definitions', data);
            APP.StateManager.saveHistory("Update Shift Structure");
            APP.Utils.showToast("Shift definition saved successfully.", "success");
            if (APP.Components.ShiftDefinitionEditor) APP.Components.ShiftDefinitionEditor.render();
        }
        return { data, error };
    };

    const saveScheduleException = async (advisorId, dateISO, structure, reason) => {
        const record = { advisor_id: advisorId, exception_date: dateISO, structure: structure, reason: reason || null };
        const { data, error } = await APP.DataService.saveRecord('schedule_exceptions', record, 'advisor_id, exception_date');
        if (!error) {
            APP.StateManager.syncRecord('schedule_exceptions', data);
            APP.StateManager.saveHistory("Save Schedule Exception");
            APP.Utils.showToast("Schedule exception saved successfully.", "success");
        }
        return { data, error };
    };

    const renderLegacyTable = () => {
        if (!ELS.modalSequenceBody) return;
        const STATE = APP.StateManager.getState();
        if (!STATE || !STATE.scheduleComponents) return;
        const components = STATE.scheduleComponents.sort((a,b) => a.name.localeCompare(b.name));
        const componentOpts = components.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
        let html = '';
        let currentTime = BUILDER_STATE.startTimeMin;

        BUILDER_STATE.segments.forEach((seg, index) => {
            const duration = seg.duration_min;
            const endTime = currentTime + duration;
            html += `<tr data-index="${index}">
                <td>${APP.Utils.formatMinutesToTime(currentTime)}</td>
                <td>${APP.Utils.formatMinutesToTime(endTime)}</td>
                <td><select class="form-select legacy-component-select" data-index="${index}">${componentOpts}</select></td>
                <td><input type="number" class="form-input legacy-duration-input" value="${duration}" data-index="${index}" min="5" step="5" style="width: 70px;"></td>
                <td class="actions"><button class="btn btn-sm btn-secondary legacy-insert" data-index="${index}">Ins</button>
                <button class="btn btn-sm btn-warning legacy-split" data-index="${index}">Split</button>
                <button class="btn btn-sm btn-danger legacy-delete" data-index="${index}">Del</button></td>
            </tr>`;
            currentTime = endTime;
        });
        ELS.modalSequenceBody.innerHTML = html;
        BUILDER_STATE.segments.forEach((seg, index) => {
            const select = ELS.modalSequenceBody.querySelector(`.legacy-component-select[data-index="${index}"]`);
            if (select) select.value = seg.component_id;
        });
        renderSummary();
    };

    const handleLegacyAddActivity = () => { BUILDER_STATE.segments.push({ component_id: null, duration_min: 60 }); renderLegacyTable(); };
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
            if (isNaN(duration) || duration < 5) { target.value = BUILDER_STATE.segments[index].duration_min; return; }
            BUILDER_STATE.segments[index].duration_min = duration;
        } 
        renderLegacyTable();
    };
    const handleLegacySequenceClick = (e) => {
        const target = e.target.closest('button');
        if (!target) return;
        const index = parseInt(target.dataset.index, 10);
        if (isNaN(index)) return;
        if (target.classList.contains('legacy-delete')) {
            BUILDER_STATE.segments.splice(index, 1);
            renderLegacyTable();
        }
    };
    
    APP.Components = APP.Components || {};
    APP.Components.SequentialBuilder = SequentialBuilder;
}(window.APP));

/**
 * MODULE: APP.Components.ShiftDefinitionEditor
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
                    if (component && component.is_paid) paidDuration += duration;
                });
            }
            html += `<tr data-definition-id="${def.id}"><td><strong>${def.code}</strong></td><td>${def.name}</td><td>${APP.Utils.formatDuration(totalDuration)}</td><td>${APP.Utils.formatDuration(paidDuration)}</td><td class="actions"><button class="btn btn-sm btn-primary edit-structure" data-definition-id="${def.id}">Edit Structure</button><button class="btn btn-sm btn-danger delete-definition" data-definition-id="${def.id}">Delete</button></td></tr>`;
        });
        html += '</tbody></table>';
        ELS.grid.innerHTML = html;
    };

    const handleNewDefinition = async () => {
        const nameInput = prompt("Enter the full name (e.g., 'Early 7am-4pm Flex'):");
        if (!nameInput) return;
        const name = nameInput.trim();
        const codeInput = prompt("Enter a unique shortcode (e.g., 'E74F' or '2'):");
        if (!codeInput) return;
        const code = codeInput.trim();
        if (APP.StateManager.getShiftDefinitionByCode(code)) { APP.Utils.showToast("Error: Code already exists.", "danger"); return; }
        const newDefinition = { name, code: String(code), structure: [] };
        const { data, error } = await APP.DataService.saveRecord('shift_definitions', newDefinition);
        if (!error) {
            APP.StateManager.syncRecord('shift_definitions', data);
            APP.Utils.showToast(`Shift '${name}' created.`, "success");
            ShiftDefinitionEditor.render();
            if (APP.Components.RotationEditor) APP.Components.RotationEditor.renderGrid();
        }
    };

    const handleGridClick = (e) => {
        if (e.target.classList.contains('edit-structure')) {
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
        if (!definition || !confirm(`Delete '${definition.name}'?`)) return;
        const { error } = await APP.DataService.deleteRecord('shift_definitions', { id });
        if (!error) {
            APP.StateManager.syncRecord('shift_definitions', { id: id }, true);
            APP.Utils.showToast(`Shift deleted.`, "success");
            ShiftDefinitionEditor.render();
            if (APP.Components.RotationEditor) APP.Components.RotationEditor.renderGrid();
        }
    };

    APP.Components = APP.Components || {};
    APP.Components.ShiftDefinitionEditor = ShiftDefinitionEditor;
}(window.APP));

/**
 * MODULE: APP.Components.RotationEditor
 */
(function(APP) {
    const RotationEditor = {};
    const ELS = {};

    RotationEditor.initialize = () => {
        ELS.familySelect = document.getElementById('rotationFamily');
        ELS.btnNew = document.getElementById('btnNewRotation');
        ELS.btnDelete = document.getElementById('btnDeleteRotation');
        ELS.btnAddWeek = document.getElementById('btnAddWeek'); 
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
        patterns.forEach(p => { opts += `<option value="${p.name}" ${p.name === STATE.currentRotation ? 'selected' : ''}>${p.name}</option>`; });
        ELS.familySelect.innerHTML = opts;
    };

    RotationEditor.renderGrid = () => {
        if (!ELS.grid) return;
        const STATE = APP.StateManager.getState();
        const pattern = APP.StateManager.getPatternByName(STATE.currentRotation);
        const patternData = pattern ? (pattern.pattern || {}) : {};
        let numWeeks = 0;
        if (pattern) {
            numWeeks = APP.Utils.calculateRotationLength(pattern);
            if (numWeeks < 6) numWeeks = 6; 
        }
       
        const weeks = Array.from({length: numWeeks}, (_, i) => i + 1);
        const days = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
        const definitionOpts = STATE.shiftDefinitions.sort((a,b) => (String(a.code) || '').localeCompare(String(b.code) || '')).map(d => `<option value="${d.code}">${d.code} (${d.name})</option>`).join('');
        let html = '<table><thead><tr><th>WEEK</th>';
        days.forEach(d => html += `<th>${d}</th>`);
        html += '</tr></thead><tbody>';
        weeks.forEach(w => {
            html += `<tr><td>Week ${w}</td>`;
            days.forEach((d, i) => {
                const dow = i + 1; 
                html += `<td><select class="form-select rotation-grid-select" data-week="${w}" data-dow="${dow}" ${!pattern ? 'disabled' : ''}><option value="">-- RDO --</option>${definitionOpts}</select></td>`;
            });
            html += '</tr>';
        });
        html += '</tbody></table>';

        if (pattern) {
          html += `<div class="table-footer-inline"><button id="btnAddWeekInline" class="btn btn-secondary">[+] Add Week (Bottom)</button><button id="btnDeleteWeekInline" class="btn btn-danger" ${numWeeks === 0 ? 'disabled' : ''}>[-] Delete Last Week</button></div>`;
        }
        if (numWeeks === 0 && !pattern) html = '<div class="visualization-empty">Select or create a rotation to begin editing.</div>';

        ELS.grid.innerHTML = html;
        const inlineAdd = document.getElementById('btnAddWeekInline');
        if (inlineAdd) inlineAdd.addEventListener('click', handleAddWeek);
        const inlineDelete = document.getElementById('btnDeleteWeekInline');
        if (inlineDelete) inlineDelete.addEventListener('click', handleDeleteLastWeek);

        if (pattern) {
            weeks.forEach(w => {
                const weekKey = Object.keys(patternData).find(k => { const match = k.match(/^Week ?(\d+)$/i); return match && parseInt(match[1], 10) === w; });
                const weekData = weekKey ? patternData[weekKey] : {};
                days.forEach((d, i) => {
                    const dow = i + 1;
                    const legacyDayKey = d.toLowerCase();
                    const code = weekData[dow] || weekData[legacyDayKey] || ''; 
                    const sel = ELS.grid.querySelector(`select[data-week="${w}"][data-dow="${dow}"]`);
                    if (sel) sel.value = code;
                });
            });
        }
        if (ELS.btnAddWeek) ELS.btnAddWeek.disabled = !pattern;
    };

    const handleFamilyChange = () => {
        APP.StateManager.getState().currentRotation = ELS.familySelect.value;
        RotationEditor.renderGrid();
    };

    const handleNewRotation = async () => {
        const name = prompt("Enter a name for the new rotation family:");
        if (!name) return;
        if (APP.StateManager.getPatternByName(name)) { APP.Utils.showToast("Error: Rotation name already exists.", "danger"); return; }
        const initialPattern = {};
        for (let i = 1; i <= 6; i++) initialPattern[`Week ${i}`] = {};
        const newPatternRecord = { name: name, pattern: initialPattern };
        const { data, error } = await APP.DataService.saveRecord('rotation_patterns', newPatternRecord);
        if (!error) {
            APP.StateManager.syncRecord('rotation_patterns', data);
            APP.StateManager.getState().currentRotation = name;
            APP.Utils.showToast(`Rotation '${name}' created.`, "success");
            RotationEditor.render();
            if (APP.Components.AssignmentManager) APP.Components.AssignmentManager.render();
        }
    };

    const handleAddWeek = async () => {
        const STATE = APP.StateManager.getState();
        const rotationName = STATE.currentRotation;
        const pattern = APP.StateManager.getPatternByName(rotationName);
        if (!pattern) return;
        const maxWeek = APP.Utils.calculateRotationLength(pattern);
        const nextWeek = (maxWeek === 0) ? 1 : maxWeek + 1;
        if (!pattern.pattern) pattern.pattern = {};
        const nextWeekKey = `Week ${nextWeek}`;
        pattern.pattern[nextWeekKey] = {};
        const { error } = await APP.DataService.updateRecord('rotation_patterns', { pattern: pattern.pattern }, { name: rotationName });
        if (!error) {
            APP.StateManager.saveHistory(`Add Week ${nextWeek}`);
            APP.Utils.showToast(`Week ${nextWeek} added.`, "success");
            RotationEditor.renderGrid(); 
        } else {
            delete pattern.pattern[nextWeekKey];
        }
    };

    const handleDeleteLastWeek = async () => {
        const STATE = APP.StateManager.getState();
        const rotationName = STATE.currentRotation;
        const pattern = APP.StateManager.getPatternByName(rotationName);
        if (!pattern || !pattern.pattern) return;
        const maxWeek = APP.Utils.calculateRotationLength(pattern);
        if (maxWeek === 0) return;
        if (!confirm(`Delete Week ${maxWeek}?`)) return;

        const lastWeekKey = Object.keys(pattern.pattern).find(k => { const match = k.match(/^Week ?(\d+)$/i); return match && parseInt(match[1], 10) === maxWeek; });
        if (!lastWeekKey) return;
        const deletedWeekData = JSON.parse(JSON.stringify(pattern.pattern[lastWeekKey]));
        delete pattern.pattern[lastWeekKey];
        const { error } = await APP.DataService.updateRecord('rotation_patterns', { pattern: pattern.pattern }, { name: rotationName });
        if (!error) {
            APP.StateManager.saveHistory(`Delete Week ${maxWeek}`);
            APP.Utils.showToast(`Week ${maxWeek} deleted.`, "success");
            RotationEditor.renderGrid(); 
        } else {
            pattern.pattern[lastWeekKey] = deletedWeekData;
        }
    };

    const handleDeleteRotation = async () => {
        const STATE = APP.StateManager.getState();
        const rotationName = STATE.currentRotation;
        if (!rotationName || !confirm(`Delete '${rotationName}'?`)) return;
        const { error } = await APP.DataService.deleteRecord('rotation_patterns', { name: rotationName });
        if (!error) {
            APP.StateManager.syncRecord('rotation_patterns', { name: rotationName }, true);
            STATE.currentRotation = null;
            APP.Utils.showToast(`Rotation deleted.`, "success");
            RotationEditor.render();
            if (APP.Components.AssignmentManager) APP.Components.AssignmentManager.render();
        }
    };

    const handleGridChange = async (e) => {
        if (!e.target.classList.contains('rotation-grid-select')) return;
        if (ELS.autoSaveStatus) { ELS.autoSaveStatus.textContent = "Saving..."; ELS.autoSaveStatus.style.opacity = 1; }

        const { week, dow } = e.target.dataset;
        const shiftCode = e.target.value;
        const STATE = APP.StateManager.getState();
        const rotationName = STATE.currentRotation;
        const pattern = APP.StateManager.getPatternByName(rotationName);
        if (!pattern) return;

        if (!pattern.pattern) pattern.pattern = {};
        let weekKey = Object.keys(pattern.pattern).find(k => { const match = k.match(/^Week ?(\d+)$/i); return match && parseInt(match[1], 10) === parseInt(week, 10); });
        if (!weekKey) weekKey = `Week ${week}`;
        if (!pattern.pattern[weekKey]) pattern.pattern[weekKey] = {};
        
        if (shiftCode) pattern.pattern[weekKey][dow] = String(shiftCode);
        else delete pattern.pattern[weekKey][dow];

        const { error } = await APP.DataService.updateRecord('rotation_patterns', { pattern: pattern.pattern }, { name: rotationName });
        if (!error) {
            APP.StateManager.syncRecord('rotation_patterns', pattern);
            if (ELS.autoSaveStatus) { ELS.autoSaveStatus.textContent = "✓ Saved"; setTimeout(() => { ELS.autoSaveStatus.style.opacity = 0; }, 2000); }
            if (APP.Components.ScheduleViewer) APP.Components.ScheduleViewer.render();
        } else {
             if (ELS.autoSaveStatus) ELS.autoSaveStatus.textContent = "Error Saving";
        }
    };

    APP.Components = APP.Components || {};
    APP.Components.RotationEditor = RotationEditor;
}(window.APP));

/**
 * MODULE: APP.Components.ScheduleViewer
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
        ELS.visualizationContainer = document.getElementById('visualizationContainer');
        ELS.scheduleViewTitle = document.getElementById('scheduleViewTitle');
        ELS.viewToggleGroup = document.getElementById('viewToggleGroup');
        ELS.dayToggleContainer = document.getElementById('dayToggleContainer');
        ELS.plannerDay = document.getElementById('plannerDay');

        if (ELS.treeSearch) ELS.treeSearch.addEventListener('input', renderTree);
        if (ELS.btnClearSelection) ELS.btnClearSelection.addEventListener('click', clearSelection);
        if (ELS.tree) ELS.tree.addEventListener('change', handleTreeChange);
        if (ELS.plannerDay) ELS.plannerDay.addEventListener('change', () => { APP.StateManager.getState().selectedDay = ELS.plannerDay.value; renderPlannerContent(); });
        if (ELS.viewToggleGroup) ELS.viewToggleGroup.addEventListener('click', handleViewToggle);
        if (ELS.visualizationContainer) ELS.visualizationContainer.addEventListener('click', handleVisualizationClick);
    };

    ScheduleViewer.render = async () => {
        const STATE = APP.StateManager.getState();
        if (STATE.weekStart) await APP.StateManager.loadEffectiveAssignments(STATE.weekStart);
        renderTree();
        renderPlannerContent();
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

    const handleVisualizationClick = (e) => {
        const STATE = APP.StateManager.getState();
        let advisorId, dateISO, dayName;

        if (STATE.scheduleViewMode === 'daily') {
            const row = e.target.closest('.timeline-row');
            if (row && row.dataset.advisorId) {
                advisorId = row.dataset.advisorId;
                dayName = STATE.selectedDay;
                dateISO = APP.Utils.getISODateForDayName(STATE.weekStart, dayName);
            }
        } else if (STATE.scheduleViewMode === 'weekly') {
             const cell = e.target.closest('.weekly-cell');
             if (cell && cell.dataset.advisorId && cell.dataset.date) {
                 advisorId = cell.dataset.advisorId;
                 dateISO = cell.dataset.date;
                 dayName = APP.Utils.getDayNameFromISO(dateISO);
             }
        }

        if (advisorId && dateISO && dayName) {
            const advisor = APP.StateManager.getAdvisorById(advisorId);
            if (!advisor) return;
            const weekStartISO = APP.Utils.getMondayForDate(dateISO);
            const { segments, reason } = APP.ScheduleCalculator.calculateSegments(advisorId, dayName, weekStartISO);

            if (APP.Components.SequentialBuilder) {
                APP.Components.SequentialBuilder.open({
                    mode: 'exception',
                    id: advisorId,
                    date: dateISO,
                    title: `Live Editor: ${advisor.name} (${dayName}, ${APP.Utils.convertISOToUKDate(dateISO)})`,
                    structure: segments,
                    reason: reason
                });
            }
        }
    };

    const renderTree = () => {
        if (!ELS.tree) return;
        const STATE = APP.StateManager.getState();
        const filter = ELS.treeSearch ? ELS.treeSearch.value.toLowerCase() : '';
        let html = '';
        const leaders = STATE.leaders.sort((a, b) => a.name.localeCompare(b.name));
        const advisors = STATE.advisors.sort((a, b) => a.name.localeCompare(b.name));
        leaders.forEach(leader => {
            const teamAdvisors = advisors.filter(a => a.leader_id === leader.id);
            const matchesFilter = !filter || leader.name.toLowerCase().includes(filter) || teamAdvisors.some(a => a.name.toLowerCase().includes(filter));

            if (matchesFilter && teamAdvisors.length > 0) {
                const allSelected = teamAdvisors.every(a => STATE.selectedAdvisors.has(a.id));
                const site = leader.sites ? leader.sites.name : '';
                const siteHTML = site ? `<span class="team-brand">${site}</span>` : '';

                html += `<div class="tree-node-leader"><label><input type="checkbox" class="select-leader" data-leader-id="${leader.id}" ${allSelected ? 'checked' : ''} /> ${leader.name} (Team Leader) ${siteHTML}</label></div>`;
                teamAdvisors.forEach(adv => {
                    if (!filter || adv.name.toLowerCase().includes(filter) || leader.name.toLowerCase().includes(filter)) {
                         const isChecked = STATE.selectedAdvisors.has(adv.id);
                         html += `<div class="tree-node-advisor"><label><input type="checkbox" class="select-advisor" data-advisor-id="${adv.id}" data-leader-id="${leader.id}" ${isChecked ? 'checked' : ''} /> ${adv.name}</label></div>`;
                    }
                });
            }
        });
        ELS.tree.innerHTML = html || '<div class="visualization-empty">No teams or advisors found.</div>';
        if (STATE.selectedAdvisors.size === 0 && STATE.advisors.length > 0 && !STATE.treeInitialized) {
            const firstAdvisor = advisors.find(a => a.leader_id);
            if (firstAdvisor) {
                STATE.selectedAdvisors.add(firstAdvisor.id);
                STATE.treeInitialized = true;
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
            teamAdvisors.forEach(adv => { isChecked ? STATE.selectedAdvisors.add(adv.id) : STATE.selectedAdvisors.delete(adv.id); });
            renderTree(); 
        } else if (target.classList.contains('select-advisor')) {
            const id = target.dataset.advisorId;
            target.checked ? STATE.selectedAdvisors.add(id) : STATE.selectedAdvisors.delete(id);
            renderTree();
        }
        renderPlannerContent();
    };

    const clearSelection = () => {
        APP.StateManager.getState().selectedAdvisors.clear();
        renderTree();
        renderPlannerContent();
    };

    const renderPlannerContent = () => {
        const STATE = APP.StateManager.getState();
        if (STATE.scheduleViewMode === 'daily') renderDailyPlanner();
        else renderWeeklyPlanner();
    };

    const renderDailyPlanner = () => {
        ELS.scheduleViewTitle.textContent = "Schedule Visualization (Daily 05:00 - 23:00)";
        ELS.visualizationContainer.innerHTML = `<div class="timeline-container" id="timelineContainer"><div class="timeline-header"><div class="header-name">Name</div><div class="header-timeline" id="timeHeader"></div></div><div class="timeline-body" id="plannerBody"></div><div id="currentTimeIndicator" class="current-time-indicator"></div><div id="mouseTimeIndicator" class="mouse-time-indicator"></div><div id="mouseTimeTooltip" class="mouse-time-tooltip">00:00</div></div>`;
        
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
            const advisorsToRender = STATE.advisors.filter(a => selected.includes(a.id)).sort((a,b) => a.name.localeCompare(b.name));
            let html = '';
            advisorsToRender.forEach(adv => {
                const { segments, source } = APP.ScheduleCalculator.calculateSegments(adv.id, STATE.selectedDay);
                const rowClass = (source === 'exception') ? 'is-exception' : '';
                html += `<div class="timeline-row ${rowClass}" data-advisor-id="${adv.id}"><div class="timeline-name">${adv.name}</div><div class="timeline-track">${renderSegments(segments)}</div></div>`;
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
        for (let h = startHour; h <= endHour; h++) {
            const pct = (h - startHour) / totalHours * 100;
            html += `<div class="time-tick" style="left: ${pct}%;">${h.toString().padStart(2, '0')}:00</div>`;
        }
        headerElement.innerHTML = html;
    };

    ScheduleViewer.renderSegments = (segments) => {
        if (!segments || segments.length === 0) return '';
        return segments.map(seg => {
            const component = APP.StateManager.getComponentById(seg.component_id);
            if (!component) return '';
            const startPct = ((seg.start_min - Config.TIMELINE_START_MIN) / Config.TIMELINE_DURATION_MIN) * 100;
            const widthPct = ((seg.end_min - seg.start_min) / Config.TIMELINE_DURATION_MIN) * 100;
            let barClass = '';
            if (component.type === 'Break' || component.type === 'Lunch') barClass = 'is-gap';
            else if (component.type === 'Activity') barClass = 'is-activity';
            const style = (barClass === '') ? `background-color: ${component.color}; color: ${APP.Utils.getContrastingTextColor(component.color)};` : '';
            return `<div class="timeline-bar ${barClass}" style="left: ${startPct}%; width: ${widthPct}%; ${style}" title="${component.name} (${APP.Utils.formatMinutesToTime(seg.start_min)} - ${APP.Utils.formatMinutesToTime(seg.end_min)})"></div>`;
        }).join('');
    };
    const renderSegments = ScheduleViewer.renderSegments;

    const renderWeeklyPlanner = () => {
        ELS.scheduleViewTitle.textContent = "Schedule Visualization (Weekly Overview)";
        ELS.visualizationContainer.innerHTML = `<div class="table-container"><table class="weekly-grid" id="weeklyGrid"><thead><tr><th>Name</th><th>MON</th><th>TUE</th><th>WED</th><th>THU</th><th>FRI</th><th>SAT</th><th>SUN</th></tr></thead><tbody id="weeklyBody"></tbody></table></div>`;
        const ELS_WEEKLY = { weeklyBody: document.getElementById('weeklyBody') };
        const STATE = APP.StateManager.getState();
        const selected = Array.from(STATE.selectedAdvisors);
        const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        
        if (selected.length > 0) {
            const advisorsToRender = STATE.advisors.filter(a => selected.includes(a.id)).sort((a,b) => a.name.localeCompare(b.name));
            let html = '';
            advisorsToRender.forEach(adv => {
                html += `<tr><td>${adv.name}</td>`;
                daysOfWeek.forEach(day => {
                    const { segments, source } = APP.ScheduleCalculator.calculateSegments(adv.id, day);
                    const cellClass = (source === 'exception') ? 'is-exception' : '';
                    const dateISO = APP.Utils.getISODateForDayName(STATE.weekStart, day);
                    html += `<td class="weekly-cell ${cellClass}" data-advisor-id="${adv.id}" data-date="${dateISO}">${renderWeeklyCell(segments, source)}</td>`;
                });
                html += `</tr>`;
            });
            ELS_WEEKLY.weeklyBody.innerHTML = html;
        } else {
             ELS_WEEKLY.weeklyBody.innerHTML = `<tr><td colspan="8" class="visualization-empty">Select advisors to view schedules.</td></tr>`;
        }
    };

    const renderWeeklyCell = (segments, source) => {
        if (!segments || segments.length === 0) return `<div class="weekly-cell-content"><span class="weekly-rdo">RDO</span></div>`;
        let shiftCode = 'N/A';
        if (source === 'rotation') {
            const STATE = APP.StateManager.getState();
            const definition = STATE.shiftDefinitions.find(def => {
                if (!def.structure) return false;
                const sortedDefStructure = JSON.parse(JSON.stringify(def.structure)).sort((a, b) => a.start_min - b.start_min);
                return JSON.stringify(sortedDefStructure) === JSON.stringify(segments);
            });
            if (definition) shiftCode = definition.code;
        } else if (source === 'exception') { shiftCode = 'Custom'; }
        const startMin = segments[0].start_min;
        const endMin = segments[segments.length - 1].end_min;
        const timeString = `${APP.Utils.formatMinutesToTime(startMin)} - ${APP.Utils.formatMinutesToTime(endMin)}`;
        return `<div class="weekly-cell-content"><span class="weekly-shift-code">${shiftCode}</span><span class="weekly-shift-time">${timeString}</span></div>`;
    };

    const setupIntradayIndicators = (ELS_DAILY) => {
       if (timeIndicatorInterval) clearInterval(timeIndicatorInterval);
       timeIndicatorInterval = setInterval(() => updateCurrentTimeIndicator(ELS_DAILY), 60000);
       updateCurrentTimeIndicator(ELS_DAILY);
       if (ELS_DAILY.timelineContainer) {
           ELS_DAILY.timelineContainer.addEventListener('mousemove', (e) => updateMouseTimeIndicator(e, ELS_DAILY));
           ELS_DAILY.timelineContainer.addEventListener('mouseenter', () => showMouseIndicator(ELS_DAILY));
           ELS_DAILY.timelineContainer.addEventListener('mouseleave', () => hideMouseIndicator(ELS_DAILY));
       }
   };

   const updateCurrentTimeIndicator = (ELS_DAILY) => {
       if (!ELS_DAILY || !ELS_DAILY.currentTimeIndicator || !ELS_DAILY.timelineContainer) return;
       const now = new Date();
       const STATE = APP.StateManager.getState();
       const viewDateISO = APP.Utils.getISODateForDayName(STATE.weekStart, STATE.selectedDay);
       const todayISO = APP.Utils.formatDateToISO(now);
       if (STATE.scheduleViewMode !== 'daily' || viewDateISO !== todayISO) { ELS_DAILY.currentTimeIndicator.style.display = 'none'; return; }
       const currentMinutes = now.getHours() * 60 + now.getMinutes();
       if (currentMinutes < Config.TIMELINE_START_MIN || currentMinutes > Config.TIMELINE_END_MIN) { ELS_DAILY.currentTimeIndicator.style.display = 'none'; return; }
       const pct = ((currentMinutes - Config.TIMELINE_START_MIN) / Config.TIMELINE_DURATION_MIN) * 100;
       const nameColElement = ELS_DAILY.timelineContainer.querySelector('.header-name');
       const nameColWidth = nameColElement ? nameColElement.offsetWidth : 220;
       ELS_DAILY.currentTimeIndicator.style.display = 'block';
       ELS_DAILY.currentTimeIndicator.style.left = `calc(${nameColWidth}px + ${pct}%)`;
   };

   const updateMouseTimeIndicator = (e, ELS_DAILY) => {
       if (!ELS_DAILY || !ELS_DAILY.mouseTimeIndicator || !ELS_DAILY.timelineContainer) return;
       const vizContainer = document.getElementById('visualizationContainer');
       if (!vizContainer) return;
       const containerRect = ELS_DAILY.timelineContainer.getBoundingClientRect();
       const mouseX = e.clientX - containerRect.left + vizContainer.scrollLeft;
       const nameColElement = ELS_DAILY.timelineContainer.querySelector('.header-name');
       const nameColWidth = nameColElement ? nameColElement.offsetWidth : 220;
       const headerHeight = ELS_DAILY.timeHeader ? ELS_DAILY.timeHeader.offsetHeight : 48;
       if (mouseX < nameColWidth) { hideMouseIndicator(ELS_DAILY); return; }
       const trackWidth = ELS_DAILY.timeHeader.offsetWidth;
       const relativeX = mouseX - nameColWidth;
       const pct = relativeX / trackWidth;
       const constrainedPct = Math.max(0, Math.min(1, pct));
       const timeInMinutes = Config.TIMELINE_START_MIN + (constrainedPct * Config.TIMELINE_DURATION_MIN);
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
 * MODULE: APP.Components.ShiftTradeCenter
 */
(function(APP) {
    const ShiftTradeCenter = {};
    const ELS = {};
    const TRADE_STATE = { advisor1: null, date1: null, schedule1: null, advisor2: null, date2: null, schedule2: null, reason: null };

    ShiftTradeCenter.initialize = () => {
        ELS.advisor1 = document.getElementById('tradeAdvisor1');
        ELS.date1 = document.getElementById('tradeDate1');
        ELS.preview1 = document.getElementById('tradePreview1');
        ELS.advisor2 = document.getElementById('tradeAdvisor2');
        ELS.date2 = document.getElementById('tradeDate2');
        ELS.preview2 = document.getElementById('tradePreview2');
        ELS.btnExecuteTrade = document.getElementById('btnExecuteTrade');
        ELS.reasonInput = document.getElementById('tradeReason');

        if (ELS.advisor1) ELS.advisor1.addEventListener('change', (e) => handleSelectionChange('1', 'advisor', e.target.value));
        if (ELS.advisor2) ELS.advisor2.addEventListener('change', (e) => handleSelectionChange('2', 'advisor', e.target.value));
        if (ELS.btnExecuteTrade) ELS.btnExecuteTrade.addEventListener('click', executeTrade);
        if (ELS.reasonInput) ELS.reasonInput.addEventListener('input', (e) => { TRADE_STATE.reason = e.target.value; validateTrade(); });

        if (typeof flatpickr !== 'undefined') {
            if (ELS.date1) flatpickr(ELS.date1, { dateFormat: 'Y-m-d', altInput: true, altFormat: 'D, d M Y', onChange: (selectedDates, dateStr) => handleSelectionChange('1', 'date', dateStr) });
            if (ELS.date2) flatpickr(ELS.date2, { dateFormat: 'Y-m-d', altInput: true, altFormat: 'D, d M Y', onChange: (selectedDates, dateStr) => handleSelectionChange('2', 'date', dateStr) });
        }
    };

    ShiftTradeCenter.render = () => { renderAdvisorDropdowns(); };

    const renderAdvisorDropdowns = () => {
        if (!ELS.advisor1 || !ELS.advisor2) return;
        if (ELS.advisor1.options.length > 1) return;
        const STATE = APP.StateManager.getState();
        const advisors = STATE.advisors.sort((a,b) => a.name.localeCompare(b.name));
        let opts = '<option value="">-- Select Advisor --</option>';
        advisors.forEach(adv => { opts += `<option value="${adv.id}">${adv.name}</option>`; });
        ELS.advisor1.innerHTML = opts;
        ELS.advisor2.innerHTML = opts;
    };

    const handleSelectionChange = async (slot, type, value) => {
        TRADE_STATE[`${type}${slot}`] = value || null;
        const advisorId = TRADE_STATE[`advisor${slot}`];
        const dateISO = TRADE_STATE[`date${slot}`];
        if (advisorId && dateISO) {
            TRADE_STATE[`schedule${slot}`] = await fetchScheduleForDate(advisorId, dateISO);
            renderPreview(slot);
        } else {
            TRADE_STATE[`schedule${slot}`] = null;
            renderPreview(slot);
        }
        validateTrade();
    };

    const fetchScheduleForDate = async (advisorId, dateISO) => {
        try {
            const weekStartISO = APP.Utils.getMondayForDate(dateISO);
            if (!weekStartISO) return null;
            const dayName = APP.Utils.getDayNameFromISO(dateISO);
            await APP.StateManager.loadEffectiveAssignments(weekStartISO);
             const result = APP.ScheduleCalculator.calculateSegments(advisorId, dayName, weekStartISO);
             return result;
        } catch (e) { return null; }
    };

    const renderPreview = (slot) => {
        const previewEl = ELS[`preview${slot}`];
        const schedule = TRADE_STATE[`schedule${slot}`];
        if (!previewEl) return;
        if (!schedule) { previewEl.innerHTML = 'Select advisor and date to preview schedule.'; return; }
        if (schedule.segments.length === 0) { previewEl.innerHTML = `<div class="trade-preview-details"><h4>Rest Day Off (RDO)</h4></div>`; return; }
        const startMin = schedule.segments[0].start_min;
        const endMin = schedule.segments[schedule.segments.length - 1].end_min;
        const timeString = `${APP.Utils.formatMinutesToTime(startMin)} - ${APP.Utils.formatMinutesToTime(endMin)}`;
        let html = `<div class="trade-preview-details"><h4>${timeString} (${schedule.source === 'exception' ? 'Exception' : 'Rotation'})</h4><ul>`;
        schedule.segments.forEach(seg => {
            const component = APP.StateManager.getComponentById(seg.component_id);
            const duration = seg.end_min - seg.start_min;
            html += `<li>${APP.Utils.formatMinutesToTime(seg.start_min)}: ${component ? component.name : 'Unknown'} (${duration}m)</li>`;
        });
        html += `</ul></div>`;
        previewEl.innerHTML = html;
    };

    const validateTrade = () => {
        const { advisor1, date1, schedule1, advisor2, date2, schedule2, reason } = TRADE_STATE;
        let isValid = true;
        if (!advisor1 || !date1 || !advisor2 || !date2 || !reason || reason.trim() === '') isValid = false;
        else if (!schedule1 || !schedule2) isValid = false;
        else if (advisor1 === advisor2 && date1 === date2) isValid = false;
        if (ELS.btnExecuteTrade) ELS.btnExecuteTrade.disabled = !isValid;
        return isValid;
    };

    const executeTrade = async () => {
        if (!validateTrade()) return;
        const { advisor1, date1, schedule1, advisor2, date2, schedule2, reason } = TRADE_STATE;
        const adv1Name = APP.StateManager.getAdvisorById(advisor1)?.name || advisor1;
        const adv2Name = APP.StateManager.getAdvisorById(advisor2)?.name || advisor2;
        if (!confirm(`Confirm Trade:\n\n${adv1Name} on ${APP.Utils.convertISOToUKDate(date1)} <-> ${adv2Name} on ${APP.Utils.convertISOToUKDate(date2)}.\n\nReason: ${reason}\n\nProceed?`)) return;

        const exception1 = { advisor_id: advisor1, exception_date: date1, structure: schedule2.segments.length > 0 ? JSON.parse(JSON.stringify(schedule2.segments)) : [], reason: `${reason} (Trade with ${adv2Name})` };
        const exception2 = { advisor_id: advisor2, exception_date: date2, structure: schedule1.segments.length > 0 ? JSON.parse(JSON.stringify(schedule1.segments)) : [], reason: `${reason} (Trade with ${adv1Name})` };

        const res1 = await APP.DataService.saveRecord('schedule_exceptions', exception1, 'advisor_id, exception_date');
        const res2 = await APP.DataService.saveRecord('schedule_exceptions', exception2, 'advisor_id, exception_date');

        if (!res1.error && !res2.error) {
            APP.StateManager.syncRecord('schedule_exceptions', res1.data);
            APP.StateManager.syncRecord('schedule_exceptions', res2.data);
            APP.StateManager.saveHistory("Execute Shift Trade");
            APP.Utils.showToast("Shift trade executed successfully.", "success");
            clearTradeForm();
            if (APP.Components.ScheduleViewer) APP.Components.ScheduleViewer.render();
        }
    };

    const clearTradeForm = () => {
        Object.keys(TRADE_STATE).forEach(key => TRADE_STATE[key] = null);
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
 */
(function(APP) {
    const Core = {};
    const ELS = {};

    Core.initialize = async () => {
        console.log("WFM Intelligence Platform (v16.3 FINAL) Initializing...");
        APP.Utils.cacheDOMElements();
        if (!APP.DataService.initialize()) { console.error("DataService initialization failed."); return; }
        cacheCoreDOMElements();
        setDefaultWeek();
        const initialData = await APP.DataService.loadCoreData();
        if (!initialData) {
            console.error("Failed to load core data.");
             if (ELS.mainContentArea) ELS.mainContentArea.innerHTML = `<div class="card" style="text-align: center; padding: 50px;"><h1>Data Load Failed</h1></div>`;
            return;
        }
        APP.StateManager.initialize(initialData);
        initializeTabs();
        initializeDateControls();
        
        if (APP.Components.ComponentManager) APP.Components.ComponentManager.initialize();
        if (APP.Components.SequentialBuilder) APP.Components.SequentialBuilder.initialize();
        if (APP.Components.ShiftDefinitionEditor) APP.Components.ShiftDefinitionEditor.initialize();
        if (APP.Components.RotationEditor) APP.Components.RotationEditor.initialize();
        if (APP.Components.AssignmentManager) APP.Components.AssignmentManager.initialize();
        if (APP.Components.ScheduleViewer) APP.Components.ScheduleViewer.initialize();
        if (APP.Components.ShiftTradeCenter) APP.Components.ShiftTradeCenter.initialize();

        Core.renderAll();
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
        ELS.mainContentArea = document.getElementById('main-content-area');
    };

    const setDefaultWeek = () => {
        let d = new Date();
        let day = d.getDay();
        let diff = d.getDate() - day + (day === 0 ? -6 : 1);
        const localMonday = new Date(d.getFullYear(), d.getMonth(), diff);
        APP.StateManager.getState().weekStart = APP.Utils.formatDateToISO(localMonday);
    };

    const wireGlobalEvents = () => {
        if (ELS.weekStart && typeof flatpickr !== 'undefined') {
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
        if (ELS.btnUndo) ELS.btnUndo.addEventListener('click', () => APP.StateManager.applyHistory('undo'));
        if (ELS.btnRedo) ELS.btnRedo.addEventListener('click', () => APP.StateManager.applyHistory('redo'));
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
            Core.renderAll();
        }
    };

    const updateWeek = (days) => {
        if (!ELS.weekStart || !ELS.weekStart._flatpickr) return;
        const flatpickrInstance = ELS.weekStart._flatpickr;
        const currentDate = flatpickrInstance.selectedDates[0] || new Date();
        currentDate.setDate(currentDate.getDate() + days);
        flatpickrInstance.setDate(currentDate, true);
    };

    Core.updateUndoRedoButtons = (index, length) => {
        if (ELS.btnUndo) ELS.btnUndo.disabled = index <= 0;
        if (ELS.btnRedo) ELS.btnRedo.disabled = index >= length - 1;
    };

    Core.renderAll = async () => {
        if (!APP.StateManager.getState().isBooted) return;
        const activeTab = document.querySelector('.tab-link.active');
        const activeTabId = activeTab ? activeTab.dataset.tab : 'tab-schedule-view';

        if (activeTabId === 'tab-schedule-view') APP.Components.ScheduleViewer.render();
        else if (activeTabId === 'tab-rotation-editor') APP.Components.RotationEditor.render();
        else if (activeTabId === 'tab-shift-definitions') APP.Components.ShiftDefinitionEditor.render();
        else if (activeTabId === 'tab-advisor-assignments') APP.Components.AssignmentManager.render();
        else if (activeTabId === 'tab-component-manager') APP.Components.ComponentManager.render();
        else if (activeTabId === 'tab-trade-center') APP.Components.TradeCenter.render();
    };

    APP.Core = Core;
}(window.APP));
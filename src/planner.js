/*
  VERSION 3: The "Big Leap" Update

  - WORKFLOW OVERHAUL: Removed all manual shift-planning logic.
  - NEW: App is now driven by "Rotation Families" and "Advisor Assignments."
  - NEW: Core logic now auto-calculates schedules based on an advisor's assigned rotation and start date.
  - NEW: "Rotation Editor" logic to create/read/update/delete rotation families (Phase 2).
  - NEW: "Advisor Assignment" logic to assign rotations to advisors (Phase 2).
  - NEW: Undo/Redo state management (Phase 1).
  - NEW: Tooltip logic (Phase 3).
  - RE-PURPOSED: "Commit Week" now saves the *auto-generated* schedule to the `rotas` table for historical audit.
*/

/* =========================
   Supabase configuration
   ========================= */
const SUPABASE_URL = "https://oypdnjxhjpgpwmkltzmk.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im95cGRuanhoanBncHdta2x0em1rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk4Nzk0MTEsImV4cCI6MjA3NTQ1NTQxMX0.Hqf1L4RHpIPUD4ut2uVsiGDsqKXvAjdwKuotmme4_Is";

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
window.supabase = sb; // Expose for helpers

/* =========================
   App State (Globals)
   ========================= */
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DOW = { 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 'Thursday': 4, 'Friday': 5, 'Saturday': 6, 'Sunday': 7 };
const MAX_WEEKS_IN_ROTATION = 6;

// Data Stores
let ORG = { sites: {} };
let ADVISORS_LIST = [];
let ADVISOR_BY_NAME = new Map();
let ADVISOR_BY_ID = new Map();
let SHIFT_TEMPLATES = new Map(); // "7A" -> { name: "7A", start_time: "07:00", ... }
let ROTATION_FAMILIES = new Map(); // "Flex A" -> { name: "Flex A", pattern: { 1: { Mon: "7A", ... }, 2: { ... } } }
let ADVISOR_ASSIGNMENTS = new Map(); // advisor_id -> { advisor_id, rotation_name, start_date }

// State
let selectedAdvisors = new Set();
let currentWeekStart = ""; // ISO date string of the viewed Monday
let activeTooltip = {
  element: null,
  visible: false
};

// Undo/Redo Buffer
let history = [];
let historyIndex = -1;

/* =========================
   Core Helpers
   ========================= */
const $ = s => document.querySelector(s),
  $$ = s => Array.from(document.querySelectorAll(s));
window.$ = $;
window.$$ = $$;

const pad = n => String(n).padStart(2, '0');
const fmt = (t) => t ? t.slice(0, 5) : ''; // HH:MM from HH:MM:SS

window.setToMonday = function(d) {
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function toMin(t) {
  if (t === null || t === undefined) return null;
  const [h, m] = String(t).split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return null;
  return (h * 60) + m;
}

function m2t(m) {
  if (m === null || m === undefined) return '';
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

function toISODateLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getMondayISO(d) {
  const date = (d instanceof Date) ? d : new Date(d + 'T00:00:00'); // Use local time
  const day = date.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const diff = date.getDate() - day + (day === 0 ? -6 : 1); // adjust to Monday
  return toISODateLocal(new Date(date.setDate(diff)));
}

/**
 * Calculates the difference in days between two dates.
 */
function dateDiffInDays(a, b) {
  const _MS_PER_DAY = 1000 * 60 * 60 * 24;
  // Discard time and time-zone information.
  const utc1 = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const utc2 = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.floor((utc2 - utc1) / _MS_PER_DAY);
}

/**
 * Calculates the effective week of a rotation.
 * @param {string} rotationStartDateISO - The "Week 1" start date (a Monday)
 * @param {string} plannerWeekStartISO - The Monday of the week we are viewing
 * @returns {number} The effective week number (1-6)
 */
function effectiveWeek(rotationStartDateISO, plannerWeekStartISO) {
  try {
    const rotationStart = new Date(rotationStartDateISO + 'T00:00:00');
    const plannerStart = new Date(plannerWeekStartISO + 'T00:00:00');

    // Ensure both dates are Mondays
    const rsm = getMondayISO(rotationStart);
    const psm = getMondayISO(plannerStart);

    const diffDays = dateDiffInDays(new Date(rsm), new Date(psm));
    if (diffDays < 0) return 1; // Viewing a week before the rotation started

    const diffWeeks = Math.floor(diffDays / 7);
    const numWeeksInRotation = MAX_WEEKS_IN_ROTATION; // TODO: Make this dynamic from the rotation family
    
    return (diffWeeks % numWeeksInRotation) + 1; // 1-indexed week number
  } catch (e) {
    console.error("Error in effectiveWeek:", e);
    return 1; // Fallback
  }
}

/* =========================
   Vertical Calendar Config
   ========================= */
const css = getComputedStyle(document.documentElement);
const START_HOUR_VC = +css.getPropertyValue('--timeline-start') || 7;
const END_HOUR_VC = +css.getPropertyValue('--timeline-end') || 20;
const HEIGHT_VC = +css.getPropertyValue('--timeline-height').replace('px', '') || 800;
const PX_PER_MIN_VC = HEIGHT_VC / ((END_HOUR_VC - START_HOUR_VC) * 60);

/* =========================
   Horizontal Planner Config
   ========================= */
const DAY_START_HC = 6 * 60, // 6am
  DAY_END_HC = 20 * 60; // 8pm (14 hours)
const DAY_SPAN_HC = DAY_END_HC - DAY_START_HC;
function m2hmm(m) {
  const h = Math.floor(m / 60),
    mm = String(m % 60).padStart(2, '0');
  return `${h}:${mm}`;
}

window.renderTimeHeader = function(el) {
  if (!el) return;
  el.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'time-scale';
  for (let m = DAY_START_HC; m <= DAY_END_HC; m += 60) {
    const t = document.createElement('div');
    t.className = 'tick';
    t.style.left = `${((m - DAY_START_HC) / DAY_SPAN_HC) * 100}%`;
    t.textContent = m2hmm(m);
    wrap.appendChild(t);
  }
  el.appendChild(wrap);
}

/* =========================
   Shift Template Helpers
   ========================= */
function codeSelectGroupedHTML(val = '') {
  // TODO: This should be dynamic from shift templates
  const codes = ["7A", "7B", "7C", "8A", "8B", "9A", "9C", "RDO", "AL", "Sick"];
  return `<option value="">--</option>` + codes.map(c => `<option value="${c}" ${val===c?'selected':''}>${c}</option>`).join('');
}

function classForCode(code) {
  const k = (code || '').toLowerCase();
  if (k === 'rdo' || k === 'al' || k === 'sick') return 'c-rdo';
  if (/\blunch\b/.test(k)) return 'c-lunch';
  if (/\bbreak\b/.test(k)) return 'c-break';
  if (/\bovertime\b/.test(k)) return 'c-overtime';
  if (/\bmirakl\b/.test(k)) return 'c-mirakl';
  if (/\bsocial\b/.test(k)) return 'c-social';
  if (/\bemail\b/.test(k)) return 'c-email';
  if (['al', 'sick', 'maternity', 'lts'].some(w => k.includes(w))) return 'c-absence';
  if (['121', 'atl', 'coaching', 'huddle', 'iti', 'projects', 'team meeting', 'training'].some(w => k.includes(w))) return 'c-shrink';
  return 'c-email'; // Default
}

/* =========================
   Data Loading (Supabase)
   ========================= */

window.loadOrg = async function() {
  const { data: advisorsRes, error } = await sb.from('advisors').select('*');
  if (error) console.error("Error loading advisors:", error);
  
  ADVISORS_LIST = (advisorsRes || []).map(a => ({
    id: a.id,
    name: a.name,
    leader_id: a.leader_id // TODO: Load sites/leaders
  }));
  
  ADVISOR_BY_NAME = new Map(ADVISORS_LIST.map(a => [a.name, a.id]));
  ADVISOR_BY_ID = new Map(ADVISORS_LIST.map(a => [a.id, a]));
}

window.loadShiftTemplates = async function() {
  const { data, error } = await sb.from('shift_templates').select('*');
  if (error) console.error("Error loading shift templates:", error);
  SHIFT_TEMPLATES.clear();
  (data || []).forEach(t => SHIFT_TEMPLATES.set(t.name, t));
}

window.loadRotationFamilies = async function() {
  const { data, error } = await sb.from('rotations').select('name, pattern');
  if (error) console.error("Error loading rotation families:", error);
  ROTATION_FAMILIES.clear();
  (data || []).forEach(r => ROTATION_FAMILIES.set(r.name, r));
}

window.loadAdvisorAssignments = async function() {
  const { data, error } = await sb.from('advisor_assignments').select('advisor_id, rotation_name, start_date');
  if (error) console.error("Error loading advisor assignments:", error);
  ADVISOR_ASSIGNMENTS.clear();
  (data || []).forEach(a => ADVISOR_ASSIGNMENTS.set(a.advisor_id, a));
  
  // After loading, save the initial state for undo
  saveStateToHistory();
}

/* =========================
   Rotation Editor (Phase 2)
   ========================= */
   
window.populateRotationEditor = function() {
  const sel = $('#rotationSelect');
  const grid = $('#rotationEditorGrid');
  if (!sel || !grid) return;

  const familyNames = Array.from(ROTATION_FAMILIES.keys()).sort();
  sel.innerHTML = familyNames.map(name => `<option value="${name}">${name}</option>`).join('');
  sel.insertAdjacentHTML('afterbegin', '<option value="">-- Select Rotation --</option>');
  sel.value = "";

  // Event listener for dropdown change
  sel.onchange = () => {
    const familyName = sel.value;
    const family = ROTATION_FAMILIES.get(familyName);
    renderRotationGrid(family);
  };
  
  renderRotationGrid(null); // Render empty grid
}

function renderRotationGrid(family) {
  const grid = $('#rotationEditorGrid');
  const pattern = family ? (family.pattern || {}) : {};
  
  const shiftOptions = Array.from(SHIFT_TEMPLATES.keys()).sort().map(name => `<option value="${name}">${name}</option>`).join('');
  
  let html = `<table class="data-table"><thead><tr><th>Week</th>`;
  DAYS.forEach(day => html += `<th>${day.slice(0,3)}</th>`);
  html += `</tr></thead><tbody>`;

  for (let w = 1; w <= MAX_WEEKS_IN_ROTATION; w++) {
    html += `<tr><td>Week ${w}</td>`;
    const weekPattern = pattern[w] || {};
    DAYS.forEach(day => {
      const shift = weekPattern[day] || "";
      html += `<td>
        <select class="input" data-week="${w}" data-day="${day}">
          <option value="">--</option>
          ${shiftOptions}
        </select>
      </td>`;
    });
    html += `</tr>`;
  }
  html += `</tbody></table>`;
  grid.innerHTML = html;
  
  // Now, set the selected values
  for (let w = 1; w <= MAX_WEEKS_IN_ROTATION; w++) {
    const weekPattern = pattern[w] || {};
    DAYS.forEach(day => {
      const shift = weekPattern[day] || "";
      const sel = grid.querySelector(`select[data-week="${w}"][data-day="${day}"]`);
      if (sel) sel.value = shift;
    });
  }
}

async function saveRotation() {
  const familyName = $('#rotationSelect').value;
  if (!familyName) {
    alert("Please select or create a rotation first.");
    return;
  }
  
  const pattern = {};
  for (let w = 1; w <= MAX_WEEKS_IN_ROTATION; w++) {
    pattern[w] = {};
    DAYS.forEach(day => {
      const sel = $(`#rotationEditorGrid select[data-week="${w}"][data-day="${day}"]`);
      if (sel && sel.value) {
        pattern[w][day] = sel.value;
      }
    });
  }
  
  const { data, error } = await sb.from('rotations').upsert({ name: familyName, pattern }, { onConflict: 'name' }).select().single();
  
  if (error) {
    console.error("Error saving rotation:", error);
    alert("Error saving rotation: " + error.message);
  } else {
    ROTATION_FAMILIES.set(data.name, data);
    alert(`Rotation "${data.name}" saved.`);
  }
}

async function newRotation() {
  const familyName = prompt("Enter new rotation family name:");
  if (!familyName) return;
  
  if (ROTATION_FAMILIES.has(familyName)) {
    alert("A rotation with this name already exists.");
    return;
  }
  
  const newRotation = { name: familyName, pattern: {} };
  ROTATION_FAMILIES.set(familyName, newRotation);
  
  // Refresh dropdown
  const sel = $('#rotationSelect');
  sel.insertAdjacentHTML('beforeend', `<option value="${familyName}">${familyName}</option>`);
  sel.value = familyName;
  
  // Render empty grid
  renderRotationGrid(newRotation);
}

async function deleteRotation() {
  const familyName = $('#rotationSelect').value;
  if (!familyName) {
    alert("Please select a rotation to delete.");
    return;
  }
  
  if (!confirm(`Are you sure you want to PERMANENTLY delete the "${familyName}" rotation?\nThis action cannot be undone.`)) {
    return;
  }

  const { error } = await sb.from('rotations').delete().eq('name', familyName);
  
  if (error) {
    console.error("Error deleting rotation:", error);
    alert("Error deleting rotation: " + error.message);
  } else {
    ROTATION_FAMILIES.delete(familyName);
    populateRotationEditor(); // Re-render the whole editor
    alert(`Rotation "${familyName}" deleted.`);
  }
}

/* =========================
   Advisor Assignment (Phase 2)
   ========================= */

window.populateAdvisorAssignments = function() {
  const tableBody = $(`#advisorAssignmentTable tbody`);
  if (!tableBody) return;
  
  const rotationOptions = Array.from(ROTATION_FAMILIES.keys()).sort().map(name => `<option value="${name}">${name}</option>`).join('');
  
  let html = "";
  const advisors = ADVISORS_LIST.sort((a,b) => a.name.localeCompare(b.name));
  
  for (const advisor of advisors) {
    const assignment = ADVISOR_ASSIGNMENTS.get(advisor.id) || {};
    const rotationName = assignment.rotation_name || "";
    const startDate = assignment.start_date || "";
    
    html += `
      <tr data-advisor-id="${advisor.id}">
        <td><strong>${advisor.name}</strong></td>
        <td>
          <select class="input sel-rotation">
            <option value="">-- No Rotation --</option>
            ${rotationOptions}
          </select>
        </td>
        <td>
          <input type="date" class="input input-start-date" value="${startDate}">
        </td>
      </tr>
    `;
  }
  tableBody.innerHTML = html;
  
  // Now, set selected values
  for (const advisor of advisors) {
    const assignment = ADVISOR_ASSIGNMENTS.get(advisor.id) || {};
    const row = tableBody.querySelector(`tr[data-advisor-id="${advisor.id}"]`);
    if (row) {
      row.querySelector('.sel-rotation').value = assignment.rotation_name || "";
    }
  }
  
  // Add event listeners
  $$('#advisorAssignmentTable select, #advisorAssignmentTable input').forEach(el => {
    el.addEventListener('change', (e) => {
      saveStateToHistory(); // Save *before* the change
      
      const row = e.target.closest('tr');
      const advisorId = row.dataset.advisorId;
      
      const newAssignment = {
        advisor_id: advisorId,
        rotation_name: row.querySelector('.sel-rotation').value,
        start_date: row.querySelector('.input-start-date').value
      };
      
      // Update local state
      ADVISOR_ASSIGNMENTS.set(advisorId, newAssignment);
      
      // Upsert to Supabase (fire and forget)
      sb.from('advisor_assignments').upsert(newAssignment, { onConflict: 'advisor_id' }).then(({ error }) => {
        if (error) console.error("Error saving assignment:", error);
      });
      
      // Refresh the schedules
      window.refreshAllSchedules();
    });
  });
}


/* =========================
   Schedules Tree (Right Sidebar)
   ========================= */
window.rebuildTree = function() {
  const t = $('#tree');
  if(!t) return;
  const q = $('#treeSearch').value.trim().toLowerCase();

  // Simplified tree (no leaders/sites yet)
  let html = "";
  const advisors = ADVISORS_LIST.sort((a,b) => a.name.localeCompare(b.name));
  
  advisors.forEach(obj => {
    const name = obj.name;
    if (q && !name.toLowerCase().includes(q)) return;
    
    const checked = selectedAdvisors.has(obj.id) ? 'checked' : '';
    html += `<div class="node">
      <label>
        <input type="checkbox" data-adv-id="${obj.id}" ${checked} data-role="advisor"/>
        <span>${name}</span>
      </label>
    </div>`;
  });

  t.innerHTML = html || '<div class="muted" style="padding: 10px;">No advisors found.</div>';

  // Advisor select
  $$('#tree [data-adv-id]').forEach(ch => {
    ch.onchange = () => {
      const id = ch.dataset.advId;
      ch.checked ? selectedAdvisors.add(id) : selectedAdvisors.delete(id);
      refreshUI();
    };
  });
}

window.refreshChips = function() {
  const box = $('#activeChips');
  if(!box) return;
  box.innerHTML = '';
  if (!selectedAdvisors.size) {
    box.innerHTML = '<span class="muted" style="font-size: 12px;">No advisors selected.</span>';
    return;
  }
  [...selectedAdvisors].map(id => ADVISOR_BY_ID.get(id)).sort((a,b) => a.name.localeCompare(b.name)).forEach(a => {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = a.name;
    const x = document.createElement('button');
    x.innerHTML = '&times;';
    x.style.border='none'; x.style.background='transparent'; x.style.cursor='pointer';
    x.onclick = () => {
      selectedAdvisors.delete(a.id);
      refreshUI();
    };
    chip.appendChild(x);
    box.appendChild(chip);
  });
}

/* =========================
   Top Controls UI
   ========================= */
window.updateRangeLabel = function() {
  const wsEl = $('#weekStart');
  if (!wsEl) return;
  currentWeekStart = wsEl.value; // Update global state
  
  const s = new Date(currentWeekStart + 'T00:00:00');
  const e = new Date(s);
  e.setDate(e.getDate() + 6);
  
  const f = d => d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  
  const dayName = $('#teamDay').value || 'Monday';
  const dayIdx = DAYS.indexOf(dayName);
  const d = new Date(s);
  d.setDate(d.getDate() + dayIdx);
  
  $('#horizontalTitle').textContent = `Team Schedule – ${dayName}, ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}`;
  $('#verticalTitle').textContent = `Advisor Week – ${f(s)} – ${f(e)}`;
}


/* =========================
   CORE SCHEDULING LOGIC
   ========================= */
   
/**
 * This is the new "brain" of the application.
 * It calculates the schedule for a single advisor for a given week.
 * @returns {Object} e.g. { Monday: "7A", Tuesday: "7A", ... }
 */
function getScheduleForAdvisor(advisorId, weekStartISO) {
  const assignment = ADVISOR_ASSIGNMENTS.get(advisorId);
  
  // 1. No assignment? Return empty schedule.
  if (!assignment || !assignment.rotation_name || !assignment.start_date) {
    return {}; // Empty schedule
  }
  
  // 2. Get the assigned rotation family
  const family = ROTATION_FAMILIES.get(assignment.rotation_name);
  if (!family || !family.pattern) {
    console.warn(`Advisor ${advisorId} assigned to non-existent rotation "${assignment.rotation_name}"`);
    return {};
  }
  
  // 3. Calculate the effective week
  const weekNum = effectiveWeek(assignment.start_date, weekStartISO);
  
  // 4. Get the pattern for that specific week
  const weekPattern = family.pattern[weekNum];
  if (!weekPattern) {
    // This rotation might be shorter than 6 weeks, default to week 1
    const defaultPattern = family.pattern[1] || {};
    return defaultPattern;
  }
  
  return weekPattern;
}

/**
 * Gets the schedule for *all selected advisors* for the current week.
 * @returns {Map} A map of `advisorId` -> schedule object
 * e.g., { "123": { Mon: "7A", ... }, "456": { Mon: "RDO", ... } }
 */
function getSchedulesForView() {
  const schedules = new Map();
  const weekStartISO = $('#weekStart').value;
  
  for (const advisorId of selectedAdvisors) {
    const schedule = getScheduleForAdvisor(advisorId, weekStartISO);
    schedules.set(advisorId, schedule);
  }
  return schedules;
}

/* =========================
   Horizontal Planner UI
   ========================= */

window.computePlannerRows = function(schedules) {
  const dayName = $('#teamDay').value || 'Monday';
  const rows = [];
  
  for (const [advisorId, weekSchedule] of schedules.entries()) {
    const advisor = ADVISOR_BY_ID.get(advisorId);
    if (!advisor) continue;
    
    const shiftCode = weekSchedule[dayName] || "RDO"; // Get the shift code for the selected day
    const template = SHIFT_TEMPLATES.get(shiftCode);
    
    let segments = [];
    if (template) {
      // Process template into segments (start, end, break1, lunch, break2)
      const s = toMin(fmt(template.start_time));
      const e = toMin(fmt(template.finish_time));
      if (s !== null && e !== null && e > s) {
        segments.push({ type: 'work', code: shiftCode, start: s, end: e });
        // TODO: Add break/lunch segments
      }
    } else if (shiftCode !== "RDO") {
      console.warn(`Shift template "${shiftCode}" not found.`);
    }

    rows.push({
      id: advisorId,
      name: advisor.name,
      badge: shiftCode,
      segments: segments
    });
  }
  
  return rows.sort((a,b) => a.name.localeCompare(b.name));
}

window.renderPlanner = function(rows) {
  try {
    const body = document.getElementById('plannerBody');
    if (!body) return;
    body.innerHTML = '';
    
    if (rows.length === 0) {
        body.innerHTML = `<div class="planner-empty-state">No advisors selected or no schedules found for this day.</div>`; // TODO: Style this
    }
    
    rows.forEach(r => {
      const row = document.createElement('div');
      row.className = 'planner__row';
      const left = document.createElement('div');
      left.className = 'planner__name';
      left.textContent = r.name;
      
      const badge = document.createElement('span');
      badge.className = 'planner__badge';
      badge.textContent = r.badge;
      left.appendChild(badge);
      row.appendChild(left);
      
      const tl = document.createElement('div');
      tl.className = 'planner__timeline';
      
      r.segments.forEach(s => {
        if (s.start == null || s.end == null || s.end <= s.start) return;
        
        const bar = document.createElement('div');
        bar.className = `planner__bar ${classForCode(s.code)}`;
        
        const pct = m => (m - DAY_START_HC) / DAY_SPAN_HC * 100;
        const leftPct = Math.max(0, pct(s.start));
        const widthPct = Math.max(0, pct(s.end) - leftPct);

        bar.style.left = leftPct + '%';
        bar.style.width = widthPct + '%';
        
        const label = `${s.code} ${m2t(s.start)}–${m2t(s.end)}`;
        bar.dataset.tooltip = label;
        
        if (widthPct > 5) {
            bar.textContent = label;
        }
        
        tl.appendChild(bar);
      });
      row.appendChild(tl);
      body.appendChild(row);
    });
  } catch (e) {
    console.warn('renderPlanner error', e);
  }
}

/* =========================
   Vertical Calendar UI
   ========================= */
function hoursHTML() {
  let h = '';
  for (let i = START_HOUR_VC; i <= END_HOUR_VC; i++) {
    h += `<div class="hour"><span>${String(i).padStart(2,'0')}:00</span></div>`;
  }
  return h;
}
window.setHours = function() {
  const el = $('#hours');
  if (el) el.innerHTML = hoursHTML();
}

function resetGrid() {
  const grid = $('#calGrid');
  if(grid) {
    grid.innerHTML = '<div class="hour-col"><div id="hours"></div></div>';
    $('#hours').innerHTML = hoursHTML();
  }
}

window.renderCalendar = function(schedules) {
  resetGrid();
  const grid = $('#calGrid');
  
  if (schedules.size === 0) {
      // TODO: Show empty state
      return;
  }
  
  // Vertical view only shows the *first selected advisor*
  const firstAdvisorId = schedules.keys().next().value;
  const advisor = ADVISOR_BY_ID.get(firstAdvisorId);
  const weekSchedule = schedules.get(firstAdvisorId);
  
  if (!advisor || !weekSchedule) return;

  $('#verticalTitle').textContent = `${advisor.name}'s Week – ${currentWeekStart}`;

  DAYS.forEach((day, idx) => {
    const col = document.createElement('div');
    col.className = 'day-col';
    
    const d = new Date(currentWeekStart + 'T00:00:00');
    d.setDate(d.getDate() + idx);
    const month = d.toLocaleDateString('en-GB', { month: 'long' });
    const num = d.getDate();
    col.insertAdjacentHTML('beforeend', `<div class="day-head"><small>${month}</small>${day}<span style="float:right">${num}</span></div>`);

    const shiftCode = weekSchedule[day];
    const template = SHIFT_TEMPLATES.get(shiftCode);
    
    const cell = document.createElement('div');
    cell.className = 'timeline-cell';

    if (template) {
      const s = toMin(fmt(template.start_time));
      const e = toMin(fmt(template.finish_time));
      const totalMins = (e - s);
      col.insertAdjacentHTML('beforeend',`<div class="day-summary"><span class="muted">${shiftCode}</span> ${fmt(template.start_time)} – ${fmt(template.finish_time)}<span class="summary-right">${(totalMins/60).toFixed(1)}h</span></div>`);
      
      const top = (s - START_HOUR_VC * 60) * PX_PER_MIN_VC;
      const h = (e - s) * PX_PER_MIN_VC;
      const el = document.createElement('div');
      el.className = `block ${classForCode(shiftCode)}`;
      el.style.top = top + 'px';
      el.style.height = Math.max(16, h) + 'px';
      el.innerHTML = `<div>${shiftCode}<span class="time">${m2t(s)} – ${m2t(e)}</span></div>`;
      el.dataset.tooltip = `${shiftCode} ${m2t(s)}–${m2t(e)}`;
      cell.appendChild(el);
      
    } else {
       col.insertAdjacentHTML('beforeend', `<div class="off">${shiftCode || 'Roster Day Off'}</div>`);
    }

    col.appendChild(cell);
    grid.appendChild(col);
  });
}

/* =========================
   Unified UI Refresh
   ========================= */

/**
 * The new central renderer.
 * Gets all schedules and updates both horizontal and vertical views.
 */
window.refreshAllSchedules = function() {
  const schedules = getSchedulesForView();
  
  // 1. Refresh Horizontal Planner
  const rows = window.computePlannerRows(schedules);
  window.renderPlanner(rows);
  
  // 2. Refresh Vertical Calendar
  window.renderCalendar(schedules);
  
  // 3. Update labels
  window.updateRangeLabel();
}

/**
 * Refreshes all data-driven UI components.
 */
window.refreshUI = function() {
  window.refreshChips();
  window.rebuildTree();
  window.populateAdvisorAssignments();
  window.refreshAllSchedules();
}

/* =========================
   State & Undo/Redo (Phase 1)
   ========================= */
function saveStateToHistory() {
  const state = JSON.stringify(Array.from(ADVISOR_ASSIGNMENTS.entries()));
  
  // If we're in the middle of history, clear the "redo" future
  if (historyIndex < history.length - 1) {
    history = history.slice(0, historyIndex + 1);
  }
  
  // Add the new state
  history.push(state);
  historyIndex = history.length - 1;
  
  // Limit history size
  if (history.length > 20) {
    history.shift();
    historyIndex--;
  }
  
  updateUndoRedoButtons();
}

function applyStateFromHistory(index) {
  if (index < 0 || index >= history.length) return;
  
  const stateString = history[index];
  try {
    const assignmentsArray = JSON.parse(stateString);
    ADVISOR_ASSIGNMENTS = new Map(assignmentsArray);
    historyIndex = index;
    
    // Refresh UI to show the restored state
    window.populateAdvisorAssignments();
    window.refreshAllSchedules();
    updateUndoRedoButtons();
  } catch (e) {
    console.error("Error applying history state:", e);
  }
}

function undo() {
  if (historyIndex > 0) {
    applyStateFromHistory(historyIndex - 1);
  }
}

function redo() {
  if (historyIndex < history.length - 1) {
    applyStateFromHistory(historyIndex + 1);
  }
}

function updateUndoRedoButtons() {
  const btnUndo = $('#btnUndo');
  const btnRedo = $('#btnRedo');
  if (!btnUndo || !btnRedo) return;
  
  btnUndo.disabled = historyIndex <= 0;
  btnRedo.disabled = historyIndex >= history.length - 1;
}

/* =========================
   Tooltip Logic (Phase 3)
   ========================= */
function setupTooltips() {
  const tooltip = $('#tooltip');
  if (!tooltip) return;
  
  // Use event delegation on common ancestors
  const bodies = ['#plannerBody', '#calGrid'];
  
  bodies.forEach(bodySelector => {
    const parent = $(bodySelector);
    if (!parent) return;

    parent.addEventListener('mouseover', (e) => {
      const target = e.target.closest('[data-tooltip]');
      if (!target) return;
      
      tooltip.textContent = target.dataset.tooltip;
      tooltip.style.display = 'block';
      activeTooltip.visible = true;
    });

    parent.addEventListener('mouseout', () => {
      tooltip.style.display = 'none';
      activeTooltip.visible = false;
    });

    parent.addEventListener('mousemove', (e) => {
      if (activeTooltip.visible) {
        tooltip.style.left = (e.clientX + 10) + 'px';
        tooltip.style.top = (e.clientY - 28) + 'px';
      }
    });
  });
}


/* =========================
   Dialogs: Commit Week (Phase 1)
   ========================= */

function openCommitDialog() {
  const commitDlg = $('#commitDlg');
  const summary = $('#commitSummary');
  const list = $('#commitList');
  if (!commitDlg || !summary || !list) return;
  
  const schedules = getSchedulesForView();
  if (schedules.size === 0) {
    alert("Please select advisors to commit.");
    return;
  }
  
  summary.textContent = `This will save the auto-generated schedule for ${schedules.size} advisor(s) for the week starting ${currentWeekStart}.`;
  
  list.innerHTML = `<ul>` +
    Array.from(schedules.keys()).map(id => ADVISOR_BY_ID.get(id).name)
    .sort()
    .map(name => `<li>${name}</li>`).join('') +
    `</ul>`;
  
  commitDlg.showModal();
}

async function doCommit() {
  const commitDlg = $('#commitDlg');
  const schedules = getSchedulesForView();
  const weekStartISO = currentWeekStart;
  
  const recordsToUpsert = [];
  
  for (const [advisorId, weekSchedule] of schedules.entries()) {
    // The `rotas` table stores the *final, historical* schedule.
    // The primary key is (advisor_id, week_start).
    // The `data` column stores the { Mon: "7A", ... } object.
    recordsToUpsert.push({
      advisor_id: advisorId,
      week_start: weekStartISO,
      data: weekSchedule
    });
  }
  
  if (recordsToUpsert.length === 0) {
    commitDlg.close();
    return;
  }

  const { error } = await sb.from('rotas').upsert(recordsToUpsert, { onConflict: 'advisor_id, week_start' });
  
  if (error) {
    console.error("Error committing week:", error);
    alert("Error saving schedules: " + error.message);
  } else {
    alert(`Successfully committed schedules for ${recordsToUpsert.length} advisor(s).`);
  }
  
  commitDlg.close();
}


/* =========================
   Event Wiring
   ========================= */
window.wire = function() {
  // Top Bar
  wireOnce($('#btnToday'), 'click', () => {
    const t = window.setToMonday(new Date());
    $('#weekStart').value = t.toISOString().slice(0, 10);
    window.refreshAllSchedules();
  });
  wireOnce($('#prevWeek'), 'click', () => {
    const d = new Date($('#weekStart').value || new Date());
    d.setDate(d.getDate() - 7);
    $('#weekStart').value = d.toISOString().slice(0, 10);
    window.refreshAllSchedules();
  });
  wireOnce($('#nextWeek'), 'click', () => {
    const d = new Date($('#weekStart').value || new Date());
    d.setDate(d.getDate() + 7);
    $('#weekStart').value = d.toISOString().slice(0, 10);
    window.refreshAllSchedules();
  });
  wireOnce($('#weekStart'), 'change', window.refreshAllSchedules);
  
  // Undo/Redo
  wireOnce($('#btnUndo'), 'click', undo);
  wireOnce($('#btnRedo'), 'click', redo);
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'z') { e.preventDefault(); undo(); }
      if (e.key === 'y') { e.preventDefault(); redo(); }
    }
  });

  // Commit
  wireOnce($('#btnCommitWeek'), 'click', openCommitDialog);
  wireOnce($('#commitOK'), 'click', doCommit);
  
  // Print
  wireOnce($('#btnPrint'), 'click', () => window.print());

  // Planning Hub Tabs
  $$('.tab-button').forEach(btn => {
    wireOnce(btn, 'click', () => {
      const tabId = btn.dataset.tab;
      $$('.tab-button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      $$('.tab-content').forEach(c => c.style.display = 'none');
      $(`#${tabId}`).style.display = 'block';
    });
  });
  
  // Rotation Editor
  wireOnce($('#btnNewRotation'), 'click', newRotation);
  wireOnce($('#btnSaveRotation'), 'click', saveRotation);
  wireOnce($('#btnDeleteRotation'), 'click', deleteRotation);
  
  // Schedules Tree
  wireOnce($('#treeSearch'), 'input', window.rebuildTree);
  wireOnce($('#btnClearSel'), 'click', () => {
    selectedAdvisors.clear();
    refreshUI();
  });
  
  // View Toggle
  wireOnce($('#viewToggleHorizontal'), 'click', () => {
    $('#horizontalView').style.display = 'block';
    $('#verticalView').style.display = 'none';
    $('#viewToggleHorizontal').classList.add('active');
    $('#viewToggleVertical').classList.remove('active');
  });
  wireOnce($('#viewToggleVertical'), 'click', () => {
    $('#horizontalView').style.display = 'none';
    $('#verticalView').style.display = 'block';
    $('#viewToggleHorizontal').classList.remove('active');
    $('#viewToggleVertical').classList.add('active');
  });
  wireOnce($('#teamDay'), 'change', window.refreshAllSchedules);

  // Tooltips
  setupTooltips();
}

/* =========================
   Realtime Subscriptions
   ========================= */
window.subscribeRealtime = function() {
  // TODO: Add subscriptions for new tables
  // This is a placeholder
  sb.channel('any-changes')
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'advisors'
    }, () => window.loadOrg().then(window.rebuildTree))
    .subscribe();
}


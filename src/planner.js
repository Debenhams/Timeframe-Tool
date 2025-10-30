/* --- Professional Rota System - Main Logic (v5) --- */
/*
  This file contains all application state, data fetching,
  business logic, and rendering functions.
*/

// --- App State ---
const STATE = {
  org: {}, // { "Leader Name": [{id, name, leader_id}, ...], ... }
  advisors: new Map(), // { id => {id, name, leader_id} }
  leaders: new Map(), // { id => {id, name, site_id} }
  shiftTemplates: new Map(), // { "7A" => {code, start_time, ...} }
  rotationPatterns: new Map(), // { "Flex 1" => { "Week 1": { "MON": "7A", ... } } }
  rotationAssignments: new Map(), // { advisor_id => {rotation_name, start_date} }
  selectedAdvisors: new Set(), // { advisor_id, ... }
  isLoading: true,
  history: [], // For Undo/Redo
  historyIndex: -1,
};

// --- UI Element Cache ---
// Caching elements we use often for performance
const UI = {
  loadingOverlay: null,
  toast: null,
  weekStart: null,
  teamDay: null,
  plannerTitle: null,
  plannerHeader: null,
  plannerBody: null,
  treeContainer: null,
  checkSelectAll: null,
  tabButtons: null,
  tabContents: null,
  rotationSelect: null,
  rotationEditorGrid: null,
  assignmentTableBody: null,
  btnNewRotation: null,
  btnSaveRotation: null,
  btnDeleteRotation: null,
};

// --- Constants ---
const DAYS_OF_WEEK = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const PLANNER_START_HOUR = 6;
const PLANNER_END_HOUR = 20; // 6am to 8pm (14 hours)
const PLANNER_HOUR_SPAN = PLANNER_END_HOUR - PLANNER_START_HOUR;

/**
 * Main function to initialize the application.
 * Fetches all data, builds initial state, and renders the UI.
 * @returns {Promise<void>}
 */
async function bootApplication() {
  console.log("Booting application...");
  setLoading(true);
  try {
    // Cache all UI elements
    cacheUIElements();
    
    // Fetch all core data from Supabase in parallel
    const [
      leadersData,
      advisorsData,
      templatesData,
      patternsData,
      assignmentsData,
    ] = await Promise.all([
      supabase.from("leaders").select("*"),
      supabase.from("advisors").select("*"),
      supabase.from("shift_templates").select("*"),
      supabase.from("rotation_patterns").select("*"),
      supabase.from("rotation_assignments").select("*"),
    ]);

    // Process and store data in STATE
    processOrgData(leadersData.data || [], advisorsData.data || []);
    processTemplates(templatesData.data || []);
    processRotationPatterns(patternsData.data || []);
    processRotationAssignments(assignmentsData.data || []);

    // Render all UI components with the new data
    renderSchedulesTree();
    renderRotationEditor();
    renderAssignmentTable();
    renderPlannerHeader();
    
    // *** THIS IS THE FIX ***
    // We MUST set the default week start date *BEFORE* we call renderPlanner()
    // which depends on this value.
    const today = new Date();
    const monday = getMonday(today);
    UI.weekStart.value = formatDate(monday);
    
    // Now that the date is set, we can render the planner
    renderPlanner();
    
    // Save initial state for Undo
    saveHistory();

    console.log("Boot complete. State:", STATE);
    showToast("Application loaded successfully.", "success");
  } catch (error) {
    console.error("Boot failed:", error);
    showToast(`Error loading application: ${error.message}`, "error");
  } finally {
    setLoading(false);
  }
}

/**
 * Caches frequently accessed DOM elements into the UI object.
 */
function cacheUIElements() {
  UI.loadingOverlay = document.getElementById("loadingOverlay");
  UI.toast = document.getElementById("toastNotification");
  UI.weekStart = document.getElementById("weekStart");
  UI.teamDay = document.getElementById("teamDay");
  UI.plannerTitle = document.getElementById("plannerTitle");
  UI.plannerHeader = document.getElementById("plannerTimelineHeader");
  UI.plannerBody = document.getElementById("plannerBody");
  UI.treeContainer = document.getElementById("tree-container");
  UI.checkSelectAll = document.getElementById("checkSelectAllAdvisors");
  UI.tabButtons = document.querySelectorAll(".tab-btn");
  UI.tabContents = document.querySelectorAll(".tab-content");
  UI.rotationSelect = document.getElementById("rotationSelect");
  UI.rotationEditorGrid = document.getElementById("rotationEditorGrid");
  UI.assignmentTableBody = document.getElementById("assignmentTableBody");
  UI.btnNewRotation = document.getElementById("btnNewRotation");
  UI.btnSaveRotation = document.getElementById("btnSaveRotation");
  UI.btnDeleteRotation = document.getElementById("btnDeleteRotation");
}

// --- Data Processing Functions ---

/**
 * Processes leaders and advisors into a hierarchical org structure
 * and populates the Map caches.
 * @param {Array} leaders - Array of leader objects from Supabase.
 * @param {Array} advisors - Array of advisor objects from Supabase.
 */
function processOrgData(leaders, advisors) {
  STATE.org = {};
  STATE.leaders.clear();
  STATE.advisors.clear();

  leaders.forEach((leader) => {
    STATE.leaders.set(leader.id, leader);
    STATE.org[leader.name] = [];
  });

  advisors.forEach((advisor) => {
    STATE.advisors.set(advisor.id, advisor);
    const leader = STATE.leaders.get(advisor.leader_id);
    if (leader && STATE.org[leader.name]) {
      STATE.org[leader.name].push(advisor);
    } else {
      // Handle advisors with no leader
      if (!STATE.org["Unassigned"]) {
        STATE.org["Unassigned"] = [];
      }
      STATE.org["Unassigned"].push(advisor);
    }
  });

  // Sort leaders and advisors alphabetically
  const sortedOrg = {};
  Object.keys(STATE.org)
    .sort()
    .forEach((leaderName) => {
      sortedOrg[leaderName] = STATE.org[leaderName].sort((a, b) =>
        a.name.localeCompare(b.name)
      );
    });
  STATE.org = sortedOrg;
}

/**
 * Processes shift templates into a Map.
 * @param {Array} templates - Array of template objects from Supabase.
 */
function processTemplates(templates) {
  STATE.shiftTemplates.clear();
  // Add a "blank" template for empty slots
  STATE.shiftTemplates.set("--", { code: "--", name: "None" });
  templates.sort((a, b) => a.code.localeCompare(b.code));
  templates.forEach((t) => STATE.shiftTemplates.set(t.code, t));
}

/**
 * Processes rotation patterns into a Map.
 * Data is stored in Supabase as: { name: "Flex 1", pattern: { "Week 1": { "MON": "7A", ... } } }
 * @param {Array} patterns - Array of pattern objects from Supabase.
 */
function processRotationPatterns(patterns) {
  STATE.rotationPatterns.clear();
  patterns.forEach((p) => {
    STATE.rotationPatterns.set(p.name, p.pattern || {});
  });
}

/**
 * Processes advisor assignments into a Map.
 * @param {Array} assignments - Array of assignment objects from Supabase.
 */
function processRotationAssignments(assignments) {
  STATE.rotationAssignments.clear();
  assignments.forEach((a) => {
    STATE.rotationAssignments.set(a.advisor_id, {
      rotation_name: a.rotation_name,
      start_date: a.start_date,
    });
  });
}

// --- UI Rendering Functions ---

/**
 * Renders the hierarchical Schedules tree with leaders and advisors.
 */
function renderSchedulesTree() {
  if (!UI.treeContainer) return;
  
  const treeHTML = Object.entries(STATE.org)
    .map(([leaderName, advisors]) => {
      const leaderId = advisors[0]?.leader_id || leaderName; // Use name as fallback ID
      const advisorNodes = advisors
        .map(
          (adv) => `
        <div class="advisor-node">
          <input type="checkbox" id="adv-${adv.id}" data-id="${adv.id}" class="adv-check" />
          <label for="adv-${adv.id}">${adv.name}</label>
        </div>`
        )
        .join("");

      return `
      <details open>
        <summary>
          <span class="twisty">▼</span>
          <input type="checkbox" id="lead-${leaderId}" data-leader-id="${leaderId}" class="lead-check" />
          <label for="lead-${leaderId}">${leaderName}</label>
        </summary>
        ${advisorNodes}
      </details>`;
    })
    .join("");
  
  UI.treeContainer.innerHTML = treeHTML;
}

/**
 * Renders the Rotation Editor tab, filling the dropdown and the grid.
 */
function renderRotationEditor() {
  if (!UI.rotationSelect) return;

  // 1. Populate the "Rotation Family" dropdown
  const rotationNames = ["", ...STATE.rotationPatterns.keys()].sort();
  UI.rotationSelect.innerHTML = rotationNames
    .map((name) => `<option value="${name}">${name || "-- Select Rotation --"}</option>`)
    .join("");

  // 2. Build the 6-week grid
  let gridHTML = `<div class="grid-header"></div>`;
  DAYS_OF_WEEK.forEach(
    (day) => (gridHTML += `<div class="grid-header">${day}</div>`)
  );

  const shiftOptions = [...STATE.shiftTemplates.keys()]
    .map((code) => `<option value="${code}">${code}</option>`)
    .join("");

  for (let w = 1; w <= 6; w++) {
    gridHTML += `<div class="week-label">Week ${w}</div>`;
    DAYS_OF_WEEK.forEach((day) => {
      gridHTML += `
        <div>
          <select class="input" data-week="${w}" data-day="${day}">
            ${shiftOptions}
          </select>
        </div>`;
    });
  }
  UI.rotationEditorGrid.innerHTML = gridHTML;

  // 3. Load the selected rotation pattern into the grid
  loadRotationPatternIntoGrid();
}

/**
 * Renders the Advisor Assignments table.
 */
function renderAssignmentTable() {
  if (!UI.assignmentTableBody) return;
  
  const rotationOptions = ["", ...STATE.rotationPatterns.keys()]
    .sort()
    .map((name) => `<option value="${name}">${name || "-- None --"}</option>`)
    .join("");

  let tableHTML = "";
  // Iterate over advisors in the same order as the tree
  Object.values(STATE.org).forEach(advisors => {
    advisors.forEach(adv => {
      const assignment = STATE.rotationAssignments.get(adv.id) || {};
      const rotationName = assignment.rotation_name || "";
      const startDate = assignment.start_date || "";

      tableHTML += `
        <tr data-advisor-id="${adv.id}">
          <td>${adv.name}</td>
          <td>
            <select class="input rotation-assign-select" data-advisor-id="${adv.id}">
              ${rotationOptions}
            </select>
          </td>
          <td>
            <input type="text" class="input rotation-start-date" data-advisor-id="${adv.id}" value="${startDate}" placeholder="YYYY-MM-DD" />
          </td>
        </tr>`;
    });
  });

  UI.assignmentTableBody.innerHTML = tableHTML;

  // Now that rows exist, populate values and attach pickers
  UI.assignmentTableBody.querySelectorAll("tr").forEach(row => {
    const advId = row.dataset.advisorId;
    const assignment = STATE.rotationAssignments.get(advId) || {};
    
    // Set selected rotation
    const select = row.querySelector(".rotation-assign-select");
    if (select) {
      select.value = assignment.rotation_name || "";
    }

    // Attach Flatpickr
    const dateInput = row.querySelector(".rotation-start-date");
    if (dateInput) {
      flatpickr(dateInput, {
        dateFormat: "Y-m-d",
        allowInput: true,
        onChange: function (selectedDates, dateStr, instance) {
          handleAssignmentChange(advId, "start_date", dateStr);
        },
      });
    }
  });
}

/**
 * Renders the header (ticks) for the horizontal planner.
 */
function renderPlannerHeader() {
  if (!UI.plannerHeader) return;
  
  let headerHTML = "";
  for (let h = PLANNER_START_HOUR; h < PLANNER_END_HOUR; h++) {
    const left = ((h - PLANNER_START_HOUR) / PLANNER_HOUR_SPAN) * 100;
    headerHTML += `<div class="tick" style="left: ${left}%;">${h}:00</div>`;
  }
  // Add final tick
  headerHTML += `<div class="tick" style="left: 100%;">${PLANNER_END_HOUR}:00</div>`;
  UI.plannerHeader.innerHTML = headerHTML;
  
  // Set the background-size for the grid lines
  const tickPercentage = (1 / PLANNER_HOUR_SPAN) * 100;
  UI.plannerBody.style.backgroundSize = `${tickPercentage}% 100%`;
}

/**
 * Renders the main horizontal planner body with advisor schedules.
 */
function renderPlanner() {
  if (!UI.plannerBody) return;
  
  const plannerDate = new Date(UI.weekStart.value + "T00:00:00");
  const dayIndex = DAYS_OF_WEEK.indexOf(UI.teamDay.value.toUpperCase().slice(0, 3));
  if (dayIndex === -1) {
    UI.plannerBody.innerHTML = "Invalid day selected.";
    return;
  }
  
  plannerDate.setDate(plannerDate.getDate() + dayIndex);
  const targetDateStr = formatDate(plannerDate);
  UI.plannerTitle.textContent = `Team Schedule - ${targetDateStr}`;

  let plannerHTML = "";
  const selectedAdvArray = [...STATE.selectedAdvisors].sort((aId, bId) => {
    const aName = STATE.advisors.get(aId)?.name || "";
    const bName = STATE.advisors.get(bId)?.name || "";
    return aName.localeCompare(bName);
  });

  if (selectedAdvArray.length === 0) {
    UI.plannerBody.innerHTML = `<div class="planner-row-name" style="grid-column: 1 / -1; text-align: center; padding: 20px;">No advisors selected. Check boxes in the 'Schedules' panel.</div>`;
    return;
  }

  selectedAdvArray.forEach((advId) => {
    const advisor = STATE.advisors.get(advId);
    if (!advisor) return;

    const segments = calculateSegmentsForAdvisor(advId, targetDateStr);
    
    let barsHTML = "";
    segments.forEach(seg => {
      const left = timeToPercentage(seg.start_min);
      const right = timeToPercentage(seg.end_min);
      const width = right - left;
      const colorClass = getBarColorClass(seg.code);
      const isShort = width < 8;

      barsHTML += `
        <div class="planner-bar ${colorClass} ${isShort ? 'short' : ''}" 
             style="left: ${left}%; width: ${width}%;"
             title="${seg.code} (${formatTime(seg.start_min)} - ${formatTime(seg.end_min)})">
          <span class="planner-bar-label">${seg.code}</span>
          <span class="planner-bar-time">
            ${formatTime(seg.start_min)} - ${formatTime(seg.end_min)}
          </span>
        </div>`;
    });

    plannerHTML += `
      <div class="planner-row">
        <div class="planner-row-name">${advisor.name}</div>
        <div class="planner-row-timeline">${barsHTML}</div>
      </div>`;
  });

  UI.plannerBody.innerHTML = plannerHTML;
}

// --- Business Logic & Data Calculation ---

/**
 * Calculates the final schedule segments for an advisor on a specific date.
 * This is the core logic engine.
 * @param {string} advId - The advisor's ID.
 * @param {string} targetDateStr - The target date in "YYYY-MM-DD" format.
 * @returns {Array} - An array of segment objects: { code, start_min, end_min }.
 */
function calculateSegmentsForAdvisor(advId, targetDateStr) {
  const assignment = STATE.rotationAssignments.get(advId);
  if (!assignment || !assignment.rotation_name || !assignment.start_date) {
    return []; // No rotation assigned
  }

  const pattern = STATE.rotationPatterns.get(assignment.rotation_name);
  if (!pattern) {
    console.warn(`Pattern "${assignment.rotation_name}" not found.`);
    return []; // Rotation pattern doesn't exist
  }
  
  // 1. Calculate effective week
  const effectiveWeekNum = getEffectiveWeek(assignment.start_date, targetDateStr);
  const weekKey = `Week ${effectiveWeekNum}`;
  const weekPattern = pattern[weekKey];
  if (!weekPattern) {
    console.warn(`Week ${effectiveWeekNum} not found in pattern "${assignment.rotation_name}".`);
    return []; // Week not defined in pattern
  }

  // 2. Get shift code for the target day
  const targetDay = new Date(targetDateStr + "T00:00:00");
  const dayKey = DAYS_OF_WEEK[targetDay.getUTCDay() - 1] || DAYS_OF_WEEK[6]; // 1 (Mon) - 6 (Sat), 0 (Sun)
  const shiftCode = weekPattern[dayKey];
  if (!shiftCode || shiftCode === "--" || shiftCode === "RDO") {
    return []; // Day off or no shift
  }

  // 3. Get shift template details
  const template = STATE.shiftTemplates.get(shiftCode);
  if (!template) {
    console.warn(`Shift template "${shiftCode}" not found.`);
    return []; // Template doesn't exist
  }

  // 4. Build segments (shift + breaks)
  const segments = [];
  const shiftStart = timeToMinutes(template.start_time);
  const shiftEnd = timeToMinutes(template.end_time);

  if (shiftStart === null || shiftEnd === null || shiftEnd <= shiftStart) {
    return []; // Invalid shift times
  }

  const breaks = [
    { code: "Break", start: timeToMinutes(template.break1), duration: 15 },
    { code: "Lunch", start: timeToMinutes(template.lunch), duration: 30 },
    { code: "Break", start: timeToMinutes(template.break2), duration: 15 },
  ]
    .filter(b => b.start !== null && b.start >= shiftStart && b.start < shiftEnd)
    .sort((a, b) => a.start - b.start);

  let currentMin = shiftStart;
  
  // Add work segments around breaks
  for (const br of breaks) {
    if (br.start > currentMin) {
      segments.push({
        code: template.code,
        start_min: currentMin,
        end_min: br.start,
      });
    }
    segments.push({
      code: br.code,
      start_min: br.start,
      end_min: br.start + br.duration,
    });
    currentMin = br.start + br.duration;
  }

  // Add final work segment
  if (currentMin < shiftEnd) {
    segments.push({
      code: template.code,
      start_min: currentMin,
      end_min: shiftEnd,
    });
  }

  return segments;
}

/**
 * Calculates the effective week number (1-6) of a rotation.
 * @param {string} startDateStr - The "Week 1" start date ("YYYY-MM-DD").
 * @param {string} targetDateStr - The date to check ("YYYY-MM-DD").
 * @returns {number} - The week number (1-6).
 */
function getEffectiveWeek(startDateStr, targetDateStr) {
  const startDate = new Date(startDateStr + "T00:00:00");
  const targetDate = new Date(targetDateStr + "T00:00:00");
  
  const diffTime = targetDate.getTime() - startDate.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  const diffWeeks = Math.floor(diffDays / 7);
  
  const pattern = STATE.rotationPatterns.get(assignment.rotation_name);
  const numWeeksInPattern = (pattern && Object.keys(pattern).length > 0) ? 
    Object.keys(pattern).length : 6;

  return (diffWeeks % numWeeksInPattern + numWeeksInPattern) % numWeeksInPattern + 1;
}

/**
 * Loads the selected rotation pattern from STATE into the editor grid.
 */
function loadRotationPatternIntoGrid() {
  const rotationName = UI.rotationSelect.value;
  const pattern = STATE.rotationPatterns.get(rotationName) || {};

  for (let w = 1; w <= 6; w++) {
    const weekPattern = pattern[`Week ${w}`] || {};
    DAYS_OF_WEEK.forEach((day) => {
      const code = weekPattern[day] || "--";
      const sel = UI.rotationEditorGrid.querySelector(
        `select[data-week="${w}"][data-day="${day}"]`
      );
      if (sel) {
        sel.value = code;
      }
    });
  }
}

// --- Event Handlers ---

/**
 * Handles all clicks on the main document using event delegation.
 * @param {Event} e - The click event.
 */
function handleDocumentClick(e) {
  const target = e.target;

  // Tab switching
  if (target.matches(".tab-btn")) {
    const tabId = target.dataset.tab;
    UI.tabButtons.forEach((btn) => btn.classList.remove("active"));
    UI.tabContents.forEach((content) => content.classList.remove("active"));
    target.classList.add("active");
    document.getElementById(tabId).classList.add("active");
  }

  // Rotation Editor: New
  if (target.id === "btnNewRotation") {
    const name = prompt("Enter new rotation family name:");
    if (name && !STATE.rotationPatterns.has(name)) {
      STATE.rotationPatterns.set(name, {});
      renderRotationEditor();
      UI.rotationSelect.value = name;
      loadRotationPatternIntoGrid();
      showToast(`Rotation "${name}" created.`, "success");
    } else if (name) {
      alert(`Rotation name "${name}" already exists.`);
    }
  }

  // Rotation Editor: Save
  if (target.id === "btnSaveRotation") {
    handleSaveRotation();
  }

  // Rotation Editor: Delete
  if (target.id === "btnDeleteRotation") {
    handleDeleteRotation();
  }

  // Schedules Tree: Clear Selection
  if (target.id === "btnClearSelection") {
    STATE.selectedAdvisors.clear();
    document.querySelectorAll('.adv-check, .lead-check, #checkSelectAllAdvisors')
      .forEach(cb => cb.checked = false);
    renderPlanner();
  }

  // Top Bar Controls
  if (target.id === "btnToday") {
    UI.weekStart.value = formatDate(getMonday(new Date()));
    renderPlanner();
  }
  if (target.id === "prevWeek") {
    const d = new Date(UI.weekStart.value + "T00:00:00");
    d.setDate(d.getDate() - 7);
    UI.weekStart.value = formatDate(d);
    renderPlanner();
  }
  if (target.id === "nextWeek") {
    const d = new Date(UI.weekStart.value + "T00:00:00");
    d.setDate(d.getDate() + 7);
    UI.weekStart.value = formatDate(d);
    renderPlanner();
  }
  
  // Undo/Redo
  if (target.id === "btnUndo") handleUndo();
  if (target.id === "btnRedo") handleRedo();

  // Commit Week
  if (target.id === "btnCommitWeek") {
    // Placeholder for commit logic
    showToast("Commit Week function not yet implemented.", "success");
  }

  // Print
  if (target.id === "btnPrint") {
    window.print();
  }
}

/**
 * Handles all change events on the main document using event delegation.
 * @param {Event} e - The change event.
 */
function handleChange(e) {
  const target = e.target;

  // Week Start or Team Day changed
  if (target.id === "weekStart" || target.id === "teamDay") {
    renderPlanner();
  }

  // Rotation Editor: Dropdown changed
  if (target.id === "rotationSelect") {
    loadRotationPatternIntoGrid();
  }

  // Advisor Assignments: Rotation assigned
  if (target.matches(".rotation-assign-select")) {
    handleAssignmentChange(
      target.dataset.advisorId,
      "rotation_name",
      target.value
    );
  }

  // Schedules Tree: Checkboxes
  if (target.matches("#checkSelectAllAdvisors")) {
    const isChecked = target.checked;
    document.querySelectorAll('.adv-check, .lead-check').forEach(cb => cb.checked = isChecked);
    if (isChecked) {
      STATE.selectedAdvisors = new Set(STATE.advisors.keys());
    } else {
      STATE.selectedAdvisors.clear();
    }
    renderPlanner();
  }
  
  if (target.matches(".lead-check")) {
    const isChecked = target.checked;
    const details = target.closest('details');
    details.querySelectorAll('.adv-check').forEach(cb => {
      cb.checked = isChecked;
      const advId = cb.dataset.id;
      if (isChecked) {
        STATE.selectedAdvisors.add(advId);
      } else {
        STATE.selectedAdvisors.delete(advId);
      }
    });
    renderPlanner();
  }

  if (target.matches(".adv-check")) {
    const advId = target.dataset.id;
      if (target.checked) {
        STATE.selectedAdvisors.add(advId);
      } else {
        STATE.selectedAdvisors.delete(advId);
      }
    renderPlanner();
  }
}

/**
 * Handles saving the currently edited rotation pattern to state and Supabase.
 */
async function handleSaveRotation() {
  const rotationName = UI.rotationSelect.value;
  if (!rotationName) {
    alert("Please select a rotation to save.");
    return;
  }

  setLoading(true);
  const pattern = {};
  for (let w = 1; w <= 6; w++) {
    const weekKey = `Week ${w}`;
    pattern[weekKey] = {};
    DAYS_OF_WEEK.forEach((day) => {
      const sel = UI.rotationEditorGrid.querySelector(
        `select[data-week="${w}"][data-day="${day}"]`
      );
      if (sel.value !== "--") {
        pattern[weekKey][day] = sel.value;
      }
    });
  }

  // Save to state
  STATE.rotationPatterns.set(rotationName, pattern);

  // Save to Supabase
  try {
    const { error } = await supabase
      .from("rotation_patterns")
      .upsert({ name: rotationName, pattern: pattern }, { onConflict: "name" });
    
    if (error) throw error;
    
    saveHistory(); // Save state on successful save
    showToast(`Rotation "${rotationName}" saved successfully.`, "success");
    renderPlanner(); // Re-render planner in case assignments depend on this
  } catch (error) {
    console.error("Error saving rotation:", error);
    showToast(`Error saving rotation: ${error.message}`, "error");
  } finally {
    setLoading(false);
  }
}

/**
 * Handles deleting a rotation pattern.
 */
async function handleDeleteRotation() {
  const rotationName = UI.rotationSelect.value;
  if (!rotationName) {
    alert("Please select a rotation to delete.");
    return;
  }
  
  if (!confirm(`Are you sure you want to delete the rotation "${rotationName}"? This cannot be undone.`)) {
    return;
  }

  setLoading(true);
  try {
    // Delete from Supabase
    const { error } = await supabase
      .from("rotation_patterns")
      .delete()
      .eq("name", rotationName);
      
    if (error) throw error;

    // Delete from state
    STATE.rotationPatterns.delete(rotationName);
    
    // Clear any assignments that used this rotation
    // (This is a choice - we could also just leave them stale)
    STATE.rotationAssignments.forEach((assign, advId) => {
      if (assign.rotation_name === rotationName) {
        STATE.rotationAssignments.delete(advId);
        // Also clear from Supabase
        supabase.from("rotation_assignments").delete().eq("advisor_id", advId);
      }
    });

    saveHistory();
    showToast(`Rotation "${rotationName}" deleted.`, "success");
    
    // Re-render UI
    renderRotationEditor();
    renderAssignmentTable();
    renderPlanner();
  } catch (error) {
    console.error("Error deleting rotation:", error);
    showToast(`Error deleting rotation: ${error.message}`, "error");
  } finally {
    setLoading(false);
  }
}


/**
 * Handles changes in the Advisor Assignments table and saves to Supabase.
 * @param {string} advId - The advisor ID.
 *key {string} - The field being changed ("rotation_name" or "start_date").
 * @param {string} value - The new value.
 */
async function handleAssignmentChange(advId, key, value) {
  if (!advId) return;

  // 1. Update local state
  const assignment = STATE.rotationAssignments.get(advId) || {};
  assignment[key] = value;
  STATE.rotationAssignments.set(advId, assignment);

  // 2. Debounce the save to Supabase
  // Create a unique key for this advisor's save operation
  const debounceKey = `assign_${advId}`;
  
  if (window[debounceKey]) {
    clearTimeout(window[debounceKey]);
  }

  window[debounceKey] = setTimeout(async () => {
    setLoading(true);
    try {
      const { error } = await supabase.from("rotation_assignments").upsert(
        {
          advisor_id: advId,
          rotation_name: assignment.rotation_name,
          start_date: assignment.start_date,
        },
        { onConflict: "advisor_id" }
      );
      if (error) throw error;
      
      saveHistory(); // Save state on successful assignment
      showToast(
        `Assignment for ${STATE.advisors.get(advId)?.name} saved.`,
        "success"
      );
      renderPlanner(); // Re-render the planner with new data
    } catch (error) {
      console.error("Error saving assignment:", error);
      showToast(`Error saving assignment: ${error.message}`, "error");
    } finally {
      setLoading(false);
      window[debounceKey] = null;
    }
  }, 1000); // Wait 1 second after last change to save
}

// --- History (Undo/Redo) Functions ---

/**
 * Saves a deep copy of the current state to the history buffer.
 */
function saveHistory() {
  // Prune future states if we are undoing
  if (STATE.historyIndex < STATE.history.length - 1) {
    STATE.history = STATE.history.slice(0, STATE.historyIndex + 1);
  }
  
  // Create a snapshot of the parts of state we want to undo
  const snapshot = {
    rotationPatterns: new Map(STATE.rotationPatterns),
    rotationAssignments: new Map(STATE.rotationAssignments),
  };
  
  STATE.history.push(snapshot);
  
  // Limit history to 20 steps
  if (STATE.history.length > 20) {
    STATE.history.shift();
  }
  
  STATE.historyIndex = STATE.history.length - 1;
}

/**
 * Restores the state to the previous point in history.
 */
function handleUndo() {
  if (STATE.historyIndex <= 0) {
    showToast("Nothing more to undo.", "success");
    return;
  }
  STATE.historyIndex--;
  restoreState(STATE.history[STATE.historyIndex]);
  showToast("Undo successful.", "success");
}

/**
 * Restores the state to the next point in history (Redo).
 */
function handleRedo() {
  if (STATE.historyIndex >= STATE.history.length - 1) {
    showToast("Nothing to redo.", "success");
    return;
  }
  STATE.historyIndex++;
  restoreState(STATE.history[STATE.historyIndex]);
  showToast("Redo successful.", "success");
}

/**
 * Restores the application state from a history snapshot.
 * @param {object} snapshot - The state snapshot to restore.
 */
function restoreState(snapshot) {
  STATE.rotationPatterns = new Map(snapshot.rotationPatterns);
  STATE.rotationAssignments = new Map(snapshot.rotationAssignments);

  // Re-render all components that depend on this state
  renderRotationEditor();
  renderAssignmentTable();
  renderPlanner();
}

// --- Helper & Utility Functions ---

/**
 * Shows or hides the global loading overlay.
 * @param {boolean} isLoading - Whether to show the loader.
 */
function setLoading(isLoading) {
  STATE.isLoading = isLoading;
  if (UI.loadingOverlay) {
    UI.loadingOverlay.classList.toggle("hidden", !isLoading);
  }
}

/**
 * Shows a toast notification.
 * @param {string} message - The text to display.
 * @param {string} type - "success" or "error".
 */
let toastTimer;
function showToast(message, type = "success") {
  if (!UI.toast) return;
  
  clearTimeout(toastTimer);
  
  UI.toast.textContent = message;
  UI.toast.className = type;
  UI.toast.classList.add("show");

  toastTimer = setTimeout(() => {
    UI.toast.classList.remove("show");
  }, 3000);
}

/**
 * Gets the Monday of a given date.
 * @param {Date} d - The input date.
 * @returns {Date} - The Monday of that week.
 */
function getMonday(d) {
  d = new Date(d);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
  return new Date(d.setDate(diff));
}

/**
 * Formats a Date object as "YYYY-MM-DD".
 * @param {Date} date - The input date.
 * @returns {string} - The formatted date string.
 */
function formatDate(date) {
  return date.toISOString().split("T")[0];
}

/**
 * Converts "HH:MM:SS" or "HH:MM" to minutes from midnight.
 * @param {string} timeStr - The time string.
 * @returns {number|null} - Minutes from midnight or null.
 */
function timeToMinutes(timeStr) {
  if (!timeStr) return null;
  const parts = timeStr.split(":");
  if (parts.length < 2) return null;
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  if (isNaN(hours) || isNaN(minutes)) return null;
  return hours * 60 + minutes;
}

/**
 * Formats minutes from midnight as "HH:MM".
 * @param {number} min - Minutes from midnight.
 * @returns {string} - The formatted time string.
 */
function formatTime(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Converts minutes from midnight to a CSS percentage for the planner.
 * @param {number} min - Minutes from midnight.
 * @returns {number} - The CSS `left` or `width` percentage.
 */
function timeToPercentage(min) {
  const startMin = PLANNER_START_HOUR * 60;
  const endMin = PLANNER_END_HOUR * 60;
  const spanMin = endMin - startMin;
  
  const clampedMin = Math.max(startMin, Math.min(endMin, min));
  return ((clampedMin - startMin) / spanMin) * 100;
}

/**
 * Gets the appropriate CSS color class for a shift code.
 * @param {string} code - The shift code.
 * @returns {string} - The CSS class name.
 */
function getBarColorClass(code) {
  if (!code) return "bar-color-default";
  const k = code.toLowerCase();
  if (k === "rdo") return "bar-color-rdo";
  if (k === "lunch") return "bar-color-lunch";
  if (k === "break") return "bar-color-break";
  if (k.includes("email")) return "bar-color-email";
  if (k.includes("mirakl")) return "bar-color-mirakl";
  if (k.includes("social")) return "bar-color-social";
  if (k.includes("overtime")) return "bar-color-overtime";
  if (k.includes("meeting")) return "bar-color-meeting";
  if (k.includes("absence")) return "bar-color-absence";
  if (k.includes("shrink")) return "bar-color-shrink";
  return "bar-color-default";
}

// --- Expose key functions to the init script ---
window.App = {
  bootApplication,
  handleDocumentClick,
  handleChange,
};



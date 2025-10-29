/*
  This file should be placed in a 'src' folder.
  It controls the application startup sequence.
*/
document.addEventListener("DOMContentLoaded", async () => {
    // Check if all necessary functions are loaded from planner.js
    if (typeof window.loadOrg !== 'function' || typeof window.wire !== 'function') {
        console.error("Critical functions from planner.js are missing. Initialization halted.");
        alert("Error: Application files failed to load. Please refresh.");
        return;
    }

    console.log("Initializing application...");
    
    // 1. Static UI setup
    window.buildColorKey();
    const t = window.setToMonday(new Date());
    const weekStartEl = window.$('#weekStart');
    if(weekStartEl) {
        weekStartEl.value = t.toISOString().slice(0, 10);
    }
    window.setHours(); // Vertical calendar hours
    window.renderTimeHeader(window.$('#timeHeader')); // Horizontal planner hours
    
    // 2. Load core data
    try {
        await window.loadOrg();
        await window.loadTemplates();
        await window.bootRotations(); // Load rotation data
        if(weekStartEl) {
            await window.fetchRotasForWeek(weekStartEl.value); // Load schedules for current week
        }
    } catch (e) {
        console.warn("Error loading initial data", e);
    }
    
    // 3. Populate UI with data
    window.rebuildAdvisorDropdown();
    window.rebuildTree();
    window.refreshChips();
    window.populateTemplateEditor();
    window.populateAssignTable();
    window.updateRangeLabel();
    window.populateRotationSelect(); // Populate rotation dropdown
    
    // 4. Initial Render
    window.renderCalendar(); // Vertical
    window.refreshPlannerUI(); // Horizontal
    
    // 5. Wire events
    window.wire();
    
    // 6. Subscribe to realtime changes
    window.subscribeRealtime();
    
    console.log("Application initialized.");
});

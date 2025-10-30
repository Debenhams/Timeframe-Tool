/*
  VERSION 3: The "Big Leap" Update

  - Initializes the new "Rotation-First" workflow.
  - Loads all new data models (Rotations, Assignments).
  - Wires up all new UI components (Tabs, Editors, Undo/Redo).
*/
document.addEventListener("DOMContentLoaded", async () => {
    // Check if all necessary functions are loaded from planner.js
    if (typeof window.loadOrg !== 'function' || typeof window.wire !== 'function') {
        console.error("Critical functions from planner.js are missing. Initialization halted.");
        alert("Error: Application files failed to load. Please refresh.");
        return;
    }

    console.log("Initializing Professional Rota System v3...");
    
    // 1. Static UI setup
    const weekStartEl = window.$('#weekStart');
    if(weekStartEl) {
        const today = new Date();
        const monday = window.setToMonday(today);
        weekStartEl.value = monday.toISOString().slice(0, 10);
    }
    window.setHours(); // Vertical calendar hours
    window.renderTimeHeader(window.$('#timeHeader')); // Horizontal planner hours
    
    // 2. Load ALL core data
    try {
        console.log("Loading data from Supabase...");
        await Promise.all([
            window.loadOrg(),                 // Advisors
            window.loadShiftTemplates(),      // "7A", "RDO", etc.
            window.loadRotationFamilies(),    // "Flex A" -> { 6x7 grid }
            window.loadAdvisorAssignments()   // advisor_id -> "Flex A"
        ]);
        console.log("Data loaded.");
    } catch (e) {
        console.error("FATAL: Error loading initial data", e);
        alert("Error loading initial data from Supabase. Check console and refresh.");
        return;
    }
    
    // 3. Populate UI with data
    console.log("Populating UI...");
    window.rebuildTree();
    window.refreshChips();
    window.populateRotationEditor();
    window.populateAdvisorAssignments();
    
    // 4. Initial Render
    // Select the first 5 advisors by default for demo purposes
    if (window.ADVISORS_LIST.length > 0) {
        window.ADVISORS_LIST.slice(0, 5).forEach(a => selectedAdvisors.add(a.id));
        window.refreshUI(); // This will refresh tree, chips, and schedules
    } else {
        window.refreshAllSchedules(); // Render empty state
    }
    
    // 5. Wire events
    window.wire();
    
    // 6. Subscribe to realtime changes (optional)
    // window.subscribeRealtime();
    
    console.log("Application initialized.");
});


document.addEventListener("DOMContentLoaded", async () => {
    // Check if all necessary functions are loaded
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
    });

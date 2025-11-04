/**
 * WFM Intelligence Platform - Initialization (v15.5.1)
 * 
 * Bootstraps the application when the DOM is ready.
 */

document.addEventListener('DOMContentLoaded', function() {
    // Check if the main application logic (planner.js) has loaded and exposed the Core module
    if (window.APP && window.APP.Core && typeof window.APP.Core.initialize === 'function') {
        window.APP.Core.initialize();
    } else {
        // Fallback error handling if planner.js failed to load or is corrupted
        console.error("Application failed to bootstrap. Core modules not found. Check planner.js integrity.");
        // Display a user-friendly error message
        const contentArea = document.getElementById('main-content-area');
        if (contentArea) {
            contentArea.innerHTML = "<h1>Fatal Error: Application modules failed to load. Please check file integrity and refresh.</h1>";
        } else if (document.body) {
             document.body.innerHTML = "<h1>Fatal Error: Application structure missing.</h1>";
        }
    }
});
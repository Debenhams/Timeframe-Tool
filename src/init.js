/**
 * WFM Intelligence Platform - Initialization (v15.7)
 * Bootloader script.
 */

(function() {
    // Ensure the DOM is fully loaded before initialization
    document.addEventListener('DOMContentLoaded', () => {
        if (window.APP && window.APP.Core) {
            // Start the application
            window.APP.Core.initialize();
            window.APP.Components?.ShiftTradeCenter?.initialize?.();

        } else {
            // If APP.Core is not available, the planner.js file failed to load or is corrupted.
            console.error("Fatal Error: Application core not found. Check planner.js loading and syntax.");
            // Display a user-friendly error message
            const mainArea = document.getElementById('main-content-area');
            if (mainArea) {
                mainArea.innerHTML = `<div class="card" style="text-align: center; padding: 50px; margin: 24px;">
                    <h1>Initialization Failed</h1>
                    <p>The core application files could not be loaded or are corrupted.</p>
                    <p>Please check the console for errors and ensure all files are deployed correctly.</p>
                </div>`;
            }
        }
    });
})();
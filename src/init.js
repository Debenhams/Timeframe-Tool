/* --- Professional Rota System - Initialization (v5) --- */
/*
  This file waits for the DOM to be ready, then
  boots the application and wires up event listeners.
*/

function onDOMLoaded() {
  console.log("DOM loaded. Initializing app...");

  // Check if the App object and boot function exist
  if (window.App && typeof window.App.bootApplication === "function") {
    
    // 1. Boot the application
    // This fetches data, builds state, and renders the initial UI
    window.App.bootApplication();

    // 2. Wire up global event listeners using delegation
    // We use delegation on the document body for performance,
    // especially with dynamically added elements.
    document.body.addEventListener("click", (e) => {
      if (typeof window.App.handleDocumentClick === "function") {
        window.App.handleDocumentClick(e);
      }
    });

    document.body.addEventListener("change", (e) => {
      if (typeof window.App.handleChange === "function") {
        window.App.handleChange(e);
      }
    });

  } else {
    // This is a critical error, as planner.js failed to load
    console.error(
      "Initialization failed: window.App.bootApplication is not defined."
    );
    // Show a user-facing error
    const overlay = document.getElementById("loadingOverlay");
    if (overlay) {
      overlay.innerHTML =
        '<p style="color: red; max-width: 400px; text-align: center;">' +
        "CRITICAL ERROR: Application logic (planner.js) failed to load. " +
        "Please check the console (F12) for errors and contact support." +
        "</p>";
      overlay.classList.remove("hidden");
    }
  }
}

// Wait for the HTML document to be fully loaded before running init
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", onDOMLoaded);
} else {
  // DOM is already loaded
  onDOMLoaded();
}


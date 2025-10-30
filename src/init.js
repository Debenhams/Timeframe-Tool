/**
 * Professional Team Rota System - Initialization Script (v7)
 *
 * This file waits for the DOM to be ready and then calls the
 * main application boot function from planner.js.
 */
(function () {
  "use strict";

  /**
   * DOMContentLoaded event listener.
   * This is the entry point of the application.
   */
  function onDOMLoaded() {
    console.log("DOM Loaded. Initializing app...");

    // Check if the main app and boot function exist
    if (window.APP && typeof window.APP.bootApplication === "function") {
      // Call the main boot function
      window.APP.bootApplication();
    } else {
      console.error("Fatal Error: planner.js did not load or APP.bootApplication is not defined.");
      document.body.innerHTML = "<h1>Fatal Error: Application failed to load.</h1>";
    }
  }

  // Wait for the DOM to be fully loaded before booting
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", onDOMLoaded);
  } else {
    // DOM is already loaded
    onDOMLoaded();
  }

})();


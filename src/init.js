/**
 * Professional Team Rota System - Initialization Script (v8 - DOM FIX)
 *
 * This file waits for the DOM to be ready and then calls the
 * main application boot function from planner.js.
 *
 * FIX: The previous version had an 'else' block that ran
 * the app immediately if document.readyState was not 'loading'.
 * This caused a race condition.
 *
 * This new, simpler version *only* uses the event listener,
 * which is the correct and safest way to ensure the DOM is
 * 100% ready before the app tries to find any elements.
 */
(function () {
  "use strict";

  /**
   * DOMContentLoaded event listener.
   * This is the entry point of the application.
   */
  function onDOMLoaded() {
    console.log("DOM Loaded (v8). Initializing app...");

    // Check if the main app and boot function exist
    if (window.APP && typeof window.APP.bootApplication === "function") {
      // Call the main boot function
      window.APP.bootApplication();
    } else {
      console.error("Fatal Error: planner.js did not load or APP.bootApplication is not defined.");
      document.body.innerHTML = "<h1>Fatal Error: Application failed to load.</h1>";
    }
  }

  // --- THIS IS THE FIX ---
  // We remove the 'if/else' check on document.readyState.
  // We *always* add the event listener. This guarantees
  // that onDOMLoaded() will only run *after* the entire
  // HTML document has been parsed, fixing all "... is null" errors.
  
  console.log("init.js (v8): Attaching DOMContentLoaded listener.");
  document.addEventListener("DOMContentLoaded", onDOMLoaded);

})();
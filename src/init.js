/**
 * WFM Intelligence Platform - Initialization Script (v14.2)
 * 
 * Bootloader (Entry Point).
 */
(function () {
  "use strict";

  function onDOMLoaded() {
    console.log("DOM Loaded. Initializing application...");

    // Ensure the Core module (defined in planner.js) is ready before initializing
    // We access APP.Core via the global window object.
    if (window.APP && window.APP.Core && typeof window.APP.Core.initialize === "function") {
      window.APP.Core.initialize();
    } else {
      console.error("Fatal Error: planner.js did not load or APP.Core.initialize is not defined.");
      // Attempt to display the error on the page if initialization fails
      if (document.body) {
        document.body.innerHTML = "<h1>Fatal Error: Application failed to load. Check console for details.</h1>";
      }
    }
  }

  // Ensure the DOM is fully loaded before initialization
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", onDOMLoaded);
  } else {
    onDOMLoaded();
  }

})();
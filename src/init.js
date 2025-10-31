/**
 * WFM Intelligence Platform - Initialization Script (v13.1)
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
      document.body.innerHTML = "<h1>Fatal Error: Application failed to load.</h1>";
    }
  }

  // Ensure the DOM is fully loaded before initialization
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", onDOMLoaded);
  } else {
    onDOMLoaded();
  }

})();
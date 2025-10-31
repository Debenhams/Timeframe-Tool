/**
 * Professional Team Rota System - Initialization Script (v10.5)
 *
 * This file waits for the DOM to be ready and then calls the
 * main application boot function from planner.js.
 */
(function () {
  "use strict";

  function onDOMLoaded() {
    console.log("DOM Loaded. Initializing app (v10.5)...");

    if (window.APP && typeof window.APP.bootApplication === "function") {
      window.APP.bootApplication();
    } else {
      console.error("Fatal Error: planner.js did not load or APP.bootApplication is not defined.");
      document.body.innerHTML = "<h1>Fatal Error: Application failed to load.</h1>";
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", onDOMLoaded);
  } else {
    onDOMLoaded();
  }

})();
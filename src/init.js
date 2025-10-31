/**
 * Professional Team Rota System - Initialization Script (v11.0)
 */
(function () {
  "use strict";

  function onDOMLoaded() {
    console.log("DOM Loaded. Initializing app (v11.0)...");

    if (window.APP && typeof window.APP.bootApplication === "function") {
      window.APP.bootApplication();
    } else {
      console.error("Fatal Error: Application failed to load.");
      document.body.innerHTML = "<h1>Fatal Error: Application failed to load.</h1>";
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", onDOMLoaded);
  } else {
    onDOMLoaded();
  }

})();
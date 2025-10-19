// src/planner.js
(function () {
  // Prevent redefining if already declared inline
  if (typeof window.renderPlanner !== "function") {
    const DAY_START = 6 * 60; // 06:00
    const DAY_END = 20 * 60;  // 20:00
    const toPct = (m) => ((m - DAY_START) / (DAY_END - DAY_START)) * 100;

    function classFor(code) {
      if (typeof window.classForCode === "function") return window.classForCode(code);
      const k = (code || "").toLowerCase();
      if (k.includes("lunch")) return "c-lunch";
      if (k.includes("break")) return "c-break";
      if (k.includes("meeting")) return "c-meeting";
      if (k.includes("overtime")) return "c-overtime";
      if (k.includes("mirakl")) return "c-mirakl";
      if (k.includes("social")) return "c-social";
      if (k.includes("email")) return "c-email";
      return "c-email";
    }

    function tStr(mins) {
      const h = String(Math.floor(mins / 60)).padStart(2, "0");
      const m = String(mins % 60).padStart(2, "0");
      return `${h}:${m}`;
    }

    // Main planner rendering
    window.renderPlanner = function (rows) {
      const body = document.getElementById("plannerBody");
      const header = document.getElementById("timeHeader");
      if (!body || !header) return;

      body.innerHTML = "";
      header.innerHTML = "";

      // Time header
      const scale = document.createElement("div");
      scale.className = "time-scale";
      for (let m = DAY_START; m <= DAY_END; m += 60) {
        const tick = document.createElement("div");
        tick.className = "tick";
        tick.style.left = `${toPct(m)}%`;
        tick.textContent = tStr(m);
        scale.appendChild(tick);
      }
      header.appendChild(scale);

      // Each row
      (rows || []).forEach((r) => {
        const row = document.createElement("div");
        row.className = "planner_row";

        const name = document.createElement("div");
        name.className = "planner_name";
        name.innerHTML = `${r.name || ""}${r.badge ? ` <span class="planner_badge">${r.badge}</span>` : ""}`;
        row.appendChild(name);

        const timeline = document.createElement("div");
        timeline.className = "planner_timeline";

        (r.segments || []).forEach((seg) => {
          const left = toPct(seg.start);
          const right = toPct(seg.end);
          const width = Math.max(0, right - left);

          const bar = document.createElement("div");
          bar.className = `planner_bar ${classFor(seg.code)}`;
          bar.style.left = `${left}%`;
          bar.style.width = `${width}%`;
          bar.title = `${seg.code} ${tStr(seg.start)}–${tStr(seg.end)}`;
          timeline.appendChild(bar);
        });

        row.appendChild(timeline);
        body.appendChild(row);
      });
    };
  }

  // Optional: only defines once
  if (typeof window.renderTimeHeader !== "function") {
    const DAY_START = 6 * 60, DAY_END = 20 * 60;
    window.renderTimeHeader = function (el) {
      el = el || document.getElementById("timeHeader");
      if (!el) return;
      el.innerHTML = "";
      const scale = document.createElement("div");
      scale.className = "time-scale";
      for (let m = DAY_START; m <= DAY_END; m += 60) {
        const tick = document.createElement("div");
        tick.className = "tick";
        tick.style.left = `${((m - DAY_START) / (DAY_END - DAY_START)) * 100}%`;
        tick.textContent = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
        scale.appendChild(tick);
      }
      el.appendChild(scale);
    };
  }

  console.log("planner.js loaded");
})();
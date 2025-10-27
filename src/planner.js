/* src/planner.js — fully rebuilt and cleaned by Luke Pashley (2025-10-27)
   Features:
   • Stable horizontal timeline rendering
   • Working rotation preview + advisor linkage
   • Consolidated helpers and debug flag
   • Future-ready for 12-week + platform expansion
*/

(async function () {
  "use strict";

  // ============================================================
  // 🔧 CONFIG + GLOBAL FLAGS
  // ============================================================
  const debug = true; // toggle for verbose logs

  const log = (...args) => {
    if (debug) console.log("[planner]", ...args);
  };

  const supabase = window.supabase;
  if (!supabase) console.error("Supabase not found! Ensure it's loaded first.");

  // ============================================================
  // 🧭 BASIC DATE HELPERS
  // ============================================================
  function toISODateLocal(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function normalizeToISO(s) {
    if (!s) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    const d = new Date(s);
    return isNaN(d) ? String(s) : toISODateLocal(d);
  }

  function toMondayISO(iso) {
    if (!iso) return "";
    const d = new Date(iso + "T00:00:00");
    const offset = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - offset);
    return toISODateLocal(d);
  }

  globalThis.toISODateLocal = toISODateLocal;
  globalThis.normalizeToISO = normalizeToISO;
  globalThis.toMondayISO = toMondayISO;

  // ============================================================
  // 🧮 EFFECTIVE WEEK CALCULATOR
  // ============================================================
  function effectiveWeek(startISO, mondayISO) {
    const s = new Date(startISO);
    const m = new Date(mondayISO);
    const diff = Math.floor((m - s) / (7 * 86400000));
    const weekNum = (diff % 6 + 6) % 6 || 1;
    return weekNum;
  }
  globalThis.effectiveWeek = effectiveWeek;

  // ============================================================
  // 🧱 SAFE SHIMS
  // ============================================================
  globalThis.showError =
    globalThis.showError ||
    function (msg) {
      console.warn(String(msg));
    };
  globalThis.showInfo =
    globalThis.showInfo ||
    function (msg) {
      console.log(String(msg));
    };

  // ============================================================
  // 📦 BOOT HELPERS
  // ============================================================
  async function bootAdvisors() {
    if (window.ADVISOR_BY_ID && Object.keys(window.ADVISOR_BY_ID).length) return;
    const { data, error } = await supabase.from("advisors").select("*");
    if (error) return showError(error.message);
    const map = {};
    data.forEach((a) => (map[a.id] = a.name || a.id));
    window.ADVISOR_BY_ID = map;
    showInfo(`Loaded ${data.length} advisors`);
  }
  globalThis.bootAdvisors = bootAdvisors;

  // ============================================================
  // 🔄 ROTATION META + PREVIEW
  // ============================================================
  globalThis.bootRotations = async function bootRotations() {
    const { data, error } = await supabase.from("rotations").select("*");
    if (error) return showError(error.message);
    const meta = {};
    const rot = {};
    data.forEach((r) => {
      const { name, week_number, day_of_week, is_rdo, start_end_key, start_time, end_time, label, start_date } =
        r;
      meta[name] = { start_date };
      rot[name] = rot[name] || {};
      rot[name][week_number] = rot[name][week_number] || {};
      rot[name][week_number][day_of_week] = {
        is_rdo,
        start_end_key,
        start: start_time,
        end: end_time,
        label,
      };
    });
    window.ROTATION = rot;
    window.ROTATION_META = meta;
    showInfo(`Rotations loaded: ${Object.keys(rot).length}`);
  };

  // ============================================================
  // 🧩 APPLY ROTATION TO WEEK
  // ============================================================
  globalThis.applyRotationToWeek = function applyRotationToWeek({
    rotationName,
    mondayISO,
    advisors,
    rotationStartISO,
  }) {
    const rot = globalThis.ROTATION?.[rotationName];
    if (!rot) return showError(`No rotation: ${rotationName}`);

    const startISO = rotationStartISO || globalThis.ROTATION_META?.[rotationName]?.start_date;
    const weekNum = effectiveWeek(startISO, mondayISO);
    const w = rot[weekNum] || rot[1];
    if (!w) return showError(`No week ${weekNum} for rotation ${rotationName}`);

    const [yy, mm, dd] = mondayISO.split("-").map(Number);
    const base = new Date(yy, (mm || 1) - 1, dd || 1);
    const isoDates = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
      return toISODateLocal(d);
    });

    const ids = advisors.map((a) => (typeof a === "string" ? a : a.id));
    const nextRotas = {};

    isoDates.forEach((iso, i) => {
      const dow = i + 1;
      const cell = w[dow];
      if (!cell) return;

      if (cell.is_rdo) {
        ids.forEach((id) => ((nextRotas[id] ||= {})[iso] = { label: "RDO" }));
        return;
      }

      if (cell.start && cell.end) {
        ids.forEach((id) => ((nextRotas[id] ||= {})[iso] = cell));
      } else if (cell.start_end_key) {
        const [s, e] = cell.start_end_key.split("x");
        ids.forEach((id) => ((nextRotas[id] ||= {})[iso] = { start: s, end: e, label: cell.label || "" }));
      }
    });

    window.ROTAS = nextRotas;
    showInfo(`Applied ${rotationName} week ${weekNum} to ${ids.length} advisors`);
    if (typeof refreshPlannerUI === "function") refreshPlannerUI();
  };

  // ============================================================
  // 🧭 COMPUTE PLANNER ROWS
  // ============================================================
  function computePlannerRowsFromState() {
    const rows = [];
    if (!window.ROTAS || !Object.keys(window.ROTAS).length) return rows;

    const weekStart = document.getElementById("weekStart");
    const daySelect = document.getElementById("teamDay");
    const rawWs = weekStart?.value || "";
    const wsISO = normalizeToISO(rawWs);
    const mondayISO = toMondayISO(wsISO);
    const dayName = daySelect?.value || "Monday";

    const DOW = {
      Monday: 1,
      Tuesday: 2,
      Wednesday: 3,
      Thursday: 4,
      Friday: 5,
      Saturday: 6,
      Sunday: 7,
    };
    const dow = DOW[dayName] || 1;

    const base = new Date(mondayISO + "T00:00:00");
    base.setDate(base.getDate() + (dow - 1));
    const dayISO = toISODateLocal(base);

    const ids = Object.keys(window.ROTAS);
    ids.forEach((id) => {
      const wk = window.ROTAS[id];
      const cell = wk[dayISO];
      if (!cell || cell.is_rdo) return;
      if (!cell.start || !cell.end) return;

      const seg = { start: cell.start, end: cell.end, code: cell.label || "" };
      const nm = window.ADVISOR_BY_ID?.[id] || id;
      rows.push({ id, name: nm, badge: "", segments: [seg] });
    });

    rows.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    log("rows built:", rows.length);
    return rows;
  }
  window.computePlannerRowsFromState = computePlannerRowsFromState;

  // ============================================================
  // 🔁 PATCH REFRESH + RENDER
  // ============================================================
  (function patchRefresh() {
    const orig = globalThis.refreshPlannerUI;
    globalThis.refreshPlannerUI = function () {
      if (typeof orig === "function") orig();

      const rows =
        typeof window.computePlannerRowsFromState === "function"
          ? window.computePlannerRowsFromState()
          : [];

      if (!rows || !rows.length) {
        log("No rows to render.");
        return;
      }

      log("[render rows]", rows.length, rows[0] || null);
      if (typeof window.renderPlanner === "function") window.renderPlanner(rows);
    };
  })();

  // ============================================================
  // 🎛️ PREVIEW ROTATION BUTTON
  // ============================================================
  document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("previewRotation");
    if (!btn) return;
    if (btn.dataset._wired) return;
    btn.dataset._wired = "1";

    btn.addEventListener("click", async () => {
      try {
        await bootAdvisors();
        await bootRotations();

        const sel = document.getElementById("rotationSelect");
        const names = Object.keys(window.ROTATION || {});
        if (!names.length) return showError("No rotations loaded");
        if (sel && sel.options.length <= 1) {
          names.forEach((n) => {
            const opt = document.createElement("option");
            opt.value = n;
            opt.textContent = n;
            sel.appendChild(opt);
          });
        }

        const rotationName = sel?.value || names[0];
        const rawWs = document.getElementById("weekStart")?.value || "2025-10-20";
        const wsISO = normalizeToISO(rawWs);
        const mondayISO = toMondayISO(wsISO);
        const advisors = Object.keys(window.ADVISOR_BY_ID || {}).slice(0, 8);

        const startISO = window.ROTATION_META?.[rotationName]?.start_date;
        applyRotationToWeek({ rotationName, mondayISO, advisors, rotationStartISO: startISO });
      } catch (e) {
        console.error("Preview Rotation failed", e);
      }
    });
  });

  // ============================================================
  // 🧱 FINAL CHECKPOINT
  // ============================================================
  log("planner.js fully loaded and stable ✅");
})();

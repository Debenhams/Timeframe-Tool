// ./src/planner.js
(() => {
  "use strict";

  /**************************************************************************
   * Shared state (globals we attach on window/globalThis)
   **************************************************************************/
  const g = globalThis;

  g.ADVISOR_BY_ID = g.ADVISOR_BY_ID || new Map();   // id -> { id, name }
  g.ADVISOR_BY_NAME = g.ADVISOR_BY_NAME || new Map();// name -> { id, name }

  // Rotation data:
  // ROTATION[name][weekNum][dow] = { is_rdo?:true, start_end_key?:'HH:MMxHH:MM' }
  g.ROTATION = g.ROTATION || Object.create(null);

  // Shift templates grouped by identical start/end times for cycling variants
  // VARIANTS_BY_START_END['07:00x16:00'] = { 'A': {start,end,name}, 'B': {...}, ... }
  g.VARIANTS_BY_START_END = g.VARIANTS_BY_START_END || Object.create(null);

  // Meta info (counts + families/start dates etc.)
  // ROTATION_META = { templates: {...}, families: { 'Flex 1': {start_date, sequence?} } }
  g.ROTATION_META = g.ROTATION_META || { templates: {}, families: {} };

  // Materialised week we will render → ROTAS[advisorId][YYYY-MM-DD] = { start, end, label } or {label:'RDO'}
  g.ROTAS = g.ROTAS || Object.create(null);

  /**************************************************************************
   * Small date/time helpers
   **************************************************************************/
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function parseHHMM(hhmm) {
    if (!hhmm || typeof hhmm !== "string") return null;
    const m = hhmm.match(/^(\d{1,2}):?(\d{2})$/);
    if (!m) return null;
    let h = +m[1], m2 = +m[2];
    if (h < 0 || h > 23 || m2 < 0 || m2 > 59) return null;
    return pad2(h) + ":" + pad2(m2);
  }
  function toMondayISO(isoLike) {
    // Given any date ISO (YYYY-MM-DD), return the Monday for that week in ISO.
    const d = new Date(isoLike + "T00:00:00");
    const day = (d.getDay() + 6) % 7; // Mon=0..Sun=6
    d.setDate(d.getDate() - day);
    return d.toISOString().slice(0,10);
  }
  function normalizeToISO(val) {
    if (!val) return null;
    // Accept 'YYYY-MM-DD' or a Date input value
    if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
    try {
      const d = new Date(val);
      if (!isNaN(d)) return d.toISOString().slice(0,10);
    } catch {}
    return null;
  }
  function effectiveWeek(startISO, mondayISO) {
    // 1..6 etc. based on offset from family's start_date (or 1 if missing)
    try {
      if (!startISO || !mondayISO) return 1;
      const a = new Date(startISO + "T00:00:00").getTime();
      const b = new Date(mondayISO + "T00:00:00").getTime();
      if (isNaN(a) || isNaN(b)) return 1;
      const weeks = Math.floor((b - a) / (7 * 86400_000));
      return ((weeks % 6) + 6) % 6 + 1; // constrain to 1..6 if you have 6-week families
    } catch { return 1; }
  }
  const DOW = { Monday:1, Tuesday:2, Wednesday:3, Thursday:4, Friday:5, Saturday:6, Sunday:7 };

  /**************************************************************************
   * Supabase client (single shared client expected on window.supabase)
   **************************************************************************/
  function getSB() {
    if (!g.supabase) {
      console.warn("supabase client not found on window.supabase");
      return null;
    }
    return g.supabase;
  }

  /**************************************************************************
   * Advisors: build indexes from the right-side Schedules panel (robust for UI)
   **************************************************************************/
  async function bootAdvisors() {
    // If you later want this from Supabase, you can swap this out.
    const panel = document.querySelector(".schedules, #schedules, [data-schedules]");
    // Fallback: the right column in your layout
    const fallback = document.querySelector(".col-right, .sidebar, .Schedules") || document;
    const root = panel || fallback;

    const names = new Set();
    // Find visible advisor list items; we support multiple DOM shapes
    root.querySelectorAll("li, .advisor, .name, .row").forEach(el => {
      // ignore leaders when marked
      const chip = (el.textContent || "").trim();
      if (!chip) return;
      // heuristics: skip headers
      if (/Leader/i.test(chip)) return;
      if (chip.length > 2 && chip.length < 60) {
        names.add(chip);
      }
    });

    // If the above was too aggressive, try reading from selected chips under the list:
    const chipsBar = document.querySelector(".selected-chips, .chips, .selected");
    if (chipsBar) {
      chipsBar.querySelectorAll(".chip, .tag").forEach(ch => {
        const t = (ch.textContent || "").trim();
        if (t) names.add(t);
      });
    }

    // Build maps
    g.ADVISOR_BY_ID = new Map();
    g.ADVISOR_BY_NAME = new Map();
    Array.from(names).forEach(name => {
      const id = name.toLowerCase().replace(/\s+/g, "_");
      const rec = { id, name };
      g.ADVISOR_BY_ID.set(id, rec);
      g.ADVISOR_BY_NAME.set(name, rec);
    });

    console.log("bootAdvisors ok:", g.ADVISOR_BY_ID.size);
  }
  g.bootAdvisors = bootAdvisors;

  /**************************************************************************
   * Rotations & templates from Supabase
   * - shift_templates: {code, start_time, end_time} (+ optional fields)
   * - v_rotations_with_hours: {name, week, dow, is_rdo, start_hhmm, end_hhmm, start_end_key}
   **************************************************************************/
  async function bootRotations() {
    const sb = getSB();
    if (!sb) return;

    // 1) Load templates
    {
      const { data, error } = await sb
        .from("shift_templates")
        .select("code, start_time, end_time")
        .order("code", { ascending: true });
      if (error) {
        console.error("shift_templates error:", error);
      } else {
        const byKey = Object.create(null);
        const templates = {};
        (data || []).forEach(t => {
          const start = parseHHMM(t.start_time);
          const end   = parseHHMM(t.end_time);
          if (!start || !end) return;
          const key = `${start}x${end}`;
          templates[t.code] = { name: t.code, start_time: start, end_time: end };
          if (!byKey[key]) byKey[key] = {};
          byKey[key][t.code] = { name: t.code, start_time: start, end_time: end };
        });
        g.VARIANTS_BY_START_END = byKey;
        g.ROTATION_META.templates = templates;
      }
    }

    // 2) Load rotations view
    {
      const { data, error } = await sb
        .from("v_rotations_with_hours")
        .select("name, week, dow, is_rdo, start_hhmm, end_hhmm, start_end_key, start_date")
        .order("name", { ascending:true })
        .order("week", { ascending:true })
        .order("dow", { ascending:true });
      if (error) {
        console.error("v_rotations_with_hours error:", error);
      } else {
        const rot = Object.create(null);
        const fam = {};
        (data || []).forEach(r => {
          const nm = r.name;
          const wk = +r.week || 1;
          const dow = +r.dow || 1;
          rot[nm] ||= {};
          rot[nm][wk] ||= {};
          if (r.is_rdo) {
            rot[nm][wk][dow] = { is_rdo: true };
          } else {
            let sek = r.start_end_key;
            if (!sek) {
              const s = parseHHMM(r.start_hhmm);
              const e = parseHHMM(r.end_hhmm);
              if (s && e) sek = `${s}x${e}`;
            }
            rot[nm][wk][dow] = { start_end_key: sek || null };
          }
          if (!fam[nm]) fam[nm] = { start_date: r.start_date || null };
        });
        g.ROTATION = rot;
        g.ROTATION_META.families = fam;
      }
    }

    console.log("Rotations booted", {
      templates: Object.keys(g.ROTATION_META.templates || {}).length,
      families: Object.keys(g.ROTATION_META.families || {}).length
    });
  }
  g.bootRotations = bootRotations;

  /**************************************************************************
   * Populate the "Rotation" select
   **************************************************************************/
  function populateRotationSelect() {
    const sel = document.getElementById("rotationName");
    if (!sel) return;
    const names =
      (g.ROTATION && Object.keys(g.ROTATION)) ||
      (g.ROTATION_META && Object.keys(g.ROTATION_META.families || {})) ||
      [];
    if (!names.length) return;
    const cur = sel.value;
    sel.innerHTML = names.map(n => `<option value="${n}">${n}</option>`).join("");
    if (cur && names.includes(cur)) sel.value = cur;
  }
  g.populateRotationSelect = populateRotationSelect;

  /**************************************************************************
   * Apply a rotation family to a specific Monday → generate ROTAS
   **************************************************************************/
  function applyRotationToWeek({ rotationName, mondayISO, advisors, rotationStartISO }) {
    if (!rotationName) { console.warn("applyRotationToWeek: no rotationName"); return null; }
    const nm = rotationName;
    const famStart = rotationStartISO || g.ROTATION_META?.families?.[nm]?.start_date || null;
    const weekNum = effectiveWeek(famStart, mondayISO);

    const week = g.ROTATION?.[nm]?.[weekNum] || g.ROTATION?.[nm]?.[1];
    if (!week) { console.warn("applyRotationToWeek: no week data", {nm, weekNum}); return null; }

    // Build 7 ISO dates for the week
    const base = new Date((mondayISO || toMondayISO(mondayISO || new Date().toISOString().slice(0,10))) + "T00:00:00");
    const dayISO = Array.from({length:7}, (_,i) => {
      const d = new Date(base); d.setDate(base.getDate() + i);
      return d.toISOString().slice(0,10);
    });

    // Advisors to IDs
    const ids = (advisors || []).map(a => (typeof a === "string" ? a : a.id)).filter(Boolean);

    // Build next ROTAS
    const nextRotas = {};
    const variantCache = g.VARIANTS_BY_START_END || {};

    dayISO.forEach((iso, idx) => {
      const dow = idx + 1; // Mon=1..Sun=7
      const cell = week[dow];
      if (!cell) return;

      if (cell.is_rdo) {
        ids.forEach(id => {
          (nextRotas[id] ||= {});
          nextRotas[id][iso] = { label:"RDO" };
        });
        return;
      }

      const sek = cell.start_end_key;
      const fam = sek ? variantCache[sek] : null;
      const variants = fam ? Object.keys(fam) : [];

      ids.forEach((id, i) => {
        (nextRotas[id] ||= {});
        if (fam && variants.length) {
          const key = variants[i % variants.length];
          const v = fam[key];
          nextRotas[id][iso] = { start:v.start_time, end:v.end_time, label:v.name || key };
        } else if (sek) {
          const [s,e] = sek.split("x");
          nextRotas[id][iso] = { start:s, end:e, label:sek };
        }
      });
    });

    g.ROTAS = nextRotas;
    if (typeof g.refreshPlannerUI === "function") g.refreshPlannerUI();

    console.log("applyRotationToWeek ok →", nm, "week", weekNum, "advisors", ids.length);
    return { weekNum, advisors: ids.length };
  }
  g.applyRotationToWeek = applyRotationToWeek;

  /**************************************************************************
   * Compute rows for the renderer from current state (ROTAS + UI filters)
   **************************************************************************/
  function computePlannerRowsFromState() {
    // Figure out the chosen day
    const wsEl = document.getElementById("weekStart");
    const daySel = document.getElementById("teamDay");
    const rawWS = wsEl?.value || new Date().toISOString().slice(0,10);
    const mondayISO = toMondayISO(normalizeToISO(rawWS) || rawWS);
    const dayName = (daySel && daySel.value) || "Monday";
    const dow = DOW[dayName] || 1;

    const base = new Date(mondayISO + "T00:00:00");
    base.setDate(base.getDate() + (dow - 1));
    const dayISO = base.toISOString().slice(0,10);

    const rows = [];
    const ids = Object.keys(g.ROTAS || {});
    ids.forEach(id => {
      const week = g.ROTAS[id] || {};
      const cell = week[dayISO];
      if (!cell) return;

      const segs = [];
      if (cell.label === "RDO") {
        // show the “Roster Day Off” badge only (no time range)
        segs.push({ code: "RDO", atDay: dayISO });
      } else if (cell.start && cell.end) {
        segs.push({ start: cell.start, end: cell.end, code: cell.label || "" , atDay: dayISO });
      }

      if (!segs.length) return;

      const name =
        (g.ADVISOR_BY_ID instanceof Map ? g.ADVISOR_BY_ID.get(id)?.name : null) ||
        id;
      rows.push({ id, name, badge: "", segments: segs });
    });

    rows.sort((a,b) => String(a.name).localeCompare(String(b.name)));
    return rows;
  }
  g.computePlannerRowsFromState = computePlannerRowsFromState;

  /**************************************************************************
   * Patch refreshPlannerUI (if present) to use our row computer; else add one
   **************************************************************************/
  (function ensureRefresh() {
    const orig = g.refreshPlannerUI;
    g.refreshPlannerUI = function patchedRefresh() {
      if (typeof orig === "function") orig();
      const rows = computePlannerRowsFromState();
      if (typeof g.renderPlanner === "function") {
        g.renderPlanner(rows);
      } else {
        console.log("renderPlanner rows=", rows.length);
      }
    };
  })();

  /**************************************************************************
   * Preview button wiring
   **************************************************************************/
  (function wirePreview() {
    const btn = document.getElementById("previewRotation");
    if (!btn) return;
    if (btn.dataset._wired) return;
    btn.dataset._wired = "1";

    btn.addEventListener("click", async () => {
      try {
        console.log("[preview] click");
        await bootAdvisors();
        await bootRotations();
        populateRotationSelect();

        const sel = document.getElementById("rotationName");
        const rotationName =
          (sel && sel.value) ||
          Object.keys(g.ROTATION || {})[0] ||
          Object.keys(g.ROTATION_META?.families || {})[0];

        if (!rotationName) {
          console.warn("No rotations found (check ROTATION / ROTATION_META).");
          return;
        }

        const rawWS = document.getElementById("weekStart")?.value || new Date().toISOString().slice(0,10);
        const mondayISO = toMondayISO(normalizeToISO(rawWS) || rawWS);

        const advisorIds = (g.ADVISOR_BY_ID instanceof Map)
          ? Array.from(g.ADVISOR_BY_ID.keys()).slice(0, 8)
          : Object.keys(g.ADVISOR_BY_ID || {}).slice(0,8);

        const startISO = g.ROTATION_META?.families?.[rotationName]?.start_date || null;

        const res = applyRotationToWeek({
          rotationName, mondayISO, advisors: advisorIds, rotationStartISO: startISO
        });
        console.log("[preview] applied", res);
      } catch (e) {
        console.error("Preview Rotation failed", e);
      }
    });
  })();

  /**************************************************************************
   * Helpers ready
   **************************************************************************/
  console.log("planner.js helpers ready:", typeof g.bootRotations);

})();

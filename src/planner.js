// src/planner.js
(async function () {

  "use strict";
  // alias the client used by the helpers below
const supabase = window.supabase;
// --- rotations helpers (attached to globalThis) ---

async function loadShiftTemplatesAndVariants() {
  const { data: templates, error } = await supabase
    .from("shift_templates")
    .select("code, start_time, break1, lunch, break2, end_time");
  if (error) { console.error("shift_templates error", error); return; }

  // index by code
  globalThis.SHIFT_BY_CODE = Object.fromEntries(templates.map(t => [t.code, t]));

  // group variants by start_end (e.g. "07:00x16:00" → ["7A","7B","7C","7D"])
  const groups = {};
  const hhmm = x => (x || "").toString().slice(0,5);
  for (const t of templates) {
    const key = `${hhmm(t.start_time)}x${hhmm(t.end_time)}`;
    (groups[key] ||= []).push(t.code);
  }
  for (const k of Object.keys(groups)) groups[k].sort();
  globalThis.VARIANTS_BY_START_END = groups;
}

async function loadRotationsWithHours() {
  const { data, error } = await supabase
    .from("v_rotations_with_hours")
    .select("name, week, dow, is_rdo, shift_code, start_hhmm, end_hhmm, start_end_key")
    .order("name").order("week").order("dow");
  if (error) { console.error("v_rotations_with_hours error", error); return; }

  const idx = {};
  for (const r of data) {
    idx[r.name] ||= {};
    idx[r.name][r.week] ||= {};
    idx[r.name][r.week][r.dow] = { is_rdo: r.is_rdo, start_end_key: r.start_end_key };
  }
  globalThis.ROTATION = idx;  // lookup: ROTATION[name][week][dow]
}

function assignVariantsRoundRobin(advisorIdsInGroup, startEndKey) {
  const variants = (globalThis.VARIANTS_BY_START_END && globalThis.VARIANTS_BY_START_END[startEndKey]) || [];
  if (!variants.length) return {};
  const sorted = [...advisorIdsInGroup].sort();
  const result = {};
  for (let i = 0; i < sorted.length; i++) result[sorted[i]] = variants[i % variants.length];
  return result;  // { advisorId: "7A" | "7B" | ... }
}
globalThis.assignVariantsRoundRobin = assignVariantsRoundRobin;

function effectiveWeek(startDateStr, plannerWeekStartStr) {
  const start = new Date(startDateStr);
  const plan  = new Date(plannerWeekStartStr);
  const diffDays  = Math.floor((plan - start) / 86400000);
  const diffWeeks = Math.floor(diffDays / 7);
  return ((diffWeeks % 6) + 6) % 6 + 1; // 1..6
}
globalThis.effectiveWeek = effectiveWeek;

 globalThis.bootRotations = async function bootRotations() {
  try {
    // --- Use existing Supabase client already created in the HTML
const sb = window.supabase;
if (!sb || typeof sb.from !== 'function') {
  console.error('Supabase client missing: expected window.supabase.from to be a function');
  return;
}

    await loadShiftTemplatesAndVariants();  // builds SHIFT_BY_CODE / VARIANTS_BY_START_END
    await loadRotationsWithHours();         // builds ROTATION[name][week][dow]

    // --- Helpers
    const toNameKey = (s) => (s || "").trim();

    // --- Fetch shift templates (weekly patterns)
    // Table expectation:
    //   shift_templates(name TEXT PRIMARY KEY, pattern JSONB?) OR columns: day_mon..day_sun (or mon..sun)
    const { data: tmplRows, error: tmplErr } = await sb
      .from("shift_templates")
      .select("*");

    if (tmplErr) throw tmplErr;

    const templatesByName = {};
    for (const r of tmplRows || []) {
      const name = toNameKey(r.name);
      if (!name) continue;

      // Accept either a JSON 'pattern' column or individual day columns
      let pattern = r.pattern;
      if (!pattern || typeof pattern !== "object") {
        pattern = {
          mon: r.day_mon ?? r.mon ?? null,
          tue: r.day_tue ?? r.tue ?? null,
          wed: r.day_wed ?? r.wed ?? null,
          thu: r.day_thu ?? r.thu ?? null,
          fri: r.day_fri ?? r.fri ?? null,
          sat: r.day_sat ?? r.sat ?? null,
          sun: r.day_sun ?? r.sun ?? null,
        };
      }
      templatesByName[name] = { name, pattern };
    }

    // --- Fetch rotation families (sequence of templates across weeks)
    // Table expectation:
    //   rotations(name TEXT PRIMARY KEY, start_date DATE/NULL, sequence JSONB?)
    //   or fallback columns week1..week6
    const { data: famRows, error: famErr } = await sb
      .from("rotations")
      .select("*");

    if (famErr) throw famErr;

    const familiesByName = {};
    for (const r of famRows || []) {
      const name = toNameKey(r.name);
      if (!name) continue;

      let sequence = r.sequence;
      if (!sequence || !Array.isArray(sequence)) {
        sequence = [r.week1, r.week2, r.week3, r.week4, r.week5, r.week6].filter(
          (x) => x != null
        );
      }
      familiesByName[name] = {
        name,
        start_date: r.start_date ?? null,
        sequence, // e.g., ["Flex 1","Flex 2",...]
      };
    }

    // --- Stable global shape for the UI
    globalThis.ROTATION_META = {
      templates: templatesByName,
      families: familiesByName,
    };

    console.log("Rotations booted", {
      templates: Object.keys(templatesByName).length,
      families: Object.keys(familiesByName).length,
    });
  } catch (err) {
    console.error("bootRotations error:", err);
    throw err;
  }
};


console.log("planner.js helpers ready:", typeof globalThis.bootRotations);

// --- Advisors boot (minimal) ---
globalThis.bootAdvisors = async function bootAdvisors() {
  const { data: rows, error } = await supabase.from('advisors').select('*');
  if (error) { console.error('bootAdvisors error', error); return 0; }

  const sample = rows?.[0] || {};
  const idKey   = ['id','advisor_id','uuid','pk','user_id'].find(k => k in sample) || 'id';
  const nameKey = ['name','display_name','full_name','advisor_name'].find(k => k in sample) || null;

  globalThis.ADVISOR_BY_ID = {};
  globalThis.ADVISOR_BY_NAME = {};

  (rows || []).forEach(r => {
    const id = r[idKey];
    const nm = nameKey ? r[nameKey] : (r.email || r.username || String(id));
    globalThis.ADVISOR_BY_ID[id] = r;
    globalThis.ADVISOR_BY_NAME[nm] = r;
  });

  console.log('bootAdvisors ok:', Object.keys(globalThis.ADVISOR_BY_ID).length);
  return Object.keys(globalThis.ADVISOR_BY_ID).length;
};

// --- Apply a rotation week into ROTAS and re-render ---
globalThis.applyRotationToWeek = function applyRotationToWeek({
  rotationName,
  mondayISO,          // 'YYYY-MM-DD' Monday to materialise
  advisors,           // array of advisor IDs (or objects with {id})
  rotationStartISO,   // optional; falls back to ROTATION_META
}) {
  const rot = globalThis.ROTATION?.[rotationName];
  if (!rot) { console.warn('No rotation:', rotationName); return; }

  const startISO = rotationStartISO || globalThis.ROTATION_META?.[rotationName]?.start_date;
  const weekNum = (typeof globalThis.effectiveWeek === 'function' && startISO)
    ? globalThis.effectiveWeek(startISO, mondayISO)
    : 1;

  const w = rot[weekNum] || rot[1];
  if (!w) { console.warn('No week found for', rotationName, 'num:', weekNum); return; }

  const base = new Date(mondayISO + 'T00:00:00');
  const isoDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base); d.setDate(base.getDate() + i);
    return d.toISOString().slice(0, 10);
  });

  const ids = advisors.map(a => (typeof a === 'string' ? a : a.id));
  const nextRotas = {};

  isoDates.forEach((iso, i) => {
    const dow = i + 1;
    const cell = w[dow];
    if (!cell) return;

    if (cell.is_rdo) {
      ids.forEach(id => { (nextRotas[id] ||= {})[iso] = { label: 'RDO' }; });
      return;
    }

    const sek = cell.start_end_key;
    const fam = globalThis.VARIANTS_BY_START_END?.[sek] || null;
    const variants = fam ? Object.keys(fam) : [];

    ids.forEach((id, idx) => {
      (nextRotas[id] ||= {});
      if (fam && variants.length) {
        const key = variants[idx % variants.length];
        const v = fam[key];
        nextRotas[id][iso] = { start: v.start_time, end: v.end_time, label: v.name || key };
      } else if (sek) {
        const [start, end] = sek.split('x');
        nextRotas[id][iso] = { start, end, label: sek };
      }
    });
  });

  globalThis.ROTAS = nextRotas;
  if (typeof globalThis.refreshPlannerUI === 'function') globalThis.refreshPlannerUI();
  console.log('applyRotationToWeek ok →', rotationName, 'week', weekNum, 'advisors', ids.length);
  return { weekNum, advisors: ids.length };
};
// Fill the rotation <select> with names from window.ROTATION
globalThis.populateRotationSelect = function populateRotationSelect() {
  const sel = document.getElementById('rotationName');
  if (!sel) return;

  const names = Object.keys(globalThis.ROTATION || {});
  if (!names.length) {
    sel.innerHTML = `<option value="">(no rotations)</option>`;
    return;
  }

  // Only rebuild if empty or placeholder present
  if (sel.options.length <= 1 || sel.value === '') {
    sel.innerHTML = names.map(n => `<option value="${n}">${n}</option>`).join('');
    sel.value = names[0]; // default to first
  }
};
// --- Compute rows from ROTAS for the chosen day ---
globalThis.computePlannerRowsFromState = function computePlannerRowsFromState() {
  try {
    const hasROTAS = globalThis.ROTAS && Object.keys(globalThis.ROTAS).length > 0;
    if (!hasROTAS) {
      console.log('[rows] using legacy source (no ROTAS)');
      return [];
    }

    // Read Week start (Monday) + Day selector
    const weekStartISO = document.getElementById('weekStart')?.value;
    const dayName = document.getElementById('teamDay')?.value || 'Monday'; // your UI already has this select

    // Map day name -> offset from Monday (0..6)
    const dayIndexMap = { Monday:0, Tuesday:1, Wednesday:2, Thursday:3, Friday:4, Saturday:5, Sunday:6 };
    const offset = dayIndexMap[dayName] ?? 0;

    // Resolve the actual ISO date to display
    const base = weekStartISO ? new Date(weekStartISO + 'T00:00:00') : null;
    const dayISO = base ? (() => { const d = new Date(base); d.setDate(base.getDate() + offset); return d.toISOString().slice(0,10); })() : null;

    const rows = [];
    const allAdvisors = globalThis.ADVISOR_BY_ID || {};
    const selIds = Object.keys(allAdvisors); // simple: show all advisors; we can filter to “selected” later

    selIds.forEach(id => {
      const dayMap = globalThis.ROTAS[id] || {};
      const cell = dayISO ? dayMap[dayISO] : null;
      if (!cell) return;

      const start = cell.start || null;
      const end   = cell.end   || null;
      const label = cell.label || '';

      // row format expected by your renderers: { advisorId, advisorName, dateISO, start, end, label }
      rows.push({
        advisorId: id,
        advisorName: allAdvisors[id]?.name || id,
        dateISO: dayISO,
        start,
        end,
        label
      });
    });

    console.log('[rows] from ROTAS →', rows.length, 'for', dayName, dayISO);
    return rows;
  } catch (e) {
    console.warn('[rows] compute from ROTAS failed', e);
    return [];
  }
};

  // ----- time utils -----
  function parseHHMM(s) {
    if (!s || typeof s !== "string") return null;
    var m = s.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    var h = parseInt(m[1], 10), mm = parseInt(m[2], 10);
    return h * 60 + mm;
  }

  function toPct(min, dayStart, dayEnd) {
    if (min < dayStart) min = dayStart;
    if (min > dayEnd) min = dayEnd;
    var span = dayEnd - dayStart;
    return span > 0 ? ((min - dayStart) / span) * 100 : 0;
  }

  // default window TEMPLATES fallback, only used if page has none
  function ensureDefaultTemplates() {
    if (window.TEMPLATES instanceof Map && window.TEMPLATES.size > 0) return;
    window.TEMPLATES = new Map(Object.entries({
      Early:  { start: "07:00", end: "16:00", breaks: [{ start: "12:00", end: "12:30" }] },
      Middle: { start: "11:00", end: "20:00", breaks: [{ start: "15:00", end: "15:15" }] },
      Late:   { start: "12:00", end: "21:00", breaks: [{ start: "17:30", end: "18:00" }] }
    }));
  }

  function buildSegmentsFromTemplate(tplName) {
    ensureDefaultTemplates();
    if (!(window.TEMPLATES instanceof Map)) return [];
    var t = window.TEMPLATES.get(tplName);
    if (!t || !t.start || !t.end) return [];
    var segs = [{ kind: "shift", start: t.start, end: t.end }];
    var br = Array.isArray(t.breaks) ? t.breaks : [];
    br.forEach(function (b) {
      if (b && b.start && b.end) segs.push({ kind: "break", start: b.start, end: b.end });
    });
    return segs;
  }

  // ----- build rows from current state -----
  function computePlannerRowsFromState() {
    var wsEl = document.getElementById("weekStart");
    var dayEl = document.getElementById("teamDay");
    var ws = wsEl && wsEl.value ? wsEl.value : "";
    var dayName = dayEl && dayEl.value ? dayEl.value : "Monday";

    if (!ws || !(window.ROTAS instanceof Map)) return [];

    var rows = [];
    window.ROTAS.forEach(function (weekObj, key) {
      var parts = String(key).split("::");
      var aId = parts[0] || "";
      var kWs = parts[1] || "";
      if (kWs !== ws) return;

      var tplName = weekObj && weekObj[dayName];
      if (!tplName) return;

      var segments = buildSegmentsFromTemplate(tplName);
      if (!segments.length) return;

      var name = (window.ADVISOR_BY_ID instanceof Map && window.ADVISOR_BY_ID.get(aId)) || aId;
      rows.push({ id: aId, name: name, badge: "", segments: segments });
    });

    rows.sort(function (a, b) { return a.name.localeCompare(b.name); });
    return rows;
  }
  window.computePlannerRowsFromState = computePlannerRowsFromState;

  // ----- render time header (07:00..19:00) -----
  function renderTimeHeader(el) {
    if (!el) return;
    el.innerHTML = "";
    var start = parseHHMM("07:00");
    var end = parseHHMM("19:00");
    for (var h = 7; h <= 19; h++) {
      var d = document.createElement("div");
      d.className = "time-tick";
      d.style.position = "absolute";
      d.style.left = toPct(h * 60, start, end) + "%";
      d.style.top = "0";
      d.style.transform = "translateX(-50%)";
      d.textContent = (h < 10 ? "0" + h : String(h)) + ":00";
      el.appendChild(d);
    }
    el.style.position = "relative";
    el.style.height = "18px";
  }
  window.renderTimeHeader = renderTimeHeader;

  // ----- render horizontal planner -----
  function renderPlanner(rows) {
    var body = document.getElementById("plannerBody");
    if (!body) return;

    var start = parseHHMM("07:00");
    var end = parseHHMM("19:00");

    body.innerHTML = "";

    rows.forEach(function (row) {
      var r = document.createElement("div");
      r.className = "planner-row";
      r.style.display = "grid";
      r.style.gridTemplateColumns = "220px 1fr";
      r.style.alignItems = "center";
      r.style.gap = "8px";
      r.style.margin = "6px 0";

      var name = document.createElement("div");
      name.className = "planner-name";
      name.textContent = row.name || row.id || "";
      name.style.fontWeight = "600";

      var track = document.createElement("div");
      track.className = "planner-track";
      track.style.position = "relative";
      track.style.height = "32px";
      track.style.background = "var(--track-bg, #f7f7fb)";
      track.style.border = "1px solid #e6e6ef";
      track.style.borderRadius = "8px";
      track.style.overflow = "hidden";

      row.segments.forEach(function (seg) {
        var s = parseHHMM(seg.start);
        var e = parseHHMM(seg.end);
        if (s == null || e == null || e <= s) return;

        var left = toPct(s, start, end);
        var right = toPct(e, start, end);
        var bar = document.createElement("div");
        bar.className = "seg " + (seg.kind === "break" ? "seg-break" : "seg-shift");
        bar.style.position = "absolute";
        bar.style.left = left + "%";
        bar.style.width = Math.max(0, right - left) + "%";
        bar.style.top = seg.kind === "break" ? "8px" : "4px";
        bar.style.bottom = seg.kind === "break" ? "8px" : "4px";
        bar.style.borderRadius = "6px";
        bar.style.background = seg.kind === "break" ? "#ffdb77" : "#57c97b";
        bar.title = (seg.kind === "break" ? "Break " : "Shift ") + seg.start + " - " + seg.end;
        track.appendChild(bar);
      });

      r.appendChild(name);
      r.appendChild(track);
      body.appendChild(r);
    });
  }
  window.renderPlanner = renderPlanner;

  // ----- (optional) render vertical week -----
  function renderAdvisorWeek(/* rows */) {
    // No-op here; your existing calendar renderer can keep handling the vertical view.
  }
  window.renderAdvisorWeek = renderAdvisorWeek;

  // --- Dev preview: wire the Preview Rotation button (end-of-file to guarantee DOM exists) ---
(function () {
  const wire = () => {
    const btn = document.getElementById('previewRotation');
    if (!btn) return;                     // button not present
    if (btn.dataset._wired) return;       // avoid double-binding
    btn.dataset._wired = '1';

    btn.addEventListener('click', async () => {
      try {
        console.log('[preview] click');
        await globalThis.bootAdvisors?.();
        await globalThis.bootRotations?.();

        await globalThis.bootRotations?.();
globalThis.populateRotationSelect?.();

const sel = document.getElementById('rotationName');
const rotationName = (sel && sel.value) || Object.keys(globalThis.ROTATION || {})[0];
if (!rotationName) return console.warn('No rotations found');

        const mondayISO = document.getElementById('weekStart')?.value || '2025-10-20';
        const advisors = Object.keys(globalThis.ADVISOR_BY_ID || {}).slice(0, 8);
        const startISO = globalThis.ROTATION_META?.[rotationName]?.start_date || null;

        const res = globalThis.applyRotationToWeek?.({
          rotationName,
          mondayISO,
          advisors,
          rotationStartISO: startISO
        });
        console.log('[preview] applied', res);
      } catch (e) {
        console.error('Preview Rotation failed', e);
      }
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }
})();

})();
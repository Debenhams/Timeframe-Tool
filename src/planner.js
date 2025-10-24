// src/planner.js
(async function () {

  "use strict";
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
  await loadShiftTemplatesAndVariants();
  await loadRotationsWithHours();
  console.log("Rotations booted", {
    templates: Object.keys(globalThis.SHIFT_BY_CODE || {}).length,
    families: Object.keys(globalThis.VARIANTS_BY_START_END || {}).length
  });
};
// also load rotation metadata (auto-detect the name and start_date columns)
const { data: metaRows, error: metaErr } = await supabase
  .from('rotations')
  .select('*');
if (metaErr) console.warn('rotations meta error', metaErr);
globalThis.ROTATION_META = {};

const sampleMeta = (metaRows && metaRows[0]) || {};
const nameKey  = ['name','rotation_name','title','label'].find(k => k in sampleMeta) || null;
const startKey = ['start_date','start','starts_on','cycle_start','startDate'].find(k => k in sampleMeta) || null;

(metaRows || []).forEach(r => {
  const n = nameKey  ? r[nameKey]  : undefined;
  const s = startKey ? r[startKey] : undefined;
  if (n) {
    globalThis.ROTATION_META[n] = { start_date: s || null };
  }
});



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
  rotationStartISO,   // rotation cycle start (optional; falls back to ROTATION_META)
}) {
  const rot = globalThis.ROTATION?.[rotationName];
  if (!rot) { console.warn('No rotation:', rotationName); return; }

  // Work out which week number this Monday is in the cycle
  const startISO = rotationStartISO || globalThis.ROTATION_META?.[rotationName]?.start_date;
  const weekNum = (typeof globalThis.effectiveWeek === 'function' && startISO)
    ? globalThis.effectiveWeek(startISO, mondayISO)
    : 1;

  // Use that week (fallback to week 1 if missing)
  const w = rot[weekNum] || rot[1];
  if (!w) { console.warn('No week found for', rotationName, 'num:', weekNum); return; }

  // Build Mon..Sun ISO date list for the chosen week
  const base = new Date(mondayISO + 'T00:00:00');
  const isoDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base); d.setDate(base.getDate() + i);
    return d.toISOString().slice(0, 10);
  });

  // Normalise advisor IDs
  const ids = advisors.map(a => (typeof a === 'string' ? a : a.id));
  const nextRotas = {};

  isoDates.forEach((iso, i) => {
    const dow = i + 1;                           // 1..7
    const cell = w[dow];
    if (!cell) return;

    if (cell.is_rdo) {
      ids.forEach(id => { (nextRotas[id] ||= {})[iso] = { label: 'RDO' }; });
      return;
    }

    const sek = cell.start_end_key;              // e.g. "07:00x16:00"
    const fam = globalThis.VARIANTS_BY_START_END?.[sek] || null;
    const variants = fam ? Object.keys(fam) : [];

    ids.forEach((id, idx) => {
      (nextRotas[id] ||= {});
      if (fam && variants.length) {
        const key = variants[idx % variants.length]; // round-robin across variants
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

// --- Dev preview: wire the Preview Rotation button ---
(function wirePreviewButton() {
  const btn = document.getElementById('previewRotation');
  if (!btn) return;                // no button found
  if (btn.dataset._wired) return;  // avoid double-binding
  btn.dataset._wired = '1';

  btn.addEventListener('click', async () => {
    try {
      await globalThis.bootAdvisors?.();
      await globalThis.bootRotations?.();

      const names = Object.keys(globalThis.ROTATION || {});
      if (!names.length) return console.warn('No rotations found');

      const rotationName = names[0]; // e.g., "Flex 1"
      const mondayISO = document.getElementById('weekStart')?.value || '2025-10-20';
      const advisors = Object.keys(globalThis.ADVISOR_BY_ID || {}).slice(0, 8);

      const startISO = globalThis.ROTATION_META?.[rotationName]?.start_date || null;
      globalThis.applyRotationToWeek?.({
        rotationName,
        mondayISO,
        advisors,
        rotationStartISO: startISO
      });
    } catch (e) {
      console.error('Preview Rotation failed', e);
    }
  });
})();

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
})();
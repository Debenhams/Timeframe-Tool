// src/planner.js
(async function () {

  "use strict";
  // safe shims so any UI code can call these without errors
globalThis.showError = globalThis.showError || function (msg) { console.warn(String(msg)); };
globalThis.showInfo  = globalThis.showInfo  || function (msg) { console.log(String(msg));  };

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
    (groups[key] ||= {})[t.code] = t;   // map: code -> full template row (with start/end)

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
// ---- date helpers (needed by preview + renderer) ----
function toISODateLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Accepts "YYYY-MM-DD", or "DD/MM/YYYY", or any Date-parsable string
function normalizeToISO(s) {
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;                // already ISO
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);            // DD/MM/YYYY
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(s);
  return isNaN(d) ? String(s) : toISODateLocal(d);
}

// Given an ISO date, return the Monday (ISO) of that week
function toMondayISO(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  // JS: 0=Sun..6=Sat  -> make 0=Mon..6=Sun
  const offset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - offset);
  return toISODateLocal(d);
}

// expose
globalThis.toISODateLocal = toISODateLocal;
globalThis.normalizeToISO  = normalizeToISO;
globalThis.toMondayISO     = toMondayISO;

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
    // Fallback: if helpers didn’t populate ROTATION, build from the view
    if (!globalThis.ROTATION || !Object.keys(globalThis.ROTATION).length) {
      const { data: vhRows, error: vhErr } = await sb
        .from('v_rotations_with_hours')
        .select('name,week,dow,is_rdo,start_end_key')
        .order('name', { ascending: true })
        .order('week', { ascending: true })
        .order('dow', { ascending: true });

      if (vhErr) { console.warn('v_rotations_with_hours error', vhErr); }

      const ROT = {};
      (vhRows || []).forEach(r => {
        const n = r.name;
        const w = String(r.week || 1);      // weeks are 1..6
        const d = Number(r.dow);            // days are 1..7 (Mon..Sun)

        ROT[n] ||= {};
        ROT[n][w] ||= {};
        ROT[n][w][d] = r.is_rdo
          ? { is_rdo: true }
          : { start_end_key: r.start_end_key };
      });

      globalThis.ROTATION = ROT;
      console.log('built ROTATION from view → families:', Object.keys(ROT).length);
    }

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

  const startISO = rotationStartISO || globalThis.ROTATION_META?.families?.[rotationName]?.start_date;
  const weekNum = (typeof globalThis.effectiveWeek === 'function' && startISO)
    ? globalThis.effectiveWeek(startISO, mondayISO)
    : 1;

  const w = rot[weekNum] || rot[1];
  if (!w) { console.warn('No week found for', rotationName, 'num:', weekNum); return; }

  // Build week dates in LOCAL time → YYYY-MM-DD (no timezone drift)
const [yy, mm, dd] = mondayISO.split("-").map(Number);
const base = new Date(yy, (mm || 1) - 1, dd || 1);
const isoDates = Array.from({ length: 7 }, (_, i) => {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
  return toISODateLocal(d);
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
// --- Fill the "Rotation" <select id="rotationName"> from loaded data ---
globalThis.populateRotationSelect = function populateRotationSelect() {
  const sel = document.getElementById('rotationName');
  if (!sel) return;
  const names =
    (globalThis.ROTATION && Object.keys(globalThis.ROTATION)) ||
    (globalThis.ROTATION_META && Object.keys(globalThis.ROTATION_META.families || {})) ||
    [];
  if (!names.length) return;

  // Keep the current choice if possible
  const cur = sel.value;
  sel.innerHTML = names.map(n => `<option value="${n}">${n}</option>`).join('');
  if (cur && names.includes(cur)) sel.value = cur;
};
// --- Build a robust advisor reverse index (id -> displayName) once ---
(function () {
  function buildAdvisorIndex() {
    const idx = Object.create(null);

    const put = (key, name) => {
      if (!key) return;
      const k = String(key);
      if (!idx[k]) idx[k] = name || k;
    };

    const bestName = (a) =>
      a?.name ||
      a?.display_name ||
      a?.full_name ||
      a?.advisor_name ||
      a?.username ||
      a?.email ||
      '';

    const store = globalThis.ADVISOR_BY_ID;

    if (store instanceof Map) {
      for (const [k, v] of store.entries()) {
        const name = bestName(v);
        put(k, name);
        put(v?.id, name);
        put(v?.advisor_id, name);
        put(v?.uuid, name);
      }
    } else if (store && typeof store === 'object') {
      for (const k of Object.keys(store)) {
        const v = store[k];
        const name = bestName(v);
        put(k, name);
        put(v?.id, name);
        put(v?.advisor_id, name);
        put(v?.uuid, name);
      }
    }
    return idx;
  }

  // expose once
  if (!globalThis.__ADVISOR_INDEX) {
    globalThis.__ADVISOR_INDEX = buildAdvisorIndex();
  }
})();

// --- Compute rows from ROTAS for the chosen day ---
globalThis.computePlannerRowsFromState = function computePlannerRowsFromState() {
  try {
    // Week + day from the UI
    const weekStartISO = document.getElementById('weekStart')?.value;
    const dayName = document.getElementById('teamDay')?.value || 'Monday';
    if (!weekStartISO || !globalThis.ROTAS) return [];

    // Map day name -> 0..6 (Mon..Sun)
    const dayIndexMap = { Monday:0, Tuesday:1, Wednesday:2, Thursday:3, Friday:4, Saturday:5, Sunday:6 };
    const offset = dayIndexMap[dayName] ?? 0;

    // Resolve YYYY-MM-DD for the chosen day, based on Monday-of-week
    const base = new Date(weekStartISO + 'T00:00:00');
    const d = new Date(base);
    d.setDate(base.getDate() + offset);
    const dayISO = d.toISOString().slice(0, 10);

    // Helper to fetch advisor object by id (works for Map or plain object caches)
    const getAdvisorById = (id) => {
      const store = globalThis.ADVISOR_BY_ID;
      if (!store) return null;
      if (store instanceof Map) return store.get(id) || null;
      if (typeof store === 'object') return store[id] || null;
      return null;
    };

    const rows = [];

    // IMPORTANT: iterate the ROTAS keys (advisor IDs), not the advisor cache
    Object.keys(globalThis.ROTAS || {}).forEach((id) => {
      const dayMap = globalThis.ROTAS[id] || {};
      const cell = dayMap[dayISO];
      if (!cell) return;

      // Hide pure RDO rows (uncomment to show RDO chips if you want)
      if (cell.label === 'RDO' || cell.is_rdo) return;

      const segs = [];
      if (cell.start && cell.end) {
        segs.push({ kind: 'shift', start: cell.start, end: cell.end });
      }

      const adv = getAdvisorById(id) || {};
      const name =
        adv.name ||
        adv.display_name ||
        adv.full_name ||
        adv.advisor_name ||
        adv.username ||
        adv.email ||
        id; // last resort

      rows.push({ id, name, badge: '', segments: segs });
    });

    rows.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    console.log('[rows debug]', { dayISO, count: rows.length });
    return rows;
  } catch (e) {
    console.warn('[rows] compute from ROTAS failed', e);
    return [];
  }
};



  // ----- time utils -----
  function parseHHMM(s) {
  // Accept minutes as a number, "HH:MM", or "HH:MM:SS"
  if (typeof s === "number" && isFinite(s)) return s;
  if (!s) return null;
  const str = String(s).trim();
  // Trim seconds if present (HH:MM:SS → HH:MM)
  const hhmm = str.length >= 5 ? str.slice(0, 5) : str;
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
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
// normalize DD/MM/YYYY or MM/DD/YYYY into ISO YYYY-MM-DD
function normalizeToISO(d) {
  if (!d) return "";
  // DD/MM/YYYY → YYYY-MM-DD
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(d);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  // already ISO or browser-parsable → return as-is
  return d;
}
// Get the Monday of the week for a given ISO date (YYYY-MM-DD), using LOCAL time
function toMondayISO(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  const dow = dt.getDay();                    // 0=Sun .. 1=Mon .. 6=Sat
  const delta = (dow === 0 ? -6 : 1 - dow);   // shift to Monday
  const mon = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() + delta);
  const yy = mon.getFullYear();
  const mm = String(mon.getMonth() + 1).padStart(2, "0");
  const dd2 = String(mon.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd2}`;
}

  // ----- build rows from current state -----
function computePlannerRowsFromState(){
  const rows = [];
  const $ = (sel) => document.querySelector(sel);

  // Inputs from the UI
  const wsISO  = $('#weekStart')?.value || null;                // Monday ISO
  const daySel = $('#teamDay')?.value || 'Monday';              // day name (assignment table view)
  const dayISO = (function toDayISO(){
    if (!wsISO) return null;
    const base = new Date(wsISO + 'T00:00:00');
    const DOW = { Monday:1, Tuesday:2, Wednesday:3, Thursday:4, Friday:5, Saturday:6, Sunday:7 };
    const d = (DOW[daySel] || 1) - 1; // 0..6
    const dt = new Date(base); dt.setDate(base.getDate() + d);
    const yy = dt.getFullYear(), mm = String(dt.getMonth()+1).padStart(2,'0'), dd = String(dt.getDate()).padStart(2,'0');
    return `${yy}-${mm}-${dd}`;
  })();

  // Helpers
  const parseHHMM = (s)=>{ if(!s) return null; const m=s.match(/^(\d{1,2}):(\d{2})$/); if(!m) return null; return (+m[1])*60+(+m[2]); };
  const m2t = (m)=>`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;

  function buildSegmentsFromTemplate(tplName){
    const t = (window.TEMPLATES instanceof Map)
      ? window.TEMPLATES.get(tplName)
      : (window.TEMPLATES||{})[tplName];
    if (!t) return [];
    const start = parseHHMM(t.start_time || t.start || '09:00');
    const end   = parseHHMM(t.finish_time || t.end   || '17:00');
    const breaks = []
      .concat(t.break1 ? [{ type:'break', code:'Break', start:parseHHMM(t.break1), end:parseHHMM(t.break1_end||t.break1) }] : [])
      .concat(t.lunch  ? [{ type:'lunch', code:'Lunch', start:parseHHMM(t.lunch),  end:parseHHMM(t.lunch_end||t.lunch)   }] : [])
      .concat(t.break2 ? [{ type:'break', code:'Break', start:parseHHMM(t.break2), end:parseHHMM(t.break2_end||t.break2) }] : []);
    const pauses = breaks.filter(b => b.start != null && b.end != null && b.end > b.start).sort((a,b)=>a.start-b.start);
    const out = [];
    let cur = start;
    for(const p of pauses){
      if (p.start > cur) out.push({ type:'work', code:t.work_code || 'Admin', start:cur, end:Math.min(p.start, end) });
      out.push({ type:p.type, code:p.code, start:Math.max(p.start, start), end:Math.min(p.end, end) });
      cur = Math.max(cur, p.end);
    }
    if (cur < end) out.push({ type:'work', code:t.work_code || 'Admin', start:cur, end });
    return out;
  }

  // Case A: assignment table snapshot (Map)
  if (window.ROTAS instanceof Map) {
    const ids = Array.from(window.ADVISOR_BY_ID?.keys?.() || []);
    ids.forEach(aId => {
      const name = (
        window.ADVISOR_BY_ID?.get?.(aId) ||
        window.ADVISOR_BY_ID?.[aId]?.name ||
        window.ADVISOR_BY_ID?.[aId] ||
        aId
      );
      const key  = `${aId}::${wsISO}`;
      const weekObj = window.ROTAS.get(key) || {};
      const tplName = weekObj[daySel];
      let segs = [];
      if (typeof tplName === 'string') {
        segs = buildSegmentsFromTemplate(tplName);
      } else if (tplName && typeof tplName === 'object' && Array.isArray(tplName.segments)) {
        segs = (tplName.segments || []).map(s => ({
          type: s.type || 'work',
          code: s.code || 'Admin',
          start: parseHHMM(s.start),
          end:   parseHHMM(s.end)
        })).filter(s => s.start != null && s.end != null && s.end > s.start);
      }
      rows.push({ id:aId, name, badge:'', segments: segs });
    });
    return rows.sort((a,b)=>String(a.name).localeCompare(String(b.name)));
  }

  // Case B: rotation preview (object)
if (window.ROTAS && typeof window.ROTAS === 'object' && dayISO) {
  const ids = Object.keys(window.ROTAS || {});
  ids.forEach((aId) => {
    // Resolve human name from either Map or plain object caches
    const name =
      (window.ADVISOR_BY_ID?.get?.(aId)) ||
      (window.ADVISOR_BY_ID?.[aId]?.name) ||
      (window.ADVISOR_BY_ID?.[aId]) ||
      aId;

    const cell = (window.ROTAS[aId] || {})[dayISO];
    let segs = [];

    if (cell?.is_rdo) {
      // Show an explicit RDO badge so planners have visibility
      segs = [{
        type: 'tag',
        code: 'RDO',
        atDay: dayISO,
        start: null,
        end: null,
        label: 'Roster Day Off'
      }];
    } else if (cell?.start_hhmm && cell?.end_hhmm) {
      const s = parseHHMM(cell.start_hhmm);
      const e = parseHHMM(cell.end_hhmm);
      if (s != null && e != null && e > s) {
        segs = [{
          type: 'work',
          code: cell.work_code || 'Admin',
          atDay: dayISO,
          start: s,         // minutes-from-midnight number
          end: e            // minutes-from-midnight number
        }];
      }
    }

    // Always push a row for the selected advisors; empty segs means blank lane
    rows.push({ id: aId, name, badge: '', segments: segs });
  });

  // keep the list stable and human-friendly
  return rows.sort((a,b)=>String(a.name).localeCompare(String(b.name)));
}



  // Fallback
  return [];
}

window.computePlannerRowsFromState = computePlannerRowsFromState;

// --- Adapter: ensure refreshPlannerUI uses our rows ---
(function patchRefresh() {
  const orig = globalThis.refreshPlannerUI;
  globalThis.refreshPlannerUI = function patchedRefresh() {
    if (typeof orig === 'function') orig();

    const rows = (typeof globalThis.computePlannerRowsFromState === 'function')
      ? globalThis.computePlannerRowsFromState()
      : [];

    // Debug: see what we're drawing
    console.log('[render rows]', rows.length, rows[0] || null);

    if (typeof globalThis.renderPlanner === 'function') {
      globalThis.renderPlanner(rows);
    }
  };
})();


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
  // --- preview legend of selected ROTAS (names, not UUIDs) ---
 
  // --- preview legend of selected ROTAS (names, not UUIDs) ---
(function renderPreviewLegend() {
  // Only show chips if explicitly enabled
  if (window.SHOW_PREVIEW_LEGEND !== true) {
    // If a previous strip exists, remove it and bail
    const old = document.getElementById('previewLegendStrip');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    return;
  }

    // Build a lookup that resolves any id → best human name
    const getName = (aId) => {
      const advStore = globalThis.ADVISOR_BY_ID;
      if (advStore instanceof Map) {
        const a = advStore.get(aId) || {};
        return (
          a.name || a.display_name || a.full_name ||
          a.advisor_name || a.username || a.email || String(aId)
        );
      } else if (advStore && typeof advStore === "object") {
        const a = advStore[aId] || {};
        return (
          a.name || a.display_name || a.full_name ||
          a.advisor_name || a.username || a.email || String(aId)
        );
      }
      return String(aId);
    };

    // Keys of ROTAS are the selected advisors for the preview week
    const ids = Object.keys(globalThis.ROTAS || {});
    if (!ids.length) return;

    // Legend strip container (inserted at the top of plannerBody)
    const strip = document.createElement('div');
strip.id = 'previewLegendStrip';
    strip.className = "legend-strip";
    strip.style.display = "flex";
    strip.style.flexWrap = "wrap";
    strip.style.gap = "6px";
    strip.style.margin = "6px 0 10px 0";

    // Create name chips
    ids.forEach((id) => {
      const chip = document.createElement("div");
      chip.className = "name-chip";
      chip.textContent = getName(id);
      chip.style.padding = "6px 10px";
      chip.style.borderRadius = "999px";
      chip.style.background = "#f1f3f8";
      chip.style.border = "1px solid #e6e6ef";
      chip.style.fontSize = "12px";
      chip.style.lineHeight = "1";
      strip.appendChild(chip);
    });

    body.appendChild(strip);
  })();

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
globalThis.populateRotationSelect?.();

const sel = document.getElementById('rotationName');
    const rotationName =
      (sel && sel.value)
      || Object.keys(globalThis.ROTATION || {})[0]
      || Object.keys(globalThis.ROTATION_META?.families || {})[0];
    if (!rotationName) return console.warn('No rotations found (check ROTATION and ROTATION_META.families)');


        const rawWs = document.getElementById('weekStart')?.value || '2025-10-20';
const wsISO = (typeof normalizeToISO === 'function') ? normalizeToISO(rawWs) : rawWs;
const mondayISO = (typeof toMondayISO === 'function') ? toMondayISO(wsISO) : wsISO;

        // prefer currently-checked advisors in the Schedules tree
const checked = Array.from(
  document.querySelectorAll('#advisorTree input[type="checkbox"][data-role="advisor"]:checked')
).map(el => el.value || el.dataset.id).filter(Boolean);

// fall back to “first 8” if nothing is checked
const advisors = (checked.length ? checked : Object.keys(globalThis.ADVISOR_BY_ID || {})).slice(0, 8);

        const startISO = globalThis.ROTATION_META?.families?.[rotationName]?.start_date || null;

        const res = globalThis.applyRotationToWeek?.({
          rotationName,
          mondayISO,
          advisors,
          rotationStartISO: startISO
        });
        console.log('[preview] applied', res);
        if (typeof refreshPlannerUI === 'function') refreshPlannerUI();

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
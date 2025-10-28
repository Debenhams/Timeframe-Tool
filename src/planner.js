// src/planner.js (helpers + data boot + render, no duplication with init.js)
(async function () {
  "use strict";

  // Safe shims
  globalThis.showError = globalThis.showError || function (msg) { console.warn(String(msg)); };
  globalThis.showInfo  = globalThis.showInfo  || function (msg) { console.log(String(msg));  };

  // Supabase alias
  const supabase = (typeof window !== 'undefined' && window.supabase) ? window.supabase : null;

  // ===== Date & time helpers =====
  function toISODateLocal(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function normalizeToISO(s) {
    if (!s) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;                // already ISO
    const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);            // DD/MM/YYYY
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    const d = new Date(s);
    return isNaN(d) ? String(s) : toISODateLocal(d);
  }

  function toMondayISO(iso) {
    if (!iso) return "";
    const d = new Date(iso + "T00:00:00");
    const offset = (d.getDay() + 6) % 7; // 0=Mon..6=Sun
    d.setDate(d.getDate() - offset);
    return toISODateLocal(d);
  }

  function parseHHMM(s) {
    if (!s || typeof s !== "string") return null;
    const m = s.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const h = parseInt(m[1], 10), mm = parseInt(m[2], 10);
    return h * 60 + mm;
  }

  // 6-week cycle effective week (1..6)
  function effectiveWeek(startDateStr, plannerWeekStartStr) {
    const start = new Date(startDateStr);
    const plan  = new Date(plannerWeekStartStr);
    const diffDays  = Math.floor((plan - start) / 86400000);
    const diffWeeks = Math.floor(diffDays / 7);
    return ((diffWeeks % 6) + 6) % 6 + 1;
  }

  // Expose
  globalThis.toISODateLocal = toISODateLocal;
  globalThis.normalizeToISO  = normalizeToISO;
  globalThis.toMondayISO     = toMondayISO;
  globalThis.effectiveWeek   = globalThis.effectiveWeek || effectiveWeek;

  // ===== Data caches =====
  globalThis.ADVISOR_BY_ID   = globalThis.ADVISOR_BY_ID   || {};
  globalThis.ADVISOR_BY_NAME = globalThis.ADVISOR_BY_NAME || {};
  globalThis.ROTATION        = globalThis.ROTATION        || {}; // ROTATION[name][week][dow]
  globalThis.ROTATION_META   = globalThis.ROTATION_META   || { templates:{}, families:{} };
  globalThis.SHIFT_BY_CODE   = globalThis.SHIFT_BY_CODE   || {};
  globalThis.VARIANTS_BY_START_END = globalThis.VARIANTS_BY_START_END || {};
  globalThis.ROTAS           = globalThis.ROTAS           || {}; // { [advisorId]: { [isoDate]: {start,end,label} } }

  // ===== Loaders =====
  async function loadShiftTemplatesAndVariants() {
    if (!supabase) return;
    const { data: templates, error } = await supabase
      .from("shift_templates")
      .select("code, name, start_time, break1, lunch, break2, end_time");
    if (error) { console.error("shift_templates error", error); return; }

    globalThis.SHIFT_BY_CODE = Object.fromEntries((templates||[]).map(t => [t.code, t]));

    const groups = {}; // "07:00x16:00" -> ["7A","7B","7C",...]
    const hhmm = x => (x || "").toString().slice(0,5);
    for (const t of (templates||[])) {
      const key = `${hhmm(t.start_time)}x${hhmm(t.end_time)}`;
      (groups[key] ||= []).push(t.code);
    }
    for (const k of Object.keys(groups)) groups[k].sort();
    globalThis.VARIANTS_BY_START_END = groups;
  }

  async function loadRotationsWithHours() {
    if (!supabase) return;
    const { data, error } = await supabase
      .from("v_rotations_with_hours")
      .select("name, week, dow, is_rdo, shift_code, start_hhmm, end_hhmm, start_end_key")
      .order("name").order("week").order("dow");
    if (error) { console.error("v_rotations_with_hours error", error); return; }
    const idx = {};
    for (const r of (data||[])) {
      idx[r.name] ||= {};
      idx[r.name][r.week] ||= {};
      idx[r.name][r.week][r.dow] = { is_rdo: r.is_rdo, start_end_key: r.start_end_key };
    }
    globalThis.ROTATION = idx;
  }

  async function bootRotations() {
    try {
      await loadShiftTemplatesAndVariants();
      await loadRotationsWithHours();

      // Fallback: build ROTATION from view if empty (defensive)
      if (!globalThis.ROTATION || !Object.keys(globalThis.ROTATION).length) {
        if (!supabase) return;
        const { data: vhRows, error: vhErr } = await supabase
          .from('v_rotations_with_hours')
          .select('name,week,dow,is_rdo,start_end_key')
          .order('name', { ascending: true })
          .order('week', { ascending: true })
          .order('dow', { ascending: true });

        if (vhErr) { console.warn('v_rotations_with_hours error', vhErr); }

        const ROT = {};
        (vhRows || []).forEach(r => {
          const n = r.name;
          const w = String(r.week || 1);
          const d = Number(r.dow);
          ROT[n] ||= {};
          ROT[n][w] ||= {};
          ROT[n][w][d] = r.is_rdo ? { is_rdo: true } : { start_end_key: r.start_end_key };
        });

        globalThis.ROTATION = ROT;
      }

      // Templates (weekly patterns) + families (sequence)
      if (supabase) {
        const { data: tmplRows } = await supabase.from("shift_templates").select("*");
        const templatesByName = {};
        for (const r of (tmplRows||[])) {
          const name = (r.name||'').trim();
          if (!name) continue;
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

        const { data: famRows } = await supabase.from("rotations").select("*");
        const familiesByName = {};
        for (const r of (famRows||[])) {
          const name = (r.name||'').trim();
          if (!name) continue;
          let sequence = r.sequence;
          if (!sequence || !Array.isArray(sequence)) {
            sequence = [r.week1, r.week2, r.week3, r.week4, r.week5, r.week6].filter(x => x != null);
          }
          familiesByName[name] = { name, start_date: r.start_date ?? null, sequence };
        }

        globalThis.ROTATION_META = { templates: templatesByName, families: familiesByName };
      }

      console.log("Rotations booted", {
        templates: Object.keys(globalThis.ROTATION_META.templates||{}).length,
        families: Object.keys(globalThis.ROTATION_META.families||{}).length,
      });
    } catch (err) {
      console.error("bootRotations error:", err);
      throw err;
    }
  }
  globalThis.bootRotations = bootRotations;

  // ===== Advisors =====
  async function bootAdvisors() {
    if (!supabase) return 0;
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

    // Fill advisorSelect for convenience
    const sel = document.getElementById('advisorSelect');
    if (sel) {
      const items = Object.values(globalThis.ADVISOR_BY_ID);
      sel.innerHTML = items.map(a => `<option value="${a.id}">${a.name || a.email || a.id}</option>`).join('');
    }

    console.log('bootAdvisors ok:', Object.keys(globalThis.ADVISOR_BY_ID).length);
    return Object.keys(globalThis.ADVISOR_BY_ID).length;
  }
  globalThis.bootAdvisors = bootAdvisors;

  // ===== Variant assignment =====
  function assignVariantsRoundRobin(advisorIdsInGroup, startEndKey) {
    const fam = (globalThis.VARIANTS_BY_START_END && globalThis.VARIANTS_BY_START_END[startEndKey]) || [];
    const variants = Array.isArray(fam) ? fam : []; // ✅ fixed (was Object.keys on array)
    if (!variants.length) return {};
    const sorted = (advisorIdsInGroup||[]).slice().sort();
    const result = {};
    for (let i = 0; i < sorted.length; i++) result[sorted[i]] = variants[i % variants.length];
    return result;  // { advisorId: "7A" | "7B" | ... }
  }
  globalThis.assignVariantsRoundRobin = globalThis.assignVariantsRoundRobin || assignVariantsRoundRobin;

  // ===== Apply a rotation week into ROTAS and re-render =====
  function applyRotationToWeek({
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

    const [yy, mm, dd] = mondayISO.split("-").map(Number);
    const base = new Date(yy, (mm || 1) - 1, dd || 1);
    const isoDates = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
      return toISODateLocal(d);
    });

    const ids = advisors.map(a => (typeof a === 'string' ? a : a.id));
    const nextRotas = {};

    isoDates.forEach((iso, i) => {
      const dow = i + 1;                   // 1..7 (Mon..Sun)
      const cell = w[dow];
      if (!cell) return;

      if (cell.is_rdo) {
        ids.forEach(id => { (nextRotas[id] ||= {})[iso] = { label: 'RDO' }; });
        return;
      }

      const sek = cell.start_end_key;
      const fam = globalThis.VARIANTS_BY_START_END?.[sek] || null;
      const variants = Array.isArray(fam) ? fam : [];

      ids.forEach((id, idx) => {
        (nextRotas[id] ||= {});
        if (variants.length) {
          const key = variants[idx % variants.length];
          const v = globalThis.SHIFT_BY_CODE[key];
          nextRotas[id][iso] = { start: v?.start_time?.slice(0,5), end: v?.end_time?.slice(0,5), label: v?.name || key };
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
  }
  globalThis.applyRotationToWeek = applyRotationToWeek;

  // ===== Compute rows for the planner (one selected day) =====
  function computePlannerRowsFromState() {
    try {
      const hasROTAS = globalThis.ROTAS && Object.keys(globalThis.ROTAS).length > 0;
      if (!hasROTAS) return [];

      const weekStartISO = document.getElementById('weekStart')?.value;
      const dayName = document.getElementById('teamDay')?.value || 'Monday';
      const dayIndexMap = { Monday:0, Tuesday:1, Wednesday:2, Thursday:3, Friday:4, Saturday:5, Sunday:6 };
      const offset = dayIndexMap[dayName] ?? 0;
      const base = weekStartISO ? new Date(weekStartISO + 'T00:00:00') : null;
      const dayISO = base ? (() => { const d = new Date(base); d.setDate(base.getDate() + offset); return d.toISOString().slice(0,10); })() : null;

      const rows = [];
      const allAdvisors = globalThis.ADVISOR_BY_ID || {};
      const selIds = Object.keys(allAdvisors); // simple: show all advisors

      selIds.forEach(id => {
        const dayMap = globalThis.ROTAS[id] || {};
        const cell = dayISO ? dayMap[dayISO] : null;
        if (!cell) return;

        const start = cell.start || null;
        const end   = cell.end   || null;
        const label = cell.label || '';

        rows.push({
          advisorId: id,
          advisorName: allAdvisors[id]?.name || id,
          dateISO: dayISO,
          start, end, label
        });
      });
      return rows;
    } catch (e) {
      console.warn('[rows] compute failed', e);
      return [];
    }
  }
  globalThis.computePlannerRowsFromState = computePlannerRowsFromState;

  // ===== Render (horizontal planner) =====
  const DAY_START = 6*60, DAY_END = 20*60;
  function m2hmm(m){const h=Math.floor(m/60),mm=String(m%60).padStart(2,'0');return`${h}:${mm}`;}
  function spanPct(s,e){const span=DAY_END-DAY_START;return{
    left: Math.max(0,(s-DAY_START)/span*100),
    width: Math.max(0,Math.min(100,(e-s)/span*100))
  };}

  function renderTimeHeader(el){
    if(!el) return; el.innerHTML='';
    const w=document.createElement('div'); w.className='time-scale';
    for(let m=DAY_START;m<=DAY_END;m+=60){
      const t=document.createElement('div'); t.className='tick';
      t.style.left=`${((m-DAY_START)/(DAY_END-DAY_START))*100}%`;
      t.textContent=m2hmm(m);
      w.appendChild(t);
    }
    el.appendChild(w);
  }
  globalThis.renderTimeHeader = renderTimeHeader;

  function renderPlanner(rows){
    const body = document.getElementById('plannerBody');
    if(!body) return;
    const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name);
    const dayStart = DAY_START, dayEnd = DAY_END;

    // Build name/timeline rows
    body.innerHTML = rows.map(r => {
      const s = parseHHMM(r.start); const e = parseHHMM(r.end);
      const pos = (s!=null&&e!=null) ? spanPct(s,e) : {left:0,width:0};
      const left = pos.left.toFixed(4), width = pos.width.toFixed(4);
      const klass = (()=> {
        const k=(r.label||'').toLowerCase();
        if(/\blunch\b/.test(k)) return 'c-lunch';
        if(/\bbreak\b/.test(k)) return 'c-break';
        if(/\bovertime\b/.test(k)) return 'c-overtime';
        if(/\bmirakl\b/.test(k)) return 'c-mirakl';
        if(/\bsocial\b/.test(k)) return 'c-social';
        if(/\bemail\b/.test(k)) return 'c-email';
        if(['al','sick','rdo','maternity','lts','split shift'].some(w=>k.includes(w))) return 'c-absence';
        if(['121','atl','coaching','huddle','iti','projects','team meeting','training'].some(w=>k.includes(w))) return 'c-shrink';
        return 'c-email';
      })();
      const bar = (s!=null&&e!=null) ? `<div class="planner__bar ${klass}" style="left:${left}%;width:${width}%;" title="${r.label} ${r.start||''}–${r.end||''}"></div>` : '';
      return `
        <div class="planner__row">
          <div class="planner__name"><span>${r.advisorName}</span></div>
          <div class="planner__timeline">${bar}</div>
        </div>`;
    }).join('');
  }
  globalThis.renderPlanner = renderPlanner;

  // ===== Refresh funnel =====
  function refreshPlannerUI(){
    const rows = computePlannerRowsFromState() || [];
    renderPlanner(rows);
  }
  globalThis.refreshPlannerUI = refreshPlannerUI;

  // ===== Rotation name select =====
  function populateRotationSelect(){
    const sel = document.getElementById('rotationName');
    if (!sel) return;
    const names =
      (globalThis.ROTATION && Object.keys(globalThis.ROTATION)) ||
      (globalThis.ROTATION_META && Object.keys(globalThis.ROTATION_META.families || {})) ||
      [];
    if (!names.length) return;
    const cur = sel.value;
    sel.innerHTML = names.map(n => `<option value="${n}">${n}</option>`).join('');
    if (cur && names.includes(cur)) sel.value = cur;
  }
  globalThis.populateRotationSelect = populateRotationSelect;

  console.log("planner.js ready");
})();

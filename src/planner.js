// src/planner.js
(function () {
  "use strict";

  // Safe shims
  globalThis.showError = globalThis.showError || function (msg) { console.warn(String(msg)); };
  globalThis.showInfo  = globalThis.showInfo  || function (msg) { console.log(String(msg));  };

  // Supabase alias
  const supabase = window.supabase;

  // ------------ Rotations + Shift Templates ------------
  async function loadShiftTemplatesAndVariants() {
    const { data: templates, error } = await supabase
      .from("shift_templates")
      .select("code, start_time, break1, lunch, break2, end_time");
    if (error) { console.error("shift_templates error", error); return; }

    // code -> full row
    globalThis.SHIFT_BY_CODE = Object.fromEntries(templates.map(t => [t.code, t]));

    // family: "07:00x16:00" -> { "7A": row, "7B": row, ... }
    const groups = {};
    const hhmm = x => (x || "").toString().slice(0,5);
    for (const t of templates) {
      const key = `${hhmm(t.start_time)}x${hhmm(t.end_time)}`;
      (groups[key] ||= {})[t.code] = t;
    }
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
      (idx[r.name] ||= {});
      (idx[r.name][r.week] ||= {});
      idx[r.name][r.week][r.dow] = { is_rdo: r.is_rdo, start_end_key: r.start_end_key };
    }
    globalThis.ROTATION = idx;  // ROTATION[name][week][dow]
  }

  function assignVariantsRoundRobin(advisorIdsInGroup, startEndKey) {
    const fam = globalThis.VARIANTS_BY_START_END?.[startEndKey] || null;
    const keys = fam ? Object.keys(fam) : [];
    const result = {};
    const sorted = (advisorIdsInGroup || []).slice().sort();
    sorted.forEach((id, i) => { if (keys.length) result[id] = keys[i % keys.length]; });
    return result;
  }
  globalThis.assignVariantsRoundRobin = assignVariantsRoundRobin;

  // 6-week effective week
  function effectiveWeek(startDateStr, plannerWeekStartStr) {
    const start = new Date(startDateStr);
    const plan  = new Date(plannerWeekStartStr);
    const diffDays  = Math.floor((plan - start) / 86400000);
    const diffWeeks = Math.floor(diffDays / 7);
    return ((diffWeeks % 6) + 6) % 6 + 1; // 1..6
  }
  globalThis.effectiveWeek = effectiveWeek;

  // ------------ Date helpers ------------
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
  globalThis.normalizeToISO  = normalizeToISO;
  globalThis.toMondayISO     = toMondayISO;

  // ------------ Boot rotations once ------------
  globalThis.bootRotations = async function bootRotations() {
    try {
      const sb = window.supabase;
      if (!sb || typeof sb.from !== 'function') {
        console.error('Supabase client missing: expected window.supabase.from to be a function');
        return;
      }
      await loadShiftTemplatesAndVariants();
      await loadRotationsWithHours();

      // Fallback materialisation if needed
      if (!globalThis.ROTATION || !Object.keys(globalThis.ROTATION).length) {
        const { data: rows, error } = await sb
          .from('v_rotations_with_hours')
          .select('name,week,dow,is_rdo,start_end_key')
          .order('name', { ascending: true })
          .order('week', { ascending: true })
          .order('dow', { ascending: true });
        if (!error) {
          const ROT = {};
          (rows || []).forEach(r => {
            const w = String(r.week || 1);
            (ROT[r.name] ||= {});
            (ROT[r.name][w] ||= {});
            ROT[r.name][w][Number(r.dow)] = r.is_rdo ? { is_rdo: true } : { start_end_key: r.start_end_key };
          });
          globalThis.ROTATION = ROT;
        }
      }

      // Build stable meta shape (families/templates) if you query those tables elsewhere
      try {
        const { data: tmplRows } = await supabase.from("shift_templates").select("*");
        const templatesByName = {};
        (tmplRows || []).forEach(r => {
          const name = (r.name || "").trim();
          if (!name) return;
          const pattern = r.pattern && typeof r.pattern === "object" ? r.pattern : {
            mon: r.day_mon ?? r.mon ?? null, tue: r.day_tue ?? r.tue ?? null,
            wed: r.day_wed ?? r.wed ?? null, thu: r.day_thu ?? r.thu ?? null,
            fri: r.day_fri ?? r.fri ?? null, sat: r.day_sat ?? r.sat ?? null,
            sun: r.day_sun ?? r.sun ?? null,
          };
          templatesByName[name] = { name, pattern };
        });

        const { data: famRows } = await supabase.from("rotations").select("*");
        const familiesByName = {};
        (famRows || []).forEach(r => {
          const name = (r.name || "").trim();
          if (!name) return;
          let sequence = Array.isArray(r.sequence) ? r.sequence
            : [r.week1, r.week2, r.week3, r.week4, r.week5, r.week6].filter(x => x != null);
          familiesByName[name] = { name, start_date: r.start_date ?? null, sequence };
        });

        globalThis.ROTATION_META = { templates: templatesByName, families: familiesByName };
      } catch (_) {}

      console.log("Rotations booted", {
        templates: Object.keys(globalThis.SHIFT_BY_CODE || {}).length,
        families: Object.keys(globalThis.ROTATION || {}).length
      });
    } catch (err) {
      console.error("bootRotations error:", err);
    }
  };

  // ------------ Advisors boot (minimal) ------------
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

  // ------------ Apply rotation to week (preview/materialise) ------------
  globalThis.applyRotationToWeek = function applyRotationToWeek({
    rotationName,
    mondayISO,
    advisors,
    rotationStartISO,
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

    const ids = (advisors || []).map(a => (typeof a === 'string' ? a : a.id));
    const nextRotas = {};

    isoDates.forEach((iso, i) => {
      const dow = i + 1;
      const cell = w[dow];
      if (!cell) return;

      if (cell.is_rdo) {
        ids.forEach(id => { (nextRotas[id] ||= {})[iso] = { label: 'RDO', is_rdo: true }; });
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

  // ------------ Build rotation dropdown ------------
  globalThis.populateRotationSelect = function populateRotationSelect() {
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
  };

  // ------------ Compute rows for the horizontal planner ------------
  function parseHHMM(hhmm){ const [h,m] = String(hhmm||"").split(":").map(Number); return (Number.isFinite(h)&&Number.isFinite(m)) ? h*60+m : null; }
  function toPct(min, start, end){ return Math.max(0, Math.min(100, ((min-start)/(end-start))*100)); }

  globalThis.computePlannerRowsFromState = function computePlannerRowsFromState() {
    try {
      const hasROTAS = globalThis.ROTAS && Object.keys(globalThis.ROTAS).length > 0;
      if (!hasROTAS) return [];

      const wsEl = document.getElementById('weekStart');
      const dayEl = document.getElementById('teamDay');
      const weekStartISO = wsEl?.value || '';
      const dayName = dayEl?.value || 'Monday';
      const idx = { Monday:0, Tuesday:1, Wednesday:2, Thursday:3, Friday:4, Saturday:5, Sunday:6 };
      const base = weekStartISO ? new Date(weekStartISO + 'T00:00:00') : null;
      const dayISO = base ? (() => { const d = new Date(base); d.setDate(base.getDate() + (idx[dayName] ?? 0)); return d.toISOString().slice(0,10); })() : null;

      const checked = Array.from(document.querySelectorAll('#advisorTree input[type="checkbox"][data-role="advisor"]:checked')).map(el => el.value || el.dataset.id).filter(Boolean);
      const ids = checked.length ? checked : Object.keys(globalThis.ADVISOR_BY_ID || {});
      const rows = [];

      ids.forEach(id => {
        const cell = dayISO ? (globalThis.ROTAS?.[id]?.[dayISO] || null) : null;
        if (!cell) return rows.push({ id, name: (globalThis.ADVISOR_BY_ID?.[id]?.name || id), segments: [] });

        if (cell.is_rdo || cell.label === 'RDO') {
          rows.push({ id, name: (globalThis.ADVISOR_BY_ID?.[id]?.name || id), segments: [] });
          return;
        }
        const s = typeof cell.start === 'string' ? parseHHMM(cell.start) : null;
        const e = typeof cell.end   === 'string' ? parseHHMM(cell.end)   : null;
        let start = s, end = e;
        if (start == null || end == null) {
          const key = cell.start_end_key;
          if (typeof key === 'string' && key.includes('x')) {
            const [ss, ee] = key.split('x');
            start = start ?? parseHHMM(ss);
            end   = end   ?? parseHHMM(ee);
          }
        }
        if (!(Number.isFinite(start) && Number.isFinite(end) && end > start)) {
          rows.push({ id, name: (globalThis.ADVISOR_BY_ID?.[id]?.name || id), segments: [] });
          return;
        }
        rows.push({
          id,
          name: (globalThis.ADVISOR_BY_ID?.[id]?.name || id),
          segments: [{ type:'work', code: cell.label || 'Admin', start, end }]
        });
      });
      return rows;
    } catch (e) {
      console.warn('[rows] error', e);
      return [];
    }
  };

  // ------------ Renderers ------------
  function renderTimeHeader(el) {
    if (!el) return;
    el.innerHTML = "";
    const start = parseHHMM("07:00");
    const end   = parseHHMM("19:00");
    for (let h = 7; h <= 19; h++) {
      const d = document.createElement("div");
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
  globalThis.renderTimeHeader = renderTimeHeader;

  function classForCode(code){
    const c = String(code||'').toLowerCase();
    if (c.includes('email')) return 'c-email';
    if (c.includes('mirakl')) return 'c-mirakl';
    if (c.includes('social')) return 'c-social';
    if (c.includes('meet')) return 'c-meeting';
    if (c.includes('over')) return 'c-overtime';
    if (c.includes('break')) return 'c-break';
    if (c.includes('lunch')) return 'c-lunch';
    if (c.includes('abs')) return 'c-absence';
    if (c.includes('shrink')) return 'c-shrink';
    return 'c-email';
  }

  function m2t(min){ const h = Math.floor(min/60), m = String(min%60).padStart(2,'0'); return `${h}:${m}`; }

  function renderPlanner(rows) {
    const body = document.getElementById("plannerBody");
    const header = document.getElementById("timeHeader");
    if (!body) return;

    body.innerHTML = "";
    renderTimeHeader(header);

    const DAY_START = 7*60, DAY_END = 19*60;
    const pct = m => (m - DAY_START) / (DAY_END - DAY_START) * 100;

    rows.forEach(r => {
      const row = document.createElement('div');
      row.className = 'planner__row';

      const left = document.createElement('div');
      left.className = 'planner__name';
      left.textContent = r.name;
      row.appendChild(left);

      const tl = document.createElement('div');
      tl.className = 'planner__timeline';

      (r.segments || []).forEach(s => {
        const bar = document.createElement('div');
        bar.className = 'planner__bar ' + (s.type === 'work'
          ? (classForCode(s.code) || 'c-email')
          : s.type === 'lunch' ? 'c-lunch' : s.type === 'break' ? 'c-break' : 'c-email');
        bar.style.left  = Math.max(0, pct(s.start)) + '%';
        bar.style.width = Math.max(0, pct(s.end) - pct(s.start)) + '%';
        bar.title = `${s.code} ${m2t(s.start)}–${m2t(s.end)}`;
        tl.appendChild(bar);
      });

      row.appendChild(tl);
      body.appendChild(row);
    });

    console.log('renderPlanner rows=', Array.isArray(rows)? rows.length : rows);
  }
  globalThis.renderPlanner = renderPlanner;
})();

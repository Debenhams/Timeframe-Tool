/* This file should be placed in a 'src' folder.
  It contains all the application logic, helpers, and renderers.
*/

/* =========================
   Supabase configuration
   ========================= */
const SUPABASE_URL = "https://oypdnjxhjpgpwmkltzmk.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im95cGRuanhoanBncHdta2x0em1rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk4Nzk0MTEsImV4cCI6MjA3NTQ1NTQxMX0.Hqf1L4RHpIPUD4ut2uVsiGDsqKXvAjdwKuotmme4_Is";

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
window.supabase = sb; // Expose for helpers

/* =========================
   App State (Globals)
   ========================= */
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
let ORG = { sites: {} };
let TEMPLATES = new Map(); // Use Map for consistency
let ADVISORS_LIST = [];
let ADVISOR_BY_NAME = new Map();
let ADVISOR_BY_ID = new Map();
let ROTAS = new Map(); // key: `${advisorId}::${weekStart}` -> { Monday: 'Early', ... }
let ROTATION = {}; // Populated by bootRotations
let SHIFT_BY_CODE = {}; // Populated by bootRotations
let VARIANTS_BY_START_END = {}; // Populated by bootRotations
let selectedAdvisors = new Set(); // Keep track of selected advisors

/* =========================
   Core Helpers
   ========================= */
const $ = s => document.querySelector(s),
  $$ = s => Array.from(document.querySelectorAll(s));
window.$ = $; // Expose for init.js
window.$$ = $$;

const pad = n => String(n).padStart(2, '0');
const fmt = (t) => t ? t.slice(0, 5) : ''; // HH:MM from HH:MM:SS

window.setToMonday = function(d) {
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function toMin(t) {
  if (t === null || t === undefined) return null;
  const [h, m] = String(t).split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return null;
  return (h * 60) + m;
}

function m2t(m) {
  if (m === null || m === undefined) return '';
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

// Wire-once helper
function wireOnce(el, evt, fn, tag) {
    if (!el) return;
    var key = tag || ("_wired_" + evt);
    if (el.dataset && el.dataset[key]) return;
    el.addEventListener(evt, fn);
    if (el.dataset) el.dataset[key] = "1";
}

// Date helpers
function toISODateLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function normalizeToISO(s) {
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s; // already ISO
  const m = String(s).match(/^(\d{2})\/(\d{2})\/(\d{4})$/); // DD/MM/YYYY
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(s);
  return isNaN(d) ? String(s) : toISODateLocal(d);
}
function toMondayISO(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso + "T00:00:00"); // Use local time
    const offset = (d.getDay() + 6) % 7; // 0=Mon..6=Sun
    d.setDate(d.getDate() - offset);
    return toISODateLocal(d);
  } catch (e) {
    console.error("Invalid date for toMondayISO:", iso, e);
    return "";
  }
}


/* =========================
   Vertical Calendar Config
   ========================= */
const css = getComputedStyle(document.documentElement);
const START = +css.getPropertyValue('--timeline-start') || 7;
const END = +css.getPropertyValue('--timeline-end') || 20;
const HEIGHT = +css.getPropertyValue('--timeline-height').replace('px', '') || 800;
const PX_PER_MIN = HEIGHT / ((END - START) * 60);

/* =========================
   Horizontal Planner Config
   ========================= */
const DAY_START = 6 * 60,
  DAY_END = 20 * 60; // 6am to 8pm (14 hours)
const DAY_SPAN = DAY_END - DAY_START;
function m2hmm(m) {
  const h = Math.floor(m / 60),
    mm = String(m % 60).padStart(2, '0');
  return `${h}:${mm}`;
}

/**
 * Renders the time header ticks for the horizontal planner.
 */
window.renderTimeHeader = function(el) {
  if (!el) return;
  el.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'time-scale';
  // Create ticks every hour from DAY_START to DAY_END
  for (let m = DAY_START; m <= DAY_END; m += 60) {
    const t = document.createElement('div');
    t.className = 'tick';
    t.style.left = `${((m - DAY_START) / DAY_SPAN) * 100}%`;
    t.textContent = m2hmm(m);
    wrap.appendChild(t);
  }
  el.appendChild(wrap);
}


/* =========================
   Colours UI
   ========================= */
window.buildColorKey = function() {
  const defs = [
    ['email', 'Email', '--color-email'],
    ['mirakl', 'Mirakl', '--color-mirakl'],
    ['social', 'Social', '--color-social'],
    ['overtime', 'Overtime', '--color-overtime'],
    ['break', 'Break', '--color-break'],
    ['lunch', 'Lunch', '--color-lunch'],
    ['absence', 'Absence', '--color-absence'],
    ['shrink', 'Shrinkage', '--color-shrink']
  ];
  const el = $('#colorKey');
  if(!el) return;
  el.innerHTML = defs.map(([k, l, cssVar]) => {
    const v = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
    return `<div class="key-row"><span class="swatch" style="background:${v}"></span><strong>${l}</strong><input type="text" data-k="${cssVar}" value="${v}"></div>`;
  }).join('');
  $$('#colorKey input').forEach(inp => inp.addEventListener('input', () => {
    document.documentElement.style.setProperty(inp.dataset.k, inp.value);
  }));
}

/* =========================
   Code Groups & Classifiers
   ========================= */
const CODE_GROUPS = {
  "Activity": [
    "2nd Line", "Admin", "BH Email", "BH Social", "BH WhatsApp", "DEB Email", "DEB Social", "DEB WhatsApp", "Ebay",
    "KM Email", "KM Social", "KM WhatsApp", "Mirakl", "Mixing", "PayPlus", "PLT Email", "PLT Social", "PLT WhatsApp",
    "QA", "Overtime"
  ],
  "Absence": ["AL", "Break", "Lunch", "Sick", "Split Shift", "RDO", "Maternity", "LTS"],
  "Shrinkage": ["121", "ATL", "Coaching", "Huddle", "ITI", "Projects", "Team Meeting", "Training"]
};

function codeSelectGroupedHTML(val = '') {
  return Object.entries(CODE_GROUPS).map(([grp, codes]) =>
    `<optgroup label="${grp}">${codes.map(c=>`<option ${val===c?'selected':''}>${c}</option>`).join('')}</optgroup>`
  ).join('');
}

function classForCode(code) {
  const k = (code || '').toLowerCase();
  if (/\blunch\b/.test(k)) return 'c-lunch';
  if (/\bbreak\b/.test(k)) return 'c-break';
  if (/\bovertime\b/.test(k)) return 'c-overtime';
  if (/\bmirakl\b/.test(k)) return 'c-mirakl';
  if (/\bsocial\b/.test(k)) return 'c-social';
  if (/\bemail\b/.test(k)) return 'c-email';
  if (['al', 'sick', 'rdo', 'maternity', 'lts', 'split shift'].some(w => k.includes(w))) return 'c-absence';
  if (['121', 'atl', 'coaching', 'huddle', 'iti', 'projects', 'team meeting', 'training'].some(w => k.includes(w))) return 'c-shrink';
  return 'c-email'; // Default
}

/* =========================
   Templates UI
   ========================= */
function templateRow(t) {
  return `<div class="template-row" data-name="${t.name}">
    <label>Name</label>
    <input data-f="name" type="text" value="${t.name}" style="width:140px">
    <label>New code</label>
    <select data-f="work_code">${codeSelectGroupedHTML(t.work_code||'Admin')}</select>
    <label>Start / Finish</label>
    <div class="inline"><input data-f="start_time" type="time" value="${fmt(t.start_time)||''}">
      <input data-f="finish_time" type="time" value="${fmt(t.finish_time)||''}"></div>
    <label>Breaks</label>
    <div class="inline">
      <input data-f="break1" type="time" value="${fmt(t.break1)||''}"  title="Break 1 (15m)">
      <input data-f="lunch"  type="time" value="${fmt(t.lunch)||''}"   title="Lunch (30m)">
      <input data-f="break2" type="time" value="${fmt(t.break2)||''}"  title="Break 2 (15m)">
    </div>
    <div class="full" style="display:flex;justify-content:flex-end">
      <button class="danger" data-act="del">Delete</button>
    </div>
  </div>`;
}

window.populateTemplateEditor = function() {
  const ed = $('#templateEditor');
  if(!ed) return;
  const list = Array.from(TEMPLATES.values()).sort((a, b) => a.name.localeCompare(b.name));
  ed.innerHTML = list.length ? list.map(templateRow).join('') : '<div class="muted">No templates. Add or load samples.</div>';
  
  $$('#templateEditor .template-row').forEach(row => {
    const origName = row.dataset.name;
    $$('input,select', row).forEach(inp => {
      const f = inp.dataset.f;
      if (!f) return;
      inp.addEventListener('input', async () => {
        const updated = Object.assign({}, TEMPLATES.get(origName), {
          [f]: inp.value || null
        });
        if (f === 'name' && inp.value.trim() !== origName) {
          await sb.from('templates').delete().eq('name', origName);
          const { error } = await sb.from('templates').insert([{
            name: (updated.name || '').trim(),
            work_code: updated.work_code || 'Admin',
            start_time: updated.start_time,
            finish_time: updated.finish_time,
            break1: updated.break1,
            lunch: updated.lunch,
            break2: updated.break2
          }]);
          if (error) console.error('Template rename failed: ' + error.message);
        } else {
          const { error } = await sb.from('templates').update({
            work_code: updated.work_code || 'Admin',
            start_time: updated.start_time,
            finish_time: updated.finish_time,
            break1: updated.break1,
            lunch: updated.lunch,
            break2: updated.break2
          }).eq('name', origName);
          if (error) console.error('Template update failed: ' + error.message);
        }
      });
    });
    row.querySelector('[data-act="del"]').onclick = async () => {
      if (!confirm(`Delete template "${origName}"?`)) return;
      const { error } = await sb.from('templates').delete().eq('name', origName);
      if (error) console.error('Delete failed: ' + error.message);
    };
  });
}

async function addTemplateHandler() {
  const name = 'Shift ' + (TEMPLATES.size + 1);
  const { error } = await sb.from('templates').insert([{
    name,
    work_code: 'Admin',
    start_time: '09:00',
    finish_time: '17:00',
    break1: null,
    lunch: '12:30',
    break2: null
  }]);
  if (error) console.error('Add failed: ' + error.message);
}

async function loadDefaultsHandler() {
  const defaults = [{
    name: 'Early',
    work_code: 'DEB Email',
    start_time: '07:00',
    finish_time: '16:00',
    break1: '09:15',
    lunch: '12:00',
    break2: '15:15'
  }, {
    name: 'Middle',
    work_code: 'Mirakl',
    start_time: '11:00',
    finish_time: '20:00',
    break1: '11:30',
    lunch: '15:30',
    break2: '17:45'
  }, {
    name: 'Late',
    work_code: 'PLT Social',
    start_time: '12:00',
    finish_time: '21:00',
    break1: '13:15',
    lunch: '17:00',
    break2: '19:15'
  }, ];
  for (const t of defaults) {
    await sb.from('templates').upsert(t, {
      onConflict: 'name'
    });
  }
}

/* =========================
   Data Loading (Supabase)
   ========================= */

/**
 * Loads Sites, Leaders, and Advisors from Supabase
 */
window.loadOrg = async function() {
  const [sitesRes, leadersRes, advisorsRes] = await Promise.all([
    sb.from('sites').select('*').order('name', {
      ascending: true
    }),
    sb.from('leaders').select('*'),
    sb.from('advisors').select('*')
  ]);
  ORG = { sites: {} };
  (sitesRes.data || []).forEach(s => ORG.sites[s.name] = {
    id: s.id,
    leaders: {}
  });
  (leadersRes.data || []).forEach(l => {
    const siteEntry = Object.values(ORG.sites).find(x => x.id === l.site_id);
    if (siteEntry) siteEntry.leaders[l.name] = {
      id: l.id,
      advisors: []
    };
  });
  (advisorsRes.data || []).forEach(a => {
    const leaderNode = Object.values(ORG.sites).flatMap(s => Object.values(s.leaders)).find(l => l.id === a.leader_id);
    if (leaderNode) {
      leaderNode.advisors.push({
        id: a.id,
        name: a.name,
        email: a.email || ''
      });
    }
  });

  ADVISORS_LIST = (advisorsRes.data || []).map(a => ({
    id: a.id,
    name: a.name,
    leader_id: a.leader_id
  }));
  ADVISOR_BY_NAME = new Map(ADVISORS_LIST.map(a => [a.name, a.id]));
  ADVISOR_BY_ID = new Map(ADVISORS_LIST.map(a => [a.id, a.name]));
}

/**
 * Loads shift templates from Supabase
 */
window.loadTemplates = async function() {
  const { data } = await sb.from('templates').select('*');
  TEMPLATES.clear();
  (data || []).forEach(t => TEMPLATES.set(t.name, {
    name: t.name,
    work_code: t.work_code,
    start_time: t.start_time,
    finish_time: t.finish_time,
    break1: t.break1,
    lunch: t.lunch,
    break2: t.break2
  }));
}

/**
 * Loads Rota data for a specific week
 */
window.fetchRotasForWeek = async function(weekStartISO) {
  if (!weekStartISO) return;
  const { data } = await sb.from('rotas').select('advisor_id,week_start,data').eq('week_start', weekStartISO);
  ROTAS.clear();
  (data || []).forEach(r => ROTAS.set(`${r.advisor_id}::${weekStartISO}`, r.data || {}));
}

/**
 * Loads data for the new Rotation Preview feature
 */
async function loadShiftTemplatesAndVariants() {
  const { data: templates, error } = await sb
    .from("shift_templates")
    .select("code, start_time, break1, lunch, break2, end_time");
  if (error) { console.error("shift_templates error", error); return; }

  SHIFT_BY_CODE = Object.fromEntries(templates.map(t => [t.code, t]));
  const groups = {};
  const hhmm = x => (x || "").toString().slice(0,5);
  for (const t of templates) {
    const key = `${hhmm(t.start_time)}x${hhmm(t.end_time)}`;
    
    // --- THIS WAS THE BUG ---
    // This line creates an OBJECT: groups[key] = { "7A": {...} }
    (groups[key] ||= {})[t.code] = t;
  }
  
  // --- THIS WAS THE ERROR ---
  // You cannot call .sort() on an OBJECT.
  // This conflicting code came from merging two different files.
  // By removing it, the code will now run.
  /*
  for (const k of Object.keys(groups)) {
      groups[k].sort(); // <--- REMOVED THIS LINE
  }
  */
  
  VARIANTS_BY_START_END = groups;
}

async function loadRotationsWithHours() {
  const { data, error } = await sb
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
  ROTATION = idx;
}

// Make bootRotations a global function
window.bootRotations = async function() {
  await loadShiftTemplatesAndVariants();
  await loadRotationsWithHours();
  console.log("Rotations booted", {
    templates: Object.keys(SHIFT_BY_CODE || {}).length,
    families: Object.keys(VARIANTS_BY_START_END || {}).length,
    rotations: Object.keys(ROTATION || {}).length
  });
};


/* =========================
   Schedules Tree (Right Sidebar)
   ========================= */
window.rebuildTree = function() {
  const t = $('#tree');
  if(!t) return;
  const q = $('#treeSearch').value.trim().toLowerCase();

  function advisorNode(obj) {
    const checked = selectedAdvisors.has(obj.name) ? 'checked' : '';
    return `<div class="node">
      <input type="checkbox" data-adv-id="${obj.id}" data-adv-name="${obj.name}" ${checked} data-role="advisor"/>
      <span>${obj.name}</span>
      <div class="node-actions" style="margin-left:auto;display:flex;gap:6px">
        <button data-rename-adv="${obj.id}">✎</button>
        <button data-remove-adv="${obj.id}">🗑</button>
      </div>
    </div>`;
  }

  function leaderBlock(leaderName, leaderObj) {
    const team = leaderObj.advisors || [];
    const match = (str) => !q || str.toLowerCase().includes(q);
    if (q && !match(leaderName) && !team.some(a => match(a.name))) return '';
    const allSelected = team.length > 0 && team.every(a => selectedAdvisors.has(a.name));
    return `<details open data-leader-id="${leaderObj.id}">
      <summary>
        <span class="twisty" data-twisty>−</span>
        <label style="display:flex;align-items:center;gap:6px;margin-left:4px">
          <input type="checkbox" data-leader="${leaderObj.id}" ${allSelected?'checked':''}/>
          <span>👤 ${leaderName}</span>
        </label>
        <div class="node-actions" style="margin-left:auto;display:flex;gap:6px">
          <button data-add-adv="${leaderObj.id}">+ Advisor</button>
          <button data-rename-lead="${leaderObj.id}">✎</button>
          <button data-remove-lead="${leaderObj.id}">🗑</button>
        </div>
      </summary>
      <div class="advisor-list">
        ${team.sort((a,b)=>a.name.localeCompare(b.name)).map(advisorNode).join('')}
      </div>
    </details>`;
  }

  function siteBlock(siteName, siteObj) {
    const leaders = siteObj.leaders || {};
    const blocks = Object.entries(leaders).map(([ln, lobj]) => leaderBlock(ln, lobj)).filter(Boolean);
    const match = (str) => !q || str.toLowerCase().includes(q);
    if (q && !match(siteName) && blocks.join('') === '') return '';
    return `<details open data-site-id="${siteObj.id}">
      <summary>
        <span class="twisty" data-twisty>−</span>
        <strong>📁 ${siteName}</strong>
        <div class="node-actions" style="margin-left:auto;display:flex;gap:6px">
          <button data-add-lead="${siteObj.id}">+ Leader</button>
          <button data-rename-site="${siteObj.id}">✎</button>
          <button data-remove-site="${siteObj.id}">🗑</button>
        </div>
      </summary>
      ${blocks.join('')}
    </details>`;
  }

  t.innerHTML = Object.entries(ORG.sites).sort((a, b) => a[0].localeCompare(b[0])).map(([sn, so]) => siteBlock(sn, so)).join('') || '<div class="muted">No sites yet.</div>';

  // Twisties update
  $$('#tree details').forEach(d => {
    const twisty = d.querySelector('[data-twisty]');
    const update = () => {
      if(twisty) twisty.textContent = d.open ? '−' : '+';
    };
    d.addEventListener('toggle', update);
    update();
  });

  // Leader select-all
  $$('#tree [data-leader]').forEach(cb => {
    cb.onchange = () => {
      const leaderId = cb.dataset.leader;
      const leaderNode = Object.values(ORG.sites).flatMap(s => Object.values(s.leaders)).find(l => l.id === leaderId);
      (leaderNode?.advisors || []).forEach(a => cb.checked ? selectedAdvisors.add(a.name) : selectedAdvisors.delete(a.name));
      refreshUI(); // Full refresh
    };
  });

  // Advisor select
  $$('#tree [data-adv-id]').forEach(ch => {
    ch.onchange = () => {
      const name = ch.dataset.advName;
      ch.checked ? selectedAdvisors.add(name) : selectedAdvisors.delete(name);
      refreshUI(); // Full refresh
    };
  });

  // Site actions
  $$('#tree [data-add-lead]').forEach(b => b.onclick = async () => {
    const siteId = b.dataset.addLead;
    const name = prompt('Leader name');
    if (!name) return;
    const { error } = await sb.from('leaders').insert([{
      site_id: siteId,
      name
    }]);
    if (error) console.error(error.message);
  });
  $$('#tree [data-rename-site]').forEach(b => b.onclick = async () => {
    const siteId = b.dataset.renameSite;
    const current = Object.entries(ORG.sites).find(([n, s]) => s.id === siteId) ?.[0] || '';
    const nn = prompt('Rename site', current);
    if (!nn || nn === current) return;
    const { error } = await sb.from('sites').update({
      name: nn
    }).eq('id', siteId);
    if (error) console.error(error.message);
  });
  $$('#tree [data-remove-site]').forEach(b => b.onclick = async () => {
    const siteId = b.dataset.removeSite;
    if (!confirm('Delete site and its leaders/advisors?')) return;
    const { error } = await sb.from('sites').delete().eq('id', siteId);
    if (error) console.error(error.message);
  });

  // Leader actions
  $$('#tree [data-rename-lead]').forEach(b => b.onclick = async () => {
    const id = b.dataset.renameLead;
    const current = Object.values(ORG.sites).flatMap(s => Object.entries(s.leaders)).find(([n, l]) => l.id === id) ?.[0] || '';
    const nn = prompt('Rename leader', current);
    if (!nn || nn === current) return;
    const { error } = await sb.from('leaders').update({
      name: nn
    }).eq('id', id);
    if (error) console.error(error.message);
  });
  $$('#tree [data-remove-lead]').forEach(b => b.onclick = async () => {
    const id = b.dataset.removeLead;
    if (!confirm('Remove leader and their advisors?')) return;
    const { error } = await sb.from('leaders').delete().eq('id', id);
    if (error) console.error(error.message);
  });

  // Advisor actions
  $$('#tree [data-add-adv]').forEach(b => b.onclick = async () => {
    const leaderId = b.dataset.addAdv;
    const n = prompt('Advisor name');
    if (!n) return;
    const { error } = await sb.from('advisors').insert([{
      leader_id: leaderId,
      name: n
    }]);
    if (error) console.error(error.message);
  });
  $$('#tree [data-rename-adv]').forEach(b => b.onclick = async () => {
    const id = b.dataset.renameAdv;
    const current = ADVISORS_LIST.find(a => a.id === id) ?.name || '';
    const nn = prompt('Rename advisor', current);
    if (!nn || nn === current) return;
    const { error } = await sb.from('advisors').update({
      name: nn
    }).eq('id', id);
    if (error) console.error(error.message);
  });
  $$('#tree [data-remove-adv]').forEach(b => b.onclick = async () => {
    const id = b.dataset.removeAdv;
    if (!confirm('Remove advisor?')) return;
    const { error } = await sb.from('advisors').delete().eq('id', id);
    if (error) console.error(error.message);
  });
}

function getLeaderTeamNames(leaderId) {
  const leader = Object.values(ORG.sites)
    .flatMap(s => Object.values(s.leaders || {}))
    .find(l => l.id === leaderId);
  if (!leader) return [];
  return (leader.advisors || []).map(a => a.name).sort((a, b) => a.localeCompare(b));
}

window.refreshChips = function() {
  const box = $('#activeChips');
  if(!box) return;
  box.innerHTML = '';
  if (!selectedAdvisors.size) {
    box.innerHTML = '<span class="muted">No advisors selected.</span>';
    return;
  }
  [...selectedAdvisors].sort((a, b) => a.localeCompare(b)).forEach(n => {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = n;
    const x = document.createElement('button');
    x.textContent = '×';
    x.style.border = 'none';
    x.style.background = 'transparent';
    x.style.cursor = 'pointer';
    x.onclick = () => {
      selectedAdvisors.delete(n);
      refreshUI(); // Full refresh
    };
    chip.appendChild(x);
    box.appendChild(chip);
  });
}

/* =========================
   Top Controls UI
   ========================= */

window.rebuildAdvisorDropdown = function() {
  const sel = $('#advisorSelect');
  if(!sel) return;
  const leaders = [];
  Object.values(ORG.sites).forEach(site => {
    Object.entries(site.leaders || {}).forEach(([lname, lobj]) => {
      leaders.push({
        id: lobj.id,
        name: lname,
        advisors: lobj.advisors || []
      });
    });
  });
  leaders.sort((a, b) => a.name.localeCompare(b.name));

  const advisors = ADVISORS_LIST
    .map(a => ({
      id: a.id,
      name: a.name
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const leaderOpts = leaders.map(l => `<option value="leader::${l.id}">${l.name} — Team</option>`).join('');
  const advisorOpts = advisors.map(a => `<option value="advisor::${a.id}">${a.name}</option>`).join('');

  sel.innerHTML = `
    <option value="__TEAM_SELECTED__">Team (Selected)</option>
    <option value="__TEAM_ALL__">Team (All)</option>
    ${leaders.length ? `<optgroup label="Team Leaders">${leaderOpts}</optgroup>` : ''}
    ${advisors.length ? `<optgroup label="Advisors">${advisorOpts}</optgroup>` : ''}
  `;
}

function updateViewSelector() {
  const team = $('#advisorSelect').value;
  const showTeam = team === '__TEAM_SELECTED__' || team === '__TEAM_ALL__';
  $('#lblTeamDay').style.display = showTeam ? 'inline' : 'none';
  $('#teamDay').style.display = showTeam ? 'inline' : 'none';
}

window.updateRangeLabel = function() {
  const wsEl = $('#weekStart');
  if (!wsEl) return;
  const ws = wsEl.value;
  const adv = $('#advisorSelect').value;
  if (!ws) {
    $('#rangeLabel').textContent = '';
    return;
  }
  const s = new Date(ws + 'T00:00:00');
  const e = new Date(s);
  e.setDate(e.getDate() + 6);
  const f = d => d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
  if (adv === '__TEAM_SELECTED__' || adv === '__TEAM_ALL__') {
    const idx = DAYS.indexOf($('#teamDay').value || 'Monday');
    const d = new Date(s);
    d.setDate(d.getDate() + idx);
    $('#rangeLabel').textContent = d.toLocaleDateString('en-GB', {
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
    $('#calTitle').textContent = (adv === '__TEAM_ALL__' ? 'Team (All)' : 'Team (Selected)') + ' – Single Day';
  } else {
    $('#rangeLabel').textContent = `${f(s)} – ${f(e)}`;
    $('#calTitle').textContent = 'Advisor Week (Calendar)';
  }
  $$('#dateHeaders [data-date]').forEach((span, i) => {
    const d = new Date(s);
    d.setDate(d.getDate() + i);
    span.textContent = d.toLocaleDateString('en-GB', {
      month: 'short',
      day: 'numeric'
    });
  });
}

/* =========================
   Master Assignment Table
   ========================= */
window.populateAssignTable = function() {
  const head = $('#dateHeaders'),
    body = $('#assignTable tbody');
  if(!head || !body) return;
    
  head.innerHTML = DAYS.map(d => `<th>${d.slice(0,3)}<br><span class="muted" data-date></span></th>`).join('');
  const list = selectedAdvisors.size ? [...selectedAdvisors] : [];
  if (list.length === 0) {
    body.innerHTML = '<tr><td colspan="8" class="muted" style="text-align:left;padding:10px">Select a Team Leader (or advisors) in <strong>Schedules</strong> to populate this table.</td></tr>';
    return;
  }
  const opts = Array.from(TEMPLATES.keys()).sort().map(n => `<option value="${n}">${n}</option>`).join('');
  body.innerHTML = '';
  list.sort((a, b) => a.localeCompare(b)).forEach(name => {
    const tr = document.createElement('tr');
    const tdName = document.createElement('td');
    tdName.className = 'name';
    tdName.textContent = name;
    tr.appendChild(tdName);
    DAYS.forEach(day => {
      const td = document.createElement('td');
      const sel = document.createElement('select');
      sel.innerHTML = `<option value="">-- Day Off --</option>${opts}`;
      const aId = ADVISOR_BY_NAME.get(name);
      const ws = $('#weekStart').value;
      const key = `${aId}::${ws}`;
      const data = ROTAS.get(key) || {};
      const current = data[day];
      const currentVal = (typeof current === 'string') ? current : '';
      sel.value = currentVal;

      sel.onchange = async () => {
        const newVal = sel.value;
        const fresh = Object.assign({}, ROTAS.get(key) || {});
        
        if (newVal) fresh[day] = newVal;
        else delete fresh[day];
        
        await upsertRota(aId, ws, fresh);
        refreshUI(); // Refresh both schedules
      };

      td.appendChild(sel);
      tr.appendChild(td);
    });
    body.appendChild(tr);
  });
}

/* =========================
   Rota Data Helpers
   ========================= */
async function upsertRota(advisorId, weekStartISO, dataObj) {
  const { data, error } = await sb.from('rotas').upsert({
    advisor_id: advisorId,
    week_start: weekStartISO,
    data: dataObj
  }, {
    onConflict: 'advisor_id,week_start'
  }).select('*').single();
  if (!error) {
    ROTAS.set(`${advisorId}::${weekStartISO}`, data.data || {});
  } else {
    console.error("Upsert Rota error:", error);
  }
}

function processTemplateToSegments(t) {
  if (!t || !t.start_time || !t.finish_time) return [];
  const s = toMin(fmt(t.start_time)),
    e = toMin(fmt(t.finish_time));
  if (e === null || s === null || e <= s) return [];
  
  const ev = [{ t: s, type: 'start' }, { t: e, type: 'end' }];
  
  [['break1', 15, 'Break'], ['lunch', 30, 'Lunch'], ['break2', 15, 'Break']].forEach(([k, d, label]) => {
    const breakTime = toMin(fmt(t[k]));
    if (breakTime !== null) {
        ev.push({ t: breakTime, type: 'pause', d, label });
    }
  });
  
  ev.sort((a, b) => a.t - b.t || ((a.type === 'end') - (b.type === 'end')));
  
  const out = [];
  let cur = s;
  for (const evn of ev) {
    if (evn.t > cur) out.push({
      code: t.work_code || 'Admin',
      start: m2t(cur),
      end: m2t(evn.t)
    });
    if (evn.type === 'pause') {
      out.push({
        code: evn.label,
        start: m2t(evn.t),
        end: m2t(evn.t + evn.d)
      });
      cur = evn.t + evn.d;
    }
  }
  return out;
}

function toEditableSegments(dayVal) {
  if (dayVal && typeof dayVal === 'object' && Array.isArray(dayVal.segments)) return JSON.parse(JSON.stringify(dayVal.segments));
  if (typeof dayVal === 'string' && TEMPLATES.has(dayVal)) return processTemplateToSegments(TEMPLATES.get(dayVal));
  return [];
}

function mergeAdjacent(segs) {
  const s = [...segs].sort((a, b) => toMin(a.start) - toMin(b.start));
  const out = [];
  for (const x of s) {
    if (!out.length) {
      out.push({ ...x });
      continue;
    }
    const p = out[out.length - 1];
    if (p.code === x.code && toMin(p.end) === toMin(x.start)) {
      p.end = x.end;
    } else out.push({ ...x });
  }
  return out;
}

/**
 * Processes a day's value (template name or segment object) into renderable blocks.
 * Returns: [{ label, start, end }] where start/end are in minutes.
 */
function processDayValue(dayValue) {
  if (dayValue && typeof dayValue === 'object' && Array.isArray(dayValue.segments)) {
    return dayValue.segments.map(s => ({
      label: s.code,
      start: toMin(s.start),
      end: toMin(s.end)
    })).filter(b => b.start !== null && b.end !== null && b.end > b.start).sort((a, b) => a.start - b.start);
  }
  if (typeof dayValue === 'string' && TEMPLATES.has(dayValue)) {
    return processTemplateToSegments(TEMPLATES.get(dayValue)).map(s => ({
      label: s.code,
      start: toMin(s.start),
      end: toMin(s.end)
    })).filter(b => b.start !== null && b.end !== null);
  }
  return [];
}


/* =========================
   Vertical Calendar UI
   ========================= */
function hoursHTML() {
  let h = '';
  const START_HOUR = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--timeline-start')) || 7;
  const END_HOUR = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--timeline-end')) || 20;
  for (let i = START_HOUR; i <= END_HOUR; i++) {
    h += `<div class="hour"><span>${String(i).padStart(2,'0')}:00</span></div>`;
  }
  return h;
}
window.setHours = function() {
  const el = $('#hours');
  if (el) el.innerHTML = hoursHTML();
}

function resetGrid() {
  const grid = $('#calGrid');
  if(grid) {
    grid.innerHTML = '<div class="hour-col"><div id="hours"></div></div>';
    $('#hours').innerHTML = hoursHTML();
  }
}

window.renderCalendar = function() {
  resetGrid();
  const advVal = $('#advisorSelect').value;

  // Team views
  if (advVal === '__TEAM_SELECTED__' || advVal === '__TEAM_ALL__') {
    renderTeamDayCalendar(advVal === '__TEAM_ALL__');
    return;
  }

  // Single advisor view
  let aId = null,
    advName = null;
  if (advVal.startsWith && advVal.startsWith('advisor::')) {
    aId = advVal.split('::')[1];
    advName = ADVISOR_BY_ID.get(aId) || '';
  } else {
    advName = advVal;
    aId = ADVISOR_BY_NAME.get(advName);
  }
  if (!aId) return;

  const ws = $('#weekStart').value;
  const key = `${aId}::${ws}`;
  const data = ROTAS.get(key) || {};
  const grid = $('#calGrid');
  const s = ws ? new Date(ws + 'T00:00:00') : null;

  DAYS.forEach((day, idx) => {
    const col = document.createElement('div');
    col.className = 'day-col';
    let month = '—',
      num = '';
    if (s) {
      const d = new Date(s);
      d.setDate(d.getDate() + idx);
      month = d.toLocaleDateString('en-GB', {
        month: 'long'
      });
      num = d.getDate();
    }
    col.insertAdjacentHTML('beforeend', `<div class="day-head"><small>${month}</small>${day}<span style="float:right">${num}</span></div>`);

    const dayVal = data[day];
    const blocks = processDayValue(dayVal); // Get segments in minutes

    if (blocks.length > 0) {
      const totalMins = blocks.reduce((acc, b) => acc + (b.end - b.start), 0);
      const tpl = (typeof dayVal === 'string') ? TEMPLATES.get(dayVal) : null;
      if (tpl) {
         col.insertAdjacentHTML('beforeend', `<div class="day-summary"><span class="muted">${dayVal}</span> ${fmt(tpl.start_time)} – ${fmt(tpl.finish_time)}<span class="summary-right">${(totalMins/60).toFixed(1)}h</span></div>`);
      } else {
         col.insertAdjacentHTML('beforeend', `<div class="day-summary"><span class="muted">Custom segments</span><span class="summary-right">${(totalMins/60).toFixed(1)}h</span></div>`);
      }
    } else {
       col.insertAdjacentHTML('beforeend', `<div class="off">Roster Day Off</div>`);
    }

    col.insertAdjacentHTML('beforeend', `<div class="day-actions"><button class="iconbtn" data-day="${day}">＋</button><button class="iconbtn" data-day="${day}" data-edit>✎</button></div>`);
    const cell = document.createElement('div');
    cell.className = 'timeline-cell';

    blocks.forEach(b => {
      const top = (b.start - START * 60) * PX_PER_MIN;
      const h = (b.end - b.start) * PX_PER_MIN;
      const el = document.createElement('div');
      el.className = `block ${classForCode(b.label)}`;
      el.style.top = top + 'px';
      el.style.height = Math.max(16, h) + 'px';
      el.innerHTML = `<div>${b.label}<span class="time">${m2t(b.start)} – ${m2t(b.end)}</span></div>`;
      el.dataset.day = day;
      el.dataset.adv = advName;
      el.dataset.start = m2t(b.start);
      el.dataset.end = m2t(b.end);
      el.dataset.code = b.label;
      el.addEventListener('click', onBlockClick);
      cell.appendChild(el);
    });

    col.appendChild(cell);
    grid.appendChild(col);
  });

  $$('.day-actions .iconbtn').forEach(b => b.onclick = () => openAssign(b.dataset.day, advName));
}

function renderTeamDayCalendar(showAll) {
  resetGrid();
  const grid = $('#calGrid');
  const ws = $('#weekStart').value;
  const day = $('#teamDay').value || 'Monday';
  const names = showAll ? ADVISORS_LIST.map(a => a.name) : [...selectedAdvisors];
  const s = new Date(ws + 'T00:00:00');
  const idx = DAYS.indexOf(day);
  s.setDate(s.getDate() + idx);

  const head = document.createElement('div');
  head.className = 'day-head';
  head.style.gridColumn = `1 / span ${1+names.length}`;
  head.style.height = '56px';
  head.innerHTML = `<small>${s.toLocaleDateString('en-GB',{month:'long'})}</small>${day}<span style="float:right">${s.getDate()}</span>`;
  grid.appendChild(head);

  names.sort((a, b) => a.localeCompare(b)).forEach(advName => {
    const aId = ADVISOR_BY_NAME.get(advName);
    if (!aId) return;
    const key = `${aId}::${ws}`;
    const data = ROTAS.get(key) || {};
    const col = document.createElement('div');
    col.className = 'day-col';
    col.insertAdjacentHTML('beforeend', `<div class="day-head" style="height:56px">${advName}</div>`);
    
    const dayVal = data[day];
    const blocks = processDayValue(dayVal); // Get segments in minutes

    if (blocks.length > 0) {
      const totalMins = blocks.reduce((acc, b) => acc + (b.end - b.start), 0);
      const tpl = (typeof dayVal === 'string') ? TEMPLATES.get(dayVal) : null;
      if (tpl) {
         col.insertAdjacentHTML('beforeend', `<div class="day-summary"><span class="muted">${dayVal}</span> ${fmt(tpl.start_time)} – ${fmt(tpl.finish_time)}<span class="summary-right">${(totalMins/60).toFixed(1)}h</span></div>`);
      } else {
         col.insertAdjacentHTML('beforeend', `<div class="day-summary"><span class="muted">Custom segments</span><span class="summary-right">${(totalMins/60).toFixed(1)}h</span></div>`);
      }
    } else {
       col.insertAdjacentHTML('beforeend', `<div class="off">Roster Day Off</div>`);
    }

    col.insertAdjacentHTML('beforeend', `<div class="day-actions"><button class="iconbtn" data-day="${day}" data-adv="${advName}">＋</button><button class="iconbtn" data-day="${day}" data-adv="${advName}" data-edit>✎</button></div>`);
    const cell = document.createElement('div');
    cell.className = 'timeline-cell';
    
    blocks.forEach(b => {
      const top = (b.start - START * 60) * PX_PER_MIN;
      const h = (b.end - b.start) * PX_PER_MIN;
      const el = document.createElement('div');
      el.className = `block ${classForCode(b.label)}`;
      el.style.top = top + 'px';
      el.style.height = Math.max(16, h) + 'px';
      el.innerHTML = `<div>${b.label}<span class="time">${m2t(b.start)} – ${m2t(b.end)}</span></div>`;
      el.dataset.day = day;
      el.dataset.adv = advName;
      el.dataset.start = m2t(b.start);
      el.dataset.end = m2t(b.end);
      el.dataset.code = b.label;
      el.addEventListener('click', onBlockClick);
      cell.appendChild(el);
    });
    col.appendChild(cell);
    grid.appendChild(col);
  });

  $$('.day-actions .iconbtn').forEach(b => b.onclick = () => openAssign(b.dataset.day, b.dataset.adv));
}

/* =========================
   Dialogs: Assign / Split
   ========================= */
const assignDlg = $('#assignDlg'),
  assignSelect = $('#assignSelect'),
  assignTitle = $('#assignTitle');
const modeTemplate = $('#modeTemplate'),
  modeSplit = $('#modeSplit'),
  modeHint = $('#modeHint');
const segmentsWrap = $('#segmentsWrap');

function segmentRowHTML(s, idx) {
  return `<div class="row" data-i="${idx}">
    <select class="seg-code">${codeSelectGroupedHTML(s.code||'')}</select>
    <input type="time" class="seg-start" value="${s.start||''}"> <span>–</span>
    <input type="time" class="seg-end" value="${s.end||''}">
    <button class="del">Delete</button>
  </div>`;
}

function loadSegmentsUI(arr) {
  segmentsWrap.innerHTML = (arr && arr.length) ? arr.map((s, i) => segmentRowHTML(s, i)).join('') : '<div class="muted">No segments yet. Add one.</div>';
  $$('#segmentsWrap .row .del').forEach(btn => btn.onclick = () => {
    btn.parentElement.remove();
    if ($$('#segmentsWrap .row').length === 0) segmentsWrap.innerHTML = '<div class="muted">No segments yet. Add one.</div>';
  });
}

function readSegmentsUI() {
  const rows = $$('#segmentsWrap .row');
  const list = rows.map(r => ({
      code: r.querySelector('.seg-code').value,
      start: r.querySelector('.seg-start').value,
      end: r.querySelector('.seg-end').value
    }))
    .filter(s => s.code && s.start && s.end && toMin(s.end) > toMin(s.start))
    .sort((a, b) => toMin(a.start) - toMin(b.start));
  for (let i = 1; i < list.length; i++) {
    if (toMin(list[i].start) < toMin(list[i - 1].end)) {
      alert('Segments overlap.');
      return null;
    }
  }
  return list;
}

function openAssign(day, advisorName) {
  const advName = advisorName || $('#advisorSelect').value;
  const aId = ADVISOR_BY_NAME.get(advName);
  if (!aId) return;
  const ws = $('#weekStart').value;
  const key = `${aId}::${ws}`;
  const data = ROTAS.get(key) || {};
  assignTitle.textContent = `${day} for ${advName}`;
  assignSelect.innerHTML = `<option value="">— Day Off —</option>` + Array.from(TEMPLATES.keys()).sort().map(n => `<option>${n}</option>`).join('');

  if (data[day] && typeof data[day] === 'object' && Array.isArray(data[day].segments)) {
    modeSplit.checked = true;
    modeTemplate.checked = false;
    $('#templateMode').style.display = 'none';
    $('#splitMode').style.display = 'block';
    loadSegmentsUI(data[day].segments);
  } else {
    modeTemplate.checked = true;
    modeSplit.checked = false;
    $('#templateMode').style.display = 'block';
    $('#splitMode').style.display = 'none';
    assignSelect.value = (typeof data[day] === 'string') ? data[day] : '';
    const tplName = assignSelect.value;
    modeHint.textContent = tplName ? `Current: ${tplName}. Convert to editable segments to tweak a small part.` : '';
  }

  $('#btnConvertToSplit').onclick = () => {
    const base = assignSelect.value || '';
    const segs = toEditableSegments(base);
    modeSplit.checked = true;
    modeTemplate.checked = false;
    $('#templateMode').style.display = 'none';
    $('#splitMode').style.display = 'block';
    loadSegmentsUI(segs);
  };
  $('#addSegment').onclick = () => {
    if ($('#segmentsWrap .muted')) $('#segmentsWrap .muted').remove();
    const div = document.createElement('div');
    div.className = 'row';
    div.innerHTML = `${'<select class="seg-code">'+codeSelectGroupedHTML('Admin')+'</select>'}
      <input type="time" class="seg-start" value="08:00"> <span>–</span> <input type="time" class="seg-end" value="12:00">
      <button class="del">Delete</button>`;
    div.querySelector('.del').onclick = () => {
      div.remove();
      if ($$('#segmentsWrap .row').length === 0) $('#segmentsWrap').innerHTML = '<div class="muted">No segments yet. Add one.</div>';
    };
    segmentsWrap.appendChild(div);
  };

  $('#assignOK').onclick = async () => {
    const fresh = Object.assign({}, data);
    if (modeTemplate.checked) {
      const tplName = assignSelect.value;
      if (tplName) fresh[day] = tplName;
      else delete fresh[day];
    } else {
      const segs = readSegmentsUI();
      if (!segs) return;
      fresh[day] = {
        segments: segs
      };
    }
    await upsertRota(aId, ws, fresh);
    assignDlg.close();
    refreshUI(); // Full refresh
  };

  assignDlg.showModal();
}

/* =========================
   Dialogs: Block Editor
   ========================= */
const blockDlg = $('#blockDlg');
const bmWhole = $('#bmWhole'),
  bmSub = $('#bmSub');
const bwStart = $('#bwStart'),
  bwEnd = $('#bwEnd'),
  bwCode = $('#bwCode');
const bsStart = $('#bsStart'),
  bsEnd = $('#bsEnd'),
  bsCode = $('#bsCode');

function buildBlockSelects() {
  const codes = codeSelectGroupedHTML();
  [bwCode, bsCode].forEach(sel => sel.innerHTML = codes);
}

function onBlockClick(e) {
  const el = e.currentTarget;
  const advName = el.dataset.adv;
  const day = el.dataset.day;
  const aId = ADVISOR_BY_NAME.get(advName);
  const ws = $('#weekStart').value;
  const key = `${aId}::${ws}`;
  const data = ROTAS.get(key) || {};
  const origCode = el.dataset.code,
    origStart = el.dataset.start,
    origEnd = el.dataset.end;
  $('#blockTitle').textContent = `Edit ${day} for ${advName}`;
  $('#blockHint').textContent = `Block: ${origCode} ${origStart}–${origEnd}`;
  buildBlockSelects();
  bmSub.checked = true;
  $('#blockSub').style.display = 'block';
  $('#blockWhole').style.display = 'none';
  bwCode.value = origCode;
  bwStart.value = origStart;
  bwEnd.value = origEnd;
  bsCode.value = origCode;
  bsStart.value = origStart;
  bsEnd.value = origEnd;

  bmWhole.onchange = bmSub.onchange = () => {
    const whole = bmWhole.checked;
    $('#blockWhole').style.display = whole ? 'block' : 'none';
    $('#blockSub').style.display = whole ? 'none' : 'block';
  };

  $('#blockOK').onclick = async () => {
    const baseSegs = toEditableSegments(data[day] || '');
    const oS = toMin(origStart),
      oE = toMin(origEnd);
    const idx = baseSegs.findIndex(s => s.start === origStart && s.end === origEnd && (s.code || '') === origCode);
    if (idx === -1) {
      alert('Could not find block.');
      return;
    }

    let segs = [...baseSegs];
    if (bmWhole.checked) {
      const c = bwCode.value,
        s = bwStart.value,
        e = bwEnd.value;
      if (!s || !e || toMin(e) <= toMin(s) || toMin(s) < oS || toMin(e) > oE) {
        alert('Invalid range.');
        return;
      }
      segs.splice(idx, 1);
      if (toMin(s) > oS) segs.splice(idx, 0, {
        code: origCode,
        start: m2t(oS),
        end: s
      });
      segs.splice(idx + (toMin(s) > oS ? 1 : 0), 0, {
        code: c,
        start: s,
        end: e
      });
      if (toMin(e) < oE) segs.splice(idx + (toMin(s) > oS ? 1 : 0) + 1, 0, {
        code: origCode,
        start: e,
        end: m2t(oE)
      });
    } else {
      const c = bsCode.value,
        s = bsStart.value,
        e = bsEnd.value;
      if (!s || !e || toMin(e) <= toMin(s) || toMin(s) < oS || toMin(e) > oE) {
        alert('Invalid sub-range.');
        return;
      }
      segs.splice(idx, 1);
      if (toMin(s) > oS) segs.splice(idx, 0, {
        code: origCode,
        start: m2t(oS),
        end: s
      });
      segs.splice(idx + (toMin(s) > oS ? 1 : 0), 0, {
        code: c,
        start: s,
        end: e
      });
      if (toMin(e) < oE) segs.splice(idx + (toMin(s) > oS ? 1 : 0) + 1, 0, {
        code: origCode,
        start: e,
        end: m2t(oE)
      });
    }
    const fresh = Object.assign({}, data, {
      [day]: {
        segments: mergeAdjacent(segs)
      }
    });
    await upsertRota(aId, ws, fresh);
    blockDlg.close();
    refreshUI(); // Full refresh
  };

  blockDlg.showModal();
}

/* =========================
   Dialogs: Publish
   ========================= */
async function confirmOverwriteDay(advisorId, ws, day, newValue) {
  const key = `${advisorId}::${ws}`;
  const existing = ROTAS.get(key) || {};
  const had = existing[day] !== undefined && existing[day] !== null && existing[day] !== '';
  const same = JSON.stringify(existing[day] || null) === JSON.stringify(newValue || null);
  if (!had || same) return true;
  return confirm(`You're about to overwrite ${ADVISOR_BY_ID.get(advisorId) || 'this advisor'} on ${day} for week ${ws}. Continue?`);
}

function collectPublishTargets() {
  const ws = $('#weekStart').value;
  const selVal = $('#advisorSelect').value;

  if (selVal === '__TEAM_SELECTED__') {
    return [...selectedAdvisors].map(name => ({
      id: ADVISOR_BY_NAME.get(name),
      name,
      ws
    }));
  }
  if (selVal === '__TEAM_ALL__') {
    return ADVISORS_LIST.map(a => ({
      id: a.id,
      name: a.name,
      ws
    }));
  }
  if (selVal && selVal.startsWith && selVal.startsWith('advisor::')) {
    const id = selVal.split('::')[1];
    return [{
      id,
      name: ADVISOR_BY_ID.get(id) || '',
      ws
    }];
  }
  return [];
}

function openPublishDialog() {
  const targets = collectPublishTargets();
  if (!targets.length) {
    alert('Select an advisor or team to publish.');
    return;
  }
  const ws = $('#weekStart').value;
  const dayMode = ($('#advisorSelect').value === '__TEAM_SELECTED__' || $('#advisorSelect').value === '__TEAM_ALL__');

  $('#publishSummary').textContent = dayMode ?
    `Publishing the selected day (${ $('#teamDay').value }) for ${targets.length} advisor(s), week starting ${ws}.` :
    `Publishing the full week for ${targets.length} advisor(s), week starting ${ws}.`;

  const ul = document.createElement('ul');
  ul.style.margin = '6px 0 0 18px';
  ul.style.padding = '0';
  targets.forEach(t => {
    const li = document.createElement('li');
    li.textContent = t.name || t.id;
    ul.appendChild(li);
  });
  const listBox = $('#publishList');
  listBox.innerHTML = '';
  listBox.appendChild(ul);

  publishDlg.showModal();
}

async function doPublish() {
  const targets = collectPublishTargets();
  if (!targets.length) {
    publishDlg.close();
    return;
  }

  const ws = $('#weekStart').value;
  const teamMode = ($('#advisorSelect').value === '__TEAM_SELECTED__' || $('#advisorSelect').value === '__TEAM_ALL__');
  const teamDay = $('#teamDay').value;

  let published = 0,
    skipped = 0;

  for (const t of targets) {
    const key = `${t.id}::${ws}`;
    const data = ROTAS.get(key) || {};

    if (teamMode) {
      const newVal = data[teamDay] || null;
      const ok = await confirmOverwriteDay(t.id, ws, teamDay, newVal);
      if (!ok) {
        skipped++;
        continue;
      }
      const fresh = Object.assign({}, data);
      if (newVal === null || newVal === undefined) delete fresh[teamDay];
      else fresh[teamDay] = newVal;
      await upsertRota(t.id, ws, fresh);
      published++;
    } else {
      let proceed = true;
      for (const d of DAYS) {
        const ok = await confirmOverwriteDay(t.id, ws, d, data[d] || null);
        if (!ok) {
          proceed = false;
          break;
        }
      }
      if (!proceed) {
        skipped++;
        continue;
      }
      await upsertRota(t.id, ws, data);
      published++;
    }
  }

  publishDlg.close();
  alert(`Publish complete. Updated: ${published}. Skipped: ${skipped}.`);
}


/* =========================
   Rotation Preview Logic
   ========================= */

function effectiveWeek(startDateStr, plannerWeekStartStr) {
  try {
    const start = new Date(startDateStr);
    const plan = new Date(plannerWeekStartStr);
    const diffDays = Math.floor((plan - start) / 86400000);
    const diffWeeks = Math.floor(diffDays / 7);
    return ((diffWeeks % 6) + 6) % 6 + 1; // 1..6
  } catch(e) {
    return 1; // Fallback
  }
}

function applyRotationToWeek({ rotationName, mondayISO, advisors }) {
  const rot = ROTATION[rotationName];
  if (!rot) { console.warn('No rotation:', rotationName); return; }

  // Note: This simplified logic assumes week 1. 
  // A full implementation would need the rotation's start_date from the DB.
  const weekNum = 1; 
  
  const w = rot[weekNum] || rot[1];
  if (!w) { console.warn('No week found for', rotationName, 'num:', weekNum); return; }

  const [yy, mm, dd] = mondayISO.split("-").map(Number);
  const base = new Date(yy, (mm || 1) - 1, dd || 1);
  const isoDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
    return toISODateLocal(d);
  });
  
  const ids = advisors.map(a => (typeof a === 'string' ? a : a.id));

  // This function *modifies the main ROTAS map* directly
  isoDates.forEach((iso, i) => {
    const dayName = DAYS[i];
    const dow = i + 1;
    const cell = w[dow];
    if (!cell) return;

    if (cell.is_rdo) {
      ids.forEach(id => {
        const key = `${id}::${mondayISO}`;
        const weekData = ROTAS.get(key) || {};
        weekData[dayName] = ""; // Set as Day Off
        ROTAS.set(key, weekData);
      });
      return;
    }

    const sek = cell.start_end_key; // "07:00x16:00"
    const fam = VARIANTS_BY_START_END[sek] || null; // This is an OBJECT: { "7A":{...}, "7B":{...} }
    const variants = fam ? Object.keys(fam) : []; // This is now CORRECT: ["7A", "7B"]

    ids.forEach((id, idx) => {
      const key = `${id}::${mondayISO}`;
      const weekData = ROTAS.get(key) || {};
      
      let tplName = ""; // Default to Day Off
      if (fam && variants.length) {
        const templateCode = variants[idx % variants.length]; // "7A"
        
        // Find a Template Name (e.g., "Early") that has this code
        // This logic assumes a template in the main `templates` table
        // is NAMED "7A" or whatever the code is.
        if (TEMPLATES.has(templateCode)) {
            tplName = templateCode;
        } else {
            console.warn(`Rotation code "${templateCode}" not found in Master Templates list.`);
        }
      }
      
      weekData[dayName] = tplName;
      ROTAS.set(key, weekData);
    });
  });
  
  console.log('applyRotationToWeek ok →', rotationName, 'week', weekNum, 'advisors', ids.length);
  return { weekNum, advisors: ids.length };
}

window.populateRotationSelect = function() {
  const sel = document.getElementById('rotationName');
  if (!sel) return;
  const names = Object.keys(ROTATION || {});
  if (!names.length) {
    sel.innerHTML = '<option value="">(no rotations found)</option>';
    return;
  }
  const cur = sel.value;
  sel.innerHTML = names.sort().map(n => `<option value="${n}">${n}</option>`).join('');
  if (cur && names.includes(cur)) sel.value = cur;
}


/* =========================
   Horizontal Planner UI
   ========================= */

/**
 * Calculates the segments for the horizontal planner from the central ROTAS map.
 */
window.computePlannerRowsFromState = function() {
  try {
    const ws = $('#weekStart')?.value;
    const teamSel = $('#advisorSelect')?.value || '__TEAM_SELECTED__';
    const dayName = $('#teamDay')?.value || 'Monday';
    
    let names = [];
    if (teamSel === '__TEAM_SELECTED__') names = [...selectedAdvisors];
    else if (teamSel === '__TEAM_ALL__') names = ADVISORS_LIST.map(a => a.name);
    else if (teamSel?.startsWith?.('advisor::')) {
      const id = teamSel.split('::')[1];
      const n = ADVISOR_BY_ID.get(id);
      if (n) names = [n];
    }
    
    const rows = [];
    for (const name of names.sort((a, b) => a.localeCompare(b))) {
      const aId = ADVISOR_BY_NAME.get(name);
      if (!aId) continue;
      
      const key = `${aId}::${ws}`;
      const weekData = ROTAS.get(key) || {};
      const dayVal = weekData[dayName]; // e.g., "Early" or { segments: [...] }
      
      const segs = processDayValue(dayVal); // Returns [{ label, start, end }] in minutes
      
      rows.push({
        name,
        badge: '',
        segments: segs.map(s => ({
          type: s.label.toLowerCase(), // Use label for type
          code: s.label,
          start: s.start, // minutes
          end: s.end // minutes
        }))
      });
    }
    return rows;
  } catch (e) {
    console.warn('computePlannerRowsFromState failed', e);
    return [];
  }
}

/**
 * Renders the horizontal planner bars.
 */
window.renderPlanner = function(rows) {
  try {
    const body = document.getElementById('plannerBody');
    if (!body) return;
    body.innerHTML = '';
    
    rows.forEach(r => {
      const row = document.createElement('div');
      row.className = 'planner__row';
      const left = document.createElement('div');
      left.className = 'planner__name';
      left.textContent = r.name;
      row.appendChild(left);
      
      const tl = document.createElement('div');
      tl.className = 'planner__timeline';
      
      r.segments.forEach(s => {
        // s.start and s.end are already in minutes
        if (s.start == null || s.end == null || s.end <= s.start) return;
        
        const bar = document.createElement('div');
        bar.className = `planner__bar ${classForCode(s.code)}`;
        
        const pct = m => (m - DAY_START) / DAY_SPAN * 100;
        const leftPct = Math.max(0, pct(s.start));
        const widthPct = Math.max(0, pct(s.end) - leftPct);

        bar.style.left = leftPct + '%';
        bar.style.width = widthPct + '%';
        bar.title = `${s.code} ${m2t(s.start)}–${m2t(s.end)}`;
        
        // Only add text if the bar is wide enough
        if (widthPct > 5) { // 5% width threshold for text
            bar.textContent = `${s.code} ${m2t(s.start)}–${m2t(s.end)}`;
        }
        
        tl.appendChild(bar);
      });
      row.appendChild(tl);
      body.appendChild(row);
    });
  } catch (e) {
    console.warn('renderPlanner error', e);
  }
}


/* =========================
   Unified UI Refresh
   ========================= */

/**
 * Single function to refresh all visible schedules.
 */
window.refreshPlannerUI = function() {
  const rows = window.computePlannerRowsFromState() || [];
  window.renderPlanner(rows);
}

/**
 * Refreshes all data-driven UI components.
 */
window.refreshUI = function() {
  window.refreshChips();
  window.rebuildTree();
  window.populateAssignTable();
  window.updateRangeLabel();
  window.renderCalendar(); // Refresh vertical
  window.refreshPlannerUI(); // Refresh horizontal
}


/* =========================
   Event Wiring
   ========================= */
window.wire = function() {
  // Publish
  wireOnce($('#btnPublish'), 'click', openPublishDialog);
  wireOnce($('#publishOK'), 'click', doPublish);
  
  // Printing
  wireOnce($('#btnPrint'), 'click', () => window.print());
  
  // Refresh Button (formerly Generate)
  wireOnce($('#btnGenerate'), 'click', refreshUI);
  
  // Week navigation
  wireOnce($('#btnToday'), 'click', () => {
    const t = window.setToMonday(new Date());
    $('#weekStart').value = t.toISOString().slice(0, 10);
    window.fetchRotasForWeek($('#weekStart').value).then(refreshUI);
  });
  wireOnce($('#prevWeek'), 'click', () => {
    const d = new Date($('#weekStart').value || new Date());
    d.setDate(d.getDate() - 7);
    $('#weekStart').value = d.toISOString().slice(0, 10);
    window.fetchRotasForWeek($('#weekStart').value).then(refreshUI);
  });
  wireOnce($('#nextWeek'), 'click', () => {
    const d = new Date($('#weekStart').value || new Date());
    d.setDate(d.getDate() + 7);
    $('#weekStart').value = d.toISOString().slice(0, 10);
    window.fetchRotasForWeek($('#weekStart').value).then(refreshUI);
  });

  // Top Controls
  wireOnce($('#advisorSelect'), 'change', () => {
    const v = $('#advisorSelect').value;
    if (v.startsWith && v.startsWith('leader::')) {
      const leaderId = v.split('::')[1];
      const names = getLeaderTeamNames(leaderId);
      selectedAdvisors = new Set(names);
      $('#advisorSelect').value = '__TEAM_SELECTED__'; // switch to Team view
    }
    updateViewSelector();
    refreshUI();
  });
  wireOnce($('#teamDay'), 'change', refreshUI);
  wireOnce($('#weekStart'), 'change', () => {
    window.fetchRotasForWeek($('#weekStart').value).then(refreshUI);
  });

  // Tree
  wireOnce($('#treeSearch'), 'input', window.rebuildTree);
  wireOnce($('#btnClearSel'), 'click', () => {
    selectedAdvisors.clear();
    refreshUI();
  });

  // Settings: Templates
  wireOnce($('#btnAddTemplate'), 'click', addTemplateHandler);
  wireOnce($('#btnLoadDefaults'), 'click', loadDefaultsHandler);

  // Settings: JSON
  wireOnce($('#btnSave'), 'click', () => {
    const exportObj = {
      org: ORG,
      templates: Object.fromEntries(TEMPLATES),
      weekStart: $('#weekStart').value
    };
    const blob = new Blob([JSON.stringify(exportObj, null, 2)], {
      type: 'application/json'
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'rota-export.json';
    a.click();
  });
  wireOnce($('#btnLoad'), 'click', () => $('#file').click());
  wireOnce($('#file'), 'change', async e => {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = async ev => {
      try {
        const data = JSON.parse(ev.target.result);
        alert('Loaded JSON. This importer restores Templates locally; manage Sites/Leaders/Advisors in the Schedules panel.');
        if (data.templates) {
          for (const t of Object.values(data.templates)) {
            await sb.from('templates').upsert({
              name: t.name,
              work_code: t.work_code || 'Admin',
              start_time: t.start_time || null,
              finish_time: t.finish_time || null,
              break1: t.break1 || null,
              lunch: t.lunch || null,
              break2: t.break2 || null
            }, {
              onConflict: 'name'
            });
          }
        }
      } catch {
        alert('Invalid JSON');
      }
    };
    r.readText(f);
  });
  wireOnce($('#btnReset'), 'click', () => {
    if (!confirm('Clear only local cache (does not delete Supabase data)?')) return;
    ROTAS.clear();
    sessionStorage.clear();
    localStorage.clear();
    location.reload();
  });
  
  // Rotation Preview
  wireOnce($('#previewRotation'), 'click', async () => {
    try {
      const rotationName = $('#rotationName').value;
      if (!rotationName) {
        alert('Please select a rotation to preview.');
        return;
      }
      const mondayISO = toMondayISO($('#weekStart').value || new Date().toISOString().slice(0,10));
      
      const advisors = [...selectedAdvisors].map(name => ADVISOR_BY_NAME.get(name)).filter(Boolean);
      if (!advisors.length) {
        alert('Please select advisors from the "Schedules" tree to preview.');
        return;
      }

      applyRotationToWeek({
        rotationName,
        mondayISO,
        advisors,
      });

      // Force a full UI refresh
      refreshUI();
      
    } catch (e) {
      console.error('Preview Rotation failed', e);
    }
  });
  
  // Populate rotation select on focus
  wireOnce($('#rotationName'), 'focus', window.populateRotationSelect);
}

/* =========================
   Realtime Subscriptions
   ========================= */
window.subscribeRealtime = function() {
  sb.channel('any-changes')
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'sites'
    }, () => window.loadOrg().then(() => {
      window.rebuildTree();
      window.rebuildAdvisorDropdown();
    }))
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'leaders'
    }, () => window.loadOrg().then(() => {
      window.rebuildTree();
      window.rebuildAdvisorDropdown();
    }))
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'advisors'
    }, () => window.loadOrg().then(() => {
      window.rebuildTree();
      window.rebuildAdvisorDropdown();
    }))
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'templates'
    }, () => window.loadTemplates().then(() => {
      window.populateTemplateEditor();
      window.renderCalendar();
    }))
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'rotas'
    }, () => {
      const ws = $('#weekStart').value;
      window.fetchRotasForWeek(ws).then(refreshUI);
    })
    .subscribe();
}


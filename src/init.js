// src/init.js (minimal, no duplicates with planner.js)
(function () {
  "use strict";
  console.log("init.js loaded v4");

  // Always have a client reference (the HTML creates window.supabase)
  const supabase = (typeof window !== 'undefined' && window.supabase) ? window.supabase : null;

  // ---------- DOM helpers ----------
  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

  // ---------- Color key UI (kept simple) ----------
  function buildColorKey(){
    const defs=[['email','Email','--color-email'],['mirakl','Mirakl','--color-mirakl'],['social','Social','--color-social'],['overtime','Overtime','--color-overtime'],['break','Break','--color-break'],['lunch','Lunch','--color-lunch'],['absence','Absence','--color-absence'],['shrink','Shrinkage','--color-shrink']];
    const el = $('#colorKey');
    if (!el) return;
    el.innerHTML = defs.map(([k,l,cssVar])=>{
      const v=getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
      return `<div class="key-row"><span class="swatch" style="background:${v}"></span><strong>${l}</strong><input type="text" data-k="${cssVar}" value="${v}"></div>`;
    }).join('');
    $$('#colorKey input').forEach(inp=>{
      inp.addEventListener('input',()=>{ document.documentElement.style.setProperty(inp.dataset.k, inp.value); });
    });
  }

  // ---------- Templates editor (CRUD via Supabase) ----------
  async function loadTemplates(){
    if (!supabase) return {};
    const { data, error } = await supabase.from('templates').select('*').order('name');
    if (error) { console.warn('templates load error', error); return {}; }
    const byName = {};
    (data||[]).forEach(t=> byName[t.name] = t);
    return byName;
  }

  function codeSelectGroupedHTML(val=''){
    const CODE_GROUPS = {
      "Activity":[
        "2nd Line","Admin","BH Email","BH Social","BH WhatsApp","DEB Email","DEB Social","DEB WhatsApp","Ebay",
        "KM Email","KM Social","KM WhatsApp","Mirakl","Mixing","PayPlus","PLT Email","PLT Social","PLT WhatsApp",
        "QA","Overtime"
      ],
      "Absence":[ "AL","Break","Lunch","Sick","Split Shift","RDO","Maternity","LTS" ],
      "Shrinkage":[ "121","ATL","Coaching","Huddle","ITI","Projects","Team Meeting","Training" ]
    };
    return Object.entries(CODE_GROUPS).map(([grp,codes])=>
      `<optgroup label="${grp}">${codes.map(c=>`<option ${val===c?'selected':''}>${c}</option>`).join('')}</optgroup>`
    ).join('');
  }

  function templateRow(t){
    const fmt = x => x ? String(x).slice(0,5) : '';
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

  async function populateTemplateEditor(){
    const ed = document.getElementById('templateEditor');
    if (!ed) return;
    const TEMPLATES = await loadTemplates();
    const list = Object.values(TEMPLATES).sort((a,b)=>a.name.localeCompare(b.name));
    ed.innerHTML = list.length? list.map(templateRow).join('') : '<div class="muted">No templates. Add or load samples.</div>';

    // Wire inputs
    ed.querySelectorAll('.template-row').forEach(row=>{
      const origName=row.dataset.name;
      row.querySelectorAll('input,select').forEach(inp=>{
        const f=inp.dataset.f; if(!f) return;
        inp.addEventListener('input', async()=>{
          const updated = Object.assign({}, TEMPLATES[origName], { [f]: inp.value || null });
          if(!supabase){ return; }
          if(f==='name' && inp.value.trim()!==origName){
            await supabase.from('templates').delete().eq('name', origName);
            const {error} = await supabase.from('templates').insert([{
              name: (updated.name||'').trim(),
              work_code: updated.work_code || 'Admin',
              start_time: updated.start_time,
              finish_time: updated.finish_time,
              break1: updated.break1,
              lunch: updated.lunch,
              break2: updated.break2
            }]);
            if(error) alert('Template rename failed: '+error.message);
          } else {
            const {error} = await supabase.from('templates').update({
              work_code: updated.work_code || 'Admin',
              start_time: updated.start_time,
              finish_time: updated.finish_time,
              break1: updated.break1,
              lunch: updated.lunch,
              break2: updated.break2
            }).eq('name', origName);
            if(error) alert('Template update failed: '+error.message);
          }
        });
      });
      row.querySelector('[data-act="del"]').onclick=async()=>{
        if(!confirm(`Delete template "${origName}"?`)) return;
        if(!supabase){ return; }
        const {error}=await supabase.from('templates').delete().eq('name',origName);
        if(error) alert('Delete failed: '+error.message);
        else populateTemplateEditor();
      };
    });
  }

  async function loadDefaults(){
    if(!supabase) return;
    const defaults=[
      {name:'Early',  work_code:'DEB Email', start_time:'07:00', finish_time:'16:00', break1:'09:15', lunch:'12:00', break2:'15:15'},
      {name:'Middle', work_code:'Mirakl',    start_time:'11:00', finish_time:'20:00', break1:'11:30', lunch:'15:30', break2:'17:45'},
      {name:'Late',   work_code:'PLT Social',start_time:'12:00', finish_time:'21:00', break1:'13:15', lunch:'17:00', break2:'19:15'},
    ];
    for(const t of defaults){ await supabase.from('templates').upsert(t, { onConflict:'name' }); }
    await populateTemplateEditor();
  }

  function wireTemplateButtons(){
    const add = document.getElementById('btnAddTemplate');
    const load= document.getElementById('btnLoadDefaults');
    if(add) add.onclick = async()=>{
      if(!supabase) return;
      const name='Shift '+Date.now().toString().slice(-5);
      const {error}=await supabase.from('templates').insert([{name,work_code:'Admin',start_time:'09:00',finish_time:'17:00',break1:null,lunch:'12:30',break2:null}]);
      if(error) alert('Add failed: '+error.message);
      else populateTemplateEditor();
    };
    if(load) load.onclick = loadDefaults;
  }

  // ---------- Assignment table: header dates (simple helper) ----------
  function updateDateHeaders(){
    const wsEl = document.getElementById('weekStart');
    const row = document.getElementById('dateHeaders');
    if(!wsEl || !row) return;
    const val = wsEl.value;
    if(!val){ row.innerHTML=''; return; }
    const base = new Date(val + 'T00:00:00');
    const fmt = d => d.toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'});
    const days = Array.from({length:7},(_,i)=>{ const d=new Date(base); d.setDate(d.getDate()+i); return d; });
    row.innerHTML = days.map(d=>`<th>${fmt(d)}</th>`).join('');
  }

  // ---------- Planner refresh wiring (delegates to planner.js functions) ----------
  function wirePlannerRefreshSources() {
    const weekStart = document.getElementById("weekStart");
    const teamDay = document.getElementById("teamDay");
    const advisorSelect = document.getElementById("advisorSelect");

    const doRefresh = () => { if (typeof refreshPlannerUI === 'function') refreshPlannerUI(); };

    if (weekStart) weekStart.addEventListener('change', () => { updateDateHeaders(); doRefresh(); });
    if (teamDay) teamDay.addEventListener('change', doRefresh);
    if (advisorSelect) advisorSelect.addEventListener('change', doRefresh);

    const gen = document.getElementById('btnGenerate');
    if (gen) gen.addEventListener('click', doRefresh);
  }

  // ---------- Public small helpers ----------
  window.buildColorKey = buildColorKey;
  window.populateTemplateEditor = populateTemplateEditor;
  window.updateDateHeaders = updateDateHeaders;
  window.wirePlannerRefreshSources = wirePlannerRefreshSources;

  // ---------- Immediate light boot (HTML adds a full boot after files load) ----------
  document.addEventListener('DOMContentLoaded', () => {
    buildColorKey();
    populateTemplateEditor();
    updateDateHeaders();
    wirePlannerRefreshSources();
  });
})();

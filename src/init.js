;(function () {
  'use strict';

  // --- globals we rely on ----------------------------------------------------
  // these maps are read by planner.js; make sure they exist
  if (!(window.ROTAS instanceof Map)) window.ROTAS = new Map();
  if (!(window.TEMPLATES instanceof Map)) window.TEMPLATES = new Map();
  if (!(window.ADVISOR_BY_NAME instanceof Map)) window.ADVISOR_BY_NAME = new Map();
  if (!(window.ADVISOR_BY_ID instanceof Map)) window.ADVISOR_BY_ID = new Map();

  // --- tiny helpers -----------------------------------------------------------
  var Q = function (sel, root) { return (root || document).querySelector(sel); };
  var QA = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

  function toHHMM(v) {
    if (!v) return '';
    var m = String(v).match(/^(\d{1,2}):?(\d{2})$/);
    if (!m) return '';
    var h = ('0' + m[1]).slice(-2);
    var mm = ('0' + m[2]).slice(-2);
    return h + ':' + mm;
  }
  function isDayOff(t) {
    return (/^(-|^|\s)day\s*\/?\s*off(\s|$)/i).test(String(t || ''));
  }

  // --- build advisor lookup maps from Master Assignment table -----------------
  function rebuildAdvisorIndexesFromTable() {
    var table = Q('#assignTable');
    if (!table) return false;

    var names = QA('tbody tr', table)
      .map(function (tr) {
        var cell = tr.querySelector('th,td');
        return (cell ? cell.textContent : '').trim();
      })
      .filter(Boolean);

    window.ADVISOR_BY_NAME = new Map(names.map(function (n) { return [n, n]; }));
    window.ADVISOR_BY_ID   = new Map(names.map(function (n) { return [n, n]; }));
    return window.ADVISOR_BY_NAME.size > 0;
  }

  // --- read Templates section into window.TEMPLATES ---------------------------
  function buildTemplatesFromUI() {
    var settings = Q('#settingsBox') || document;
    var groups = [];
    QA('div', settings).forEach(function (div) {
      var nameEl = div.querySelector('input[type="text"]');
      var times = QA('input[type="time"]', div).map(function (i) { return i.value; }).filter(Boolean);
      if (!nameEl || times.length < 2) return;
      groups.push({ nameEl: nameEl, times: times });
    });

    var obj = {};
    groups.forEach(function (g) {
      var name = (g.nameEl.value || g.nameEl.getAttribute('value') || g.nameEl.textContent || '').trim();
      if (!name) return;
      var norm = g.times.map(toHHMM).filter(Boolean);
      if (norm.length < 2) return;

      var start = norm[0], finish = norm[1];
      var breaks = [];
      for (var i = 2; i + 1 < norm.length; i += 2) {
        breaks.push({ start: norm[i], end: norm[i + 1] });
      }
      obj[name] = { start: start, end: finish, breaks: breaks };
    });

    // sensible defaults if UI is empty
    if (!Object.keys(obj).length) {
      obj.Early  =  { start: '07:00', end: '16:00', breaks: [{ start: '12:00', end: '12:30' }] };
      obj.Middle =  { start: '11:00', end: '20:00', breaks: [{ start: '15:00', end: '15:15' }] };
      obj.Late   =  { start: '12:00', end: '21:00', breaks: [{ start: '17:30', end: '18:00' }] };
    }

    window.TEMPLATES = new Map(Object.entries(obj));
    return window.TEMPLATES.size > 0;
  }

  // --- prime window.ROTAS from the Master Assignment table --------------------
  function primeRotasFromAssignTable() {
    var wsEl = Q('#weekStart');
    var dayEl = Q('#teamDay');
    var table = Q('#assignTable');

    var ws = wsEl ? wsEl.value : '';
    var dayName = dayEl ? (dayEl.value || 'Monday') : 'Monday';
    if (!ws || !table || !(window.ADVISOR_BY_NAME instanceof Map)) return 0;

    var dayIdx = DAYS.indexOf(dayName);
    if (dayIdx < 0) return 0;

    if (!(window.ROTAS instanceof Map)) window.ROTAS = new Map();

    var primed = 0;
    QA('tbody tr', table).forEach(function (tr) {
      var nameCell = tr.querySelector('th,td');
      var name = (nameCell ? nameCell.textContent : '').trim();
      if (!name) return;

      var aId = window.ADVISOR_BY_NAME.get(name);
      if (!aId) return;

      var cells = Array.prototype.slice.call(tr.children || []);
      var startIdx = -1;
      for (var i = 0; i < cells.length; i++) {
        if (cells[i].querySelector('select') || /(Early|Late|Middle|Day\s*Off)/i.test(cells[i].textContent)) {
          startIdx = i; break;
        }
      }
      if (startIdx < 0) startIdx = 1;

      var cell = cells[startIdx + dayIdx];
      if (!cell) return;

      var sel = cell.querySelector('select,[data-template],[data-value]');
      var tpl = '';
      if (sel) {
        if ('value' in sel) tpl = sel.value;
        if (!tpl && sel.getAttribute) {
          tpl = sel.getAttribute('data-template') || sel.getAttribute('data-value') || '';
        }
      }
      if (!tpl) tpl = (cell.textContent || '');
      tpl = String(tpl).replace(/[–—]/g, '-').trim();
      if (!tpl || isDayOff(tpl)) return;

      var key = aId + '::' + ws;
      var weekObj = window.ROTAS.get(key) || {};
      weekObj[dayName] = tpl;
      window.ROTAS.set(key, weekObj);
      primed++;
    });
    return primed;
  }

  // --- optional: fetch week data from backend (if provided) -------------------
  function maybeFetchRotasForWeek() {
    var wsEl = Q('#weekStart');
    var ws = wsEl ? wsEl.value : '';
    if (!ws) return Promise.resolve();
    if (typeof window.fetchRotasForWeek !== 'function') return Promise.resolve();
    return window.fetchRotasForWeek(ws).catch(function(){});
  }

  // --- rendering bridge to planner.js ----------------------------------------
  function renderHorizontalFromState() {
    if (typeof window.computePlannerRowsFromState !== 'function') return 0;
    var rows = window.computePlannerRowsFromState() || [];
    if (rows.length && typeof window.renderPlanner === 'function') window.renderPlanner(rows);
    if (rows.length && typeof window.renderAdvisorWeek === 'function') window.renderAdvisorWeek(rows);
    return rows.length;
  }

  // --- utilities --------------------------------------------------------------
  function setMondayIfEmpty() {
    var el = Q('#weekStart');
    if (!el || el.value) return;
    var d = new Date();
    var dow = (d.getDay() + 6) % 7; // Monday=0
    d.setDate(d.getDate() - dow);
    el.value = d.toISOString().slice(0, 10);
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function wireOnce() {
    var assign = Q('#assignTable');
    if (assign && !assign.dataset.primeWired) {
      assign.addEventListener('change', function () {
        rebuildAdvisorIndexesFromTable();
        primeRotasFromAssignTable();
        buildTemplatesFromUI();
        renderHorizontalFromState();
      });
      assign.dataset.primeWired = '1';
    }

    var settings = Q('#settingsBox');
    if (settings && !settings.dataset.tplWired) {
      settings.addEventListener('change', function (e) {
        var t = e.target;
        if (!t) return;
        if (t.matches && t.matches('input[type="time"],input[type="text"],select')) {
          buildTemplatesFromUI();
          renderHorizontalFromState();
        }
      });
      settings.dataset.tplWired = '1';
    }

    var daySel = Q('#teamDay');
    if (daySel && !daySel.dataset.wired) {
      daySel.addEventListener('change', function () {
        primeRotasFromAssignTable();
        renderHorizontalFromState();
      });
      daySel.dataset.wired = '1';
    }

    var weekSel = Q('#weekStart');
    if (weekSel && !weekSel.dataset.wired) {
      weekSel.addEventListener('change', function () {
        maybeFetchRotasForWeek().then(function () {
          primeRotasFromAssignTable();
          renderHorizontalFromState();
        });
      });
      weekSel.dataset.wired = '1';
    }

    var genBtn = Q('#btnGenerate');
    if (genBtn && !genBtn.dataset.wired) {
      genBtn.addEventListener('click', function () {
        setTimeout(function () { renderHorizontalFromState(); }, 0);
      });
      genBtn.dataset.wired = '1';
    }
  }

  // --- boot -------------------------------------------------------------------
  function boot() {
    try {
      setMondayIfEmpty();

      var loaders = [];
      if (typeof window.loadOrg === 'function') loaders.push(window.loadOrg());
      if (typeof window.loadTemplates === 'function') loaders.push(window.loadTemplates());
      if (typeof window.loadAssignments === 'function') loaders.push(window.loadAssignments());

      Promise.all(loaders).then(function () {
        return maybeFetchRotasForWeek();
      }).then(function () {
        rebuildAdvisorIndexesFromTable();
        buildTemplatesFromUI();
        primeRotasFromAssignTable();
        wireOnce();
        renderHorizontalFromState();
        if (typeof window.subscribeRealtime === 'function') window.subscribeRealtime();
      }).catch(function (e) {
        console.warn('boot error', e);
      });
    } catch (e) {
      console.warn('boot exception', e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();

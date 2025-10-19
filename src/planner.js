// === moved from HTML: time header builder ===
(function () {
  if (typeof window.renderTimeHeader !== 'function') {
    const DAY_START = 6 * 60;   // 06:00
    const DAY_END   = 20 * 60;  // 20:00

    window.renderTimeHeader = function (el) {
      if (!el) return;
      el.innerHTML = '';

      const wrap = document.createElement('div');
      wrap.className = 'time-scale';

      for (let m = DAY_START; m <= DAY_END; m += 60) {
        const tick = document.createElement('div');
        tick.className = 'tick';
        tick.style.left = `${((m - DAY_START) / (DAY_END - DAY_START)) * 100}%`;
        const h = Math.floor(m / 60);
        const mm = String(m % 60).padStart(2, '0');
        tick.textContent = `${h}:${mm}`;
        wrap.appendChild(tick);
      }

      el.appendChild(wrap);
    };
  }
})();
/* KOOM glass layer — presentation only: replays the page-entrance animation on route change. */
(function () {
  var v = document.getElementById('view'); if (!v) return; var t;
  function go() { v.classList.remove('g-enter'); void v.offsetWidth; v.classList.add('g-enter'); clearTimeout(t); t = setTimeout(function () { v.classList.remove('g-enter'); }, 900); }
  addEventListener('hashchange', go); go();
  /* cursor spotlight on artwork: feeds --mx/--my to css/glass */
  var raf = 0, ev;
  document.addEventListener('pointermove', function (e) { if (e.pointerType === 'touch') return; ev = e; if (raf) return; raf = requestAnimationFrame(function () { raf = 0; var a = ev.target.closest && ev.target.closest('.card .art, .tpick'); if (!a) return; var r = a.getBoundingClientRect(); a.style.setProperty('--mx', (ev.clientX - r.left) + 'px'); a.style.setProperty('--my', (ev.clientY - r.top) + 'px'); }); }, { passive: true });
})();

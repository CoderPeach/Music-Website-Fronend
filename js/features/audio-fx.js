/* KOOM — Equalizer + fade between songs.
   • Fade in/out uses the element volume (works with every stream, no CORS needed).
   • Equalizer needs Web Audio, which only works on audio the page is allowed to read:
       1) if the stream host sends CORS headers, the stream is used directly;
       2) otherwise the song is fetched through the fast /download endpoint into a blob (same route as offline downloads),
          the next song is prepared in the background, so playback stays gapless. */
(function () {
  'use strict';
  const BANDS = [[60, 'lowshelf', '60'], [230, 'peaking', '230'], [910, 'peaking', '910'], [3600, 'peaking', '3.6k'], [14000, 'highshelf', '14k']];
  const PRESETS = { flat: ['Flat', [0, 0, 0, 0, 0]], bass: ['Bass boost', [7, 5, 0, -1, -1]], vocal: ['Vocal', [-2, 0, 4, 3, -1]], treble: ['Treble', [-1, 0, 0, 4, 7]], rock: ['Rock', [5, 3, -2, 3, 5]], pop: ['Pop', [-1, 3, 4, 2, -1]], hiphop: ['Hip-hop', [6, 4, 0, 2, 3]], classical: ['Classical', [4, 3, -2, 3, 4]] };
  if (!Array.isArray(S.eqG) || S.eqG.length !== 5) { S.eqG = [0, 0, 0, 0, 0]; S.eqP = 'flat'; }
  let ctx = null, graph = 0, filt = [], corsOK = null, busy = 0;
  const fxOn = () => !!S.eqOn;
  const safeSrc = () => { const s = A.currentSrc || A.src || ''; return s.startsWith('blob:') || (corsOK === true && A.crossOrigin === 'anonymous'); };

  /* ---------- fade (volume based) ---------- */
  let base = A.volume, mine = -1, raf = 0;
  A.addEventListener('volumechange', () => { if (mine >= 0 && Math.abs(A.volume - mine) < .004) return; base = A.volume; });
  const setVol = v => { v = Math.max(0, Math.min(1, v)); if (Math.abs(A.volume - v) < .004) return; mine = v; A.volume = v; };
  function fadeFrame() {
    raf = 0; const f = +S.fade || 0;
    if (!f) { setVol(base); return; }
    if (A.paused) return;
    const d = A.duration, ct = A.currentTime;
    if (d && isFinite(d)) { const w = Math.min(f, d / 3), x = Math.max(0, Math.min(1, ct / w, (d - ct) / w)), m = x * x * (3 - 2 * x); setVol(base * m); }
    raf = requestAnimationFrame(fadeFrame);
  }
  const fadeKick = () => { if (!raf) raf = requestAnimationFrame(fadeFrame); };
  ['playing', 'seeked', 'loadedmetadata'].forEach(ev => A.addEventListener(ev, fadeKick));
  A.addEventListener('pause', () => { cancelAnimationFrame(raf); raf = 0; });

  /* ---------- equalizer graph ---------- */
  function applyEq() { if (!graph) return; filt.forEach((f, k) => f.gain.setTargetAtTime(S.eqOn ? S.eqG[k] : 0, ctx.currentTime, .05)); }
  function build() {
    if (graph || !fxOn() || !safeSrc()) return;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)(); let prev = ctx.createMediaElementSource(A);
      filt = BANDS.map(([f, type]) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = 1; b.gain.value = 0; prev.connect(b); prev = b; return b; });
      const pre = ctx.createGain(); pre.gain.value = 1; prev.connect(pre); pre.connect(ctx.destination); graph = 1; applyEq();
      if (ctx.state === 'suspended') ctx.resume();
    } catch (e) { fail('Equalizer is not supported in this browser'); }
  }
  function fail(msg) { S.eqOn = 0; saveS(); toast(msg); if (view === 'settings') route(1); const d = $('#eqdlg'); if (d) d.remove(); }
  const resume = () => { if (ctx && ctx.state === 'suspended') ctx.resume(); };
  ['playing', 'click', 'touchend'].forEach(ev => (ev === 'playing' ? A : document).addEventListener(ev, () => { resume(); if (fxOn() && !graph) build(); }, { passive: true }));

  /* does the stream host allow the page to read the audio? (asked once) */
  async function probe(t) {
    if (corsOK !== null) return corsOK;
    try { const ac = new AbortController(), r = await fetch(await streamUrl(t.c.videoId), { signal: ac.signal }); ac.abort(); corsOK = !!r.ok; } catch (e) { corsOK = false; }
    return corsOK;
  }
  /* blob copies for songs whose stream can't be read: small LRU, de-duplicated while in flight */
  const BL = new Map(), INF = new Map();
  async function fxBlob(t) {
    if (BL.has(t.url)) { const u = BL.get(t.url); BL.delete(t.url); BL.set(t.url, u); return u; }
    if (INF.has(t.url)) return INF.get(t.url);
    const job = (async () => {
      const body = { url: ytu(t.c.videoId), format_id: composeFmt(curQ()) };
      let r; try { r = await http(API_CONFIG.STREAM_API_URL, '/download', { method: 'POST', body, ttl: 0 }); } catch (e) { if (!/^(http (404|405|501))/.test(e.message)) throw e; r = await http(API_CONFIG.STREAM_API_URL, '/stream', { method: 'POST', body, ttl: 0 }); }
      const raw = r.download_url || r.stream_url || (r.token && 'download/' + r.token); if (!raw) throw new Error('no file');
      const res = await fetch(fix(raw)); if (!res.ok) throw new Error('http ' + res.status);
      const blob = await res.blob(); if (!blob.size) throw new Error('empty'); const u = URL.createObjectURL(new Blob([blob], { type: blob.type || res.headers.get('Content-Type') || 'audio/mp4' }));
      BL.set(t.url, u); while (BL.size > 4) { const k = BL.keys().next().value, old = BL.get(k); BL.delete(k); if (old !== A.src) URL.revokeObjectURL(old); }
      return u;
    })();
    INF.set(t.url, job); try { return await job; } finally { INF.delete(t.url); }
  }
  const _rs = window.resolveSrc;
  window.resolveSrc = async function (t) {
    if (!(fxOn() || graph) || (typeof OFF !== 'undefined' && OFF.has(t.url)) || !navigator.onLine) return _rs.apply(this, arguments);
    if (await probe(t)) { A.crossOrigin = 'anonymous'; return _rs.apply(this, arguments); }
    document.body.classList.add('kbuf');
    try { return await fxBlob(t); }
    catch (e) { if (graph) { A.removeAttribute('crossorigin'); } fail('Equalizer could not start for this song (' + (e && e.message || 'network') + ')'); document.body.classList.remove('kbuf'); return _rs.apply(this, arguments); }
  };
  A.addEventListener('timeupdate', () => {                                  // prepare the next song while this one plays
    if (corsOK !== false || !(fxOn() || graph) || !A.duration || A.duration - A.currentTime > 50) return;
    const n = Q[qi + 1]; if (n && n.c && n.c.videoId && !(typeof OFF !== 'undefined' && OFF.has(n.url)) && !BL.has(n.url) && !INF.has(n.url) && navigator.onLine) fxBlob(n).catch(() => { });
  });
  /* turn on while a song is already playing: reload it through the readable path, then attach the graph */
  async function maybeInit() {
    applyEq(); if (!fxOn() || graph || busy) return; const t = Q[qi]; if (!t || !A.getAttribute('src')) return;
    if (safeSrc()) { build(); return; }
    busy = 1; toast('Preparing equalizer…');
    try { play(qi, A.currentTime, A.paused); } catch (e) { }
    setTimeout(() => { busy = 0; }, 1500);
  }

  function openEq() {
    if (document.getElementById('eqdlg')) return;
    const w = document.createElement('div'); w.className = 'kdlg'; w.id = 'eqdlg'; w.setAttribute('role', 'dialog'); w.setAttribute('aria-label', 'Equalizer');
    const draw = () => {
      w.innerHTML = `<div class="kbox eqbox"><div class="eqtop"><h3>Equalizer</h3><button class="sw ${S.eqOn ? 'on' : ''}" id="eqsw" role="switch" aria-checked="${!!S.eqOn}" aria-label="Equalizer on or off"></button></div>
        <div class="eqp">${Object.entries(PRESETS).map(([k, [l]]) => `<button class="chip ${S.eqP === k ? 'on' : ''}" data-p="${k}">${l}</button>`).join('')}</div>
        <div class="eqb">${BANDS.map((b, k) => `<label><span>${b[2]} Hz</span><input type="range" min="-12" max="12" step="1" value="${S.eqG[k]}" data-b="${k}" aria-label="${b[2]} Hz gain" style="--p:${(S.eqG[k] + 12) / 24 * 100}%"><em>${S.eqG[k] > 0 ? '+' : ''}${S.eqG[k]} dB</em></label>`).join('')}</div>
        <p class="eqn">Works on streamed and downloaded songs. The first song may take a few seconds to prepare.</p>
        <div class="kbtn"><button class="btn2" id="eqreset">Reset</button><button class="pill pri" id="eqdone">Done</button></div></div>`;
    };
    draw(); document.body.append(w);
    const save = () => { saveS(); applyEq(); maybeInit(); };
    w.onclick = e => {
      if (e.target === w || e.target.id === 'eqdone') { w.remove(); if (view === 'settings') route(1); return; }
      if (e.target.id === 'eqsw') { S.eqOn = S.eqOn ? 0 : 1; save(); draw(); return; }
      if (e.target.id === 'eqreset') { S.eqG = [0, 0, 0, 0, 0]; S.eqP = 'flat'; save(); draw(); return; }
      const p = e.target.closest('[data-p]'); if (p) { S.eqP = p.dataset.p; S.eqG = [...PRESETS[S.eqP][1]]; S.eqOn = 1; save(); draw(); }
    };
    w.oninput = e => {
      const r = e.target.closest('[data-b]'); if (!r) return; const k = +r.dataset.b, v = +r.value; S.eqG[k] = v; S.eqP = 'custom'; S.eqOn = 1;
      r.style.setProperty('--p', (v + 12) / 24 * 100 + '%'); r.nextElementSibling.textContent = (v > 0 ? '+' : '') + v + ' dB';
      w.querySelectorAll('[data-p]').forEach(c => c.classList.remove('on')); w.querySelector('#eqsw').classList.add('on'); save();
    };
    w.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); w.remove(); } });
    w.querySelector('#eqsw').focus();
  }
  window.openEq = openEq;
  window.eqLabel = () => S.eqOn ? (S.eqP === 'custom' ? 'Custom' : (PRESETS[S.eqP] || PRESETS.flat)[0]) : 'Off';

  /* ---------- Settings → Playback rows ---------- */
  const _ss = window.showSet;
  window.showSet = function () {
    _ss.apply(this, arguments);
    const g = V.querySelector('#st-play .sc'); if (!g) return;
    g.insertAdjacentHTML('beforeend', sr('Equalizer', 'Bass, vocal and treble presets or your own 5-band mix', `<button class="btn2" data-fx="eq">${esc(eqLabel())} · Edit</button>`) +
      sr('Fade between songs', 'Fades out the end and fades in the start of each song', sel('fade', [['0', 'Off'], ['3', '3 seconds'], ['6', '6 seconds'], ['10', '10 seconds']], String(+S.fade || 0))));
  };
  document.addEventListener('click', e => { if (e.target.closest('[data-fx="eq"]')) openEq(); });
  V.addEventListener('change', e => { const s = e.target.closest('[data-kq="fade"]'); if (!s) return; S.fade = +s.value; saveS(); fadeKick(); toast(S.fade ? 'Fade set to ' + S.fade + ' seconds' : 'Fade is off'); });
  setTimeout(() => { fadeKick(); maybeInit(); }, 0);
})();

/* KOOM — accurate Track info (clickable artist/album), quality menu, lyric sharing and the player "more" menu. */
(function () {
  'use strict';
  const KIND = { m4a: 'AAC (M4A)', mp4: 'AAC (M4A)', webm: 'Opus (WebM)', opus: 'Opus', ogg: 'Vorbis (OGG)', mp3: 'MP3', wav: 'WAV', flac: 'FLAC' };
  const QNAME = { best: 'Auto — best available', high: 'High', std: 'Standard', low: 'Data saver' };
  const ytm = t => 'https://music.youtube.com/watch?v=' + t.c.videoId;

  /* ---------- accurate Track info ---------- */
  window.showInfo = function (t) {
    if (!t) return;
    const i = qInfo(t), kb = kbOf(i), m = DM[t.url], cur = Q[qi] === t, d = dur(t) || (cur && isFinite(A.duration) ? A.duration : 0);
    const ext = i && i.ext ? i.ext.toLowerCase() : '', setting = EX.has(t.c.videoId) ? 'Custom format' : QNAME[curQ()];
    const rows = [
      [_('iTitle'), title(t)], [_('iArtist'), t.c.artist || ''], [_('iAlbum'), t.c.album || ''], [_('iDur'), d ? mm(d) : ''],
      [_('iFormat'), ext ? KIND[ext] || ext.toUpperCase() : ''], [_('iBitrate'), kb ? '~' + kb + ' kbps' : ''],
      [_('iSize'), m ? fmtMB(m.size) : ''],
      ['Playing from', m ? 'Offline copy (downloaded ' + new Date(m.date).toLocaleDateString() + ')' : cur && A.src ? 'Streaming · ' + setting : ''],
      [_('iSrc'), 'YouTube Music'], ['Video ID', t.c.videoId || '']
    ].filter(r => r[1]);
    const aL = (t.c.artists && t.c.artists.length ? t.c.artists : t.c.artist ? [{ n: t.c.artist, id: t.c.artistId || '' }] : []);
    const link = r => r[0] === _('iArtist') && aL.length ? aL.map(x => `<a class="alink" ${x.id ? `data-aid="${esc(x.id)}"` : `data-an="${esc(x.n)}"`}>${esc(x.n)}</a>`).join(', ')
      : r[0] === _('iAlbum') ? `<a class="alink" ${t.c.albumId ? `data-alb="${esc(t.c.albumId)}"` : `data-albn="${esc(r[1])}"`}>${esc(r[1])}</a>` : esc(r[1]);
    $('#dd').innerHTML = rows.map(r => `<dt>${esc(r[0])}</dt><dd>${link(r)}</dd>`).join(''); $('#dlg').showModal();
  };
  $('#dd').addEventListener('click', e => {
    const a = e.target.closest('.alink'); if (!a) return; $('#dlg').close();
    if (typeof closeNP === 'function') try { closeNP(); } catch (x) { }
    if (a.dataset.aid) location.hash = '#/artist/' + enc(a.dataset.aid);
    else if (a.dataset.alb) location.hash = '#/album/' + enc(a.dataset.alb);
    else if (a.dataset.an || a.dataset.albn) gotoArtistByName(a.dataset.an || a.dataset.albn, a.dataset.albn ? 'albums' : 'artists');
  });
  window.qualMenu = a => Q[qi] && qualityMenu(Q[qi], a);

  /* ---------- Share the current lyric line ---------- */
  async function shareLyric() {
    const t = Q[qi]; if (!t) return toast(_('pickFirst'));
    const l = L.length && ai >= 0 && L[ai] && L[ai].tx || ''; if (!l) return toast('Play a song with synced lyrics first');
    const tx = `“${l}”\n— ${title(t)} · ${artist(t)}\n${ytm(t)}`;
    try { if (navigator.share) await navigator.share({ text: tx }); else { await navigator.clipboard.writeText(tx); toast('Lyric copied'); } } catch (e) { }
  }
  { const x = $('#lyx'); if (x) { x.insertAdjacentHTML('beforebegin', `<button class="ib" id="lyshare" aria-label="Share current lyric"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7M16 6l-4-4-4 4M12 2v13"/></svg></button>`); $('#lyshare').onclick = shareLyric; } }

  /* ---------- Player "more" menu (replaces the FLAC / High Efficiency one) ---------- */
  $('#nm').onclick = e => {
    const t = Q[qi]; if (!t) return toast(_('pickFirst')); const i = qInfo(t), kb = kbOf(i), off = OFF.has(t.url);
    openMenu([
      { l: _('speed'), i: 'speed', r: S.speed + '×', fn: speedMenu },
      { l: _('sleepT'), i: 'moon', r: sleep.eot ? _('eos') : _(sleep.end ? 'on' : 'off'), fn: sleepMenu },
      { l: 'Audio quality', i: 'sliders', r: i && i.ext ? i.ext.toUpperCase() + (kb ? ' ' + kb + 'k' : '') : off ? 'Offline' : 'Auto', fn: () => qualityMenu(t, e.currentTarget) },
      { l: 'Equalizer', i: 'sliders', r: (window.eqLabel ? window.eqLabel() : 'Off'), fn: () => window.openEq && window.openEq() },
      { sep: 1 },
      { l: _('addPl'), i: 'plus', fn: () => pickPl(t) },
      { l: off ? 'Downloaded · options' : 'Download…', i: off ? 'dldone' : 'dl', fn: () => dlChoose(t, e.currentTarget) },
      { l: 'Share lyric line', i: 'quote', fn: shareLyric },
      { l: 'Share song', i: 'expand', fn: () => shareTrack(t) },
      { l: _('trackInfo'), i: 'info', fn: () => showInfo(t) }
    ], e.currentTarget, title(t));
  };

})();

/* ListenEcho v2 — full-track playback with per-accent sentence timestamps. */
(() => {
  'use strict';
  const instances = new WeakMap();
  let activePlayer = null;
  const names = { british: 'British English', american: 'American English', australian: 'Australian English' };
  const css = `
    :host{display:block;color:var(--le-ink,#243c34);font-family:inherit;font-size:14px}
    *{box-sizing:border-box} [hidden]{display:none!important}
    button,input,select{font:inherit}button{cursor:pointer}button:active{transform:scale(.98)}
    button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid var(--le-accent,#345e4b);outline-offset:4px}
    h2{font-size:26px;line-height:1.3;letter-spacing:-.7px;font-weight:600;margin:0 0 24px}
    .player,.text-panel{background:var(--le-surface,#fffefa);border:1px solid var(--le-border,#e1e5db);border-radius:20px}
    .player{padding:26px}.accents{display:grid;grid-template-columns:repeat(var(--accent-count,3),minmax(0,1fr));gap:5px;background:var(--le-soft,#f0f2ea);padding:5px;border-radius:12px}
    .accent{border:1px solid transparent;border-radius:9px;background:transparent;color:var(--le-muted,#737b71);padding:14px 10px;font-size:14px;text-align:center}
    .accent[aria-pressed=true]{background:var(--le-surface,#fffefa);border-color:var(--le-border,#d5ddce);color:var(--le-accent,#345e4b);font-weight:600;box-shadow:0 2px 4px #33423108}
    .mode{margin:28px 0 20px;font-size:18px;font-weight:500}.transport{display:flex;align-items:center;gap:18px}
    .play{display:grid;place-items:center;width:54px;height:54px;border:0;border-radius:50%;background:var(--le-accent,#345e4b);color:#fff;flex-shrink:0;font-size:18px}
    .timeline{flex:1;min-width:0}.seek{width:100%;accent-color:var(--le-accent,#345e4b);cursor:pointer;margin:0;height:20px}
    .times{display:flex;justify-content:space-between;font-size:11px;color:var(--le-muted,#737b71);font-variant-numeric:tabular-nums;margin-top:5px}
    .toolbar{display:flex;justify-content:space-between;align-items:center;gap:14px;margin-top:22px}
    .full{display:block;width:100%;margin-top:20px;border:0;border-radius:12px;background:var(--le-accent,#345e4b);color:#fff;padding:16px 20px;font-size:16px;font-weight:600;box-shadow:0 3px 8px #345e4b16}.full span{margin-right:10px;font-size:13px}
    .speed-label{display:flex;align-items:center;gap:9px;font-size:12px;color:var(--le-muted,#737b71)}
    select{background:var(--le-surface,#fffefa);border:1px solid var(--le-border,#e1e5db);border-radius:6px;padding:6px;color:inherit}
    .status{margin:15px 0 0;font-size:12px;color:var(--le-muted,#737b71);line-height:1.5}.status.error{color:#9b473b}
    .text-panel{margin-top:16px;overflow:hidden}.text-head{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:22px 26px}
    h3{margin:0;font-size:15px;font-weight:550}.toggle{display:flex;align-items:center;gap:10px;border:0;background:transparent;color:var(--le-muted,#737b71);padding:5px 0;font-size:12px;white-space:nowrap}
    .switch{width:34px;height:20px;padding:3px;border-radius:12px;background:#dce1d5}.switch i{display:block;width:14px;height:14px;background:#fff;border-radius:50%;transition:transform .15s}
    .toggle[aria-expanded=true] .switch{background:var(--le-accent,#345e4b)}.toggle[aria-expanded=true] .switch i{transform:translateX(14px)}
    .sentence{display:grid;grid-template-columns:24px 1fr 14px;gap:10px;align-items:start;width:100%;text-align:left;background:transparent;border:0;border-top:1px solid var(--le-border,#e1e5db);padding:18px 24px;color:inherit;font-size:16px;line-height:1.7}
    .sentence:hover,.sentence.current{background:var(--le-soft,#edf2e9)}.number,.sentence-icon{font-size:10px;color:var(--le-muted,#737b71);padding-top:5px}
    @media(max-width:420px){.player{padding:20px}.accent{font-size:12px;padding:14px 5px}.text-head{padding:20px}.sentence{padding:17px 18px;font-size:15px;gap:8px}h2{font-size:23px}}
    @media(prefers-reduced-motion:reduce){*{transition:none!important}}
  `;

  function validate(lesson) {
    if (!lesson || !Array.isArray(lesson.sentences) || !lesson.sentences.length ||
        !lesson.sentences.every(text => typeof text === 'string' && text.trim())) {
      throw new Error('Provide a non-empty sentences array of text strings.');
    }
    for (const key of Object.keys(names)) {
      if (key === 'australian' && !Object.hasOwn(lesson.audio || {}, key)) continue;
      const track = lesson.audio?.[key];
      if (!track || typeof track.full !== 'string' || !track.full.trim() ||
          !Array.isArray(track.segments) || track.segments.length !== lesson.sentences.length ||
          !track.segments.every((segment, i) => Number.isFinite(segment.start) && Number.isFinite(segment.end) &&
            segment.start >= 0 && segment.end > segment.start && (!i || segment.start >= track.segments[i - 1].end))) {
        throw new Error(`${key}: provide full audio and ordered, non-overlapping start/end seconds for every sentence.`);
      }
    }
  }

  function mount(host, lesson) {
    if (!(host instanceof Element)) throw new TypeError('ListenEcho.mount requires a DOM element.');
    validate(lesson);
    instances.get(host)?.destroy();
    const shell = document.createElement('div');
    const root = shell.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${css}</style><section aria-label="Listen and Echo">
      <h2 id="title" hidden></h2>
      <div class="player">
        <div class="accents" role="group" aria-label="Accent">
          <button class="accent" data-accent="british" aria-pressed="true">British English</button>
          <button class="accent" data-accent="american" aria-pressed="false">American English</button>
          <button class="accent" data-accent="australian" aria-pressed="false">Australian English</button>
        </div>
        <button class="full" id="full"><span aria-hidden="true">▶</span>Play full audio</button>
        <div class="mode" id="mode">Full audio</div>
        <div class="transport"><button class="play" id="play" aria-label="Play"><span id="icon" aria-hidden="true">▶</span></button>
          <div class="timeline"><input class="seek" id="seek" type="range" min="0" max="100" step="0.01" value="0" aria-label="Playback position">
          <div class="times"><span id="elapsed">0:00</span><span id="duration">--:--</span></div></div>
        </div>
        <div class="toolbar">
          <label class="speed-label"><span>Speed</span><select id="speed" aria-label="Speed"><option value="0.75">0.75×</option><option value="0.9">0.9×</option><option value="1" selected>1×</option><option value="1.1">1.1×</option></select></label>
        </div>
        <p id="status" class="status" role="status" aria-live="polite" hidden></p>
        <audio id="audio" preload="metadata"></audio>
      </div>
      <div class="text-panel"><div class="text-head"><h3>Transcript</h3>
        <button class="toggle" id="toggle" aria-expanded="false" aria-controls="transcript"><span id="toggle-label">Show text</span><span class="switch" aria-hidden="true"><i></i></span></button>
      </div><div id="transcript" hidden></div></div>
    </section>`;
    host.append(shell);
    const $ = id => root.getElementById(id);
    const audio = $('audio');
    const hasAustralian = Object.hasOwn(lesson.audio, 'australian');
    root.querySelector('[data-accent="australian"]').hidden = !hasAustralian;
    root.querySelector('.accents').style.setProperty('--accent-count', hasAustralian ? 3 : 2);
    let accent = 'british', sentenceIndex = null, operation = 0, destroyed = false;
    let boundaryTimer = null, pendingSeek = null;
    const time = seconds => Number.isFinite(seconds) ? `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}` : '--:--';
    function status(message = '', error = false) {
      $('status').textContent = message;
      $('status').hidden = !message;
      $('status').classList.toggle('error', error);
    }
    function renderPlaying() {
      const playing = !audio.paused && !audio.ended;
      $('icon').textContent = playing ? 'Ⅱ' : '▶';
      $('play').setAttribute('aria-label', playing ? 'Pause' : 'Play');
    }
    function renderProgress() {
      $('elapsed').textContent = time(audio.currentTime);
      $('duration').textContent = time(audio.duration);
      $('seek').value = Number.isFinite(audio.duration) && audio.duration > 0 ? 100 * audio.currentTime / audio.duration : 0;
      $('seek').setAttribute('aria-valuetext', `${time(audio.currentTime)} / ${time(audio.duration)}`);
      const current = sentenceIndex === null ? lesson.audio[accent].segments.findIndex(s => audio.currentTime >= s.start && audio.currentTime < s.end) : sentenceIndex;
      root.querySelectorAll('.sentence').forEach((button, i) => {
        button.classList.toggle('current', i === current);
        if (i === current) button.setAttribute('aria-current', 'true');
        else button.removeAttribute('aria-current');
      });
    }
    function clearBoundary() { clearTimeout(boundaryTimer); boundaryTimer = null; }
    function pause() { operation++; clearBoundary(); audio.pause(); status(); renderPlaying(); }
    function boundaryCheck() {
      clearBoundary();
      if (destroyed || sentenceIndex === null || audio.paused || audio.seeking || pendingSeek !== null) return;
      const end = lesson.audio[accent].segments[sentenceIndex].end;
      const remaining = end - audio.currentTime;
      if (remaining <= 0.012) {
        pause(); audio.currentTime = end; renderProgress(); return;
      }
      boundaryTimer = setTimeout(boundaryCheck, Math.max(10, Math.min(100, remaining / audio.playbackRate * 1000)));
    }
    function seekTo(seconds) {
      if (audio.readyState >= 1) { pendingSeek = null; audio.currentTime = seconds; }
      else pendingSeek = seconds;
    }
    function select(index = null) {
      pause();
      sentenceIndex = index;
      $('mode').textContent = index === null ? 'Full audio' : `Sentence ${index + 1}`;
      seekTo(index === null ? 0 : lesson.audio[accent].segments[index].start);
      renderProgress();
    }
    function loadAccent() {
      pause();
      audio.src = lesson.audio[accent].full;
      pendingSeek = sentenceIndex === null ? 0 : lesson.audio[accent].segments[sentenceIndex].start;
      audio.load();
      audio.playbackRate = Number($('speed').value);
      renderProgress();
    }
    async function play() {
      if (activePlayer && activePlayer !== api) activePlayer.pause();
      activePlayer = api;
      const token = ++operation;
      status('Loading…');
      try {
        await audio.play();
        if (destroyed || token !== operation) return;
        status();
      } catch (error) {
        if (destroyed || token !== operation || error.name === 'AbortError') return;
        status('Audio unavailable.', true);
      }
      renderPlaying();
    }
    if (lesson.title) { $('title').textContent = lesson.title; $('title').hidden = false; }
    lesson.sentences.forEach((text, i) => {
      const button = document.createElement('button');
      button.className = 'sentence'; button.lang = 'en';
      button.setAttribute('aria-label', `Play sentence ${i + 1}: ${text}`);
      const number = document.createElement('span'); number.className = 'number'; number.textContent = String(i + 1).padStart(2, '0');
      const content = document.createElement('span'); content.textContent = text;
      const icon = document.createElement('span'); icon.className = 'sentence-icon'; icon.textContent = '▶'; icon.setAttribute('aria-hidden', 'true');
      button.append(number, content, icon);
      button.addEventListener('click', () => { select(i); play(); });
      $('transcript').append(button);
    });
    root.querySelectorAll('.accent').forEach(button => button.addEventListener('click', () => {
      if (accent === button.dataset.accent) return;
      accent = button.dataset.accent;
      root.querySelectorAll('.accent').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
      loadAccent();
    }));
    $('play').addEventListener('click', () => {
      if (audio.paused) {
        if (sentenceIndex !== null) {
          const segment = lesson.audio[accent].segments[sentenceIndex];
          if (audio.currentTime < segment.start || audio.currentTime >= segment.end - 0.02) seekTo(segment.start);
        } else if (audio.ended) seekTo(0);
        play();
      }
      else pause();
    });
    $('full').addEventListener('click', () => { select(); play(); });
    $('toggle').addEventListener('click', () => {
      const expanded = $('toggle').getAttribute('aria-expanded') !== 'true';
      $('toggle').setAttribute('aria-expanded', String(expanded));
      $('toggle-label').textContent = expanded ? 'Hide text' : 'Show text';
      $('transcript').hidden = !expanded;
    });
    $('speed').addEventListener('change', () => { audio.playbackRate = Number($('speed').value); });
    $('seek').addEventListener('input', () => {
      if (!Number.isFinite(audio.duration)) return;
      const target = Number($('seek').value) / 100 * audio.duration;
      if (sentenceIndex !== null) {
        const segment = lesson.audio[accent].segments[sentenceIndex];
        if (target < segment.start || target >= segment.end) {
          sentenceIndex = null; clearBoundary(); $('mode').textContent = 'Full audio';
        }
      }
      seekTo(target); renderProgress();
    });
    audio.addEventListener('loadedmetadata', () => {
      audio.playbackRate = Number($('speed').value);
      if (pendingSeek !== null) { const target = pendingSeek; pendingSeek = null; audio.currentTime = target; }
      renderProgress();
    });
    audio.addEventListener('timeupdate', () => { boundaryCheck(); renderProgress(); });
    audio.addEventListener('playing', boundaryCheck);
    audio.addEventListener('seeking', clearBoundary);
    audio.addEventListener('seeked', boundaryCheck);
    audio.addEventListener('ratechange', boundaryCheck);
    audio.addEventListener('play', renderPlaying); audio.addEventListener('pause', () => { clearBoundary(); renderPlaying(); });
    audio.addEventListener('ended', () => { renderPlaying(); renderProgress(); status(); });
    audio.addEventListener('error', () => { if (!destroyed) { status('Audio unavailable.', true); renderPlaying(); } });
    const api = {
      pause,
      destroy() {
        if (destroyed) return;
        destroyed = true; operation++; clearBoundary(); audio.pause();
        audio.removeAttribute('src'); audio.load(); shell.remove();
        if (activePlayer === api) activePlayer = null;
        instances.delete(host);
      }
    };
    instances.set(host, api);
    loadAccent();
    return api;
  }
  window.ListenEcho = Object.freeze({ mount, version: '2.0.0' });
})();

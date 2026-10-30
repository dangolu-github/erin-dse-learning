// Practice & Mock: Listen & Echo first, then practice by paper and part, then mock exams by set. Homework is not
// listed here: it is on its class page and in the home To do. Listen & Echo (teacher, 2026-10-29/30: 跟练, nothing
// to submit): the checked homework questions with their released sample answers, one fold per class; a fold loads
// its recordings (assets/listen-echo.js) when it is opened, and an answer without recordings yet shows its text.
(() => {
  const N = window.Erin, app = document.getElementById('app');
  const cards = (list) => `<div class="nd-cards">${list.map(N.taskCard).join('')}</div>`;
  const accents = ['british', 'american', 'australian'];
  // The player's colours follow the site's.
  const palette = '--le-ink:var(--ink);--le-muted:var(--muted);--le-accent:var(--accent);--le-surface:var(--surface);--le-border:var(--line);--le-soft:var(--accent-soft)';
  async function mountEcho(box, lesson) {
    const body = box.querySelector('[data-echo-body]'), message = box.querySelector('.nd-msg');
    if (accents.some((a) => !lesson.audio[a] || lesson.audio[a].missing)) {
      body.innerHTML = `<details class="nd-fold" data-echo-text><summary>Sample answer 示范答案</summary><div class="nd-fold-body"><p>${N.esc(lesson.sentences.join(' '))}</p></div></details><p class="nd-note">The recordings will be added soon. 录音稍后添加。</p>`;
      return;
    }
    body.innerHTML = '<div class="nd-progress"><i></i></div>';
    const fill = body.querySelector('.nd-progress i'), done = {};
    const progress = () => { fill.style.width = Math.round(accents.reduce((n, a) => n + (done[a] || 0), 0) / accents.length * 100) + '%'; };
    message.textContent = 'Loading… 正在加载'; message.className = 'nd-msg';
    try {
      const blobs = await Promise.all(accents.map((a) => N.loadMedia(lesson.audio[a].media, (f) => { done[a] = f; progress(); })));
      const audio = {};
      accents.forEach((a, i) => { audio[a] = { full: URL.createObjectURL(blobs[i]), segments: lesson.audio[a].segments }; });
      body.innerHTML = '';
      window.ListenEcho.mount(body, { sentences: lesson.sentences, audio });
      message.textContent = '';
    } catch (error) {
      body.innerHTML = '<div class="nd-actions"><button class="nd-btn quiet" type="button" data-retry>Try again<small>重新加载</small></button></div>';
      message.textContent = (error && error.message) || 'The recordings could not be loaded.'; message.className = 'nd-msg error';
      body.querySelector('[data-retry]').addEventListener('click', () => mountEcho(box, lesson));
    }
  }
  N.A.ready.then(async () => {
    try {
      const data = await N.A.request('getCatalogue', {});
      N.previewNote(data.env);
      const of = (group) => data.tasks.filter((t) => t.group === group);
      const practice = of('practice'), mock = of('mock');
      const parts = data.parts || {};
      // Practice: one block per paper, one sub-heading per part; tasks without a part come last in their paper.
      const byPaper = Object.keys(data.papers).map((paper) => {
        const list = practice.filter((t) => t.paper === paper);
        if (!list.length) return '';
        const known = (parts[paper] || []).map(([id]) => id);
        const groups = (parts[paper] || []).map(([id, label]) => [label, list.filter((t) => t.part === id)])
          .concat([['Other · 其他', list.filter((t) => known.indexOf(t.part) < 0)]])
          .filter(([, l]) => l.length);
        const inner = groups.map(([label, l]) => (groups.length > 1 || label !== 'Other · 其他' ? `<h4 class="nd-part">${N.esc(label)}</h4>` : '') + cards(l)).join('');
        return `<details class="nd-paper" open><summary><h3 class="nd-sub">${N.esc(data.papers[paper])}</h3><span class="nd-paper-count">${list.length}</span></summary>${inner}</details>`;
      }).join('');
      // Mocks: one block per set, papers in exam order.
      const order = (t) => ['P1', 'P2', 'P3', 'P4'].indexOf(t.paper) * 10 + ['', 'A', 'B', 'B1', 'B2'].indexOf(t.part);
      const sets = (data.mockSets || []).map((m) => [m, mock.filter((t) => t.mockSet === m.id).sort((a, b) => order(a) - order(b))])
        .concat([[{ id: '', label: 'Other mocks · 其他模考', note: '' }, mock.filter((t) => !(data.mockSets || []).some((m) => m.id === t.mockSet))]])
        .filter(([, l]) => l.length);
      // One set at a time: the next set opens by itself when the one before is finished.
      const state = (m) => m.status === 'finished' ? `<p class="nd-note">Finished 已完成 ✓</p>`
        : m.status === 'open' ? `<p class="nd-note">${m.done} / ${m.total} done 已完成 (Part B1 or B2: do one 二选一)</p>`
        : m.status === 'locked' ? `<p class="nd-note">${m.after ? `Opens when you finish ${N.esc(m.after)}. 完成上一套后自动解锁。` : 'Not open yet. 暂未开放。'}</p>` : '';
      const mocks = sets.map(([m, l]) => `<details class="nd-paper"${m.status === 'open' ? ' open' : ''}><summary><h3 class="nd-sub">${N.esc(m.label)}${m.status === 'locked' ? ' 🔒' : m.status === 'finished' ? ' ✓' : ''}</h3><span class="nd-paper-count">${l.length}</span></summary>${state(m)}${m.note ? `<p class="nd-note">${N.esc(m.note)}</p>` : ''}${cards(l)}</details>`).join('');
      // Listen & Echo: one closed fold per class, the latest class first.
      const lessons = data.echo || [], groups = [];
      lessons.forEach((e) => { let g = groups.find((x) => x.id === e.classId); if (!g) groups.push(g = { id: e.classId, label: e.classLabel, list: [] }); g.list.push(e); });
      groups.sort((a, b) => (a.id < b.id ? 1 : -1));
      const echo = groups.map((g) => `<details class="nd-paper" data-echo-group="${N.esc(g.id)}"><summary><h3 class="nd-sub">${N.esc(g.label)}</h3><span class="nd-paper-count">${g.list.length}</span></summary>${
        g.list.map((e) => `<div class="nd-echo" data-echo="${N.esc(e.id)}"><h4 class="nd-sub">${N.esc(e.title)}</h4><div data-echo-body style="${palette}"></div><p class="nd-msg" role="status"></p></div>`).join('')}</details>`).join('');
      // The how-to line follows the recordings: read aloud while there are none, listen and repeat once they are in.
      const voiced = lessons.filter((e) => accents.every((a) => e.audio[a] && !e.audio[a].missing)).length;
      const echoHow = '这里是你做过的作业题和示范答案，不用提交。' + (!voiced ? '打开示范答案，大声读出来。'
        : voiced === lessons.length ? '听一句，跟读一句。' : '有录音的听一句、跟读一句；还没有录音的，打开示范答案大声读出来。');
      // A section shows only when it has something; with nothing at all, the two placeholders stay.
      const empty = !echo && !byPaper && !mocks;
      app.innerHTML = `
        <p class="nd-kicker">Erin · DSE Oral</p>
        <h1>Practice &amp; Mock</h1>
        ${byPaper || mocks ? '<p class="nd-lead">所有题目都在网页上完成：打字作答、听录音、录音或上传音频。答案会自动保存，换手机、平板或电脑可以接着做。</p>' : ''}
        ${echo ? `<section class="nd-section"><h2>Listen &amp; Echo <small>示范答案跟读</small></h2><p class="nd-note">${echoHow}</p>${echo}</section>` : ''}
        ${byPaper || empty ? `<section class="nd-section"><h2>Practice <small>分卷分部分练习</small></h2>${byPaper || '<p class="nd-empty">Practice sets will appear here. 练习题稍后发布。</p>'}</section>` : ''}
        ${mocks || empty ? `<section class="nd-section"><h2>Mock exams <small>模考</small></h2>${mocks || '<p class="nd-empty">Mock papers will appear here. 模考卷稍后发布。</p>'}</section>` : ''}`;
      app.querySelectorAll('[data-echo-group]').forEach((fold) => fold.addEventListener('toggle', () => {
        if (!fold.open || fold.dataset.loaded) return;
        fold.dataset.loaded = '1';
        fold.querySelectorAll('[data-echo]').forEach((box) => mountEcho(box, lessons.find((e) => e.id === box.dataset.echo)));
      }));
    } catch (error) { N.fail(app, error); }
  });
})();

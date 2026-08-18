/* ===================================================================
 * RickOS core.js — renders the payload JSON into every section and
 * wires up all interactions. Reads #report-data on DOMContentLoaded.
 * =================================================================== */

(function () {
  'use strict';

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }
  function fileDomId(path) {
    return 'f-' + String(path || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  function loadPayload() {
    var node = document.getElementById('report-data');
    if (!node) return null;
    try { return JSON.parse(node.textContent); }
    catch (e) { console.error('RickOS: payload JSON parse failed', e); return null; }
  }

  // ------------------------- Chrome -------------------------
  function initChrome(prMeta) {
    var meta = $$('[data-pr-meta]');
    if (prMeta) {
      var bits = [];
      if (prMeta.number) bits.push('PR #' + prMeta.number);
      if (prMeta.branch) bits.push(prMeta.branch);
      if (prMeta.base) bits.push('→ ' + prMeta.base);
      var text = bits.join(' · ');
      meta.forEach(function (m) { m.textContent = text || ' '; });
    }

    $$('[data-crt-toggle]').forEach(function (btn) {
      var on = btn.getAttribute('data-label-on') || 'CRT: on';
      var off = btn.getAttribute('data-label-off') || 'CRT: off';
      var scan = document.getElementById('rk-scanlines');
      btn.addEventListener('click', function () {
        var showing = !scan || scan.style.display !== 'none';
        if (scan) scan.style.display = showing ? 'none' : '';
        btn.textContent = showing ? off : on;
      });
    });

    $$('[data-panic-toggle]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var orig = btn.textContent;
        btn.textContent = 'ARMED';
        setTimeout(function () { btn.textContent = orig; }, 1400);
      });
    });
  }

  // ------------------------- Hero: banner + boot log -------------------------
  function initHero() {
    var pre = document.getElementById('rk-boot-log');
    var hero = document.getElementById('rk-hero');
    var tailText = document.getElementById('rk-hero-tail-text');
    if (!pre || !hero) return;

    var full = pre.textContent;
    var lines = full.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
    pre.innerHTML = '';
    pre.hidden = false;
    lines.forEach(function (line, i) {
      var d = el('div', /⚠/.test(line) ? 'is-warn' : '', line);
      d.style.animationDelay = (i * 0.09).toFixed(2) + 's';
      pre.appendChild(d);
    });
    if (tailText) tailText.textContent = lines[lines.length - 1] || '';

    function setCollapsed(collapsed) {
      hero.classList.toggle('is-collapsed', collapsed);
    }
    var collapseBtn = document.getElementById('rk-hero-collapse-btn');
    var expandBtn = document.getElementById('rk-hero-expand-btn');
    if (collapseBtn) collapseBtn.addEventListener('click', function () { setCollapsed(true); });
    if (expandBtn) expandBtn.addEventListener('click', function () { setCollapsed(false); });
  }

  // ------------------------- Summary -------------------------
  function initSummary(payload) {
    var meta = payload.pr_meta || {};
    var idLine = document.getElementById('rk-summary-id');
    if (idLine) {
      var bits = [];
      if (meta.number) bits.push('Pull request #' + meta.number);
      bits.push('open');
      if (meta.commits) bits.push(meta.commits + ' commit' + (meta.commits === 1 ? '' : 's'));
      idLine.textContent = bits.join(' · ');
    }
    var title = document.getElementById('rk-summary-title');
    if (title) title.textContent = meta.title || payload.pr_slug || 'Untitled change';

    var tags = document.getElementById('rk-summary-tags');
    if (tags) {
      tags.innerHTML = '';
      if (meta.author) {
        var authorSpan = el('span');
        authorSpan.appendChild(document.createTextNode('@' + meta.author + ' → '));
        var b = el('strong', null, meta.base || 'main');
        authorSpan.appendChild(b);
        tags.appendChild(authorSpan);
      }
      if (meta.branch) tags.appendChild(el('span', null, meta.branch));
      if (meta.opened) tags.appendChild(el('span', null, 'opened ' + meta.opened));
    }

    var stats = document.getElementById('rk-stats');
    if (stats && payload.stats) {
      stats.innerHTML = '';
      var tiles = [
        { label: 'Files', value: payload.stats.files, tone: '' },
        { label: 'Added', value: '+' + payload.stats.added, tone: 'is-ok' },
        { label: 'Removed', value: '−' + payload.stats.removed, tone: 'is-bad' }
      ];
      tiles.forEach(function (t) {
        var tile = el('div', 'rk-stat');
        tile.appendChild(el('div', 'rk-stat__value ' + t.tone, String(t.value)));
        tile.appendChild(el('div', 'rk-stat__label', t.label));
        stats.appendChild(tile);
      });
    }

    var lookhere = document.getElementById('rk-lookhere');
    var lookhereCol = lookhere ? lookhere.closest('.rk-summary__lookhere-col') : null;
    if (lookhere) {
      lookhere.innerHTML = '';
      var items = payload.look_here || [];
      if (!items.length && lookhereCol) { lookhereCol.hidden = true; }
      else {
        items.slice(0, 3).forEach(function (it) {
          var a = el('a');
          a.href = '#' + fileDomId(it.file);
          if (it.tone === 'bad' || it.tone === 'warn') a.classList.add('is-' + it.tone);
          a.appendChild(el('div', 'rk-lookhere__title', it.label || it.file || ''));
          if (it.note) a.appendChild(el('div', 'rk-lookhere__note', it.note));
          lookhere.appendChild(a);
        });
      }
    }
  }

  // ------------------------- Risk -------------------------
  function initRisk(risk) {
    var heading = document.getElementById('rk-risk-heading');
    var list = document.getElementById('rk-risk-list');
    if (!risk || !list) return;
    if (heading) {
      heading.textContent = '';
      heading.appendChild(document.createTextNode('Risk breakdown — '));
      var span = el('span', null, 'composite ' + risk.composite + '/100, ' + (risk.label || ''));
      span.style.color = 'var(--rk-text)';
      heading.appendChild(span);
    }
    (risk.items || []).forEach(function (r) {
      var tone = r.tone === 'ok' || r.tone === 'bad' ? r.tone : (r.tone === 'warn' ? 'warn' : 'warn');
      var row = el('div', 'rk-risk-row');
      row.appendChild(el('div', 'rk-risk-row__name', r.name));
      var bar = el('div', 'rk-risk-bar');
      var fill = el('div', 'rk-risk-bar__fill is-' + tone);
      fill.style.width = Math.max(0, Math.min(100, r.pct || 0)) + '%';
      bar.appendChild(fill);
      row.appendChild(bar);
      var note = el('div', 'rk-risk-row__note');
      var score = el('span', 'rk-risk-row__score is-' + tone, r.score || '');
      note.appendChild(score);
      note.appendChild(document.createTextNode(' ' + (r.note || '')));
      row.appendChild(note);
      list.appendChild(row);
    });
  }

  // ------------------------- Shape (treemap) -------------------------
  function initShape(shape, jumpToFile) {
    var section = document.getElementById('s-shape');
    if (!shape || !shape.files || !shape.files.length) {
      if (section) section.hidden = true;
      $$('[data-nav="shape"]').forEach(function (a) { a.remove(); });
      return;
    }
    section.hidden = false;
    var totalChanged = shape.files.reduce(function (s, f) { return s + (f.adds || 0) + (f.dels || 0); }, 0);
    var sub = document.getElementById('rk-shape-sub');
    if (sub) sub.textContent = totalChanged + ' changed lines across ' + shape.files.length + ' file' + (shape.files.length === 1 ? '' : 's');
    var note = document.getElementById('rk-shape-note');
    if (note) note.textContent = shape.note || '';

    var canvas = document.getElementById('rk-treemap-canvas');
    if (canvas && typeof window.RickChartTreemap === 'function') {
      try { window.RickChartTreemap(canvas, { files: shape.files }, jumpToFile); }
      catch (e) {
        console.error('RickOS: treemap render failed', e);
        canvas.innerHTML = '<pre style="color:#ff5577">ERROR: treemap renderer crashed.</pre>';
      }
    }
  }

  // ------------------------- Flow (existing chart bootstrap) -------------------------
  function initFlow(chart) {
    var canvas = document.getElementById('chart-canvas');
    if (!canvas || !chart || !chart.type) return;
    var fn = null;
    switch (chart.type) {
      case 'force': fn = window.RickChartForce; break;
      case 'state': fn = window.RickChartState; break;
      case 'sequence': fn = window.RickChartSequence; break;
      case 'sankey': fn = window.RickChartSankey; break;
    }
    if (typeof fn !== 'function') {
      canvas.innerHTML = '<pre style="color:#ff5577">ERROR: chart type "' + chart.type + '" not recognized.</pre>';
      return;
    }
    try { fn(canvas, chart.data || {}); }
    catch (e) {
      console.error('RickOS: chart renderer failed', e);
      canvas.innerHTML = '<pre style="color:#ff5577">ERROR: renderer crashed. ' + (e && e.message || e) + '</pre>';
    }
  }

  // ------------------------- Files: annotated diff viewer -------------------------
  function renderFileLines(container, lines, truncated) {
    container.innerHTML = '';
    (lines || []).forEach(function (ln) {
      var kind = ln.sign === '+' ? 'is-add' : ln.sign === '-' ? 'is-del' : 'is-ctx';
      var row = el('div', 'rk-file__line ' + kind);
      row.appendChild(el('span', 'rk-file__line-num', String(ln.num)));
      row.appendChild(el('span', 'rk-file__line-sign', ln.sign === ' ' ? '' : ln.sign));
      var text = el('span', 'rk-file__line-text', ln.text);
      row.appendChild(text);
      container.appendChild(row);
    });
    if (truncated) container.appendChild(el('div', 'rk-file__truncated', '… ' + truncated + ' more lines omitted — see the full diff in your repo.'));
  }

  function initFiles(files) {
    var wrap = document.getElementById('rk-files');
    var toggleAllBtn = document.getElementById('rk-files-toggle-all');
    if (!wrap || !Array.isArray(files)) return;

    var cards = {};

    files.forEach(function (f) {
      var card = el('div', 'rk-file');
      card.id = f.id || fileDomId(f.path);

      var head = document.createElement('button');
      head.type = 'button';
      head.className = 'rk-file__head';
      var caret = el('span', 'rk-file__caret', f.open ? '▾' : '▸');
      head.appendChild(caret);
      head.appendChild(el('span', 'rk-file__path', f.path));
      var badge = el('span', 'rk-file__badge' + (f.status === 'NEW' ? ' is-new' : ''), f.status);
      head.appendChild(badge);
      head.appendChild(el('span', 'rk-file__adds', '+' + f.adds));
      head.appendChild(el('span', 'rk-file__dels', '−' + f.dels));
      card.appendChild(head);

      if (f.note) card.appendChild(el('div', 'rk-file__note', f.note));

      // Rick's flag goes ABOVE the diff so it isn't buried under hundreds of
      // code lines, and stays visible even when the file card is collapsed —
      // it's the most important thing about a flagged file.
      if (f.callout) {
        var calloutEl = el('div', 'rk-file__callout');
        var tag = el('span', 'rk-file__callout-tag', 'Rick flags this · ');
        calloutEl.appendChild(tag);
        calloutEl.appendChild(document.createTextNode(f.callout));
        card.appendChild(calloutEl);
      }

      var linesWrap = el('div', 'rk-file__lines');
      linesWrap.hidden = !f.open;
      renderFileLines(linesWrap, f.lines, f.truncated);
      card.appendChild(linesWrap);

      function setOpen(open) {
        f.open = open;
        caret.textContent = open ? '▾' : '▸';
        linesWrap.hidden = !open;
      }
      head.addEventListener('click', function () { setOpen(!f.open); });
      cards[f.path] = { setOpen: setOpen, card: card };

      wrap.appendChild(card);
    });

    if (toggleAllBtn) {
      toggleAllBtn.addEventListener('click', function () {
        var allOpen = files.every(function (f) { return f.open; });
        Object.keys(cards).forEach(function (p) { cards[p].setOpen(!allOpen); });
        toggleAllBtn.textContent = allOpen ? 'Expand all' : 'Collapse all';
      });
      toggleAllBtn.textContent = files.length && files.every(function (f) { return f.open; }) ? 'Collapse all' : 'Expand all';
    }

    return function jumpToFile(path) {
      var entry = cards[path];
      if (!entry) return;
      entry.setOpen(true);
      setTimeout(function () {
        var y = entry.card.getBoundingClientRect().top + window.pageYOffset - 60;
        window.scrollTo({ top: y, behavior: 'smooth' });
      }, 40);
    };
  }

  // ------------------------- Cross-section evidence links -------------------------
  function initEvidenceLinks(jumpToFile) {
    document.addEventListener('click', function (e) {
      var a = e.target.closest('a[href^="#f-"]');
      if (!a) return;
      var id = a.getAttribute('href').slice(1);
      var target = document.getElementById(id);
      if (!target) return;
      e.preventDefault();
      var path = target.querySelector('.rk-file__path');
      if (jumpToFile && path) jumpToFile(path.textContent);
      else target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  // ------------------------- Quiz -------------------------
  var RANKS = [
    { min: 0,  name: 'Cronenberg-Grade Intellect',      comment: "L-l-listen, I've seen turnips with more curiosity than you." },
    { min: 20, name: 'Morty-Tier Comprehension',        comment: 'Which is to say, barely functional. But congrats, you tried.' },
    { min: 40, name: 'Jerry-Level Understanding',       comment: "You'd survive maybe *urp* six minutes in Dimension C-42." },
    { min: 60, name: 'Summer-Grade Awareness',          comment: 'Not embarrassing. Not impressive either. Fine.' },
    { min: 80, name: 'Beth-Tier Cognition',             comment: 'Alright, you actually followed along. Weird flex, but okay.' },
    { min: 100, name: 'Rick-Adjacent (Impossible)',     comment: "You cheated or you're me. Either way, get out of my dimension." }
  ];

  // Fisher-Yates on the option indices, returning a copy of the quiz item
  // with options + feedback permuted in lockstep and `correct` re-anchored.
  // Runs on every page load, so consecutive readers never see the same
  // A/B/C/D arrangement — pattern-matching by position is impossible.
  function shuffleQuizItem(q) {
    var opts = Array.isArray(q.options) ? q.options : [];
    var fb = Array.isArray(q.feedback) ? q.feedback : [];
    var idx = opts.map(function (_, i) { return i; });
    for (var i = idx.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = idx[i]; idx[i] = idx[j]; idx[j] = t;
    }
    return {
      question: q.question,
      options: idx.map(function (i) { return opts[i]; }),
      feedback: idx.map(function (i) { return fb[i]; }),
      correct: idx.indexOf(Number(q.correct)),
      file: q.file,
      where: q.where
    };
  }

  function initQuiz(quiz) {
    var wrap = $('#quiz-container');
    if (!wrap || !Array.isArray(quiz)) return;

    var answered = 0, correct = 0;

    quiz.forEach(function (rawQ, qi) {
      var q = shuffleQuizItem(rawQ);
      var qEl = el('div', 'quiz-question');

      var prompt = el('div', 'q-prompt');
      prompt.appendChild(el('span', 'q-number', 'Q' + (qi + 1)));
      prompt.appendChild(el('div', null, q.question || ''));
      qEl.appendChild(prompt);

      var opts = el('div', 'quiz-options');
      (q.options || []).forEach(function (opt, oi) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'quiz-option';
        var cleanOpt = String(opt).replace(/^\s*[A-Da-d]\s*[.):-]\s+/, '');
        b.textContent = String.fromCharCode(65 + oi) + '.  ' + cleanOpt;
        b.addEventListener('click', function () {
          if (qEl.dataset.answered) return;
          qEl.dataset.answered = '1';
          var isCorrect = oi === Number(q.correct);
          $$('.quiz-option', opts).forEach(function (btn) { btn.disabled = true; });
          b.classList.add(isCorrect ? 'correct' : 'wrong');
          if (!isCorrect) {
            var correctBtn = $$('.quiz-option', opts)[Number(q.correct)];
            if (correctBtn) correctBtn.classList.add('correct');
          }
          var fb = el('div', 'quiz-feedback' + (isCorrect ? '' : ' wrong'), (q.feedback && q.feedback[oi]) || (isCorrect ? 'Correct. Somehow.' : 'Wrong. Obviously.'));
          qEl.appendChild(fb);

          answered += 1;
          if (isCorrect) correct += 1;
          if (answered === quiz.length) renderResult(correct, quiz.length);
        });
        opts.appendChild(b);
      });
      qEl.appendChild(opts);

      if (q.file) {
        var ev = el('div', 'quiz-evidence');
        ev.appendChild(document.createTextNode('evidence: '));
        var a = document.createElement('a');
        a.href = '#' + fileDomId(q.file);
        a.textContent = q.where || q.file;
        ev.appendChild(a);
        qEl.appendChild(ev);
      }

      wrap.appendChild(qEl);
    });
  }

  function renderResult(correct, total) {
    var pct = Math.round((correct / total) * 100);
    var rank = RANKS[0];
    for (var i = 0; i < RANKS.length; i++) if (pct >= RANKS[i].min) rank = RANKS[i];

    var box = $('#quiz-result');
    if (!box) return;
    box.hidden = false;
    box.innerHTML = '';
    box.appendChild(el('div', 'score', correct + ' / ' + total + '  //  ' + pct + '%'));
    box.appendChild(el('div', 'rank', 'RANK: ' + rank.name));
    box.appendChild(el('div', 'rank-comment', rank.comment));
  }

  // ------------------------- Verdict -------------------------
  function initConcerns(concerns) {
    var wrap = document.getElementById('rk-concerns');
    if (!wrap) return;
    (concerns || []).forEach(function (c) {
      var row = el('div', 'rk-concern');
      var sevClass = c.severity === 'HIGH' ? 'is-high' : c.severity === 'MEDIUM' ? 'is-medium' : 'is-low';
      row.appendChild(el('span', 'rk-concern__sev ' + sevClass, c.severity));
      var text = el('div', 'rk-concern__text', c.text + ' ');
      if (c.file) {
        var a = document.createElement('a');
        a.href = '#' + fileDomId(c.file);
        a.textContent = c.where || c.file;
        text.appendChild(a);
      }
      row.appendChild(text);
      wrap.appendChild(row);
    });
  }

  var VERDICT_LINES = {
    approve: 'Approved with open concerns still on the board. Bold. I respect the chaos.',
    changes: 'Good. Fix them before it is 3am and nobody knows why the alarms are going off.',
    comment: 'A comment. The review equivalent of leaving the room slowly.'
  };

  function initVerdict() {
    var buttons = $$('.rk-verdict-btn');
    var line = document.getElementById('rk-verdict-line');
    buttons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        buttons.forEach(function (b) { b.classList.remove('is-active'); });
        btn.classList.add('is-active');
        if (line) {
          line.hidden = false;
          line.textContent = VERDICT_LINES[btn.dataset.verdict] || '';
        }
      });
    });
  }

  // ------------------------- Syntax highlighting -------------------------
  function initHighlight() {
    if (typeof window.hljs !== 'object' || typeof window.hljs.highlightElement !== 'function') return;
    $$('pre code').forEach(function (elm) {
      try { window.hljs.highlightElement(elm); } catch (e) {}
    });
    $$('.rk-section-body pre').forEach(function (pre) {
      if (pre.querySelector('code')) return;
      var code = document.createElement('code');
      code.textContent = pre.textContent;
      pre.textContent = '';
      pre.appendChild(code);
      try { window.hljs.highlightElement(code); } catch (e) {}
    });
  }

  // ------------------------- Before/After toggle -------------------------
  function initToggles() {
    $$('[data-toggle]').forEach(function (wrap) {
      var panes = $$('.toggle-pane', wrap);
      var tabs = $$('.toggle-tab', wrap);
      if (!tabs.length && panes.length) {
        var tabRow = el('div', 'toggle-tabs');
        panes.forEach(function (p, i) {
          var t = document.createElement('button');
          t.type = 'button';
          t.className = 'toggle-tab' + (i === 0 ? ' active' : '');
          t.textContent = p.getAttribute('data-label') || ('View ' + (i + 1));
          t.dataset.index = i;
          tabRow.appendChild(t);
        });
        wrap.insertBefore(tabRow, wrap.firstChild);
        tabs = $$('.toggle-tab', wrap);
      }
      panes.forEach(function (p, i) { p.classList.toggle('active', i === 0); });
      tabs.forEach(function (t) {
        t.addEventListener('click', function () {
          var idx = Number(t.dataset.index || tabs.indexOf(t));
          tabs.forEach(function (x) { x.classList.remove('active'); });
          panes.forEach(function (p, pi) { p.classList.toggle('active', pi === idx); });
          t.classList.add('active');
        });
      });
    });
  }

  // ------------------------- Boot -------------------------
  document.addEventListener('DOMContentLoaded', function () {
    var payload = loadPayload() || {};

    initChrome(payload.pr_meta);
    initHero();
    initSummary(payload);
    initRisk(payload.risk);

    var jumpToFile = initFiles(payload.files || []);
    initShape(payload.shape, jumpToFile);
    initFlow(payload.chart);
    initEvidenceLinks(jumpToFile);

    initQuiz(payload.quiz || []);
    initConcerns(payload.concerns || []);
    initVerdict();

    initToggles();
    initHighlight();
  });
})();

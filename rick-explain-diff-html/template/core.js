/* ===================================================================
 * RickOS core.js — quiz engine, gauge animation, Before/After toggles,
 * chart bootstrap. Reads #report-data (JSON) on DOMContentLoaded.
 * =================================================================== */

(function () {
  'use strict';

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

  function loadPayload() {
    var node = document.getElementById('report-data');
    if (!node) return null;
    try {
      return JSON.parse(node.textContent);
    } catch (e) {
      console.error('RickOS: payload JSON parse failed', e);
      return null;
    }
  }

  // ------------------------- Gauge -------------------------
  function initGauge(risk) {
    if (!risk) return;
    var val = Math.max(0, Math.min(100, Number(risk.value) || 0));
    var lbl = risk.label || '--';

    // 1) analog dial (SVG): rotate .dial-needle
    var needle = document.querySelector('.gauge-dial .dial-needle');
    if (needle) {
      // -90deg = 0, +90deg = 100
      var deg = -90 + (val / 100) * 180;
      needle.setAttribute('transform', 'rotate(' + deg + ' 100 100)');
    }
    // 2) LCD bar: width % on .lcd-fill
    var fill = document.querySelector('.gauge-lcd .lcd-fill');
    if (fill) fill.style.width = val + '%';
    var lcdText = document.querySelector('.gauge-lcd .lcd-value');
    if (lcdText) lcdText.textContent = val;

    // 3) portal-fluid tube: fill height
    var tubeFill = document.querySelector('.gauge-tube .tube-fill');
    if (tubeFill) tubeFill.style.height = val + '%';

    // 4) geiger needle: rotate
    var gNeedle = document.querySelector('.gauge-geiger .geiger-needle');
    if (gNeedle) {
      var gDeg = -60 + (val / 100) * 120;
      gNeedle.setAttribute('transform', 'rotate(' + gDeg + ' 100 130)');
    }

    var labelEl = document.getElementById('gauge-label');
    if (labelEl) labelEl.textContent = val + '%  //  ' + lbl;
  }

  // ------------------------- Before/After toggle -------------------------
  function initToggles() {
    $$('[data-toggle]').forEach(function (wrap) {
      var panes = $$('.toggle-pane', wrap);
      var tabs = $$('.toggle-tab', wrap);
      if (!tabs.length && panes.length) {
        // auto-generate tabs from data-label on panes
        var tabRow = document.createElement('div');
        tabRow.className = 'toggle-tabs';
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

  // ------------------------- Chart bootstrap -------------------------
  function initChart(chart) {
    if (!chart || !chart.type) return;
    var canvas = document.getElementById('chart-canvas');
    if (!canvas) return;

    var fn = null;
    switch (chart.type) {
      case 'force': fn = window.RickChartForce; break;
      case 'state': fn = window.RickChartState; break;
      case 'sequence': fn = window.RickChartSequence; break;
      case 'sankey': fn = window.RickChartSankey; break;
    }
    if (typeof fn !== 'function') {
      canvas.innerHTML = '<pre style="color:#ff5577">ERROR: chart type "' + chart.type + '" not recognized. Did you eat crayons for breakfast?</pre>';
      return;
    }
    try {
      fn(canvas, chart.data || {});
    } catch (e) {
      console.error('RickOS: chart renderer failed', e);
      canvas.innerHTML = '<pre style="color:#ff5577">ERROR: renderer crashed. ' + (e && e.message || e) + '</pre>';
    }

    var reset = document.querySelector('[data-chart-action="reset"]');
    if (reset && chart.type === 'force') {
      reset.addEventListener('click', function () {
        canvas.innerHTML = '';
        try { fn(canvas, chart.data || {}); } catch (e) {}
      });
    }
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

  function initQuiz(quiz) {
    var wrap = $('#quiz-container');
    if (!wrap || !Array.isArray(quiz)) return;

    var answered = 0;
    var correct = 0;

    quiz.forEach(function (q, qi) {
      var qEl = document.createElement('div');
      qEl.className = 'quiz-question';

      var prompt = document.createElement('p');
      prompt.className = 'q-prompt';
      prompt.innerHTML = '<span class="q-number">Q' + (qi + 1) + '.</span>' + escapeHtml(q.question || '');
      qEl.appendChild(prompt);

      var opts = document.createElement('div');
      opts.className = 'quiz-options';
      (q.options || []).forEach(function (opt, oi) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'quiz-option';
        // Strip any accidental "A. " / "B) " / "c: " prefix so we don't double up.
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
          var fb = document.createElement('div');
          fb.className = 'quiz-feedback';
          fb.textContent = (q.feedback && q.feedback[oi]) || (isCorrect ? 'Correct. Somehow.' : 'Wrong. Obviously.');
          qEl.appendChild(fb);

          answered += 1;
          if (isCorrect) correct += 1;
          if (answered === quiz.length) renderResult(correct, quiz.length);
        });
        opts.appendChild(b);
      });
      qEl.appendChild(opts);
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
    box.innerHTML =
      '<div class="score">' + correct + ' / ' + total + '  //  ' + pct + '%</div>' +
      '<div class="rank">RANK: ' + rank.name + '</div>' +
      '<div class="rank-comment">' + rank.comment + '</div>';
  }

  // ------------------------- Boot log typewriter -------------------------
  function initBootLog() {
    var pre = document.getElementById('boot-log-lines');
    if (!pre) return;
    var full = pre.textContent;
    var lines = full.split('\n').filter(function (l) { return l.length > 0; });
    pre.textContent = '';
    var i = 0;
    function step() {
      if (i >= lines.length) return;
      pre.textContent += lines[i] + '\n';
      i += 1;
      setTimeout(step, 180 + Math.random() * 160);
    }
    step();
  }

  // ------------------------- Utils -------------------------
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ------------------------- Syntax highlighting -------------------------
  function initHighlight() {
    if (typeof window.hljs !== 'object' || typeof window.hljs.highlightElement !== 'function') return;
    // Highlight every <pre><code> block AND bare <pre> that looks like code (heuristic).
    $$('pre code').forEach(function (el) {
      try { window.hljs.highlightElement(el); } catch (e) {}
    });
    // For bare <pre> blocks (no inner <code>), auto-detect and wrap.
    $$('pre').forEach(function (pre) {
      if (pre.querySelector('code')) return;
      // Skip banner and boot-log
      if (pre.classList.contains('rick-banner') || pre.classList.contains('boot-log-inline') || pre.id === 'boot-log-lines') return;
      var code = document.createElement('code');
      code.textContent = pre.textContent;
      pre.textContent = '';
      pre.appendChild(code);
      try { window.hljs.highlightElement(code); } catch (e) {}
    });
  }

  // ------------------------- Boot -------------------------
  document.addEventListener('DOMContentLoaded', function () {
    var data = loadPayload() || {};
    initBootLog();
    initGauge(data.risk);
    initToggles();
    initChart(data.chart);
    initQuiz(data.quiz || []);
    initHighlight();

    // Self-destruct button easter egg
    var sd = document.querySelector('[data-window-control="self-destruct"]');
    if (sd) {
      sd.addEventListener('click', function () {
        document.body.style.transition = 'opacity 700ms';
        document.body.style.opacity = '0';
        setTimeout(function () {
          document.body.innerHTML =
            '<pre style="color:#ff5577;padding:40px;font-family:monospace;font-size:14px;">' +
            '   SELF-DESTRUCT SEQUENCE ABORTED.\n' +
            '   Rick disabled this button 40 years ago.\n' +
            '   Try harder, Morty.\n' +
            '</pre>';
          document.body.style.opacity = '1';
        }, 800);
      });
    }
  });
})();

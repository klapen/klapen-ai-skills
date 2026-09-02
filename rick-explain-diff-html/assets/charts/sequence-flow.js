/* Vertical sequence / call flow.
 * Payload shape:
 *   { actors: ["client","server","db"],
 *     messages: [{from,to,label,side:"before"|"after"|undefined}] }
 *
 * `from` and `to` should be actor name strings (looked up via indexOf).
 * Integer indices are also accepted defensively — if you pass a number,
 * it's used directly as the actor index. Any message whose endpoint can
 * be neither resolved gets a visible warning banner drawn above the
 * lifelines, so silent-drops are impossible to miss.
 *
 * Labels are wrapped defensively: long labels break onto multiple lines to
 * fit within the horizontal budget of their lane; a single mega-word that
 * still won't fit is truncated with an ellipsis, and the full text is
 * always available via a native SVG <title> tooltip on hover.
 * Self-messages (from == to) get a wider text budget and render an inline
 * "loop" arrow to the right of the actor's lifeline.
 */
window.RickChartSequence = function (container, data) {
  container.innerHTML = '';
  var width = container.clientWidth || 700;
  var actors = data.actors || [];
  var messages = data.messages || [];
  var cols = actors.length;
  var colX = actors.map(function (_, i) {
    return 60 + (i + 0.5) * ((width - 120) / Math.max(1, cols));
  });

  function resolveActor(ref) {
    if (typeof ref === 'number' && ref >= 0 && ref < actors.length) return ref;
    if (typeof ref === 'string') return actors.indexOf(ref);
    return -1;
  }

  // Estimate the char budget for a given horizontal pixel budget at font-size 11.
  // Proportional font, so ~6.5px/char is a safe average.
  var CHAR_PX = 6.5;
  var LINE_HEIGHT = 14;
  var MSG_PAD = 14; // gap between messages
  var MIN_LANE_CHARS = 12;
  var SELF_LANE_PX = 260;

  function wrap(text, maxChars) {
    if (!text) return [''];
    if (text.length <= maxChars) return [text];
    var parts = text.split(/(\s+)/); // preserve whitespace so we can rebuild
    var lines = [];
    var current = '';
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if ((current + p).replace(/\s+$/, '').length > maxChars && current.replace(/\s+$/, '').length > 0) {
        lines.push(current.replace(/\s+$/, ''));
        current = p.replace(/^\s+/, '');
      } else {
        current += p;
      }
    }
    if (current.replace(/\s+$/, '').length) lines.push(current.replace(/\s+$/, ''));
    // Hard-truncate single mega-tokens that still overflow.
    return lines.map(function (l) {
      if (l.length > maxChars) return l.slice(0, Math.max(1, maxChars - 1)) + '…';
      return l;
    });
  }

  // Precompute per-message lane budgets + wrapped line arrays so we can
  // size the SVG height accurately before drawing.
  var dropped = [];
  var laid = messages.map(function (m, i) {
    var fi = resolveActor(m.from);
    var ti = resolveActor(m.to);
    if (fi < 0 || ti < 0) {
      dropped.push({ idx: i, from: m.from, to: m.to, label: m.label || '' });
    }
    var isSelf = fi >= 0 && fi === ti;
    var laneWidthPx;
    if (fi < 0 || ti < 0) {
      laneWidthPx = width - 120;
    } else if (isSelf) {
      laneWidthPx = SELF_LANE_PX;
    } else {
      laneWidthPx = Math.max(60, Math.abs(colX[ti] - colX[fi]) - 24);
    }
    var maxChars = Math.max(MIN_LANE_CHARS, Math.floor(laneWidthPx / CHAR_PX));
    var lines = wrap(m.label || '', maxChars);
    return { fi: fi, ti: ti, isSelf: isSelf, lines: lines, m: m };
  });

  var yStart = 80;
  var currentY = yStart;
  var rowYs = laid.map(function (row) {
    var blockH = row.lines.length * LINE_HEIGHT;
    var arrowY = currentY + blockH + 4;
    var next = arrowY + MSG_PAD;
    var out = { textTopY: currentY, arrowY: arrowY };
    currentY = next;
    return out;
  });

  var height = Math.max(340, currentY + 20);

  if (dropped.length) {
    var known = actors.map(function (a) { return '"' + a + '"'; }).join(', ');
    var banner = document.createElement('div');
    banner.className = 'rk-chart-warning';
    banner.style.cssText = 'margin:0 0 10px;padding:10px 14px;border-left:3px solid var(--rk-bad,#ff5577);background:rgba(255,85,119,0.08);color:var(--rk-text);font-size:13px;line-height:1.5;';
    var head = document.createElement('div');
    head.style.cssText = 'font-weight:600;color:var(--rk-bad,#ff5577);margin-bottom:4px;';
    head.textContent = 'Sequence chart: ' + dropped.length + ' of ' + messages.length + ' message(s) dropped — unresolved actor(s).';
    banner.appendChild(head);
    var body = document.createElement('div');
    body.style.cssText = 'font-size:12px;opacity:0.85;';
    body.innerHTML = 'Every <code>from</code>/<code>to</code> must match one of the actors: ' + known +
      '. Pass actor <em>name strings</em> (not integer indices). ' +
      'Dropped: ' + dropped.slice(0, 5).map(function (d) {
        return '#' + (d.idx + 1) + ' <code>' + String(d.from) + ' → ' + String(d.to) + '</code>';
      }).join(', ') + (dropped.length > 5 ? ', …' : '');
    banner.appendChild(body);
    container.appendChild(banner);
    try { console.warn('RickChartSequence: dropped messages', dropped); } catch (e) {}
  }

  var svg = d3.select(container).append('svg')
    .attr('viewBox', '0 0 ' + width + ' ' + height)
    .attr('preserveAspectRatio', 'xMidYMid meet');

  var defs = svg.append('defs');
  defs.append('marker')
    .attr('id', 'arrow-seq')
    .attr('viewBox', '0 -5 10 10')
    .attr('refX', 10).attr('refY', 0)
    .attr('markerWidth', 5).attr('markerHeight', 5)
    .attr('orient', 'auto')
    .append('path')
    .attr('d', 'M0,-5L10,0L0,5')
    .style('fill', 'var(--rk-ok)');

  // Actor headers + lifelines.
  actors.forEach(function (a, i) {
    var g = svg.append('g').attr('class', 'chart-node').attr('transform', 'translate(' + colX[i] + ',30)');
    g.append('rect').attr('x', -55).attr('y', -16).attr('width', 110).attr('height', 32).attr('rx', 3);
    g.append('text').attr('text-anchor', 'middle').attr('dy', 4).text(a);
    svg.append('line')
      .attr('x1', colX[i]).attr('y1', 50)
      .attr('x2', colX[i]).attr('y2', height - 20)
      .attr('stroke', 'rgba(255,255,255,0.2)')
      .attr('stroke-dasharray', '2 4');
  });

  laid.forEach(function (row, i) {
    if (row.fi < 0 || row.ti < 0) return;
    var pos = rowYs[i];
    var stroke = row.m.side === 'after' ? 'var(--rk-accent)' :
                 row.m.side === 'before' ? 'var(--rk-bad)' :
                 'var(--rk-ok)';
    var dash = row.m.side === 'before' ? '5 3' : '';

    if (row.isSelf) {
      // Self-message: small loop to the right of the actor's lifeline.
      var lx = colX[row.fi];
      var loopR = 12;
      var arrowY = pos.arrowY;
      svg.append('path')
        .attr('d',
          'M ' + lx + ' ' + (arrowY - loopR) + ' ' +
          'C ' + (lx + 36) + ' ' + (arrowY - loopR) + ', ' +
                (lx + 36) + ' ' + (arrowY + loopR) + ', ' +
                lx + ' ' + (arrowY + loopR))
        .attr('fill', 'none')
        .style('stroke', stroke)
        .attr('stroke-opacity', 0.85)
        .attr('stroke-width', 1.5)
        .attr('stroke-dasharray', dash)
        .attr('marker-end', 'url(#arrow-seq)');
      // Label rendered to the right of the loop.
      var textEl = svg.append('text')
        .attr('x', lx + 44)
        .attr('text-anchor', 'start')
        .style('fill', 'var(--rk-text)')
        .attr('font-size', 11)
        .attr('font-family', 'inherit');
      textEl.append('title').text(row.m.label || '');
      row.lines.forEach(function (line, li) {
        textEl.append('tspan')
          .attr('x', lx + 44)
          .attr('dy', li === 0 ? 0 : LINE_HEIGHT)
          .attr('y', li === 0 ? (pos.textTopY + LINE_HEIGHT) : null)
          .text(line);
      });
      return;
    }

    // Normal arrow between distinct actors.
    svg.append('line')
      .attr('x1', colX[row.fi]).attr('y1', pos.arrowY)
      .attr('x2', colX[row.ti]).attr('y2', pos.arrowY)
      .style('stroke', stroke)
      .attr('stroke-opacity', 0.85)
      .attr('stroke-width', 1.5)
      .attr('stroke-dasharray', dash)
      .attr('marker-end', 'url(#arrow-seq)');
    var midX = (colX[row.fi] + colX[row.ti]) / 2;
    var textEl2 = svg.append('text')
      .attr('text-anchor', 'middle')
      .style('fill', 'var(--rk-text)')
      .attr('font-size', 11)
      .attr('font-family', 'inherit');
    textEl2.append('title').text(row.m.label || '');
    row.lines.forEach(function (line, li) {
      textEl2.append('tspan')
        .attr('x', midX)
        .attr('dy', li === 0 ? 0 : LINE_HEIGHT)
        .attr('y', li === 0 ? (pos.textTopY + LINE_HEIGHT) : null)
        .text(line);
    });
  });
};

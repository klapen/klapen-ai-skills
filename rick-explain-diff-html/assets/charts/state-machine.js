/* Before/After state machine — two side-by-side directed graphs.
 * Payload shape:
 *   { before: { states: [{id,label}], transitions: [{from,to,label?}] },
 *     after:  { states: [{id,label}], transitions: [{from,to,label?}] } }
 */
window.RickChartState = function (container, data) {
  container.innerHTML = '';
  var totalW = container.clientWidth || 700;
  var height = 380;
  var paneW = (totalW - 20) / 2;

  var svg = d3.select(container).append('svg')
    .attr('viewBox', '0 0 ' + totalW + ' ' + height)
    .attr('preserveAspectRatio', 'xMidYMid meet');

  var defs = svg.append('defs');
  defs.append('marker')
    .attr('id', 'arrow-state')
    .attr('viewBox', '0 -5 10 10')
    .attr('refX', 22).attr('refY', 0)
    .attr('markerWidth', 6).attr('markerHeight', 6)
    .attr('orient', 'auto')
    .append('path')
    .attr('d', 'M0,-5L10,0L0,5')
    .attr('fill', 'var(--accent, #39ff14)');

  function drawPane(pane, offsetX, title) {
    if (!pane) return;
    var g = svg.append('g').attr('transform', 'translate(' + offsetX + ',0)');
    g.append('text')
      .attr('x', paneW / 2).attr('y', 20)
      .attr('text-anchor', 'middle')
      .attr('fill', 'var(--primary, #00ff88)')
      .attr('font-size', 13)
      .attr('font-family', 'inherit')
      .attr('letter-spacing', 2)
      .text(title.toUpperCase());

    var states = pane.states || [];
    var trans = pane.transitions || [];

    // Rect is 120 wide, so half-width = 60. Keep the whole rect inside the pane
    // with a 10px inner margin -> node center x must be in [70, paneW-70].
    var nodesById = {};
    states.forEach(function (s, i) {
      var col = i % 2, row = Math.floor(i / 2);
      nodesById[s.id] = {
        id: s.id,
        label: s.label || s.id,
        x: 70 + col * (paneW - 140),
        y: 70 + row * 90
      };
    });

    trans.forEach(function (t) {
      var s = nodesById[t.from], e = nodesById[t.to];
      if (!s || !e) return;
      g.append('line')
        .attr('class', 'chart-link')
        .attr('x1', s.x).attr('y1', s.y)
        .attr('x2', e.x).attr('y2', e.y)
        .attr('marker-end', 'url(#arrow-state)');
      if (t.label) {
        g.append('text')
          .attr('x', (s.x + e.x) / 2)
          .attr('y', (s.y + e.y) / 2 - 4)
          .attr('text-anchor', 'middle')
          .attr('fill', 'var(--text, #d0ffd8)')
          .attr('font-size', 10)
          .attr('font-family', 'inherit')
          .text(t.label);
      }
    });

    Object.keys(nodesById).forEach(function (id) {
      var n = nodesById[id];
      var ng = g.append('g').attr('class', 'chart-node').attr('transform', 'translate(' + n.x + ',' + n.y + ')');
      ng.append('rect').attr('x', -60).attr('y', -18).attr('width', 120).attr('height', 36).attr('rx', 4);
      ng.append('text').attr('text-anchor', 'middle').attr('dy', 4).text(n.label);
    });
  }

  drawPane(data.before, 0, 'Before');
  drawPane(data.after, paneW + 20, 'After');

  // divider
  svg.append('line')
    .attr('x1', paneW + 10).attr('y1', 40)
    .attr('x2', paneW + 10).attr('y2', height - 20)
    .attr('stroke', 'rgba(255,255,255,0.15)')
    .attr('stroke-dasharray', '4 3');
};

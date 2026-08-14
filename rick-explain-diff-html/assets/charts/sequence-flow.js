/* Vertical sequence / call flow.
 * Payload shape:
 *   { actors: ["client","server","db"],
 *     messages: [{from,to,label,side:"before"|"after"|undefined}] }
 */
window.RickChartSequence = function (container, data) {
  container.innerHTML = '';
  var width = container.clientWidth || 700;
  var msgCount = (data.messages || []).length;
  var height = Math.max(340, 80 + msgCount * 40);

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
    .attr('fill', 'var(--accent, #39ff14)');

  var actors = data.actors || [];
  var cols = actors.length;
  var colX = actors.map(function (_, i) {
    return 60 + (i + 0.5) * ((width - 120) / Math.max(1, cols));
  });

  // Actor headers
  actors.forEach(function (a, i) {
    var g = svg.append('g').attr('class', 'chart-node').attr('transform', 'translate(' + colX[i] + ',30)');
    g.append('rect').attr('x', -55).attr('y', -16).attr('width', 110).attr('height', 32).attr('rx', 3);
    g.append('text').attr('text-anchor', 'middle').attr('dy', 4).text(a);
    // Lifeline
    svg.append('line')
      .attr('x1', colX[i]).attr('y1', 50)
      .attr('x2', colX[i]).attr('y2', height - 20)
      .attr('stroke', 'rgba(255,255,255,0.2)')
      .attr('stroke-dasharray', '2 4');
  });

  var yStart = 80;
  (data.messages || []).forEach(function (m, i) {
    var fi = actors.indexOf(m.from);
    var ti = actors.indexOf(m.to);
    if (fi < 0 || ti < 0) return;
    var y = yStart + i * 40;
    var stroke = m.side === 'after' ? 'var(--primary, #00ff88)' :
                 m.side === 'before' ? '#ff5577' :
                 'var(--accent, #39ff14)';
    var dash = m.side === 'before' ? '5 3' : '';
    svg.append('line')
      .attr('x1', colX[fi]).attr('y1', y)
      .attr('x2', colX[ti]).attr('y2', y)
      .attr('stroke', stroke)
      .attr('stroke-opacity', 0.85)
      .attr('stroke-width', 1.5)
      .attr('stroke-dasharray', dash)
      .attr('marker-end', 'url(#arrow-seq)');
    svg.append('text')
      .attr('x', (colX[fi] + colX[ti]) / 2)
      .attr('y', y - 5)
      .attr('text-anchor', 'middle')
      .attr('fill', 'var(--text, #d0ffd8)')
      .attr('font-size', 11)
      .attr('font-family', 'inherit')
      .text(m.label || '');
  });
};

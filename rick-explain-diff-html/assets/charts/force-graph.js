/* Force-directed module dependency graph.
 * Payload shape:
 *   { nodes: [{id, label, group?}], edges: [{source, target, kind?}] }
 *   kind ∈ "added" | "removed" | undefined (existing)
 */
window.RickChartForce = function (container, data) {
  container.innerHTML = '';
  var width = container.clientWidth || 700;
  var height = 360;

  var nodes = (data.nodes || []).map(function (n) { return Object.assign({}, n); });
  var links = (data.edges || []).map(function (e) { return Object.assign({}, e); });

  var svg = d3.select(container).append('svg')
    .attr('viewBox', '0 0 ' + width + ' ' + height)
    .attr('preserveAspectRatio', 'xMidYMid meet');

  var defs = svg.append('defs');
  defs.append('marker')
    .attr('id', 'arrow-force')
    .attr('viewBox', '0 -5 10 10')
    .attr('refX', 18)
    .attr('refY', 0)
    .attr('markerWidth', 6)
    .attr('markerHeight', 6)
    .attr('orient', 'auto')
    .append('path')
    .attr('d', 'M0,-5L10,0L0,5')
    .style('fill', 'var(--rk-ok)');

  var sim = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links).id(function (d) { return d.id; }).distance(90).strength(0.6))
    .force('charge', d3.forceManyBody().strength(-260))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collide', d3.forceCollide().radius(28));

  var link = svg.append('g').selectAll('line').data(links).enter().append('line')
    .attr('class', function (d) { return 'chart-link ' + (d.kind || ''); })
    .attr('marker-end', 'url(#arrow-force)');

  var node = svg.append('g').selectAll('g').data(nodes).enter().append('g')
    .attr('class', 'chart-node')
    .call(d3.drag()
      .on('start', function (evt, d) { if (!evt.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
      .on('drag', function (evt, d) { d.fx = evt.x; d.fy = evt.y; })
      .on('end', function (evt, d) { if (!evt.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }));

  node.append('circle').attr('r', 16);
  node.append('text')
    .attr('text-anchor', 'middle')
    .attr('dy', 4)
    .text(function (d) { return d.label || d.id; });

  sim.on('tick', function () {
    link
      .attr('x1', function (d) { return d.source.x; })
      .attr('y1', function (d) { return d.source.y; })
      .attr('x2', function (d) { return d.target.x; })
      .attr('y2', function (d) { return d.target.y; });
    node.attr('transform', function (d) { return 'translate(' + d.x + ',' + d.y + ')'; });
  });
};

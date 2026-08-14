/* Sankey data-flow. Requires d3-sankey (window.d3.sankey after inclusion).
 * Payload shape:
 *   { nodes: [{name}], flows: [{source, target, value, kind?}] }
 *   kind ∈ "added" | "removed" | undefined
 * source/target are indices into nodes.
 */
window.RickChartSankey = function (container, data) {
  container.innerHTML = '';
  var width = container.clientWidth || 700;
  var height = 360;

  if (!d3.sankey) {
    container.innerHTML = '<pre style="color:#ff5577">ERROR: d3-sankey missing.</pre>';
    return;
  }

  var svg = d3.select(container).append('svg')
    .attr('viewBox', '0 0 ' + width + ' ' + height)
    .attr('preserveAspectRatio', 'xMidYMid meet');

  var nodes = (data.nodes || []).map(function (n) { return { name: n.name || n }; });
  var links = (data.flows || []).map(function (f) {
    return { source: f.source, target: f.target, value: Math.max(1, f.value || 1), kind: f.kind };
  });

  var sankey = d3.sankey()
    .nodeWidth(18)
    .nodePadding(14)
    .extent([[10, 10], [width - 10, height - 10]]);

  var g = sankey({
    nodes: nodes.map(function (n) { return Object.assign({}, n); }),
    links: links.map(function (l) { return Object.assign({}, l); })
  });

  svg.append('g').selectAll('path').data(g.links).enter().append('path')
    .attr('class', function (d) { return 'chart-link ' + (d.kind || ''); })
    .attr('d', d3.sankeyLinkHorizontal())
    .attr('stroke-width', function (d) { return Math.max(1, d.width); })
    .attr('fill', 'none')
    .attr('stroke-opacity', 0.55);

  var node = svg.append('g').selectAll('g').data(g.nodes).enter().append('g')
    .attr('class', 'chart-node');
  node.append('rect')
    .attr('x', function (d) { return d.x0; })
    .attr('y', function (d) { return d.y0; })
    .attr('width', function (d) { return d.x1 - d.x0; })
    .attr('height', function (d) { return Math.max(1, d.y1 - d.y0); });
  node.append('text')
    .attr('x', function (d) { return d.x0 < width / 2 ? d.x1 + 6 : d.x0 - 6; })
    .attr('y', function (d) { return (d.y1 + d.y0) / 2; })
    .attr('dy', 4)
    .attr('text-anchor', function (d) { return d.x0 < width / 2 ? 'start' : 'end'; })
    .text(function (d) { return d.name; });
};

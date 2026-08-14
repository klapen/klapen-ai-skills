/* Shape-of-the-diff treemap. Grouped by directory, tile area = adds+dels,
 * tile colour = additions-vs-removals ratio.
 * Payload shape:
 *   { files: [{path, adds, dels}] }
 * onJump(path) is called when a tile is clicked, so the caller can expand
 * and scroll to that file in the Files section.
 */
window.RickChartTreemap = function (container, data, onJump) {
  container.innerHTML = '';
  var d3 = window.d3;
  var files = (data && data.files) || [];
  if (!files.length) {
    container.innerHTML = '<pre style="color:#ff5577">ERROR: no files to chart.</pre>';
    return;
  }

  var cs = getComputedStyle(container);
  var v = function (name, fallback) { return (cs.getPropertyValue(name) || '').trim() || fallback; };
  var C = {
    dim: v('--rk-dim', '#a89984'),
    deep: v('--rk-deep', '#1d2021'),
    ok: v('--rk-ok', '#b8bb26'),
    warn: v('--rk-warn', '#fe8019'),
    bad: v('--rk-bad', '#fb4934')
  };

  var W = Math.max(360, container.clientWidth || 640), H = 300;

  var groups = {};
  files.forEach(function (f) {
    var dir = f.path.indexOf('/') >= 0 ? f.path.slice(0, f.path.lastIndexOf('/')) : '.';
    (groups[dir] = groups[dir] || []).push(f);
  });

  var root = d3.hierarchy({
    children: Object.keys(groups).map(function (k) {
      return {
        name: k,
        children: groups[k].map(function (f) {
          var total = Math.max(1, (f.adds || 0) + (f.dels || 0));
          return { name: f.path.split('/').pop(), dir: k, value: total, ratio: (f.adds || 0) / total, file: f };
        })
      };
    })
  }).sum(function (d) { return d.value || 0; }).sort(function (a, b) { return b.value - a.value; });

  d3.treemap().size([W, H]).paddingInner(2).paddingTop(18)(root);

  var svg = d3.select(container).append('svg')
    .attr('viewBox', '0 0 ' + W + ' ' + H)
    .attr('width', '100%').attr('height', H).style('display', 'block');

  svg.selectAll('text.dir').data(root.children || []).enter().append('text').attr('class', 'dir')
    .attr('x', function (d) { return d.x0 + 4; }).attr('y', function (d) { return d.y0 + 12; })
    .style('fill', C.dim).attr('font-family', 'JetBrains Mono, monospace').attr('font-size', 10).attr('letter-spacing', '0.08em')
    .text(function (d) { return d.data.name; });

  var leaf = svg.selectAll('g.leaf').data(root.leaves()).enter().append('g').attr('class', 'leaf')
    .attr('transform', function (d) { return 'translate(' + d.x0 + ',' + d.y0 + ')'; })
    .style('cursor', 'pointer')
    .on('click', function (e, d) {
      var full = d.data.dir === '.' ? d.data.name : d.data.dir + '/' + d.data.name;
      if (typeof onJump === 'function') onJump(full);
    });

  var color = function (r) { return r >= 0.99 ? C.ok : r >= 0.6 ? C.warn : C.bad; };

  leaf.append('rect')
    .attr('width', function (d) { return Math.max(0, d.x1 - d.x0); })
    .attr('height', function (d) { return Math.max(0, d.y1 - d.y0); })
    .style('fill', function (d) { return color(d.data.ratio); })
    .attr('fill-opacity', 0.82).style('stroke', C.deep)
    .on('mouseenter', function () { d3.select(this).attr('fill-opacity', 1); })
    .on('mouseleave', function () { d3.select(this).attr('fill-opacity', 0.82); });

  leaf.filter(function (d) { return (d.x1 - d.x0) > 70 && (d.y1 - d.y0) > 34; }).each(function (d) {
    var g = d3.select(this);
    g.append('text').attr('x', 7).attr('y', 17).style('fill', C.deep).attr('font-family', 'JetBrains Mono, monospace').attr('font-size', 11.5).attr('font-weight', 700).text(d.data.name);
    g.append('text').attr('x', 7).attr('y', 32).style('fill', 'rgba(0,0,0,0.55)').attr('font-family', 'JetBrains Mono, monospace').attr('font-size', 10)
      .text('+' + (d.data.file.adds || 0) + ' −' + (d.data.file.dels || 0));
  });

  leaf.append('title').text(function (d) { return d.data.file.path + '  +' + (d.data.file.adds || 0) + ' −' + (d.data.file.dels || 0); });
};

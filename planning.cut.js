'use strict';
const grid = require('planning.grid');
/** @typedef {{to:number,rev:number,capacity:number}} Edge */
/** @typedef {{graph:Edge[][],source:number,sink:number,flow:number,done:boolean,failed:boolean,width:number,height:number}} Search */
const INF = 1000000;
/** Node-split minimum vertex cut: exits are the source, protected cells the sink.
 * All cuttable tiles have unit cost. The final residual source-reachable set is the
 * smallest source side among equal minimum cuts, leaving the largest protected side.
 * @param {boolean[]} walk @param {boolean[]} protectedCells @param {number} [width] @param {number} [height]
 * @returns {Search}
 */
function create(walk, protectedCells, width = 50, height = 50) {
  const source = walk.length * 2, sink = source + 1;
  /** @type {Edge[][]} */
  const graph = Array.from({length:sink + 1}, () => []);
  const edge = (/** @type {number} */ a, /** @type {number} */ b, /** @type {number} */ capacity) => {
    const ab = {to:b,rev:graph[b].length,capacity}, ba = {to:a,rev:graph[a].length,capacity:0};graph[a].push(ab);graph[b].push(ba);
  };
  for (let cell = 0; cell < walk.length; cell++) {
    if (!walk[cell]) continue;
    const x = cell % width, y = Math.floor(cell / width);
    edge(cell * 2,cell * 2 + 1,protectedCells[cell] || x < 2 || y < 2 || x >= width - 2 || y >= height - 2 ? INF : 1);
    if (x === 0 || y === 0 || x === width - 1 || y === height - 1) edge(source,cell * 2,INF);
    if (protectedCells[cell]) edge(cell * 2 + 1,sink,INF);
    for (const neighbor of grid.neighbors(cell,width,height)) if (walk[neighbor]) edge(cell * 2 + 1,neighbor * 2,INF);
  }
  return {graph,source,sink,flow:0,done:false,failed:false,width,height};
}
/** Incremental Edmonds-Karp; each augmentation is bounded by the 50x50 grid.
 * Graph state is disposable global state, never serialized into Memory.
 * @param {Search} search @param {() => boolean} allowed @param {number} [iterations]
 * @returns {number[] | null}
 */
function advance(search, allowed, iterations = 8) {
  const {graph,source,sink} = search;
  for (let step = 0; step < iterations && !search.done && allowed(); step++) {
    const parent = new Int32Array(graph.length).fill(-1), via = new Int32Array(graph.length), queue = [source];parent[source] = source;
    for (let i = 0; i < queue.length && parent[sink] < 0; i++) {
      const node = queue[i];
      for (let j = 0; j < graph[node].length; j++) {
        const edge = graph[node][j];if (edge.capacity <= 0 || parent[edge.to] >= 0) continue;
        parent[edge.to] = node;via[edge.to] = j;queue.push(edge.to);
      }
    }
    if (parent[sink] < 0) {search.done = true;break;}
    let amount = INF;
    for (let node = sink; node !== source; node = parent[node]) amount = Math.min(amount,graph[parent[node]][via[node]].capacity);
    if (amount >= INF) {search.done = true;search.failed = true;return null;}
    for (let node = sink; node !== source; node = parent[node]) {
      const edge = graph[parent[node]][via[node]];edge.capacity -= amount;graph[node][edge.rev].capacity += amount;
    }
    search.flow += amount;
  }
  if (!search.done || search.failed) return null;
  const seen = new Set([source]), queue = [source];
  for (let i = 0; i < queue.length; i++) for (const edge of graph[queue[i]]) if (edge.capacity > 0 && !seen.has(edge.to)) {seen.add(edge.to);queue.push(edge.to);}
  const cut = [];
  for (let cell = 0; cell < search.width * search.height; cell++) if (seen.has(cell * 2) && !seen.has(cell * 2 + 1)) cut.push(cell);
  return cut;
}
module.exports = {create,advance};

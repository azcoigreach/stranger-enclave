'use strict';
/** Pure eight-direction grid helpers. Cell indices are y * width + x.
 * @param {number} cell @param {number} width @param {number} height
 */
function neighbors(cell, width = 50, height = 50) {
  const x = cell % width, y = Math.floor(cell / width), result = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if ((!dx && !dy) || x + dx < 0 || y + dy < 0 || x + dx >= width || y + dy >= height) continue;
    result.push((y + dy) * width + x + dx);
  }
  return result;
}
/** @param {boolean[]} walk @param {number[]} starts @param {Set<number>} [blocked] @param {number} [width] @param {number} [height] */
function flood(walk, starts, blocked = new Set(), width = 50, height = 50) {
  const seen = new Set(starts.filter(i => walk[i] && !blocked.has(i))), queue = [...seen];
  for (let i = 0; i < queue.length; i++) for (const n of neighbors(queue[i], width, height)) {
    if (walk[n] && !blocked.has(n) && !seen.has(n)) {seen.add(n);queue.push(n);}
  }
  return seen;
}
/** Shortest route with a heavy penalty for NEW gates; existing selected gates are free to reuse.
 * @param {boolean[]} walk @param {number[]} starts @param {Set<number>} goals @param {Set<number>} cut @param {Set<number>} gates
 * @returns {number[] | null}
 */
function route(walk, starts, goals, cut, gates) {
  const distance = new Array(walk.length).fill(Infinity), parent = new Array(walk.length).fill(-1);
  /** @type {Array<{cell:number,cost:number}>} */
  const heap = [];
  const push = (/** @type {{cell:number,cost:number}} */ item) => {
    let i = heap.length;heap.push(item);
    while (i > 0) {const p = (i - 1) >> 1;if (heap[p].cost <= item.cost) break;heap[i] = heap[p];i = p;}heap[i] = item;
  };
  for (const cell of starts) if (walk[cell]) {distance[cell] = 0;push({cell,cost:0});}
  while (heap.length) {
    const current = heap[0], last = heap.pop();
    if (heap.length && last) {
      let i = 0;
      while (i * 2 + 1 < heap.length) {
        let child = i * 2 + 1;if (child + 1 < heap.length && heap[child + 1].cost < heap[child].cost) child++;
        if (heap[child].cost >= last.cost) break;heap[i] = heap[child];i = child;
      }
      heap[i] = last;
    }
    if (current.cost !== distance[current.cell]) continue;
    if (goals.has(current.cell)) {
      const path = [];for (let cell = current.cell; cell >= 0; cell = parent[cell]) path.push(cell);return path.reverse();
    }
    for (const cell of neighbors(current.cell)) {
      if (!walk[cell]) continue;
      const cost = current.cost + 1 + (cut.has(cell) && !gates.has(cell) ? 2500 : 0);
      if (cost < distance[cell]) {distance[cell] = cost;parent[cell] = current.cell;push({cell,cost});}
    }
  }
  return null;
}
module.exports = {neighbors,flood,route};

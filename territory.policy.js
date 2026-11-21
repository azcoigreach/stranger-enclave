'use strict';

/** Pure coordinate/policy functions; no memory ownership or game intents.
 * W0/N0 map to -1, E0/S0 to 0. Invalid room names fail closed.
 * @param {string} name
 */
function coordinates(name) {
  const match = /^([WE])(\d+)([NS])(\d+)$/.exec(name);
  if (!match) throw new Error(`Invalid room name: ${name}`);
  const horizontal = Number(match[2]);
  const vertical = Number(match[4]);
  if (!Number.isSafeInteger(horizontal) || !Number.isSafeInteger(vertical)) {
    throw new Error('Room coordinates exceed integer range');
  }
  return {
    x: match[1] === 'W' ? -horizontal - 1 : horizontal,
    y: match[3] === 'N' ? -vertical - 1 : vertical,
  };
}

/** @param {number} x @param {number} y */
function roomName(x, y) {
  if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) throw new Error('Invalid coordinates');
  return `${x < 0 ? 'W' + (-x - 1) : 'E' + x}${y < 0 ? 'N' + (-y - 1) : 'S' + y}`;
}

/** Derive the standard sector's 9x9 interior, excluding highways numbered in tens.
 * Negative signed coordinates use the room's W/N number before sector division.
 * @param {string} name @returns {BlockBounds}
 */
function blockFor(name) {
  const { x, y } = coordinates(name);
  if (roomName(x, y) !== name) throw new Error(`Noncanonical room name: ${name}`);
  const axis = (/** @type {number} */ coordinate) => {
    const number = coordinate < 0 ? -coordinate - 1 : coordinate;
    if (number % 10 === 0) throw new Error(`Start room is on a highway: ${name}`);
    const start = Math.floor(number / 10) * 10;
    return coordinate < 0 ? { min: -start - 10, max: -start - 2 } : { min: start + 1, max: start + 9 };
  };
  const horizontal = axis(x), vertical = axis(y);
  return validate({ minX: horizontal.min, maxX: horizontal.max, minY: vertical.min, maxY: vertical.max });
}

/** @param {BlockBounds} a @param {BlockBounds} b */
function sameBlock(a, b) {
  return a.minX === b.minX && a.maxX === b.maxX && a.minY === b.minY && a.maxY === b.maxY;
}

/** @param {BlockBounds} block */
function validate(block) {
  if (!block || !['minX', 'maxX', 'minY', 'maxY'].every(
    key => Number.isSafeInteger(block[/** @type {keyof BlockBounds} */ (key)]),
  ) || block.maxX - block.minX !== 8 || block.maxY - block.minY !== 8) {
    throw new Error('Territory must be one fixed 9x9 rectangle');
  }
  return block;
}

/** @param {string} name @param {BlockBounds} block */
function contains(name, block) {
  try {
    const { x, y } = coordinates(name);
    return x >= block.minX && x <= block.maxX && y >= block.minY && y <= block.maxY;
  } catch (_) { return false; }
}

/** @param {BlockBounds} block */
function rooms(block) {
  validate(block);
  const result = [];
  for (let x = block.minX; x <= block.maxX; x++) {
    for (let y = block.minY; y <= block.maxY; y++) result.push(roomName(x, y));
  }
  return result;
}

module.exports = { coordinates, roomName, blockFor, sameBlock, validate, contains, rooms };

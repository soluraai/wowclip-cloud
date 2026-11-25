const smooth = (value: number) => {
  const t = Math.max(0, Math.min(1, value));
  return t ** 3 * (t * (t * 6 - 15) + 10);
};
type Box = { left: number; top: number; width: number; height: number };

/**
 * Which corner stays fixed. The pointer drags the opposite one, so it takes the side the helper
 * text leaves free and changes direction from word to word: 0 and 1 pull down, 2 and 3 pull up.
 */
export const dragCorner = (id: string, above: boolean, below: boolean) => {
  let hash = 7;
  for (const character of id) hash = (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0;
  const side = hash >>> 5 & 1;
  return above === below ? hash >>> 3 & 3 : above ? side : side + 2;
};

/** Keep one corner fixed. The opposite corner and the pointer share the same
 * scale parameter, so dragging really resizes the word and its selection. */
export const cursorDragPose = (box: Box, index: number, age: number, duration: number, reduced = false) => {
  const corner = index % 4, right = corner === 1 || corner === 3, bottom = corner >= 2;
  const anchorX = box.left + (right ? box.width : 0), anchorY = box.top + (bottom ? box.height : 0);
  const signX = right ? -1 : 1, signY = bottom ? -1 : 1;
  const approach = Math.min(100, duration * .18);
  const drag = reduced ? 1 : smooth((age - approach) / Math.max(1, duration - approach));
  const scale = .56 + .44 * drag;
  const x = anchorX + signX * box.width * scale, y = anchorY + signY * box.height * scale;
  const remaining = reduced ? 0 : 1 - smooth(age / approach);
  return { anchorX, anchorY, x, y, scale, pointerX: x + signX * 18 * remaining, pointerY: y + signY * 18 * remaining,
    pointerOpacity: 1 - remaining, angle: [0, 90, -90, 180][corner],
    transform: `translate(${anchorX} ${anchorY}) scale(${scale}) translate(${-anchorX} ${-anchorY})` };
};

/**
 * Fourfold's build, shared: words close in from all four sides to form the block. The top row drops
 * in, the bottom row rises, a key word at the start of its row slides in from the left and one at
 * the end from the right; middle rows open from their edges.
 */
export function fourSideFrom<T>(item: T, rows: T[][], key: boolean, reach = 34): [number, number] {
  const rowIndex = rows.findIndex(row => row.includes(item));
  const row = rows[rowIndex] ?? [item];
  const first = row[0] === item, last = row.length > 1 && row[row.length - 1] === item;
  const side = key && (first || last) ? (first ? "left" : "right")
    : rowIndex === 0 && rows.length > 1 ? "top" : rowIndex === rows.length - 1 ? "bottom" : first ? "left" : last ? "right" : "bottom";
  const across = reach, down = reach * .65;
  return side === "left" ? [-across, 0] : side === "right" ? [across, 0] : side === "top" ? [0, -down] : [0, down];
}

/** Groups words into rows by their baseline, top to bottom, each row left to right. */
export function rowsByBaseline<T>(items: T[], baseline: (item: T) => number, x: (item: T) => number, tolerance: number): T[][] {
  const rows: { y: number; items: T[] }[] = [];
  for (const item of items) {
    const y = baseline(item);
    const row = rows.find(other => Math.abs(other.y - y) < tolerance);
    if (row) row.items.push(item); else rows.push({ y, items: [item] });
  }
  return rows.sort((a, b) => a.y - b.y).map(row => row.items.sort((a, b) => x(a) - x(b)));
}

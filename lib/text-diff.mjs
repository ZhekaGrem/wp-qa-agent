const counts = (list) => list.reduce((m, t) => m.set(t, (m.get(t) || 0) + 1), new Map());

export function diffText(before, after) {
  const a = counts(before);
  const b = counts(after);
  const removed = [...a].flatMap(([t, n]) => Array(Math.max(0, n - (b.get(t) || 0))).fill(t));
  const added = [...b].flatMap(([t, n]) => Array(Math.max(0, n - (a.get(t) || 0))).fill(t));
  return { added: added.slice(0, 50), removed: removed.slice(0, 50), addedCount: added.length, removedCount: removed.length };
}

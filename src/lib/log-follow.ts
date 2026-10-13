// When the run log should jump to its newest line. It does on first showing and
// when a new run or replay starts over, and otherwise only while the reader is
// at the bottom already, so scrolling up to read an earlier line isn't undone.

// How far from the bottom still counts as at the bottom, in pixels.
const SLACK = 32;

export type Box = { scrollTop: number; scrollHeight: number; clientHeight: number };

export const atBottom = (box: Box): boolean => box.scrollHeight - box.scrollTop - box.clientHeight <= SLACK;

export function jumpToEnd({ shown, length, following }: { shown: number; length: number; following: boolean }): boolean {
  // shown is how many lines the box held before; 0 means it is showing for the first time.
  if (shown === 0 || length < shown) return true;
  return following;
}

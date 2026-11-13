/**
 * Device detection utility.
 * Single source of truth for detecting touch-first or mobile viewport devices.
 */
export function isTouchOrMobile() {
  if (typeof window === 'undefined') return false;
  const hasCoarsePointer = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const isNarrowViewport = window.innerWidth < 768;
  return Boolean(hasCoarsePointer || isNarrowViewport);
}


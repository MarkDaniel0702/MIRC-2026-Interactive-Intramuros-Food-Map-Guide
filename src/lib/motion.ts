/** Evaluated once at module load, matching app.js:43's one-time read -- never
 *  re-evaluated if the OS setting changes mid-session (same as the original). */
export const reduceMotionOnce =
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

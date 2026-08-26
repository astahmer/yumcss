/**
 * Node-side data gatherer for the studio — moved into the analyze package's
 * collection layer (plans/023 unification). This file stays as the stable
 * local import seam for vite.config.ts and tests.
 */
export { gather } from "pandwind-analyze/collect";

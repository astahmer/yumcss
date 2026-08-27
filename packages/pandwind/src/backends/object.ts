/** Public object-backend entry point. Execution and surfaces have separate owners. */
export { createObjectBackend } from "./object-engine.ts";
export type { ObjectBackend, ObjectBackendOptions, TargetStyle } from "./object-engine.ts";
export { createDesignObjectCss, createObjectCss, createObjectCx } from "./object-surface.ts";
export type { ObjectCssFn, ObjectCxFn } from "./object-surface.ts";

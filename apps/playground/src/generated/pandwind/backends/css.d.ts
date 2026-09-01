// Generated from the workspace-linked pandwind package. Do not edit.
import type { AtomRegistry } from "../css/atoms.d.ts";
import type { ClassNameStrategy } from "../css/class-name-strategy.d.ts";
import { type StyleBackend } from "./types.d.ts";
import type { StyleBackendFactory } from "./registry.d.ts";
export interface CssBackendOptions {
    debug?: boolean;
    hashFn?: (key: string, value: string | true) => string;
    className?: ClassNameStrategy;
    /** Preset conditions used to canonicalize responsive var paths. */
    conditions?: Record<string, string | string[]>;
}
/**
 * The web backend (plans/021 reference implementation): lowers flattened
 * declarations to class names and registers them in the atom registry that
 * the generated stylesheet and `cx` both read.
 *
 * Behavior moved verbatim from create-css.ts `register` — the strategy
 * chain (custom class or null) followed by the hashed atomic fallback —
 * so outputs stay byte-identical with pre-extraction builds.
 */
export declare function createCssBackend(options?: CssBackendOptions): StyleBackend & {
    /** Atom registry shared with the stylesheet generator and cx. */
    atoms: AtomRegistry;
};
export declare const CSS_BACKEND: StyleBackendFactory<CssBackendOptions, string>;

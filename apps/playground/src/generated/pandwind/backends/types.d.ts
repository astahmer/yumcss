// Generated from the workspace-linked pandwind package. Do not edit.
/**
 * Style backends — the target boundary of the design layer (plans/021).
 *
 * Everything upstream of a backend is target-independent: the designer
 * vocabulary (`css()` / `createDesignCss`), DTCG token resolution
 * (`design/resolve.ts`) and flattening produce the **style IR** below. A
 * backend lowers that IR to what its style system consumes — class strings
 * plus a stylesheet on the web, plain style objects for React Native /
 * OpenTUI, draw-call objects for canvas.
 *
 * ## The IR (flattened style object)
 *
 * ```ts
 * type FlatStyleIR = Record<string, string>; // values via String(value)
 * ```
 *
 * - Keys are `prop` or condition-nested `_cond__prop`, `__`-separated,
 *   OUTERMOST condition first: `_hover___dark__color` (inner conditions
 *   keep their `_` prefix, so the separator run between them is three
 *   underscores). The trailing segment is always the property.
 * - Produced by the owned `flattenStyle` traversal: nested objects/arrays flatten
 *   (arrays get index keys), `null`/`undefined`/empty-object entries
 *   disappear, `false`/`true` and numbers pass through unstringified (the
 *   design layer drops `false` upstream; raw `css()` callers see the
 *   pass-through).
 * - Values are token-RESOLVED upstream (the design layer resolves against
 *   the preset before flattening) — a backend never sees `$surface`, only
 *   the concrete value.
 *
 * ## Contract
 *
 * - `declare(key, value)` lowers ONE flattened declaration. It must be
 *   idempotent per (key, value): repeated declarations of the same pair
 *   return the same artifact (registries dedup by construction).
 * - A backend owns its artifact registry (the css backend's atom registry
 *   is what `cx` reads through `ATOM_REGISTRY`).
 * - Policy violations throw. A backend that cannot represent a declaration
 *   (unsupported condition, unconvertible unit) fails loudly — a silently
 *   dead style is never acceptable (plans/021 condition policy).
 * - `check` is the optional pre-flight half: same policy, callable without
 *   lowering (used by tooling to validate without side effects).
 */
/** Flattened, condition-nested, token-resolved style object — see module docs. */
export type FlatStyleIR = Record<string, string>;
export declare const StyleBackendId: {
    readonly Css: "css";
    readonly Object: "object";
    readonly ReactNative: "react-native";
    readonly OpenTui: "opentui";
};
export type StyleBackendId = (typeof StyleBackendId)[keyof typeof StyleBackendId];
export declare const STYLE_BACKEND_SCHEMA: "pandwind.style-backend/1";
export type BackendCapabilityLevel = "unsupported" | "partial" | "exact";
export type BackendLossiness = "lossless" | "lossy" | "unsupported";
export type BackendArtifactKind = "stylesheet" | "style-object" | (string & {});
export type BackendFeature = "declarations" | "conditions" | "dynamic-values" | "runtime-conditions" | "unit-conversion" | "serialization" | "stable-identity" | "ssr";
export interface BackendCapabilityContract {
    readonly schema: "pandwind.style-backend-capabilities/1";
    readonly artifact: BackendArtifactKind;
    readonly features: Readonly<Record<BackendFeature, BackendCapabilityLevel>>;
    readonly unsupported: "throw" | "diagnose";
}
export interface BackendDeclarationIssue {
    readonly property: string;
    readonly value: string;
    readonly lossiness: BackendLossiness;
    readonly message: string;
}
/**
 * Per-declaration artifact of a backend: the css backend yields class
 * names; object-emitting backends yield the converted target properties
 * of one declaration (see backends/object.ts).
 */
export interface StyleBackend<TArtifact = string> {
    /** Mode id, e.g. `"css"` / `"react-native"` / `"opentui"` (docs/debug). */
    readonly name: string;
    /** Typed target contract used by tooling and differential validation. */
    readonly capabilities?: BackendCapabilityContract;
    /**
     * Policy-check one flattened declaration without lowering it. Throws
     * when this backend refuses the declaration (unsupported condition,
     * unconvertible value). Optional — a backend without policy restrictions
     * (css) omits it.
     */
    check?(key: string, value: string): void;
    /** Optional non-throwing policy inspection for analyzers and reports. */
    diagnose?(key: string, value: string): readonly BackendDeclarationIssue[];
    /**
     * Lower one flattened declaration to this backend's artifact.
     * Idempotent per (key, value); may throw on policy violations.
     */
    declare(key: string, value: string): TArtifact;
}

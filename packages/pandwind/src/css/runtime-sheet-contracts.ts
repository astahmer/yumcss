/** Flat rule after semantic lowering and CSS serialization. */
export interface RuntimeRule {
	readonly id: string;
	readonly css: string;
	readonly priority: number;
}

/** Runtime-safe rule kinds shared by browser and Node entrypoints. */
export const RuntimeSemanticRuleKindTag = {
	Style: "style",
	Global: "global",
	Keyframes: "keyframes",
	FontFace: "font-face",
	Layer: "layer",
	Supports: "supports",
	Property: "property",
} as const;

/** The supported semantic runtime rule kinds. */
export type RuntimeSemanticRuleKind =
	(typeof RuntimeSemanticRuleKindTag)[keyof typeof RuntimeSemanticRuleKindTag];

/** Declaration accepted by the runtime semantic-rule serializer. */
export interface RuntimeDeclaration {
	readonly property: string;
	readonly value: string | number | boolean;
}

/**
 * DOM-independent rule IR for runtime CSS, SSR, hydration, and devtools.
 * `kind` selects the serialized rule shape: `style` and `global` emit
 * selectors, `keyframes`, `font-face`, `layer`, and `supports` emit their
 * corresponding browser at-rules, and `property` emits an `@property`
 * registration. `children` represents nested rule bodies; `conditions`
 * preserves wrapper order. Adapters may canonicalize this richer form into
 * the flat RuntimeRule fast path before it reaches the store.
 *
 * @example Register a typed custom property during SSR
 * ```ts
 * import { createRuntimeSheet } from "pandwind/css/runtime";
 *
 * const sheet = createRuntimeSheet({ autoMount: false });
 * sheet.registerSemanticRules([
 *   {
 *     kind: "property",
 *     name: "--progress",
 *     declarations: [
 *       { property: "syntax", value: "<number>" },
 *       { property: "inherits", value: false },
 *       { property: "initial-value", value: 0 },
 *     ],
 *   },
 * ]);
 * ```
 */
export interface RuntimeSemanticRule {
	readonly id?: string;
	readonly kind: RuntimeSemanticRuleKind;
	readonly selector?: string;
	readonly name?: string;
	readonly layer?: string;
	readonly conditions?: readonly string[];
	readonly declarations?: readonly RuntimeDeclaration[];
	readonly children?: readonly RuntimeSemanticRule[];
	readonly priority?: number;
}

/** Serializable boundary between an SSR producer and a browser consumer. */
export interface RuntimeSheetSnapshot {
	readonly tokens: string;
	readonly rules: RuntimeRule[];
}

/** Minimal style-element contract used by the default runtime sink. */
export interface RuntimeStyleElement {
	readonly tagName?: string;
	textContent: string;
	setAttribute(name: string, value: string): void;
	nonce?: string;
	remove(): void;
}

/** Minimal document contract required for runtime sheet mounting. */
export interface RuntimeDocument {
	querySelector(selector: string): RuntimeStyleElement | null;
	createElement(name: string): RuntimeStyleElement;
	head: { appendChild(element: RuntimeStyleElement): void };
}

/** Options controlling runtime sheet identity and DOM mounting behavior. */
export interface RuntimeSheetOptions {
	readonly id?: string;
	readonly autoMount?: boolean;
	readonly document?: RuntimeDocument;
	readonly nonce?: string;
}

/** Replaceable deduplicating store for flat runtime rules. */
export interface RuntimeRuleStore {
	readonly rules: ReadonlyMap<string, RuntimeRule>;
	register(rules: readonly RuntimeRule[]): boolean;
	replace(snapshot: readonly RuntimeRule[]): void;
}

/** Replaceable cascade-ordering policy for flat runtime rules. */
export interface RuntimeOrderingPolicy {
	/** Deterministic for an unchanged rule map; the sheet memoizes this result. */
	order(rules: ReadonlyMap<string, RuntimeRule>): RuntimeRule[];
	/**
	 * Insert rules into an already ordered list when the store only gained new
	 * IDs. Policies that cannot preserve this invariant may omit the method;
	 * the sheet falls back to `order`.
	 */
	insert?(ordered: readonly RuntimeRule[], next: readonly RuntimeRule[]): RuntimeRule[];
}

/** Converts semantic rules into canonical flat rules. */
export interface RuntimeRuleCanonicalizer {
	canonicalize(rule: RuntimeSemanticRule): RuntimeRule;
}

/** Serializes a semantic rule into CSS text. */
export interface RuntimeRuleSerializer {
	serialize(rule: RuntimeSemanticRule): string;
}

/** Mount/update boundary for a runtime sheet's generated CSS. */
export interface RuntimeStyleElementSink {
	mount(css: string): boolean;
	update(css: string): void;
	/** Insert one newly ordered rule without rebuilding the whole style text. */
	insert?(rule: RuntimeRule, index: number, existingRuleCount: number): boolean;
	unmount(): void;
}

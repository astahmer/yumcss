/**
 * Flat rule after semantic lowering and serialization.
 *
 * This is the compact fast path stored by {@link createRuntimeSheet}.
 *
 * @category runtime
 * @since 0.1.0
 */
export interface RuntimeRule {
	readonly id: string;
	readonly css: string;
	readonly priority: number;
}

/** Runtime-safe typed identities shared by the browser and Node entrypoints. */
export const RuntimeSemanticRuleKindTag = {
	Style: "style",
	Global: "global",
	Keyframes: "keyframes",
	FontFace: "font-face",
	Layer: "layer",
	Supports: "supports",
	Property: "property",
} as const;
export type RuntimeSemanticRuleKind =
	(typeof RuntimeSemanticRuleKindTag)[keyof typeof RuntimeSemanticRuleKindTag];

/**
 * A declaration accepted by the runtime semantic-rule serializer.
 *
 * @category runtime
 * @since 0.1.0
 */
export interface RuntimeDeclaration {
	readonly property: string;
	readonly value: string | number | boolean;
}

/**
 * DOM-independent rule IR for runtime CSS, SSR, hydration, and devtools.
 * `children` represents nested rule bodies; `conditions` preserves wrapper
 * order. Adapters may canonicalize this richer form into the flat
 * RuntimeRule fast path before it reaches the store.
 *
 * @category runtime
 * @since 0.1.0
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

/**
 * Serializable boundary between an SSR producer and a browser consumer.
 *
 * @category runtime
 * @since 0.1.0
 */
export interface RuntimeSheetSnapshot {
	readonly tokens: string;
	readonly rules: RuntimeRule[];
}

export interface RuntimeStyleElement {
	readonly tagName?: string;
	textContent: string;
	setAttribute(name: string, value: string): void;
	nonce?: string;
	remove(): void;
}

export interface RuntimeDocument {
	querySelector(selector: string): RuntimeStyleElement | null;
	createElement(name: string): RuntimeStyleElement;
	head: { appendChild(element: RuntimeStyleElement): void };
}

/** Options controlling a runtime sheet's identity and DOM mounting behavior. */
export interface RuntimeSheetOptions {
	readonly id?: string;
	readonly autoMount?: boolean;
	readonly document?: RuntimeDocument;
	readonly nonce?: string;
}

export interface RuntimeRuleStore {
	readonly rules: ReadonlyMap<string, RuntimeRule>;
	register(rules: readonly RuntimeRule[]): boolean;
	replace(snapshot: readonly RuntimeRule[]): void;
}

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

export interface RuntimeRuleCanonicalizer {
	canonicalize(rule: RuntimeSemanticRule): RuntimeRule;
}

export interface RuntimeRuleSerializer {
	serialize(rule: RuntimeSemanticRule): string;
}

export interface RuntimeStyleElementSink {
	mount(css: string): boolean;
	update(css: string): void;
	/** Insert one newly ordered rule without rebuilding the whole style text. */
	insert?(rule: RuntimeRule, index: number, existingRuleCount: number): boolean;
	unmount(): void;
}

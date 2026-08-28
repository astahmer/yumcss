/**
 * Runtime CSS sheet façade.
 *
 * Storage, serialization, and mounting are explicit ports so SSR, hydration,
 * devtools, and non-DOM hosts can reuse the same runtime artifact model.
 */
import {
	CssRuntimeRuleSerializer,
	RuntimeRuleStore,
	type RuntimeRule,
	type RuntimeRuleSerializer,
	type RuntimeSemanticRule,
	type RuntimeSheetSnapshot,
} from "./runtime-artifacts.ts";
import {
	createRuntimeRuleCanonicalizer,
	createRuntimeOrderingPolicy,
	type RuntimeOrderingPolicy,
	type RuntimeRuleCanonicalizer,
} from "./runtime-policies.ts";
import { DomStyleSink, type RuntimeDocument, type RuntimeStyleSink } from "./runtime-sink.ts";

export type {
	RuntimeDeclaration,
	RuntimeRule,
	RuntimeSemanticRule,
	RuntimeSemanticRuleKind,
	RuntimeSheetSnapshot,
} from "./runtime-artifacts.ts";
export type { RuntimeOrderingPolicy, RuntimeRuleCanonicalizer } from "./runtime-policies.ts";

const DEFAULT_ID = "pandwind";

export interface RuntimeSheetOptions {
	/** Stable attribute value used to find the sheet during hydration. */
	readonly id?: string;
	/** Mount automatically when rules are first registered in a browser. */
	readonly autoMount?: boolean;
	/** Explicit document for tests, iframes, or multiple browser roots. */
	readonly document?: RuntimeDocument;
	/** Optional CSP nonce applied to the generated style element. */
	readonly nonce?: string;
	/** Injectable artifact serializer for alternate CSS dialects or diagnostics. */
	readonly serializer?: RuntimeRuleSerializer;
	/** Injectable deterministic ordering policy for SSR/devtools parity. */
	readonly ordering?: RuntimeOrderingPolicy;
	/** Injectable artifact canonicalization policy. */
	readonly canonicalizer?: RuntimeRuleCanonicalizer;
	/** Injectable sink for browser, test, or host-framework mounting. */
	readonly sink?: RuntimeStyleSink;
}

/** Create a deduplicating, SSR-safe runtime stylesheet. */
export function createRuntimeSheet(options: RuntimeSheetOptions = {}) {
	const id = options.id ?? DEFAULT_ID;
	const ordering = options.ordering ?? createRuntimeOrderingPolicy();
	const canonicalizer = options.canonicalizer ?? createRuntimeRuleCanonicalizer();
	const store = new RuntimeRuleStore(ordering, canonicalizer);
	const serializer = options.serializer ?? new CssRuntimeRuleSerializer({ ordering });
	const sink =
		options.sink ??
		new DomStyleSink({
			id,
			document: options.document,
			nonce: options.nonce,
		});

	const render = (): void => sink.update(serializer.serialize(store));
	const refresh = (): void => {
		if (options.autoMount !== false) sink.mount(serializer.serialize(store));
		else render();
	};
	const register = (next: readonly RuntimeRule[]): void => {
		if (store.register(next)) refresh();
	};
	const setTokens = (next: string): void => {
		if (store.setTokens(next)) refresh();
	};
	const snapshot = (): RuntimeSheetSnapshot => store.snapshot();
	const hydrate = (input: RuntimeSheetSnapshot): void => {
		store.hydrate(input);
		refresh();
	};
	const registerSemanticRules = (next: readonly RuntimeSemanticRule[]): void => {
		register(
			next.map((rule, index) =>
				serializer.serializeSemantic({ ...rule, priority: rule.priority ?? index }),
			),
		);
	};

	return {
		id,
		css: () => serializer.serialize(store),
		register,
		registerSemanticRules,
		setTokens,
		snapshot,
		hydrate,
		mount: () => sink.mount(serializer.serialize(store)),
		unmount: () => sink.unmount(),
	};
}

export type RuntimeSheet = ReturnType<typeof createRuntimeSheet>;

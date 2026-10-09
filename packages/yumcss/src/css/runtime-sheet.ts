/** Runtime stylesheet façade composed from store, canonicalizer, ordering, serializer, and DOM sink ports. */
import { DomStyleElementSink } from "./runtime-sheet-sink.ts";
import { decorateCascadeRules, wrapCascadeLayer } from "./cascade.ts";
import { PriorityOrderingPolicy, RuntimeRuleStore } from "./runtime-sheet-policies.ts";
import { SemanticRuleCanonicalizer, SemanticRuleSerializer } from "./runtime-sheet-serializer.ts";
import { RuntimeSemanticRuleKindTag } from "./runtime-sheet-contracts.ts";
import type {
	RuntimeRule,
	RuntimeSemanticRule,
	RuntimeSheetOptions,
	RuntimeSheetSnapshot,
} from "./runtime-sheet-contracts.ts";

export type {
	RuntimeDeclaration,
	RuntimeDocument,
	RuntimeRule,
	RuntimeRuleCanonicalizer,
	RuntimeRuleSerializer,
	RuntimeRuleStore,
	RuntimeSemanticRule,
	RuntimeSemanticRuleKind,
	RuntimeSheetOptions,
	RuntimeSheetSnapshot,
	RuntimeStyleElement,
	RuntimeStyleElementSink,
} from "./runtime-sheet-contracts.ts";

/**
 * Replaceable policies for a {@link RuntimeSheet}.
 *
 * The default composition suits browser and SSR use. Pass explicit ports when
 * an integration needs a custom sink or wants to inspect the semantic rule
 * stream without coupling itself to the DOM.
 *
 * @category runtime
 * @since 0.1.0
 */
export interface RuntimeSheetPorts {
	readonly store?: RuntimeRuleStore;
	readonly ordering?: import("./runtime-sheet-contracts.ts").RuntimeOrderingPolicy;
	readonly canonicalizer?: import("./runtime-sheet-contracts.ts").RuntimeRuleCanonicalizer;
	readonly serializer?: import("./runtime-sheet-contracts.ts").RuntimeRuleSerializer;
	readonly sink?: import("./runtime-sheet-contracts.ts").RuntimeStyleElementSink;
}

interface RuntimeRuleBatch {
	readonly rules: readonly RuntimeRule[];
	readonly previousCount: number;
}

const runtimeTokenManifestRegistrationsKey = Symbol.for(
	"yumcss.runtime.token-manifest-registrations",
);
type RuntimeTokenManifestRegistration = (
	manifest: ReadonlyMap<string, string>,
	tokens: string,
) => void;
type RuntimeTokenManifestGlobal = typeof globalThis & {
	[runtimeTokenManifestRegistrationsKey]?: WeakMap<object, RuntimeTokenManifestRegistration>;
};
const runtimeGlobal = globalThis as RuntimeTokenManifestGlobal;
const runtimeTokenManifestRegistrations = (runtimeGlobal[runtimeTokenManifestRegistrationsKey] ??=
	new WeakMap());

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null;

const isSafeText = (value: unknown): value is string =>
	typeof value === "string" && value.length > 0 && !value.includes("\u0000");

const isSafeString = (value: unknown): value is string =>
	typeof value === "string" && !value.includes("\u0000");

const isNonEmptyString = (value: unknown): value is string =>
	typeof value === "string" && value.length > 0;

const isRuntimeRule = (value: unknown): value is RuntimeRule =>
	isRecord(value) &&
	isNonEmptyString(value.id) &&
	isSafeText(value.css) &&
	Number.isFinite(value.priority);

const isRuntimeTokenManifestEntry = (
	value: unknown,
): value is { readonly name: string; readonly fingerprint: string } =>
	isRecord(value) && isNonEmptyString(value.name) && isNonEmptyString(value.fingerprint);

const isRuntimeSemanticRule = (value: unknown): value is RuntimeSemanticRule => {
	if (!isRecord(value)) return false;
	type Pending = { readonly value: Record<string, unknown>; readonly exit: boolean };
	const active = new WeakSet<object>();
	const pending: Pending[] = [{ value, exit: false }];
	while (pending.length > 0) {
		const entry = pending.pop()!;
		if (entry.exit) {
			active.delete(entry.value);
			continue;
		}
		const current = entry.value;
		if (active.has(current)) return false;
		active.add(current);
		pending.push({ value: current, exit: true });
		const kind = current.kind;
		if (
			kind !== RuntimeSemanticRuleKindTag.Style &&
			kind !== RuntimeSemanticRuleKindTag.Global &&
			kind !== RuntimeSemanticRuleKindTag.Keyframes &&
			kind !== RuntimeSemanticRuleKindTag.FontFace &&
			kind !== RuntimeSemanticRuleKindTag.Layer &&
			kind !== RuntimeSemanticRuleKindTag.Supports &&
			kind !== RuntimeSemanticRuleKindTag.Property
		)
			return false;
		for (const key of ["id", "selector", "name", "layer"]) {
			if (current[key] !== undefined && !isSafeText(current[key])) return false;
		}
		if (current.priority !== undefined && !Number.isFinite(current.priority)) return false;
		if (current.conditions !== undefined) {
			if (!Array.isArray(current.conditions) || !Array.from(current.conditions).every(isSafeText))
				return false;
		}
		if (current.declarations !== undefined) {
			if (
				!Array.isArray(current.declarations) ||
				!Array.from(current.declarations).every(
					(item) =>
						isRecord(item) &&
						isSafeText(item.property) &&
						(isSafeText(item.value) ||
							(item.value === "" && item.property.startsWith("--") && item.property.length > 2) ||
							typeof item.value === "boolean" ||
							(typeof item.value === "number" && Number.isFinite(item.value))),
				)
			)
				return false;
		}
		if (current.children !== undefined) {
			if (!Array.isArray(current.children)) return false;
			for (let index = current.children.length - 1; index >= 0; index--) {
				const child = current.children[index];
				if (!isRecord(child)) return false;
				pending.push({ value: child, exit: false });
			}
		}
		if (
			(kind === RuntimeSemanticRuleKindTag.Keyframes ||
				kind === RuntimeSemanticRuleKindTag.Supports ||
				kind === RuntimeSemanticRuleKindTag.Property) &&
			typeof current.name !== "string"
		)
			return false;
		if (
			kind === RuntimeSemanticRuleKindTag.Layer &&
			current.layer === undefined &&
			current.name === undefined
		)
			return false;
	}
	return true;
};

/**
 * Create a runtime stylesheet with optional DOM mounting.
 *
 * A sheet deduplicates rules and keeps cascade order deterministic. Its
 * `snapshot` and `hydrate` methods make the same rule state portable from SSR
 * to the browser.
 *
 * @example
 * ```ts
 * import { createRuntimeSheet } from "yumcss/css/runtime";
 *
 * const serverSheet = createRuntimeSheet({ id: "app", autoMount: false });
 * serverSheet.register([
 *   { id: "button", css: ".button { color: var(--brand); }", priority: 0 },
 * ]);
 *
 * const snapshot = serverSheet.snapshot();
 * const clientSheet = createRuntimeSheet({ id: "app", autoMount: false });
 * clientSheet.hydrate(snapshot);
 * const css = clientSheet.css();
 * ```
 *
 * @param options - Identity, mounting, document, and CSP nonce options.
 * @param ports - Optional replacement policies.
 * @returns A live sheet with registration, serialization, mounting, and
 *   snapshot/hydration operations.
 * @category runtime
 * @since 0.1.0
 */
export function createRuntimeSheet(
	options: RuntimeSheetOptions = {},
	ports: RuntimeSheetPorts = {},
) {
	const store = ports.store ?? new RuntimeRuleStore();
	const ordering = ports.ordering ?? new PriorityOrderingPolicy();
	const serializer = ports.serializer ?? new SemanticRuleSerializer();
	const canonicalizer = ports.canonicalizer ?? new SemanticRuleCanonicalizer(serializer);
	const sink = ports.sink ?? new DomStyleElementSink(options);
	const hasDocument =
		options.document !== undefined || (globalThis as { document?: unknown }).document !== undefined;
	const autoMount = options.autoMount ?? (ports.sink !== undefined || hasDocument);
	let tokens = "";
	let tokenManifest = new Map<string, string>();
	let tokenManifestKnown = true;
	let generation = 0;
	let renderedGeneration = -1;
	let rendered = "";
	let orderedGeneration = -1;
	let ordered: RuntimeRule[] = [];
	let mounted = false;
	const invalidate = (): void => {
		generation++;
	};
	const orderedRules = (): RuntimeRule[] => {
		if (orderedGeneration !== generation) {
			ordered = ordering.order(store.rules);
			orderedGeneration = generation;
		}
		return ordered;
	};

	const css = (): string => {
		if (renderedGeneration === generation) return rendered;
		const rules = decorateCascadeRules(orderedRules(), options.cascade);
		const body = rules
			.map((rule) => rule.css)
			.filter(Boolean)
			.join("\n");
		rendered = wrapCascadeLayer([tokens, body].filter(Boolean).join("\n"), options.cascade);
		renderedGeneration = generation;
		return rendered;
	};
	const render = (): void => sink.update(css());
	const refresh = (batch?: RuntimeRuleBatch): void => {
		if (batch !== undefined && mounted && sink.insert !== undefined) {
			const additions = batch.rules
				.map((rule) => ({ rule, index: ordered.findIndex((current) => current.id === rule.id) }))
				.toSorted((left, right) => left.index - right.index);
			let existingRuleCount = batch.previousCount;
			for (const { rule, index } of additions) {
				if (!sink.insert(rule, index, existingRuleCount)) break;
				existingRuleCount++;
			}
			if (existingRuleCount === batch.previousCount + additions.length) return;
		}
		if (autoMount) mounted = sink.mount(css());
		else if (mounted) render();
	};
	const register = (rules: readonly RuntimeRule[]): void => {
		if (!Array.isArray(rules)) return;
		const validRules = rules.filter(isRuntimeRule);
		if (validRules.length === 0) return;
		const canInsert =
			options.cascade === undefined &&
			orderedGeneration === generation &&
			ordering.insert !== undefined &&
			validRules.every((rule, index) => {
				if (store.rules.has(rule.id)) return false;
				for (let previous = 0; previous < index; previous++) {
					if (validRules[previous]!.id === rule.id) return false;
				}
				return true;
			});
		if (store.register(validRules)) {
			const storedRules = validRules.flatMap((rule) => {
				const stored = store.rules.get(rule.id);
				return stored === undefined ? [] : [stored];
			});
			if (canInsert) {
				const previousCount = ordered.length;
				generation++;
				ordered = ordering.insert!(ordered, storedRules);
				orderedGeneration = generation;
				refresh({ rules: storedRules, previousCount });
			} else {
				invalidate();
				refresh();
			}
		}
	};
	const setTokens = (value: string): void => {
		if (!isSafeString(value)) return;
		if (tokens === value) return;
		tokens = value;
		tokenManifest = new Map();
		tokenManifestKnown = value === "";
		invalidate();
		refresh();
	};
	const registerTokens = (manifest: ReadonlyMap<string, string>, value: string): void => {
		if (value === "" || manifest.size === 0) return;
		if (!tokenManifestKnown && tokens !== "" && tokens !== value)
			throw new Error("yumcss: cannot combine runtime tokens with an unverified token prelude");
		let hasNewVariable = false;
		for (const [name, fingerprint] of manifest) {
			const existing = tokenManifest.get(name);
			if (existing !== undefined && existing !== fingerprint)
				throw new Error(`yumcss: conflicting runtime token variable '--${name}'`);
			if (existing === undefined) hasNewVariable = true;
		}
		let nextTokens = tokens;
		if (hasNewVariable)
			nextTokens = tokens === "" || tokens === value ? value : `${tokens}\n${value}`;
		for (const [name, fingerprint] of manifest) tokenManifest.set(name, fingerprint);
		tokenManifestKnown = true;
		if (tokens === nextTokens) return;
		tokens = nextTokens;
		invalidate();
		refresh();
	};
	const snapshot = (): RuntimeSheetSnapshot => ({
		tokens,
		rules: orderedRules().slice(),
		...(tokenManifestKnown
			? {
					tokenManifest: Array.from(tokenManifest, ([name, fingerprint]) => ({
						name,
						fingerprint,
					})).toSorted((left, right) => left.name.localeCompare(right.name)),
				}
			: {}),
	});
	const hydrate = (value: RuntimeSheetSnapshot): void => {
		if (!isRecord(value) || !isSafeString(value.tokens) || !Array.isArray(value.rules)) return;
		tokens = value.tokens;
		const manifest = value.tokenManifest;
		const manifestEntries = Array.isArray(manifest) ? Array.from(manifest) : undefined;
		if (manifestEntries?.every(isRuntimeTokenManifestEntry)) {
			const nextManifest = new Map(
				manifestEntries.map((entry) => [entry.name, entry.fingerprint]),
			);
			tokenManifestKnown =
				nextManifest.size === manifestEntries.length &&
				(value.tokens === "" || nextManifest.size > 0);
			tokenManifest = tokenManifestKnown ? nextManifest : new Map();
		} else {
			tokenManifest = new Map();
			tokenManifestKnown = value.tokens === "";
		}
		store.replace(value.rules.filter(isRuntimeRule));
		invalidate();
		refresh();
	};
	const registerSemanticRules = (rules: readonly RuntimeSemanticRule[]): void => {
		if (!Array.isArray(rules)) return;
		register(
			rules
				.filter(isRuntimeSemanticRule)
				.filter((rule) => (rule.declarations?.length ?? 0) > 0 || (rule.children?.length ?? 0) > 0)
				.map((rule, index) => {
					const canonical = canonicalizer.canonicalize({
						...rule,
						priority: rule.priority ?? index,
					});
					const previous = store.rules.get(canonical.id);
					if (rule.priority === undefined && previous?.css === canonical.css)
						return { ...canonical, priority: previous.priority };
					return canonical;
				}),
		);
	};

	const sheet = {
		id: options.id ?? "yumcss",
		css,
		register,
		registerSemanticRules,
		setTokens,
		snapshot,
		hydrate,
		mount: () => {
			mounted = sink.mount(css());
			return mounted;
		},
		unmount: () => {
			sink.unmount();
			mounted = false;
		},
	};
	runtimeTokenManifestRegistrations.set(sheet, registerTokens);
	return sheet;
}

/** The live sheet returned by {@link createRuntimeSheet}. */
export type RuntimeSheet = ReturnType<typeof createRuntimeSheet>;

export const registerRuntimeTokenManifest = (
	sheet: RuntimeSheet,
	manifest: ReadonlyMap<string, string>,
	tokens: string,
): void => {
	const register = runtimeTokenManifestRegistrations.get(sheet);
	if (register === undefined)
		throw new Error("yumcss: runtime sheet cannot accept token manifests");
	register(manifest, tokens);
};

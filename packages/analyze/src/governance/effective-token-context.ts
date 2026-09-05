/**
 * Effective token context (plans/054 step 2) — merge every statically
 * resolved token source into neutral governance definitions:
 *
 * - authored preset/design-system token groups (string values, plus
 *   condition-bound objects kept as scopedValues — never flattened);
 * - generated + imported CSS theme variables (@theme vars, transitive
 *   import crawl included);
 * - interop-artifact theme variables (authoritative when present).
 *
 * Loader failures, unresolved imports, and unknown generated sources become
 * diagnostics that downgrade certainty; the builder never invents tokens
 * from a guessed default vocabulary.
 */
import type { GovernanceDiagnostic, TokenDefinition, TokenDefinitionLayer } from "./contracts.ts";
import { mergeDefinition, tokenId } from "./ledger.ts";

export interface EffectiveTokenContextInputs {
	/**
	 * Authored token groups from the project's design system
	 * (group -> token -> string | condition-bound object).
	 */
	readonly tokenGroups?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
	/** Theme variables parsed from generated + crawled CSS (may include scopes). */
	readonly themeVars?: ReadonlyArray<{ name: string; value: string; scope?: string }>;
	/** Theme variables declared by the interop artifact (authoritative source). */
	readonly interopVariables?: Readonly<Record<string, string>>;
	/** @import specifiers the CSS crawl could not resolve. */
	readonly unresolvedImports?: ReadonlyArray<{ from: string; specifier: string }>;
	/** Official/config loader failures (message list). */
	readonly loaderFailures?: readonly string[];
	/** Provenance origin label for the design-system loader (default "pandwind"). */
	readonly origin?: string;
}

export interface EffectiveTokenContext {
	readonly definitions: readonly TokenDefinition[];
	readonly diagnostics: readonly GovernanceDiagnostic[];
}

const CONDITION_BOUND_VALUE = (value: unknown): value is Record<string, string> =>
	typeof value === "object" &&
	value !== null &&
	!Array.isArray(value) &&
	Object.values(value).every((v) => typeof v === "string");

/** Authored group + token -> governance definition (scoped when condition-bound). */
function definitionsFromTokenGroups(
	tokenGroups: Readonly<Record<string, Readonly<Record<string, unknown>>>>,
	origin: string,
): Array<TokenDefinition> {
	const out: Array<TokenDefinition> = [];
	for (const group of Object.keys(tokenGroups).toSorted()) {
		const entries = tokenGroups[group] ?? {};
		for (const name of Object.keys(entries).toSorted()) {
			const raw = entries[name];
			const provenance = [
				{ source: "official-config" as const, origin, detail: `${group}.${name}` },
			];
			if (typeof raw === "string") {
				out.push({
					id: tokenId(group, name),
					group,
					name,
					layer: "raw",
					value: raw,
					provenance,
				});
				continue;
			}
			if (CONDITION_BOUND_VALUE(raw)) {
				const scopedValues: Record<string, string> = { ...raw };
				const themes = Object.keys(scopedValues).toSorted();
				out.push({
					id: tokenId(group, name),
					group,
					name,
					layer: "scope",
					scopedValues,
					themes,
					provenance,
				});
				continue;
			}
			// Non-scalar, non-condition value (nested arrays/objects): the
			// definition exists but its resolved value is unknown to governance.
			out.push({
				id: tokenId(group, name),
				group,
				name,
				layer: "raw",
				provenance,
			});
		}
	}
	return out;
}

const cssVarTokenId = (varName: string): string => tokenId("css-var", varName);

/**
 * Generated/imported CSS theme vars -> css-var definitions. A scoped
 * re-binding (e.g. [data-theme="dark"] override) is recorded in
 * scopedValues under its selector; the cascade boundary stays explicit.
 */
function definitionsFromThemeVars(
	themeVars: ReadonlyArray<{ name: string; value: string; scope?: string }>,
): Array<TokenDefinition> {
	const byId = new Map<string, TokenDefinition>();
	for (const v of themeVars) {
		if (!v.name.startsWith("--")) continue;
		const id = cssVarTokenId(v.name);
		const provenance = [{ source: "imported-css" as const, detail: v.name }];
		const existing = byId.get(id);
		if (existing === undefined) {
			byId.set(id, {
				id,
				group: "css-var",
				name: v.name,
				layer: "raw",
				...(v.scope === undefined ? { value: v.value } : {}),
				...(v.scope === undefined ? {} : { scopedValues: { [v.scope]: v.value } }),
				provenance,
			});
			continue;
		}
		const incoming: TokenDefinition =
			v.scope === undefined
				? { id, group: "css-var", name: v.name, layer: "raw", value: v.value, provenance }
				: {
						id,
						group: "css-var",
						name: v.name,
						layer: "scope",
						scopedValues: { [v.scope]: v.value },
						themes: [v.scope],
						provenance,
					};
		byId.set(id, mergeDefinition(existing, incoming));
	}
	return [...byId.values()];
}

/** Interop artifact theme vars -> definitions merged over the css-var set. */
function definitionsFromInterop(
	variables: Readonly<Record<string, string>>,
	artifactDetail: string,
): Array<TokenDefinition> {
	const out: Array<TokenDefinition> = [];
	for (const name of Object.keys(variables).toSorted()) {
		const value = variables[name];
		if (typeof value !== "string" || !name.startsWith("--")) continue;
		out.push({
			id: cssVarTokenId(name),
			group: "css-var",
			name,
			layer: "raw",
			value,
			provenance: [{ source: "interop-artifact", detail: artifactDetail }],
		});
	}
	return out;
}

function diagnosticsFromFailures(inputs: EffectiveTokenContextInputs): GovernanceDiagnostic[] {
	const out: GovernanceDiagnostic[] = [];
	for (const f of inputs.loaderFailures ?? []) {
		out.push({
			severity: "warning",
			code: "governance/config-load-failed",
			message: f,
			boundary: "configuration-failure",
		});
	}
	for (const u of inputs.unresolvedImports ?? []) {
		out.push({
			severity: "warning",
			code: "governance/unresolved-import",
			message: `unresolved css import "${u.specifier}" from ${u.from}`,
			file: u.from,
			boundary: "unresolved-import",
		});
	}
	return out;
}

/**
 * Build the effective token universe. Identity is canonical: authored group
 * tokens are `<group>::<name>`, CSS theme variables are
 * `css-var::<--name>` so generated CSS, crawled imports, and the interop
 * artifact all collapse onto one definition with merged provenance.
 */
export function buildEffectiveTokenContext(
	inputs: EffectiveTokenContextInputs,
): EffectiveTokenContext {
	const origin = inputs.origin ?? "pandwind";
	const byId = new Map<string, TokenDefinition>();
	const absorb = (defs: ReadonlyArray<TokenDefinition>): void => {
		for (const def of defs) {
			const existing = byId.get(def.id);
			byId.set(def.id, existing === undefined ? def : mergeDefinition(existing, def));
		}
	};

	absorb(definitionsFromTokenGroups(inputs.tokenGroups ?? {}, origin));
	absorb(definitionsFromThemeVars(inputs.themeVars ?? []));
	absorb(
		definitionsFromInterop(inputs.interopVariables ?? {}, "pandwind.interop.json theme.variables"),
	);

	return {
		definitions: [...byId.values()].toSorted((a, b) => a.id.localeCompare(b.id)),
		diagnostics: diagnosticsFromFailures(inputs),
	};
}

/** Layer helper for callers mapping ecosystem tiers into governance layers. */
export const layerForTokenGroup = (group: string): TokenDefinitionLayer =>
	group === "semantic" ? "semantic" : "raw";

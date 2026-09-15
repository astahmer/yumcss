/**
 * Official-config governance adapter (plans/054 steps 2+5) — derive the
 * effective token universe and the strict-token policy snapshot from a
 * loaded preset module (the ecosystem's official define.preset output).
 *
 * Safety: the adapter reads only what the preset actually declares. A
 * missing or failed load yields diagnostics and a report-only (unresolved)
 * policy — never a guessed vocabulary or invented strictness.
 */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { TokenPolicySnapshot } from "./contracts.ts";
import type { EffectiveTokenContextInputs } from "./effective-token-context.ts";

type PresetModule = Record<string, unknown>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

/** Candidate order mirrors the codegen theme-input loaders: default export first. */
export const presetCandidates = (module: PresetModule): Array<Record<string, unknown>> =>
	[
		module.default,
		...Object.entries(module)
			.filter(([name]) => name !== "default")
			.map(([, v]) => v),
	].filter(isRecord);

export interface DerivedProjectContext {
	readonly tokenGroups?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
	readonly policy: TokenPolicySnapshot | null;
}

/**
 * Per-property classification of the official `properties` surface:
 * - `true` / list form: unconstrained — every CSS value stays type-legal;
 * - `$strictness: "inherits"`: raw values stay allowed by declaration;
 * - token-constrained objects (`$tokens` or declared literal value sets):
 *   strict mode makes non-declared literals violations, and declared
 *   non-token literal keys become per-property raw escape hatches.
 */
function derivePolicySnapshot(
	preset: Record<string, unknown>,
	tokenVocabulary: Readonly<Record<string, Readonly<Record<string, string>>>>,
): TokenPolicySnapshot {
	const properties = preset.properties as Record<string, unknown>;
	const strict = preset.strict === true;
	const strictProperties: string[] = [];
	const allowedRawValuesByProperty: Record<string, string[]> = {};
	for (const prop of Object.keys(properties).toSorted()) {
		const value = properties[prop];
		if (!isRecord(value)) continue;
		if (value.$strictness === "inherits") continue;
		const constrained =
			typeof value.$tokens === "string" ||
			Object.keys(value).some((k) => !k.startsWith("$") && typeof value[k] === "string");
		if (!constrained) continue;
		if (strict) strictProperties.push(prop);
		const allowed: string[] = [];
		for (const key of Object.keys(value).toSorted()) {
			// Token-constraint keys ($tokens, spread token names) are token
			// vocabulary, not raw allowances; only declared raw literals are.
			if (key.startsWith("$")) continue;
			if (typeof value[key] !== "string") continue;
			allowed.push(key);
		}
		if (allowed.length > 0) allowedRawValuesByProperty[prop] = allowed;
	}
	return {
		owner: "pandwind",
		resolved: true,
		allowedRawPrefixes: [],
		strictProperties,
		allowedRawValuesByProperty,
		...(Object.keys(tokenVocabulary).length > 0 ? { tokenVocabulary } : {}),
		origin: "official-loader",
	};
}

/** Map authored per-property token names to canonical group::name ids. */
function vocabularyByProperty(
	preset: Record<string, unknown>,
	tokenGroups: Readonly<Record<string, Readonly<Record<string, unknown>>>>,
): Record<string, Record<string, string>> {
	const namesToIds = new Map<string, string[]>();
	for (const group of Object.keys(tokenGroups).toSorted()) {
		for (const name of Object.keys(tokenGroups[group] ?? {}).toSorted()) {
			const list = namesToIds.get(name) ?? [];
			list.push(group + "::" + name);
			namesToIds.set(name, list);
		}
	}
	const properties = preset.properties as Record<string, unknown>;
	const out: Record<string, Record<string, string>> = {};
	for (const prop of Object.keys(properties).toSorted()) {
		const value = properties[prop];
		if (!isRecord(value)) continue;
		const vocab: Record<string, string> = {};
		for (const key of Object.keys(value).toSorted()) {
			if (key === "$tokens") {
				// $tokens: <group> pulls the group's vocabulary wholesale.
				const group = value[key];
				if (typeof group !== "string") continue;
				for (const name of Object.keys(tokenGroups[group] ?? {}).toSorted()) {
					const ids = namesToIds.get(name) ?? [];
					vocab[name] = ids.length === 1 ? ids[0]! : "$" + name;
				}
				continue;
			}
			if (key.startsWith("$")) continue;
			const ids = namesToIds.get(key) ?? [];
			vocab[key] = ids.length === 1 ? ids[0]! : "$" + key;
		}
		if (Object.keys(vocab).length > 0) out[prop] = vocab;
	}
	return out;
}

/**
 * Derive governance inputs from a loaded preset module. Returns
 * policy=null (report-only) when no export declares the official strict
 * surface (`strict` + `properties`); token groups come from its `tokens`
 * field when present.
 */
export function deriveProjectGovernanceContext(module: PresetModule): DerivedProjectContext {
	for (const candidate of presetCandidates(module)) {
		if (typeof candidate.strict !== "boolean") continue;
		if (!isRecord(candidate.properties)) continue;
		const tokenGroups = isRecord(candidate.tokens)
			? (candidate.tokens as Record<string, Record<string, unknown>>)
			: undefined;
		const vocabulary = vocabularyByProperty(candidate, tokenGroups ?? {});
		return {
			...(tokenGroups === undefined ? {} : { tokenGroups }),
			policy: derivePolicySnapshot(candidate, vocabulary),
		};
	}
	return { policy: null };
}

export type OfficialPresetLoad =
	| { readonly status: "loaded"; readonly module: PresetModule; readonly path: string }
	| { readonly status: "failed"; readonly message: string };

const isPackageSpecifier = (modulePath: string): boolean =>
	!modulePath.startsWith("/") && !modulePath.startsWith(".");

/** Load a preset module by package specifier or project-relative path. */
export async function loadOfficialPresetModule(
	specifier: string,
	root: string,
): Promise<OfficialPresetLoad> {
	try {
		const isPackage = isPackageSpecifier(specifier);
		const target = isPackage ? specifier : pathToFileURL(resolve(root, specifier)).href;
		const module = (await import(target)) as PresetModule;
		return { status: "loaded", module, path: isPackage ? specifier : resolve(root, specifier) };
	} catch (error) {
		return {
			status: "failed",
			message: `official preset load failed for ${specifier}: ${String(error)}`,
		};
	}
}

export interface ProjectGovernanceInputs {
	readonly tokenContext: EffectiveTokenContextInputs;
	readonly policy: TokenPolicySnapshot | null;
}

/**
 * Turn a preset-module load into governance service inputs. A failed load
 * becomes a configuration-failure diagnostic and a report-only policy; a
 * preset without a strict surface keeps its tokens but downgrades
 * strictness to unknown (never guessed).
 */
export function projectGovernanceInputs(load: OfficialPresetLoad): ProjectGovernanceInputs {
	if (load.status === "failed") {
		return { tokenContext: { loaderFailures: [load.message] }, policy: null };
	}
	const derived = deriveProjectGovernanceContext(load.module);
	if (derived.policy === null) {
		return {
			tokenContext: {
				...(derived.tokenGroups === undefined ? {} : { tokenGroups: derived.tokenGroups }),
				loaderFailures: [
					`official preset ${load.path} declares no strict-token policy surface (strict/properties) — strictness is report-only`,
				],
			},
			policy: null,
		};
	}
	return {
		tokenContext: derived.tokenGroups === undefined ? {} : { tokenGroups: derived.tokenGroups },
		policy: derived.policy,
	};
}

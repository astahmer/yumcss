import { dirnameDocumentPath, isAbsoluteDocumentPath, joinDocumentPath } from "../path-utils.ts";
import { createSourceProjectBindingIndex } from "pandwind/source";
import {
	ADAPTER_CAPABILITIES_SCHEMA,
	AdapterCapabilityLevelTag,
	type AdapterCapabilities,
	type AdapterCapabilityLevel,
} from "./capabilities.ts";
import type {
	AdapterConfigContext,
	AdapterDependencies,
	AdapterDetectionContext,
	AdapterProjectConfig,
} from "./adapter-contract.ts";

/** Cohesive construction utilities used by concrete adapter modules. */
export class CodemodAdapterKit {
	static dependency(
		name: string,
		kind: AdapterDependencies["packages"][number]["kind"],
	): AdapterDependencies {
		return { packages: [{ name, kind }] };
	}

	static allRuleCapabilities(
		adapterId: string,
		dynamic: AdapterCapabilityLevel,
		capabilities: Partial<AdapterCapabilities["capabilities"]> = {},
	): AdapterCapabilities {
		return {
			schema: ADAPTER_CAPABILITIES_SCHEMA,
			adapter: adapterId,
			capabilities: {
				declarations: AdapterCapabilityLevelTag.Exact,
				"rule-level": AdapterCapabilityLevelTag.Exact,
				"global-rules": AdapterCapabilityLevelTag.Exact,
				keyframes: AdapterCapabilityLevelTag.Exact,
				"font-face": AdapterCapabilityLevelTag.Exact,
				layers: AdapterCapabilityLevelTag.Exact,
				"supports-rules": AdapterCapabilityLevelTag.Exact,
				"property-rules": AdapterCapabilityLevelTag.Exact,
				selectors: AdapterCapabilityLevelTag.Exact,
				nesting: AdapterCapabilityLevelTag.Exact,
				ordering: AdapterCapabilityLevelTag.Exact,
				"token-values": AdapterCapabilityLevelTag.Exact,
				"dynamic-values": dynamic,
				"function-values": AdapterCapabilityLevelTag.Unsupported,
				"pseudo-conditions": AdapterCapabilityLevelTag.Exact,
				"selector-conditions": AdapterCapabilityLevelTag.Exact,
				"media-conditions": AdapterCapabilityLevelTag.Exact,
				"container-conditions": AdapterCapabilityLevelTag.Exact,
				"supports-conditions": AdapterCapabilityLevelTag.Exact,
				...capabilities,
			},
		};
	}

	static configFor(
		id: string,
		configFiles: readonly string[],
		context: AdapterConfigContext,
	): AdapterProjectConfig {
		const files: string[] = [];
		const values: Record<string, unknown> = {};
		const readFile = context.readFile;
		const packageText =
			context.packageJson === undefined && context.root !== undefined && readFile !== undefined
				? readFile(joinDocumentPath(context.root, "package.json"))
				: undefined;
		let packageJson = context.packageJson;
		if (packageJson === undefined && packageText !== undefined) {
			try {
				packageJson = JSON.parse(packageText) as Readonly<Record<string, unknown>>;
			} catch {
				values.packageJsonError = "package.json could not be parsed";
			}
		}
		if (packageJson !== undefined) values.packageJson = packageJson;
		for (const relative of configFiles) {
			if (context.root === undefined || readFile === undefined) continue;
			const file = joinDocumentPath(context.root, relative);
			const text = readFile(file);
			if (text === undefined) continue;
			files.push(file);
			if (relative.endsWith(".json")) {
				try {
					values[relative] = JSON.parse(text);
				} catch {
					values[`${relative}:error`] = "configuration JSON could not be parsed";
				}
			} else {
				values[relative] = text;
			}
		}
		return { adapter: id, root: context.root, files, values };
	}

	static detectBy(
		patterns: readonly RegExp[],
		context: AdapterDetectionContext,
	): { matched: boolean; confidence: number; evidence: string[] } {
		const evidence = patterns.flatMap((pattern) => {
			pattern.lastIndex = 0;
			const matched = pattern.test(context.source);
			pattern.lastIndex = 0;
			return matched ? [pattern.source] : [];
		});
		if (evidence.length === 0 && context.root !== undefined && context.readFile !== undefined) {
			const file = isAbsoluteDocumentPath(context.file)
				? context.file
				: joinDocumentPath(context.root, context.file);
			const projectBindings = createSourceProjectBindingIndex({
				read: (candidate) => {
					const source = context.readFile?.(candidate);
					return source === undefined ? undefined : { file: candidate, source };
				},
				resolve: (importer, specifier) => {
					if (!specifier.startsWith(".")) return undefined;
					const base = joinDocumentPath(dirnameDocumentPath(importer), specifier);
					return [
						base,
						`${base}.ts`,
						`${base}.tsx`,
						`${base}.js`,
						`${base}.jsx`,
						`${base}/index.ts`,
						`${base}/index.tsx`,
					].find((candidate) => context.readFile?.(candidate) !== undefined);
				},
			});
			const resolvedEvidence =
				projectBindings.index(file)?.bindings.flatMap((binding) => {
					const resolved = projectBindings.resolve(file, binding.localName) ?? binding;
					return patterns.some((pattern) => {
						pattern.lastIndex = 0;
						const matched = pattern.test(`${resolved.source}:${resolved.importedName}`);
						pattern.lastIndex = 0;
						return matched;
					})
						? [`project-binding:${binding.localName}->${resolved.source}`]
						: [];
				}) ?? [];
			evidence.push(...resolvedEvidence);
		}
		return {
			matched: evidence.length > 0,
			confidence: evidence.length === 0 ? 0 : Math.min(1, 0.5 + evidence.length * 0.2),
			evidence,
		};
	}
}

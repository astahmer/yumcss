import type {
	AdapterDetectionContext,
	AdapterSourceModuleOwnership,
} from "../../adapter-contract.ts";
import { joinDocumentPath } from "../../../path-utils.ts";
import { SourcePass } from "../../../source-pass-utils.ts";

export const PANDA_ENTRYPOINTS = ["css", "jsx", "patterns", "recipes", "tokens"] as const;
type PandaEntrypoint = (typeof PANDA_ENTRYPOINTS)[number];

export const PANDA_SOURCE_MODULES = [
	"@pandacss/dev",
	"styled-system/css",
	"styled-system/jsx",
	"styled-system/patterns",
	"styled-system/recipes",
	"styled-system/tokens",
] as const;

export interface PandaPackageImport {
	readonly specifier: string;
	readonly target: string;
}

export interface PandaSourceModuleConfiguration {
	readonly importMap?: unknown;
	readonly outdir?: string;
	readonly packageImports: readonly PandaPackageImport[];
}

const normalizePandaSourceModule = (moduleSpecifier: string): string =>
	moduleSpecifier.replace(/^#/, "");

const entrypointFromModule = (moduleSpecifier: string): PandaEntrypoint | undefined => {
	const match = /(?:^|\/)(css|jsx|patterns|recipes|tokens)$/u.exec(
		normalizePandaSourceModule(moduleSpecifier),
	);
	const candidate = match?.[1];
	return PANDA_ENTRYPOINTS.find((entrypoint) => entrypoint === candidate);
};

export const isPandaGeneratedSourceModule = (
	actualSource: string,
	expectedSource?: string,
): boolean => {
	if (expectedSource !== undefined) {
		const normalizedActual = normalizePandaSourceModule(actualSource);
		const normalizedExpected = normalizePandaSourceModule(expectedSource);
		return (
			normalizedActual === normalizedExpected || normalizedActual.endsWith(`/${normalizedExpected}`)
		);
	}
	return /(?:^|[/#])styled-system\/(?:css|jsx|patterns|recipes|tokens)$/u.test(actualSource);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const stringValues = (value: unknown): readonly string[] => {
	if (typeof value === "string") return [value];
	if (!Array.isArray(value)) return [];
	return value.filter((item): item is string => typeof item === "string");
};

const importMapModule = (base: string, entrypoint: PandaEntrypoint): string => {
	const normalized = base.replace(/\/+$/u, "");
	if (normalized.endsWith(`/${entrypoint}`)) return normalized;
	if (normalized.endsWith("/*")) return `${normalized.slice(0, -2)}/${entrypoint}`;
	return `${normalized}/${entrypoint}`;
};

const modulesFromImportMap = (importMap: unknown): readonly string[] => {
	if (typeof importMap === "string")
		return PANDA_ENTRYPOINTS.map((entrypoint) => importMapModule(importMap, entrypoint));
	if (Array.isArray(importMap)) return importMap.flatMap(modulesFromImportMap);
	if (!isRecord(importMap)) return [];
	const modules: string[] = [];
	for (const entrypoint of PANDA_ENTRYPOINTS) {
		for (const value of stringValues(importMap[entrypoint]))
			modules.push(importMapModule(value, entrypoint));
	}
	return modules;
};

const collectImportTargets = (value: unknown): readonly string[] => {
	if (typeof value === "string") return [value];
	if (Array.isArray(value)) return value.flatMap(collectImportTargets);
	if (!isRecord(value)) return [];
	return Object.values(value).flatMap(collectImportTargets);
};

const normalizedPath = (value: string): string =>
	value.replaceAll("\\", "/").replace(/^\.\//u, "").replace(/\/+$/u, "");

const targetLooksLikePandaOutput = (target: string, outdir: string | undefined): boolean => {
	const normalizedTarget = normalizedPath(target);
	const normalizedOutdir = outdir === undefined ? undefined : normalizedPath(outdir);
	return (
		normalizedTarget.includes("styled-system") ||
		(normalizedOutdir !== undefined && normalizedTarget.includes(normalizedOutdir))
	);
};

const modulesFromPackageImports = (
	imports: readonly PandaPackageImport[],
	outdir: string | undefined,
): readonly string[] => {
	const modules: string[] = [];
	for (const entry of imports) {
		if (!targetLooksLikePandaOutput(entry.target, outdir)) continue;
		const packageSpecifier = entry.specifier.replace(/\/\*$/u, "");
		const entrypoint = entrypointFromModule(packageSpecifier);
		if (entrypoint !== undefined) {
			modules.push(packageSpecifier);
			continue;
		}
		if (!entry.specifier.endsWith("/*") || !entry.target.includes("*")) continue;
		const alias = entry.specifier.slice(0, -2).replace(/\/+$/u, "");
		for (const pandaEntrypoint of PANDA_ENTRYPOINTS) modules.push(`${alias}/${pandaEntrypoint}`);
	}
	return modules;
};

const sourceModuleImportPattern = /\bimport\s+[\s\S]*?\s+from\s+["']([^"']+)["']/gu;

export const hasPandaSourceModuleImport = (
	source: string,
	ownership: AdapterSourceModuleOwnership,
): boolean => {
	const modules = new Set(ownership.modules);
	return [...source.matchAll(sourceModuleImportPattern)].some((match) => {
		const moduleSpecifier = match[1];
		return (
			moduleSpecifier !== undefined &&
			(modules.has(moduleSpecifier) ||
				ownership.matchers?.some((matcher) => matcher(moduleSpecifier)) === true)
		);
	});
};

export const resolvePandaSourceModuleOwnership = ({
	importMap,
	outdir,
	packageImports = [],
	modules: baseModules = PANDA_SOURCE_MODULES,
	matchers = [isPandaGeneratedSourceModule],
}: {
	readonly importMap?: unknown;
	readonly outdir?: string;
	readonly packageImports?: readonly PandaPackageImport[];
	readonly modules?: readonly string[];
	readonly matchers?: readonly ((moduleSpecifier: string) => boolean)[];
}): AdapterSourceModuleOwnership => {
	const modules = [
		...new Set([
			...baseModules,
			...modulesFromImportMap(importMap),
			...modulesFromPackageImports(packageImports, outdir),
		]),
	];
	const knownModules = new Set(modules);
	return {
		modules,
		matchers,
		semanticMatchers: [
			(actualSource, expectedSource) =>
				isPandaGeneratedSourceModule(actualSource, expectedSource) ||
				(knownModules.has(actualSource) &&
					knownModules.has(expectedSource) &&
					entrypointFromModule(actualSource) === entrypointFromModule(expectedSource)),
		],
	};
};

const packageImportsFromJson = (
	packageJson: Readonly<Record<string, unknown>> | undefined,
): readonly PandaPackageImport[] => {
	const imports = packageJson?.imports;
	if (!isRecord(imports)) return [];
	return Object.entries(imports).flatMap(([specifier, target]) =>
		collectImportTargets(target).map((value) => ({ specifier, target: value })),
	);
};

export const pandaImportMapFromSource = (source: string): unknown => {
	const property = /\bimportMap\s*:\s*/u.exec(source);
	if (property === null) return undefined;
	const start = property.index + property[0].length;
	const stringValue = /^(["'])(.*?)\1/u.exec(source.slice(start));
	if (stringValue?.[2] !== undefined) return stringValue[2];
	const objectStart = source.indexOf("{", start);
	if (objectStart < 0) return undefined;
	const block = SourcePass.matchBlock(source, objectStart);
	if (block === null) return undefined;
	const result: Record<string, string | readonly string[]> = {};
	for (const match of block.body.matchAll(
		/\b(css|jsx|patterns|recipes|tokens)\s*:\s*(?:(["'])(.*?)\2|\[([^\]]*)\])/gu,
	)) {
		const key = match[1];
		if (key === undefined) continue;
		if (match[3] !== undefined) {
			result[key] = match[3];
			continue;
		}
		const values = [...(match[4] ?? "").matchAll(/["']([^"']+)["']/gu)].map((value) => value[1]);
		result[key] = values.filter((value): value is string => value !== undefined);
	}
	return result;
};

export const pandaOutdirFromSource = (source: string): string | undefined =>
	/\boutdir\s*:\s*["']([^"']+)["']/u.exec(source)?.[1];

export const pandaSourceModuleConfigurationFromContext = (
	context: Pick<AdapterDetectionContext, "root" | "packageJson" | "readFile">,
): PandaSourceModuleConfiguration => {
	const root = context.root;
	const readFile = context.readFile;
	const packageJson =
		context.packageJson ??
		(root === undefined || readFile === undefined
			? undefined
			: (() => {
					const source = readFile(joinDocumentPath(root, "package.json"));
					if (source === undefined) return undefined;
					try {
						const parsed: unknown = JSON.parse(source);
						return isRecord(parsed) ? parsed : undefined;
					} catch {
						return undefined;
					}
				})());
	const configSources =
		root === undefined || readFile === undefined
			? []
			: ["panda.config.ts", "panda.config.tsx", "panda.config.js", "panda.config.mjs"]
					.map((file) => readFile(joinDocumentPath(root, file)))
					.filter((source): source is string => source !== undefined);
	const configSource = configSources[0];
	const outdir = configSource === undefined ? undefined : pandaOutdirFromSource(configSource);
	return {
		...(configSource === undefined ? {} : { importMap: pandaImportMapFromSource(configSource) }),
		...(outdir === undefined ? {} : { outdir }),
		packageImports: packageImportsFromJson(packageJson),
	};
};

export const pandaSourceModuleOwnershipFromContext = (
	context: Pick<AdapterDetectionContext, "root" | "packageJson" | "readFile">,
): AdapterSourceModuleOwnership =>
	resolvePandaSourceModuleOwnership(pandaSourceModuleConfigurationFromContext(context));

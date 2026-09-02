import { dirname, join } from "node:path";
import type { ProjectModuleLoader } from "../../project-module-loader.ts";

/** Panda's documented JSX style-prop mode from the effective config. */
export const enum PandaJsxStylePropsModeTag {
	All = "all",
	Minimal = "minimal",
	None = "none",
}

export type PandaStylePropEvidence =
	| "official-package"
	| "generated-system"
	| "config"
	| "fallback";

export interface PandaStylePropContract {
	readonly mode: PandaJsxStylePropsModeTag;
	readonly evidence: readonly PandaStylePropEvidence[];
	readonly matches: (name: string) => boolean;
}

interface PandaStylePropConfig {
	readonly jsxStyleProps?: PandaJsxStylePropsModeTag | "all" | "minimal" | "none";
	readonly outdir?: string;
}

interface PandaValidPropPackage {
	readonly isCssProperty?: (value: string) => boolean;
}

const stylePropNamesFromDeclaration = (
	source: string,
	interfaceName: string,
): readonly string[] => {
	const body = new RegExp(
		`(?:interface|type)\\s+${interfaceName}\\b[^\\{]*\\{([\\s\\S]*?)\\}`,
		"u",
	).exec(source)?.[1];
	if (body === undefined) return [];
	return [
		...body.matchAll(/^\s*(?:readonly\s+)?(?:["']([^"']+)["']|([A-Za-z_$][\w$-]*))\??\s*:/gmu),
	].map((match) => match[1] ?? match[2]!);
};

const generatedStylePropFiles = (
	configPath: string,
	config: PandaStylePropConfig,
): readonly string[] => {
	const outdir = config.outdir ?? "styled-system";
	return [
		join(dirname(configPath), outdir, "types", "system.d.ts"),
		join(dirname(configPath), outdir, "types", "system-types.d.ts"),
	];
};

const fallbackStylePropContract = (
	mode: PandaJsxStylePropsModeTag,
	aliases: readonly string[],
	conditions: readonly string[],
): PandaStylePropContract => {
	const names = new Set(["css", ...aliases, ...conditions]);
	return {
		mode,
		evidence: ["fallback"],
		matches: (name) => names.has(name),
	};
};

/**
 * Resolve Panda's JSX prop vocabulary from Panda-owned evidence.
 *
 * The fallback intentionally recognizes only the stable `css` carrier,
 * generated aliases, and conditions already present in the loaded config.
 * It does not guess that an arbitrary JSX attribute is a style prop: without
 * Panda's validator or generated SystemProperties, a component prop can be
 * mistaken for CSS and silently removed from the host.
 */
export async function resolvePandaStylePropContract(
	configPath: string,
	config: PandaStylePropConfig,
	aliases: readonly string[],
	conditions: readonly string[],
	loader: ProjectModuleLoader,
	readFile: (file: string) => string | undefined,
): Promise<PandaStylePropContract> {
	const mode = config.jsxStyleProps ?? PandaJsxStylePropsModeTag.All;
	if (mode === PandaJsxStylePropsModeTag.None)
		return { mode, evidence: ["config"], matches: () => false };
	if (mode === PandaJsxStylePropsModeTag.Minimal)
		return { mode, evidence: ["config"], matches: (name) => name === "css" };

	const names = new Set(["css", ...aliases, ...conditions]);
	const validPropPackage = await loader.importPackage<PandaValidPropPackage>(
		"@pandacss/is-valid-prop",
		dirname(configPath),
	);
	if (validPropPackage?.isCssProperty !== undefined)
		return {
			mode,
			evidence: ["official-package"],
			matches: (name) => names.has(name) || validPropPackage.isCssProperty!(name),
		};

	for (const file of generatedStylePropFiles(configPath, config)) {
		const source = readFile(file);
		if (source === undefined) continue;
		const generated = [
			...stylePropNamesFromDeclaration(source, "SystemProperties"),
			...stylePropNamesFromDeclaration(source, "Conditions"),
		];
		if (generated.length === 0) continue;
		for (const name of generated) names.add(name);
		return { mode, evidence: ["generated-system"], matches: (name) => names.has(name) };
	}

	return fallbackStylePropContract(mode, aliases, conditions);
}

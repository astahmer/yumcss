import { expect } from "vitest";
import {
	CodemodAdapterId,
	createBuiltinCodemodCatalog,
	runAdapterMigration,
	runAdapterMigrationAsync,
	StyleMigrationOutcome,
	StyleRepresentationKind,
	type AdapterMigrationOptions,
	type AdapterMigrationResult,
} from "../src/swap/index.ts";
import type { ProjectModuleLoader } from "../src/swap/project-module-loader.ts";

const catalog = createBuiltinCodemodCatalog();

interface AdapterRouteInput {
	readonly source: string;
	readonly file: string;
	readonly semantic?: AdapterMigrationOptions["semantic"];
	readonly project?: AdapterRouteProject;
}

/** Virtual project context used by route specs to exercise config-aware adapters. */
interface AdapterRouteProject {
	readonly root: string;
	readonly packageJson?: Readonly<Record<string, unknown>>;
	readonly files: Readonly<Record<string, string>>;
	readonly moduleLoader?: ProjectModuleLoader;
	readonly loaderCalls: {
		readonly packages: string[];
		readonly files: string[];
	};
}

const routeProjectRoot = "/virtual/pandwind-route-project";

function routeProjectFiles(
	adapter: CodemodAdapterId,
	color: string,
): Readonly<Record<string, string>> {
	const quotedColor = JSON.stringify(color);
	switch (adapter) {
		case CodemodAdapterId.Panda:
			return {
				[`${routeProjectRoot}/panda.config.ts`]: `export default { theme: { extend: { tokens: { colors: { brand: { 500: { value: ${quotedColor} } } }, spacing: { card: { value: "1.125rem" } } } } } };`,
			};
		case CodemodAdapterId.Pandwind:
			return {
				[`${routeProjectRoot}/pandwind.interop.json`]: '{"generatedFrom":{"bridge":"bridge.ts"}}',
				[`${routeProjectRoot}/bridge.ts`]:
					'import { pandwindPreset } from "pandwind/preset";\nexport const bridge = { preset: pandwindPreset };',
			};
		case CodemodAdapterId.ChakraUi:
			return {
				[`${routeProjectRoot}/theme.ts`]: `export default { theme: { tokens: { colors: { brand: { 500: { value: ${quotedColor} } } } } } };`,
			};
		case CodemodAdapterId.Mui:
			return {
				[`${routeProjectRoot}/src/theme.ts`]: `export default { palette: { primary: { main: ${quotedColor} } }, spacing: { card: "1.125rem" } };`,
			};
		case CodemodAdapterId.Mantine:
			return {
				[`${routeProjectRoot}/src/theme.ts`]: `export default { colors: { brand: [${quotedColor}] }, spacing: { card: "1.125rem" } };`,
			};
		case CodemodAdapterId.Tailwind:
			return {
				[`${routeProjectRoot}/tailwind.css`]: `@import "tailwindcss"; @theme { --color-brand: ${color}; --spacing-card: 1.125rem; }`,
			};
		case CodemodAdapterId.UnoCSS:
			return {
				[`${routeProjectRoot}/uno.config.ts`]: `export default defineConfig({ theme: { colors: { brand: ${quotedColor} }, spacing: { card: "1.125rem" } } });`,
				[`${routeProjectRoot}/src/styles.css`]: `@theme { --color-brand: ${color}; }`,
			};
		case CodemodAdapterId.Tokenami:
			return {
				[`${routeProjectRoot}/.tokenami/tokenami.config.ts`]: `export default { tokens: { colors: { brand: { value: ${quotedColor} } } } };`,
			};
		default:
			return {};
	}
}

function hasAdapter(adapters: ReadonlySet<CodemodAdapterId>, adapter: CodemodAdapterId): boolean {
	return adapters.has(adapter);
}

function routeProjectLoader(
	adapters: ReadonlySet<CodemodAdapterId>,
	color: string,
	loaderCalls: AdapterRouteProject["loaderCalls"],
): ProjectModuleLoader {
	const theme = {
		colors: { brand: { 500: { value: color } } },
		spacing: { card: "1.125rem" },
	};
	return {
		async importPackage<T>(packageName: string): Promise<T | undefined> {
			loaderCalls.packages.push(packageName);
			if (hasAdapter(adapters, CodemodAdapterId.Panda)) {
				if (packageName === "@pandacss/config")
					return {
						loadConfig: async () => ({
							config: {
								theme: { extend: { tokens: theme } },
							},
						}),
					} as T;
				if (packageName === "@pandacss/is-valid-prop")
					return {
						isCssProperty: (property: string) =>
							["color", "backgroundColor", "padding", "bg"].includes(property),
					} as T;
			}
			if (hasAdapter(adapters, CodemodAdapterId.Pandwind) && packageName === "pandwind/preset")
				return {
					pandwindPreset: {
						tokens: {
							colors: { brand: { value: color } },
							spacing: { card: { value: "1.125rem" } },
						},
					},
				} as T;
			if (hasAdapter(adapters, CodemodAdapterId.ChakraUi) && packageName === "@chakra-ui/react")
				return {
					defaultConfig: {},
					isValidSystem: () => false,
					createSystem: (_defaults: unknown, config: unknown) => ({
						_config: config,
						properties: new Set(["color", "backgroundColor", "padding", "bg"]),
						utility: { shorthands: new Map([["bg", "backgroundColor"]]) },
					}),
				} as T;
			if (
				hasAdapter(adapters, CodemodAdapterId.Mui) &&
				(packageName === "@mui/system" || packageName === "@mui/material")
			)
				return {
					createTheme: (config: Record<string, unknown>) => config,
				} as T;
			if (hasAdapter(adapters, CodemodAdapterId.Mantine) && packageName === "@mantine/core")
				return { createTheme: (config: unknown) => config } as T;
			if (hasAdapter(adapters, CodemodAdapterId.Tokenami) && packageName === "@tokenami/config")
				return { createConfig: (config: unknown) => config } as T;
			if (hasAdapter(adapters, CodemodAdapterId.Tailwind) && packageName === "@tailwindcss/node")
				return {
					__unstable__loadDesignSystem: async () => ({
						getClassList: () => [
							["text-brand", {}],
							["bg-brand", {}],
							["p-card", {}],
							["brand-button", {}],
						],
						candidatesToCss: (candidates: readonly string[]) =>
							candidates.map((candidate) => {
								if (candidate === "text-brand") return `.text-brand{color:${color}}`;
								if (candidate === "bg-brand") return `.bg-brand{background-color:${color}}`;
								if (candidate === "p-card") return ".p-card{padding:1.125rem}";
								if (candidate === "brand-button") return `.brand-button{background-color:${color}}`;
								return null;
							}),
						theme: {
							entries: () =>
								new Map([
									["--color-brand", { value: color }],
									["--spacing-card", { value: "1.125rem" }],
								]),
						},
					}),
				} as T;
			if (hasAdapter(adapters, CodemodAdapterId.UnoCSS)) {
				if (packageName === "@unocss/config")
					return {
						loadConfig: async () => ({
							config: { theme: { colors: { brand: color }, spacing: { card: "1.125rem" } } },
							sources: [],
						}),
					} as T;
				if (packageName === "@unocss/core")
					return {
						createGenerator: async () => ({
							generate: async (tokens: readonly string[]) => ({
								css: tokens
									.map((token) => {
										if (token === "text-brand") return `.text-brand{color:${color}}`;
										if (token === "bg-brand") return `.bg-brand{background-color:${color}}`;
										if (token === "p-card") return ".p-card{padding:1.125rem}";
										const arbitrary = /^\[([^:]+):(.+)\]$/u.exec(token);
										if (arbitrary?.[1] !== undefined && arbitrary[2] !== undefined) {
											const escaped = token.replace(
												/[^A-Za-z0-9_-]/gu,
												(character) => `\\${character}`,
											);
											return `.${escaped}{${arbitrary[1]}:${arbitrary[2]}}`;
										}
										return "";
									})
									.join(""),
							}),
						}),
					} as T;
			}
			return undefined;
		},
		async importFile<T>(file: string): Promise<T | undefined> {
			loaderCalls.files.push(file);
			if (hasAdapter(adapters, CodemodAdapterId.ChakraUi) && file.endsWith("/theme.ts"))
				return {
					default: { theme: { tokens: theme } },
				} as T;
			if (hasAdapter(adapters, CodemodAdapterId.Mui) && file.endsWith("/src/theme.ts"))
				return {
					default: {
						palette: { primary: { main: color } },
						spacing: { card: "1.125rem" },
					},
				} as T;
			if (hasAdapter(adapters, CodemodAdapterId.Mantine) && file.endsWith("/src/theme.ts"))
				return {
					default: { colors: { brand: [color] }, spacing: { card: "1.125rem" } },
				} as T;
			if (hasAdapter(adapters, CodemodAdapterId.Tokenami) && file.includes("tokenami.config."))
				return {
					default: { tokens: { colors: { brand: { value: color } } } },
				} as T;
			return undefined;
		},
	};
}

export function createAdapterRouteProject(
	source: CodemodAdapterId,
	target: CodemodAdapterId,
	color: string,
): AdapterRouteProject {
	const adapters = new Set([source, target]);
	const loaderCalls: AdapterRouteProject["loaderCalls"] = { packages: [], files: [] };
	const files: Record<string, string> = {};
	for (const adapter of adapters)
		for (const [file, contents] of Object.entries(routeProjectFiles(adapter, color)))
			files[file] = files[file] === undefined ? contents : `${files[file]}\n${contents}`;
	return {
		root: routeProjectRoot,
		files,
		loaderCalls,
		moduleLoader: routeProjectLoader(adapters, color, loaderCalls),
	};
}

export interface AdapterRouteSpec {
	readonly source: CodemodAdapterId;
	readonly target: CodemodAdapterId;
	run(input: AdapterRouteInput): AdapterMigrationResult;
	runAsync(input: AdapterRouteInput): Promise<AdapterMigrationResult>;
}

/** In-process route harness shared by every generated directional spec. */
export function createAdapterRouteSpec(
	source: CodemodAdapterId,
	target: CodemodAdapterId,
): AdapterRouteSpec {
	return {
		source,
		target,
		run(input) {
			const project = input.project;
			return runAdapterMigration(input.source, {
				from: source,
				to: target,
				file: input.file,
				...(project === undefined
					? {}
					: {
							root: project.root,
							packageJson: project.packageJson,
							readFile: (file: string) => project.files[file],
							listFiles: (root: string) =>
								Object.keys(project.files).filter(
									(file) => file === root || file.startsWith(`${root}/`),
								),
						}),
				mode: "safe",
				adapterRegistry: catalog.registry,
				...(input.semantic === undefined ? {} : { semantic: input.semantic }),
			});
		},
		runAsync(input) {
			const project = input.project;
			const adapterRegistry =
				project?.moduleLoader === undefined
					? catalog.registry
					: createBuiltinCodemodCatalog(project.moduleLoader).registry;
			return runAdapterMigrationAsync(input.source, {
				from: source,
				to: target,
				file: input.file,
				...(project === undefined
					? {}
					: {
							root: project.root,
							packageJson: project.packageJson,
							readFile: (file: string) => project.files[file],
							listFiles: (root: string) =>
								Object.keys(project.files).filter(
									(file) => file === root || file.startsWith(`${root}/`),
								),
							moduleLoader: project.moduleLoader,
						}),
				mode: "safe",
				adapterRegistry,
				...(input.semantic === undefined ? {} : { semantic: input.semantic }),
			});
		},
	};
}

/** Stable, human-readable evidence for an individual directional snapshot. */
export function routeEvidence(result: AdapterMigrationResult) {
	return {
		changed: result.changed,
		converted: result.converted,
		skipped: result.skipped,
		residuals: result.residuals.map((residual) => ({
			kind: residual.kind,
			hint: residual.hint,
			preserved: residual.preserved,
		})),
		outcomes: result.outcomes.map((outcome) => ({
			outcome: outcome.outcome,
			representation: outcome.representation,
		})),
		validations: result.validations.map((validation) => ({
			valid: validation.valid,
			lossiness: validation.lossiness,
			differences: validation.differences,
		})),
		generatedFiles: result.generatedFiles.map((file) => ({
			path: file.path,
			purpose: file.purpose,
		})),
		loweringPlans: result.loweringPlans.map((plan) => ({
			representation: plan.representation,
			availableRepresentations: plan.availableRepresentations,
			applied: plan.applied,
			residuals: plan.residuals.map((residual) => ({
				kind: residual.kind,
				hint: residual.hint,
			})),
		})),
		code: result.code,
	};
}

function officialConfigPackages(adapter: CodemodAdapterId): readonly string[] {
	switch (adapter) {
		case CodemodAdapterId.Panda:
			return ["@pandacss/config"];
		case CodemodAdapterId.Pandwind:
			return ["pandwind/preset"];
		case CodemodAdapterId.ChakraUi:
			return ["@chakra-ui/react"];
		case CodemodAdapterId.Mui:
			return ["@mui/system", "@mui/material"];
		case CodemodAdapterId.Mantine:
			return ["@mantine/core"];
		case CodemodAdapterId.Tailwind:
			return ["@tailwindcss/node"];
		case CodemodAdapterId.Tokenami:
			return ["@tokenami/config"];
		case CodemodAdapterId.UnoCSS:
			return ["@unocss/config", "@unocss/core"];
		default:
			return [];
	}
}

/** Proves the configured route actually crossed each supported official loader. */
export function expectConfiguredProjectEvidence(
	project: AdapterRouteProject,
	source: CodemodAdapterId,
	target: CodemodAdapterId,
): void {
	for (const adapter of new Set([source, target])) {
		const packages = officialConfigPackages(adapter);
		if (packages.length === 0) continue;
		expect(
			project.loaderCalls.packages.some((packageName) => packages.includes(packageName)),
			`${adapter} official config loader was not called`,
		).toBe(true);
	}
}

/** A direct route fixture must either lower, skip with evidence, or preserve a residual. */
export function expectRouteScenarioEvidence(result: AdapterMigrationResult, label = "route"): void {
	expect(
		result.changed || result.converted > 0 || result.skipped > 0 || result.residuals.length > 0,
		`${label} produced no conversion, residual, or source-preserving change`,
	).toBe(true);

	const generatedPaths = result.generatedFiles.map((file) => file.path);
	expect(new Set(generatedPaths).size, `${label} generated duplicate file paths`).toBe(
		generatedPaths.length,
	);
	for (const file of result.generatedFiles) {
		expect(file.path, `${label} generated an empty path`).toBeTruthy();
		expect(file.content, `${label} generated empty ${file.path}`).toBeTruthy();
	}

	if (result.converted > 0) {
		expect(result.loweringPlans.length, `${label} has no lowering plan`).toBeGreaterThan(0);
		expect(result.outcomes.length, `${label} has no migration outcome`).toBeGreaterThan(0);
		expect(
			result.outcomes.some((outcome) => outcome.outcome !== StyleMigrationOutcome.Residual),
			`${label} converted without a target outcome`,
		).toBe(true);
		expect(
			result.loweringPlans.every((plan) =>
				plan.availableRepresentations.includes(plan.representation),
			),
			`${label} selected a representation outside the target contract`,
		).toBe(true);
		if (result.skipped === 0)
			expect(
				result.validations.every((validation) => validation.valid),
				`${label} converted with invalid canonical validation`,
			).toBe(true);
	}
	if (result.skipped > 0)
		expect(
			result.outcomes.some((outcome) => outcome.outcome === StyleMigrationOutcome.Residual),
			`${label} skipped without a residual outcome`,
		).toBe(true);
	if (result.code.includes("__pandwind/slot"))
		expect(
			result.generatedFiles.some((file) => file.path.includes("__pandwind/slot")),
			`${label} references a generated slot without emitting it`,
		).toBe(true);
}

export function expectExplicitResidualEvidence(result: AdapterMigrationResult): void {
	expect(result.code).not.toContain("adapter capability mismatch");
	// A host adapter owns the opening-tag rewrite. A target emitter must never
	// leak a second JSX/Vue host into a class/style attribute expression.
	expect(result.code).not.toMatch(/\b(?:className|class|style)\s*=\s*\{\s*<[A-Za-z]/u);
	if (result.skipped > 0) expect(result.code).toContain("pandwind:migrate-skip");
	if (result.skipped > 0) expect(result.residuals.length).toBeGreaterThan(0);
	for (const residual of result.residuals) {
		expect(residual.text.length).toBeGreaterThan(0);
		expect(residual.hint ?? "").toBeTruthy();
	}
}

/**
 * A round trip must either be parseable by the reverse adapter or visibly
 * identify the source-preserving/runtime fallback that made the reverse leg
 * inapplicable. An unreported, non-converting second leg is never acceptable;
 * a canonical target is allowed to remain byte-for-byte stable.
 */
export function expectActionableRoundTrip(
	forward: AdapterMigrationResult,
	reverse: AdapterMigrationResult,
): void {
	const reverseActionable =
		reverse.converted > 0 || reverse.skipped > 0 || reverse.residuals.length > 0;
	const forwardHasResidual =
		forward.skipped > 0 ||
		forward.residuals.length > 0 ||
		forward.outcomes.some((outcome) => outcome.outcome === StyleMigrationOutcome.Residual);
	const forwardHasPortableArtifact =
		forward.outcomes.some(
			(outcome) => outcome.representation === StyleRepresentationKind.PortableArtifact,
		) && forward.code.includes("pandwind/");
	if (forward.converted > 0 && !forwardHasResidual) {
		expect(reverseActionable || (forwardHasPortableArtifact && reverse.code === forward.code)).toBe(
			true,
		);
		return;
	}
	if (forwardHasResidual) {
		expect(reverseActionable || reverse.code === forward.code).toBe(true);
		return;
	}
	expect(reverseActionable).toBe(true);
}

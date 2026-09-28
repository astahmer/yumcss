import { resolve } from "node:path";
import { expect } from "vitest";
import {
	BUILTIN_CODEMOD_ADAPTER_IDS,
	CodemodAdapterId,
	createBuiltinCodemodCatalog,
	runAdapterMigration,
	runAdapterMigrationAsync,
	StyleMigrationOutcome,
	StyleRepresentationKind,
	type AdapterMigrationOptions,
	type AdapterMigrationResult,
} from "../src/swap/index.ts";
import {
	NODE_PROJECT_MODULE_LOADER,
	type ProjectModuleLoader,
} from "../src/swap/project-module-loader.ts";

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

const installedChakraProjectRoot = resolve(import.meta.dirname, "..");
const installedChakraModuleLoader: ProjectModuleLoader = {
	importPackage: (packageName, _root) =>
		packageName === "@chakra-ui/react"
			? NODE_PROJECT_MODULE_LOADER.importPackage(packageName, installedChakraProjectRoot)
			: Promise.resolve(undefined),
	importFile: async () => undefined,
};

export function requireBuiltinAdapterId(adapter: string): CodemodAdapterId {
	const identifier = BUILTIN_CODEMOD_ADAPTER_IDS.find((candidate) => candidate === adapter);
	if (identifier === undefined) throw new Error(`unknown built-in adapter identifier: ${adapter}`);
	return identifier;
}

export function createInstalledChakraRouteProject(): AdapterRouteProject {
	return {
		root: installedChakraProjectRoot,
		files: {},
		moduleLoader: installedChakraModuleLoader,
		loaderCalls: { packages: [], files: [] },
	};
}

export function createInstalledChakraUnoRouteProject(): AdapterRouteProject {
	return createAdapterRouteProject(CodemodAdapterId.ChakraUi, CodemodAdapterId.UnoCSS, "#2a57c8");
}

export function createInstalledTailwindChakraRouteProject(): AdapterRouteProject {
	const root = installedChakraProjectRoot;
	const loaderCalls: AdapterRouteProject["loaderCalls"] = { packages: [], files: [] };
	return {
		root,
		files: { [`${root}/tailwind.css`]: '@import "tailwindcss";' },
		moduleLoader: {
			importPackage: (packageName, packageRoot) => {
				loaderCalls.packages.push(packageName);
				return packageName === "@chakra-ui/react" || packageName === "@tailwindcss/node"
					? NODE_PROJECT_MODULE_LOADER.importPackage(packageName, packageRoot)
					: Promise.resolve(undefined);
			},
			importFile: async () => undefined,
		},
		loaderCalls,
	};
}

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
					'import { defaultPreset } from "pandwind/preset/default";\nexport const bridge = { preset: defaultPreset };',
			};
		case CodemodAdapterId.ChakraUi:
			return {
				[`${routeProjectRoot}/chakra.config.ts`]: `export default { theme: { tokens: { colors: { brand: { 500: { value: ${quotedColor} } } }, spacing: { card: { value: "1.125rem" } } } } };`,
			};
		case CodemodAdapterId.Mui:
			return {
				[`${routeProjectRoot}/mui-theme.ts`]: `export default { palette: { primary: { main: ${quotedColor} } }, spacing: 8 };`,
			};
		case CodemodAdapterId.Mantine:
			return {
				[`${routeProjectRoot}/mantine-theme.ts`]: `export default { colors: { brand: [${quotedColor}] }, spacing: { card: "1.125rem" } };`,
			};
		case CodemodAdapterId.Tailwind:
			return {
				[`${routeProjectRoot}/tailwind.css`]: `@import "tailwindcss"; @theme { --color-brand: ${color}; --spacing-card: 1.125rem; }`,
			};
		case CodemodAdapterId.UnoCSS:
			return {
				[`${routeProjectRoot}/uno.config.ts`]: `import { defineConfig, presetWind3 } from "unocss"; export default defineConfig({ presets: [presetWind3()], theme: { colors: { brand: ${quotedColor} }, spacing: { card: "1.125rem" } } });`,
				[`${routeProjectRoot}/src/styles.css`]: `@theme { --color-brand: ${color}; }`,
			};
		case CodemodAdapterId.Tokenami:
			return {
				[`${routeProjectRoot}/.tokenami/tokenami.config.ts`]: `import { createConfig } from "@tokenami/css"; export default createConfig({ theme: { color: { brand: ${quotedColor} }, spacing: { card: "1.125rem" } }, properties: { color: ["color"], background: ["color"], "background-color": ["color"], padding: ["spacing"] }, responsive: { md: "@media (min-width: 700px)" } });`,
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
	files: Readonly<Record<string, string>>,
): ProjectModuleLoader {
	const theme = {
		colors: { brand: { 500: { value: color } } },
		spacing: { card: "1.125rem" },
	};
	return {
		async importPackage<T>(packageName: string, _root: string): Promise<T | undefined> {
			loaderCalls.packages.push(packageName);
			if (hasAdapter(adapters, CodemodAdapterId.ChakraUi) && packageName === "@chakra-ui/react")
				return NODE_PROJECT_MODULE_LOADER.importPackage(packageName, installedChakraProjectRoot);
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
			if (
				hasAdapter(adapters, CodemodAdapterId.Pandwind) &&
				packageName === "pandwind/preset/default"
			)
				return {
					defaultPreset: {
						tokens: {
							colors: { brand: { value: color } },
							spacing: { card: { value: "1.125rem" } },
						},
					},
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
			if (hasAdapter(adapters, CodemodAdapterId.Tokenami) && packageName === "@tokenami/css")
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
								if (candidate === "md:[display:flex]")
									return "@media (width >= 48rem) { .md\\:\\[display\\:flex\\] { display: flex; } }";
								const arbitrary = /^\[([^:]+):(.+)\]$/u.exec(candidate);
								if (arbitrary?.[1] !== undefined && arbitrary[2] !== undefined) {
									const escaped = candidate.replace(
										/[^A-Za-z0-9_-]/gu,
										(character) => `\\${character}`,
									);
									return `.${escaped}{${arbitrary[1]}:${arbitrary[2]}}`;
								}
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
							config: {
								presets: [{ name: "preset-wind3" }],
								theme: { colors: { brand: color }, spacing: { card: "1.125rem" } },
							},
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
										if (token === "md:[display:flex]")
											return "@media (min-width: 48rem){.md\\:\\[display\\:flex\\]{display:flex}}";
										const hoverArbitrary = /^hover:\[([^:]+):(.+)\]$/u.exec(token);
										if (hoverArbitrary?.[1] !== undefined && hoverArbitrary[2] !== undefined) {
											const escaped = token.replace(
												/[^A-Za-z0-9_-]/gu,
												(character) => `\\${character}`,
											);
											return `.${escaped}:hover{${hoverArbitrary[1]}:${hoverArbitrary[2]}}`;
										}
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
			if (hasAdapter(adapters, CodemodAdapterId.Less) && packageName === "less")
				return {
					render: async (source: string) => ({ css: source }),
				} as T;
			if (hasAdapter(adapters, CodemodAdapterId.Sass) && packageName === "sass")
				return {
					compileString: (source: string) => ({ css: source }),
				} as T;
			return undefined;
		},
		async importFile<T>(file: string): Promise<T | undefined> {
			loaderCalls.files.push(file);
			if (files[file] === undefined) return undefined;
			if (hasAdapter(adapters, CodemodAdapterId.ChakraUi) && file.endsWith("/chakra.config.ts"))
				return {
					default: {
						theme: {
							tokens: {
								colors: { brand: { 500: { value: color } } },
								spacing: { card: { value: "1.125rem" } },
							},
						},
					},
				} as T;
			if (hasAdapter(adapters, CodemodAdapterId.Mui) && file.endsWith("/mui-theme.ts"))
				return {
					default: {
						palette: { primary: { main: color } },
						spacing: 8,
					},
				} as T;
			if (hasAdapter(adapters, CodemodAdapterId.Mantine) && file.endsWith("/mantine-theme.ts"))
				return {
					default: { colors: { brand: [color] }, spacing: { card: "1.125rem" } },
				} as T;
			if (hasAdapter(adapters, CodemodAdapterId.Tokenami) && file.includes("tokenami.config."))
				return {
					default: {
						theme: { color: { brand: color }, spacing: { card: "1.125rem" } },
						properties: {
							color: ["color"],
							background: ["color"],
							"background-color": ["color"],
							padding: ["spacing"],
						},
						responsive: { md: "@media (min-width: 700px)" },
					},
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
		moduleLoader: routeProjectLoader(adapters, color, loaderCalls, files),
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
			return ["pandwind/preset/default"];
		case CodemodAdapterId.ChakraUi:
			return ["@chakra-ui/react"];
		case CodemodAdapterId.Mui:
			return ["@mui/system", "@mui/material"];
		case CodemodAdapterId.Mantine:
			return ["@mantine/core"];
		case CodemodAdapterId.Tailwind:
			return ["@tailwindcss/node"];
		case CodemodAdapterId.Tokenami:
			return ["@tokenami/css"];
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

function configuredTargetTokenMarkers(target: CodemodAdapterId): readonly string[] {
	switch (target) {
		case CodemodAdapterId.Pandwind:
			return ["brand", "$brand", "card"];
		case CodemodAdapterId.Panda:
		case CodemodAdapterId.ChakraUi:
			return ["brand.500", "card"];
		case CodemodAdapterId.Mui:
			return ["primary.main", "card"];
		case CodemodAdapterId.Mantine:
			return ["--mantine-color-brand", "--mantine-spacing-card"];
		case CodemodAdapterId.Tailwind:
			return ["text-brand", "bg-brand", "p-card", "--color-brand"];
		case CodemodAdapterId.UnoCSS:
			return ["text-brand", "bg-brand", "p-card"];
		case CodemodAdapterId.Tokenami:
			return ["var(--color_brand)", "var(--spacing_card)"];
		default:
			return [];
	}
}

function configuredTargetTokenUsed(
	code: string,
	target: CodemodAdapterId,
	marker: string,
): boolean {
	if (marker !== "card") return code.includes(marker);
	if (
		target !== CodemodAdapterId.Pandwind &&
		target !== CodemodAdapterId.Panda &&
		target !== CodemodAdapterId.ChakraUi &&
		target !== CodemodAdapterId.Mui
	)
		return code.includes(marker);
	// `card` is also the name of nearly every generated style-map fixture. Only
	// count it when it is emitted as a value, never when it is an object key or
	// binding name.
	return /(?:[:=]|\(\s*)\s*["']card["'](?:\s*[,})\]])?/u.test(code);
}

/** A token fixture must prove that the configured target chose its own spelling. */
export function expectConfiguredTargetTokenEvidence(
	result: AdapterMigrationResult,
	target: CodemodAdapterId,
	label = "configured token route",
): void {
	if (result.converted === 0 || result.skipped > 0) return;
	const markers = configuredTargetTokenMarkers(target);
	if (markers.length === 0) return;
	expect(
		markers.some((marker) => configuredTargetTokenUsed(result.code, target, marker)),
		`${label} did not use a verified ${target} token or utility spelling`,
	).toBe(true);
}

/** Literal output is safer when no unique target token has the same value. */
export function expectConfiguredTargetTokenAbsence(
	result: AdapterMigrationResult,
	target: CodemodAdapterId,
	label = "configured literal route",
): void {
	if (result.converted === 0 || result.skipped > 0) return;
	const markers = configuredTargetTokenMarkers(target);
	if (markers.length === 0) return;
	expect(
		markers.every((marker) => !configuredTargetTokenUsed(result.code, target, marker)),
		`${label} invented a target token for a mismatched configured value`,
	).toBe(true);
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
		expect(
			reverseActionable ||
				forward.changed ||
				(forwardHasPortableArtifact && reverse.code === forward.code),
		).toBe(true);
		return;
	}
	if (forwardHasResidual) {
		expect(reverseActionable || reverse.code === forward.code).toBe(true);
		return;
	}
	expect(reverseActionable).toBe(true);
}

/**
 * Tailwind and UnoCSS can receive a valid class string without enough host
 * context for a reverse codemod to identify the original style carrier. Keep
 * that one-way projection explicit and prove that the reverse leg is an exact
 * identity over a verified utility string rather than silently accepting any
 * no-op.
 */
export function expectTargetClassProjection(
	forward: AdapterMigrationResult,
	reverse: AdapterMigrationResult,
	markers: readonly string[],
	label = "target class projection",
): void {
	const reverseActionable =
		reverse.converted > 0 || reverse.skipped > 0 || reverse.residuals.length > 0;
	const forwardHasResidual =
		forward.skipped > 0 ||
		forward.residuals.length > 0 ||
		forward.outcomes.some((outcome) => outcome.outcome === StyleMigrationOutcome.Residual);

	// A target adapter may legitimately preserve a source construct that has no
	// target class carrier. In that case the reverse pass should be an exact
	// identity, and the residual is the evidence that the source was preserved.
	if (forwardHasResidual) {
		expect(reverse.code, `${label} residual class projection changed source`).toBe(forward.code);
		expect(
			forward.skipped + forward.residuals.length,
			`${label} residual projection has no residual evidence`,
		).toBeGreaterThan(0);
		return;
	}

	if (reverseActionable) return;
	expect(reverse.code, `${label} reverse leg changed nothing and was not identity`).toBe(
		forward.code,
	);
	expect(forward.converted, `${label} forward leg did not convert`).toBeGreaterThan(0);
	expect(forward.skipped, `${label} forward leg skipped`).toBe(0);
	expect(forward.residuals, `${label} forward leg has unreported residuals`).toEqual([]);
	expect(
		forward.outcomes.some((outcome) => outcome.outcome !== StyleMigrationOutcome.Residual),
		`${label} forward leg has no target-native outcome`,
	).toBe(true);
	expect(
		markers.some((marker) => forward.code.includes(marker)),
		`${label} did not emit a recognizable target utility carrier`,
	).toBe(true);
}

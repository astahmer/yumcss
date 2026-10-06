/**
 * Regenerate the shadcn/ui preset data module.
 *
 * Two upstream sources are read and cross-checked, so either side drifting is a
 * failing generator instead of a silent divergence:
 *
 * - the pinned shadcn/ui checkout (see `scripts/reference-repository-catalog.ts`)
 *   owns every registry value: the base-color records, the accent-theme overlays,
 *   the radius multipliers, the styles, the fonts, and the create-page coercion
 *   rules for `lyra` / `sera` / `rhea`.
 * - the installed `shadcn` package owns the vocabulary and the encoded-preset
 *   defaults, because that is what `--preset` decodes.
 *
 * Usage: pnpm run presets:generate
 */
import { execFileSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
	createReferenceWorkspace,
	inspectReferenceAvailability,
	REFERENCE_AVAILABILITY,
} from "./reference-workspace.ts";

const repositoryRoot = resolve(import.meta.dirname, "..");
const yumcssPackageRoot = join(repositoryRoot, "packages/yumcss");
const requireFromYumCSS = createRequire(join(yumcssPackageRoot, "package.json"));

/** Checked-in data module this generator owns. */
export const shadcnPresetModulePath = join(
	yumcssPackageRoot,
	"src/preset/generated/shadcn-theme.ts",
);

/** Checked-in default-only data module this generator owns. */
export const shadcnDefaultThemeModulePath = join(
	yumcssPackageRoot,
	"src/preset/generated/shadcn-default-theme.ts",
);

/** shadcn/ui revision the registry values are read from. */
export const shadcnReferenceCommit = "683a5a9b370acdb7785a0529434e6a3b8c7e0441";

const referenceId = "shadcn-ui";
const appDirectory = "apps/v4";
const globalsPath = appDirectory + "/app/globals.css";
const designSystemProviderPath =
	appDirectory + "/app/(app)/(create)/components/design-system-provider.tsx";

/** Radius step names, in the authored order the stylesheet publishes them. */
const radiusSteps = ["sm", "md", "lg", "xl", "2xl", "3xl", "4xl"] as const;

interface ShadcnRegistryTheme {
	readonly name: string;
	readonly cssVars: {
		readonly light: Readonly<Record<string, string>>;
		readonly dark: Readonly<Record<string, string>>;
	};
}

interface ShadcnReferenceModule {
	readonly BASE_COLORS: ReadonlyArray<ShadcnRegistryTheme>;
	readonly THEMES: ReadonlyArray<ShadcnRegistryTheme>;
	readonly STYLES: ReadonlyArray<{ readonly name: string }>;
	readonly RADII: ReadonlyArray<{ readonly name: string; readonly value: string }>;
	readonly MENU_ACCENTS: ReadonlyArray<{ readonly value: string }>;
	readonly MENU_COLORS: ReadonlyArray<{ readonly value: string }>;
	readonly POINTER_CURSOR_SELECTOR: string;
	readonly DEFAULT_CONFIG: Readonly<Record<string, unknown>>;
	readonly FONT_DEFINITIONS: ReadonlyArray<{
		readonly name: string;
		readonly type: string;
		readonly family: string;
		readonly registryVariable: string;
		readonly previewVariable: string;
		readonly dependency: string;
	}>;
}

interface ShadcnVocabulary {
	readonly PRESET_BASE_COLORS: ReadonlyArray<string>;
	readonly PRESET_THEMES: ReadonlyArray<string>;
	readonly PRESET_CHART_COLORS: ReadonlyArray<string>;
	readonly PRESET_FONTS: ReadonlyArray<string>;
	readonly PRESET_MENU_ACCENTS: ReadonlyArray<string>;
	readonly PRESET_MENU_COLORS: ReadonlyArray<string>;
	readonly PRESET_RADII: ReadonlyArray<string>;
	readonly PRESET_STYLES: ReadonlyArray<string>;
	readonly DEFAULT_PRESET_CONFIG: Readonly<Record<string, string>>;
}

const assertUpstream: (condition: boolean, message: string) => asserts condition = (
	condition,
	message,
) => {
	if (!condition) throw new Error(message);
};

const assertSubset = (
	label: string,
	values: ReadonlyArray<string>,
	allowed: ReadonlyArray<string>,
): void => {
	const unknown = values.filter((value) => !allowed.includes(value));
	assertUpstream(
		unknown.length === 0,
		"shadcn " + label + " left the installed vocabulary: " + unknown.join(", "),
	);
};

const referencePath = (): string => {
	const workspace = createReferenceWorkspace();
	const availability = inspectReferenceAvailability(workspace, referenceId);
	assertUpstream(
		availability.status === REFERENCE_AVAILABILITY.Available,
		"shadcn/ui reference is missing at " +
			availability.path +
			"; run " +
			availability.prepareCommand +
			" first",
	);
	return availability.path;
};

/** Read one file from the pinned revision, never from the working tree. */
const referenceSource = (path: string): string => {
	const root = referencePath();
	const head = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
	assertUpstream(
		head === shadcnReferenceCommit,
		"Shadcn reference moved: expected " + shadcnReferenceCommit + ", got " + head,
	);
	return execFileSync("git", ["-C", root, "show", shadcnReferenceCommit + ":" + path], {
		encoding: "utf8",
	});
};

/**
 * The create page coerces three style / radius combinations before it renders,
 * so the data module pins the rules and this check fails when upstream stops
 * coercing them.
 */
const assertCreatePageCoercion = (source: string): void => {
	const rules = [
		'const effectiveRadius = style === "lyra" ? "none" : radius',
		'if (style === "lyra" || (style === "sera" && radius !== "none")) {',
		'if (style === "rhea" && radius === "large") {',
	];
	for (const rule of rules)
		assertUpstream(
			source.includes(rule),
			"the create page no longer coerces " + rule + "; review the preset radius policy",
		);
};

/**
 * The `--radius-*` multipliers from the app stylesheet. Only those lines are
 * authored data the preset needs; the rest of that file is app-only chrome
 * (surface colors, code colors, extra breakpoints) and must never ship.
 */
const radiusMultipliers = (source: string): Record<string, string> => {
	const found = new Map<string, string>();
	for (const match of source.matchAll(/--radius-([a-z0-9]+):\s*([^;]+);/gu))
		found.set(match[1] ?? "", (match[2] ?? "").trim());
	const entries = radiusSteps.map((step): readonly [string, string] => {
		const value = found.get(step);
		assertUpstream(value !== undefined, "the app stylesheet publishes no --radius-" + step);
		return [step, value ?? ""];
	});
	return Object.fromEntries(entries);
};

/** The default radius a base color falls back to when it declares none. */
const defaultRadiusValue = (source: string): string => {
	const match = /const DEFAULT_RADIUS_VALUE = "([^"]+)"/u.exec(source);
	assertUpstream(match?.[1] !== undefined, "the registry no longer publishes DEFAULT_RADIUS_VALUE");
	return match?.[1] ?? "";
};

/**
 * Bundle the pinned registry modules and import them.
 *
 * The registry is TypeScript with `@/` path aliases and no build step, so it is
 * bundled in memory with the same alias resolver the reference probes use, then
 * written to a real module file because Node's loader cannot import a data URL
 * that still carries unresolved imports.
 */
const bundleReference = async (): Promise<ShadcnReferenceModule> => {
	const root = referencePath();
	const appRoot = join(root, appDirectory);
	const esbuild = (await import(requireFromYumCSS.resolve("esbuild"))) as {
		readonly build: (options: Record<string, unknown>) => Promise<{
			readonly outputFiles: ReadonlyArray<{ readonly text: string }>;
		}>;
	};
	const result = await esbuild.build({
		bundle: true,
		write: false,
		format: "esm",
		platform: "node",
		target: "node22",
		jsx: "automatic",
		absWorkingDir: appRoot,
		nodePaths: [join(yumcssPackageRoot, "node_modules"), join(repositoryRoot, "node_modules")],
		logLevel: "silent",
		plugins: [
			{
				name: "registry-alias",
				setup: (build: {
					readonly onResolve: (
						options: { readonly filter: RegExp },
						handler: (args: { readonly path: string }) => { readonly path: string } | undefined,
					) => void;
				}) => {
					// esbuild validates this filter as a Go regexp, which rejects the `u` flag.
					build.onResolve({ filter: /^@\// }, (args) => {
						const base = join(appRoot, args.path.slice(2));
						const candidates = [
							base,
							base + ".ts",
							base + ".tsx",
							join(base, "index.ts"),
							join(base, "index.tsx"),
						];
						const resolved = candidates.find(
							(candidate) => statSync(candidate, { throwIfNoEntry: false })?.isFile() === true,
						);
						return resolved === undefined ? undefined : { path: resolved };
					});
				},
			},
		],
		stdin: {
			contents: [
				'export { BASE_COLORS, DEFAULT_CONFIG, MENU_ACCENTS, MENU_COLORS, POINTER_CURSOR_SELECTOR, RADII, STYLES, THEMES } from "@/registry/config";',
				'export { FONT_DEFINITIONS } from "@/lib/font-definitions";',
			].join("\n"),
			loader: "ts",
			resolveDir: appRoot,
		},
	});
	const bundleDirectory = mkdtempSync(join(tmpdir(), "yumcss-shadcn-registry-"));
	try {
		const bundled = join(bundleDirectory, "registry.mjs");
		writeFileSync(bundled, result.outputFiles[0]?.text ?? "");
		return (await import(pathToFileURL(bundled).href)) as ShadcnReferenceModule;
	} finally {
		rmSync(bundleDirectory, { recursive: true, force: true });
	}
};

const installedVocabulary = async (): Promise<{
	vocabulary: ShadcnVocabulary;
	version: string;
}> => {
	const presetEntry = requireFromYumCSS.resolve("shadcn/preset");
	return {
		vocabulary: (await import(pathToFileURL(presetEntry).href)) as ShadcnVocabulary,
		version: installedVersion(presetEntry),
	};
};

/**
 * The installed version, read from the manifest above the resolved entry.
 *
 * The package publishes no `./package.json` subpath, so the manifest is found by
 * walking up from the entry the loader did resolve.
 */
const installedVersion = (entryPath: string): string => {
	let directory = dirname(entryPath);
	while (true) {
		const manifestPath = join(directory, "package.json");
		if (existsSync(manifestPath)) {
			const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
				readonly name?: string;
				readonly version?: string;
			};
			if (manifest.name === "shadcn") {
				assertUpstream(
					manifest.version !== undefined,
					"the installed shadcn manifest carries no version",
				);
				return manifest.version ?? "";
			}
		}
		const parent = dirname(directory);
		assertUpstream(parent !== directory, "no shadcn manifest above " + entryPath);
		directory = parent;
	}
};

const sortedPairs = <TValue>(
	entries: ReadonlyArray<readonly [string, TValue]>,
): Record<string, TValue> =>
	Object.fromEntries(entries.toSorted(([left], [right]) => left.localeCompare(right)));

/**
 * Render the shadcn data module from the pinned checkout and the installed CLI.
 *
 * The module is returned instead of written so the preset parity test can
 * compare the checked-in file against a fresh render.
 */
export const renderShadcnPresetModule = async (): Promise<{
	contents: string;
	defaultContents: string;
	version: string;
}> => {
	const { vocabulary, version } = await installedVocabulary();
	const registry = await bundleReference();
	const globals = referenceSource(globalsPath);
	const config = referenceSource(appDirectory + "/registry/config.ts");
	assertCreatePageCoercion(referenceSource(designSystemProviderPath));

	const baseColorNames = registry.BASE_COLORS.map((theme) => theme.name);
	const themeNames = registry.THEMES.map((theme) => theme.name);
	const fontNames = registry.FONT_DEFINITIONS.map((font) => font.name);
	const styleNames = registry.STYLES.map((style) => style.name);
	const radiiNames = registry.RADII.map((radius) => radius.name);
	const menuAccentValues = registry.MENU_ACCENTS.map((accent) => accent.value);
	const menuColorValues = registry.MENU_COLORS.map((color) => color.value);

	assertSubset("base colors", baseColorNames, vocabulary.PRESET_BASE_COLORS);
	assertSubset("themes", themeNames, vocabulary.PRESET_THEMES);
	assertSubset("themes", themeNames, vocabulary.PRESET_CHART_COLORS);
	assertSubset("fonts", fontNames, vocabulary.PRESET_FONTS);
	assertSubset("radii", radiiNames, vocabulary.PRESET_RADII);
	assertSubset("styles", styleNames, vocabulary.PRESET_STYLES);
	assertSubset("menu accents", menuAccentValues, vocabulary.PRESET_MENU_ACCENTS);
	assertSubset("menu colors", menuColorValues, vocabulary.PRESET_MENU_COLORS);
	assertUpstream(
		styleNames.length === vocabulary.PRESET_STYLES.length,
		"the registry publishes " +
			styleNames.length +
			" styles, the CLI " +
			vocabulary.PRESET_STYLES.length,
	);

	// The registry ships no CSS variables for these two names while the CLI still
	// accepts them, so the preset rejects them instead of inventing values.
	const unsupportedBaseColors = vocabulary.PRESET_BASE_COLORS.filter(
		(name) => !baseColorNames.includes(name),
	);
	const unsupportedThemes = vocabulary.PRESET_THEMES.filter((name) => !themeNames.includes(name));
	assertUpstream(
		unsupportedBaseColors.join(",") === "gray" && unsupportedThemes.join(",") === "gray",
		"the CLI and the registry disagree about more than gray now: " +
			JSON.stringify({ unsupportedBaseColors, unsupportedThemes }),
	);

	const paletteLightKeys = new Set(Object.keys(registry.THEMES[0]?.cssVars.light ?? {}));
	for (const baseColor of registry.BASE_COLORS) {
		const lightKeys = Object.keys(baseColor.cssVars.light);
		const darkKeys = Object.keys(baseColor.cssVars.dark);
		const missing = [...paletteLightKeys].filter((key) => !lightKeys.includes(key));
		const extraDark = darkKeys.filter((key) => key !== "radius" && !lightKeys.includes(key));
		assertUpstream(
			missing.length === 0 && extraDark.length === 0 && lightKeys.length === darkKeys.length + 1,
			"the " + baseColor.name + " base-color record changed shape",
		);
		assertUpstream(
			lightKeys.includes("radius") && !darkKeys.includes("radius"),
			"the " + baseColor.name + " base-color record no longer declares radius in light only",
		);
	}
	for (const theme of registry.THEMES) {
		const overlays = [...Object.keys(theme.cssVars.light), ...Object.keys(theme.cssVars.dark)];
		const foreign = overlays.filter((key) => !paletteLightKeys.has(key) && key !== "chart-1");
		assertUpstream(
			foreign.length === 0,
			"the " +
				theme.name +
				" overlay declares keys the palette does not own: " +
				foreign.join(", "),
		);
	}

	const fontFamilies = sortedPairs(
		registry.FONT_DEFINITIONS.map(
			(font) =>
				[
					font.name,
					{
						type: font.type,
						family: font.family,
						variable: font.registryVariable,
						previewVariable: font.previewVariable,
						dependency: font.dependency,
					},
				] as const,
		),
	);

	const defaults = vocabulary.DEFAULT_PRESET_CONFIG;
	const radiusValues = Object.fromEntries(
		registry.RADII.map((radius) => [radius.name, radius.value] as const),
	);
	const defaultBaseColor = registry.BASE_COLORS.find(
		(baseColor) => baseColor.name === defaults.baseColor,
	);
	assertUpstream(
		defaultBaseColor !== undefined,
		"the default base color is missing from the registry",
	);
	const defaultTheme = registry.THEMES.find((theme) => theme.name === defaults.theme);
	assertUpstream(defaultTheme !== undefined, "the default theme is missing from the registry");
	const defaultChartTheme = registry.THEMES.find((theme) => theme.name === defaults.chartColor);
	assertUpstream(
		defaultChartTheme !== undefined,
		"the default chart color is missing from the registry",
	);
	const defaultFontName = defaults.font ?? "";
	const defaultFont = fontFamilies[defaultFontName];
	assertUpstream(defaultFont !== undefined, "the default font is missing from the registry");
	const defaultLight: Record<string, string> = {
		...defaultBaseColor.cssVars.light,
		...defaultTheme.cssVars.light,
	};
	const defaultDark: Record<string, string> = {
		...defaultBaseColor.cssVars.dark,
		...defaultTheme.cssVars.dark,
	};
	for (const role of ["chart-1", "chart-2", "chart-3", "chart-4", "chart-5"]) {
		defaultLight[role] = defaultChartTheme.cssVars.light[role] ?? "";
		defaultDark[role] = defaultChartTheme.cssVars.dark[role] ?? "";
	}
	if (defaults.menuAccent === "bold") {
		defaultLight.accent = defaultLight.primary ?? "";
		defaultLight["accent-foreground"] = defaultLight["primary-foreground"] ?? "";
		defaultDark.accent = defaultDark.primary ?? "";
		defaultDark["accent-foreground"] = defaultDark["primary-foreground"] ?? "";
	}
	const defaultStyle = defaults.style ?? "";
	const defaultRadiusName = defaults.radius ?? "";
	const effectiveRadius =
		defaultStyle === "lyra" || (defaultStyle === "sera" && defaultRadiusName !== "none")
			? "none"
			: defaultStyle === "rhea" && defaultRadiusName === "large"
				? "default"
				: defaultRadiusName;
	const radius = radiusValues[effectiveRadius] || defaultRadiusValue(config);
	defaultLight.radius = radius;
	const defaultHeadingName = defaults.fontHeading ?? "inherit";
	const normalizedHeading =
		defaultHeadingName === defaultFontName || defaultHeadingName === "inherit"
			? "inherit"
			: defaultHeadingName;
	const headingFont = normalizedHeading === "inherit" ? undefined : fontFamilies[normalizedHeading];
	if (headingFont === undefined && normalizedHeading !== "inherit")
		throw new Error("the default heading font is missing from the registry");
	const defaultFontVariables = {
		[defaultFont.variable.slice("--".length)]: defaultFont.family,
		"font-heading":
			normalizedHeading === "inherit"
				? `var(${defaultFont.variable})`
				: (headingFont?.family ?? ""),
	};

	const shadcnTheme = {
		version,
		registryCommit: shadcnReferenceCommit,
		baseColors: Object.fromEntries(
			registry.BASE_COLORS.map((baseColor) => [
				baseColor.name,
				{ light: baseColor.cssVars.light, dark: baseColor.cssVars.dark },
			]),
		),
		themes: Object.fromEntries(
			registry.THEMES.map((theme) => [
				theme.name,
				{ light: theme.cssVars.light, dark: theme.cssVars.dark },
			]),
		),
		baseColorNames,
		themeNames,
		unsupportedBaseColors,
		unsupportedThemes,
		radiusValues,
		defaultRadiusValue: defaultRadiusValue(config),
		radiusMultipliers: radiusMultipliers(globals),
		pointerSelector: registry.POINTER_CURSOR_SELECTOR,
		menuAccents: menuAccentValues,
		menuColors: menuColorValues,
		styles: styleNames,
		fonts: fontFamilies,
		fontOrder: fontNames,
		defaults: {
			baseColor: defaults.baseColor,
			theme: defaults.theme,
			chartColor: defaults.chartColor,
			style: defaults.style,
			font: defaults.font,
			fontHeading: defaults.fontHeading,
			radius: defaults.radius,
			menuAccent: defaults.menuAccent,
			menuColor: defaults.menuColor,
		},
	} as const;
	const shadcnDefaultTheme = {
		colorVariables: { light: defaultLight, dark: defaultDark },
		radius,
		radiusMultipliers: radiusMultipliers(globals),
		fontVariables: defaultFontVariables,
	} as const;

	const banner = [
		"// Generated by scripts/promote-shadcn-preset.ts. Do not edit by hand:",
		"// regenerate with pnpm run presets:generate and commit the diff.",
		"//",
		"// Source: shadcn@" + version + " for the vocabulary and the encoded-preset",
		"// defaults, and the pinned shadcn/ui checkout " + shadcnReferenceCommit.slice(0, 12) + "",
		"// (apps/v4) for every registry value: registry/base-colors.ts and",
		"// registry/themes.ts for the OKLCH color records, registry/config.ts for the",
		"// radii labels, the styles, the menu accents, the pointer selector, and",
		"// DEFAULT_RADIUS_VALUE, registry/fonts.ts for the font definitions, and",
		"// app/globals.css for the --radius-* multipliers.",
		"//",
		"// Divergences from what the CLI accepts, all asserted by the parity test:",
		"// the CLI vocabulary lists the gray base color and the gray accent theme,",
		"// and the registry publishes css vars for neither, so the preset rejects",
		"// both rather than inventing values (unsupportedBaseColors /",
		"// unsupportedThemes). The base-color and theme records keep the authored",
		"// OKLCH strings instead of being converted to sRGB, so a color outside the",
		"// sRGB gamut stays the color shadcn authors. Radius values keep the",
		"// calc(var(--radius) * n) form the app stylesheet publishes, which is why",
		"// the preset declares --radius through its cssVariables contract rather",
		"// than resolving the multipliers to lengths.",
		"//",
		"// License: MIT (https://github.com/shadcn-ui/ui/blob/main/LICENSE.md)",
		"",
	].join("\n");

	const contents =
		banner +
		"export const shadcnTheme = " +
		JSON.stringify(shadcnTheme, null, "\t") +
		" as const;\n";
	const defaultBanner = [
		"// Generated by scripts/promote-shadcn-preset.ts. Do not edit by hand:",
		"// regenerate with pnpm run presets:generate and commit the diff.",
		"//",
		"// This is the default-only projection of shadcnTheme used by shadcnPreset.",
		"// Keep it derived from the same pinned registry so the starter import does not",
		"// pay for every configurable base color, theme, and font.",
		"//",
		"// Source: shadcn@" +
			version +
			" and the pinned shadcn/ui checkout " +
			shadcnReferenceCommit.slice(0, 12),
		"// (apps/v4); see shadcn-theme.ts for the complete source and license notes.",
		"",
	].join("\n");
	const defaultContents =
		defaultBanner +
		"export const shadcnDefaultTheme = " +
		JSON.stringify(shadcnDefaultTheme, null, "\t") +
		" as const;\n";

	return { contents, defaultContents, version };
};

const main = async (): Promise<void> => {
	const { contents, defaultContents, version } = await renderShadcnPresetModule();
	const relativePath = relative(repositoryRoot, shadcnPresetModulePath);
	const defaultRelativePath = relative(repositoryRoot, shadcnDefaultThemeModulePath);
	if (process.argv.includes("--check")) {
		const checkedIn = existsSync(shadcnPresetModulePath)
			? readFileSync(shadcnPresetModulePath, "utf8")
			: "";
		if (checkedIn !== contents)
			throw new Error(relativePath + " is stale; run pnpm run presets:generate");
		const defaultCheckedIn = existsSync(shadcnDefaultThemeModulePath)
			? readFileSync(shadcnDefaultThemeModulePath, "utf8")
			: "";
		if (defaultCheckedIn !== defaultContents)
			throw new Error(defaultRelativePath + " is stale; run pnpm run presets:generate");
		console.log(
			"Verified " + relativePath + " and " + defaultRelativePath + " for shadcn@" + version,
		);
		return;
	}
	mkdirSync(dirname(shadcnPresetModulePath), { recursive: true });
	writeFileSync(shadcnPresetModulePath, contents);
	writeFileSync(shadcnDefaultThemeModulePath, defaultContents);
	console.log("Wrote " + relativePath + " and " + defaultRelativePath + " for shadcn@" + version);
};

if (import.meta.main) await main();

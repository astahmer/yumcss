/**
 * Regenerate the Chakra preset data module.
 *
 * Every value comes from the installed @chakra-ui/react package, so the shipped
 * preset tracks the version this workspace pins instead of a transcribed list.
 *
 * Usage: pnpm run presets:generate
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "..");
const pandwindPackageRoot = join(repositoryRoot, "packages/pandwind");
const requireFromPandwind = createRequire(join(pandwindPackageRoot, "package.json"));

/** Checked-in data module this generator owns. */
export const chakraPresetModulePath = join(
	pandwindPackageRoot,
	"src/preset/generated/chakra-theme.ts",
);

interface ChakraTokenLeaf {
	readonly value: string | number;
}

type ChakraTokenEntry = ChakraTokenLeaf | Record<string, ChakraTokenLeaf>;

interface ChakraSemanticLeaf {
	readonly value: string | Record<string, string>;
}

interface ChakraSemanticRoles {
	readonly [roleName: string]: ChakraSemanticLeaf;
}

type ChakraSemanticRoot = ChakraSemanticLeaf | ChakraSemanticRoles;

interface ChakraConditionMap {
	readonly [conditionName: string]: string | ReadonlyArray<string>;
}

interface ChakraTheme {
	readonly breakpoints: Record<string, string>;
	readonly tokens: Record<string, Record<string, ChakraTokenEntry>>;
	readonly semanticTokens: Record<string, Record<string, ChakraSemanticRoot>>;
}

interface ChakraSystem {
	readonly css: (styles: Record<string, unknown>) => Record<string, unknown>;
	readonly token: ((path: string) => string) & { readonly var: (path: string) => string };
}

interface ChakraConfig {
	readonly conditions: ChakraConditionMap;
	readonly theme: ChakraTheme;
	readonly utilities: {
		readonly transition: { readonly values: ReadonlyArray<string> };
		readonly transitionProperty: { readonly values: Readonly<Record<string, string>> };
	};
}

/**
 * Token groups read straight from the theme and shipped as plain string records.
 *
 * `blurs` is deliberately absent: Chakra reaches that scale only through its
 * `blur` utility, which writes a `--blur` custom property instead of a CSS
 * property, so no Pandwind property binding can read the group and its `:root`
 * declarations would be unreachable bytes.
 */
const staticTokenGroups = [
	"aspectRatios",
	"animations",
	"borders",
	"colors",
	"cursor",
	"durations",
	"easings",
	"fonts",
	"fontSizes",
	"fontWeights",
	"letterSpacings",
	"lineHeights",
	"radii",
	"sizes",
	"spacing",
	"zIndex",
] as const;

/** The property each semantic group is resolved through, so Chakra shapes the value. */
const semanticGroups = [
	{ group: "colors", property: "color" },
	{ group: "shadows", property: "boxShadow" },
	{ group: "radii", property: "borderRadius" },
] as const;

/** Chakra's default color palette, kept last so it wins the virtual-name assignment. */
const defaultColorPalette = "gray";

const sortedPairs = <TValue>(
	entries: ReadonlyArray<readonly [string, TValue]>,
): Record<string, TValue> =>
	Object.fromEntries(entries.toSorted(([left], [right]) => left.localeCompare(right)));

const collapsed = (value: string): string => value.replaceAll(/\s+/gu, " ").trim();

/**
 * Pandwind reads a slash as its color opacity modifier, so Chakra's fraction
 * keys (1/2, 1/3, ...) are renamed to the 1-2 form.
 */
const safeTokenName = (name: string): string => name.replaceAll("/", "-");

/**
 * Color keys carry the `$` sigil the CSS runtime reads as a token reference,
 * so `color: "$gray.700"` resolves. `tokenNameAliases` then also accepts the
 * bare `gray.700` spelling, which is the path Chakra itself uses.
 */
const tokenKey = (group: string, name: string): string => (group === "colors" ? "$" + name : name);

/**
 * Render the Chakra data module from the installed package.
 *
 * The module is returned instead of written so the preset parity test can
 * compare the checked-in file against a fresh render.
 */
export const renderChakraPresetModule = async (): Promise<{
	contents: string;
	version: string;
}> => {
	const chakraVersion = (
		JSON.parse(
			readFileSync(requireFromPandwind.resolve("@chakra-ui/react/package.json"), "utf8"),
		) as { version: string }
	).version;

	const chakra = (await import(requireFromPandwind.resolve("@chakra-ui/react"))) as {
		readonly defaultConfig: ChakraConfig;
		readonly createSystem: (config: ChakraConfig, options: ChakraConfig) => ChakraSystem;
	};

	const config = chakra.defaultConfig;
	const theme = config.theme;
	const system = chakra.createSystem(config, config);

	/** Chakra custom property to the literal it stands for. */
	const literalByVariable = new Map<string, string>();
	/** Chakra custom property to the token path this preset ships. */
	const pathByVariable = new Map<string, string>();

	const registerStaticPath = (chakraPath: string, pandwindPath: string): void => {
		const reference = system.token.var(chakraPath);
		const variable = /^var\((--chakra-.+)\)$/u.exec(reference)?.[1];
		if (variable === undefined) {
			throw new Error("Chakra produced no custom property for " + chakraPath + ": " + reference);
		}
		const literal = system.token(chakraPath);
		literalByVariable.set(variable, literal);
		pathByVariable.set(variable, pandwindPath);
	};

	const flattenStaticGroup = (group: string): Record<string, string> => {
		const entries: Array<readonly [string, string]> = [];
		for (const [tokenName, entry] of Object.entries(theme.tokens[group] ?? {})) {
			if ("value" in entry) {
				const name = safeTokenName(tokenName);
				entries.push([tokenKey(group, name), collapsed(String(entry.value))]);
				registerStaticPath(group + "." + tokenName, group + "." + tokenKey(group, name));
				continue;
			}
			for (const [nestedName, nestedEntry] of Object.entries(entry)) {
				const chakraPath = group + "." + tokenName + "." + nestedName;
				const name = safeTokenName(tokenName + "." + nestedName);
				const pandwindPath = group + "." + tokenKey(group, name);
				entries.push([tokenKey(group, name), collapsed(String(nestedEntry.value))]);
				registerStaticPath(chakraPath, pandwindPath);
			}
		}
		return sortedPairs(entries);
	};

	const staticTokens = Object.fromEntries(
		staticTokenGroups.map((group) => [group, flattenStaticGroup(group)]),
	) as Record<string, Record<string, string>>;

	/**
	 * The color root a token name belongs to, e.g. `blackAlpha` for
	 * `$blackAlpha.50`. The `$` sigil is a Pandwind spelling, so it is dropped
	 * from the palette names, which are the values a project writes for
	 * `colorPalette`.
	 */
	const colorRoot = (tokenName: string): string =>
		(tokenName.split(".")[0] ?? tokenName).replace(/^\$/u, "");

	/** Resolve an authored Chakra value through the system. */
	const resolveLiteral = (property: string, value: string): string => {
		const resolved = system.css({ [property]: value })[property];
		if (typeof resolved !== "string") {
			throw new Error("Chakra resolved " + value + " through " + property + " to a non-string");
		}
		return collapsed(resolved);
	};

	/** A resolved token variable, when Chakra kept the reference instead of inlining it. */
	const tokenReference = (value: string): string | undefined => {
		const match = /^var\((--chakra-[^)]+)\)$/u.exec(value);
		return match === null ? undefined : pathByVariable.get(match[1] ?? "");
	};

	/** Inline every Chakra variable an embedded value still carries. */
	const inlineVariables = (value: string): string =>
		value.replaceAll(/var\((--chakra-[^)]+)\)/gu, (_match, variable: string) => {
			const literal = literalByVariable.get(variable);
			if (literal === undefined) {
				throw new Error(
					"Chakra value still references " + variable + ", which the token catalog does not own",
				);
			}
			return literal;
		});

	const referencedValue = (property: string, value: string): string => {
		const resolved = resolveLiteral(property, value);
		return tokenReference(resolved) ?? inlineVariables(resolved);
	};

	/**
	 * Chakra's `transition` keyword vocabulary, flattened to one shorthand per
	 * keyword. A keyword expands to a property list whose members all share the
	 * duration and easing Chakra's utility adds, which is the shorthand a project
	 * writes by hand; Pandwind binds one property to one token value, so the three
	 * declarations Chakra emits have to be composed into one string here.
	 */
	const transitions = sortedPairs([
		["none", "none"],
		...config.utilities.transition.values.map((keyword): readonly [string, string] => {
			const resolved = system.css({ transition: keyword });
			const properties = resolved.transition;
			if (typeof properties !== "string") {
				throw new Error("Chakra produces no transition property for the " + keyword + " keyword");
			}
			if (properties === "none") return [keyword, properties];
			const duration = resolved.transitionDuration;
			const timingFunction = resolved.transitionTimingFunction;
			if (typeof duration !== "string" || typeof timingFunction !== "string") {
				throw new Error("Chakra transition " + keyword + " carries no duration or easing");
			}
			return [
				keyword,
				collapsed(inlineVariables(properties))
					.split(",")
					.map((property) => collapsed(property) + " " + duration + " " + timingFunction)
					.join(", "),
			];
		}),
	]);

	/**
	 * Chakra's `transitionProperty` keywords. That utility names a property list
	 * directly instead of composing a shorthand, so each value ships verbatim;
	 * `none` and `all` stay raw CSS, which the bound group's inherited
	 * strictness already accepts.
	 */
	const transitionProperties = sortedPairs(
		Object.entries(config.utilities.transitionProperty.values).map(
			([keyword, value]): readonly [string, string] => [keyword, collapsed(inlineVariables(value))],
		),
	);

	/**
	 * Color modes for one semantic token: a single base mode, or Chakra's
	 * light/dark pair. Mode order is authored, never sorted, so the emitted
	 * object keeps Pandwind's base-before-modes convention.
	 *
	 * The value arrives as `unknown` because a semantic root and a semantic leaf
	 * are both objects carrying a `value` key, and TypeScript does not narrow an
	 * `in` check against a string index signature; the runtime shape is validated
	 * here instead of asserted away.
	 */
	const semanticModes = (
		property: string,
		name: string,
		value: unknown,
	): Record<string, string> => {
		if (typeof value === "string") return { base: referencedValue(property, value) };
		if (typeof value !== "object" || value === null) {
			throw new Error("Chakra semantic token " + name + " carries no value");
		}
		const modes = Object.fromEntries(
			Object.entries(value).map(([mode, entry]): readonly [string, string] => {
				if (typeof entry !== "string") {
					throw new Error("Chakra semantic token " + name + " mode " + mode + " is not a string");
				}
				return [mode, entry];
			}),
		);
		const light = modes._light;
		const dark = modes._dark;
		if (light === undefined || dark === undefined) {
			throw new Error("Chakra semantic token " + name + " is missing a color mode");
		}
		return {
			_light: referencedValue(property, light),
			_dark: referencedValue(property, dark),
		};
	};

	const semanticTokens: Record<string, Record<string, Record<string, string>>> = {};
	for (const { group, property } of semanticGroups) {
		const entries: Array<readonly [string, Record<string, string>]> = [];
		for (const [rootName, root] of Object.entries(theme.semanticTokens[group] ?? {})) {
			if ("value" in root) {
				entries.push([
					tokenKey(group, safeTokenName(rootName)),
					semanticModes(property, rootName, root.value),
				]);
				continue;
			}
			for (const [tokenName, leaf] of Object.entries(root)) {
				const name = tokenName === "DEFAULT" ? rootName : rootName + "." + tokenName;
				entries.push([
					tokenKey(group, safeTokenName(name)),
					semanticModes(property, name, leaf.value),
				]);
			}
		}
		semanticTokens[group] = sortedPairs(entries);
	}

	const breakpoints = Object.fromEntries(
		Object.entries(theme.breakpoints).toSorted(([left], [right]) => left.localeCompare(right)),
	);

	const conditions = Object.fromEntries(
		Object.entries(config.conditions)
			.map(([name, value]) => ["_" + name, value] as const)
			.toSorted(([left], [right]) => left.localeCompare(right)),
	);

	// Every root Chakra accepts as a `colorPalette` value: the static color
	// roots (the four singletons and both alpha scales included) plus the `bg`,
	// `fg`, and `border` roots that exist only in the semantic layer. `gray`
	// stays last so the default palette assigns the virtual names it owns
	// after every other root has.
	const colorPaletteRoots = [
		...new Set([
			...Object.keys(staticTokens.colors ?? {}).map(colorRoot),
			...Object.keys(theme.semanticTokens.colors ?? {}).map(colorRoot),
		]),
	];
	const colorPalettes = [
		...colorPaletteRoots
			.filter((name) => name !== defaultColorPalette)
			.toSorted((left, right) => left.localeCompare(right)),
		defaultColorPalette,
	];

	const chakraTheme = {
		version: chakraVersion,
		tokens: staticTokens,
		semanticTokens,
		transitions,
		transitionProperties,
		conditions,
		breakpoints,
		colorPalettes,
	} as const;

	const banner = [
		"// Generated by scripts/promote-chakra-preset.ts. Do not edit by hand:",
		"// regenerate with pnpm run presets:generate and commit the diff.",
		"//",
		"// Source: @chakra-ui/react@" + chakraVersion + " defaultConfig read through its own",
		"// createSystem: theme.tokens for the static scales, theme.semanticTokens for the",
		"// color-mode tokens (resolved through system.css, so embedded {colors.x.y/10}",
		"// references become plain color-mix(...) text), theme.breakpoints for the pixel",
		"// widths, and conditions for the 104 condition selectors. Chakra's --chakra-*",
		"// variables are never emitted, because Pandwind declares none of them.",
		"//",
		"// Divergences from Chakra's own output, all asserted by the parity test:",
		"// every colors key carries Pandwind's `$` sigil ($gray.700, $bg.subtle), which is",
		'// what makes the authored `color: "$gray.700"` a token reference; the bare',
		"// `gray.700` spelling stays valid as its canonical alias,",
		"// sizes.1/2 ships as 1-2 (Pandwind reads a slash as its opacity modifier),",
		"// and the blurs group is absent because Chakra reaches it only through its blur",
		"// utility, which sets a --blur custom property rather than a CSS property. The",
		"// transitions group is composed, not transcribed: each keyword of Chakra's",
		"// transition utility carries a property list, a duration, and an easing, which",
		"// the single shorthand Pandwind binds joins back together per property. The",
		"// colorPalette role names are Chakra's own: both sides derive them from the",
		"// selected root's token paths, so `colorPalette.focusRing` already matches.",
		"//",
		"// License: MIT (https://github.com/chakra-ui/chakra-ui/blob/main/LICENSE)",
		"",
	].join("\n");

	return {
		contents:
			banner +
			"export const chakraTheme = " +
			JSON.stringify(chakraTheme, null, "\t") +
			" as const;\n",
		version: chakraVersion,
	};
};

const main = async (): Promise<void> => {
	const { contents, version } = await renderChakraPresetModule();
	const relativePath = relative(repositoryRoot, chakraPresetModulePath);
	if (process.argv.includes("--check")) {
		const checkedIn = existsSync(chakraPresetModulePath)
			? readFileSync(chakraPresetModulePath, "utf8")
			: "";
		if (checkedIn !== contents) {
			throw new Error(relativePath + " is stale; run pnpm run presets:generate");
		}
		console.log("Verified " + relativePath + " for @chakra-ui/react@" + version);
		return;
	}
	mkdirSync(dirname(chakraPresetModulePath), { recursive: true });
	writeFileSync(chakraPresetModulePath, contents);
	console.log("Wrote " + relativePath + " for @chakra-ui/react@" + version);
};

if (import.meta.main) await main();

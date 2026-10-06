/**
 * Regenerate the Tailwind v4 preset data module.
 *
 * Every value below comes from the installed `tailwindcss` package through
 * `@tailwindcss/node`'s design-system loader, so the shipped preset tracks the
 * version this workspace pins instead of a hand-copied list.
 *
 * Usage: `pnpm run presets:generate`
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "..");
const yumcssPackageRoot = join(repositoryRoot, "packages/yumcss");
const requireFromYumCSS = createRequire(join(yumcssPackageRoot, "package.json"));

/** Checked-in data module this generator owns. */
export const tailwindPresetModulePath = join(
	yumcssPackageRoot,
	"src/preset/generated/tailwindcss-theme.ts",
);

interface TailwindDesignSystem {
	theme: { namespace: (namespace: string) => Map<string | null, string> };
	candidatesToCss: (candidates: ReadonlyArray<string>) => ReadonlyArray<string | null>;
}

/**
 * Render the Tailwind data module from the installed package.
 *
 * The module is returned instead of written so the preset parity test can
 * compare the checked-in file against a fresh render.
 */
export const renderTailwindPresetModule = async (): Promise<{
	contents: string;
	version: string;
}> => {
	const tailwindVersion = (
		JSON.parse(readFileSync(requireFromYumCSS.resolve("tailwindcss/package.json"), "utf8")) as {
			version: string;
		}
	).version;

	const tailwindNode = (await import(requireFromYumCSS.resolve("@tailwindcss/node"))) as {
		__unstable__loadDesignSystem: (
			css: string,
			options: { base: string },
		) => Promise<TailwindDesignSystem>;
	};

	const designSystem = await tailwindNode.__unstable__loadDesignSystem(
		'@import "tailwindcss/theme.css";',
		{ base: requireFromYumCSS.resolve("tailwindcss/theme.css") },
	);

	const collapsed = (value: string): string => value.replaceAll(/\s+/gu, " ").trim();

	const sortedRecord = (entries: ReadonlyArray<readonly [string, string]>) =>
		Object.fromEntries(entries.toSorted(([left], [right]) => left.localeCompare(right)));

	/** Merge hand-added keyword entries into a namespace record, keeping keys sorted. */
	const mergeSorted = (
		record: Record<string, string>,
		extra: Record<string, string>,
	): Record<string, string> => sortedRecord([...Object.entries(record), ...Object.entries(extra)]);

	/** Theme keys, dropping the conditional/bare entries the namespace expands into. */
	const themeRecord = (
		namespace: string,
		options: { keep?: (key: string) => boolean; prefix?: string } = {},
	): Record<string, string> => {
		const entries: Array<[string, string]> = [];
		for (const [key, value] of designSystem.theme.namespace(namespace)) {
			if (key === null || key === "null") continue;
			if (options.keep !== undefined && !options.keep(key)) continue;
			entries.push([`${options.prefix ?? ""}${key}`, collapsed(value)]);
		}
		return sortedRecord(entries);
	};

	/** The declaration a static Tailwind utility compiles to, straight from the package. */
	const utilityDeclaration = (candidate: string, property: string): string => {
		const [css] = designSystem.candidatesToCss([candidate]);
		if (css === null || css === undefined)
			throw new Error(`Tailwind candidate '${candidate}' compiled to nothing`);
		const match = new RegExp(`(?:^|\\n)\\s+${property}:\\s*([^;]+);`).exec(css);
		const value = match?.[1];
		if (value === undefined)
			throw new Error(`Tailwind candidate '${candidate}' declares no '${property}'`);
		return value.trim();
	};

	const staticUtilities = (
		utilities: ReadonlyArray<readonly [string, string, string]>,
	): Record<string, string> =>
		sortedRecord(
			utilities.map(([key, candidate, property]) => [key, utilityDeclaration(candidate, property)]),
		);

	const remToPx = (value: string): string => {
		if (!value.endsWith("rem")) throw new Error(`Expected a rem breakpoint, received '${value}'`);
		return `${Number.parseFloat(value) * 16}px`;
	};

	const breakpoints = Object.fromEntries(
		Object.entries(themeRecord("--breakpoint")).map(([key, value]) => [key, remToPx(value)]),
	);

	const requiredValue = (record: Record<string, string>, key: string): string => {
		const value = record[key];
		if (value === undefined) throw new Error(`Missing '${key}' in the Tailwind theme`);
		return value;
	};

	const transitionDefaults = themeRecord("--default", {
		keep: (key) => key.startsWith("transition-"),
	});
	const transitionDuration = requiredValue(transitionDefaults, "transition-duration");
	const transitionTimingFunction = requiredValue(transitionDefaults, "transition-timing-function");

	/** The property list a `transition-*` utility animates, without Tailwind's own runtime properties. */
	const transitionPropertyNames = (candidate: string): ReadonlyArray<string> =>
		utilityDeclaration(candidate, "transition-property")
			.split(",")
			.map((property) => property.trim())
			.filter((property) => !property.startsWith("--tw-"));

	const transitions = sortedRecord([
		["none", "none"],
		...(["all", "colors", "shadow", "transform", "opacity"] as const).map(
			(key) =>
				[
					key,
					transitionPropertyNames(`transition-${key}`)
						.map((property) => `${property} ${transitionDuration} ${transitionTimingFunction}`)
						.join(", "),
				] as const,
		),
	]);

	const tailwindTheme = {
		version: tailwindVersion,
		colors: themeRecord("--color", { prefix: "$" }),
		fontFamilies: themeRecord("--font", { keep: (key) => !key.startsWith("weight-") }),
		fontSizes: themeRecord("--text", {
			keep: (key) => !key.endsWith("--line-height") && !key.startsWith("shadow-"),
		}),
		fontWeights: themeRecord("--font-weight"),
		// `leading-none` compiles to a bare `line-height: 1` rather than reading the
		// `--leading` namespace, so the keyword is added here.
		lineHeights: mergeSorted(themeRecord("--leading"), { none: "1" }),
		letterSpacings: themeRecord("--tracking"),
		radii: mergeSorted(
			themeRecord("--radius"),
			staticUtilities([
				["none", "rounded-none", "border-radius"],
				["full", "rounded-full", "border-radius"],
			]),
		),
		// `shadow-none` compiles to Tailwind's `--tw-shadow` plumbing, not to a
		// box-shadow value, so the neutral keyword is added here instead of being
		// extracted from the utility.
		shadows: mergeSorted(themeRecord("--shadow"), { none: "none" }),
		textShadows: mergeSorted(
			themeRecord("--text-shadow"),
			staticUtilities([["none", "text-shadow-none", "text-shadow"]]),
		),
		containers: mergeSorted(
			themeRecord("--container"),
			staticUtilities([
				["none", "max-w-none", "max-width"],
				["prose", "max-w-prose", "max-width"],
			]),
		),
		breakpoints,
		transitions,
		zIndices: staticUtilities([
			["auto", "z-auto", "z-index"],
			["0", "z-0", "z-index"],
			["10", "z-10", "z-index"],
			["20", "z-20", "z-index"],
			["30", "z-30", "z-index"],
			["40", "z-40", "z-index"],
			["50", "z-50", "z-index"],
		]),
	} as const;

	const banner = `
// Generated by \`scripts/promote-tailwind-preset.ts\`. Do not edit by hand:
// regenerate with \`pnpm run presets:generate\` and commit the diff.
//
// Source: tailwindcss@${tailwindVersion} \`theme.css\` read through
// \`@tailwindcss/node\`'s \`__unstable__loadDesignSystem\`, plus the static
// utilities (\`rounded-full\`, \`max-w-prose\`, \`z-*\`, ...) compiled by the same
// package. Tailwind v4 keeps those outside the theme namespace, so the values
// are extracted from the compiled declaration instead of being transcribed.
//
// License: MIT (https://github.com/tailwindlabs/tailwindcss/blob/main/LICENSE)
`.trimStart();

	return {
		contents: `${banner}\nexport const tailwindcssTheme = ${JSON.stringify(tailwindTheme, null, "\t")} as const;\n`,
		version: tailwindVersion,
	};
};

const main = async (): Promise<void> => {
	const { contents, version } = await renderTailwindPresetModule();
	const relativePath = relative(repositoryRoot, tailwindPresetModulePath);
	if (process.argv.includes("--check")) {
		const checkedIn = existsSync(tailwindPresetModulePath)
			? readFileSync(tailwindPresetModulePath, "utf8")
			: "";
		if (checkedIn !== contents) {
			throw new Error(
				`${relativePath} is stale for tailwindcss@${version}; run pnpm run presets:generate`,
			);
		}
		console.log(`Verified ${relativePath} for tailwindcss@${version}`);
		return;
	}
	mkdirSync(dirname(tailwindPresetModulePath), { recursive: true });
	writeFileSync(tailwindPresetModulePath, contents);
	console.log(`Wrote ${relativePath} for tailwindcss@${version}`);
};

if (import.meta.main) await main();

/**
 * Regenerate the Tailwind typography stylesheet asset.
 *
 * Every rule comes from the installed `@tailwindcss/typography` plugin through
 * the installed `tailwindcss` compiler, so the shipped asset tracks the versions
 * this workspace pins instead of a hand-copied excerpt.
 *
 * Usage: `pnpm run prose:generate`
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "..");
const pandwindPackageRoot = join(repositoryRoot, "packages/pandwind");
const requireFromPandwind = createRequire(join(pandwindPackageRoot, "package.json"));

/** Checked-in stylesheet asset this generator owns. */
export const tailwindProseStylesheetPath = join(pandwindPackageRoot, "src/prose/tailwindcss.css");

/**
 * Tailwind emits a modifier only when a candidate asks for it, so this list is
 * the asset's scope: the prose core plus every color theme the plugin ships.
 */
const proseCandidates: ReadonlyArray<string> = [
	"prose",
	"prose-sm",
	"prose-lg",
	"prose-xl",
	"prose-2xl",
	"prose-invert",
	...[
		"slate",
		"gray",
		"zinc",
		"neutral",
		"stone",
		"red",
		"orange",
		"amber",
		"yellow",
		"lime",
		"green",
		"emerald",
		"teal",
		"cyan",
		"sky",
		"blue",
		"indigo",
		"violet",
		"purple",
		"fuchsia",
		"pink",
		"rose",
	].map((color) => `prose-${color}`),
];

/** The theme variables the plugin declares in both spellings; an upstream rename must fail here. */
const proseVariableNames: ReadonlyArray<string> = [
	"body",
	"headings",
	"lead",
	"links",
	"bold",
	"counters",
	"bullets",
	"quotes",
	"quote-borders",
	"captions",
	"kbd",
	"kbd-shadows",
	"code",
	"pre-code",
	"pre-bg",
	"hr",
	"th-borders",
	"td-borders",
];

const upstreamGuard = '[class~="not-prose"], [class~="not-prose"] *';
const compactedGuard = ".not-prose, .not-prose *";

interface TailwindCompiler {
	compile: (
		css: string,
		options: { base: string; onDependency: (path: string) => void },
	) => Promise<{ build: (candidates: string[]) => string }>;
}

const packageVersion = (specifier: string): string =>
	(
		JSON.parse(readFileSync(requireFromPandwind.resolve(`${specifier}/package.json`), "utf8")) as {
			version: string;
		}
	).version;

/**
 * The trailing `@layer utilities` block of the compiled document. For a
 * prose-only candidate list that block is the plugin's entire output, and
 * everything before it is Tailwind's own theme and base layers.
 */
const proseRuleset = (document: string): string => {
	const start = document.indexOf("@layer utilities {");
	if (start === -1) {
		throw new Error("Tailwind compiled no '@layer utilities' block for the prose candidates");
	}
	const ruleset = document.slice(start);
	const layers = (ruleset.match(/@layer/gu) ?? []).length;
	const opens = (ruleset.match(/\{/gu) ?? []).length;
	const closes = (ruleset.match(/\}/gu) ?? []).length;
	if (layers !== 1 || opens !== closes) {
		throw new Error(
			"Tailwind emitted layers after the prose block; the slice is no longer the plugin's whole output",
		);
	}
	return ruleset;
};

/**
 * Render the stylesheet asset from the installed packages.
 *
 * The asset is returned instead of written so the byte check in `--check` mode
 * can compare the checked-in file against a fresh render.
 */
export const renderTailwindProseStylesheet = async (): Promise<{
	contents: string;
	version: string;
}> => {
	const tailwindVersion = packageVersion("tailwindcss");
	const typographyVersion = packageVersion("@tailwindcss/typography");
	const typographyEntry = requireFromPandwind.resolve("@tailwindcss/typography");

	const tailwindNode = (await import(
		requireFromPandwind.resolve("@tailwindcss/node")
	)) as TailwindCompiler;
	const compiler = await tailwindNode.compile(
		['@import "tailwindcss";', `@plugin "${typographyEntry}";`, ""].join("\n"),
		{ base: pandwindPackageRoot, onDependency: () => {} },
	);

	const ruleset = proseRuleset(compiler.build([...proseCandidates]));
	if (!ruleset.includes(".prose {")) {
		throw new Error("The compiled prose block declares no '.prose' rule");
	}
	const guardCount = ruleset.split(upstreamGuard).length - 1;
	if (guardCount === 0) {
		throw new Error("The compiled prose block declares no '.not-prose' guard chain");
	}

	const compacted = ruleset
		.replace("@layer utilities {", "@layer prose {")
		.replaceAll(upstreamGuard, compactedGuard);
	if (!compacted.startsWith("@layer prose {") || compacted.includes(upstreamGuard)) {
		throw new Error("The compiled prose block no longer starts with the utilities layer header");
	}
	for (const name of proseVariableNames) {
		for (const prefix of ["--tw-prose-", "--tw-prose-invert-"]) {
			if (!compacted.includes(`${prefix}${name}:`)) {
				throw new Error(`The compiled prose block declares no '${prefix}${name}'`);
			}
		}
	}

	const banner = `
/*
 * Pandwind prose: Tailwind Typography, compiled from @tailwindcss/typography@${typographyVersion}.
 * Upstream: https://github.com/tailwindlabs/tailwindcss-typography/blob/v${typographyVersion}/src/index.js
 *           https://github.com/tailwindlabs/tailwindcss-typography/blob/v${typographyVersion}/src/styles.js
 *
 * Generated by \`scripts/promote-tailwind-prose.ts\`. Do not edit by hand:
 * regenerate with \`pnpm run prose:generate\` and commit the diff.
 *
 * The block below is the whole \`@layer utilities\` document the pinned
 * \`tailwindcss@${tailwindVersion}\` compiler emitted for the prose family, so it
 * carries the plugin's rules and none of Tailwind's own theme or base layers.
 *
 * Ported, not copied verbatim. Four deliberate differences:
 *
 *   1. The rules sit in \`@layer prose\` instead of \`@layer utilities\`. A project on
 *      Pandwind's \`cascade: "layers"\` output declares the order once:
 *
 *        @layer reset, prose, pandwind;
 *
 *      Layer order is fixed by first appearance, so a declaration that stops at
 *      \`pandwind\` would sort this whole scale after every generated atom. An
 *      undeclared layer still loses to unlayered CSS, so a project on the default
 *      \`specificity\` cascade needs no declaration.
 *   2. The \`.not-prose\` guard reads \`${compactedGuard}\` where upstream writes the
 *      attribute form. Both selectors sit inside \`:where()\`, so both contribute
 *      zero specificity and match the same elements; the class form is ~5.5 KB
 *      smaller across the \`${guardCount}\` guard chains.
 *   3. The \`prose-*\` element variants (\`prose-a:\`, \`prose-img:\`, ...) are absent.
 *      Upstream registers them as utilities, and a static asset has no utility
 *      engine to attach them to. Restyle those elements with \`css.class()\`, or
 *      target the class names the variants would have generated.
 *   4. The color-theme modifiers are shipped whole rather than narrowed to the
 *      candidates a build referenced, and they are pixel-identical to upstream.
 *      A project that overrides \`--tw-prose-*\` itself keeps its own values, because
 *      the variable names and their \`--tw-prose-invert-*\` twins are upstream's.
 *
 * The \`.prose\` and \`.not-prose\` class names, the four size modifiers,
 * \`.prose-invert\`, and every \`--tw-prose-*\` custom property are upstream's, so
 * existing Tailwind markup and its variable overrides keep working.
 *
 * MIT License — Copyright (c) Tailwind Labs, Inc.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

`.trimStart();

	return { contents: `${banner}${compacted}`, version: typographyVersion };
};

const main = async (): Promise<void> => {
	const { contents, version } = await renderTailwindProseStylesheet();
	const relativePath = relative(repositoryRoot, tailwindProseStylesheetPath);
	if (process.argv.includes("--check")) {
		const checkedIn = existsSync(tailwindProseStylesheetPath)
			? readFileSync(tailwindProseStylesheetPath, "utf8")
			: "";
		if (checkedIn !== contents) {
			throw new Error(
				`${relativePath} is stale for @tailwindcss/typography@${version}; run pnpm run prose:generate`,
			);
		}
		console.log(`Verified ${relativePath} for @tailwindcss/typography@${version}`);
		return;
	}
	mkdirSync(dirname(tailwindProseStylesheetPath), { recursive: true });
	writeFileSync(tailwindProseStylesheetPath, contents);
	console.log(`Wrote ${relativePath} for @tailwindcss/typography@${version}`);
};

if (import.meta.main) await main();

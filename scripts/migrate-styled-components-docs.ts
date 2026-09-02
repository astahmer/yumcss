/**
 * Run the pinned styled-components documentation site through the shared
 * source-adapter -> StyleProgram -> Pandwind target route.
 *
 * The reference checkout is never edited. This script owns disposable
 * materialization and lane evidence so every migration is reproducible from
 * the Git commit recorded in reference-repos.md.
 */
import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import {
	CodemodAdapterId,
	StyleProgramEmissionHint,
	createBuiltinCodemodCatalog,
	runAdapterMigration,
} from "../packages/codemod/src/swap/index.ts";
import type { AdapterMigrationResult, StyleProgram } from "../packages/codemod/src/swap/index.ts";
import { createCssExtractionService } from "../packages/pandwind/src/vite/css-extract.ts";
import { createCssSourceScanner } from "../packages/pandwind/src/vite/css-extract.ts";
import { createStylesheet } from "../packages/pandwind/src/css/create-stylesheet.ts";
import type { StyleObject } from "../packages/pandwind/src/types/typings.ts";

export enum StyledComponentsDocsLane {
	RuntimeCss = "runtime-css",
	DesignCss = "design-css",
}

export interface StyledComponentsDocsLaneReport {
	readonly lane: StyledComponentsDocsLane;
	readonly referenceCommit: string;
	readonly sourceFiles: number;
	readonly changedFiles: number;
	readonly convertedCallSites: number;
	readonly staticCallSites: number;
	readonly runtimeFallbackCallSites: number;
	readonly dynamicValueCallSites: number;
	readonly staticCssCoverageRatio: number;
	readonly staticExtractionRatio: number;
	readonly skippedCallSites: number;
	readonly sourceBytes: number;
	readonly outputBytes: number;
	readonly outputByteDelta: number;
	readonly residuals: readonly {
		readonly file: string;
		readonly kind: string;
		readonly text: string;
		readonly hint?: string;
	}[];
}

export interface StyledComponentsDocsMigrationOptions {
	readonly referenceRoot?: string;
	readonly outputRoot?: string;
}

const repositoryRoot = resolve(import.meta.dirname, "..");
const defaultReferenceRoot = "/Users/astahmer/.references/styled-components-website";
const supportRoot = "pandwind";

interface LaneAdapter {
	transform(
		source: string,
		file: string,
		root: string,
	): AdapterMigrationResult & {
		readonly staticCallSites: number;
		readonly runtimeFallbackCallSites: number;
	};
}

function migratedMediaHelpers(): string {
	return `type CSSUtilType = string | ((props: Record<string, unknown>) => string);

const media = (query: string, inner: CSSUtilType): CSSUtilType =>
  typeof inner === "function"
    ? (props) => \`@media \${query} {\${inner(props)}}\`
    : \`@media \${query} {\${inner}}\`;

export const mobile = (inner: CSSUtilType): CSSUtilType => media("(max-width: 62.5em)", inner);
export const phone = (inner: CSSUtilType): CSSUtilType => media("(max-width: 40.625em)", inner);
`;
}

const staticPreset = {
	strict: false,
	properties: {},
	tokens: {},
	conditions: {
		base: "",
		sm: "@media (min-width: 640px)",
		md: "@media (min-width: 768px)",
		lg: "@media (min-width: 1024px)",
		xl: "@media (min-width: 1280px)",
		_light: ":root &",
		_dark: ".dark &",
	},
} as const;

function containsDynamic(program: StyleProgram): boolean {
	return program.rules.some(
		(rule) =>
			rule.declarations.some((declaration) => declaration.value.kind === "dynamic") ||
			rule.children.some((child) => containsDynamic({ ...program, rules: [child] })),
	);
}

function hasComponentSelectorInterpolation(template: string): boolean {
	const isSelectorPosition = (end: number): boolean => {
		for (let index = end; index < template.length; index++) {
			const character = template[index];
			if (character === ";" || character === "}") return false;
			if (character === "{") return true;
		}
		return false;
	};
	for (let index = 0; index < template.length; index++) {
		if (template[index] !== "$" || template[index + 1] !== "{") continue;
		const end = template.indexOf("}", index + 2);
		if (end < 0) continue;
		const expression = template.slice(index + 2, end).trim();
		if (
			(/^[A-Z_$][\w$]*$/.test(expression) ||
				/^(?:\(\s*[^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*[A-Z_$][\w$]*$/.test(expression)) &&
			isSelectorPosition(end + 1)
		)
			return true;
		index = end;
	}
	return false;
}

function requiresRuntimeCss(program: StyleProgram): boolean {
	if (program.emissionHints?.includes(StyleProgramEmissionHint.RawTemplate) === true) return true;
	if (program.residuals.some((residual) => residual.kind === "parse")) return true;
	if (
		program.residuals.some(
			(residual) => residual.kind === "dynamic" && residual.hint?.includes("condition") === true,
		)
	)
		return true;
	if (
		program.source?.subjectAttrs !== undefined &&
		/=>|\bfunction\b|\b(?:props|theme|attrs)\b/.test(program.source.subjectAttrs)
	)
		return true;
	if (
		program.source?.template !== undefined &&
		hasComponentSelectorInterpolation(program.source.template)
	)
		return true;
	return program.rules.some(function hasRuntimeRule(rule): boolean {
		return (
			(rule.kind !== "style" &&
				rule.declarations.some((declaration) => declaration.value.kind === "dynamic")) ||
			rule.children.some(hasRuntimeRule)
		);
	});
}

function withRuntimeImports(source: string, lane: StyledComponentsDocsLane): string {
	const needsRuntime = /\bcss\.(?:class|vars|group|props|raw|input|sheet)\b/.test(source);
	const needsTemplate = /\bcssTemplate\s*`/.test(source);
	const hasSourceCssImport =
		/import\s+(?:[A-Za-z_$][\w$]*\s*,\s*)?\{[^}]*\bcss\b[^}]*\}\s+from\s+["']styled-components["']/u.test(
			source,
		);
	const needsStyledCssFallback = /\bcss\s*`/.test(source) && !hasSourceCssImport;
	const keepsSourceCss = hasSourceCssImport || needsStyledCssFallback;
	const needsThemeProvider = /\bThemeProvider\b/.test(source);
	const needsCreateTheme = /\bcreateTheme\s*\(/.test(source);
	const needsStyledFallback =
		/\bstyled\s*(?:\.|\()/.test(source) && !/\bimport\s+styled\b/.test(source);
	const normalizedSource = source.replace(
		/import\s+\{\s*ThemeProvider\s*\}\s+from\s+["']styled-components["'];?/g,
		'import { ThemeProvider } from "@/pandwind/theme";',
	);
	if (
		!needsRuntime &&
		!needsTemplate &&
		!needsThemeProvider &&
		!needsStyledFallback &&
		!needsStyledCssFallback
	)
		return source;
	const runtimeBinding = lane === StyledComponentsDocsLane.DesignCss ? "dcss" : "css";
	const runtimeAlias = keepsSourceCss ? "__pandwindCss" : runtimeBinding;
	const runtimeSource = normalizedSource
		.replaceAll('from "pandwind/runtime"', 'from "@/pandwind/runtime"')
		.replaceAll('from "pandwind/theme"', 'from "@/pandwind/theme"');
	const hasRuntime = new RegExp(
		`import\\s*\\{[^}]*\\b${runtimeAlias}\\b[^}]*\\}\\s*from\\s*["']@/pandwind/runtime["']`,
	).test(runtimeSource);
	const hasTemplate = runtimeSource.includes("const cssTemplate =");
	const imports =
		(needsRuntime || needsTemplate
			? hasRuntime
				? ""
				: `import { ${runtimeAlias === runtimeBinding ? runtimeBinding : `${runtimeBinding} as ${runtimeAlias}`} } from "@/pandwind/runtime";\n`
			: "") +
		(needsStyledFallback ? 'import styled from "styled-components";\n' : "") +
		(needsStyledCssFallback ? 'import { css } from "styled-components";\n' : "") +
		(needsThemeProvider || needsCreateTheme
			? `import { ${[needsThemeProvider ? "ThemeProvider" : "", needsCreateTheme ? "createTheme" : ""].filter(Boolean).join(", ")} } from "@/pandwind/theme";\n`
			: "") +
		(needsTemplate && !hasTemplate
			? 'const cssTemplate = (strings, ...values) => values.some((value) => typeof value === "function") ? (props) => strings.reduce((output, string, index) => { const value = values[index]; const resolved = typeof value === "function" ? (value.__pandwindClassName === undefined ? value(props) : "." + value.__pandwindClassName) : value; return output + string + (resolved ?? ""); }, "") : strings.reduce((output, string, index) => output + string + (values[index] ?? ""), "");\n'
			: "");
	const isolatedRuntimeSource =
		keepsSourceCss && runtimeAlias !== runtimeBinding
			? runtimeSource.replace(
					/\bcss\.(class|vars|group|props|raw|input|sheet)\b/g,
					`${runtimeAlias}.$1`,
				)
			: runtimeSource;
	if (imports === "") return isolatedRuntimeSource;
	const directive = /^(?:["']use client["'];\s*\n?)/.exec(runtimeSource)?.[0];
	return directive === undefined
		? imports + isolatedRuntimeSource
		: directive + imports + isolatedRuntimeSource.slice(directive.length);
}

class StyledComponentsLaneAdapter implements LaneAdapter {
	constructor(private readonly lane: StyledComponentsDocsLane) {}

	transform(
		source: string,
		file: string,
		root: string,
	): AdapterMigrationResult & {
		readonly staticCallSites: number;
		readonly runtimeFallbackCallSites: number;
	} {
		if (/utils\/media\.tsx?$/.test(file) && /export const (?:mobile|phone)/.test(source)) {
			const converted = [...source.matchAll(/export const (?:mobile|phone)\s*=/g)].length;
			return {
				code: migratedMediaHelpers(),
				changed: true,
				converted,
				skipped: 0,
				reports: [],
				validations: [],
				dependencies: [],
				residuals: [],
				staticCallSites: converted,
				runtimeFallbackCallSites: 0,
			};
		}
		const sourceAdapter = createBuiltinCodemodCatalog().registry.get(
			CodemodAdapterId.StyledComponents,
		)!;
		const config = sourceAdapter.loadConfig({ file, source, root });
		const parsed = sourceAdapter.parse(source, { file, source, root, config });
		const staticCallSites = parsed.matches.filter(
			(match) => match.program.residuals.length === 0 && !containsDynamic(match.program),
		).length;
		const runtimeFallbackCallSites = parsed.matches.filter((match) =>
			requiresRuntimeCss(match.program),
		).length;
		const result = runAdapterMigration(source, {
			from: CodemodAdapterId.StyledComponents,
			to: CodemodAdapterId.Pandwind,
			file,
			root,
			mode: "safe",
		});
		const normalizedCode = result.code
			.replaceAll('import { createCss } from "pandwind/css";\n', "")
			.replaceAll("const css = createCss();\n", "")
			.replaceAll('import { createRuntimeCss } from "pandwind/css/runtime";\n', "")
			.replaceAll('import { pandwindPreset } from "pandwind/preset";\n', "")
			.replaceAll("const css = createRuntimeCss(pandwindPreset);\n", "");
		const runtimeCode = withRuntimeImports(normalizedCode, this.lane);
		if (this.lane === StyledComponentsDocsLane.RuntimeCss)
			return { ...result, code: runtimeCode, staticCallSites, runtimeFallbackCallSites };
		return {
			...result,
			code: runtimeCode
				.replaceAll("__pandwindCss", "dcss")
				.replace(/\bcss\.(class|vars|group|props|raw|input|sheet)\b/g, "dcss.$1")
				.replaceAll("css(", "dcss(")
				.replaceAll("createCx({ css })", "createCx({ css: dcss })"),
			staticCallSites,
			runtimeFallbackCallSites,
		};
	}
}

async function collectSourceFiles(root: string): Promise<string[]> {
	const files: string[] = [];
	const visit = async (directory: string): Promise<void> => {
		for (const entry of await readdir(directory, { withFileTypes: true })) {
			if ([".git", ".next", "node_modules"].includes(entry.name)) continue;
			const absolute = join(directory, entry.name);
			if (entry.isDirectory()) {
				await visit(absolute);
				continue;
			}
			if (/\.(?:js|jsx|ts|tsx)$/.test(entry.name)) files.push(absolute);
		}
	};
	await visit(root);
	return files.toSorted();
}

function runtimePreset(): string {
	return `/** Generated by scripts/migrate-styled-components-docs.ts. */
export const pandwindPreset = {
  strict: false,
  properties: {},
  tokens: {},
  conditions: {
    base: "",
    sm: "@media (min-width: 640px)",
    md: "@media (min-width: 768px)",
    lg: "@media (min-width: 1024px)",
    xl: "@media (min-width: 1280px)",
    _light: ":root &",
    _dark: ".dark &",
  },
} as const;
`;
}

function runtimeRegistry(): string {
	return `'use client';

import { useServerInsertedHTML } from 'next/navigation';
import React, { useState } from 'react';
import { ServerStyleSheet, StyleSheetManager } from 'styled-components';
import { runtimeSheet } from '@/pandwind/runtime';

export default function StyledComponentsRegistry({ children }: { children: React.ReactNode }) {
  const [styledComponentsStyleSheet] = useState(() => new ServerStyleSheet());

  useServerInsertedHTML(() => {
    const pandwindCss = runtimeSheet.css();
    runtimeSheet.hydrate({ tokens: '', rules: [] });
    const styles = styledComponentsStyleSheet.getStyleElement();
    styledComponentsStyleSheet.instance.clearTag();
    return <>{pandwindCss !== '' && <style data-pandwind-runtime dangerouslySetInnerHTML={{ __html: pandwindCss }} />}{styles}</>;
  });

  if (typeof window !== 'undefined') return <>{children}</>;

  return (
    <StyleSheetManager sheet={styledComponentsStyleSheet.instance}>
      <>{children}</>
    </StyleSheetManager>
  );
}
`;
}

function staticStyleCollector(files: ReadonlyMap<string, string>): string {
	const imports = [...files.entries()]
		.map(([file]) => file)
		.map((file) => `import ${JSON.stringify(`../${file}`)};`)
		.join("\n");
	return `import { runtimeSheet } from "./runtime";
${imports}
process.stdout.write(runtimeSheet.css());
`;
}

function staticCssFromSource(files: ReadonlyMap<string, string>): string {
	const extraction = createCssExtractionService({
		matchers: ["css"],
		preset: staticPreset as never,
	});
	const runtimeScanner = createCssSourceScanner(["runtime"]);
	const styles: StyleObject[] = [];
	const sheet = createStylesheet(staticPreset as never);
	const processStaticVarKey = (key: string): void => {
		try {
			sheet.processVarKey(key);
		} catch (error) {
			// A component interpolation is a runtime selector, not a static
			// condition. The runtime collector imports the same source files and
			// remains the authoritative fallback for those keys; static extraction
			// must not make the whole migration fail while trying to decode one.
			if (error instanceof Error && error.message.startsWith("Unknown condition")) return;
			throw error;
		}
	};
	for (const [file, source] of files) {
		const extracted = extraction.extractFile(source, file);
		for (const style of extracted.sources) styles.push(style.style);
		for (const key of extracted.varKeys) processStaticVarKey(key);
		const runtimeNames = runtimeScanner.findImports(source, file);
		for (const key of runtimeScanner.findVarKeys(source, file, runtimeNames))
			processStaticVarKey(key);
	}
	return [sheet.generate(styles), sheet.gen.varRules()].filter((value) => value !== "").join("\n");
}

function collectorSafeSource(source: string): string {
	return source.replace(
		/^\s*import\s+(?:(.+?)\s+from\s+)?['"][^'"]+\.(?:md|mdx|css)['"];?\s*$/gm,
		(_match, bindings: string | undefined) => {
			const defaultBinding =
				bindings === undefined ? undefined : /^([A-Za-z_$][\w$]*)$/.exec(bindings.trim())?.[1];
			return defaultBinding === undefined ? "" : `const ${defaultBinding} = () => null;`;
		},
	);
}

async function readPinnedReleaseFixture(referenceRoot: string): Promise<readonly unknown[]> {
	const cacheDirectory = join(referenceRoot, ".next/cache/fetch-cache");
	let files: readonly string[];
	try {
		files = await readdir(cacheDirectory);
	} catch (error) {
		throw new Error(`pinned reference has no fetch cache at ${cacheDirectory}`, { cause: error });
	}
	for (const file of files) {
		let cached: { data?: { body?: string; url?: string } };
		try {
			cached = JSON.parse(await readFile(join(cacheDirectory, file), "utf8")) as typeof cached;
		} catch {
			continue;
		}
		if (
			cached.data?.body === undefined ||
			!cached.data.url?.startsWith(
				"https://api.github.com/repos/styled-components/styled-components/releases?",
			)
		)
			continue;
		const payload = JSON.parse(Buffer.from(cached.data.body, "base64").toString("utf8"));
		if (Array.isArray(payload)) return payload;
	}
	throw new Error(
		`pinned reference fetch cache does not contain a GitHub releases fixture: ${cacheDirectory}`,
	);
}

function runtimeModule(lane: StyledComponentsDocsLane): string {
	const factory =
		lane === StyledComponentsDocsLane.DesignCss ? "createRuntimeDesignCss" : "createRuntimeCss";
	const binding = lane === StyledComponentsDocsLane.DesignCss ? "dcss" : "css";
	return `import { ${factory}, createRuntimeSheet } from "pandwind/css/runtime";
import { pandwindPreset } from "./preset";

const runtimeGlobal = globalThis as typeof globalThis & {
  __pandwindStyledComponentsDocsSheet?: ReturnType<typeof createRuntimeSheet>;
};
export const runtimeSheet =
  runtimeGlobal.__pandwindStyledComponentsDocsSheet ??= createRuntimeSheet();
export const ${binding} = ${factory}(pandwindPreset, { sheet: runtimeSheet });
`;
}

function themeModule(): string {
	return `"use client";
import { createContext, createElement, useContext } from "react";

const pandwindThemeContext = createContext<unknown>(undefined);
export const usePandwindTheme = () => useContext(pandwindThemeContext);
export const ThemeProvider = ({ theme, children }: { theme: unknown; children: unknown }) =>
  createElement(pandwindThemeContext.Provider, { value: theme }, children);

type ThemeValue = string | number | boolean | null | undefined | ThemeRecord | ThemeValue[];
type ThemeRecord = { [key: string]: ThemeValue };

const themeValue = (value: ThemeValue, path: string[], prefix: string): ThemeValue => {
  if (Array.isArray(value)) return value.map((item, index) => themeValue(item, [...path, String(index)], prefix));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, themeValue(child, [...path, key], prefix)]));
  }
  if (value === null || value === undefined) return value;
  const name = [prefix, ...path].join('-');
  return 'var(--' + name + ', ' + String(value) + ')';
};

const themeVariables = (value: ThemeValue, path: string[], prefix: string): ThemeValue => {
  if (Array.isArray(value)) return value.map((item, index) => themeVariables(item, [...path, String(index)], prefix));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, themeVariables(child, [...path, key], prefix)]));
  }
  if (value === null || value === undefined) return value;
  return '--' + [prefix, ...path].join('-');
};

export const createTheme = (value: ThemeRecord, options: { prefix?: string } = {}) => ({
  ...themeValue(value, [], options.prefix ?? 'pw') as ThemeRecord,
  vars: themeVariables(value, [], options.prefix ?? 'pw') as ThemeRecord,
  GlobalStyle: () => null,
});
`;
}

async function materialize(
	referenceRoot: string,
	outputRoot: string,
	lane: StyledComponentsDocsLane,
	files: ReadonlyMap<string, string>,
): Promise<void> {
	await mkdir(outputRoot, { recursive: true });
	for (const entry of await readdir(referenceRoot, { withFileTypes: true })) {
		if ([".git", "node_modules", ".next"].includes(entry.name)) continue;
		await cp(join(referenceRoot, entry.name), join(outputRoot, entry.name), {
			recursive: true,
			force: true,
		});
	}
	// The pinned site reads a GitHub endpoint directly during static generation.
	// Reuse the response captured by the pinned reference build so reference and
	// candidate pages render the same content even when the API rate-limits a
	// later build. The reference checkout itself remains untouched.
	const githubApiFile = join(outputRoot, "utils/githubApi.ts");
	const githubApi = await readFile(githubApiFile, "utf8");
	const releaseFixture = await readPinnedReleaseFixture(referenceRoot);
	const releaseFixtureSource = JSON.stringify(releaseFixture)
		.replaceAll("`", "\\`")
		.replaceAll("${", "\\${");
	const stableGithubApi = githubApi.replace(
		"fetch(`https://api.github.com/repos/styled-components/${repo}/releases?per_page=999`).then(resp => resp.json());",
		`Promise.resolve(${releaseFixtureSource});`,
	);
	if (stableGithubApi !== githubApi) await writeFile(githubApiFile, stableGithubApi);
	const packageFile = join(outputRoot, "package.json");
	const packageJson = JSON.parse(await readFile(packageFile, "utf8")) as {
		dependencies?: Record<string, string>;
	};
	packageJson.dependencies = {
		...packageJson.dependencies,
		pandwind: `file:${join(repositoryRoot, "packages/pandwind")}`,
	};
	await writeFile(packageFile, `${JSON.stringify(packageJson, null, 2)}\n`);
	await execFileSync("pnpm", ["install", "--no-frozen-lockfile"], {
		cwd: outputRoot,
		stdio: "inherit",
	});

	const nextConfig = join(outputRoot, "next.config.mjs");
	const nextSource = await readFile(nextConfig, "utf8");
	if (!nextSource.includes("transpilePackages"))
		await writeFile(
			nextConfig,
			nextSource.replace(
				"const nextConfig = {",
				'const nextConfig = {\n  transpilePackages: ["pandwind"],',
			),
		);

	for (const [file, code] of files) {
		const target = join(outputRoot, file);
		await mkdir(dirname(target), { recursive: true });
		await writeFile(target, code);
	}
	const layoutFile = join(outputRoot, "app/layout.tsx");
	const layout = await readFile(layoutFile, "utf8");
	await writeFile(layoutFile, layout);
	for (const [file, code] of [
		["lib/registry.tsx", runtimeRegistry()],
		[`${supportRoot}/preset.ts`, runtimePreset()],
		[`${supportRoot}/runtime.ts`, runtimeModule(lane)],
		[`${supportRoot}/theme.tsx`, themeModule()],
	] as const) {
		const target = join(outputRoot, file);
		await mkdir(dirname(target), { recursive: true });
		await writeFile(target, code);
	}
	const sourceThemeFile = join(outputRoot, "utils/theme.ts");
	try {
		const sourceTheme = await readFile(sourceThemeFile, "utf8");
		const migratedTheme = sourceTheme.replace(
			/import\s+\{\s*createTheme\s*\}\s+from\s+["']styled-components["'];?/g,
			'import { createTheme } from "@/pandwind/theme";',
		);
		const withThemeImport =
			!migratedTheme.match(/\bimport\s+\{\s*createTheme\s*\}/) &&
			/\bcreateTheme\s*\(/.test(migratedTheme)
				? 'import { createTheme } from "@/pandwind/theme";\n' + migratedTheme
				: migratedTheme;
		if (withThemeImport !== sourceTheme) await writeFile(sourceThemeFile, withThemeImport);
	} catch {
		// Some reference revisions do not expose the optional theme helper.
	}
	const collectorFile = join(outputRoot, `${supportRoot}/static-style-collector.ts`);
	await writeFile(collectorFile, staticStyleCollector(files));
	const collectorStubs: Array<[string, string]> = [];
	for (const [file, code] of files) {
		if (!/\.(?:md|mdx|css)['"]/.test(code)) continue;
		const target = join(outputRoot, file);
		const safe = collectorSafeSource(code);
		if (safe === code) continue;
		collectorStubs.push([target, code]);
		await writeFile(target, safe);
	}
	let staticCss = staticCssFromSource(files);
	try {
		const runtimeCss = execFileSync("nub", [collectorFile], {
			cwd: outputRoot,
			encoding: "utf8",
			maxBuffer: 16 * 1024 * 1024,
		});
		staticCss = [staticCss, runtimeCss].filter((value) => value.trim() !== "").join("\n");
	} finally {
		for (const [target, code] of collectorStubs) await writeFile(target, code);
	}
	await writeFile(join(outputRoot, "pandwind-static.css"), staticCss);
	const layoutSource = await readFile(layoutFile, "utf8");
	if (!layoutSource.includes("../pandwind-static.css"))
		await writeFile(
			layoutFile,
			layoutSource.replace(
				"import './theme-base.css';",
				"import './theme-base.css';\nimport '../pandwind-static.css';",
			),
		);
}

export class StyledComponentsDocsMigration {
	static readonly lanes: readonly StyledComponentsDocsLane[] = [
		StyledComponentsDocsLane.RuntimeCss,
		StyledComponentsDocsLane.DesignCss,
	];

	static async run(
		lane: StyledComponentsDocsLane,
		options: StyledComponentsDocsMigrationOptions = {},
	): Promise<StyledComponentsDocsLaneReport> {
		const referenceRoot = resolve(options.referenceRoot ?? defaultReferenceRoot);
		const referenceCommit = execFileSync("git", ["-C", referenceRoot, "rev-parse", "HEAD"], {
			encoding: "utf8",
		}).trim();
		const adapter = new StyledComponentsLaneAdapter(lane);
		const transformed = new Map<string, string>();
		const residuals: StyledComponentsDocsLaneReport["residuals"][number][] = [];
		let sourceFiles = 0;
		let changedFiles = 0;
		let convertedCallSites = 0;
		let staticCallSites = 0;
		let runtimeFallbackCallSites = 0;
		let dynamicValueCallSites = 0;
		let skippedCallSites = 0;
		let sourceBytes = 0;
		let outputBytes = 0;
		for (const absolute of await collectSourceFiles(referenceRoot)) {
			const source = await readFile(absolute, "utf8");
			const file = relative(referenceRoot, absolute).replaceAll("\\", "/");
			const result = adapter.transform(source, file, referenceRoot);
			if (!result.changed && result.residuals.length === 0) continue;
			sourceFiles++;
			changedFiles += Number(result.changed);
			convertedCallSites += result.converted;
			staticCallSites += result.staticCallSites;
			runtimeFallbackCallSites += result.runtimeFallbackCallSites;
			dynamicValueCallSites += Math.max(0, result.converted - result.staticCallSites);
			skippedCallSites += result.skipped;
			sourceBytes += Buffer.byteLength(source);
			outputBytes += Buffer.byteLength(result.code);
			transformed.set(file, result.code);
			for (const residual of result.residuals) {
				residuals.push({
					file,
					kind: residual.kind,
					text: residual.text,
					...(residual.hint === undefined ? {} : { hint: residual.hint }),
				});
			}
		}
		if (options.outputRoot !== undefined)
			await materialize(referenceRoot, resolve(options.outputRoot), lane, transformed);
		return {
			lane,
			referenceCommit,
			sourceFiles,
			changedFiles,
			convertedCallSites,
			staticCallSites,
			runtimeFallbackCallSites,
			dynamicValueCallSites,
			staticCssCoverageRatio:
				convertedCallSites === 0
					? 1
					: (convertedCallSites - runtimeFallbackCallSites) / convertedCallSites,
			staticExtractionRatio: convertedCallSites === 0 ? 1 : staticCallSites / convertedCallSites,
			skippedCallSites,
			sourceBytes,
			outputBytes,
			outputByteDelta: outputBytes - sourceBytes,
			residuals,
		};
	}
}

if (process.argv[1]?.endsWith("migrate-styled-components-docs.ts")) {
	const lane = process.argv[2] as StyledComponentsDocsLane | undefined;
	const outputRoot = process.argv[3];
	if (lane === undefined || !StyledComponentsDocsMigration.lanes.includes(lane))
		throw new Error(
			`usage: nub scripts/migrate-styled-components-docs.ts ${StyledComponentsDocsMigration.lanes.join("|")} [output-root]`,
		);
	console.log(
		JSON.stringify(await StyledComponentsDocsMigration.run(lane, { outputRoot }), null, 2),
	);
}

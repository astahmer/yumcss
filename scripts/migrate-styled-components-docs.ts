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
import { CodemodAdapterId, runAdapterMigration } from "../packages/codemod/src/swap/index.ts";
import type { AdapterMigrationResult } from "../packages/codemod/src/swap/index.ts";

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
	transform(source: string, file: string, root: string): AdapterMigrationResult;
}

function withRuntimeImports(source: string, lane: StyledComponentsDocsLane): string {
	const needsRuntime = /\bcss\.(?:class|vars|group|props|raw|input|sheet)\b/.test(source);
	const needsTemplate = /\bcssTemplate\s*`/.test(source);
	const needsThemeProvider =
		/import\s+\{\s*ThemeProvider\s*\}\s+from\s+["']styled-components["']/.test(source);
	const normalizedSource = needsThemeProvider
		? source.replace(
				/import\s+\{\s*ThemeProvider\s*\}\s+from\s+["']styled-components["'];/g,
				'import { ThemeProvider } from "@/pandwind/theme";',
			)
		: source;
	if (!needsRuntime && !needsTemplate && !needsThemeProvider) return source;
	const runtimeBinding = lane === StyledComponentsDocsLane.DesignCss ? "dcss" : "css";
	const runtimeSource = normalizedSource
		.replaceAll('from "pandwind/runtime"', 'from "@/pandwind/runtime"')
		.replaceAll('from "pandwind/theme"', 'from "@/pandwind/theme"');
	const hasRuntime = new RegExp(
		`import\\s*\\{[^}]*\\b${runtimeBinding}\\b[^}]*\\}\\s*from\\s*["']@/pandwind/runtime["']`,
	).test(runtimeSource);
	const hasTemplate = runtimeSource.includes("const cssTemplate =");
	const imports =
		(hasRuntime ? "" : `import { ${runtimeBinding} } from "@/pandwind/runtime";\n`) +
		(needsTemplate && !hasTemplate
			? 'const cssTemplate = (strings, ...values) => values.some((value) => typeof value === "function") ? (props) => strings.reduce((output, string, index) => { const value = values[index]; const resolved = typeof value === "function" ? (value.__pandwindClassName === undefined ? value(props) : "." + value.__pandwindClassName) : value; return output + string + (resolved ?? ""); }, "") : strings.reduce((output, string, index) => output + string + (values[index] ?? ""), "");\n'
			: "");
	if (imports === "") return runtimeSource;
	const directive = /^(?:["']use client["'];\s*\n?)/.exec(runtimeSource)?.[0];
	return directive === undefined
		? imports + runtimeSource
		: directive + imports + runtimeSource.slice(directive.length);
}

class StyledComponentsLaneAdapter implements LaneAdapter {
	constructor(private readonly lane: StyledComponentsDocsLane) {}

	transform(source: string, file: string, root: string): AdapterMigrationResult {
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
		if (this.lane === StyledComponentsDocsLane.RuntimeCss) return { ...result, code: runtimeCode };
		return {
			...result,
			code: runtimeCode.replace(/\bcss\.(class|vars|group|props|raw|input|sheet)\b/g, "dcss.$1"),
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
import GlobalStyles from "../components/GlobalStyles";

GlobalStyles();
process.stdout.write(runtimeSheet.css());
`;
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
	// The pinned site reads a GitHub endpoint directly during static
	// generation. Treat a rate-limit/error payload as an empty fixture so the
	// migration proof is reproducible and does not depend on external API
	// availability. The reference checkout itself remains untouched.
	const githubApiFile = join(outputRoot, "utils/githubApi.ts");
	const githubApi = await readFile(githubApiFile, "utf8");
	const stableGithubApi = githubApi.replace(
		"fetch(`https://api.github.com/repos/styled-components/${repo}/releases?per_page=999`).then(resp => resp.json());",
		"fetch(`https://api.github.com/repos/styled-components/${repo}/releases?per_page=999`).then(resp => resp.json()).then(payload => (Array.isArray(payload) ? payload : []));",
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
	const collectorFile = join(outputRoot, `${supportRoot}/static-style-collector.ts`);
	await writeFile(collectorFile, staticStyleCollector(files));
	const tsx = resolve(repositoryRoot, "node_modules/.bin/tsx");
	const collectorStubs: Array<[string, string]> = [];
	for (const [file, code] of files) {
		if (!/\.(?:md|mdx|css)['"]/.test(code)) continue;
		const target = join(outputRoot, file);
		const safe = collectorSafeSource(code);
		if (safe === code) continue;
		collectorStubs.push([target, code]);
		await writeFile(target, safe);
	}
	let staticCss = "";
	try {
		staticCss = execFileSync(tsx, [collectorFile], {
			cwd: outputRoot,
			encoding: "utf8",
			maxBuffer: 16 * 1024 * 1024,
		});
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
			`usage: tsx scripts/migrate-styled-components-docs.ts ${StyledComponentsDocsMigration.lanes.join("|")} [output-root]`,
		);
	console.log(
		JSON.stringify(await StyledComponentsDocsMigration.run(lane, { outputRoot }), null, 2),
	);
}

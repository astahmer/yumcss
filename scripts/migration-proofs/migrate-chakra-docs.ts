/**
 * Chakra UI docs -> YumCSS migration corpus.
 *
 * The upstream checkout is a read-only reference. This corpus owns only the
 * lane adapters, materialized worktree support files, and proof metadata. A
 * lane is a route through the shared Chakra source adapter and one YumCSS
 * target API; it is not a bespoke Chakra-to-YumCSS transformation.
 */
import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, readdir, symlink, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { CodemodAdapterId, runAdapterMigrationAsync } from "@yumcss/codemod/swap";
import type { AdapterMigrationResult } from "@yumcss/codemod/swap";
import { relativeModuleImport } from "@yumcss/codemod/migration/shared";
import { createReferenceWorkspace } from "../reference-workspace.ts";

export enum ChakraDocsLane {
	CssClass = "css-class",
	DesignCss = "design-css",
}

export interface ChakraDocsLaneReport {
	readonly lane: ChakraDocsLane;
	readonly referenceCommit: string;
	readonly sourceFiles: number;
	readonly changedFiles: number;
	readonly convertedCallSites: number;
	readonly skippedCallSites: number;
	readonly sourceBytes: number;
	readonly outputBytes: number;
	readonly outputByteDelta: number;
	readonly residuals: readonly {
		file: string;
		kind: string;
		text: string;
		hint?: string;
	}[];
}

export interface ChakraDocsMigrationOptions {
	readonly referenceRoot?: string;
	readonly outputRoot?: string;
}

interface LaneAdapter {
	readonly id: ChakraDocsLane;
	transform(
		source: string,
		file: string,
		root: string,
		files: readonly string[],
	): Promise<AdapterMigrationResult>;
}

const repositoryRoot = resolve(import.meta.dirname, "../..");
const defaultReferenceRoot = createReferenceWorkspace().path("chakra-ui");
const yumcssSupportRoot = "apps/www/yumcss";

async function collectSourceFiles(root: string): Promise<string[]> {
	const files: string[] = [];
	const visit = async (directory: string): Promise<void> => {
		for (const entry of await readdir(directory, { withFileTypes: true })) {
			const absolute = join(directory, entry.name);
			if (entry.isDirectory()) {
				if (!entry.name.startsWith(".") && entry.name !== "node_modules") await visit(absolute);
				continue;
			}
			if (/\.(?:ts|tsx|mdx)$/.test(entry.name)) files.push(absolute);
		}
	};
	await visit(join(root, "apps/www"));
	return files.toSorted();
}

function runtimeImports(file: string, lane: ChakraDocsLane): string {
	const preset = relativeModuleImport(file, yumcssSupportRoot, "preset");
	if (lane === ChakraDocsLane.DesignCss) {
		return [
			'import { createRuntimeDesignCss } from "yumcss/css/runtime";',
			`import { preset } from "${preset}";`,
			"const dss = createRuntimeDesignCss(preset);",
		].join("\n");
	}
	return [
		'import { createRuntimeCss } from "yumcss/css/runtime";',
		`import { preset } from "${preset}";`,
		"const css = createRuntimeCss(preset);",
	].join("\n");
}

function bindRuntimeApi(code: string, file: string, lane: ChakraDocsLane): string {
	const imports = runtimeImports(file, lane);
	let generated = code.replace(
		'import { createUnsafeCss } from "yumcss/unsafe/css";\nconst css = createUnsafeCss();',
		imports,
	);
	if (generated.includes('import { createUnsafeCss } from "yumcss/unsafe/css";')) {
		generated = generated.replace(
			'import { createUnsafeCss } from "yumcss/unsafe/css";',
			imports,
		);
		generated = generated.replace("const css = createUnsafeCss();", "");
	}
	generated = generated.replace(
		'import { defaultPreset } from "yumcss/preset/default";',
		`import { preset } from "${relativeModuleImport(file, yumcssSupportRoot, "preset")}";`,
	);
	if (lane === ChakraDocsLane.DesignCss) {
		generated = generated
			.replaceAll(
				'import { createRuntimeCss } from "yumcss/css/runtime";',
				'import { createRuntimeDesignCss } from "yumcss/css/runtime";',
			)
			.replaceAll("createRuntimeCss(preset)", "createRuntimeDesignCss(preset)")
			.replaceAll(
				"const css = createRuntimeDesignCss(preset)",
				"const dss = createRuntimeDesignCss(preset)",
			)
			.replace(/\bcss\.(?:class|vars|props|group)\s*\(/g, (call) => `dss${call.slice(3)}`);
	}
	if (!file.endsWith(".mdx")) return generated;
	const frontmatterStart = generated.indexOf("---\n");
	if (frontmatterStart === -1) return generated;
	const frontmatterEnd = generated.indexOf("\n---\n", frontmatterStart + 4);
	if (frontmatterEnd === -1) return generated;
	const frontmatter = generated.slice(frontmatterStart, frontmatterEnd + 5);
	const body = generated.slice(frontmatterEnd + 5).replace(/^\n+/, "");
	return `${frontmatter}\n${body}`;
}

function bindMdxRuntime(source: string, lane: ChakraDocsLane): string {
	const binding = lane === ChakraDocsLane.DesignCss ? "dss" : "css";
	const ownBinding = new RegExp(`(?:const|let|var)\\s+${binding}\\s*=`).test(source);
	const withImport = ownBinding
		? source
		: source.replace(
				'import * as runtime from "react/jsx-runtime"',
				`import * as runtime from "react/jsx-runtime"\nimport { ${binding} } from "${relativeModuleImport(
					"apps/www/components/mdx-content.tsx",
					yumcssSupportRoot,
					binding,
				)}";`,
			);
	return withImport
		.replace(
			"const fn = new Function(code)",
			`const fn = new Function("const ${binding} = arguments[0].${binding};\\n" + code)`,
		)
		.replace("return fn({ ...runtime }).default", `return fn({ ...runtime, ${binding} }).default`);
}

function createLane(id: ChakraDocsLane): LaneAdapter {
	return {
		id,
		async transform(source, file, root, files) {
			const result = await runAdapterMigrationAsync(source, {
				from: CodemodAdapterId.ChakraUi,
				to: CodemodAdapterId.YumCSS,
				file,
				root,
				readFile: (candidate) => {
					try {
						return readFileSync(candidate, "utf8");
					} catch {
						return undefined;
					}
				},
				listFiles: () => files,
				mode: "safe",
			});
			return { ...result, code: bindRuntimeApi(result.code, file, id) };
		},
	};
}

function runtimePreset(): string {
	return `/** Generated by the YumCSS migration proof runner. */
export const preset = {
  strict: false,
  properties: {},
  tokens: {},
  conditions: {
    base: "",
    sm: "@media (min-width: 480px)",
    md: "@media (min-width: 768px)",
    lg: "@media (min-width: 992px)",
    xl: "@media (min-width: 1280px)",
    _light: ":root &",
    _dark: ".dark &",
  },
} as const;
`;
}

function runtimeSheet(lane: ChakraDocsLane): string {
	const factory = lane === ChakraDocsLane.DesignCss ? "createRuntimeDesignCss" : "createRuntimeCss";
	return `"use client";

import { useRef } from "react";
import { useServerInsertedHTML } from "next/navigation";
import { ${factory} } from "yumcss/css/runtime";
import { preset } from "./preset";

const runtime = ${factory}(preset);

export function YumCSSStyleSheet() {
  const emitted = useRef<string | undefined>(undefined);
  useServerInsertedHTML(() => {
    const value = runtime.sheet.css();
    if (value === emitted.current || value === "") return null;
    emitted.current = value;
    return <style data-yumcss-runtime dangerouslySetInnerHTML={{ __html: value }} />;
  });
  return null;
}
`;
}

function runtimeBinding(binding: "css" | "dss"): string {
	const factory = binding === "dss" ? "createRuntimeDesignCss" : "createRuntimeCss";
	return `import { ${factory} } from "yumcss/css/runtime";
import { preset } from "./preset";

export const ${binding} = ${factory}(preset);
`;
}

async function materialize(
	referenceRoot: string,
	outputRoot: string,
	lane: ChakraDocsLane,
	files: ReadonlyMap<string, string>,
): Promise<void> {
	await mkdir(outputRoot, { recursive: true });
	for (const entry of await readdir(referenceRoot, { withFileTypes: true })) {
		if (entry.name === ".git" || entry.name === "node_modules" || entry.name === ".next") continue;
		await cp(join(referenceRoot, entry.name), join(outputRoot, entry.name), {
			recursive: true,
			force: true,
			filter: (source) =>
				!source.split("/").includes("node_modules") && !source.split("/").includes(".next"),
		});
	}
	await symlink(join(referenceRoot, "node_modules"), join(outputRoot, "node_modules"), "dir").catch(
		() => undefined,
	);
	await mkdir(join(outputRoot, "apps/www/node_modules"), { recursive: true });
	for (const entry of await readdir(join(referenceRoot, "apps/www/node_modules"), {
		withFileTypes: true,
	})) {
		if (entry.name === "yumcss") continue;
		await symlink(
			join(referenceRoot, "apps/www/node_modules", entry.name),
			join(outputRoot, "apps/www/node_modules", entry.name),
			entry.isDirectory() ? "dir" : "file",
		).catch(() => undefined);
	}
	await symlink(
		join(repositoryRoot, "packages/yumcss"),
		join(outputRoot, "apps/www/node_modules/yumcss"),
		"dir",
	).catch(() => undefined);
	const packageFile = join(outputRoot, "apps/www/package.json");
	const packageJson = JSON.parse(await readFile(packageFile, "utf8")) as {
		dependencies?: Record<string, string>;
	};
	packageJson.dependencies = {
		...packageJson.dependencies,
		yumcss: `file:${join(repositoryRoot, "packages/yumcss")}`,
	};
	await writeFile(packageFile, `${JSON.stringify(packageJson, null, 2)}\n`);
	const nextConfig = join(outputRoot, "apps/www/next.config.mjs");
	const nextSource = await readFile(nextConfig, "utf8");
	if (!nextSource.includes("transpilePackages")) {
		await writeFile(
			nextConfig,
			nextSource.replace(
				"const nextConfig = {",
				'const nextConfig = {\n  transpilePackages: ["yumcss"],',
			),
		);
	}
	const outputFiles = new Map(files);
	const mdxContentFile = "apps/www/components/mdx-content.tsx";
	const mdxContent =
		outputFiles.get(mdxContentFile) ??
		(await readFile(join(referenceRoot, mdxContentFile), "utf8"));
	outputFiles.set(mdxContentFile, bindMdxRuntime(mdxContent, lane));
	for (const [file, code] of outputFiles) {
		const target = join(outputRoot, file);
		await mkdir(dirname(target), { recursive: true });
		await writeFile(target, code);
	}
	const support = new Map([
		[`${yumcssSupportRoot}/preset.ts`, runtimePreset()],
		[`${yumcssSupportRoot}/style-sheet.tsx`, runtimeSheet(lane)],
		[`${yumcssSupportRoot}/css.ts`, runtimeBinding("css")],
		[`${yumcssSupportRoot}/dss.ts`, runtimeBinding("dss")],
	]);
	for (const [file, code] of support) {
		const target = join(outputRoot, file);
		await mkdir(dirname(target), { recursive: true });
		await writeFile(target, code);
	}
	const providerFile = join(outputRoot, "apps/www/app/provider.tsx");
	const provider = await readFile(providerFile, "utf8");
	if (!provider.includes("<YumCSSStyleSheet")) {
		const placements = [
			[
				"        {props.children}\n        <Toaster />",
				"        {props.children}\n        <Toaster />\n        <YumCSSStyleSheet />",
			],
			[
				"        {props.children}\n      </ColorModeProvider>",
				"        {props.children}\n        <YumCSSStyleSheet />\n      </ColorModeProvider>",
			],
			[
				"        {children}\n      </Provider>",
				"        {children}\n        <YumCSSStyleSheet />\n      </Provider>",
			],
		] as const;
		const placement = placements.find(([needle]) => provider.includes(needle));
		if (placement === undefined) {
			throw new Error("Could not place YumCSSStyleSheet in the Chakra root provider");
		}
		await writeFile(
			providerFile,
			(() => {
				const updated = provider.replace(placement[0], placement[1]);
				if (provider.includes("import { YumCSSStyleSheet }")) return updated;
				const importLine = 'import { YumCSSStyleSheet } from "../yumcss/style-sheet";\n';
				return updated.startsWith('"use client"')
					? updated.replace('"use client"\n', `"use client"\n${importLine}`)
					: `${importLine}${updated}`;
			})(),
		);
	}
	void lane;
}

export class ChakraDocsMigration {
	static readonly lanes: readonly ChakraDocsLane[] = [
		ChakraDocsLane.CssClass,
		ChakraDocsLane.DesignCss,
	];

	static async run(
		lane: ChakraDocsLane,
		options: ChakraDocsMigrationOptions = {},
	): Promise<ChakraDocsLaneReport> {
		const referenceRoot = resolve(options.referenceRoot ?? defaultReferenceRoot);
		const referenceCommit = execFileSync("git", ["-C", referenceRoot, "rev-parse", "HEAD"], {
			encoding: "utf8",
		}).trim();
		const adapter = createLane(lane);
		const transformed = new Map<string, string>();
		const residuals: ChakraDocsLaneReport["residuals"][number][] = [];
		let visitedSourceFiles = 0;
		let changedFiles = 0;
		let convertedCallSites = 0;
		let skippedCallSites = 0;
		let sourceBytes = 0;
		let outputBytes = 0;
		const sourcePaths = await collectSourceFiles(referenceRoot);
		for (const absolute of sourcePaths) {
			const source = await readFile(absolute, "utf8");
			const file = relative(referenceRoot, absolute).replaceAll("\\", "/");
			// Each file is transformed in source order for deterministic reports.
			const result = await adapter.transform(source, file, referenceRoot, sourcePaths);
			if (!result.changed && result.residuals.length === 0) continue;
			visitedSourceFiles++;
			if (result.changed) changedFiles++;
			convertedCallSites += result.converted;
			skippedCallSites += result.skipped;
			sourceBytes += Buffer.byteLength(source);
			outputBytes += Buffer.byteLength(result.code);
			transformed.set(file, result.code);
			for (const residual of result.residuals) {
				const entry = { file, kind: residual.kind, text: residual.text } as {
					file: string;
					kind: string;
					text: string;
					hint?: string;
				};
				if (residual.hint !== undefined) entry.hint = residual.hint;
				residuals.push(entry);
			}
		}
		if (options.outputRoot !== undefined)
			await materialize(referenceRoot, resolve(options.outputRoot), lane, transformed);
		return {
			lane,
			referenceCommit,
			sourceFiles: visitedSourceFiles,
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

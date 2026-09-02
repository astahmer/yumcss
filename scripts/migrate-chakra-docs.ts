/**
 * Chakra UI docs -> Pandwind migration corpus.
 *
 * The upstream checkout is a read-only reference. This corpus owns only the
 * lane adapters, materialized worktree support files, and proof metadata. A
 * lane is a route through the shared Chakra source adapter and one Pandwind
 * target API; it is not a bespoke Chakra-to-Pandwind transformation.
 */
import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, readdir, symlink, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { CodemodAdapterId, runAdapterMigrationAsync } from "../packages/codemod/src/swap/index.ts";
import type { AdapterMigrationResult } from "../packages/codemod/src/swap/index.ts";
import { relativeModuleImport } from "../packages/codemod/src/shared.ts";
import { createReferenceWorkspace } from "./reference-workspace.ts";

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
	transform(source: string, file: string, root: string): Promise<AdapterMigrationResult>;
}

const repositoryRoot = resolve(import.meta.dirname, "..");
const defaultReferenceRoot = createReferenceWorkspace().path("chakra-ui");
const pandwindSupportRoot = "apps/www/pandwind";

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
	const preset = relativeModuleImport(file, pandwindSupportRoot, "preset");
	if (lane === ChakraDocsLane.DesignCss) {
		return [
			'import { createRuntimeDesignCss } from "pandwind/css/runtime";',
			`import { pandwindPreset } from "${preset}";`,
			"const dcss = createRuntimeDesignCss(pandwindPreset);",
		].join("\n");
	}
	return [
		'import { createRuntimeCss } from "pandwind/css/runtime";',
		`import { pandwindPreset } from "${preset}";`,
		"const css = createRuntimeCss(pandwindPreset);",
	].join("\n");
}

function bindRuntimeApi(code: string, file: string, lane: ChakraDocsLane): string {
	const imports = runtimeImports(file, lane);
	let generated = code.replace(
		'import { createCss } from "pandwind/css";\nconst css = createCss();',
		imports,
	);
	if (generated.includes('import { createCss } from "pandwind/css";')) {
		generated = generated.replace('import { createCss } from "pandwind/css";', imports);
		generated = generated.replace("const css = createCss();", "");
	}
	generated = generated.replace(
		'import { pandwindPreset } from "pandwind/preset";',
		`import { pandwindPreset } from "${relativeModuleImport(file, pandwindSupportRoot, "preset")}";`,
	);
	if (lane === ChakraDocsLane.DesignCss) {
		generated = generated
			.replaceAll(
				'import { createRuntimeCss } from "pandwind/css/runtime";',
				'import { createRuntimeDesignCss } from "pandwind/css/runtime";',
			)
			.replaceAll("createRuntimeCss(pandwindPreset)", "createRuntimeDesignCss(pandwindPreset)")
			.replaceAll(
				"const css = createRuntimeDesignCss(pandwindPreset)",
				"const dcss = createRuntimeDesignCss(pandwindPreset)",
			)
			.replace(/\bcss\.(?:class|vars|props|group)\s*\(/g, (call) => `dcss${call.slice(3)}`);
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
	const binding = lane === ChakraDocsLane.DesignCss ? "dcss" : "css";
	const ownBinding = new RegExp(`(?:const|let|var)\\s+${binding}\\s*=`).test(source);
	const withImport = ownBinding
		? source
		: source.replace(
				'import * as runtime from "react/jsx-runtime"',
				`import * as runtime from "react/jsx-runtime"\nimport { ${binding} } from "${relativeModuleImport(
					"apps/www/components/mdx-content.tsx",
					pandwindSupportRoot,
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
		async transform(source, file, root) {
			const result = await runAdapterMigrationAsync(source, {
				from: CodemodAdapterId.ChakraUi,
				to: CodemodAdapterId.Pandwind,
				file,
				root,
				mode: "safe",
			});
			return { ...result, code: bindRuntimeApi(result.code, file, id) };
		},
	};
}

function runtimePreset(): string {
	return `/** Generated by scripts/migrate-chakra-docs.ts. */
export const pandwindPreset = {
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
import { ${factory} } from "pandwind/css/runtime";
import { pandwindPreset } from "./preset";

const runtime = ${factory}(pandwindPreset);

export function PandwindStyleSheet() {
  const emitted = useRef<string | undefined>(undefined);
  useServerInsertedHTML(() => {
    const value = runtime.sheet.css();
    if (value === emitted.current || value === "") return null;
    emitted.current = value;
    return <style data-pandwind-runtime dangerouslySetInnerHTML={{ __html: value }} />;
  });
  return null;
}
`;
}

function runtimeBinding(binding: "css" | "dcss"): string {
	const factory = binding === "dcss" ? "createRuntimeDesignCss" : "createRuntimeCss";
	return `import { ${factory} } from "pandwind/css/runtime";
import { pandwindPreset } from "./preset";

export const ${binding} = ${factory}(pandwindPreset);
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
		if (entry.name === "pandwind") continue;
		await symlink(
			join(referenceRoot, "apps/www/node_modules", entry.name),
			join(outputRoot, "apps/www/node_modules", entry.name),
			entry.isDirectory() ? "dir" : "file",
		).catch(() => undefined);
	}
	await symlink(
		join(repositoryRoot, "packages/pandwind"),
		join(outputRoot, "apps/www/node_modules/pandwind"),
		"dir",
	).catch(() => undefined);
	const packageFile = join(outputRoot, "apps/www/package.json");
	const packageJson = JSON.parse(await readFile(packageFile, "utf8")) as {
		dependencies?: Record<string, string>;
	};
	packageJson.dependencies = {
		...packageJson.dependencies,
		pandwind: `file:${join(repositoryRoot, "packages/pandwind")}`,
	};
	await writeFile(packageFile, `${JSON.stringify(packageJson, null, 2)}\n`);
	const nextConfig = join(outputRoot, "apps/www/next.config.mjs");
	const nextSource = await readFile(nextConfig, "utf8");
	if (!nextSource.includes("transpilePackages")) {
		await writeFile(
			nextConfig,
			nextSource.replace(
				"const nextConfig = {",
				'const nextConfig = {\n  transpilePackages: ["pandwind"],',
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
		[`${pandwindSupportRoot}/preset.ts`, runtimePreset()],
		[`${pandwindSupportRoot}/style-sheet.tsx`, runtimeSheet(lane)],
		[`${pandwindSupportRoot}/css.ts`, runtimeBinding("css")],
		[`${pandwindSupportRoot}/dcss.ts`, runtimeBinding("dcss")],
	]);
	for (const [file, code] of support) {
		const target = join(outputRoot, file);
		await mkdir(dirname(target), { recursive: true });
		await writeFile(target, code);
	}
	const providerFile = join(outputRoot, "apps/www/app/provider.tsx");
	const provider = await readFile(providerFile, "utf8");
	if (!provider.includes("<PandwindStyleSheet")) {
		const placements = [
			[
				"        {props.children}\n        <Toaster />",
				"        {props.children}\n        <Toaster />\n        <PandwindStyleSheet />",
			],
			[
				"        {props.children}\n      </ColorModeProvider>",
				"        {props.children}\n        <PandwindStyleSheet />\n      </ColorModeProvider>",
			],
			[
				"        {children}\n      </Provider>",
				"        {children}\n        <PandwindStyleSheet />\n      </Provider>",
			],
		] as const;
		const placement = placements.find(([needle]) => provider.includes(needle));
		if (placement === undefined) {
			throw new Error("Could not place PandwindStyleSheet in the Chakra root provider");
		}
		await writeFile(
			providerFile,
			(() => {
				const updated = provider.replace(placement[0], placement[1]);
				if (provider.includes("import { PandwindStyleSheet }")) return updated;
				const importLine = 'import { PandwindStyleSheet } from "../pandwind/style-sheet";\n';
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
		for (const absolute of await collectSourceFiles(referenceRoot)) {
			const source = await readFile(absolute, "utf8");
			const file = relative(referenceRoot, absolute).replaceAll("\\", "/");
			// Each file is transformed in source order for deterministic reports.
			const result = await adapter.transform(source, file, referenceRoot);
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

if (process.argv[1]?.endsWith("migrate-chakra-docs.ts")) {
	const args = process.argv.slice(2);
	const lane = args[0] as ChakraDocsLane | undefined;
	const outputRoot = args[1] === "--dry-run" ? undefined : args[1];
	if (args[1] === "--dry-run")
		console.warn(
			"--dry-run is implicit when no output root is provided; no files will be written.",
		);
	if (lane === undefined || !ChakraDocsMigration.lanes.includes(lane))
		throw new Error(
			`usage: nub scripts/migrate-chakra-docs.ts ${ChakraDocsMigration.lanes.join("|")} [output-root]`,
		);
	console.log(JSON.stringify(await ChakraDocsMigration.run(lane, { outputRoot }), null, 2));
}

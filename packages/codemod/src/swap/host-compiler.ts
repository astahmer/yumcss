import { foldStackElements } from "pandwind/vite/stack-fold";
import {
	HOST_FRAMEWORK_ADAPTERS,
	type HostFramework,
	type HostFrameworkAdapter,
} from "./host-adapters.ts";

/** Versioned boundary for framework-native compiler integrations. */
export const HOST_COMPILER_SCHEMA = "pandwind.host-compiler/1" as const;

export interface HostCompilerDiagnostic {
	readonly severity: "warning" | "error";
	readonly message: string;
	readonly start?: number;
	readonly end?: number;
}

export interface HostCompilerResult {
	readonly code: string;
	readonly changed: boolean;
	readonly diagnostics: readonly HostCompilerDiagnostic[];
	readonly framework: HostFramework;
}

export interface HostCompilerContext {
	readonly file: string;
	readonly framework: HostFramework;
	readonly adapter: HostFrameworkAdapter;
}

export interface HostCompilerPlugin {
	readonly schema: typeof HOST_COMPILER_SCHEMA;
	readonly name: string;
	readonly framework: HostFramework;
	readonly extensions: readonly string[];
	detect(file: string, source: string): boolean;
	transform(source: string, context: HostCompilerContext): HostCompilerResult;
}

const extensions: Record<HostFramework, readonly string[]> = {
	react: [".jsx", ".tsx"],
	preact: [".jsx", ".tsx"],
	solid: [".jsx", ".tsx"],
	vue: [".vue"],
	svelte: [".svelte"],
	astro: [".astro"],
};

const importPattern: Record<HostFramework, RegExp> = {
	react: /from\s+["']react(?:\/jsx-runtime)?["']/,
	preact: /from\s+["']preact(?:\/jsx-runtime)?["']/,
	solid: /from\s+["']solid-js["']/,
	vue: /from\s+["']vue["']/,
	svelte: /from\s+["']svelte["']/,
	astro: /from\s+["']astro["']/,
};

/**
 * Create the adapter consumed by a framework's native compiler hook.
 * React-family compilation reuses the proven JSX stack fold; other hosts
 * return an explicit delegation warning until their native AST is available.
 */
export function createHostCompilerPlugin(framework: HostFramework): HostCompilerPlugin {
	const adapter = HOST_FRAMEWORK_ADAPTERS[framework];
	return {
		schema: HOST_COMPILER_SCHEMA,
		name: `pandwind-host-${framework}`,
		framework,
		extensions: extensions[framework],
		detect(file, source) {
			return (
				extensions[framework].some((extension) => file.endsWith(extension)) ||
				importPattern[framework].test(source)
			);
		},
		transform(source, context) {
			if (framework === "react" || framework === "preact") {
				const folded = foldStackElements(source, context.file);
				return { code: folded.code, changed: folded.code !== source, diagnostics: [], framework };
			}
			return {
				code: source,
				changed: false,
				diagnostics: source.includes("pandwind/stack")
					? [
							{
								severity: "warning",
								message: `${framework} host compiler requires native AST delegation for stack folding`,
							},
						]
					: [],
				framework,
			};
		},
	};
}

export const HOST_COMPILER_PLUGINS: Readonly<Record<HostFramework, HostCompilerPlugin>> = {
	react: createHostCompilerPlugin("react"),
	preact: createHostCompilerPlugin("preact"),
	solid: createHostCompilerPlugin("solid"),
	vue: createHostCompilerPlugin("vue"),
	svelte: createHostCompilerPlugin("svelte"),
	astro: createHostCompilerPlugin("astro"),
};

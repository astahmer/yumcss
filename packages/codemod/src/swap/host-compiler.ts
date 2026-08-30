import { foldStackElements } from "pandwind/vite/stack-fold";
import { stackClasses, type StackProps } from "pandwind/stack";
import {
	HOST_FRAMEWORK_REGISTRY,
	BuiltinHostFramework,
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

function foldNativeStackMarkup(
	source: string,
	framework: HostFramework,
): { code: string; folded: number } {
	let folded = 0;
	const code = source.replace(/<Stack\b([^>]*?)(\/?)>/g, (whole, attrs: string, slash: string) => {
		const props: StackProps = {};
		let rest = attrs;
		for (const match of attrs.matchAll(
			/\b(direction|gap|padding|align|justify)\s*=\s*(?:\{\s*(["'])([^"']+)\2\s*\}|\{\s*([\w.-]+)\s*\}|(["'])([^"']+)\5)/g,
		)) {
			const name = match[1]!;
			const value = match[3] ?? match[4] ?? match[6];
			if (value === undefined) return whole;
			(props as Record<string, string>)[name] = value;
			rest = rest.replace(match[0], "");
		}
		if (
			attrs.includes("{...") ||
			(/\b(?:direction|gap|padding|align|justify)\s*=\s*\{/.test(attrs) &&
				Object.keys(props).length === 0)
		)
			return whole;
		const className = stackClasses(props);
		const classAttribute =
			framework === BuiltinHostFramework.React || framework === BuiltinHostFramework.Preact
				? "className"
				: "class";
		const existing = /\bclass(?:Name)?\s*=\s*(["'])([^"']*)\1/.exec(rest)?.[2];
		rest = rest.replace(/\bclass(?:Name)?\s*=\s*(["'])[^"']*\1/, "").trim();
		const classValue = existing === undefined ? className : `${existing} ${className}`;
		folded++;
		return `<div ${classAttribute}="${classValue}"${rest === "" ? "" : ` ${rest}`} ${slash === "/" ? "/" : ""}>`.replace(
			" >",
			">",
		);
	});
	if (folded === 0) return { code: source, folded };
	return { code: code.replace(/<\/Stack>/g, "</div>"), folded };
}

/**
 * Create the adapter consumed by a framework's native compiler hook.
 * React-family compilation reuses the proven JSX stack fold; other hosts
 * return an explicit delegation warning until their native AST is available.
 */
export function createHostCompilerPlugin(framework: HostFramework): HostCompilerPlugin {
	const host = HOST_FRAMEWORK_REGISTRY.get(framework);
	if (host === undefined) throw new Error(`unknown host framework: ${framework}`);
	return {
		schema: HOST_COMPILER_SCHEMA,
		name: `pandwind-host-${framework}`,
		framework,
		extensions: host.extensions,
		detect(file, source) {
			return host.detect(file, source);
		},
		transform(source, context) {
			if (framework === BuiltinHostFramework.React || framework === BuiltinHostFramework.Preact) {
				const folded = foldStackElements(source, context.file);
				return { code: folded.code, changed: folded.code !== source, diagnostics: [], framework };
			}
			const folded = foldNativeStackMarkup(source, framework);
			if (folded.folded > 0)
				return { code: folded.code, changed: folded.code !== source, diagnostics: [], framework };
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

export const HOST_COMPILER_PLUGINS: Readonly<Record<string, HostCompilerPlugin>> =
	Object.fromEntries(
		HOST_FRAMEWORK_REGISTRY.adapters.map((adapter) => [
			adapter.id,
			createHostCompilerPlugin(adapter.id),
		]),
	) as Record<string, HostCompilerPlugin>;

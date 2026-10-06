import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { isAbsolute, relative, resolve, sep } from "node:path";
import {
	hashGeneratedContent,
	YUMCSS_GENERATED_MANIFEST_SCHEMA,
	type GeneratedArtifactOwnershipTag as GeneratedArtifactOwnership,
	type YumCSSGeneratedManifest,
} from "./artifact-manifest.ts";

export const YUMCSS_GENERATED_BUDGET_SCHEMA = "yumcss.generated-budget/1" as const;

export interface GeneratedArtifactBudget {
	readonly ownership?: GeneratedArtifactOwnership;
	readonly maxRawBytes: number;
	readonly maxGzipBytes: number;
}

export interface GeneratedArtifactBudgetFile {
	readonly schema: typeof YUMCSS_GENERATED_BUDGET_SCHEMA;
	readonly artifacts: Readonly<Record<string, GeneratedArtifactBudget>>;
}

export interface GeneratedArtifactCheck {
	readonly path: string;
	readonly kind: "input" | "artifact";
	readonly exists: boolean;
	readonly hashMatches: boolean;
	readonly rawBytes?: number;
	readonly gzipBytes?: number;
	readonly budget?: GeneratedArtifactBudget;
	readonly status: "pass" | "fail";
}

export interface GeneratedArtifactCheckReport {
	readonly schema: typeof YUMCSS_GENERATED_BUDGET_SCHEMA;
	readonly manifest: string;
	readonly inputs: readonly GeneratedArtifactCheck[];
	readonly artifacts: readonly GeneratedArtifactCheck[];
	readonly failures: readonly string[];
	readonly valid: boolean;
}

const withinRoot = (root: string, path: string): string | undefined => {
	const projectRoot = resolve(root);
	const absolute = resolve(projectRoot, path);
	const relativePath = relative(projectRoot, absolute);
	return relativePath === "" || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)
		? undefined
		: absolute;
};

const sizeOf = (content: string): { readonly rawBytes: number; readonly gzipBytes: number } => {
	const bytes = Buffer.from(content);
	return { rawBytes: bytes.byteLength, gzipBytes: gzipSync(bytes).byteLength };
};

function checkEntry(
	root: string,
	entry: { readonly path: string; readonly hash: string },
	kind: GeneratedArtifactCheck["kind"],
	budget: GeneratedArtifactBudget | undefined,
	failures: string[],
): GeneratedArtifactCheck {
	const path = withinRoot(root, entry.path);
	if (path === undefined) {
		failures.push(`${kind} path escapes project root: ${entry.path}`);
		return { path: entry.path, kind, exists: false, hashMatches: false, status: "fail" };
	}
	let content: string;
	try {
		content = readFileSync(path, "utf8");
	} catch {
		failures.push(`${kind} is missing: ${entry.path}`);
		return { path: entry.path, kind, exists: false, hashMatches: false, status: "fail" };
	}
	const hashMatches = hashGeneratedContent(content) === entry.hash;
	if (!hashMatches) failures.push(`${kind} is stale: ${entry.path}`);
	const size = kind === "artifact" ? sizeOf(content) : undefined;
	if (size !== undefined && budget !== undefined) {
		if (size.rawBytes > budget.maxRawBytes)
			failures.push(`${entry.path} is ${size.rawBytes} raw bytes, over ${budget.maxRawBytes}`);
		if (size.gzipBytes > budget.maxGzipBytes)
			failures.push(`${entry.path} is ${size.gzipBytes} gzip bytes, over ${budget.maxGzipBytes}`);
	}
	return {
		path: entry.path,
		kind,
		exists: true,
		hashMatches,
		...(size === undefined ? {} : size),
		...(budget === undefined ? {} : { budget }),
		status:
			hashMatches &&
			(size === undefined ||
				budget === undefined ||
				(size.rawBytes <= budget.maxRawBytes && size.gzipBytes <= budget.maxGzipBytes))
				? "pass"
				: "fail",
	};
}

/**
 * Verify a generated YumCSS artifact manifest in a consumer project.
 *
 * The manifest records source and generated-file hashes. An optional budget
 * file adds raw and gzip limits without making consumers copy repository-only
 * CI scripts.
 */
export function checkGeneratedArtifactManifest(
	root: string,
	manifestPath = "src/yumcss.generated.json",
	budgetFile?: GeneratedArtifactBudgetFile,
): GeneratedArtifactCheckReport {
	const projectRoot = resolve(root);
	const manifestAbsolute = withinRoot(projectRoot, manifestPath);
	const failures: string[] = [];
	if (manifestAbsolute === undefined) {
		return {
			schema: YUMCSS_GENERATED_BUDGET_SCHEMA,
			manifest: manifestPath,
			inputs: [],
			artifacts: [],
			failures: [`manifest path escapes project root: ${manifestPath}`],
			valid: false,
		};
	}
	let manifest: YumCSSGeneratedManifest;
	try {
		manifest = JSON.parse(readFileSync(manifestAbsolute, "utf8")) as YumCSSGeneratedManifest;
	} catch {
		return {
			schema: YUMCSS_GENERATED_BUDGET_SCHEMA,
			manifest: manifestPath,
			inputs: [],
			artifacts: [],
			failures: [`manifest is missing or invalid: ${manifestPath}`],
			valid: false,
		};
	}
	if (manifest.schema !== YUMCSS_GENERATED_MANIFEST_SCHEMA)
		failures.push(`unsupported generated manifest schema: ${String(manifest.schema)}`);
	const inputs = manifest.inputs.map((entry) =>
		checkEntry(projectRoot, entry, "input", undefined, failures),
	);
	const artifacts = manifest.artifacts.map((entry) => {
		const budget = budgetFile?.artifacts[entry.path];
		if (budgetFile !== undefined && budget === undefined)
			failures.push(`no budget is declared for ${entry.path}`);
		if (budget?.ownership !== undefined && budget.ownership !== entry.ownership)
			failures.push(`${entry.path} ownership is ${entry.ownership}, expected ${budget.ownership}`);
		return checkEntry(projectRoot, entry, "artifact", budget, failures);
	});
	if (budgetFile !== undefined)
		for (const path of Object.keys(budgetFile.artifacts))
			if (!manifest.artifacts.some((entry) => entry.path === path))
				failures.push(`budget names missing artifact ${path}`);
	return {
		schema: YUMCSS_GENERATED_BUDGET_SCHEMA,
		manifest: manifestPath,
		inputs,
		artifacts,
		failures,
		valid: failures.length === 0,
	};
}

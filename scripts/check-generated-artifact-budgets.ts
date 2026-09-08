import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join, resolve } from "node:path";
import {
	hashGeneratedContent,
	type GeneratedArtifactOwnershipTag,
	type PandwindGeneratedManifest,
} from "pandwind-codemod/tw";

const repositoryRoot = resolve(import.meta.dirname, "..");
const budgetPath = resolve(repositoryRoot, "plans/evidence/generated-artifact-budgets.json");

interface ArtifactBudget {
	readonly ownership: GeneratedArtifactOwnershipTag;
	readonly maxRawBytes: number;
	readonly maxGzipBytes: number;
}

interface AppBudget {
	readonly id: string;
	readonly root: string;
	readonly manifest: string;
	readonly artifacts: Readonly<Record<string, ArtifactBudget>>;
}

interface BudgetFile {
	readonly schema: "pandwind.generated-budget/1";
	readonly baseline: string;
	readonly apps: readonly AppBudget[];
}

interface ArtifactReport {
	readonly path: string;
	readonly ownership: string;
	readonly rawBytes: number;
	readonly gzipBytes: number;
	readonly maxRawBytes: number;
	readonly maxGzipBytes: number;
	readonly hashMatches: boolean;
	readonly status: "pass" | "fail";
}

interface AppReport {
	readonly id: string;
	readonly manifest: string;
	readonly inputs: readonly { readonly path: string; readonly hashMatches: boolean }[];
	readonly artifacts: readonly ArtifactReport[];
	readonly failures: readonly string[];
}

interface BudgetReport {
	readonly schema: "pandwind.generated-budget/1";
	readonly baseline: string;
	readonly apps: readonly AppReport[];
	readonly failures: readonly string[];
}

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;

const measure = (content: string): { readonly rawBytes: number; readonly gzipBytes: number } => {
	const bytes = Buffer.from(content);
	return { rawBytes: bytes.byteLength, gzipBytes: gzipSync(bytes).byteLength };
};

const checkApp = (app: AppBudget): AppReport => {
	const appRoot = resolve(repositoryRoot, app.root);
	const manifestPath = join(appRoot, app.manifest);
	const manifest = readJson<PandwindGeneratedManifest>(manifestPath);
	const failures: string[] = [];
	if (manifest.schema !== "pandwind.generated/1")
		failures.push(`${app.id}: unsupported generated manifest schema ${manifest.schema}`);

	const inputs = manifest.inputs.map((input) => {
		const path = join(appRoot, input.path);
		const hashMatches = hashGeneratedContent(readFileSync(path, "utf8")) === input.hash;
		if (!hashMatches) failures.push(`${app.id}: stale input ${input.path}`);
		return { path: input.path, hashMatches };
	});

	const seen = new Set<string>();
	const artifacts = manifest.artifacts.map((entry) => {
		seen.add(entry.path);
		const budget = app.artifacts[entry.path];
		if (budget === undefined) {
			failures.push(`${app.id}: no budget is declared for ${entry.path}`);
			return {
				path: entry.path,
				ownership: entry.ownership,
				rawBytes: 0,
				gzipBytes: 0,
				maxRawBytes: 0,
				maxGzipBytes: 0,
				hashMatches: false,
				status: "fail" as const,
			};
		}
		if (entry.ownership !== budget.ownership)
			failures.push(
				`${app.id}: ${entry.path} ownership is ${entry.ownership}, expected ${budget.ownership}`,
			);
		const path = join(appRoot, entry.path);
		const content = readFileSync(path, "utf8");
		const size = measure(content);
		const hashMatches = hashGeneratedContent(content) === entry.hash;
		if (!hashMatches) failures.push(`${app.id}: stale artifact ${entry.path}`);
		if (size.rawBytes > budget.maxRawBytes)
			failures.push(
				`${app.id}: ${entry.path} is ${size.rawBytes} raw bytes, over ${budget.maxRawBytes}`,
			);
		if (size.gzipBytes > budget.maxGzipBytes)
			failures.push(
				`${app.id}: ${entry.path} is ${size.gzipBytes} gzip bytes, over ${budget.maxGzipBytes}`,
			);
		return {
			path: entry.path,
			ownership: entry.ownership,
			...size,
			maxRawBytes: budget.maxRawBytes,
			maxGzipBytes: budget.maxGzipBytes,
			hashMatches,
			status:
				hashMatches &&
				size.rawBytes <= budget.maxRawBytes &&
				size.gzipBytes <= budget.maxGzipBytes &&
				entry.ownership === budget.ownership
					? ("pass" as const)
					: ("fail" as const),
		};
	});

	for (const path of Object.keys(app.artifacts)) {
		if (!seen.has(path)) failures.push(`${app.id}: budget names missing artifact ${path}`);
	}
	return { id: app.id, manifest: app.manifest, inputs, artifacts, failures };
};

const budget = readJson<BudgetFile>(budgetPath);
if (budget.schema !== "pandwind.generated-budget/1")
	throw new Error(`unsupported generated artifact budget schema: ${budget.schema}`);
const apps = budget.apps.map(checkApp);
const failures = apps.flatMap((app) => app.failures);
const report: BudgetReport = { schema: budget.schema, baseline: budget.baseline, apps, failures };

console.log(JSON.stringify(report, null, "\t"));
if (failures.length > 0 && !process.argv.slice(2).includes("--report")) {
	throw new Error(
		["Generated artifact budgets failed:", ...failures.map((failure) => `- ${failure}`)].join("\n"),
	);
}

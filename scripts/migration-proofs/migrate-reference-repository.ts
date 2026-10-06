#!/usr/bin/env node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import { dirname, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createRealRepositoryCorpus, runAdapterMigrationAsync } from "@yumcss/codemod/swap";
import { createSourceWorkspace } from "yumcss/source/workspace";
import { createReferenceWorkspace } from "../reference-workspace.ts";

const REFERENCE_MIGRATION_SCHEMA = "yumcss.reference-migration/1" as const;

export interface ReferenceRepositoryMigrationReport {
	readonly schema: typeof REFERENCE_MIGRATION_SCHEMA;
	readonly reference: string;
	readonly repository: string;
	readonly commit: string;
	readonly sourceAdapter: string;
	readonly targetAdapter: string;
	readonly projectRoot: string;
	readonly workingCopy: string;
	readonly filesScanned: number;
	readonly filesChanged: number;
	readonly converted: number;
	readonly skipped: number;
	readonly residuals: number;
	readonly generatedFiles: readonly string[];
	readonly residualKinds: Readonly<Record<string, number>>;
	readonly nextProofStages: readonly string[];
}

export interface ReferenceRepositoryMigrationOptions {
	readonly referenceRoot?: string;
	readonly outputRoot?: string;
	readonly reportPath?: string;
}

function projectRootFor(checkout: string, sourcePath: string): string {
	let directory = dirname(join(checkout, sourcePath));
	while (directory.startsWith(checkout)) {
		if (existsSync(join(directory, "package.json"))) return directory;
		const parent = dirname(directory);
		if (parent === directory) break;
		directory = parent;
	}
	return checkout;
}

async function materializePinnedTree(
	checkout: string,
	commit: string,
	target: string,
): Promise<void> {
	await new Promise<void>((resolvePromise, rejectPromise) => {
		const archive = spawn("git", ["-C", checkout, "archive", "--format=tar", commit], {
			stdio: ["ignore", "pipe", "pipe"],
		});
		const extract = spawn("tar", ["-xf", "-", "-C", target], {
			stdio: ["pipe", "ignore", "pipe"],
		});
		let archiveCode: number | null = null;
		let extractCode: number | null = null;
		let settled = false;
		let archiveError = "";
		let extractError = "";

		archive.stderr.on("data", (chunk: Buffer) => {
			archiveError += chunk.toString();
		});
		extract.stderr.on("data", (chunk: Buffer) => {
			extractError += chunk.toString();
		});

		const finish = () => {
			if (settled || archiveCode === null || extractCode === null) return;
			settled = true;
			if (archiveCode === 0 && extractCode === 0) {
				resolvePromise();
				return;
			}
			rejectPromise(
				new Error(
					[
						`could not materialize pinned repository ${commit}`,
						archiveError.trim(),
						extractError.trim(),
					]
						.filter(Boolean)
						.join("\n"),
				),
			);
		};

		archive.once("error", rejectPromise);
		extract.once("error", rejectPromise);
		archive.once("close", (code) => {
			archiveCode = code;
			if (code !== 0 && extract.exitCode === null) extract.kill();
			finish();
		});
		extract.once("close", (code) => {
			extractCode = code;
			finish();
		});
		archive.stdout.pipe(extract.stdin);
	});
}

function parseReference(id: string) {
	const reference = createRealRepositoryCorpus().references.find(
		(candidate) => candidate.id === id,
	);
	if (reference === undefined) throw new Error(`unknown pinned reference: ${id}`);
	return reference;
}

export async function runReferenceRepositoryMigration(
	referenceId: string,
	options: ReferenceRepositoryMigrationOptions = {},
): Promise<ReferenceRepositoryMigrationReport> {
	const reference = parseReference(referenceId);
	const references = createReferenceWorkspace(options.referenceRoot);
	const checkout = references.path(reference.clone);
	if (!existsSync(join(checkout, ".git")))
		throw new Error(
			`pinned checkout is missing: run pnpm run references:prepare (${reference.clone})`,
		);
	const actual = execFileSync("git", ["-C", checkout, "rev-parse", "HEAD"], {
		encoding: "utf8",
	}).trim();
	if (actual !== reference.commit)
		throw new Error(
			`${reference.clone} is not pinned: expected ${reference.commit}, got ${actual}`,
		);

	const workingCopy = options.outputRoot
		? resolve(options.outputRoot)
		: mkdtempSync(join(tmpdir(), `yumcss-${reference.id}-`));
	mkdirSync(workingCopy, { recursive: true });
	await materializePinnedTree(checkout, reference.commit, workingCopy);
	const projectRoot = projectRootFor(workingCopy, reference.path);
	const sourceWorkspace = createSourceWorkspace();
	const files = sourceWorkspace.files(["**/*"], projectRoot);
	if (files.length === 0)
		throw new Error(
			`pinned repository ${reference.id} materialized no supported source files from ${reference.path}`,
		);
	const generatedFiles = new Set<string>();
	const residualKinds = new Map<string, number>();
	let filesChanged = 0;
	let converted = 0;
	let skipped = 0;
	let residuals = 0;
	for (const file of files) {
		const source = readFileSync(file, "utf8");
		const result = await runAdapterMigrationAsync(source, {
			from: reference.from,
			to: reference.to,
			file,
			root: projectRoot,
			readFile: (candidate) => {
				try {
					return readFileSync(candidate, "utf8");
				} catch {
					return undefined;
				}
			},
			listFiles: (root) => sourceWorkspace.files(["**/*"], root, { includeUnsupported: true }),
		});
		converted += result.converted;
		skipped += result.skipped;
		residuals += result.residuals.length;
		for (const residual of result.residuals)
			residualKinds.set(residual.kind, (residualKinds.get(residual.kind) ?? 0) + 1);
		if (result.changed) {
			writeFileSync(file, result.code);
			filesChanged++;
		}
		for (const generated of result.generatedFiles) {
			const target = resolve(projectRoot, generated.path);
			if (!target.startsWith(`${projectRoot}/`))
				throw new Error(`adapter emitted a path outside the project: ${generated.path}`);
			mkdirSync(dirname(target), { recursive: true });
			writeFileSync(target, generated.content);
			generatedFiles.add(relative(projectRoot, target));
		}
	}
	const report: ReferenceRepositoryMigrationReport = {
		schema: REFERENCE_MIGRATION_SCHEMA,
		reference: reference.id,
		repository: reference.repository,
		commit: reference.commit,
		sourceAdapter: reference.from,
		targetAdapter: reference.to,
		projectRoot,
		workingCopy,
		filesScanned: files.length,
		filesChanged,
		converted,
		skipped,
		residuals,
		generatedFiles: [...generatedFiles].toSorted(),
		residualKinds: Object.fromEntries(
			[...residualKinds].toSorted(([left], [right]) => left.localeCompare(right)),
		),
		nextProofStages: [
			"install",
			"build",
			"typecheck",
			"lint",
			"ssr",
			"hydration",
			"browser",
			"css-size",
		],
	};
	const output = options.reportPath ?? join(workingCopy, "yumcss-migration-report.json");
	mkdirSync(dirname(resolve(output)), { recursive: true });
	writeFileSync(resolve(output), `${JSON.stringify(report, null, 2)}\n`);
	return report;
}

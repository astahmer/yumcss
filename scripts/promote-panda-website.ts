#!/usr/bin/env node
import {
	normalizeInstalledTargetPackage,
	copyFileSync,
	cpSync,
	existsSync,
	lstatSync,
	mkdtempSync,
	mkdirSync,
	readFileSync,
	readlinkSync,
	readdirSync,
	rmSync,
	symlinkSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { join, relative, resolve, sep } from "node:path";
import { CodemodAdapterId, SwapTargetId } from "@yumcss/codemod/swap";
import { runCaptured, writeJson } from "./installed-proof.ts";
import { proveNextInstallation, type NextInstalledProof } from "./next-proof.ts";
import { createReferenceWorkspace } from "./reference-workspace.ts";
import { ensureReferenceWorkspace } from "./ensure-reference-workspace.ts";

const repositoryRoot = resolve(import.meta.dirname, "..");
const pandaCommit = "8a71bff3dc805e247be70d120cf485c8f14f104b";
const proofSchema = "yumcss.panda-website-proof/1" as const;

interface PandaMigrationSummary {
	readonly filesScanned: number;
	readonly filesChanged: number;
	readonly cssCallsConverted: number;
	readonly cssCallsFlagged: number;
	readonly factoryElementsConverted: number;
	readonly factoryElementsFlagged: number;
	readonly residualsByKind: Readonly<Record<string, number>>;
}

interface PandaWebsiteProof {
	readonly schema: typeof proofSchema;
	readonly reference: {
		readonly repository: "https://github.com/chakra-ui/panda";
		readonly commit: string;
	};
	readonly route: {
		readonly from: CodemodAdapterId.Panda;
		readonly to: CodemodAdapterId.YumCSS;
	};
	readonly fixture: {
		readonly isolated: true;
		readonly sourceProject: "panda/website";
		readonly routeCount: number;
	};
	readonly dependencies: {
		readonly referenceInstalled: true;
		readonly targetNodeModule: boolean;
		readonly targetPackage: string;
	};
	readonly migration: PandaMigrationSummary & {
		readonly converted: number;
		readonly residuals: number;
		readonly generatedFiles: readonly string[];
		readonly targetUsesYumCSS: boolean;
		readonly remainingPandaImports: number;
	};
	readonly checks: {
		readonly sourceTypecheck: true;
		readonly targetTypecheck: true;
		readonly sourceBuild: true;
		readonly targetBuild: true;
		readonly ssrRoutes: number;
		readonly hydrationRoutes: number;
		readonly rscRoutes: number;
	};
	readonly next: NextInstalledProof;
	readonly css: {
		readonly sourceBytes: number;
		readonly targetBytes: number;
		readonly targetNotLarger: boolean;
	};
}

function run(command: string, args: readonly string[], cwd: string): void {
	execFileSync(command, [...args], { cwd, stdio: "inherit" });
}

function binary(root: string, name: string, preparedRoots: readonly string[]): string {
	// pnpm's copied workspace shims keep relative links to the original
	// workspace packages. Run the prepared checkout's shim instead; it keeps
	// those links valid while its cwd still controls the proof project.
	for (const preparedRoot of preparedRoots) {
		const prepared = join(preparedRoot, "node_modules/.bin", name);
		if (existsSync(prepared)) return prepared;
	}
	const local = join(root, "node_modules/.bin", name);
	if (existsSync(local)) return local;
	throw new Error(`missing installed binary ${name} in ${root} or prepared roots`);
}

function copyWebsite(source: string, target: string): void {
	cpSync(source, target, {
		recursive: true,
		filter: (path) => {
			const first = relative(source, path).split(sep, 1)[0];
			return !new Set([
				".git",
				".next",
				".velite",
				"node_modules",
				"styled-system",
				"yumcss",
				"__yumcss",
			]).has(first);
		},
	});
}

function copyPreparedEntry(source: string, target: string): void {
	const entry = lstatSync(source);
	if (entry.isSymbolicLink()) {
		const resolved = resolve(source, "..");
		const link = resolve(resolved, readlinkSync(source));
		symlinkSync(link, target);
		return;
	}
	if (entry.isDirectory()) {
		mkdirSync(target, { recursive: true });
		for (const child of readdirSync(source))
			copyPreparedEntry(join(source, child), join(target, child));
		return;
	}
	copyFileSync(source, target);
}

/** Recreate pnpm's shallow node_modules links without copying its package store. */
function linkPreparedNodeModules(
	prepared: string,
	target: string,
	yumcssRoot: string,
	workspaceNodeModules: string,
): void {
	mkdirSync(target, { recursive: true });
	symlinkSync(resolve(prepared, ".pnpm"), join(target, ".pnpm"), "dir");
	for (const entry of readdirSync(prepared, { withFileTypes: true })) {
		if (entry.name === ".pnpm" || entry.name === "yumcss") continue;
		const source = join(prepared, entry.name);
		const destination = join(target, entry.name);
		copyPreparedEntry(source, destination);
	}
	// The website is a pnpm workspace package. Next resolves these root dev
	// dependencies from the workspace parent when the reference runs in place.
	// Recreate that lookup in the isolated copy so Next does not try to mutate
	// the fixture while checking TypeScript.
	for (const name of ["typescript", "@types/node"]) {
		const source = join(workspaceNodeModules, name);
		const destination = join(target, name);
		if (!existsSync(source) || existsSync(destination)) continue;
		mkdirSync(resolve(destination, ".."), { recursive: true });
		symlinkSync(source, destination, "dir");
	}
	symlinkSync(yumcssRoot, join(target, "yumcss"), "dir");
}

function cloneGeneratedDirectory(source: string, target: string): void {
	if (existsSync(target)) rmSync(target, { recursive: true, force: true });
	cpSync(source, target, { recursive: true, dereference: false });
}

function cssBytes(root: string): number {
	const directory = join(root, ".next/static/css");
	if (!existsSync(directory)) return 0;
	const visit = (path: string): number =>
		readdirSync(path, { withFileTypes: true }).reduce((total, entry) => {
			const file = join(path, entry.name);
			return total + (entry.isDirectory() ? visit(file) : lstatSync(file).size);
		}, 0);
	return visit(directory);
}

function parseMigrationOutput(output: string): PandaMigrationSummary {
	const summary = output.match(
		/project migration: (\d+) file\(s\) scanned · (\d+) changed · (\d+) css\(\) converted · (\d+) flagged · (\d+) factory elements converted · (\d+) flagged/u,
	);
	if (summary === null) throw new Error("Panda project migration did not emit its summary");
	const residualsByKind = Object.fromEntries(
		[...output.matchAll(/^\s{4,}([\w-]+):\s+(\d+)\s*$/gmu)].map((match) => [
			match[1]!,
			Number(match[2]),
		]),
	);
	return {
		filesScanned: Number(summary[1]),
		filesChanged: Number(summary[2]),
		cssCallsConverted: Number(summary[3]),
		cssCallsFlagged: Number(summary[4]),
		factoryElementsConverted: Number(summary[5]),
		factoryElementsFlagged: Number(summary[6]),
		residualsByKind,
	};
}

function migratedFiles(root: string): readonly string[] {
	const files: string[] = [];
	const visit = (directory: string): void => {
		for (const entry of readdirSync(directory, { withFileTypes: true })) {
			const path = join(directory, entry.name);
			if (entry.isDirectory()) visit(path);
			else files.push(relative(root, path).replaceAll(sep, "/"));
		}
	};
	for (const directory of ["app", "src", "theme"]) visit(join(root, directory));
	return files;
}

function generatedFiles(root: string): readonly string[] {
	const files: string[] = [];
	const visit = (directory: string): void => {
		for (const entry of readdirSync(directory, { withFileTypes: true })) {
			const path = join(directory, entry.name);
			if (entry.isDirectory()) visit(path);
			else files.push(relative(root, path).replaceAll(sep, "/"));
		}
	};
	for (const directory of [
		"yumcss",
		"__yumcss",
		"src/yumcss",
		"src/__yumcss",
		"app/yumcss",
		"app/__yumcss",
	]) {
		const path = join(root, directory);
		if (existsSync(path)) visit(path);
	}
	return files.toSorted();
}

function countRemainingPandaImports(root: string): number {
	return migratedFiles(root).filter((path) => {
		if (!/\.[cm]?[jt]sx?$/u.test(path)) return false;
		return /from\s+["'](?:@\/)?styled-system\//u.test(readFileSync(join(root, path), "utf8"));
	}).length;
}

async function main(): Promise<void> {
	if (process.argv.includes("--prepare")) await ensureReferenceWorkspace("panda");
	const workspace = createReferenceWorkspace();
	const websiteRoot = resolve(process.env.YUMCSS_PANDA_WEBSITE ?? workspace.path("panda/website"));
	const referenceRoot = resolve(websiteRoot, "..");
	if (!existsSync(join(referenceRoot, ".git")))
		throw new Error(
			`Panda reference is missing at ${referenceRoot}; run pnpm run references:prepare -- panda and pnpm run references:deps`,
		);
	const actualCommit = execFileSync("git", ["-C", websiteRoot, "rev-parse", "HEAD"], {
		encoding: "utf8",
	}).trim();
	if (actualCommit !== pandaCommit)
		throw new Error(`Panda reference is not pinned: expected ${pandaCommit}, got ${actualCommit}`);
	const preparedNodeModules = join(websiteRoot, "node_modules");
	if (!existsSync(preparedNodeModules))
		throw new Error(`Panda website dependencies are missing: ${preparedNodeModules}`);

	run("pnpm", ["--filter", "yumcss", "run", "build"], repositoryRoot);
	const root = mkdtempSync(join("/tmp", "yumcss-panda-website-"));
	const sourceRoot = join(root, "source");
	const targetRoot = join(root, "target");
	const keep = process.argv.includes("--keep");
	try {
		copyWebsite(websiteRoot, sourceRoot);
		copyWebsite(websiteRoot, targetRoot);
		linkPreparedNodeModules(
			preparedNodeModules,
			join(sourceRoot, "node_modules"),
			join(repositoryRoot, "packages/yumcss"),
			join(referenceRoot, "node_modules"),
		);
		linkPreparedNodeModules(
			preparedNodeModules,
			join(targetRoot, "node_modules"),
			join(repositoryRoot, "packages/yumcss"),
			join(referenceRoot, "node_modules"),
		);

		const preparedRoots = [websiteRoot, referenceRoot];
		const panda = binary(sourceRoot, "panda", preparedRoots);
		const velite = binary(sourceRoot, "velite", preparedRoots);
		const tsc = binary(sourceRoot, "tsc", preparedRoots);
		const next = binary(sourceRoot, "next", preparedRoots);
		run(panda, ["codegen"], sourceRoot);
		run(velite, ["--clean"], sourceRoot);
		run(tsc, ["--noEmit"], sourceRoot);
		run(next, ["build"], sourceRoot);
		cloneGeneratedDirectory(join(sourceRoot, "styled-system"), join(targetRoot, "styled-system"));
		cloneGeneratedDirectory(join(sourceRoot, ".velite"), join(targetRoot, ".velite"));

		const migrationOutput = runCaptured(
			"nub",
			[
				"--conditions",
				"yumcss",
				join(repositoryRoot, "packages/codemod/src/cli.ts"),
				"migrate",
				"--from",
				CodemodAdapterId.Panda,
				"--to",
				SwapTargetId.CssClass,
				"--root",
				targetRoot,
				"--no-install",
				"--report",
				"app/**/*.ts",
				"app/**/*.tsx",
				"src/**/*.ts",
				"src/**/*.tsx",
				"theme/**/*.ts",
				"theme/**/*.tsx",
				"next.config.mjs",
				"panda.config.ts",
				"postcss.config.cjs",
			],
			repositoryRoot,
		);
		const migration = parseMigrationOutput(migrationOutput);
		const targetNext = binary(targetRoot, "next", preparedRoots);
		const targetTsc = binary(targetRoot, "tsc", preparedRoots);
		run(targetTsc, ["--noEmit"], targetRoot);
		run(targetNext, ["build"], targetRoot);
		const nextProof = await proveNextInstallation({
			repositoryRoot,
			sourceRoot,
			targetRoot,
			nextBinary: next,
			ignoredConsoleErrorPatterns: [
				/pandamastery\.com/u,
				/Failed to load resource: net::ERR_FAILED/u,
				/Failed to load resource: net::ERR_CONNECTION_REFUSED/u,
				/Failed to fetch RSC payload/u,
			],
		});
		const generated = generatedFiles(targetRoot);
		const targetPackage = JSON.parse(readFileSync(join(targetRoot, "package.json"), "utf8")) as {
			dependencies?: Record<string, string>;
			devDependencies?: Record<string, string>;
		};
		const remainingPandaImports = countRemainingPandaImports(targetRoot);
		const report: PandaWebsiteProof = {
			schema: proofSchema,
			reference: {
				repository: "https://github.com/chakra-ui/panda",
				commit: pandaCommit,
			},
			route: { from: CodemodAdapterId.Panda, to: CodemodAdapterId.YumCSS },
			fixture: {
				isolated: true,
				sourceProject: "panda/website",
				routeCount: nextProof.http.routeCount,
			},
			dependencies: {
				referenceInstalled: true,
				targetNodeModule: existsSync(join(targetRoot, "node_modules/yumcss/package.json")),
				targetPackage: normalizeInstalledTargetPackage(
					targetPackage.dependencies?.yumcss ?? targetPackage.devDependencies?.yumcss ?? "",
					repositoryRoot,
				),
			},
			migration: {
				...migration,
				converted: migration.cssCallsConverted + migration.factoryElementsConverted,
				residuals: Object.values(migration.residualsByKind).reduce(
					(total, count) => total + count,
					0,
				),
				generatedFiles: generated,
				targetUsesYumCSS:
					readFileSync(join(targetRoot, "next.config.mjs"), "utf8").includes("yumcss") &&
					migratedFiles(targetRoot).some((path) =>
						readFileSync(join(targetRoot, path), "utf8").includes("yumcss/css"),
					),
				remainingPandaImports,
			},
			checks: {
				sourceTypecheck: true,
				targetTypecheck: true,
				sourceBuild: true,
				targetBuild: true,
				ssrRoutes: nextProof.http.routeCount,
				hydrationRoutes: nextProof.browser.routeCount,
				rscRoutes: nextProof.rsc.routeCount,
			},
			next: nextProof,
			css: {
				sourceBytes: cssBytes(sourceRoot),
				targetBytes: cssBytes(targetRoot),
				targetNotLarger: cssBytes(targetRoot) <= cssBytes(sourceRoot),
			},
		};
		writeJson(join(repositoryRoot, "plans/evidence/panda-website-installed-proof.json"), report);
		console.log(JSON.stringify(report, null, 2));
		if (report.next.http.sourceFailures.length > 0 || report.next.http.targetFailures.length > 0)
			throw new Error("Panda website HTTP route proof failed");
		if (report.next.rsc.sourceFailures.length > 0 || report.next.rsc.targetFailures.length > 0)
			throw new Error("Panda website RSC proof failed");
		if (!report.next.browser.equivalent) throw new Error("Panda website browser proof failed");
	} finally {
		if (keep) console.error(`kept Panda website proof workspace: ${root}`);
		else rmSync(root, { recursive: true, force: true });
	}
}

if (import.meta.main) await main();

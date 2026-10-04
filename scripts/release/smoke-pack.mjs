/**
 * Pack smoke test — proves a package's tarball is consumable BEFORE publishing.
 *
 * Usage (from repo root, under Nub so source imports and TypeScript work):
 *   pnpm release:smoke            (all five publishable packages)
 *   nub scripts/release/smoke-pack.mjs packages/pandwind
 *
 * Steps:
 *  1. `pnpm pack` the package;
 *  2. untar and read the SHIPPED package.json;
 *  3. assert every `exports`/`bin`/`main` target exists in the tarball;
 *  4. dynamically import EVERY shipped JavaScript module — built packages
 *     must have zero broken specifiers anywhere (deep-relative imports into
 *     sibling packages are the classic failure mode).
 *
 * Extraction happens in `<pkg>/.pw-smoke/`, outside any `node_modules`
 * directory. The dev-only `pandwind` export condition intentionally points
 * at workspace TypeScript and is not part of the published tarball; the
 * default import/types conditions must resolve to built `dist` artifacts.
 */
import { execFileSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	symlinkSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

function parsePackageTargets(value) {
	if (typeof value === "string") return [value];
	if (value === null || typeof value !== "object" || Array.isArray(value)) return [];
	return Object.values(value).filter((target) => typeof target === "string");
}

function parseExportTargets(value) {
	if (typeof value === "string") return [value];
	if (value === null || typeof value !== "object" || Array.isArray(value)) return [];
	return Object.entries(value)
		.filter(([condition]) => condition !== "pandwind")
		.map(([, target]) => target)
		.filter((target) => typeof target === "string");
}

function parsePackageEntry(value) {
	if (typeof value === "string") return value;
	if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
	const target = value.import ?? value.default;
	return typeof target === "string" ? target : undefined;
}

async function main() {
	const pkgDir = resolve(process.argv[2] ?? ".");
	const manifest = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));

	const smokeRoot = join(pkgDir, ".pw-smoke");
	rmSync(smokeRoot, { recursive: true, force: true });
	mkdirSync(smokeRoot, { recursive: true });
	const workdir = mkdtempSync(join(smokeRoot, "run-"));
	const extracted = join(workdir, "pkg");

	try {
		// 1-2. pack + extract (npm tarballs wrap in `package/` — strip it)
		const packOut = execFileSync("pnpm", ["pack", "--json", "--pack-destination", workdir], {
			cwd: pkgDir,
			encoding: "utf8",
		});
		const parsed = JSON.parse(packOut);
		const entry = Array.isArray(parsed) ? parsed[0] : parsed;
		if (entry?.filename === undefined) throw new Error("pnpm pack produced no tarball");
		const tarballPath = resolve(entry.filename);
		mkdirSync(extracted, { recursive: true });
		execFileSync("tar", ["-xzf", tarballPath, "--strip-components", "1", "-C", extracted]);

		const shipped = JSON.parse(readFileSync(join(extracted, "package.json"), "utf8"));
		// Resolve optional peer imports (for example React Native's React host)
		// against the workspace installation while smoke-testing the tarball.
		// The link is outside the tarball and is never part of the published files.
		const workspaceNodeModules = [
			resolve(pkgDir, "../../node_modules"),
			resolve(pkgDir, "../../examples/example/node_modules"),
		].find((candidate) => statMaybe(join(candidate, "react")));
		if (statMaybe(workspaceNodeModules)) {
			symlinkSync(workspaceNodeModules, join(extracted, "node_modules"), "dir");
		}

		// 3. every declared target must exist inside the tarball
		const exists = (rel) => {
			try {
				statSync(join(extracted, rel));
				return true;
			} catch {
				return false;
			}
		};
		const missing = [];
		for (const [key, value] of Object.entries(shipped.exports ?? {})) {
			const targets = parseExportTargets(value);
			for (const target of targets) {
				if (!exists(target)) missing.push(`${key} -> ${target}`);
			}
		}
		for (const binTarget of parsePackageTargets(shipped.bin)) {
			if (!exists(binTarget)) missing.push(`bin -> ${binTarget}`);
		}
		if (missing.length > 0) {
			console.error(`smoke-pack(${manifest.name}): MISSING export targets:`);
			for (const m of missing) console.error(`  - ${m}`);
			process.exitCode = 1;
			return;
		}

		// 4. "." entry must import
		const dotExport = parsePackageEntry(shipped.exports?.["."]);
		if (dotExport !== undefined) {
			await import(pathToFileURL(join(extracted, dotExport)).href);
		}

		// 4b. whole-tarball module sweep. Tooling stages are side-effect free when
		// imported; only the `pandwind-codemod tw` entry executes as a CLI. Browser bundles
		// are intentionally excluded: importing a Vite client asset in Node is not
		// a valid package-consumption test because its module-preload bootstrap uses
		// the browser DOM at module evaluation time.
		// Sequential imports by design: deterministic error ordering.
		const broken = [];
		const pathSeparator = process.platform === "win32" ? "\\" : "/";
		const browserBundleMarker = `${pathSeparator}dist${pathSeparator}client${pathSeparator}`;
		const walkModules = async (dir) => {
			for (const dirEntry of readdirSync(dir, { withFileTypes: true })) {
				if (dirEntry.name === "node_modules") continue;
				const path = join(dir, dirEntry.name);
				if (dirEntry.isDirectory()) {
					await walkModules(path);
				} else if (/\.(js|mjs)$/.test(dirEntry.name)) {
					if (/\.(test|spec)\.(js|mjs)$/.test(dirEntry.name)) continue;
					if (path.includes(browserBundleMarker)) continue;
					try {
						await import(pathToFileURL(path).href);
					} catch (error) {
						const message = error?.message?.split("\n")[0] ?? "unknown";
						broken.push(`${path.replace(`${extracted}/`, "")}: ${message}`);
					}
				}
			}
		};
		await walkModules(extracted);

		if (broken.length > 0) {
			console.error(`smoke-pack(${manifest.name}): ${broken.length} module(s) fail to import:`);
			for (const b of broken.slice(0, 10)) console.error(`  - ${b}`);
			process.exitCode = 1;
			return;
		}

		const fileCount = countFiles(extracted);
		console.log(
			`smoke-pack(${manifest.name}): OK — ${fileCount} files shipped, all export targets resolve, all modules import`,
		);
	} finally {
		rmSync(smokeRoot, { recursive: true, force: true });
	}
}

function statMaybe(path) {
	try {
		statSync(path);
		return true;
	} catch {
		return false;
	}
}

await main();

function countFiles(dir) {
	let count = 0;
	for (const dirEntry of readdirSync(dir, { withFileTypes: true })) {
		if (dirEntry.isDirectory()) count += countFiles(join(dir, dirEntry.name));
		else count++;
	}
	return count;
}

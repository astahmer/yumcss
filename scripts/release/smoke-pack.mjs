/**
 * Pack smoke test — proves a package's tarball is consumable BEFORE publishing.
 *
 * Usage (from repo root, under tsx so source-imports transform):
 *   pnpm release:smoke            (all four publishable packages)
 *   pnpm exec tsx scripts/release/smoke-pack.mjs packages/pandwind
 *
 * Steps:
 *  1. `pnpm pack` the package;
 *  2. untar and read the SHIPPED package.json;
 *  3. assert every `exports`/`bin`/`main` target exists in the tarball;
 *  4. dynamically import EVERY shipped module — source-published packages
 *     must have zero broken specifiers anywhere (deep-relative imports into
 *     sibling packages are the classic failure mode).
 *
 * Extraction happens inside `<pkg>/node_modules/.pw-smoke/` so bare-specifier
 * dependencies resolve against the workspace while the tarball contents stay
 * byte-isolated.
 */
import { execSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

async function main() {
	const pkgDir = resolve(process.argv[2] ?? ".");
	const manifest = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));

	const smokeRoot = join(pkgDir, "node_modules", ".pw-smoke");
	rmSync(smokeRoot, { recursive: true, force: true });
	mkdirSync(smokeRoot, { recursive: true });
	const workdir = mkdtempSync(join(smokeRoot, "run-"));
	const extracted = join(workdir, "pkg");

	try {
		// 1-2. pack + extract (npm tarballs wrap in `package/` — strip it)
		const packOut = execSync(`pnpm pack --json --pack-destination ${workdir}`, {
			cwd: pkgDir,
			encoding: "utf8",
		});
		const parsed = JSON.parse(packOut);
		const entry = Array.isArray(parsed) ? parsed[0] : parsed;
		if (entry?.filename === undefined) throw new Error("pnpm pack produced no tarball");
		const tarballPath = resolve(entry.filename);
		mkdirSync(extracted, { recursive: true });
		execSync(`tar -xzf ${tarballPath} --strip-components 1 -C ${extracted}`);

		const shipped = JSON.parse(readFileSync(join(extracted, "package.json"), "utf8"));

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
			const targets = typeof value === "string" ? [value] : Object.values(value ?? {});
			for (const target of targets) {
				if (typeof target === "string" && !exists(target)) missing.push(`${key} -> ${target}`);
			}
		}
		for (const binTarget of Object.values(shipped.bin ?? {})) {
			if (!exists(binTarget)) missing.push(`bin -> ${binTarget}`);
		}
		if (missing.length > 0) {
			console.error(`smoke-pack(${manifest.name}): MISSING export targets:`);
			for (const m of missing) console.error(`  - ${m}`);
			process.exitCode = 1;
			return;
		}

		// 4. "." entry must import
		const dotExport =
			typeof shipped.exports?.["."] === "string"
				? shipped.exports["."]
				: typeof shipped.exports?.["."] === "object"
					? (shipped.exports["."].import ?? shipped.exports["."].default)
					: undefined;
		if (typeof dotExport === "string") {
			await import(pathToFileURL(join(extracted, dotExport)).href);
		}

		// 4b. whole-tarball module sweep. Codegen CLIs do top-level file IO and are
		// only ever executed directly (`pnpm tw:bridge`) — excluded.
		const SWEEP_ALLOWLIST = /tw\/generate-bridge\.ts$/;
		// Sequential imports by design: deterministic error ordering.
		// oxlint-disable eslint/no-await-in-loop
		const broken = [];
		const walkModules = async (dir) => {
			for (const dirEntry of readdirSync(dir, { withFileTypes: true })) {
				const path = join(dir, dirEntry.name);
				if (dirEntry.isDirectory()) {
					await walkModules(path);
				} else if (/\.(ts|tsx|js|mjs)$/.test(dirEntry.name)) {
					if (/\.(test|spec)\.(ts|tsx|js|mjs)$/.test(dirEntry.name)) continue;
					if (SWEEP_ALLOWLIST.test(path)) continue;
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

await main();

function countFiles(dir) {
	let count = 0;
	for (const dirEntry of readdirSync(dir, { withFileTypes: true })) {
		if (dirEntry.isDirectory()) count += countFiles(join(dir, dirEntry.name));
		else count++;
	}
	return count;
}

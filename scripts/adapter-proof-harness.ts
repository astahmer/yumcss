import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createReferenceWorkspace } from "./reference-workspace.ts";

export const referenceWorkspaceRoot = createReferenceWorkspace().root;
const requireFromRoot = createRequire(join(resolve(import.meta.dirname, ".."), "package.json"));
const requireFromCodemod = createRequire(
	join(resolve(import.meta.dirname, ".."), "packages/codemod/package.json"),
);

/**
 * Optional ecosystem compilers and engine loaders (sass, less,
 * @tailwindcss/node) are YumCSS devDependencies, not upstream-repository
 * dependencies. Project-first resolution keeps the host boundary; the
 * packages/codemod fallback lets pinned excerpts compile without installing
 * their full upstream lockfiles. This fallback lives in the harness only:
 * adapters still resolve from the migrated project first.
 */
export const harnessModuleLoader = {
	async importPackage<T>(packageName: string, projectRoot: string): Promise<T | undefined> {
		const loaders = [
			createRequire(join(projectRoot, "package.json")),
			requireFromRoot,
			requireFromCodemod,
		];
		for (const load of loaders) {
			try {
				return load(packageName) as T;
			} catch {
				// Try the next dependency root; the caller still receives an
				// explicit undefined when no installed package can be loaded.
			}
		}
		return undefined;
	},
	async importFile<T>(file: string): Promise<T | undefined> {
		try {
			// Official-loader contract: adapters fail closed when a discovered
			// config cannot be loaded, and the error itself must never become a
			// guessed fallback. Node type-strips .ts (24+) and resolves bare
			// imports from the config's own checkout, so the project's real
			// dependency tree (including workspace configs) is honored.
			return (await import(pathToFileURL(file).href)) as T;
		} catch {
			return undefined;
		}
	},
};

/**
 * Adapters resolve official configuration from discovered project files.
 * Without providers they must fail closed, which proves the contract but not
 * the configured case. These harness providers read only from the pinned
 * checkout so an excerpt is proven against its real project context.
 */
export function checkoutFileProvider(checkout: string): {
	readFile: (file: string) => string | undefined;
	listFiles: (base: string) => readonly string[];
} {
	const read = (file: string): string | undefined => {
		const resolved = resolve(checkout, file);
		if (!resolved.startsWith(checkout)) return undefined;
		try {
			return readFileSync(resolved, "utf8");
		} catch {
			return undefined;
		}
	};
	const list = (base: string): readonly string[] => {
		const files: string[] = [];
		const walk = (directory: string): void => {
			if (!directory.startsWith(checkout) || directory.includes("/.git")) return;
			let entries: readonly string[];
			try {
				entries = readdirSync(directory);
			} catch {
				return;
			}
			for (const entry of entries) {
				const path = join(directory, entry);
				if (path.includes("node_modules")) continue;
				let stat;
				try {
					stat = statSync(path);
				} catch {
					continue;
				}
				if (stat.isDirectory()) walk(path);
				else files.push(path);
			}
		};
		walk(resolve(checkout, base));
		return files;
	};
	return { readFile: read, listFiles: list };
}

export function readPinnedSource(reference: {
	readonly clone: string;
	readonly commit: string;
	readonly path: string;
}): string {
	const checkout = join(referenceWorkspaceRoot, reference.clone);
	const actual = execFileSync("git", ["-C", checkout, "rev-parse", "HEAD"], {
		encoding: "utf8",
	}).trim();
	if (actual !== reference.commit)
		throw new Error(`${reference.clone} moved: expected ${reference.commit}, got ${actual}`);
	return execFileSync("git", ["-C", checkout, "show", `${reference.commit}:${reference.path}`], {
		encoding: "utf8",
	});
}

export function projectRootFor(reference: {
	readonly clone: string;
	readonly path: string;
}): string {
	const checkout = join(referenceWorkspaceRoot, reference.clone);
	let directory = dirname(join(checkout, reference.path));
	while (directory.startsWith(checkout)) {
		if (existsSync(join(directory, "package.json"))) return directory;
		const parent = dirname(directory);
		if (parent === directory) break;
		directory = parent;
	}
	return checkout;
}

/**
 * @unocss/preset-mini oracle at the pinned @unocss/core version. Not a
 * workspace dependency: npm-install it into a shared tmp cache once (the
 * repo install graph stays unchanged); the generator itself is the
 * @unocss/core dev dependency resolved from the workspace root.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";

const rootRequire = createRequire(new URL("../../../../package.json", import.meta.url));

const cacheDir = path.join(os.tmpdir(), "pandwind-unocss-proof");
const marker = path.join(cacheDir, "node_modules/@unocss/preset-mini/package.json");
const versionOf = (pkgJsonPath: string): string =>
	(JSON.parse(readFileSync(pkgJsonPath, "utf8")) as { version: string }).version;

export const unoPresetMini = async <TPreset = unknown>(
	options: Record<string, unknown> = {},
): Promise<TPreset> => {
	const corePath = rootRequire.resolve("@unocss/core/package.json");
	const coreVersion = versionOf(corePath);
	mkdirSync(cacheDir, { recursive: true });
	let cached = false;
	try {
		cached = versionOf(marker) === coreVersion;
	} catch {
		cached = false;
	}
	if (!cached) {
		execFileSync(
			"npm",
			["install", "--no-save", "--prefix", cacheDir, "@unocss/preset-mini@" + coreVersion],
			{ stdio: "pipe" },
		);
	}
	const presetPath = path.join(cacheDir, "node_modules/@unocss/preset-mini");
	const mod = (await import(presetPath + "/dist/index.mjs")) as {
		presetMini: (opts?: Record<string, unknown>) => unknown;
	};
	return mod.presetMini(options) as TPreset;
};

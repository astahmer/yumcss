/**
 * Runtime size budget — the browser bundle must stay stylex-sized (a few KB
 * min+gz), not panda-sized (tens of KB).
 *
 * Each public entry is bundled standalone with esbuild (minified, browser
 * target) and measured raw + gzipped. The stylesheet generator is measured
 * as a baseline: it's build-time only and must never ride along in the
 * runtime entry — importing it from the css barrel used to drag
 * postcss-selector-parser (~20KB gz) into every app bundle.
 */
import { gzipSync } from "node:zlib";
import { resolve } from "node:path";
import { buildSync } from "esbuild";
import { expect, test } from "vitest";

const ROOT = resolve(import.meta.dirname, "..");

const bundle = (fixture: string): { min: number; gz: number } => {
	const result = buildSync({
		entryPoints: [resolve(ROOT, "tests/fixtures", fixture)],
		bundle: true,
		minify: true,
		format: "esm",
		platform: "browser",
		write: false,
		logLevel: "silent",
	});
	const code = result.outputFiles[0]!.text;
	return { min: code.length, gz: gzipSync(code).byteLength };
};

test("runtime entries stay stylex-sized", async () => {
	const sizes = {
		css: bundle("runtime-css.ts"),
		tw: bundle("runtime-tw.ts"),
		cx: bundle("runtime-cx.ts"),
		"all (css+tw+cx)": bundle("runtime-all.ts"),
		"stylesheet generator (build-time only)": bundle("size-stylesheet.ts"),
	};

	await expect(JSON.stringify(sizes, null, 2)).toMatchFileSnapshot(
		resolve(ROOT, "tests/snapshots", "runtime-size.json.snap"),
	);

	expect(sizes["css"].gz).toBeLessThan(2_000);
	expect(sizes["tw"].gz).toBeLessThan(2_000);
	expect(sizes["cx"].gz).toBeLessThan(3_000);
	expect(sizes["all (css+tw+cx)"].gz).toBeLessThan(4_000);
	// The build-time generator must never ride along in the runtime entry.
	expect(sizes["all (css+tw+cx)"].gz).toBeLessThan(
		sizes["stylesheet generator (build-time only)"].gz / 3,
	);
});

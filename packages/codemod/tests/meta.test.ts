import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { describe, expect, test } from "vitest";
import { loadMetaFromSources, loadMetaFromSourcesAsync } from "../src/meta.ts";

const appDir = resolve(import.meta.dirname, "../../../examples/example/src");
const sourceOptions = {
	typesDtsPath: resolve(appDir, "types.d.ts"),
	twTsPath: resolve(appDir, "tw.ts"),
	bridgePath: resolve(appDir, "bridge.ts"),
};

describe("project-aware migration metadata", () => {
	test("async loading discovers tokens from the generated bridge preset", async () => {
		const meta = await loadMetaFromSourcesAsync(sourceOptions);

		expect(meta.tokens?.colors).toHaveProperty("$blue-500", "#3182ce");
		expect(meta.conditions._hover).toBe("&:hover");
		expect(meta.conditions._dark).toBe(".dark &");
	});

	test("sync loading stays explicit when no project token context is supplied", () => {
		const meta = loadMetaFromSources(sourceOptions);

		expect(meta.tokens).toBeUndefined();
		expect(meta.conditions).toEqual({});
		expect(meta.bridgeInverse.get("flex")).toEqual({ property: "display", value: "flex" });
	});

	test("loads custom conditions from the resolved source preset", async () => {
		const dir = mkdtempSync(join(process.env.TMPDIR ?? "/tmp", "yumcss-meta-conditions-"));
		const bridgePath = join(dir, "bridge.ts");
		try {
			writeFileSync(
				join(dir, "preset.mjs"),
				'export const customPreset = { conditions: { _hover: "&:focus-visible", _customFocus: "&:focus", _customDark: "@media (prefers-color-scheme: dark)" } };\n',
			);
			writeFileSync(
				bridgePath,
				'import { customPreset as appPreset } from "./preset.mjs";\nexport const generated = { preset: appPreset };\n',
			);
			const meta = await loadMetaFromSourcesAsync({ ...sourceOptions, bridgePath });

			expect(meta.conditions).toEqual({
				_hover: "&:focus-visible",
				_customFocus: "&:focus",
				_customDark: "@media (prefers-color-scheme: dark)",
			});
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("loads the versioned interop artifact without generated source files", () => {
		const dir = mkdtempSync(join(process.env.TMPDIR ?? "/tmp", "yumcss-meta-"));
		try {
			writeFileSync(
				join(dir, "yumcss.interop.json"),
				JSON.stringify({
					schema: "yumcss.interop/1",
					generatedFrom: { types: "types.d.ts", runtime: "tw.ts", bridge: "bridge.ts" },
					utilities: [
						{ key: "bgColor", base: "bg", valueType: "BgColorValue" },
						{ key: "textColor", base: "text", valueType: "BgColorValue" },
					],
					valueTypes: { BgColorValue: ["blue-500"] },
					tw: {
						variants: { hover: { join: ":" } },
						conflicts: { bg: { "blue-500": ["background-color"] } },
						compose: [],
					},
					bridge: { "background-color": { "#3182ce": "bg-blue-500" } },
					theme: { variables: {}, scopes: [] },
					tokens: {
						state: "available",
						source: { kind: "configured-token-module", module: "./tokens.ts", fingerprint: "abc" },
						fidelity: { status: "lossless", losses: [] },
						document: {
							schema: "yumcss.token-document/1",
							format: "dtcg",
							formatVersion: "2025.10",
							sourceFingerprint: "abc",
							root: { kind: "group", children: {} },
						},
					},
				}),
			);
			const meta = loadMetaFromSources({ interopPath: join(dir, "yumcss.interop.json") });
			expect(meta.keys[0]).toMatchObject({ key: "bgColor", base: "bg" });
			expect(meta.valueLiterals.get("BgColorValue")).toEqual(new Set(["blue-500"]));
			expect(meta.variants.get("hover")).toEqual({ join: ":" });
			expect(meta.bridgeInverse.get("bg-blue-500")).toEqual({
				property: "background-color",
				value: "#3182ce",
			});
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("rejects unsupported interop schema versions", () => {
		const dir = mkdtempSync(join(process.env.TMPDIR ?? "/tmp", "yumcss-meta-"));
		try {
			const path = join(dir, "yumcss.interop.json");
			writeFileSync(path, '{"schema":"yumcss.interop/future"}\n');
			expect(() => loadMetaFromSources({ interopPath: path })).toThrow(
				"invalid yumcss.interop/1 artifact",
			);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

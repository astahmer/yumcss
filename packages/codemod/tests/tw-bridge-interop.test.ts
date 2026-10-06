import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
	buildYumCSSInteropArtifact,
	parseYumCSSInteropArtifact,
} from "../src/tw/interop-artifact.ts";
import { generateTwBridge } from "../src/tw/generate-bridge.ts";
import { parseDtcgTokenDocument } from "../src/swap/token-document.ts";

const types = `
type BgColorValue = "blue-500";
interface WindUtilities {
	"bgColor"?: BgColorValue | true;
}
`;

const tw = `
import { createTw } from "yumcss/tw";
const __yumcssConfig = { variants: { hover: { join: ":" } }, conflicts: {}, compose: [] };
export const tw = createTw(__yumcssConfig);
`;

describe("Tailwind bridge interop artifact refresh", () => {
	test("preserves token snapshots and rejects unsupported schemas", async () => {
		const project = mkdtempSync(join(import.meta.dirname, ".tw-bridge-interop-"));
		try {
			const cssEntry = join(project, "tailwind.css");
			const twFile = join(project, "tw.ts");
			const presetFile = join(project, "preset.mjs");
			const bridgeFile = join(project, "bridge.ts");
			const interopFile = join(project, "yumcss.interop.json");
			writeFileSync(cssEntry, '@import "tailwindcss";\n@theme { --color-brand: #123456; }\n');
			writeFileSync(twFile, tw);
			writeFileSync(join(project, "types.d.ts"), types);
			writeFileSync(
				presetFile,
				'export const examplePreset = { tokens: { colors: { brand: "#123456" } } };\n',
			);

			const retainedDocument = parseDtcgTokenDocument(
				JSON.stringify({
					colors: {
						preserved: {
							$type: "color",
							$value: { colorSpace: "srgb", components: [0.1, 0.2, 0.3] },
						},
					},
				}),
			);
			const retainedArtifact = buildYumCSSInteropArtifact({
				typesDts: types,
				twTs: tw,
				tokenDocument: retainedDocument,
				tokenSource: "./tokens.json",
			});
			writeFileSync(interopFile, `${JSON.stringify(retainedArtifact)}\n`);

			const options = {
				cssEntry,
				twFile,
				outFile: bridgeFile,
				presetImport: presetFile,
				presetExport: "examplePreset",
			};
			await generateTwBridge(options);
			const refreshed = parseYumCSSInteropArtifact(JSON.parse(readFileSync(interopFile, "utf8")));
			expect(refreshed.tokens).toEqual(retainedArtifact.tokens);
			expect(readFileSync(bridgeFile, "utf8")).toContain('"#123456"');

			writeFileSync(interopFile, `${JSON.stringify({ schema: "yumcss.interop/future" })}\n`);
			await expect(generateTwBridge(options)).rejects.toThrow(
				"unsupported existing interop schema 'yumcss.interop/future'",
			);
			expect(JSON.parse(readFileSync(interopFile, "utf8"))).toEqual({
				schema: "yumcss.interop/future",
			});
		} finally {
			rmSync(project, { recursive: true, force: true });
		}
	});
});

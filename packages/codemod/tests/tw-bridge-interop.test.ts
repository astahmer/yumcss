import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
	buildPandwindInteropArtifact,
	parsePandwindInteropArtifact,
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
import { createTw } from "pandwind/tw";
const __pandwindConfig = { variants: { hover: { join: ":" } }, conflicts: {}, compose: [] };
export const tw = createTw(__pandwindConfig);
`;

describe("Tailwind bridge interop artifact refresh", () => {
	test("preserves v1 token snapshots and rejects previous schemas", async () => {
		const project = mkdtempSync(join(import.meta.dirname, ".tw-bridge-interop-"));
		try {
			const cssEntry = join(project, "tailwind.css");
			const twFile = join(project, "tw.ts");
			const presetFile = join(project, "preset.mjs");
			const bridgeFile = join(project, "bridge.ts");
			const interopFile = join(project, "pandwind.interop.json");
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
			const retainedArtifact = buildPandwindInteropArtifact({
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
			const refreshed = parsePandwindInteropArtifact(JSON.parse(readFileSync(interopFile, "utf8")));
			expect(refreshed.tokens).toEqual(retainedArtifact.tokens);
			expect(readFileSync(bridgeFile, "utf8")).toContain('"#123456"');

			writeFileSync(interopFile, `${JSON.stringify({ schema: "pandwind.interop/99" })}\n`);
			await expect(generateTwBridge(options)).rejects.toThrow(
				"unsupported existing interop schema 'pandwind.interop/99'",
			);
			expect(JSON.parse(readFileSync(interopFile, "utf8"))).toEqual({
				schema: "pandwind.interop/99",
			});
		} finally {
			rmSync(project, { recursive: true, force: true });
		}
	});
});

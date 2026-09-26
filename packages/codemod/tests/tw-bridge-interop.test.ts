import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
	buildPandwindInteropArtifact,
	parsePandwindInteropArtifact,
	PANDWIND_INTEROP_V2_SCHEMA,
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
	test("preserves v3 token snapshots and upgrades v2 artifacts from the configured preset", async () => {
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

			writeFileSync(interopFile, `${JSON.stringify({ schema: PANDWIND_INTEROP_V2_SCHEMA })}\n`);
			await generateTwBridge(options);
			const upgraded = parsePandwindInteropArtifact(JSON.parse(readFileSync(interopFile, "utf8")));
			expect(upgraded.tokens).toMatchObject({
				state: "available",
				source: { kind: "configured-token-module", module: presetFile },
			});
			expect(JSON.stringify(upgraded.tokens.document)).toContain('"brand"');
			expect(JSON.stringify(upgraded.tokens.document)).toContain("#123456");
		} finally {
			rmSync(project, { recursive: true, force: true });
		}
	});
});

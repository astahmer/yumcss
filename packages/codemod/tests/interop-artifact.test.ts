import { describe, expect, test } from "vitest";
import {
	buildPandwindInteropArtifact,
	parsePandwindInteropArtifact,
} from "../src/tw/interop-artifact.ts";
import { parseDtcgTokenDocument } from "../src/swap/token-document.ts";

const types = `
type BgColorValue = "blue-500" | "red-500";
interface WindUtilities {
\t"bgColor"?: BgColorValue | true | Array<BgColorValue | true>;
\t"textColor"?: BgColorValue | true | Array<BgColorValue | true>;
}
`;

const tw = `
import { createTw } from "pandwind/tw";
const __pandwindConfig = {
\tvariants: { hover: { join: ":" } },
\tconflicts: { bg: { "blue-500": ["background-color"] } },
\tcompose: ["shadow"],
};
export const tw = createTw(__pandwindConfig);
`;

describe("pandwind interop artifact", () => {
	test("captures generated utility, variant, conflict, bridge and theme metadata", () => {
		const artifact = buildPandwindInteropArtifact({
			typesDts: types,
			twTs: tw,
			themeBlock:
				'@theme {\n\t--color-brand: #3182ce;\n}\n[data-theme="dark"] {\n\t--color-brand: #90cdf4;\n}',
			bridge: { "background-color": { "#3182ce": "bg-blue-500" } },
		});

		expect(artifact.schema).toBe("pandwind.interop/1");
		expect(artifact.utilities).toEqual([
			{ key: "bgColor", base: "bg", valueType: "BgColorValue" },
			{ key: "textColor", base: "text", valueType: "BgColorValue" },
		]);
		expect(artifact.valueTypes).toEqual({ BgColorValue: ["blue-500", "red-500"] });
		expect(artifact.tw.variants.hover).toEqual({ join: ":" });
		expect(artifact.tw.compose).toEqual(["shadow"]);
		expect(artifact.bridge["background-color"]!["#3182ce"]).toBe("bg-blue-500");
		expect(artifact.theme.variables["--color-brand"]).toBe("#3182ce");
		expect(artifact.theme.scopes).toEqual(['[data-theme="dark"]']);
		expect(artifact.tokens).toMatchObject({
			state: "unavailable",
			diagnostics: ["No codegen token module was supplied for this artifact."],
		});
	});

	test("validates and carries the generated token snapshot with source provenance", () => {
		const document = parseDtcgTokenDocument(
			JSON.stringify({
				colors: {
					brand: { $type: "color", $value: { colorSpace: "srgb", components: [0.1, 0.2, 0.3] } },
				},
			}),
		);
		const artifact = buildPandwindInteropArtifact({
			typesDts: types,
			twTs: tw,
			tokenDocument: document,
			tokenSource: "./tokens.ts",
		});
		const parsed = parsePandwindInteropArtifact(JSON.parse(JSON.stringify(artifact)));

		expect(parsed.tokens).toMatchObject({
			state: "available",
			source: {
				kind: "configured-token-module",
				module: "./tokens.ts",
				fingerprint: document.sourceFingerprint,
			},
			document: {
				root: {
					children: {
						colors: { children: { brand: { value: { kind: "object" } } } },
					},
				},
			},
		});
	});

	test("uses the root schema for tokens and rejects previous schema envelopes", () => {
		const artifact = buildPandwindInteropArtifact({ typesDts: types, twTs: tw });

		expect(artifact.tokens).not.toHaveProperty("schema");
		expect(() =>
			parsePandwindInteropArtifact({ ...artifact, schema: "pandwind.interop/3" }),
		).toThrow("invalid pandwind.interop/1 artifact");
		expect(() =>
			parsePandwindInteropArtifact({
				...artifact,
				tokens: { ...artifact.tokens, schema: "pandwind.interop.tokens/1" },
			}),
		).toThrow("invalid pandwind.interop/1 artifact");
	});
});

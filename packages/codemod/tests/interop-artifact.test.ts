import { describe, expect, test } from "vitest";
import { buildPandwindInteropArtifact } from "../src/tw/interop-artifact.ts";

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

		expect(artifact.schema).toBe("pandwind.interop/2");
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
	});
});

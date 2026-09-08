import { describe, expect, test } from "vitest";
import {
	TokenReferenceFormat,
	formatTokenPath,
	formatTokenReference,
	type TokenCatalogMatch,
} from "../src/swap/tokens.ts";

const blue: TokenCatalogMatch = {
	group: "colors",
	key: "$blue-500",
	authored: "$blue-500",
	ref: "blue.500",
	resolved: "#3182ce",
};

describe("token reference formats", () => {
	test("preserves an existing authored spelling", () => {
		expect(formatTokenReference(blue, TokenReferenceFormat.Preserve, "$blue-500")).toBe(
			"$blue-500",
		);
	});

	test("uses dot-delimited spelling for newly inferred references", () => {
		expect(formatTokenReference(blue, TokenReferenceFormat.Preserve)).toBe("blue.500");
		expect(formatTokenReference(blue, TokenReferenceFormat.DotDelimited, "$blue-500")).toBe(
			"blue.500",
		);
	});

	test("emits the Stitches-compatible dollar and hyphen spelling", () => {
		expect(formatTokenReference(blue, TokenReferenceFormat.Stitches)).toBe("$blue-500");
		expect(formatTokenPath("fg.muted", TokenReferenceFormat.Stitches)).toBe("$fg-muted");
	});
});

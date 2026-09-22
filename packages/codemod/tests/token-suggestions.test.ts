import { describe, expect, test } from "vitest";
import { TokenCatalog, tokenGroupsForProperty } from "../src/swap/tokens.ts";

const catalog = TokenCatalog.fromGroups({
	colors: {
		blue: "#3182ce",
		red: "#e11d48",
	},
	spacing: {
		4: "1rem",
		6: "1.5rem",
	},
});

describe("nearest token suggestions", () => {
	test("ranks a close color before a distant color", () => {
		const matches = catalog!.nearest(["colors"], "#3182cf", { maxDistance: 1 });
		expect(matches[0]).toMatchObject({ group: "colors", key: "blue" });
		expect(matches[0]!.distance).toBeLessThan(matches[1]!.distance);
	});

	test("supports property-aware scalar groups without rewriting", () => {
		expect(tokenGroupsForProperty("padding")).toEqual(["spacing"]);
		expect(catalog!.nearest(tokenGroupsForProperty("padding"), "1.49rem")[0]).toMatchObject({
			group: "spacing",
			key: "6",
		});
	});
});

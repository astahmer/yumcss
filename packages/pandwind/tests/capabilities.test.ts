import { describe, expect, test } from "vitest";
import { CSS_IN_JS_CAPABILITIES } from "../src/capabilities.ts";

describe("CSS-in-JS capability contract", () => {
	test("has unique feature identifiers", () => {
		const features = CSS_IN_JS_CAPABILITIES.map(({ feature }) => feature);
		expect(new Set(features).size).toBe(features.length);
	});

	test("uses only the documented capability statuses", () => {
		for (const capability of CSS_IN_JS_CAPABILITIES) {
			expect(["static", "runtime", "partial", "unsupported"]).toContain(capability.status);
			expect(capability.detail.length).toBeGreaterThan(20);
		}
	});

	test("makes the current boundary explicit", () => {
		const byFeature = new Map(
			CSS_IN_JS_CAPABILITIES.map((capability) => [capability.feature, capability]),
		);

		expect(byFeature.get("atomic-css")?.status).toBe("static");
		expect(byFeature.get("dynamic-values")?.status).toBe("runtime");
		expect(byFeature.get("ssr-hydration")?.status).toBe("partial");
		expect(byFeature.get("source-provenance")?.status).toBe("partial");
	});
});

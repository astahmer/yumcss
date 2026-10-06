import { describe, expect, test } from "vitest";
import { examplePreset } from "@yumcss/example-preset";
import {
	checkYumCSSLibCompatibility,
	createYumCSSLibArtifact,
	createYumCSSLibCompatibility,
	validateYumCSSLibArtifact,
} from "../src/vite/lib-artifact.ts";

const artifactInput = () => ({
	compatibility: createYumCSSLibCompatibility(examplePreset),
	sources: [
		{ path: "src/z.ts", hash: "z" },
		{ path: "src/a.ts", hash: "a" },
	],
	tokens: [{ declaration: ":root{--colors-blue-500:#3182ce}", priority: 2 }],
	web: "",
	atomic: [
		{ id: "z", css: ".z{color:red}", priority: 2 },
		{ id: "a", css: ".a{color:blue}", priority: 1 },
	],
	vars: [],
});

describe("YumCSS lib artifact contract", () => {
	test("sorts content and validates its deterministic hash", () => {
		const artifact = createYumCSSLibArtifact(artifactInput());

		expect(artifact.sources.map((source) => source.path)).toEqual(["src/a.ts", "src/z.ts"]);
		expect(artifact.rules.atomic.map((rule) => rule.id)).toEqual(["a", "z"]);
		expect(validateYumCSSLibArtifact(artifact)).toMatchObject({ valid: true });
		expect(
			createYumCSSLibArtifact({
				...artifactInput(),
				sources: artifactInput().sources.toReversed(),
			}),
		).toEqual(artifact);
	});

	test("rejects tampered content and incompatible consumers", () => {
		const artifact = createYumCSSLibArtifact(artifactInput());
		const tampered = {
			...artifact,
			rules: {
				...artifact.rules,
				atomic: [{ ...artifact.rules.atomic[0]!, css: ".a{color:green}" }],
			},
		};

		expect(validateYumCSSLibArtifact(tampered)).toMatchObject({
			valid: false,
			errors: ["artifact.hash does not match its content"],
		});
		expect(checkYumCSSLibCompatibility(artifact, examplePreset, { namespace: "other" })).toEqual({
			compatible: false,
			differences: ["namespace differs (artifact=pw, consumer=other)"],
		});
	});

	test("records and checks a named cascade layer", () => {
		const artifact = createYumCSSLibArtifact({
			...artifactInput(),
			compatibility: createYumCSSLibCompatibility(examplePreset, {
				cascade: { mode: "layers", layer: "app.utilities" },
			}),
		});

		expect(artifact.compatibility).toMatchObject({
			cascade: "layers",
			cascadeLayer: "app.utilities",
		});
		expect(
			checkYumCSSLibCompatibility(artifact, examplePreset, {
				cascade: { mode: "layers", layer: "app.utilities" },
			}),
		).toEqual({ compatible: true, differences: [] });
		expect(checkYumCSSLibCompatibility(artifact, examplePreset, { cascade: "layers" })).toEqual({
			compatible: false,
			differences: ["cascadeLayer differs (artifact=app.utilities, consumer=yumcss)"],
		});
	});
});

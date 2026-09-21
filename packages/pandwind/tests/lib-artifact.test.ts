import { describe, expect, test } from "vitest";
import { examplePreset } from "@pandwind/example-preset";
import {
	checkPandwindLibCompatibility,
	createPandwindLibArtifact,
	createPandwindLibCompatibility,
	validatePandwindLibArtifact,
} from "../src/vite/lib-artifact.ts";

const artifactInput = () => ({
	compatibility: createPandwindLibCompatibility(examplePreset),
	sources: [
		{ path: "src/z.ts", hash: "z" },
		{ path: "src/a.ts", hash: "a" },
	],
	tokens: [{ declaration: ":root{--colors-blue-500:#3182ce}", priority: 2 }],
	atomic: [
		{ id: "z", css: ".z{color:red}", priority: 2 },
		{ id: "a", css: ".a{color:blue}", priority: 1 },
	],
	vars: [],
});

describe("Pandwind lib artifact contract", () => {
	test("sorts content and validates its deterministic hash", () => {
		const artifact = createPandwindLibArtifact(artifactInput());

		expect(artifact.sources.map((source) => source.path)).toEqual(["src/a.ts", "src/z.ts"]);
		expect(artifact.rules.atomic.map((rule) => rule.id)).toEqual(["a", "z"]);
		expect(validatePandwindLibArtifact(artifact)).toMatchObject({ valid: true });
		expect(
			createPandwindLibArtifact({
				...artifactInput(),
				sources: artifactInput().sources.toReversed(),
			}),
		).toEqual(artifact);
	});

	test("rejects tampered content and incompatible consumers", () => {
		const artifact = createPandwindLibArtifact(artifactInput());
		const tampered = {
			...artifact,
			rules: {
				...artifact.rules,
				atomic: [{ ...artifact.rules.atomic[0]!, css: ".a{color:green}" }],
			},
		};

		expect(validatePandwindLibArtifact(tampered)).toMatchObject({
			valid: false,
			errors: ["artifact.hash does not match its content"],
		});
		expect(checkPandwindLibCompatibility(artifact, examplePreset, { namespace: "other" })).toEqual({
			compatible: false,
			differences: ["namespace differs (artifact=pw, consumer=other)"],
		});
	});

	test("records and checks a named cascade layer", () => {
		const artifact = createPandwindLibArtifact({
			...artifactInput(),
			compatibility: createPandwindLibCompatibility(examplePreset, {
				cascade: { mode: "layers", layer: "app.utilities" },
			}),
		});

		expect(artifact.compatibility).toMatchObject({
			cascade: "layers",
			cascadeLayer: "app.utilities",
		});
		expect(
			checkPandwindLibCompatibility(artifact, examplePreset, {
				cascade: { mode: "layers", layer: "app.utilities" },
			}),
		).toEqual({ compatible: true, differences: [] });
		expect(checkPandwindLibCompatibility(artifact, examplePreset, { cascade: "layers" })).toEqual({
			compatible: false,
			differences: ["cascadeLayer differs (artifact=app.utilities, consumer=pandwind)"],
		});
	});
});

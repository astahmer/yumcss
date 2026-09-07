import { describe, expect, test } from "vitest";
import { createPandwindProjectSupport } from "../src/swap/project-bootstrap.ts";
import { CodemodAdapterId } from "../src/swap/identifiers.ts";

describe("Pandwind project bootstrap", () => {
	test("does not bind a generated tw module when no Tailwind graph was emitted", async () => {
		const support = await createPandwindProjectSupport({
			root: "/project",
			sourceAdapter: CodemodAdapterId.Panda,
			outputDirectory: "pandwind",
			readFile: () => undefined,
			listFiles: () => [],
		});

		expect(support.files.map((file) => file.path)).not.toContain("pandwind/tw.ts");
		expect(support.bindings.twModule).toBeUndefined();
		expect(support.bindings.cssModule).toBe("pandwind/css.ts");
		expect(support.files.map((file) => file.path)).toContain("pandwind/dss.ts");
		expect(support.bindings.dssModule).toBe("pandwind/dss.ts");
		expect(support.files.find((file) => file.path === "pandwind/dss.ts")?.content).toContain(
			"createDesignCss(pandwindPreset)",
		);
	});

	test("keeps generated css bindings open to CSS properties", async () => {
		const support = await createPandwindProjectSupport({
			root: "/project",
			sourceAdapter: CodemodAdapterId.Panda,
			outputDirectory: "pandwind",
			readFile: () => undefined,
			listFiles: () => [],
		});

		const preset = support.files.find((file) => file.path === "pandwind/preset.ts")?.content;
		expect(preset).toContain(
			'config: {} as import("pandwind/preset").AnyCssConfig',
		);
		expect(preset).toContain('properties: { $all: true }');
	});
});

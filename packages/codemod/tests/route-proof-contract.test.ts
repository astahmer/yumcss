import { describe, expect, test } from "vitest";
import { CodemodAdapterId } from "../src/swap/index.ts";
import {
	createAdapterRouteSpec,
	createReverseRouteInput,
	expectActionableRoundTrip,
} from "./route-spec-support.ts";

const source = 'import { css } from "@emotion/css";\nexport const card = css({ color: "red" });';
const forwardRoute = createAdapterRouteSpec(CodemodAdapterId.Emotion, CodemodAdapterId.Pandwind);
const reverseRoute = createAdapterRouteSpec(CodemodAdapterId.Pandwind, CodemodAdapterId.Emotion);

describe("route proof contract", () => {
	test("keeps named-map child emission residuals instead of emitting an empty entry", () => {
		const input =
			'import { StyleSheet } from "aphrodite";\nexport const styles = StyleSheet.create({ fonts: { fontFamily: [{ fontFamily: "Inter", src: "url(inter.woff2)" }] } });';
		const route = createAdapterRouteSpec(CodemodAdapterId.Aphrodite, CodemodAdapterId.Tokenami);
		const result = route.run({ source: input, file: "styles.ts" });
		expect(result.converted).toBe(0);
		expect(result.residuals.some((residual) => residual.kind === "capability")).toBe(true);
		expect(result.code).toContain('fontFamily: [{ fontFamily: "Inter", src: "url(inter.woff2)" }]');
		expect(result.code).not.toContain('"fonts":  }');
	});

	test("keeps the target-owned css binding when source and target share a module", async () => {
		const input =
			'import { css } from "styled-system/css";\nexport const card = css({ color: "red" });';
		const forward = createAdapterRouteSpec(CodemodAdapterId.Panda, CodemodAdapterId.Bamboo).run({
			source: input,
			file: "styles.ts",
		});
		expect(forward.converted).toBe(1);
		expect(forward.code).not.toContain("sourceCss");
		const reverse = await createAdapterRouteSpec(CodemodAdapterId.Bamboo, CodemodAdapterId.Panda)
			.runAsync(createReverseRouteInput({ forward, input: { source: input, file: "styles.ts" } }));
		expect(reverse.converted).toBe(1);
		expect(reverse.code).toContain('color: "red"');
	});

	test("rejects a changed forward conversion followed by an inert reverse migration", () => {
		const forward = forwardRoute.run({ source, file: "src/card.ts" });
		const inert = reverseRoute.run({ source: 'export const card = "plain";', file: "src/card.ts" });
		expect(forward.changed).toBe(true);
		expect(inert.converted).toBe(0);
		expect(() => expectActionableRoundTrip(forward, inert)).toThrow();
	});

	test("retains project metadata and consumer changes without modifying the input project", () => {
		const forward = forwardRoute.run({ source, file: "src/card.ts" });
		const consumer = 'export { card } from "./card";';
		const project = {
			root: "/virtual/proof",
			files: { "/virtual/proof/src/index.ts": consumer },
			loaderCalls: { packages: [], files: [] },
		};
		const input = createReverseRouteInput({
			forward,
			input: { source, file: "src/card.ts", project },
		});
		expect(input.project?.files["/virtual/proof/src/card.ts"]).toBe(forward.code);
		expect(input.project?.files["/virtual/proof/src/index.ts"]).toBe(consumer);
		expect(Object.keys(project.files)).toEqual(["/virtual/proof/src/index.ts"]);
		const reverse = reverseRoute.run(input);
		expect(reverse.converted).toBe(1);
		expect(reverse.code).toContain('color: "red"');
	});

	test("includes generated stylesheet files in the reverse project", () => {
		const route = createAdapterRouteSpec(CodemodAdapterId.Pandwind, CodemodAdapterId.AuthoredCss);
		const input = {
			source: 'import { css } from "pandwind/css";\nexport const card = css.class({ color: "red" });',
			file: "src/card.ts",
		};
		const forward = route.run(input);
		expect(forward.generatedFiles.length).toBeGreaterThan(0);
		const reverseInput = createReverseRouteInput({ forward, input });
		for (const artifact of forward.generatedFiles)
			expect(reverseInput.project?.files[`${reverseInput.project.root}/${artifact.path}`]).toBe(
				artifact.content,
			);
	});
});

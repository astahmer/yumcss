import { describe, expect, test } from "vitest";
import { CodemodAdapterId } from "../src/swap/index.ts";
import {
	createAdapterRouteSpec,
	createReverseRouteInput,
	expectActionableRoundTrip,
	expectReverseSemanticContinuity,
} from "./route-spec-support.ts";

const source = 'import { css } from "@emotion/css";\nexport const card = css({ color: "red" });';
const forwardRoute = createAdapterRouteSpec(CodemodAdapterId.Emotion, CodemodAdapterId.Pandwind);
const reverseRoute = createAdapterRouteSpec(CodemodAdapterId.Pandwind, CodemodAdapterId.Emotion);

describe("route proof contract", () => {
	test("rejects a reverse parser that drops a declaration or named rule", () => {
		const input =
			'import { css } from "@emotion/css"; export const card = css({ color: "red", padding: "16px" });';
		const forward = forwardRoute.run({ source: input, file: "styles.ts" });
		const reverse = reverseRoute.run({ source: forward.code, file: "styles.ts" });
		expectReverseSemanticContinuity(forward, reverse);
		const missingDeclaration = reverseRoute.run({
			source: forward.code.replace(', padding: "16px"', ""),
			file: "styles.ts",
		});
		expect(() => expectReverseSemanticContinuity(forward, missingDeclaration)).toThrow();
		const group = createAdapterRouteSpec(CodemodAdapterId.Pandwind, CodemodAdapterId.Emotion).run({
			source:
				'import { css } from "pandwind/css"; export const styles = css.group({ card: { color: "red" }, muted: { opacity: 0.5 } });',
			file: "styles.ts",
		});
		const lostRule = forwardRoute.run({
			source:
				'import { css } from "@emotion/css"; export const styles = { card: css({ color: "red" }) };',
			file: "styles.ts",
		});
		expect(() => expectReverseSemanticContinuity(group, lostRule)).toThrow();
	});

	test.each([
		["condition", "&:hover{color:red}", "&:focus{color:red}"],
		["priority", "&{color:red!important}", "&{color:red}"],
	])("rejects lost %s semantics", (_label, expected, actual) => {
		const forward = forwardRoute.run({ source, file: "styles.ts" });
		const reverse = reverseRoute.run({ source: forward.code, file: "styles.ts" });
		expect(() =>
			expectReverseSemanticContinuity(
				{
					...forward,
					validations: forward.validations.map((validation) => ({
						...validation,
						canonicalTarget: expected,
					})),
				},
				{
					...reverse,
					validations: reverse.validations.map((validation) => ({
						...validation,
						canonicalSource: actual,
					})),
				},
			),
		).toThrow();
	});

	test("Vanilla Extract sidecars place hover styles in the official selectors carrier", () => {
		const result = createAdapterRouteSpec(
			CodemodAdapterId.StyledComponents,
			CodemodAdapterId.VanillaExtract,
		).run({
			source:
				'import styled from "styled-components"; export const Card = styled.button({ color: "red", "&:hover": { color: "blue" } }); export const App = () => <Card />;',
			file: "src/Card.tsx",
			project: { root: "/virtual/proof", files: {}, loaderCalls: { packages: [], files: [] } },
			semantic: { source: { framework: "react" } },
		});
		expect(result.converted).toBe(1);
		expect(result.residuals).toEqual([]);
		expect(result.generatedFiles[0]?.content).toContain('selectors: { "&:hover":');
		expect(result.generatedFiles[0]?.content).toMatchInlineSnapshot(`
			"import { style } from "@vanilla-extract/css";
			export const __pandwindCardStyles = style({ color: "red", selectors: { "&:hover": { color: "blue" } } });
			"
		`);
	});

	test("reverse overlays retain renamed entrypoints and reject stale or conflicting files", () => {
		const forward = forwardRoute.run({ source, file: "src/card.ts" });
		const renamed = {
			...forward,
			outputExtension: ".jsx",
			generatedFiles: [{ path: "src/card.css", content: ".card{color:red}" }],
		};
		const input = {
			source,
			file: "src/card.ts",
			project: {
				root: "/virtual/proof",
				files: { "/virtual/proof/src/card.ts": source },
				loaderCalls: { packages: [], files: [] },
			},
		};
		const overlay = createReverseRouteInput({ forward: renamed, input });
		expect(overlay.file).toBe("src/card.jsx");
		expect(overlay.project?.files["/virtual/proof/src/card.ts"]).toBeUndefined();
		expect(overlay.project?.files["/virtual/proof/src/card.jsx"]).toBe(forward.code);
		expect(() =>
			createReverseRouteInput({
				forward: {
					...renamed,
					generatedFiles: [
						...renamed.generatedFiles,
						{ path: "src/card.css", content: ".card{color:blue}" },
					],
				},
				input,
			}),
		).toThrow();
		expect(() =>
			createReverseRouteInput({
				forward: {
					...forward,
					fileChanges: [{ path: "src/card.ts", expectedContent: "stale", content: "new" }],
				},
				input,
			}),
		).toThrow();
	});
	test("keeps a Pandwind class binding used by a JSX host when emitting Emotion", () => {
		const input =
			'import { createUnsafeCss } from "pandwind/unsafe/css"; const css = createUnsafeCss(); const card = css.class({ color: "red", padding: "16px" }); export const App = () => <button className={card}>Proof</button>;';
		const result = reverseRoute.run({ source: input, file: "src/App.tsx" });
		expect(result.converted).toBe(1);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('import { css } from "@emotion/css"');
		expect(result.code).toContain("className={card}");
		expect(result.code).toContain('padding: "16px"');
		expect(result.code).toMatchInlineSnapshot(`
			"import { css } from "@emotion/css";
			 const css = createUnsafeCss(); const card = css({ color: "red", padding: "16px" }); export const App = () => <button className={card}>Proof</button>;"
		`);
	});
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
		const reverse = await createAdapterRouteSpec(
			CodemodAdapterId.Bamboo,
			CodemodAdapterId.Panda,
		).runAsync(createReverseRouteInput({ forward, input: { source: input, file: "styles.ts" } }));
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
			source:
				'import { css } from "pandwind/css";\nexport const card = css.class({ color: "red" });',
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

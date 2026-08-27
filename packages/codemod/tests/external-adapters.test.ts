import { describe, expect, test } from "vitest";
import {
	ADAPTER_CONTRACT_SCHEMA,
	EXTERNAL_ADAPTERS,
	getExternalAdapter,
	runAdapterMigration,
} from "../src/swap/index.ts";

describe("CSS-in-JS adapter contract v2", () => {
	test("registers detection, config, parse, emit, dependencies, and validation for every adapter", () => {
		const samples: Record<string, string> = {
			pandwind: "css.class({ color: 'red' })",
			emotion: "import '@emotion/css'; css({ color: 'red' })",
			"styled-components": "import styled from 'styled-components'; styled.div({ color: 'red' })",
			"vanilla-extract": "import { style } from '@vanilla-extract/css'; style({ color: 'red' })",
			stitches: "import { createStitches } from '@stitches/react'; createStitches()",
			linaria: "import { css } from '@linaria/core'; css`color: red;`",
			jss: "import { createUseStyles } from 'react-jss'; createUseStyles({ button: { color: 'red' } })",
			fela: "import { createRenderer } from 'fela'; renderer.renderRule({ color: 'red' })",
			goober: "import { css } from 'goober'; css({ color: 'red' })",
			aphrodite:
				"import { StyleSheet } from 'aphrodite'; StyleSheet.create({ button: { color: 'red' } })",
			style9: "import style9 from 'style9'; style9.create({ button: { color: 'red' } })",
			treat: "import { style } from './styles.treat'; style({ color: 'red' })",
			compiled: "import { css } from '@compiled/react'; css({ color: 'red' })",
			stylex: "import stylex from '@stylexjs/stylex'; stylex.create({ card: { color: 'red' } })",
			"solid-styled":
				"import { styled } from 'solid-styled-components'; styled.div({ color: 'red' })",
			"vue-styled": "import styled from 'vue-styled-components'; styled.div({ color: 'red' })",
			"react-native":
				"import { StyleSheet } from 'react-native'; StyleSheet.create({ button: { color: 'red' } })",
		};
		for (const [id, adapter] of Object.entries(EXTERNAL_ADAPTERS)) {
			expect(adapter.schema).toBe(ADAPTER_CONTRACT_SCHEMA);
			expect(adapter.version).toBe("2");
			expect(adapter.sourceModules.length).toBeGreaterThan(0);
			expect(adapter.dependencies).toBeDefined();
			expect(adapter.detect({ file: "styles.ts", source: samples[id]! })).toMatchObject({
				matched: true,
			});
			const config = adapter.loadConfig({
				file: "styles.ts",
				source: samples[id]!,
				root: "/project",
			});
			expect(config.adapter).toBe(id);
		}
	});

	test("migrates Linaria static CSS templates and preserves styled subjects", () => {
		const css = runAdapterMigration(
			'import { css } from "@linaria/core";\nconst card = css`color: red; background-color: blue;`;',
			{ from: "linaria", to: "emotion", file: "Card.tsx", mode: "safe" },
		);
		expect(css.converted).toBe(1);
		expect(css.code).toContain('css({ color: "red", backgroundColor: "blue" })');
		expect(css.code).not.toContain("@linaria/core");

		const component = runAdapterMigration(
			'import { styled } from "@linaria/react";\nconst Card = styled.button`color: red;`;',
			{ from: "linaria", to: "styled-components", file: "Card.tsx", mode: "safe" },
		);
		expect(component.converted).toBe(1);
		expect(component.code).toContain("styled.button({");
	});

	test("registers JSS style maps and keeps their named-rule boundary explicit", () => {
		const adapter = getExternalAdapter("jss")!;
		const parsed = adapter.parse("createUseStyles({ button: { color: 'red' } })", {
			file: "styles.ts",
			source: "",
			config: { adapter: "jss", files: [], values: {} },
		});
		expect(parsed.matches).toHaveLength(1);
		expect(parsed.matches[0]?.program.declarations[0]?.conditions[0]?.name).toBe("button");
		const emitted = adapter.emit(parsed.matches[0]!.program, {
			file: "styles.ts",
			config: { adapter: "jss", files: [], values: {} },
			mode: "safe",
			index: 0,
		});
		expect(emitted.text).toContain("createUseStyles({");

		const result = runAdapterMigration(
			'import { createUseStyles } from "react-jss";\nconst useStyles = createUseStyles({ button: { color: "red" } });',
			{ from: "jss", to: "pandwind", file: "styles.ts", mode: "safe" },
		);
		expect(result.skipped).toBe(1);
		expect(result.residuals.some((residual) => residual.kind === "capability")).toBe(true);
	});

	test("migrates an Emotion object into styled-components with selectors and dynamics", () => {
		const source = `import { css } from "@emotion/css";\nconst card = css({ color: theme.foreground, "&:hover": { color: "red" } });`;
		const result = runAdapterMigration(source, {
			from: "emotion",
			to: "styled-components",
			file: "Card.tsx",
			mode: "safe",
		});

		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.code).not.toContain("@emotion/css");
		expect(result.code).toContain('import styled from "styled-components";');
		expect(result.code).toContain("styled.div({");
		expect(result.code).toContain("theme.foreground");
		expect(result.code).toContain('"&:hover"');
		expect(result.reports[0]?.convertible).toBe(true);
		expect(result.validations[0]?.valid).toBe(true);
		expect(result.validations[0]?.lossiness).toBe("lossless");
	});

	test("preserves styled subjects and validates authored keyframe names", () => {
		const styled = runAdapterMigration(
			`import styled, { keyframes } from "styled-components";\nconst Card = styled(BaseButton)({ color: "red" });\nconst fade = keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });`,
			{ from: "styled-components", to: "styled-components", file: "Card.tsx", mode: "safe" },
		);
		expect(styled.code).toContain("styled(BaseButton)({");
		expect(styled.validations.every((validation) => validation.valid)).toBe(true);

		const keyframes = runAdapterMigration(
			`import { keyframes } from "@emotion/css";\nconst fade = keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });`,
			{ from: "emotion", to: "styled-components", file: "animation.ts", mode: "safe" },
		);
		expect(keyframes.validations[0]?.valid).toBe(true);
		expect(keyframes.code).toContain("keyframes({");
	});

	test("emits a self-contained pandwind runtime binding and consolidates imports", () => {
		const result = runAdapterMigration(
			`import { css, keyframes } from "@emotion/css";\nconst card = css({ color: "red" });\nconst fade = keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });`,
			{ from: "emotion", to: "pandwind", file: "styles.ts", mode: "safe" },
		);
		expect(result.code).not.toContain("@emotion/css");
		expect(result.code).toContain('import { createCss } from "pandwind/css";');
		expect(result.code).toContain("const css = createCss();");
	});

	test("cleans source imports when the module shares a line with migrated code", () => {
		const result = runAdapterMigration(
			`import { css } from "@emotion/css"; const card = css({ color: "red" });`,
			{ from: "emotion", to: "styled-components", file: "styles.ts", mode: "safe" },
		);
		expect(result.code).not.toContain("@emotion/css");
		expect(result.code).toContain('import styled from "styled-components";');
	});

	test("does not lower styled components into class factories in safe mode", () => {
		const result = runAdapterMigration(
			`import styled from "styled-components"; const Card = styled.button({ color: "red" });`,
			{ from: "styled-components", to: "emotion", file: "Card.tsx", mode: "safe" },
		);
		expect(result.converted).toBe(0);
		expect(result.skipped).toBe(1);
		expect(result.code).toContain("styled.button");
		expect(result.residuals).toContainEqual(
			expect.objectContaining({ kind: "capability", hint: expect.stringContaining("components") }),
		);
	});

	test("loads package/config evidence and migrates static tagged templates", () => {
		const adapter = getExternalAdapter("emotion")!;
		const config = adapter.loadConfig({
			file: "Card.tsx",
			root: "/project",
			source: "",
			readFile: (file) =>
				file.endsWith("package.json")
					? JSON.stringify({ dependencies: { "@emotion/css": "1.0.0" } })
					: undefined,
		});
		expect(config.files).toEqual(["/project/package.json"]);
		expect(config.values.packageJson).toMatchObject({ dependencies: { "@emotion/css": "1.0.0" } });

		const result = runAdapterMigration(
			'import "@emotion/css";\nconst card = css`color: red; background-color: blue;`;',
			{ from: "emotion", to: "pandwind", file: "Card.tsx", mode: "safe" },
		);
		expect(result.converted).toBe(1);
		expect(result.code).toContain('css.class({ color: "red", backgroundColor: "blue" })');
	});

	test("uses the default project reader and reports unsupported rule kinds", () => {
		const config = getExternalAdapter("emotion")!.loadConfig({
			file: "Card.tsx",
			root: process.cwd(),
			source: "",
		});
		expect(config.files).toContain(`${process.cwd()}/package.json`);

		const result = runAdapterMigration(
			'import { fontFace } from "@vanilla-extract/css";\nfontFace({ fontFamily: "Inter" });',
			{ from: "vanilla-extract", to: "emotion", file: "fonts.css.ts", mode: "safe" },
		);
		expect(result.skipped).toBe(1);
		expect(result.residuals.some((residual) => residual.kind === "capability")).toBe(true);
	});

	test("keeps interpolated tagged templates as runtime residuals in safe mode", () => {
		const result = runAdapterMigration("const Card = styled.div`color: ${theme.foreground};`;", {
			from: "styled-components",
			to: "pandwind",
			file: "Card.tsx",
			mode: "safe",
		});
		expect(result.skipped).toBe(1);
		expect(result.residuals.some((residual) => residual.kind === "dynamic")).toBe(true);
	});

	test("does not parse adapter-looking text inside comments or strings", () => {
		const source = [
			`const example = "css({ color: 'red' })";`,
			`// styled.div({ color: "red" })`,
			`const card = css({ color: "red" });`,
		].join("\n");
		const parsed = getExternalAdapter("emotion")!.parse(source, {
			file: "Card.tsx",
			source,
			config: { adapter: "emotion", files: [], values: {} },
		});
		expect(parsed.matches).toHaveLength(1);
		expect(parsed.matches[0]?.sourceText).toContain(`css({ color: "red" })`);
	});

	test("keeps vanilla-extract dynamic values as explicit residuals in safe mode", () => {
		const source = `import { style } from "@vanilla-extract/css";\nconst card = style({ color: theme.foreground });`;
		const result = runAdapterMigration(source, {
			from: "vanilla-extract",
			to: "vanilla-extract",
			file: "Card.css.ts",
		});

		expect(result.converted).toBe(0);
		expect(result.skipped).toBe(1);
		expect(result.residuals[0]?.kind).toBe("capability");
		expect(result.code).toContain("pandwind:migrate-skip");
	});

	test("keeps JSS binding-based runtime application intact in safe mode", () => {
		const source = [
			'import jss from "jss";',
			"const styles = { button: { color: 'red' } };",
			"const sheet = jss.createStyleSheet(styles);",
			"sheet.getRule('button').applyTo(button);",
		].join("\n");
		const result = runAdapterMigration(source, {
			from: "jss",
			to: "pandwind",
			file: "styles.js",
			mode: "safe",
		});
		expect(result.converted).toBe(0);
		expect(result.skipped).toBe(1);
		expect(result.residuals[0]).toMatchObject({ kind: "runtime-context" });
		expect(result.code).toContain('import jss from "jss";');
		expect(result.code).toContain("jss.createStyleSheet(styles)");
	});

	test("exposes a direct parser/emitter path for Stitches and keyframes", () => {
		const adapter = getExternalAdapter("stitches")!;
		const parsed = adapter.parse(
			`const fade = keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });`,
			{
				file: "animation.ts",
				source: "",
				config: { adapter: "stitches", files: [], values: {} },
			},
		);
		const match = parsed.matches[0]!;
		expect(match.program.rules[0]?.kind).toBe("keyframes");
		const emitted = adapter.emit(match.program, {
			file: "animation.ts",
			config: { adapter: "stitches", files: [], values: {} },
			mode: "safe",
			index: 0,
		});
		expect(emitted.text).toContain("keyframes(");
		expect(emitted.residuals).toEqual([]);
	});

	test("lifts global and font-face APIs into rule-level nodes", () => {
		const stitches = getExternalAdapter("stitches")!;
		const global = stitches.parse(
			`globalCss({ body: { margin: 0 }, "button:hover": { color: "red" } });`,
			{ file: "global.ts", source: "", config: { adapter: "stitches", files: [], values: {} } },
		);
		expect(global.matches[0]?.program.rules.map((rule) => rule.kind)).toEqual(["global", "global"]);
		expect(global.matches[0]?.program.rules[1]?.selector).toBe("button:hover");

		const vanilla = getExternalAdapter("vanilla-extract")!;
		const font = vanilla.parse(
			`const face = fontFace({ fontFamily: "Inter", src: "url(inter.woff2)" });`,
			{
				file: "fonts.css.ts",
				source: "",
				config: { adapter: "vanilla-extract", files: [], values: {} },
			},
		);
		expect(font.matches[0]?.program.rules[0]?.kind).toBe("font-face");
	});

	test("unwraps vanilla-extract selectors containers into selector conditions", () => {
		const vanilla = getExternalAdapter("vanilla-extract")!;
		const parsed = vanilla.parse(
			`style({ color: "red", selectors: { "&:hover": { color: "blue" } } });`,
			{
				file: "card.css.ts",
				source: "",
				config: { adapter: "vanilla-extract", files: [], values: {} },
			},
		);
		expect(parsed.matches[0]?.program.residuals).toEqual([]);
		expect(parsed.matches[0]?.program.declarations[1]?.conditions[0]).toMatchObject({
			kind: "selector",
			name: "&:hover",
		});
	});

	test("round-trips an ordered multi-selector global program across adapters", () => {
		for (const target of ["emotion", "styled-components", "vanilla-extract", "stitches"] as const) {
			const result = runAdapterMigration(
				`import { globalCss } from "@stitches/react";\n` +
					`globalCss({ body: { margin: 0 }, button: { color: "red" } });`,
				{ from: "stitches", to: target, file: "global.ts", mode: "safe" },
			);
			expect(result.converted).toBe(1);
			expect(result.skipped).toBe(0);
			expect(result.residuals).toEqual([]);
			expect(result.code).toContain("body");
			expect(result.code).toContain("button");
		}
	});

	test("matches complete tagged templates with nested expressions and preserves nested rules", () => {
		const adapter = getExternalAdapter("solid-styled")!;
		const source =
			'const Card = styled("div")<{ border: number }>`\n' +
			"  color: red;\n" +
			'  border: ${({ border = 1, color = "gainsboro" }): string => `${border}px solid ${color}`};\n' +
			"  &:hover { color: blue; }\n" +
			"`;";
		const parsed = adapter.parse(source, {
			file: "Card.tsx",
			source,
			config: { adapter: "solid-styled", files: [], values: {} },
		});
		expect(parsed.matches).toHaveLength(1);
		expect(parsed.matches[0]?.program.rules[0]?.children).toHaveLength(1);
		expect(parsed.residuals.some((residual) => residual.kind === "dynamic")).toBe(true);
		expect(parsed.residuals.some((residual) => residual.kind === "parse")).toBe(false);
	});
});

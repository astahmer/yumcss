import { describe, expect, test } from "vitest";
import {
	ADAPTER_CONTRACT_SCHEMA,
	CodemodStyleIdentity,
	createBuiltinCodemodCatalog,
	getCodemodAdapter,
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
			bamboo: "import { css } from 'styled-system/css'; css({ color: 'red' })",
			"next-yak": "import { css } from 'next-yak'; css`color: red;`",
			"chakra-ui": "import { Box } from '@chakra-ui/react'; <Box bg='tomato' />",
			mui: "import { Box } from '@mui/material'; <Box sx={{ color: 'red' }} />",
			mantine: "import { Box } from '@mantine/core'; <Box c='red' />",
		};
		for (const adapter of createBuiltinCodemodCatalog().adapters) {
			const id = adapter.id;
			expect(adapter.schema).toBe(ADAPTER_CONTRACT_SCHEMA);
			expect(adapter.version).toBe("2");
			expect(adapter.sourceModules).toBeDefined();
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

	test("migrates Bamboo object styles with conditions", () => {
		const result = runAdapterMigration(
			'import { css } from "styled-system/css";\nconst button = css({ color: "red", "&:hover": { color: "blue" }, "@media (min-width: 40rem)": { color: "green" } });',
			{ from: "bamboo", to: "emotion", file: "Button.tsx", mode: "safe" },
		);
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('import { css } from "@emotion/css";');
		expect(result.code).toContain('"&:hover"');
		expect(result.code).toContain('"@media (min-width: 40rem)"');
	});

	test("migrates Next-yak css and styled template lanes", () => {
		const css = runAdapterMigration(
			'import { css } from "next-yak";\nconst card = css`color: red; &:hover { color: blue; }`;',
			{ from: "next-yak", to: "emotion", file: "Card.tsx", mode: "safe" },
		);
		expect(css.converted).toBe(1);
		expect(css.skipped).toBe(0);
		expect(css.code).toContain('css({ color: "red"');
		expect(css.code).toContain('"&:hover"');

		const component = runAdapterMigration(
			'import { styled } from "next-yak";\nconst Card = styled.button`color: red;`;',
			{ from: "next-yak", to: "styled-components", file: "Card.tsx", mode: "safe" },
		);
		expect(component.converted).toBe(1);
		expect(component.skipped).toBe(0);
		expect(component.code).toContain("styled.button({");
	});

	test("preserves nested media conditions in styled-components templates", () => {
		const result = runAdapterMigration(
			'import styled, { css } from "styled-components";\n' +
				"const Card = styled.div`display: block; ${css`color: red;`} @media (max-width: 40em) { display: none; &:hover { color: blue; } }`;",
			{ from: "styled-components", to: "pandwind", file: "Card.tsx", mode: "safe" },
		);
		expect(result.converted).toBe(2);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('"@media (max-width: 40em)"');
		expect(result.code).toContain('"&:hover"');
		expect(result.code).toContain('"@media (max-width: 40em)": { display: "none"');
	});

	test("inlines named static CSS fragments before target emission", () => {
		const result = runAdapterMigration(
			'import styled, { css } from "styled-components";\n' +
				"const columnMixin = css`\n  width: 50%;\n  max-width: 50%;\n  ${phone(css`width: 100%;`)};\n`;\n" +
				"const Code = styled.code`\n  ${columnMixin};\n`;",
			{ from: "styled-components", to: "pandwind", file: "Code.tsx", mode: "safe" },
		);
		expect(result.converted).toBe(3);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain(
			'const Code = (() => { const style = css.class({ width: "50%", maxWidth: "50%"',
		);
		expect(result.code).toContain('"@media (max-width: 40.625em)"');
		expect(result.code).not.toContain("String((typeof (columnMixin)");
	});

	test("preserves static styled bindings used as JSX components", () => {
		const result = runAdapterMigration(
			'import styled from "styled-components";\nconst Code = styled.code`width: 50%;`;\nexport const View = () => <Code>example</Code>;',
			{ from: "styled-components", to: "pandwind", file: "View.tsx", mode: "safe" },
		);
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("const Code = (() =>");
		expect(result.code).toContain('css.class({ width: "50%" })');
	});

	test("resolves imported static fragments through the parse file port", () => {
		const result = runAdapterMigration(
			'import styled, { css } from "styled-components";\n' +
				'import { monochrome } from "./mixins";\n' +
				"const Logo = styled.span`\n  ${monochrome};\n`;\n" +
				"export const App = () => <Logo />;",
			{
				from: "styled-components",
				to: "pandwind",
				file: "components/Logo.tsx",
				root: "/project",
				mode: "safe",
				readFile: (file) =>
					file === "/project/components/mixins.ts"
						? "export const monochrome = css`filter: grayscale(1);`;"
						: undefined,
			},
		);
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('filter: "grayscale(1)"');
	});

	test("keeps opaque styled mixins in an explicit host runtime fallback", () => {
		const result = runAdapterMigration(
			'import { LiveEditor } from "react-live-runner";\n' +
				'import styled from "styled-components";\n' +
				'import { editorMixin } from "./codeMixins";\n' +
				"const Editor = styled(LiveEditor)`\\n  ${editorMixin};\\n  height: 24rem;\\n  width: 100%;\\n`;",
			{ from: "styled-components", to: "pandwind", file: "Editor.tsx", mode: "safe" },
		);
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("createRuntimeCss");
		expect(result.code).toContain("height: 24rem");
		expect(result.code).not.toContain("css.class({  })");
	});

	test("reports Next-yak runtime interpolations instead of dropping them", () => {
		const result = runAdapterMigration(
			'import { styled } from "next-yak";\nconst Card = styled.button`color: ${({ theme }) => theme.color};`;',
			{ from: "next-yak", to: "emotion", file: "Card.tsx", mode: "safe" },
		);
		expect(result.converted).toBe(0);
		expect(result.skipped).toBe(1);
		expect(result.residuals.some((residual) => residual.kind === "dynamic")).toBe(true);
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

	test("keeps StyleX ancestor conditions attached to the styled element", () => {
		const result = runAdapterMigration(
			'import * as stylex from "@stylexjs/stylex";\n' +
				"const styles = stylex.create({ code: { paddingBlock: { default: 3, [stylex.when.ancestor(':where(pre)')]: 8 } } });",
			{ from: "stylex", to: "pandwind", file: "mdx.tsx", mode: "safe" },
		);

		expect(result.converted).toBe(1);
		expect(result.residuals).toEqual([]);
		expect(result.validations[0]?.valid).toBe(true);
		expect(result.code).toContain('"&:where(.pw-default-marker:where(pre) *)"');
	});

	test("preserves styled component subjects when targeting Emotion", () => {
		const result = runAdapterMigration(
			'import styled from "styled-components";\nexport default styled.div({ color: "red" });',
			{ from: "styled-components", to: "emotion", file: "View.js", mode: "safe" },
		);
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('import styled from "@emotion/styled";');
		expect(result.code).toContain('styled.div({ color: "red" })');
		expect(result.code).not.toContain('from "styled-components"');
	});

	test("removes an unused styled import from TSX with JSX text references", () => {
		const result = runAdapterMigration(
			'import { Link as LinkIcon } from "@styled-icons/material";\n' +
				'import styled from "styled-components";\n' +
				"export const Card = styled.div`color: red;`;\n" +
				"export const Copy = () => <p>styled-components keeps this text</p>;\n",
			{ from: "styled-components", to: "pandwind", file: "Card.tsx", mode: "safe" },
		);
		expect(result.residuals).toEqual([]);
		expect(result.code).not.toContain('from "styled-components"');
		expect(result.code).toContain("styled-components keeps this text");
	});

	test("scopes identical component bindings by source file", () => {
		const migrate = (file: string) =>
			runAdapterMigration(
				'import styled from "styled-components";\nexport const Wrapper = styled.div`display: flex;`;',
				{ from: "styled-components", to: "pandwind", file, mode: "safe" },
			);
		const first = migrate("components/First.tsx");
		const second = migrate("components/Second.tsx");
		expect(first.residuals).toEqual([]);
		expect(second.residuals).toEqual([]);
		expect(first.code).toContain('css.class({ display: "flex" })');
		expect(second.code).toContain('css.class({ display: "flex" })');
		expect(first.code).not.toContain("createRuntimeCss");
		expect(second.code).not.toContain("createRuntimeCss");
	});

	test("wraps a standalone styled intrinsic default export for React", () => {
		const result = runAdapterMigration(
			'import styled from "styled-components";\nexport default styled.div({ color: "red" });',
			{
				from: "styled-components",
				to: "pandwind",
				file: "View.js",
				mode: "safe",
				semantic: { source: { file: "View.js", framework: "react" } },
			},
		);
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("__pandwindStandaloneComponent");
		expect(result.code).toContain("<div {...props}");
		expect(result.code).toContain("className={cx(__pandwindStandaloneClass, props.className)}");
		expect(result.code).toContain('import { createCx } from "pandwind/cx";');
		expect(result.code).not.toContain('from "styled-components"');
	});

	test("wraps named styled subjects when no local JSX use can be rewritten", () => {
		const result = runAdapterMigration(
			'import styled from "styled-components";\nexport const Card = styled.div`color: ${theme.foreground};`;',
			{
				from: "styled-components",
				to: "pandwind",
				file: "Card.tsx",
				mode: "safe",
			},
		);
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("export const Card = (() => {");
		expect(result.code).toContain("css.vars({ color: theme.foreground })");
		expect(result.code).toContain("theme.foreground");
		expect(result.code).not.toContain("createRuntimeCss");
		expect(result.code).not.toContain('from "styled-components"');
	});

	test("resolves theme-function bindings before dynamic style registration", () => {
		const result = runAdapterMigration(
			'import { ThemeProvider } from "styled-components";\n' +
				'import theme from "styled-theming";\n' +
				'const color = theme("mode", { light: "white", dark: "black" });\n' +
				"const Box = styled.div`color: ${color};`;",
			{
				from: "styled-components",
				to: "pandwind",
				file: "Theme.tsx",
				mode: "safe",
				semantic: { source: { file: "Theme.tsx", framework: "react" } },
			},
		);
		const themeAssignment = result.code.indexOf("usePandwindTheme()");
		const registration = result.code.indexOf("css.vars", result.code.indexOf("const component"));
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('import { usePandwindTheme } from "pandwind/theme";');
		expect(themeAssignment).toBeGreaterThan(-1);
		expect(themeAssignment).toBeLessThan(registration);
	});

	test("emits global and keyframe tagged templates as semantic runtime rules", () => {
		const result = runAdapterMigration(
			'import { createGlobalStyle, keyframes } from "styled-components";\n' +
				"const Global = createGlobalStyle`body { color: red; }`;\n" +
				"const pulse = keyframes`from { opacity: 0; } to { opacity: 1; }`;",
			{
				from: "styled-components",
				to: "pandwind",
				file: "Global.tsx",
				mode: "safe",
			},
		);
		expect(result.converted).toBe(2);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("registerSemanticRules");
		expect(result.code).toContain('kind: "global"');
		expect(result.code).toContain('kind: "keyframes"');
		expect(result.code).not.toContain('from "styled-components"');
	});

	test("registers JSS style maps and keeps their named-rule boundary explicit", () => {
		const adapter = getCodemodAdapter("jss")!;
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
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('css.group({ button: { color: "red" } })');
	});

	test("lowers Aphrodite font-face arrays into runtime semantic rules", () => {
		const result = runAdapterMigration(
			'import { StyleSheet } from "aphrodite";\n' +
				"const styles = StyleSheet.create({ fonts: { fontFamily: [{ fontFamily: 'Inter', src: 'url(inter.woff2)' }] } });",
			{ from: "aphrodite", to: "pandwind", file: "fonts.js", mode: "safe" },
		);
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("registerSemanticRules");
		expect(result.code).toContain('kind: "font-face"');
		expect(result.code).toContain('property: "fontFamily"');
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
		expect(result.code).toContain('import { createRuntimeCss } from "pandwind/css/runtime";');
		expect(result.code).toContain("const css = createRuntimeCss(pandwindPreset);");
		expect(result.code).toContain('css.sheet.registerSemanticRules([{ kind: "keyframes"');
		expect(result.code).toContain('{ kind: "style", selector: "from"');
	});

	test("cleans source imports when the module shares a line with migrated code", () => {
		const result = runAdapterMigration(
			`import { css } from "@emotion/css"; const card = css({ color: "red" });`,
			{ from: "emotion", to: "styled-components", file: "styles.ts", mode: "safe" },
		);
		expect(result.code).not.toContain("@emotion/css");
		expect(result.code).toContain('import styled from "styled-components";');
	});

	test("preserves styled component semantics when lowering to Emotion", () => {
		const result = runAdapterMigration(
			`import styled from "styled-components"; const Card = styled.button({ color: "red" });`,
			{ from: "styled-components", to: "emotion", file: "Card.tsx", mode: "safe" },
		);
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('import styled from "@emotion/styled";');
		expect(result.code).toContain("styled.button");
	});

	test("rewrites intrinsic styled component JSX uses when lowering to Pandwind", () => {
		const result = runAdapterMigration(
			'import styled from "styled-components";\n' +
				'const Card = styled.div({ color: "red" });\n' +
				'export const App = () => <Card data-testid="card" />;',
			{ from: "styled-components", to: "pandwind", file: "Card.tsx", mode: "safe" },
		);
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain(
			'const Card = (() => { const style = css.class({ color: "red" });',
		);
		expect(result.code).toContain('<div {...attrs} {...props} className={cx(style, "');
		expect(result.code).toContain('component.__pandwindClassName = "');
		expect(result.code).not.toContain('from "styled-components"');
	});

	test("loads package/config evidence and statically extracts tagged templates", () => {
		const adapter = getCodemodAdapter("emotion")!;
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
		expect(result.code).not.toContain("cssTemplate`");
	});

	test("statically extracts styled-components templates and leaves runtime only for dynamics", () => {
		const staticResult = runAdapterMigration(
			'import styled from "styled-components";\n' +
				"const Card = styled.div`color: red; background-color: blue;`;\n" +
				"export const App = () => <Card />;",
			{ from: "styled-components", to: "pandwind", file: "Card.tsx", mode: "safe" },
		);
		expect(staticResult.converted).toBe(1);
		expect(staticResult.residuals).toEqual([]);
		expect(staticResult.code).toContain(
			'const Card = (() => { const style = css.class({ color: "red", backgroundColor: "blue" });',
		);
		expect(staticResult.code).toContain('<div {...attrs} {...props} className={cx(style, "');
		expect(staticResult.code).toContain('component.__pandwindClassName = "');
		expect(staticResult.code).not.toContain("createRuntimeCss");

		const dynamicResult = runAdapterMigration(
			'import styled from "styled-components";\n' +
				"const Card = styled.div`color: ${theme.foreground};`;\n" +
				"export const App = () => <Card />;",
			{ from: "styled-components", to: "pandwind", file: "Card.tsx", mode: "safe" },
		);
		expect(dynamicResult.converted).toBe(1);
		expect(dynamicResult.residuals).toEqual([]);
		expect(dynamicResult.code).toContain("css.vars");
		expect(dynamicResult.code).not.toContain("createRuntimeCss");
	});

	test("preserves the static class of a composed styled subject", () => {
		const result = runAdapterMigration(
			'import styled from "styled-components";\n' +
				"const Column = styled.th`padding: 8px 16px;`;\n" +
				"const Heading = styled(Column)`font-weight: 600;`;\n" +
				"export const App = () => <Heading>Arguments</Heading>;",
			{ from: "styled-components", to: "pandwind", file: "Table.tsx", mode: "safe" },
		);
		expect(result.converted).toBe(2);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain(
			`cx(style, ${JSON.stringify(CodemodStyleIdentity.className("Table.tsx", "Heading"))}, ${JSON.stringify(CodemodStyleIdentity.className("Table.tsx", "Column"))}, props.className)`,
		);
	});

	test("uses the default project reader and reports unsupported rule kinds", () => {
		const config = getCodemodAdapter("emotion")!.loadConfig({
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

	test("keeps component interpolations as explicit host residuals in safe mode", () => {
		const result = runAdapterMigration("const Card = styled.div`color: ${theme.foreground};`;", {
			from: "styled-components",
			to: "pandwind",
			file: "Card.tsx",
			mode: "safe",
		});
		expect(result.skipped).toBe(1);
		expect(result.residuals.some((residual) => residual.kind === "capability")).toBe(true);
	});

	test("lowers dynamic intrinsic styled components into class and style carriers", () => {
		const result = runAdapterMigration(
			'import styled from "styled-components";\n' +
				"const Card = styled.div({ color: theme.foreground });\n" +
				'export const App = () => <Card data-testid="card" />;',
			{ from: "styled-components", to: "pandwind", file: "Card.tsx", mode: "safe" },
		);
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("css.vars({ color: theme.foreground })");
		expect(result.code).toContain("const Card = (props) =>");
		expect(result.code).toContain('<Card data-testid="card" />');
	});

	test("lowers styled template theme interpolations when the host is intrinsic", () => {
		const result = runAdapterMigration(
			'import styled from "styled-components";\n' +
				"const Card = styled.div`color: ${theme.foreground};`;\n" +
				"export const App = () => <Card />;",
			{ from: "styled-components", to: "pandwind", file: "Card.tsx", mode: "safe" },
		);
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("css.vars({ color: theme.foreground })");
		expect(result.code).toContain("<Card />");
		expect(result.code).not.toContain("createRuntimeCss");
	});

	test("lowers StyleX dynamic groups through its props host and runtime engine", () => {
		const result = runAdapterMigration(
			'import * as stylex from "@stylexjs/stylex";\n' +
				"const styles = stylex.create({ card: { color: colors.foreground } });\n" +
				"export const App = () => <div {...stylex.props(styles.card)} />;",
			{ from: "stylex", to: "pandwind", file: "Card.tsx", mode: "safe" },
		);
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("css.group({ card: { color: colors.foreground } })");
		expect(result.code).toContain("css.props(styles.card)");
		expect(result.code).toContain("createRuntimeCss(pandwindPreset)");
		expect(result.code).toContain('from "pandwind/css/runtime"');
	});

	test("lowers inline dynamic tagged templates through the host carrier", () => {
		const result = runAdapterMigration(
			'import { css } from "@linaria/core";\n' +
				"export const App = () => <strong className={css`color: ${theme.foreground};`} />;",
			{ from: "linaria", to: "pandwind", file: "App.tsx", mode: "safe" },
		);
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("className={css.vars({ color: theme.foreground }).class}");
		expect(result.code).toContain("style={css.vars({ color: theme.foreground }).style}");
	});

	test("lowers Stitches variants into the existing Pandwind recipe contract", () => {
		const result = runAdapterMigration(
			'import { createStitches } from "@stitches/react";\n' +
				"const { css } = createStitches();\n" +
				'const Button = css({ fontSize: "100%", variants: { shade: { red: { color: "Crimson" } } } });\n' +
				'const value = Button({ shade: "red" });',
			{ from: "stitches", to: "pandwind", file: "button.tsx", mode: "safe" },
		);
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("createRecipe(css");
		expect(result.code).toContain('"shade": { "red"');
		expect(result.code).toContain('Button({ shade: "red" })');
	});

	test("rewrites Vanilla Extract variable declarations for the runtime target", () => {
		const result = runAdapterMigration(
			'import { style, createVar, fallbackVar } from "@vanilla-extract/css";\n' +
				"const color = createVar();\n" +
				'export const card = style({ color, vars: { [color]: fallbackVar(color, "red") } });',
			{ from: "vanilla-extract", to: "pandwind", file: "card.css.ts", mode: "safe" },
		);
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).not.toContain("@vanilla-extract/css");
		expect(result.code).toContain('const color = "--pw-color";');
		expect(result.code).toContain("const fallbackVar =");
		expect(result.code).toContain('fallbackVar(color, "red")');
	});

	test("lowers dynamic values into Pandwind vars and rewrites the host carrier", () => {
		const result = runAdapterMigration(
			'import { css } from "@emotion/css";\n' +
				"const card = css({ color: theme.foreground });\n" +
				"export const App = () => <div className={card} />;",
			{ from: "emotion", to: "pandwind", file: "Card.tsx", mode: "safe" },
		);
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("css.vars({ color: theme.foreground })");
		expect(result.code).toContain("className={card.class}");
		expect(result.code).toContain("style={card.style}");
	});

	test("does not parse adapter-looking text inside comments or strings", () => {
		const source = [
			`const example = "css({ color: 'red' })";`,
			`// styled.div({ color: "red" })`,
			`const card = css({ color: "red" });`,
		].join("\n");
		const parsed = getCodemodAdapter("emotion")!.parse(source, {
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

	test("lowers JSS named rules and imperative application into Pandwind classes", () => {
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
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).not.toContain('import jss from "jss";');
		expect(result.code).toContain('const sheet = css.group({ button: { color: "red" } })');
		expect(result.code).toContain("button.classList.add(sheet.button)");
	});

	test("exposes a direct parser/emitter path for Stitches and keyframes", () => {
		const adapter = getCodemodAdapter("stitches")!;
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
		const stitches = getCodemodAdapter("stitches")!;
		const global = stitches.parse(
			`globalCss({ body: { margin: 0 }, "button:hover": { color: "red" } });`,
			{ file: "global.ts", source: "", config: { adapter: "stitches", files: [], values: {} } },
		);
		expect(global.matches[0]?.program.rules.map((rule) => rule.kind)).toEqual(["global", "global"]);
		expect(global.matches[0]?.program.rules[1]?.selector).toBe("button:hover");

		const vanilla = getCodemodAdapter("vanilla-extract")!;
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
		const vanilla = getCodemodAdapter("vanilla-extract")!;
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
		const adapter = getCodemodAdapter("solid-styled")!;
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
		expect(
			parsed.matches[0]?.program.residuals.some((residual) => residual.kind === "dynamic"),
		).toBe(true);
		expect(parsed.residuals.some((residual) => residual.kind === "parse")).toBe(false);
	});

	test("wraps function-valued Solid and Vue styles with host runtime context", () => {
		const solid = runAdapterMigration(
			'import { styled } from "solid-styled-components";\n' +
				"const Card = styled.div`color: ${(props) => props.color};`;",
			{
				from: "solid-styled",
				to: "pandwind",
				file: "Card.tsx",
				mode: "safe",
				semantic: { source: { file: "Card.tsx", framework: "solid" } },
			},
		);
		expect(solid.converted).toBe(1);
		expect(solid.residuals).toEqual([]);
		expect(solid.code).toContain("css.vars");
		expect(solid.code).not.toContain("createRuntimeCss");
		expect(solid.code).toContain("((props) => props.color)(props)");
		expect(solid.code).toContain('import { createCx } from "pandwind/cx";');
		expect(solid.code).toContain("class={cx(staticClass, dynamic.class, props.class)}");

		const vue = runAdapterMigration(
			'import styled from "vue-styled-components";\n' +
				"const Card = styled.div`color: ${(props) => props.color};`;",
			{
				from: "vue-styled",
				to: "pandwind",
				file: "Card.vue",
				mode: "safe",
				semantic: { source: { file: "Card.vue", framework: "vue" } },
			},
		);
		expect(vue.converted).toBe(1);
		expect(vue.residuals).toEqual([]);
		expect(vue.code).toContain(
			"computed(() => css.vars({ color: ((props) => props.color)(attrs) }))",
		);
		expect(vue.code).toContain('import { computed, defineComponent, h } from "vue";');
	});

	test("lowers Solid function-call styles and custom component subjects", () => {
		const result = runAdapterMigration(
			'import { styled } from "solid-styled-components";\n' +
				'const Base = styled("div")`color: red;`;\n' +
				"const Card = styled(Base)<{ color: string }>(({ color }) => ({ color }));\n" +
				'export const App = () => <Card color="blue" />;',
			{
				from: "solid-styled",
				to: "pandwind",
				file: "Card.tsx",
				mode: "safe",
				semantic: { source: { file: "Card.tsx", framework: "solid" } },
			},
		);
		expect(result.converted).toBe(2);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("<Base {...attrs} {...props} class={cx(");
		expect(result.code).toContain("css.vars({ color:");
		expect(result.code).toContain(")(props) });");
	});

	test("lowers Chakra, MUI, and Mantine host style props without removing component imports", () => {
		const chakra = runAdapterMigration(
			'import { Box } from "@chakra-ui/react";\nexport const App = () => <Box bg="tomato" p="16px" _hover={{ bg: "blue" }} data-kind="card" />;',
			{ from: "chakra-ui", to: "pandwind", file: "App.tsx", mode: "safe" },
		);
		expect(chakra.converted).toBe(1);
		expect(chakra.skipped).toBe(0);
		expect(chakra.residuals).toEqual([]);
		expect(chakra.code).toContain('import { Box } from "@chakra-ui/react";');
		expect(chakra.code).toContain('className={css.class({ backgroundColor: "tomato"');
		expect(chakra.code).toContain('"&:hover"');

		const merged = runAdapterMigration(
			'import { Box } from "@chakra-ui/react";\nexport const App = () => <Box className="existing" bg="tomato" />;',
			{ from: "chakra-ui", to: "pandwind", file: "App.tsx", mode: "safe" },
		);
		expect(merged.code).toContain(
			'className={cx(css.class({ backgroundColor: "tomato" }), "existing")}',
		);

		const spread = runAdapterMigration(
			'import { Box } from "@chakra-ui/react";\n' +
				'const Card = (props: any) => <Box className="local" bg="tomato" {...props} />;',
			{ from: "chakra-ui", to: "pandwind", file: "Card.tsx", mode: "safe" },
		);
		expect(spread.residuals).toEqual([]);
		expect(spread.code).toContain(
			'className={cx(css.class({ backgroundColor: "tomato" }), "local", props.className)}',
		);
		expect(spread.code.indexOf("props} />")).toBeLessThan(
			spread.code.indexOf("className={cx(css.class"),
		);

		const componentSpread = runAdapterMigration(
			'import { Stack } from "@chakra-ui/react";\n' +
				'const Notice = (props: any) => <Stack {...props} display="inline-flex" />;\n' +
				'const App = () => <Notice mt="3" />;',
			{ from: "chakra-ui", to: "pandwind", file: "Notice.tsx", mode: "safe" },
		);
		expect(componentSpread.residuals).toEqual([]);
		expect(componentSpread.code).toContain(
			'className={cx(css.class({ display: "inline-flex" }), props.className)}',
		);

		const separator = runAdapterMigration(
			'import { HStack, StackSeparator } from "@chakra-ui/react";\n' +
				"export const App = () => <HStack gap={12} separator={<StackSeparator />} />;",
			{ from: "chakra-ui", to: "pandwind", file: "Separator.tsx", mode: "safe" },
		);
		expect(separator.residuals).toEqual([]);
		expect(separator.code).toContain("gap={12}");
		expect(separator.code).not.toContain("className={");

		const nextImage = runAdapterMigration(
			'import { Box } from "@chakra-ui/react";\n' +
				'import Image from "next/image";\n' +
				'export const App = () => <Box><Image fill src="/hero.png" alt="Hero" objectFit="cover" /></Box>;',
			{ from: "chakra-ui", to: "pandwind", file: "Image.tsx", mode: "safe" },
		);
		expect(nextImage.residuals).toEqual([]);
		expect(nextImage.code).toContain("fill");
		expect(nextImage.code).not.toContain("className={css.class({ fill: true");

		const palette = runAdapterMigration(
			'import { VStack, Text } from "@chakra-ui/react";\n' +
				'export const App = ({ color }) => <VStack colorPalette={color}><Text color="colorPalette.fg">Label</Text></VStack>;',
			{ from: "chakra-ui", to: "pandwind", file: "Palette.tsx", mode: "safe" },
		);
		expect(palette.residuals).toEqual([]);
		expect(palette.code).toContain('color: "var(--chakra-colors-color-palette-fg)"');

		const mui = runAdapterMigration(
			'import { Box } from "@mui/material";\nexport const App = () => <Box sx={{ m: 2, p: 1, color: "red" }} />;',
			{ from: "mui", to: "pandwind", file: "App.tsx", mode: "safe" },
		);
		expect(mui.converted).toBe(1);
		expect(mui.skipped).toBe(0);
		expect(mui.residuals).toEqual([]);
		expect(mui.code).toContain('import { Box } from "@mui/material";');
		expect(mui.code).toContain('margin: "16px"');
		expect(mui.code).toContain('padding: "8px"');

		const mantine = runAdapterMigration(
			'import { Box } from "@mantine/core";\nexport const App = () => <Box c="red" bg="#fff" mx="16px" />;',
			{ from: "mantine", to: "pandwind", file: "App.tsx", mode: "safe" },
		);
		expect(mantine.converted).toBe(1);
		expect(mantine.skipped).toBe(0);
		expect(mantine.residuals).toEqual([]);
		expect(mantine.code).toContain('import { Box } from "@mantine/core";');
		expect(mantine.code).toContain('color: "red"');
		expect(mantine.code).toContain('backgroundColor: "#fff"');
	});

	test("keeps callback-valued host styles as explicit residuals", () => {
		const result = runAdapterMigration(
			'import { Box } from "@mui/material";\nexport const App = ({ theme }) => <Box sx={(theme) => ({ color: theme.palette.primary.main })} />;',
			{ from: "mui", to: "pandwind", file: "App.tsx", mode: "safe" },
		);
		expect(result.converted).toBe(0);
		expect(result.skipped).toBe(1);
		expect(result.residuals.some((residual) => residual.kind === "dynamic-values")).toBe(true);
		expect(result.code).toContain("pandwind:migrate-skip");
	});
});

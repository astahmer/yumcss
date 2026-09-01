import { describe, expect, test } from "vitest";
import * as chakra from "@chakra-ui/react";
import * as mantine from "@mantine/core";
import * as jss from "jss";
import {
	CodemodAdapterId,
	createBuiltinCodemodCatalog,
	runAdapterMigration,
} from "../src/swap/index.ts";

const catalog = createBuiltinCodemodCatalog();
const { createSystem, defaultConfig } = chakra;

describe("installed adapter public API contracts", () => {
	test("Chakra exposes system.css, not a standalone css export", () => {
		const system = createSystem(defaultConfig);

		expect(typeof system.css).toBe("function");
		expect("css" in chakra).toBe(false);
	});

	test("Chakra target emission uses the documented system.css carrier", () => {
		const result = runAdapterMigration(
			'import styled from "styled-components";\n' +
				'const Card = styled.div({ color: "red" });\n' +
				"export const App = () => <Card />;",
			{
				from: CodemodAdapterId.StyledComponents,
				to: CodemodAdapterId.ChakraUi,
				file: "Card.tsx",
				mode: "safe",
				adapterRegistry: catalog.registry,
			},
		);

		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain(
			'import { createSystem, defaultConfig } from "@chakra-ui/react";',
		);
		expect(result.code).toContain("const chakraSystem = createSystem(defaultConfig);");
		expect(result.code).toContain("chakraSystem.css(");
		expect(result.code).not.toContain('import { css } from "@chakra-ui/react";');
	});

	test("Mantine and JSS target emission uses actual package entry points", () => {
		expect(Object.keys(mantine)).not.toContain("createStyles");
		expect(Object.keys(mantine)).not.toContain("style");
		expect(Object.keys(jss)).not.toContain("createStyleSheet");

		const mantineResult = runAdapterMigration(
			'import { css } from "@emotion/css";\n' +
				'export const card = css({ color: "red", padding: "1rem" });',
			{
				from: CodemodAdapterId.Emotion,
				to: CodemodAdapterId.Mantine,
				file: "styles.ts",
				mode: "safe",
				adapterRegistry: catalog.registry,
			},
		);
		expect(mantineResult.code).not.toMatch(
			/import \{ (?:createStyles|style) \} from "@mantine\/core"/u,
		);

		const jssResult = runAdapterMigration(
			'import { css } from "@emotion/css";\n' +
				'const card = css({ color: "red", padding: "1rem" });\n' +
				"export const App = () => <div className={card} />;",
			{
				from: CodemodAdapterId.Emotion,
				to: CodemodAdapterId.Jss,
				file: "styles.ts",
				mode: "safe",
				adapterRegistry: catalog.registry,
			},
		);
		expect(jssResult.code).not.toMatch(/import \{ createStyleSheet \} from "jss"/u);
		expect(jssResult.code).toContain('import jss from "jss";');
		expect(jssResult.code).toContain("jss.createStyleSheet");
	});
});

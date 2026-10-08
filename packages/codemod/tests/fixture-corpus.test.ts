import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { runAdapterMigration, runDifferentialFixture } from "../src/swap/index.ts";

const fixture = (name: string): { file: string; source: string } => {
	const file = resolve(import.meta.dirname, "fixtures/css-in-js", name);
	return { file, source: readFileSync(file, "utf8") };
};

describe("representative CSS-in-JS migration corpus", () => {
	test("migrates Linaria source through the same adapter contract", () => {
		const input = fixture("linaria-card.tsx");
		const result = runAdapterMigration(input.source, {
			from: "linaria",
			to: "emotion",
			file: input.file,
		});
		expect(result.converted).toBe(1);
		expect(result.code).toContain("@emotion/css");
	});

	test("lowers JSS and Style9 named maps through the class-map target", () => {
		const jss = fixture("jss-card.tsx");
		const style9 = fixture("style9-card.ts");
		const jssResult = runAdapterMigration(jss.source, {
			from: "jss",
			to: "emotion",
			file: jss.file,
		});
		const style9Result = runAdapterMigration(style9.source, {
			from: "style9",
			to: "emotion",
			file: style9.file,
		});
		expect({
			code: style9Result.code,
			converted: style9Result.converted,
			skipped: style9Result.skipped,
			residuals: style9Result.residuals,
		}).toMatchInlineSnapshot(`
			{
			  "code": "import "style9";
			import { css } from "@emotion/css";

			export const card = { "card": css({ color: "red", padding: "2px" }) };
			",
			  "converted": 1,
			  "residuals": [],
			  "skipped": 0,
			}
		`);
		expect(jssResult.skipped).toBe(0);
		expect(style9Result.skipped).toBe(0);
		expect(jssResult.residuals).toEqual([]);
		expect(style9Result.residuals).toEqual([]);
		expect(jssResult.code).toContain('"card": css(');
		expect(style9Result.code).toContain('"card": css(');
		expect(style9Result.code).toContain('padding: "2px"');
	});

	test("normalizes Style9 numbers with the source serializer rules", () => {
		const result = runAdapterMigration(
			`import style9 from "style9";
export const styles = style9.create({ card: { fontSize: 16, opacity: 0.5, lineHeight: 1.25, width: 2, "--scale": 3 } });`,
			{ from: "style9", to: "emotion", file: "Numbers.ts" },
		);
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('fontSize: "1rem"');
		expect(result.code).toContain("opacity: 0.5");
		expect(result.code).toContain("lineHeight: 1.25");
		expect(result.code).toContain('width: "2px"');
		expect(result.code).toContain('"--scale": 3');
		expect(result.code).toMatchInlineSnapshot(`
			"import "style9";
			import { css } from "@emotion/css";
			export const styles = { "card": css({ fontSize: "1rem", opacity: 0.5, lineHeight: 1.25, width: "2px", "--scale": 3 }) };"
		`);
	});

	test("records residuals instead of silently accepting a dynamic corpus case", () => {
		const result = runDifferentialFixture({
			name: "jss-dynamic-corpus",
			sourceAdapter: "jss",
			targetAdapter: "vanilla-extract",
			file: "Dynamic.tsx",
			source: `import { createUseStyles } from "react-jss";\nconst useStyles = createUseStyles({ card: { color: props => props.color } });`,
		});
		expect(result.valid).toBe(false);
		expect(result.residuals.length).toBeGreaterThan(0);
	});

	test("lowers Style9 group calls into YumCSS group and cx calls", () => {
		const source = `import style9 from "style9";
const styles = style9.create({ title: { color: "red" } });
const layout = style9.create({ center: { display: "flex" } });
export const view = <h1 className={style9(styles("title"), layout.center)}>Hello</h1>;`;
		const result = runAdapterMigration(source, {
			from: "style9",
			to: "yumcss",
			file: "View.tsx",
		});
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("css.group");
		expect(result.code).toContain("cx(styles.title, layout.center)");
		expect(result.code).not.toContain('from "style9"');
	});
});

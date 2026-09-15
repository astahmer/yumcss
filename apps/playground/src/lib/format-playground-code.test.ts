import { describe, expect, test } from "vitest";
import { formatPlaygroundCode } from "./format-playground-code.ts";

describe("formatPlaygroundCode", () => {
	test("formats emitted TSX with the playground formatter", async () => {
		const formatted = await formatPlaygroundCode(
			'import { createUnsafeCss } from "pandwind/unsafe/css";\nexport const Card=()=>{const css=createUnsafeCss();return <div className={css.class({color:"red"})} />;};',
		);

		expect(formatted).toContain('import { createUnsafeCss } from "pandwind/unsafe/css";');
		expect(formatted).toContain("export const Card = () => {");
		expect(formatted).toContain("\n\tconst css = createUnsafeCss();");
		expect(formatted).toContain("\n};\n");
	});

	test("preserves source when the formatter cannot parse it", async () => {
		const source = "export const = ;";
		expect(await formatPlaygroundCode(source)).toBe(source);
	});
});

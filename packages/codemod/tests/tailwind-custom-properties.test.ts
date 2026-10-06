import { expect, test } from "vitest";
import { CodemodAdapterId } from "../src/swap/index.ts";
import { parseTailwindCandidateCss } from "../src/swap/adapters/tailwind.adapter.ts";
import { createAdapterRouteSpec } from "./route-spec-support.ts";

test("Tailwind custom properties keep their CSS spelling in YumCSS output", () => {
	const route = createAdapterRouteSpec(CodemodAdapterId.Tailwind, CodemodAdapterId.YumCSS);
	const result = route.run({
		source:
			'export const App = () => <div className="[--tw-shadow:0_1px_2px_black] [box-shadow:var(--tw-shadow)]" />;',
		file: "App.tsx",
	});
	expect(result.converted).toBe(1);
	expect(result.residuals).toEqual([]);
	expect(result.code).toContain('"--tw-shadow"');
	expect(result.code).not.toContain("-TwShadow");
	expect(result.code).toMatchInlineSnapshot(`
		"import { createUnsafeCss } from "yumcss/unsafe/css";
		const css = createUnsafeCss();
		export const App = () => <div className={css.class({ "--tw-shadow": "0 1px 2px black", boxShadow: "var(--tw-shadow)" })}/>;"
	`);
	const declarations = parseTailwindCandidateCss(
		".shadow { --tw-shadow: 0 1px 2px black; box-shadow: var(--tw-shadow); }",
		"shadow",
	);
	expect(declarations).toMatchObject([{ property: "--tw-shadow" }, { property: "boxShadow" }]);
});

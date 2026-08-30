import { describe, expect, test } from "vitest";
import {
	CodemodAdapterId,
	createBuiltinCodemodCatalog,
	createStyleAdapterRegistry,
	runAdapterMigration,
} from "../src/swap/index.ts";
import {
	createUnoCssAdapter,
	createUnoCssResolverFromCss,
} from "../src/swap/adapters/unocss.adapter.ts";

describe("Tokenami and UnoCSS semantic adapters", () => {
	test("normalizes Tokenami encoded properties and conditions", () => {
		const adapter = createBuiltinCodemodCatalog().registry.get(CodemodAdapterId.Tokenami)!;
		const source =
			"import { css } from '@tokenami/css'; const button = css({ '--hover_bg': 'red', '--px': 2 });";
		const parsed = adapter.parse(source, {
			file: "button.tsx",
			source,
			config: adapter.loadConfig({ file: "button.tsx", source }),
		});
		const declarations = parsed.matches[0]?.program.declarations ?? [];
		expect(declarations).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					property: "backgroundColor",
					value: { kind: "literal", value: "red" },
				}),
				expect.objectContaining({
					property: "paddingInline",
					value: { kind: "literal", value: 2 },
				}),
			]),
		);
		expect(declarations.find((entry) => entry.property === "backgroundColor")?.conditions).toEqual([
			{ kind: "pseudo", name: "hover" },
		]);
	});

	test("rewrites Tokenami static styles through the Pandwind target", () => {
		const source =
			"import { css } from '@tokenami/css'; const button = css({ '--hover_color': 'red' });";
		const result = runAdapterMigration(source, {
			from: CodemodAdapterId.Tokenami,
			to: CodemodAdapterId.Pandwind,
			file: "button.tsx",
		});
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("css.class");
		expect(result.code).not.toContain("@tokenami/css");
	});

	test("uses a project resolver for UnoCSS utilities and preserves host syntax", () => {
		const uno = createUnoCssAdapter({
			resolver: {
				resolve(token) {
					if (token === "brand") {
						return [
							{
								conditions: [],
								property: "color",
								value: { kind: "literal", value: "rebeccapurple" },
							},
						];
					}
					return undefined;
				},
			},
		});
		const catalog = createBuiltinCodemodCatalog();
		const registry = createStyleAdapterRegistry(
			catalog.adapters.filter((adapter) => adapter.id !== CodemodAdapterId.UnoCSS),
		);
		registry.register(uno);
		const source = '<div className="brand" />';
		const result = runAdapterMigration(source, {
			from: CodemodAdapterId.UnoCSS,
			to: CodemodAdapterId.Pandwind,
			file: "App.tsx",
			adapterRegistry: registry,
		});
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("className={css.class");
		expect(result.code).toContain("rebeccapurple");
	});

	test("reports unknown UnoCSS utilities instead of guessing", () => {
		const adapter = createBuiltinCodemodCatalog().registry.get(CodemodAdapterId.UnoCSS)!;
		const source = '<div className="project-shortcut" />';
		const parsed = adapter.parse(source, {
			file: "App.tsx",
			source,
			config: adapter.loadConfig({ file: "App.tsx", source }),
		});
		expect(parsed.matches[0]?.program.residuals[0]).toMatchObject({
			kind: "unknown-utility",
			text: "project-shortcut",
		});
	});

	test("accepts declarations from a real UnoCSS-generated CSS artifact", () => {
		const uno = createUnoCssAdapter({
			resolver: createUnoCssResolverFromCss(
				".brand{color:rebeccapurple}.hover\\:brand:hover{color:blue}",
			),
		});
		const parsed = uno.parse('<div className="brand hover:brand" />', {
			file: "App.tsx",
			source: '<div className="brand hover:brand" />',
			config: uno.loadConfig({ file: "App.tsx", source: "" }),
		});
		expect(parsed.matches[0]?.program.residuals).toEqual([]);
		expect(parsed.matches[0]?.program.declarations).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					property: "color",
					value: { kind: "literal", value: "rebeccapurple" },
				}),
				expect.objectContaining({ property: "color", value: { kind: "literal", value: "blue" } }),
			]),
		);
	});
});

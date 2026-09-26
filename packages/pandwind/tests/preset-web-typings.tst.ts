import { expect, test } from "tstyche";
import { define } from "pandwind/preset";

test("define.preset preserves the typed build-time web contract", () => {
	const theme = define.theme({
		config: {},
		tokens: {
			colors: { $brand: "#2563eb" },
			spacing: { $space: "1rem" },
		},
	});
	const presetOptions = {
		conditions: define.conditions({ _dark: ".dark &" }),
		properties: define.properties({
			color: { $tokens: "colors" },
			padding: { $tokens: "spacing" },
		}),
	};
	const preset = define.preset(
		{
			config: {},
			tokens: { colors: { $brand: "#2563eb" } },
		},
		{
			conditions: {},
			properties: { color: { $tokens: "colors" } },
		},
		{
			globals: {
				":root": {
					color: "$brand",
					"--optional": undefined,
				},
			},
			keyframes: { fadeIn: { from: { opacity: 0 }, to: { opacity: 1 } } },
			fontFaces: {
				brand: { family: "Brand", src: 'url("/brand.woff2")', weight: 400 },
			},
		},
	);

	expect(preset).type.toHaveProperty("web");
	expect(preset.web!.globals).type.toHaveProperty(":root");
	expect(preset.web!.keyframes).type.toHaveProperty("fadeIn");
	expect(preset.web!.fontFaces).type.toHaveProperty("brand");
	expect(preset.web?.globals?.[":root"]?.color).type.toBe<"$brand" | undefined>();
	expect(preset.web?.keyframes?.fadeIn?.from?.opacity).type.toBe<0 | undefined>();
	expect(preset.web?.fontFaces?.brand?.weight).type.toBe<400 | undefined>();

	define.preset(theme, presetOptions, {
		globals: {
			":root": {
				// @ts-expect-error not assignable to type
				color: "$space",
			},
		},
	});
	define.preset(theme, presetOptions, {
		globals: {
			":root": {
				// @ts-expect-error not assignable to type
				color: "$missing",
			},
		},
	});
	define.preset(theme, presetOptions, {
		globals: {
			":root": {
				// @ts-expect-error not assignable to type
				_dark: "$brand",
			},
		},
	});
	define.preset(theme, presetOptions, {
		globals: {
			":root": {
				// @ts-expect-error not assignable to type
				color: "tomato",
			},
		},
	});
	define.preset(theme, presetOptions, {
		// @ts-expect-error does not exist in type
		web: { globals: { ":root": { color: "$brand" } } },
	});
});

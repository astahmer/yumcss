import { expect, test } from "tstyche";
import { define } from "pandwind/preset";

test("define.preset preserves the typed build-time web contract", () => {
	const preset = define.preset(
		{
			config: {},
			tokens: { colors: { $brand: "#2563eb" } },
		},
		{
			conditions: {},
			properties: { color: { $tokens: "colors" } },
			web: {
				globals: { ":root": { color: "$brand", "--optional": undefined } },
				keyframes: { fadeIn: { from: { opacity: 0 }, to: { opacity: 1 } } },
				fontFaces: {
					brand: { family: "Brand", src: 'url("/brand.woff2")', weight: 400 },
				},
			},
		},
	);

	expect(preset).type.toHaveProperty("web");
	expect(preset.web?.globals).type.toHaveProperty(":root");
	expect(preset.web?.keyframes).type.toHaveProperty("fadeIn");
	expect(preset.web?.fontFaces).type.toHaveProperty("brand");
});

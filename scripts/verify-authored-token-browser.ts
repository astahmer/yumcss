import { chromium } from "playwright-core";
import { createCss } from "../packages/pandwind/src/css/create-css.ts";
import { createStylesheet } from "../packages/pandwind/src/css/create-stylesheet.ts";

const preset = {
	conditions: {},
	properties: { $all: true, color: { $tokens: "custom" } },
	strict: true,
	tokens: {
		custom: {
			"$gray.700": "rgb(55 65 81)",
			"$space-2": "rgb(22 163 74)",
			$10px: "rgb(37 99 235)",
			"$slash/name": "rgb(147 51 234)",
		},
	},
	tokenVariables: {
		custom: {
			"$gray.700": "gray.700",
			"$space-2": "space-2",
			$10px: "10px",
			"$slash/name": "slash/name",
		},
	},
} as never;

const tokens = ["$gray.700", "$space-2", "$10px", "$slash/name"] as const;
const authoredNames = ["gray.700", "space-2", "10px", "slash/name"] as const;
const expectedColors = [
	"rgb(55, 65, 81)",
	"rgb(22, 163, 74)",
	"rgb(37, 99, 235)",
	"rgb(147, 51, 234)",
] as const;
const expectedVariables = [
	"rgb(55 65 81)",
	"rgb(22 163 74)",
	"rgb(37 99 235)",
	"rgb(147 51 234)",
] as const;

const css = createCss(preset, { debug: true, tokenVariableNames: "authored" });
const stylesheet = createStylesheet(preset, { debug: true, tokenVariableNames: "authored" });
const classNames = tokens.map((token) => css.class({ color: token }));
for (const token of tokens) stylesheet.process([{ color: token }]);
const output = [stylesheet.gen.tokens(), stylesheet.gen.atomic()].filter(Boolean).join("\n");
const html = `<!doctype html><style>${output}</style>${classNames
	.map((className, index) => `<span data-token="${tokens[index]}" class="${className}"></span>`)
	.join("")}`;

const browser = await chromium.launch();
try {
	const page = await browser.newPage();
	const errors: string[] = [];
	page.on("console", (message) => {
		if (message.type() === "error") errors.push(message.text());
	});
	page.on("pageerror", (error) => errors.push(error.message));
	await page.setContent(html);
	const result = await page.evaluate((names) => {
		const elements = [...document.querySelectorAll<HTMLElement>("[data-token]")];
		return {
			colors: elements.map((element) => getComputedStyle(element).color),
			variables: names.map((name) =>
				getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim(),
			),
		};
	}, authoredNames);
	if (errors.length > 0) throw new Error(`Browser errors: ${errors.join(" | ")}`);
	if (JSON.stringify(result.colors) !== JSON.stringify(expectedColors))
		throw new Error(`Unexpected computed colors: ${JSON.stringify(result.colors)}`);
	if (JSON.stringify(result.variables) !== JSON.stringify(expectedVariables))
		throw new Error(`Unexpected custom properties: ${JSON.stringify(result.variables)}`);

	console.log("PASS authored token names resolve in Chromium", JSON.stringify(result));
} finally {
	await browser.close();
}

import { adapter, allRuleCapabilities, programObject } from "../external-adapters.ts";

export const PANDWIND = adapter(
	"pandwind",
	[{ name: "css", regex: /\bcss\.class\s*\(\s*\{/g }],
	{ packages: [] },
	allRuleCapabilities("pandwind", "partial", { "dynamic-values": "partial" }),
	(program) => ({
		text: `css.class(${programObject(program)})`,
		imports: ['import { createCss } from "pandwind/css";', "const css = createCss();"],
	}),
	[/\bcss\.class\s*\(/, /\bcreateCss\s*\(/],
	["pandwind/css", "pandwind/css/runtime"],
);

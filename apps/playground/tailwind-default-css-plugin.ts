import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import type { Plugin } from "vite";

const tailwindDefaultCssId = "\0yumcss-tailwind-default-css";

export const tailwindDefaultCssPlugin: Plugin = {
	name: "yumcss-tailwind-default-css",
	resolveId(id) {
		return id === "virtual:yumcss-tailwind-default-css" ? tailwindDefaultCssId : undefined;
	},
	load(id) {
		if (id !== tailwindDefaultCssId) return undefined;
		const file = createRequire(import.meta.url).resolve("tailwindcss/index.css");
		return `export default ${JSON.stringify(readFileSync(file, "utf8"))};`;
	},
};

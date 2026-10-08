import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { Plugin } from "vite";

const moduleId = "virtual:yumcss-preview-tailwind-stylesheets";
const resolvedId = "\0yumcss-preview-tailwind-stylesheets";

/** Filesystem provider only; Tailwind's browser compiler owns interpretation. */
export const previewEngineAssetsPlugin: Plugin = {
	name: "yumcss-preview-engine-assets",
	resolveId(id) {
		return id === moduleId ? resolvedId : undefined;
	},
	load(id) {
		if (id !== resolvedId) return undefined;
		const root = dirname(createRequire(import.meta.url).resolve("tailwindcss/index.css"));
		const stylesheets = Object.fromEntries(
			["index.css", "theme.css", "preflight.css", "utilities.css"].map((file) => [
				`/tailwindcss/${file}`,
				readFileSync(join(root, file), "utf8"),
			]),
		);
		const theme = join(import.meta.dirname, "src/yumcss-theme.css");
		this.addWatchFile(theme);
		stylesheets["/playground/yumcss-theme.css"] = readFileSync(theme, "utf8");
		return `export default ${JSON.stringify(stylesheets)};`;
	},
};

import { defineConfig } from "tsdown";

export default defineConfig({
	entry: ["src/**/*.ts", "src/**/*.tsx"],
	deps: { neverBundle: true, dts: { neverBundle: true } },
	dts: true,
	format: "es",
	outDir: "dist",
	outExtensions: () => ({ js: ".js" }),
	unbundle: true,
	clean: true,
});

import { defineConfig } from "tsdown";

export default defineConfig({
	entry: ["src/index.ts", "src/client/inspect-action.ts", "src/evidence/index.ts"],
	deps: { neverBundle: true, dts: { neverBundle: true } },
	dts: true,
	format: "es",
	outDir: "dist",
	outExtensions: () => ({ js: ".js" }),
	unbundle: true,
	clean: true,
});

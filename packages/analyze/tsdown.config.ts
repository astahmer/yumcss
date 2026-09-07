import { defineConfig } from "tsdown";

export default defineConfig({
	entry: [
		"src/cli.ts",
		"src/collect/index.ts",
		"src/governance/index.ts",
		"src/studio/index.ts",
		"src/studio/cli.ts",
		"src/mcp/server.ts",
		"src/mcp/http.ts",
	],
	deps: { neverBundle: true, dts: { neverBundle: true } },
	dts: true,
	format: "es",
	outDir: "dist",
	outExtensions: () => ({ js: ".js" }),
	unbundle: true,
	clean: true,
});

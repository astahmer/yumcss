import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { createInlineTwPluginCore } from "../src/vite/index.ts";

const exampleTw = resolve(import.meta.dirname, "../../../examples/example/src/tw.ts");
const temporaryDirectories: string[] = [];

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0))
		rmSync(directory, { recursive: true, force: true });
});

describe("cross-file static erasure", () => {
	test("folds imported tokens through tw and cx without runtime calls", async () => {
		const root = mkdtempSync(join(tmpdir(), "yumcss-static-erasure-"));
		temporaryDirectories.push(root);
		const tokens = join(root, "tokens.ts");
		const app = join(root, "app.tsx");
		writeFileSync(tokens, 'export const SPACING = "6";\nexport const SURFACE = "bg-indigo-600";');
		const source = [
			'import { tw } from "./tw";',
			'import { cx } from "./cx";',
			'import { SPACING, SURFACE } from "./tokens";',
			'export const className = cx(tw({ p: SPACING }), SURFACE, "font-semibold");',
		].join("\n");
		writeFileSync(app, source);

		const core = createInlineTwPluginCore();
		const result = await core.transform(source, app, {
			resolve: async (specifier) => (specifier === "./tw" ? { id: exampleTw } : null),
		});

		expect(result?.code).toMatchInlineSnapshot(`
			"import { tw } from "./tw";
			import { cx } from "./cx";
			import { SPACING, SURFACE } from "./tokens";
			export const className = "p-6 bg-indigo-600 font-semibold";"
		`);
		expect(result?.code).toContain('"p-6 bg-indigo-600 font-semibold"');
		expect(result?.code).not.toMatch(/\b(?:tw|cx)\s*\(/u);
		expect(result?.code).not.toContain("createTw");
		expect(result?.code).not.toContain("createCx");
	});
});

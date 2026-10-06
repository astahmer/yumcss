import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";

const contractSource = readFileSync(
	resolve(import.meta.dirname, "../src/css/runtime-sheet-contracts.ts"),
	"utf8",
);

test("runtime contract docs avoid unresolved links and metadata-only tags", () => {
	expect(contractSource).not.toContain("{@link createRuntimeSheet}");
	expect(contractSource).not.toContain("@category runtime");
	expect(contractSource).not.toContain("@since 0.1.0");
	expect(contractSource).toContain("`createRuntimeSheet` from `yumcss/css/runtime`");
});

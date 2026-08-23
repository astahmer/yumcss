/** Post-migration syntax gate for the 8bit clone (plans/013). */
import { readFileSync } from "node:fs";
import { globSync } from "node:fs";
import { parseSync } from "oxc-parser";
const files = globSync("/tmp/pandwind-8bit-dogfood/components/**/*.tsx") as string[];
let broken = 0;
for (const f of files) {
	const p = parseSync(f, readFileSync(f, "utf8"), { sourceType: "module", lang: "tsx" });
	if ((p.errors ?? []).length > 0) broken++;
}
console.log(`parse-check: ${files.length} files, ${broken} with errors`);

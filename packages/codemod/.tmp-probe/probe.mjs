import { __unstable__loadDesignSystem } from "@tailwindcss/node";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(process.cwd(), ".tmp-probe", "proj-"));
// 1) legacy JS config wired through the v4 @config at-rule
writeFileSync(join(dir, "tailwind.config.js"),
  'export default { theme: { extend: { colors: { brand: "#123456" } } } };');
const css4 = '@config "./tailwind.config.js";';
try {
  const system = await __unstable__loadDesignSystem(css4, { base: dir });
  console.log("CASE1 @config theme.brand:", JSON.stringify(system.theme.get(["--color-brand"])));
  console.log("CASE1 candidate brand-bg:", system.candidatesToCss(["bg-brand"])[0] ?? "null");
} catch (e) { console.log("CASE1 failed:", e.message); }

// 2) raw v3-style CSS (no @config) through the v4 engine
const css3 = "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n@config './tailwind.config.js';";
try {
  const system = await __unstable__loadDesignSystem(css3, { base: dir });
  console.log("CASE2 loaded, theme entries:", system.theme.entries().size);
} catch (e) { console.log("CASE2 failed:", e.message); }

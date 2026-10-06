/**
 * Governance-scale benchmarks (plans/054 step 11): one full
 * analyzeTokenGovernance pass over a representative synthetic corpus —
 * 2,000 token definitions across 5 groups and a 400-file repository scan
 * with token refs, exact-match raw literals, and dynamic sites. The
 * service consumes authored inputs (files + tokenContext), so the bench
 * exercises collection, resolution, suggestions, and reachability.
 */
import { test } from "vitest";
import type { EffectiveTokenContextInputs } from "../src/governance/effective-token-context.ts";
import { analyzeTokenGovernance } from "../src/governance/index.ts";

const GROUPS = ["colors", "spacing", "radii", "fontSizes", "fontWeights"] as const;
const TOKENS_PER_GROUP = 400;
const FILES = 400;
const CALLS_PER_FILE = 10;

const hex = (i: number): string => `#${(i % 4096).toString(16).padStart(3, "0")}`;

const tokenGroups: Record<string, Record<string, string>> = {};
for (const group of GROUPS) {
	tokenGroups[group] = {};
	for (let i = 0; i < TOKENS_PER_GROUP; i++) {
		tokenGroups[group]![`token-${i}`] = group === "colors" ? hex(i) : `${i}px`;
	}
}

const tokenContext: EffectiveTokenContextInputs = { tokenGroups };

/**
 * Each call-site block contributes two token refs, two exact-match raw
 * literals (suggestion candidates), one unknown raw literal, and one
 * dynamic template site. Static values are collected usage facts;
 * dynamic ones feed the dynamic-expression coverage boundary.
 */
const colorBlock = (i: number): string =>
	`export const c${i} = tw({ backgroundColor: "$colors.token-${i}", borderColor: "$colors.token-${(i + 1) % TOKENS_PER_GROUP}" });\n` +
	`export const r${i} = tw({ backgroundColor: "${hex(i)}", outlineColor: "${hex(i + 7)}" });\n` +
	`export const d${i} = tw({ backgroundColor: \`var(--tone-${i})\` });\n`;

const spacingBlock = (i: number): string =>
	`export const s${i} = tw({ padding: "$spacing.token-${i}", margin: "$spacing.token-${(i + 1) % TOKENS_PER_GROUP}" });\n` +
	`export const sp${i} = tw({ padding: "${i}px", gap: "${(i + 3) % 97}px" });\n` +
	`export const sd${i} = tw({ padding: spacingProp(${i}) });\n`;

const files = Array.from({ length: FILES }, (_, f) => ({
	file: `src/component-${f}.tsx`,
	content:
		`import { tw } from "yumcss";\ndeclare function spacingProp(n: number): string;\n` +
		Array.from({ length: CALLS_PER_FILE }, (_, i) => colorBlock((f + i) % TOKENS_PER_GROUP)).join(
			"",
		) +
		Array.from({ length: CALLS_PER_FILE }, (_, i) => spacingBlock((f + i) % TOKENS_PER_GROUP)).join(
			"",
		),
}));

test("token governance at repository scale", async ({ bench }) => {
	await bench("analyzeTokenGovernance (2k definitions / 400 files / 16k usage sites)", () => {
		analyzeTokenGovernance({
			root: "/bench",
			files,
			tokenContext,
			boundaryHits: { safelist: ["colors::token-0"] },
		});
	}).run();
});

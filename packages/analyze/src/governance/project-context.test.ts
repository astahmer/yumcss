import { describe, expect, it } from "vitest";
import { analyzeTokenGovernance } from "./service.ts";
import { scanPublicExports } from "./public-export.ts";
import {
	DEFAULT_GOVERNANCE_PRESET,
	deriveProjectGovernanceContext,
	loadOfficialPresetModule,
	projectGovernanceInputs,
} from "./project-context.ts";
import { buildGovernancePruneChangeset } from "./prune-changeset.ts";
import { resolve } from "node:path";

describe("scanPublicExports", () => {
	it("attributes exact authored-spelling exports to the token id", () => {
		const hits = scanPublicExports([
			{ file: "theme.ts", content: 'export const brand = "$colors.brand";\n' },
		]);
		expect(hits).toEqual([
			{ tokenId: "colors::brand", references: ["colors.brand"], file: "theme.ts", name: "brand" },
		]);
	});

	it("collects quoted $-references from object-literal exports", () => {
		const hits = scanPublicExports([
			{
				file: "shared.ts",
				content:
					'export const shared = {\n\tbg: "$colors.brand",\n\ttext: "$colors.red-500",\n};\n',
			},
		]);
		expect(hits).toHaveLength(1);
		expect(hits[0]!.tokenId).toBeNull();
		expect(hits[0]!.references.toSorted()).toEqual(["colors.brand", "colors.red-500"]);
		expect(hits[0]!.name).toBe("shared");
	});

	it("ignores exports without $-references", () => {
		const hits = scanPublicExports([
			{ file: "a.ts", content: 'export const plain = { bg: "#fff", text: "red" };\n' },
			{ file: "b.ts", content: "export const n = 42;\n" },
		]);
		expect(hits).toEqual([]);
	});
});

describe("deriveProjectGovernanceContext", () => {
	const presetModule = {
		default: {
			strict: true,
			tokens: { colors: { red: "#ff0000" }, spacing: { "4": "4px" } },
			properties: {
				display: true,
				color: { $strict: false, red: "#ff0000" },
				backgroundColor: { red: "#ff0000" },
				padding: { $tokens: "spacing" },
			},
		},
	};

	it("derives policy + vocabulary from the official strict surface", () => {
		const derived = deriveProjectGovernanceContext(presetModule);
		expect(derived.policy).toMatchObject({ resolved: true, origin: "official-loader" });
		expect(derived.policy?.strictProperties?.toSorted()).toEqual(["backgroundColor", "padding"]);
		expect(derived.policy?.allowedRawValuesByProperty).toMatchObject({ backgroundColor: ["red"] });
		expect(derived.policy?.tokenVocabulary).toMatchObject({
			backgroundColor: { red: "colors::red" },
			padding: { "4": "spacing::4" },
		});
		expect(derived.tokenGroups).toMatchObject({ colors: { red: "#ff0000" } });
	});

	it("returns policy=null when no export declares the strict surface", () => {
		expect(
			deriveProjectGovernanceContext({ default: { tokens: { colors: { red: "#f00" } } } }).policy,
		).toBeNull();
	});

	it("keeps ambiguous token names as $-authored forms", () => {
		const derived = deriveProjectGovernanceContext({
			default: {
				strict: true,
				tokens: {
					colors: { base: "#111" },
					radii: { base: "4px" },
				},
				properties: { color: { base: "#111" } },
			},
		});
		expect(derived.policy?.tokenVocabulary?.color).toEqual({ base: "$base" });
	});
});

describe("projectGovernanceInputs", () => {
	it("loads the public default preset by package specifier", async () => {
		const load = await loadOfficialPresetModule(
			DEFAULT_GOVERNANCE_PRESET,
			resolve(import.meta.dirname, "../../../../"),
		);

		expect(load.status).toBe("loaded");
	});

	it("downgrades a failed load to diagnostics + report-only policy", async () => {
		const load = await loadOfficialPresetModule("./does/not/exist.ts", "/tmp");
		expect(load.status).toBe("failed");
		const inputs = projectGovernanceInputs(load);
		expect(inputs.policy).toBeNull();
		expect(inputs.tokenContext.loaderFailures?.[0]).toContain("official preset load failed");
	});

	it("loads a real preset module by path and derives its context", async () => {
		const load = await loadOfficialPresetModule(
			resolve(import.meta.dirname, "../../../../examples/yumcss-example-preset/src/index.ts"),
			"/tmp",
		);
		expect(load.status).toBe("loaded");
		const inputs = projectGovernanceInputs(load);
		expect(inputs.policy).not.toBeNull();
		expect(inputs.policy?.resolved).toBe(true);
		expect(Object.keys(inputs.policy?.tokenVocabulary ?? {}).length).toBeGreaterThan(0);
		expect(Object.keys(inputs.tokenContext.tokenGroups ?? {}).length).toBeGreaterThan(0);
	});
});

describe("end-to-end official-config governance", () => {
	it("treats bare vocabulary literals as verified usage end to end", () => {
		const derived = deriveProjectGovernanceContext({
			default: {
				strict: true,
				tokens: { colors: { red: "#ff0000" } },
				properties: { color: { red: "#ff0000" } },
			},
		});
		const report = analyzeTokenGovernance({
			root: "/repo",
			files: [{ file: "app.tsx", content: 'export const a = tw({ color: "red" });\n' }],
			policy: derived.policy,
			tokenContext: { tokenGroups: derived.tokenGroups },
		});
		expect(report.usage[0]).toMatchObject({ strictness: "token", confidence: "verified" });
		// The token is used: not an unused candidate.
		expect(report.unusedCandidates).toHaveLength(0);
	});

	it("downgrades publicly exported tokens to review-required", () => {
		const report = analyzeTokenGovernance({
			root: "/repo",
			files: [{ file: "design.ts", content: 'export const brand = "$colors.brand";\n' }],
			policy: null,
			tokenContext: { tokenGroups: { colors: { brand: "#e11d48", legacy: "#abc123" } } },
		});
		const byId = Object.fromEntries(report.unusedCandidates.map((c) => [c.tokenId, c]));
		expect(byId["colors::brand"]).toMatchObject({
			safety: "review-required",
			boundaries: ["public-export"],
		});
		expect(byId["colors::legacy"]).toMatchObject({ safety: "safe-to-remove" });
	});
});

describe("buildGovernancePruneChangeset", () => {
	it("lists only safe-to-remove candidates deterministically", () => {
		const report = analyzeTokenGovernance({
			root: "/repo",
			files: [],
			tokenContext: { tokenGroups: { colors: { b: "#00b", a: "#00a", z: "#00c" } } },
		});
		const changeset = buildGovernancePruneChangeset(report, "example");
		expect(changeset.count).toBe(3);
		expect(changeset.content).toContain("Remove 3 unused design token(s)");
		expect(changeset.content).toContain("- `$colors.a` (colors::a)");
		expect(changeset.content).toContain("- `$colors.b` (colors::b)");
		expect(changeset.content).toContain("- `$colors.z` (colors::z)");
		expect(changeset.content!.indexOf("`$colors.a`")).toBeLessThan(
			changeset.content!.indexOf("`$colors.b`"),
		);
	});

	it("returns null content when nothing is safely removable", () => {
		const report = analyzeTokenGovernance({
			root: "/repo",
			files: [],
			tokenContext: { tokenGroups: { colors: { brand: "#e11d48" } } },
			boundaryHits: { safelist: ["colors::brand"] },
		});
		const changeset = buildGovernancePruneChangeset(report);
		expect(changeset.count).toBe(0);
		expect(changeset.content).toBeNull();
	});
});

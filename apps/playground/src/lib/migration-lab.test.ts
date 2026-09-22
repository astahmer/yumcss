import { describe, expect, test } from "vitest";
import {
	BUILTIN_CODEMOD_ADAPTER_IDS,
	CodemodAdapterId,
	MigrationRouteMaturityTag,
	MigrationRouteProofRouteId,
	PANDWIND_API_DIALECTS,
} from "pandwind-codemod/swap/browser";
import {
	MIGRATION_LAB_EXECUTION_LANE,
	MIGRATION_LAB_EXECUTION_SCOPE,
	createMigrationLab,
} from "./migration-lab.ts";

describe("migration examples", () => {
	test("projects the built-in adapter registry into both endpoint lists", () => {
		const lab = createMigrationLab();
		const sourceIds = new Set(lab.sources.map((endpoint) => endpoint.id));
		const targetIds = new Set(lab.targets.map((endpoint) => endpoint.id));

		expect(sourceIds).toContain(CodemodAdapterId.Pandwind);
		expect(sourceIds).toContain(CodemodAdapterId.StyledComponents);
		expect(targetIds).toContain(CodemodAdapterId.Pandwind);
		for (const { dialect } of PANDWIND_API_DIALECTS)
			expect(targetIds).toContain(`${CodemodAdapterId.Pandwind}/${dialect}`);
	});

	test("offers at least one scenario for every built-in adapter", () => {
		const lab = createMigrationLab();
		const covered = new Set(
			lab.sources
				.filter((endpoint) => lab.scenariosFor(endpoint.id).length > 0)
				.map((endpoint) => endpoint.id),
		);

		expect(covered).toEqual(new Set(BUILTIN_CODEMOD_ADAPTER_IDS));
	});

	test.each(PANDWIND_API_DIALECTS.map(({ dialect, label }) => [dialect, label] as const))(
		"routes to the Pandwind %s API dialect",
		(dialect, emitted) => {
			const lab = createMigrationLab();
			const target = `${CodemodAdapterId.Pandwind}/${dialect}`;
			const source =
				'import { css } from "@emotion/css";\n\n' +
				'const card = css({ color: "#3182ce", fontSize: "0.875rem" });';
			const result = lab.migrate(CodemodAdapterId.Emotion, target, source);

			expect(result.ok, target).toBe(true);
			if (!result.ok) return;
			expect(result.converted, target).toBe(1);
			expect(result.skipped, target).toBe(0);
			expect(result.residuals, target).toEqual([]);
			expect(result.code, target).toContain(`${emitted}(`);
		},
	);

	test("runs the same safe migration contract used by the codemod", () => {
		const lab = createMigrationLab();
		const result = lab.migrate(
			CodemodAdapterId.Emotion,
			CodemodAdapterId.Pandwind,
			lab.sampleFor(CodemodAdapterId.Emotion),
		);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("css.class");
		expect(result.validations[0]).toMatchObject({ valid: true, lossiness: "lossless" });
	});

	test("labels the browser proof boundary and registered route maturity", () => {
		const lab = createMigrationLab();
		const result = lab.migrate(
			CodemodAdapterId.StyledComponents,
			CodemodAdapterId.Pandwind,
			lab.sampleFor(CodemodAdapterId.StyledComponents),
		);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.execution).toMatchObject({
			lane: MIGRATION_LAB_EXECUTION_LANE.Sandbox,
			scope: MIGRATION_LAB_EXECUTION_SCOPE.BrowserAdapterProgram,
			verified: expect.arrayContaining(["adapter-program", "residual-report"]),
		});
		expect(result.routeProof).toMatchObject({
			id: MigrationRouteProofRouteId.StyledComponentsToPandwind,
			maturity: MigrationRouteMaturityTag.Experimental,
		});
	});

	test("returns an explicit error for a route the registry does not know", () => {
		const lab = createMigrationLab();
		const result = lab.migrate("not-a-source", CodemodAdapterId.Pandwind, "const value = 1;");

		expect(result).toEqual({
			ok: false,
			message: "unknown source style dialect: not-a-source",
		});
	});

	test("keeps every registered sample on the safe migration path", () => {
		const lab = createMigrationLab();
		for (const source of lab.sources) {
			const result = lab.migrate(source.id, CodemodAdapterId.Pandwind, lab.sampleFor(source.id));
			expect(result.ok, source.id).toBe(true);
			if (!result.ok) continue;
			if (source.id !== CodemodAdapterId.Pandwind) {
				// Fail-closed preprocessor sources (no compiler in the browser lab)
				// are preserved verbatim by contract; every other source must rewrite.
				const failClosed =
					(source.id === CodemodAdapterId.Sass || source.id === CodemodAdapterId.Less) &&
					result.converted === 0 &&
					result.residuals.length > 0;
				if (!failClosed) expect(result.code, source.id).not.toBe(lab.sampleFor(source.id));
				expect(
					result.converted + result.skipped + result.residuals.length,
					source.id,
				).toBeGreaterThan(0);
			}
		}
	});

	test("does not report residuals for the built-in Tokenami and UnoCSS samples", () => {
		const lab = createMigrationLab();
		for (const id of [CodemodAdapterId.Tokenami, CodemodAdapterId.UnoCSS]) {
			const result = lab.migrate(id, CodemodAdapterId.Pandwind, lab.sampleFor(id));
			expect(result.ok, id).toBe(true);
			if (!result.ok) continue;
			expect(result.skipped, id).toBe(0);
			expect(result.residuals, id).toEqual([]);
		}
	});

	test("uses a static class plus host binding for a dynamic styled subject", () => {
		const lab = createMigrationLab();
		const result = lab.migrate(
			CodemodAdapterId.StyledComponents,
			CodemodAdapterId.Tailwind,
			'import styled from "styled-components";\n' +
				"const Card = styled.div({ color: theme.foreground });\n" +
				"export const App = () => <Card />;",
		);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("const Card = (props) =>");
		expect(result.code).toContain("theme.foreground");
		expect(result.code).toContain("<Card />");
		expect(result.code).not.toContain("pandwind:migrate-skip");
	});

	test("keeps an exported styled component usable across module boundaries", () => {
		const lab = createMigrationLab();
		const scenario = lab
			.scenariosFor(CodemodAdapterId.StyledComponents)
			.find(({ name }) => name === "styled component subject");

		expect(scenario).toBeDefined();
		if (scenario === undefined) return;
		const result = lab.migrate(
			CodemodAdapterId.StyledComponents,
			CodemodAdapterId.Pandwind,
			scenario.source,
		);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("const __pandwindSlot =");
		expect(result.code).toContain("export const Card = __pandwindSlot({ defaultComponent: (Link),");
		expect(result.code).not.toMatch(/export const Card = css\.class\(/u);
	});

	test("keeps an exported keyframe name usable across module boundaries", () => {
		const lab = createMigrationLab();
		const scenario = lab
			.scenariosFor(CodemodAdapterId.StyledComponents)
			.find(({ name }) => name === "keyframes tagged template");

		expect(scenario).toBeDefined();
		if (scenario === undefined) return;
		const result = lab.migrate(
			CodemodAdapterId.StyledComponents,
			CodemodAdapterId.Pandwind,
			`${scenario.source}\nexport const animationName = pulse;`,
		);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("export const pulse = (() =>");
		expect(result.code).toContain("return name; })();");
		expect(result.code).toContain("export const animationName = pulse;");
	});

	test("exposes explicit evidence for every source-to-target route", () => {
		const lab = createMigrationLab();
		for (const source of lab.sources) {
			for (const target of lab.targets) {
				const result = lab.migrate(source.id, target.id, lab.sampleFor(source.id));
				expect(result.ok, `${source.id} -> ${target.id}`).toBe(true);
				if (!result.ok) continue;
				if (source.id === target.id) {
					expect(result.changed, `${source.id} -> ${target.id}`).toBe(false);
					expect(result.skipped, `${source.id} -> ${target.id}`).toBe(0);
					expect(result.residuals, `${source.id} -> ${target.id}`).toEqual([]);
					continue;
				}
				const evidence = result.converted + result.skipped + result.residuals.length;
				expect(evidence, `${source.id} -> ${target.id} has no outcome evidence`).toBeGreaterThan(0);
				if (result.skipped > 0)
					expect(
						result.residuals.length,
						`${source.id} -> ${target.id} skipped silently`,
					).toBeGreaterThan(0);
			}
		}
	});
});

import { describe, expect, test } from "vitest";
import {
	CodemodAdapterId,
	createBuiltinCodemodCatalog,
	runAdapterMigration,
} from "../src/swap/index.ts";
import { completeAdapterMatrixFixtures } from "../proof/adapter-matrix-fixtures.ts";

const catalog = createBuiltinCodemodCatalog();
const happyFixtures = new Map(
	completeAdapterMatrixFixtures
		.filter((fixture) => fixture.scenario === "happy")
		.map((fixture) => [fixture.sourceAdapter, fixture]),
);

function migrate(
	source: string,
	from: string,
	to: string,
	file: string,
	semantic: (typeof completeAdapterMatrixFixtures)[number]["semantic"],
) {
	return runAdapterMigration(source, {
		from,
		to,
		file,
		mode: "safe",
		readFile: () => undefined,
		adapterRegistry: catalog.registry,
		...(semantic === undefined ? {} : { semantic }),
	});
}

describe("adapter route round-trip contract", () => {
	test("every clean forward route remains actionable in the reverse direction", () => {
		const failures: string[] = [];
		for (const source of catalog.adapters) {
			const sourceFixture = happyFixtures.get(source.id);
			if (sourceFixture === undefined) throw new Error(`missing fixture for ${source.id}`);
			for (const target of catalog.adapters) {
				if (source.id === target.id) continue;
				const forward = migrate(
					sourceFixture.source,
					source.id,
					target.id,
					sourceFixture.file,
					sourceFixture.semantic,
				);
				if (forward.converted === 0 || forward.skipped > 0 || forward.residuals.length > 0)
					continue;
				const targetFixture = happyFixtures.get(target.id);
				if (targetFixture === undefined) throw new Error(`missing fixture for ${target.id}`);
				// A forward route can change the document dialect (for example
				// authored-css to css-modules); the reverse migration must run on
				// the emitted file name, not the original source file.
				const reverse = migrate(
					forward.code,
					target.id,
					source.id,
					forward.outputExtension === undefined
						? sourceFixture.file
						: sourceFixture.file.replace(/\.[^.]+$/u, forward.outputExtension),
					targetFixture.semantic,
				);
				const actionable =
					reverse.converted > 0 ||
					reverse.skipped > 0 ||
					reverse.residuals.length > 0 ||
					reverse.code !== forward.code ||
					forward.code !== sourceFixture.source ||
					forward.outcomes.some((outcome) => outcome.outcome === "portable-artifact");
				if (!actionable) failures.push(`${source.id} -> ${target.id}`);
			}
		}
		expect(failures).toEqual([]);
	}, 30_000);

	test.each([CodemodAdapterId.Tailwind, CodemodAdapterId.UnoCSS])(
		"parses a generated standalone class literal in a module",
		(targetId) => {
			const result = migrate(
				'css.class({ color: "red", display: "flex" })',
				CodemodAdapterId.Pandwind,
				targetId,
				"Card.tsx",
				undefined,
			);
			const generated = `import { Box } from "@example/host"; ${result.code}`;
			const reverse = migrate(
				generated,
				targetId,
				CodemodAdapterId.Pandwind,
				"Card.tsx",
				undefined,
			);
			expect(result.residuals).toEqual([]);
			expect(reverse.converted).toBeGreaterThan(0);
			expect(reverse.residuals).toEqual([]);
			expect(reverse.code).toContain("css.class");
		},
	);

	test("does not treat a commented arbitrary class as executable source", () => {
		const adapter = catalog.registry.get(CodemodAdapterId.Tailwind)!;
		const source = '// "[color:red]"\nconst value = "plain";';
		const parsed = adapter.parse(source, {
			file: "comment.ts",
			source,
			config: adapter.loadConfig({ file: "comment.ts", source }),
		});
		expect(parsed.matches).toEqual([]);
	});

	test("preserves a single named rule through a Tailwind class map", () => {
		const catalog = createBuiltinCodemodCatalog();
		const forward = migrate(
			'import { createUseStyles } from "react-jss";\n' +
				"createUseStyles({ button: { color: 'red' } })",
			CodemodAdapterId.Jss,
			CodemodAdapterId.Tailwind,
			"styles.ts",
			undefined,
		);
		const reverse = runAdapterMigration(forward.code, {
			from: CodemodAdapterId.Tailwind,
			to: CodemodAdapterId.Jss,
			file: "styles.ts",
			mode: "safe",
			readFile: () => undefined,
			adapterRegistry: catalog.registry,
		});

		expect(forward.residuals).toEqual([]);
		expect(reverse.residuals).toEqual([]);
		expect(reverse.code).toContain("button");
	});

	test("removes an aliased Panda generated import without shadowing Pandwind css", () => {
		const result = migrate(
			'import { css } from "@/styled-system/css";\nconst card = css({ color: "red" });',
			CodemodAdapterId.Panda,
			CodemodAdapterId.Pandwind,
			"Card.tsx",
			undefined,
		);

		expect(result.residuals).toEqual([]);
		expect(result.skipped).toBe(0);
		expect(result.code).not.toContain("styled-system/css");
		expect(result.code).toMatchInlineSnapshot(`
			"import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			const card = css.class({ color: "red" });"
		`);
	});

	test("removes the Pandwind helper when returning to Emotion's css binding", () => {
		const forward = migrate(
			'import { css } from "@emotion/css";\nconst card = css({ color: "red" });',
			CodemodAdapterId.Emotion,
			CodemodAdapterId.Pandwind,
			"Card.tsx",
			undefined,
		);
		const reverse = migrate(
			forward.code,
			CodemodAdapterId.Pandwind,
			CodemodAdapterId.Emotion,
			"Card.tsx",
			undefined,
		);

		expect(forward.residuals).toEqual([]);
		expect(reverse.residuals).toEqual([]);
		expect(reverse.skipped).toBe(0);
		expect(reverse.code).not.toContain("createCss");
		expect(reverse.code).toMatchInlineSnapshot(`
			"import { css } from "@emotion/css";

			const card = css({ color: "red" });"
		`);
	});
});

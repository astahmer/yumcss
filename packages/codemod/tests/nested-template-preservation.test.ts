import { expect, test } from "vitest";
import { CodemodAdapterId, runAdapterMigration } from "@yumcss/codemod/swap";

const source = 'import { css, styled } from "next-yak";\nconst Card = styled.div`color: red; ${({ active }) => active && css`padding: 1rem;`}`;';

test("preserves an unsupported Next-yak template including nested static CSS", () => {
	const result = runAdapterMigration(source, {
		from: CodemodAdapterId.NextYak,
		to: CodemodAdapterId.YumCSS,
		file: "Card.tsx",
		semantic: { source: { framework: "react" } },
	});
	expect(result.converted).toBe(0);
	expect(result.code).toContain(source.slice(source.indexOf("const Card")));
	expect(result.residuals).toMatchObject([
		{ kind: "dynamic", hint: "styled nested template interpolation requires a host-specific lowering" },
	]);
	expect(result.code).toMatchInlineSnapshot(`
		"// yumcss:migrate-skip (route: next-yak -> yumcss | parse-residual: dynamic)
		import { css, styled } from "next-yak";
		const Card = styled.div\`color: red; \${({ active }) => active && css\`padding: 1rem;\`}\`;"
	`);
});

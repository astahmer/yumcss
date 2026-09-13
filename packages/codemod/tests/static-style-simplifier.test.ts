import { describe, expect, it } from "vitest";
import { simplifyPandwindStaticStyles } from "../src/swap/static-style-simplifier.ts";

describe("simplifyPandwindStaticStyles", () => {
	it("merges static classes and promotes Stack layout to native props", () => {
		const source = `import { cx } from "./pandwind/cx";

const View = () => (
		<Stack className={cx(
			css.class({ display: "flex", flexDirection: "column", gap: "0", alignItems: "center", color: "red" }),
			css.class({ padding: "2" }),
		)} />
);
`;

		const result = simplifyPandwindStaticStyles(source, "View.tsx");

		expect(result.changed).toBe(true);
		expect(result.code).toContain(
			'<Stack direction="column" gap="0" padding="2" align="center" className={css.class({ color: "red" })} />',
		);
		expect(result.code).not.toContain("cx(");
		expect(result.code).not.toContain('from "./pandwind/cx"');
	});

	it("keeps dynamic class composition intact", () => {
		const source = `import { cx } from "./pandwind/cx";
const className = "external";
const View = () => <div className={cx(css.class({ color: "red" }), className)} />;
`;

		const result = simplifyPandwindStaticStyles(source, "View.tsx");

		expect(result.changed).toBe(false);
		expect(result.code).toBe(source);
	});

	it("promotes static Stack layout while preserving a dynamic class", () => {
		const source = `import { cx } from "./pandwind/cx";
const View = ({ className }: { className?: string }) => (
		<Stack className={cx(css.class({ display: "flex", flexDirection: "column", alignItems: "center", color: "red" }), className)} />
);
`;

		const result = simplifyPandwindStaticStyles(source, "View.tsx");

		expect(result.code).toContain(
			'<Stack direction="column" align="center" className={cx(css.class({ color: "red" }), className)} />',
		);
		expect(result.code).toContain('import { cx } from "./pandwind/cx";');
	});

	it("keeps responsive Stack values in the class", () => {
		const source = `<Stack className={css.class({
			display: "flex",
			flexDirection: "column",
			gap: { base: "2", md: "4" },
			padding: "2",
			alignItems: "center",
		})} />;
`;

		const result = simplifyPandwindStaticStyles(source, "View.tsx");

		expect(result.code).toContain('direction="column"');
		expect(result.code).toContain('padding="2"');
		expect(result.code).toContain('align="center"');
		expect(result.code).toContain('className={css.class({ gap: { base: "2", md: "4" } })}');
		expect(result.code).not.toContain('display: "flex"');
		expect(result.code).not.toContain('flexDirection: "column"');
	});

	it("merges duplicate primitive declarations with last-wins semantics", () => {
		const source = `<div className={cx(css.class({ color: "red" }), css.class({ color: "blue" }))} />;`;

		const result = simplifyPandwindStaticStyles(source, "View.tsx");

		expect(result.changed).toBe(true);
		expect(result.code).toContain('className={css.class({ color: "blue" })}');
	});

	it("merges responsive declarations by condition", () => {
		const source = `<div className={cx(css.class({ color: { base: "red", md: "green" } }), css.class({ color: { base: "blue" } }))} />;`;

		const result = simplifyPandwindStaticStyles(source, "View.tsx");

		expect(result.changed).toBe(true);
		expect(result.code).toContain(
			'className={css.class({ color: { base: "blue", md: "green" } })}',
		);
	});
});

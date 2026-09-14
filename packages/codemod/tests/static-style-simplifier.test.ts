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
		expect(result.code).toContain('const staticClassName1 = css.class({ color: "red" });');
		expect(result.code).toContain(
			'<Stack direction="column" gap="0" padding="2" align="center" className={staticClassName1} />',
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

		expect(result.changed).toBe(true);
		expect(result.code).toContain('const staticClassName1 = css.class({ color: "red" });');
		expect(result.code).toContain("className={css.props(staticClassName1, className).className}");
		expect(result.code).not.toContain('from "./pandwind/cx"');
	});

	it("promotes static Stack layout while preserving a dynamic class", () => {
		const source = `import { cx } from "./pandwind/cx";
const View = ({ className }: { className?: string }) => (
		<Stack className={cx(css.class({ display: "flex", flexDirection: "column", alignItems: "center", color: "red" }), className)} />
);
`;

		const result = simplifyPandwindStaticStyles(source, "View.tsx");

		expect(result.code).toContain(
			'<Stack direction="column" align="center" className={css.props(staticClassName1, className).className} />',
		);
		expect(result.code).not.toContain('import { cx } from "./pandwind/cx";');
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

	it("leaves dynamic style values inside the render function", () => {
		const source = `const View = ({ color }: { color: string }) =>
			<div className={css.class({ color })} />;
`;

		const result = simplifyPandwindStaticStyles(source, "View.tsx");

		expect(result.changed).toBe(false);
		expect(result.code).toBe(source);
	});

	it("hoists a named static carrier instead of leaving a render-local alias", () => {
		const source = `import { css } from "./pandwind/css";

const View = () => {
		const chipClassName = css.class({ color: "red" });
		return <div className={chipClassName} />;
};
`;

		const result = simplifyPandwindStaticStyles(source, "View.tsx");

		expect(result.code).toContain('const chipClassName = css.class({ color: "red" });');
		expect(result.code).toContain("return <div className={chipClassName} />;");
		expect(result.code).not.toContain("const chipClassName = staticClassName");
		expect(result.code).toContain('from "./pandwind/css"');
	});

	it("passes hoisted static carriers through css.props instead of cx", () => {
		const source = `import { cx } from "./pandwind/cx";
import { css } from "./pandwind/css";

const baseClassName = css.class({ color: "red" });
const View = ({ className }: { className?: string }) => (
		<div className={cx(baseClassName, cx("external", className))} />
);
`;

		const result = simplifyPandwindStaticStyles(source, "View.tsx");

		expect(result.code).toContain(
			'className={css.props(baseClassName, "external", className).className}',
		);
		expect(result.code).not.toContain("cx(");
		expect(result.code).not.toContain('from "./pandwind/cx"');
	});

	it("collapses css.props when every carrier is static", () => {
		const source = `import { css } from "./pandwind/css";

const baseClassName = css.class({ color: "red" });
const emphasisClassName = css.class({ fontWeight: "700" });
const View = () => <div className={css.props(baseClassName, emphasisClassName).className} />;
`;

		const result = simplifyPandwindStaticStyles(source, "View.tsx");

		expect(result.code).toContain(
			'const staticClassName1 = css.class({ color: "red", fontWeight: "700" });',
		);
		expect(result.code).toContain("className={staticClassName1}");
		expect(result.code).not.toContain("baseClassName");
		expect(result.code).not.toContain("emphasisClassName");
		expect(result.code).not.toContain("css.props(");
	});

	it("keeps css.props when a carrier is combined with a runtime class", () => {
		const source = `import { css } from "./pandwind/css";

const baseClassName = css.class({ color: "red" });
const View = ({ className }: { className?: string }) => (
		<div className={css.props(baseClassName, className).className} />
);
`;

		const result = simplifyPandwindStaticStyles(source, "View.tsx");

		expect(result.code).toContain("css.props(baseClassName, className).className");
	});

	it("merges contiguous static css.props carriers around runtime values", () => {
		const source = `import { css } from "./pandwind/css";

const baseClassName = css.class({ color: "red" });
const emphasisClassName = css.class({ fontWeight: "700" });
const View = ({ className }: { className?: string }) => (
		<div className={css.props(baseClassName, emphasisClassName, className).className} />
);
`;

		const result = simplifyPandwindStaticStyles(source, "View.tsx");

		expect(result.code).toContain("className={css.props(staticClassName1, className).className}");
		expect(result.code).toContain(
			'const staticClassName1 = css.class({ color: "red", fontWeight: "700" });',
		);
		expect(result.code).not.toContain("baseClassName");
		expect(result.code).not.toContain("emphasisClassName");
	});

	it("preserves dynamic and static class order", () => {
		const source = `import { cx } from "./pandwind/cx";
import { css } from "./pandwind/css";

const View = ({ className }: { className?: string }) => (
		<div className={cx(className, css.class({ color: "red" }))} />
);
`;

		const result = simplifyPandwindStaticStyles(source, "View.tsx");

		expect(result.code).toContain("className={css.props(className, staticClassName1).className}");
		expect(result.code).not.toContain("cx(");
	});

	it("removes an unused css import after Stack migration", () => {
		const source = `import { css } from "./pandwind/css";

const View = () => <Stack direction="column" />;
`;

		const result = simplifyPandwindStaticStyles(source, "View.tsx");

		expect(result.code).not.toContain('from "./pandwind/css"');
	});

	it("preserves authored static class declarations when no composition was simplified", () => {
		const source = `import { createCss } from "pandwind/css";
const css = createCss();
const card = css.class({ color: "red" });
`;

		const result = simplifyPandwindStaticStyles(source, "unused.ts");

		expect(result.code).toContain('const card = css.class({ color: "red" });');
	});

	it("inserts hoisted classes after a module css initializer", () => {
		const source = `import { createCss } from "pandwind/css";
const css = createCss();

const View = () => <div className={css.class({ color: "red" })} />;
`;

		const result = simplifyPandwindStaticStyles(source, "View.tsx");

		expect(result.code.indexOf("const css = createCss();")).toBeLessThan(
			result.code.indexOf('const staticClassName1 = css.class({ color: "red" });'),
		);
	});
});

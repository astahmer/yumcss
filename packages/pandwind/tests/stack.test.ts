/**
 * `<Stack>` erasure tests — mapping table, differential vs hand-written
 * classes, and the vite fold pass (static folds, dynamic stays runtime).
 */
import { describe, expect, test } from "vitest";
import { stackClasses } from "../src/stack/index.ts";
import { foldStackElements } from "../src/vite/stack-fold.ts";

describe("stackClasses — mapping table", () => {
	test("bare flex when empty", () => {
		expect(stackClasses({})).toBe("flex");
	});

	test("deterministic order: flex → direction → gap → padding → align → justify", () => {
		expect(
			stackClasses({
				justify: "between",
				align: "center",
				padding: "6",
				gap: "4",
				direction: "column",
			}),
		).toBe("flex flex-col gap-4 p-6 items-center justify-between");
	});

	test("direction variants", () => {
		expect(stackClasses({ direction: "row" })).toBe("flex flex-row");
		expect(stackClasses({ direction: "column" })).toBe("flex flex-col");
		expect(stackClasses({ direction: "row-reverse" })).toBe("flex flex-row-reverse");
		expect(stackClasses({ direction: "column-reverse" })).toBe("flex flex-col-reverse");
	});

	test("unknown values pass through verbatim after the prefix", () => {
		expect(stackClasses({ gap: "3.5", padding: "px" })).toBe("flex gap-3.5 p-px");
	});
});

describe("differential — folded output equals hand-written div classes", () => {
	const cases: Array<[Parameters<typeof stackClasses>[0], string]> = [
		[{ direction: "column", gap: "4" }, "flex flex-col gap-4"],
		[
			{ direction: "row", padding: "6", align: "center", justify: "end" },
			"flex flex-row p-6 items-center justify-end",
		],
	];
	for (const [props, handwritten] of cases) {
		test(`stackClasses(${JSON.stringify(props)}) === "${handwritten}"`, () => {
			expect(stackClasses(props)).toBe(handwritten);
		});
	}
});

describe("foldStackElements — vite fold pass", () => {
	test("static usage folds to a static div with identical classes", () => {
		const src = `import { Stack } from "pandwind/stack";\nexport const A = <Stack direction="column" gap={4}>hi</Stack>;`;
		const out = foldStackElements(src, "a.tsx");
		expect(out.folded).toBe(1);
		expect(out.code).toContain(`<div className="flex flex-col gap-4">hi</div>`);
		expect(out.code).not.toContain("Stack");
		expect(out.code).not.toContain('from "pandwind/stack"');
	});

	test("dynamic prop keeps the whole element runtime", () => {
		const src = `import { Stack } from "pandwind/stack";\nexport const B = <Stack gap={dyn}>hi</Stack>;`;
		const out = foldStackElements(src, "b.tsx");
		expect(out.folded).toBe(0);
		expect(out.code).toBe(src);
	});

	test("unknown attributes pass through onto the div; known literals still fold", () => {
		const src = `<Stack direction="row" onClick={handler} data-x="1"><span/></Stack>`;
		const out = foldStackElements(src, "c.tsx");
		expect(out.folded).toBe(1);
		expect(out.code).toContain(`onClick={handler}`);
		expect(out.code).toContain(`data-x="1"`);
		expect(out.code).toContain(`className="flex flex-row"`);
	});

	test("self-closing form folds", () => {
		const out = foldStackElements(`<Stack padding="2" />`, "d.tsx");
		expect(out.code).toBe(`<div className="flex p-2" />`);
	});

	test("mixed file: static folds, dynamic sibling untouched, import kept for the dynamic one", () => {
		const src = `import { Stack } from "pandwind/stack";\nexport const A = () => (<><Stack gap="2" /><Stack gap={g} /></>);`;
		const out = foldStackElements(src, "e.tsx");
		expect(out.folded).toBe(1);
		expect(out.code).toContain(`<div className="flex gap-2" />`);
		expect(out.code).toContain(`<Stack gap={g} />`);
		expect(out.code).toContain('from "pandwind/stack"');
	});
});

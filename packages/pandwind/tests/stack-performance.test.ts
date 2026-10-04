import { performance } from "node:perf_hooks";
import { expect, test } from "vitest";
import { foldStackElements } from "../src/vite/stack-fold.ts";

test("scales source edits across large JSX files", () => {
	const sourceFor = (count: number): string =>
		`import { Stack } from "pandwind/stack";\nexport const view = <>${Array.from(
			{ length: count },
			(_, index) => `<Stack gap={${index % 8}} />`,
		).join("")}</>;`;
	const measureMedian = (source: string, count: number): number => {
		const samples: number[] = [];
		for (let sample = 0; sample < 3; sample++) {
			const started = performance.now();
			const result = foldStackElements(source, "/src/large-stack.tsx");
			samples.push(performance.now() - started);
			expect(result.folded).toBe(count);
			expect(result.code.match(/<div className=/gu)).toHaveLength(count);
		}
		return samples.toSorted((left, right) => left - right)[1]!;
	};
	const smallSource = sourceFor(200);
	const largeSource = sourceFor(2_000);

	measureMedian(smallSource, 200);
	const smallMs = measureMedian(smallSource, 200);
	const largeMs = measureMedian(largeSource, 2_000);

	expect(largeMs / smallMs, `${smallMs.toFixed(1)}ms -> ${largeMs.toFixed(1)}ms`).toBeLessThan(30);
});

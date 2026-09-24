import { describe, expect, test } from "vitest";
import { createCompilerDiff } from "./compiler-diff.ts";

describe("createCompilerDiff", () => {
	test("compares source with the Vite output for the same file", () => {
		const source = "const button = css.class({ color: tone });\n";
		const code = 'const button = "btn_abc";\n';
		const diff = createCompilerDiff({ file: "Button.tsx", source, code });
		const changes = diff.hunks.flatMap((hunk) =>
			hunk.hunkContent.filter((part) => part.type === "change"),
		);

		expect(diff.name).toBe("Button.tsx");
		expect(diff.type).toBe("change");
		expect(changes).toHaveLength(1);
		const change = changes[0];
		if (change === undefined) throw new Error("Expected a compiler output change");
		expect(
			diff.deletionLines.slice(
				change.deletionLineIndex,
				change.deletionLineIndex + change.deletions,
			),
		).toEqual(["const button = css.class({ color: tone });\n"]);
		expect(
			diff.additionLines.slice(
				change.additionLineIndex,
				change.additionLineIndex + change.additions,
			),
		).toEqual(['const button = "btn_abc";\n']);
	});

	test("produces no changed hunks for unchanged compiler output", () => {
		const source = "const button = 'ready';\n";
		const diff = createCompilerDiff({ file: "Button.tsx", source, code: source });

		expect(diff.type).toBe("change");
		expect(diff.hunks).toEqual([]);
	});
});

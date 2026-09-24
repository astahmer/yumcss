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
		expect(diff.oldLines?.join("\n")).toContain("css.class");
		expect(diff.newLines?.join("\n")).toContain('"btn_abc"');
		expect(changes).toHaveLength(1);
		expect(changes[0]).toMatchObject({
			deletions: ["const button = css.class({ color: tone });"],
			additions: ['const button = "btn_abc";'],
		});
	});

	test("produces no changed hunks for unchanged compiler output", () => {
		const source = "const button = 'ready';\n";
		const diff = createCompilerDiff({ file: "Button.tsx", source, code: source });

		expect(diff.type).toBe("change");
		expect(diff.hunks).toEqual([]);
	});
});

import { describe, expect, test } from "vitest";
import { FileSystemDesignSystemArtifactWriter } from "../src/tw/codegen-artifacts.ts";

describe("DesignSystemArtifactWriter", () => {
	test("writes only the artifacts present in the bundle", () => {
		const files = new Map<string, string>();
		const writer = new FileSystemDesignSystemArtifactWriter(
			(path, contents) => files.set(path, contents),
			(directory, file) => `${directory}/${file}`,
		);

		writer.write("generated", { typesDts: "types", twTs: "runtime", themeBlock: "@theme {}" });

		expect([...files]).toEqual([
			["generated/types.d.ts", "types"],
			["generated/tw.ts", "runtime"],
			["generated/pandwind-theme.css", "@theme {}\n"],
		]);
	});
});

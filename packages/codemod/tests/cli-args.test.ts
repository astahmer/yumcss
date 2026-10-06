import { describe, expect, it } from "vitest";
import { parseMigrateArgs } from "../src/swap/cli-args.ts";

describe("migrate CLI static style hoisting", () => {
	it("keeps static style calls colocated by default", () => {
		expect(parseMigrateArgs(["--from=styled-components", "--to=yumcss-css", "src"])).toMatchObject({
			hoistStaticStyles: false,
		});
	});

	it("allows source hoisting as an explicit opt-in", () => {
		expect(
			parseMigrateArgs([
				"--from=styled-components",
				"--to=yumcss-css",
				"--hoist-static-styles",
				"src",
			]),
		).toMatchObject({ hoistStaticStyles: true });
	});

	it("accepts an explicit false value", () => {
		expect(
			parseMigrateArgs([
				"--from=styled-components",
				"--to=yumcss-css",
				"--hoist-static-styles=false",
				"src",
			]),
		).toMatchObject({ hoistStaticStyles: false });
	});

	it("accepts an explicit true value", () => {
		expect(
			parseMigrateArgs([
				"--from=styled-components",
				"--to=yumcss-css",
				"--hoist-static-styles=true",
				"src",
			]),
		).toMatchObject({ hoistStaticStyles: true });
	});
});

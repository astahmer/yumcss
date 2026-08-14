import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { collectTwClasses } from "../src/tw/collect.ts";

const app = resolve(import.meta.dirname, "../../../apps/example");

describe("tw scanner", () => {
	test("collects exactly the classes a tw() call emits", async () => {
		const classes = await collectTwClasses(
			[resolve(app, "src/css-in-js-app.tsx")],
			resolve(app, "src/tw.ts"),
		);

		expect(classes).toContain("sm:flex");
		expect(classes).toContain("dark:text-gray-300");
		expect(classes).toContain("flex flex-col".split(" ")[1]);
		expect(classes).toContain("focus-visible:outline-2");
		expect(classes).toContain("ring-gray-900/5");
	});
});

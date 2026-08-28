import { describe, expect, test } from "vitest";
import { CollectionToolkit } from "./facade.ts";

describe("CollectionToolkit facade", () => {
	test("keeps collection responsibilities behind one domain object", () => {
		expect(CollectionToolkit.groupThemeVars).toBeTypeOf("function");
		expect(CollectionToolkit.collectCssDiagnostics).toBeTypeOf("function");
		expect(CollectionToolkit.createCssBudgetService).toBeTypeOf("function");
	});
});

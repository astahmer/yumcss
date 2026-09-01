import { describe, expect, test } from "vitest";
import {
	CodemodAdapterId,
	createBuiltinCodemodCatalog as createBrowserCodemodCatalog,
	runAdapterMigration as runBrowserAdapterMigration,
} from "../src/swap/browser.ts";
import type { ProjectMigrationCommand } from "../src/swap/project-command.ts";
import type { SwapIR } from "../src/swap/ir.ts";
import type { SwapOutboundAdapter } from "../src/swap/outbound.ts";

describe("codemod public source surfaces", () => {
	test("keeps the browser entry point executable and filesystem-free", () => {
		const catalog = createBrowserCodemodCatalog();
		const result = runBrowserAdapterMigration('css.class({ color: "red" })', {
			from: CodemodAdapterId.Pandwind,
			to: CodemodAdapterId.Emotion,
			file: "Card.tsx",
			adapterRegistry: catalog.registry,
		});

		expect(catalog.adapters.length).toBeGreaterThan(1);
		expect(result.converted).toBe(1);
		expect(result.residuals).toEqual([]);
	});

	test("keeps type-only swap ports part of the compile-time contract", () => {
		const swap: SwapIR = { entries: [], residuals: [] };
		const outbound: SwapOutboundAdapter = {
			id: "test",
			emit: () => ({ text: "", residuals: [] }),
		};
		const command: ProjectMigrationCommand = {
			id: "test",
			run: async () => undefined,
		};

		expect(swap.entries).toEqual([]);
		expect(outbound.id).toBe("test");
		expect(command.id).toBe("test");
	});
});

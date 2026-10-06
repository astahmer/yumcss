import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	createEffectToolingFileSystem,
	createEffectToolingTaskRunner,
	ToolingTaskError,
} from "../../../scripts/effect-tooling.ts";

describe("Effect tooling ports", () => {
	it("preserves task order while bounding concurrency", async () => {
		const runner = createEffectToolingTaskRunner();
		let active = 0;
		let peak = 0;
		const results = await runner.run(
			[0, 1, 2, 3].map((value) => ({
				id: `task-${value}`,
				run: async () => {
					active++;
					peak = Math.max(peak, active);
					await new Promise((resolve) => setTimeout(resolve, 5));
					active--;
					return value;
				},
			})),
			{ concurrency: 2 },
		);

		expect(results).toEqual([0, 1, 2, 3]);
		expect(peak).toBe(2);
	});

	it("retains the task identity when a batch fails", async () => {
		const runner = createEffectToolingTaskRunner();

		await expect(
			runner.run([
				{
					id: "broken-reference",
					run: async () => {
						throw new Error("missing checkout");
					},
				},
			]),
		).rejects.toMatchObject({
			name: "ToolingTaskError",
			taskId: "broken-reference",
		});
	});

	it("interrupts an in-flight batch", async () => {
		const runner = createEffectToolingTaskRunner();
		const controller = new AbortController();
		const pending = runner.run(
			[
				{
					id: "long-running",
					run: () => new Promise(() => undefined),
				},
			],
			{ signal: controller.signal },
		);
		controller.abort();

		await expect(pending).rejects.toBeDefined();
	});

	it("uses the official Effect 4 Node filesystem and path services", async () => {
		const directory = mkdtempSync(join(tmpdir(), "yumcss-effect-"));
		try {
			const fileSystem = createEffectToolingFileSystem();
			const nested = await fileSystem.resolve(directory, "nested");
			const file = await fileSystem.resolve(nested, "proof.txt");

			await fileSystem.ensureDirectory(nested);
			await fileSystem.writeText(file, "effect-backed tooling");

			expect(await fileSystem.exists(file)).toBe(true);
			expect(await fileSystem.readText(file)).toBe("effect-backed tooling");
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});

	it("rejects invalid concurrency before creating an Effect", async () => {
		const runner = createEffectToolingTaskRunner();

		await expect(runner.run([], { concurrency: 0 })).rejects.toThrow(
			"tooling task concurrency must be a positive integer",
		);
		// Keep the public error type exercised as part of the port contract.
		expect(new ToolingTaskError("sample", "cause")).toMatchObject({ taskId: "sample" });
	});
});

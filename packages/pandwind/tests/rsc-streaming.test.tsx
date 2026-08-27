import { Writable } from "node:stream";
import * as React from "react";
import { renderToPipeableStream } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { createRuntimeSheet } from "../src/css/runtime-sheet.ts";

describe("React server streaming and runtime-sheet hydration", () => {
	test("keeps semantic rules stable across a streamed server render", async () => {
		const serverSheet = createRuntimeSheet({ id: "rsc-fixture", autoMount: false });
		function ServerStyleBoundary() {
			serverSheet.registerSemanticRules([
				{
					id: "rsc-card",
					kind: "style",
					selector: ".rsc-card",
					declarations: [{ property: "color", value: "red" }],
				},
			]);
			return React.createElement("article", { className: "rsc-card" }, "streamed");
		}

		const chunks: Buffer[] = [];
		const output = new Writable({
			write(chunk: Buffer, _encoding, callback) {
				chunks.push(Buffer.from(chunk));
				callback();
			},
		});
		await new Promise<void>((resolve, reject) => {
			const stream = renderToPipeableStream(React.createElement(ServerStyleBoundary), {
				onShellReady: () => stream.pipe(output),
				onError: reject,
				onAllReady: resolve,
			});
		});

		expect(Buffer.concat(chunks).toString()).toContain("rsc-card");
		expect(serverSheet.css()).toBe(".rsc-card{color:red}");

		const clientSheet = createRuntimeSheet({ id: "rsc-fixture", autoMount: false });
		clientSheet.hydrate(serverSheet.snapshot());
		expect(clientSheet.css()).toBe(serverSheet.css());
		expect(clientSheet.snapshot().rules).toHaveLength(1);
	});
});

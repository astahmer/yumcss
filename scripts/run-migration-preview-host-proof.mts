import { createServer } from "node:http";
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { createBrowserMigrationPreviewHost } from "../packages/analyze/src/migration-preview/browser-preview.ts";
import type { MigrationPreviewRequest } from "../packages/analyze/src/migration-preview/contracts.ts";

const root = resolve(import.meta.dirname, "..");
const requireFromShowcase = createRequire(join(root, "examples/showcase/package.json"));
const { chromium } = requireFromShowcase("playwright-core") as typeof import("playwright-core");
const server = createServer((_request, response) => {
	response.setHeader("content-type", "text/html");
	response.end("<!doctype html><html><head></head><body></body></html>");
});

await new Promise<void>((resolveServer) => server.listen(0, "127.0.0.1", resolveServer));
const address = server.address();
if (address === null || typeof address === "string")
	throw new Error("host proof server did not start");

const browser = await chromium.launch();
const host = createBrowserMigrationPreviewHost({
	url: `http://127.0.0.1:${address.port}/preview`,
	browser: {
		async newPage() {
			const page = await browser.newPage();
			return {
				goto: (url) => page.goto(url).then(() => undefined),
				evaluate: <TOutput,>(operation: string) => page.evaluate(operation) as Promise<TOutput>,
				close: () => page.close(),
			};
		},
		close: () => browser.close(),
	},
});
const request = {
	evaluation: {
		artifacts: {
			targetCss: ".pandwind-migration-preview-probe { color: rgb(239, 68, 68); padding: 4px; }",
			files: [],
		},
		diagnostics: [],
	},
	selection: null,
	target: null,
	theme: { scope: null },
	workspace: {},
} as MigrationPreviewRequest;

try {
	const snapshot = await host.start!(request);
	const color = snapshot.computedStyles?.color;
	if (color !== "rgb(239, 68, 68)")
		throw new Error(`Migration preview host proof expected computed color, received ${color ?? "<missing>"}`);
	const report = {
		schema: "pandwind.migration-preview-host-proof/1",
		host: snapshot.host,
		status: snapshot.status,
		computedColor: color,
		computedPadding: snapshot.computedStyles?.padding,
		stylesheetBytes: snapshot.stylesheetBytes,
	};
	const output =
		process.env.PANDWIND_MIGRATION_PREVIEW_HOST_PROOF_OUTPUT ??
		resolve(root, "plans/evidence/migration-preview-host-proof.json");
	writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
	console.log(JSON.stringify(report, null, 2));
} finally {
	await host.stop?.();
	await new Promise<void>((resolveServer) => server.close(() => resolveServer()));
}

import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createInMemoryMigrationPreviewUiProvider } from "../packages/analyze/src/migration-preview/ui-provider.ts";
import { createMigrationPreviewCodemodEvaluator } from "../packages/analyze/src/migration-preview/evaluator.ts";
import { createMigrationPreviewServer } from "../packages/analyze/src/migration-preview/server.ts";
import { createMigrationPreviewSession } from "../packages/analyze/src/migration-preview/session.ts";
import { createMigrationPreviewWorkspace } from "../packages/analyze/src/migration-preview/workspace.ts";

const root = resolve("packages/analyze/tests/fixtures/migration-preview");
// The e2e suite drives the real built migration-preview app so the browser contract is
// the production DOM, not a test-only page.
execSync("pnpm run build:ui", { cwd: resolve("packages/analyze"), stdio: "inherit" });
const ui = createInMemoryMigrationPreviewUiProvider(
	await readFile(resolve("packages/analyze/dist/migration-preview-ui/index.html"), "utf8"),
);
const evaluator = createMigrationPreviewCodemodEvaluator();
const workspace = createMigrationPreviewWorkspace({ watcher: { watch: () => () => undefined } });
const session = createMigrationPreviewSession({ workspace, evaluation: evaluator, adapters: evaluator });
const server = await createMigrationPreviewServer({
	session,
	host: "127.0.0.1",
	port: 5176,
	token: "migration-preview-test",
	ui,
});
await session.open({ root, patterns: ["**/*.tsx"] });

const close = async (): Promise<void> => {
	await server.close();
	process.exit(0);
};
process.once("SIGINT", () => void close());
process.once("SIGTERM", () => void close());
await new Promise<void>(() => undefined);

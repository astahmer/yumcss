import { resolve } from "node:path";
import { createStudioCodemodEvaluator } from "../packages/analyze/src/studio/evaluator.ts";
import { createStudioServer } from "../packages/analyze/src/studio/server.ts";
import { createStudioSession } from "../packages/analyze/src/studio/session.ts";
import { createStudioWorkspace } from "../packages/analyze/src/studio/workspace.ts";

const root = resolve("packages/analyze/tests/fixtures/studio");
const evaluator = createStudioCodemodEvaluator();
const workspace = createStudioWorkspace({ watcher: { watch: () => () => undefined } });
const session = createStudioSession({ workspace, evaluation: evaluator, adapters: evaluator });
const server = await createStudioServer({
	session,
	host: "127.0.0.1",
	port: 5176,
	token: "studio-test",
});
await session.open({ root, patterns: ["**/*.tsx"] });

const close = async (): Promise<void> => {
	await server.close();
	process.exit(0);
};
process.once("SIGINT", () => void close());
process.once("SIGTERM", () => void close());
await new Promise<void>(() => undefined);

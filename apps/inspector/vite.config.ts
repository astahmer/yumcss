import react from "@vitejs/plugin-react-swc";
import { defineConfig, type Plugin } from "vite";
import { gather } from "./src/server/gather.ts";
import { listRuns, persistRun, readRun } from "./src/server/history.ts";

// History lives at <package dir>/.studio-history/ — see history.ts.
const pkgRoot = process.cwd();

/** Dev-server middleware: GET /api/data rebuilds the studio payload. */
const studioApi = (): Plugin => ({
	name: "studio-api",
	configureServer(server) {
		server.middlewares.use("/api/analytics", (_req, res) => {
			void (async () => {
				try {
					const payload = await gather();
					res.end(JSON.stringify(payload.analytics ?? {}));
				} catch (error) {
					res.statusCode = 500;
					res.end(JSON.stringify({ error: String(error) }));
				}
			})();
		});

		server.middlewares.use("/api/data", (_req, res) => {
			void (async () => {
				res.setHeader("content-type", "application/json");
				try {
					const payload = await gather();
					persistRun(pkgRoot, payload);
					res.end(JSON.stringify(payload));
				} catch (error) {
					res.statusCode = 500;
					res.end(JSON.stringify({ error: String(error) }));
				}
			})();
		});
		// Run history: list all snapshots, or fetch one via /api/history?run=<ts>
		server.middlewares.use("/api/history", (req, res, next) => {
			if (req.method !== "GET") return next();
			const url = new URL(req.url ?? "/", "http://x");
			res.setHeader("content-type", "application/json");
			const runTs = url.searchParams.get("run");
			if (runTs !== null) {
				const run = readRun(pkgRoot, runTs);
				if (run === null) res.statusCode = 404;
				res.end(JSON.stringify(run ?? { error: "not found" }));
				return;
			}
			res.end(JSON.stringify(listRuns(pkgRoot)));
		});
	},
});

export default defineConfig({
	plugins: [react(), studioApi()],
});

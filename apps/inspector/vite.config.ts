import react from "@vitejs/plugin-react-swc";
import { defineConfig, type Plugin } from "vite";
import { gather } from "./src/server/gather.ts";
import { buildPruneChangeset } from "pandwind-analyze/collect";
import { persistAnalyticsSnapshot, readAnalyticsSeries } from "./src/server/analytics-history.ts";
import { persistRun } from "./src/server/history.ts";

// History lives at <package dir>/.studio-history/ — see history.ts.
const pkgRoot = process.cwd();

/** Dev-server middleware: GET /api/data rebuilds the studio payload. */
const studioApi = (): Plugin => ({
	name: "studio-api",
	configureServer(server) {
		// Analytics time series (oldest first). Snapshots are appended on each
		// studio refresh when INSPECTOR_HISTORY=1. NOTE: these MUST be registered
		// before the generic /api/analytics handler below — connect matches by
		// prefix, so /api/analytics would swallow /api/analytics/*.
		server.middlewares.use("/api/analytics/history", (req, res, next) => {
			if (req.method !== "GET") return next();
			res.setHeader("content-type", "application/json");
			res.end(JSON.stringify(readAnalyticsSeries(pkgRoot)));
		});

		// Prune-changeset generation: read-only, returns .changeset content for
		// the caller to write. POST because it re-gathers.
		server.middlewares.use("/api/analytics/prune-changeset", (req, res, next) => {
			if (req.method !== "POST") return next();
			void (async () => {
				try {
					const payload = (await gather()) as import("./src/types.ts").StudioPayload;
					const unused = payload.analytics?.unusedTokens ?? [];
					res.setHeader("content-type", "application/json");
					res.end(
						JSON.stringify({
							count: unused.length,
							content: buildPruneChangeset(unused),
						}),
					);
				} catch (error) {
					res.statusCode = 500;
					res.end(JSON.stringify({ error: String(error) }));
				}
			})();
		});

		server.middlewares.use("/api/analytics", (_req, res) => {
			void (async () => {
				try {
					const payload = (await gather()) as import("./src/types.ts").StudioPayload;
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
					const payload = (await gather()) as import("./src/types.ts").StudioPayload;
					persistRun(pkgRoot, payload);
					if (process.env.INSPECTOR_HISTORY === "1") {
						persistAnalyticsSnapshot(pkgRoot, payload);
					}
					res.end(JSON.stringify(payload));
				} catch (error) {
					res.statusCode = 500;
					res.end(JSON.stringify({ error: String(error) }));
				}
			})();
		});
	},
});

export default defineConfig({
	plugins: [react(), studioApi()],
});

import react from "@vitejs/plugin-react-swc";
import { constants, gzipSync } from "node:zlib";
import { defineConfig, type Plugin } from "vite";
import { gather } from "./src/server/gather.ts";
import { buildGovernancePruneChangeset } from "pandwind-analyze/governance";
import { persistAnalyticsSnapshot, readAnalyticsSeries } from "./src/server/analytics-history.ts";
import { persistRun } from "./src/server/history.ts";

// History lives at <package dir>/.studio-history/ — see history.ts.
const pkgRoot = process.cwd();

const sendJson = (
	request: import("node:http").IncomingMessage,
	response: import("node:http").ServerResponse,
	value: unknown,
): void => {
	const body = Buffer.from(JSON.stringify(value));
	const acceptsGzip = (request.headers["accept-encoding"] ?? "")
		.toString()
		.split(",")
		.some((encoding) => encoding.trim().split(";")[0] === "gzip");
	response.setHeader("content-type", "application/json; charset=utf-8");
	response.setHeader("cache-control", "no-store");
	response.setHeader("vary", "Accept-Encoding");
	if (!acceptsGzip) {
		response.setHeader("content-length", body.byteLength);
		response.end(body);
		return;
	}
	const compressed = gzipSync(body, { level: constants.Z_BEST_SPEED });
	response.setHeader("content-encoding", "gzip");
	response.setHeader("content-length", compressed.byteLength);
	response.end(compressed);
};

/** Dev-server middleware: GET /api/data serves the current inspector snapshot. */
const inspectorApi = (): Plugin => ({
	name: "inspector-api",
	configureServer(server) {
		let cachedPayload: import("./src/types.ts").InspectorPayload | undefined;
		let pendingPayload: Promise<import("./src/types.ts").InspectorPayload> | undefined;
		const loadPayload = (force = false): Promise<import("./src/types.ts").InspectorPayload> => {
			if (pendingPayload !== undefined) return pendingPayload;
			if (!force && cachedPayload !== undefined) return Promise.resolve(cachedPayload);
			if (force) cachedPayload = undefined;
			const pending = gather()
				.then((payload) => {
					const inspectorPayload = payload as import("./src/types.ts").InspectorPayload;
					persistRun(pkgRoot, inspectorPayload);
					if (process.env.INSPECTOR_HISTORY === "1") {
						persistAnalyticsSnapshot(pkgRoot, inspectorPayload);
					}
					cachedPayload = inspectorPayload;
					return inspectorPayload;
				})
				.finally(() => {
					pendingPayload = undefined;
				});
			pendingPayload = pending;
			return pending;
		};

		// Analytics time series (oldest first). Snapshots are appended on each
		// inspector refresh when INSPECTOR_HISTORY=1. NOTE: these MUST be registered
		// before the generic /api/analytics handler below — connect matches by
		// prefix, so /api/analytics would swallow /api/analytics/*.
		server.middlewares.use("/api/analytics/history", (req, res, next) => {
			if (req.method !== "GET") return next();
			sendJson(req, res, readAnalyticsSeries(pkgRoot));
		});

		// Prune-changeset generation: read-only, returns .changeset content for
		// the caller to write. POST because it re-gathers.
		server.middlewares.use("/api/analytics/prune-changeset", (req, res, next) => {
			if (req.method !== "POST") return next();
			void (async () => {
				try {
					const payload = await loadPayload(true);
					// Governance-owned proposal (plans/054): only safe-to-remove
					// candidates are listed; boundaries downgrade to review first.
					const changeset =
						payload.governance === undefined
							? { count: 0, content: null }
							: buildGovernancePruneChangeset(payload.governance);
					sendJson(req, res, changeset);
				} catch (error) {
					res.statusCode = 500;
					sendJson(req, res, { error: String(error) });
				}
			})();
		});

		server.middlewares.use("/api/analytics", (req, res) => {
			void (async () => {
				try {
					const payload = await loadPayload();
					sendJson(req, res, payload.analytics ?? {});
				} catch (error) {
					res.statusCode = 500;
					sendJson(req, res, { error: String(error) });
				}
			})();
		});

		server.middlewares.use("/api/data", (req, res) => {
			void (async () => {
				const startedAt = performance.now();
				try {
					const refresh =
						new URL(req.url ?? "/", "http://localhost").searchParams.get("refresh") === "1";
					const payload = await loadPayload(refresh);
					res.setHeader(
						"server-timing",
						`analysis;dur=${(performance.now() - startedAt).toFixed(1)}`,
					);
					sendJson(req, res, payload);
				} catch (error) {
					res.statusCode = 500;
					sendJson(req, res, { error: String(error) });
				}
			})();
		});
	},
});

export default defineConfig({
	plugins: [react(), inspectorApi()],
});

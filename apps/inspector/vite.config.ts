import react from "@vitejs/plugin-react-swc";
import { constants, gzipSync } from "node:zlib";
import { defineConfig, type Plugin } from "vite";
import { yumcssExtractVite } from "yumcss/vite";
import { css } from "./src/ui-css.ts";
import { gather } from "./src/server/gather.ts";
import { buildGovernancePruneChangeset } from "@yumcss/analyze/governance";
import { compareTokenRelease } from "@yumcss/analyze/governance";
import { tokenDocumentCodec, TokenFormatLossError } from "@yumcss/codemod/swap/token-document";
import { persistAnalyticsSnapshot, readAnalyticsSeries } from "./src/server/analytics-history.ts";
import { persistRun } from "./src/server/history.ts";
import { z } from "zod";

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

const readRequestBody = (
	request: import("node:http").IncomingMessage,
	maximumBytes: number,
): Promise<string> =>
	new Promise((resolveBody, reject) => {
		const chunks: Array<Buffer> = [];
		let byteCount = 0;
		let rejected = false;
		request.on("data", (chunk: Buffer | string) => {
			if (rejected) return;
			const buffer = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
			byteCount += buffer.byteLength;
			if (byteCount > maximumBytes) {
				rejected = true;
				reject(new Error(`request body exceeds ${maximumBytes} bytes`));
				request.resume();
				return;
			}
			chunks.push(buffer);
		});
		request.on("end", () => {
			if (!rejected) resolveBody(Buffer.concat(chunks).toString("utf8"));
		});
		request.on("error", (error) => {
			if (!rejected) reject(error);
		});
	});

const TokenReleaseRequestSchema = z.strictObject({ baselineText: z.string() });

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

		server.middlewares.use("/api/tokens/export", (req, res, next) => {
			if (req.method !== "POST") return next();
			void (async () => {
				try {
					const payload = await loadPayload();
					if (payload.interopTokens?.state !== "available") {
						res.statusCode = 422;
						sendJson(req, res, {
							error:
								payload.interopTokens?.diagnostics.join("; ") ??
								"No validated token snapshot is available.",
						});
						return;
					}
					const output = tokenDocumentCodec.to("dtcg", payload.interopTokens.document, {
						resolverSidecar: true,
					});
					sendJson(req, res, output);
				} catch (error) {
					res.statusCode = error instanceof TokenFormatLossError ? 422 : 500;
					sendJson(req, res, {
						error: error instanceof Error ? error.message : String(error),
						...(error instanceof TokenFormatLossError ? { fidelity: error.output.fidelity } : {}),
					});
				}
			})();
		});

		server.middlewares.use("/api/tokens/release", (req, res, next) => {
			if (req.method !== "POST") return next();
			void (async () => {
				try {
					const requestBody = TokenReleaseRequestSchema.safeParse(
						JSON.parse(await readRequestBody(req, 20 * 1024 * 1024)),
					);
					if (!requestBody.success) {
						res.statusCode = 400;
						sendJson(req, res, { error: "baselineText must contain a DTCG token document" });
						return;
					}
					const payload = await loadPayload();
					if (payload.interopTokens?.state !== "available") {
						res.statusCode = 422;
						sendJson(req, res, {
							error:
								payload.interopTokens?.diagnostics.join("; ") ??
								"No validated current token snapshot is available.",
						});
						return;
					}
					if (payload.governance === undefined) {
						res.statusCode = 422;
						sendJson(req, res, { error: "No current token-governance report is available." });
						return;
					}
					const baseline = tokenDocumentCodec.fromText("dtcg", requestBody.data.baselineText);
					const report = compareTokenRelease({
						baseline,
						current: payload.interopTokens.document,
						consumers: [payload.governance],
					});
					sendJson(req, res, report);
				} catch (error) {
					res.statusCode = 400;
					sendJson(req, res, { error: error instanceof Error ? error.message : String(error) });
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
	plugins: [yumcssExtractVite(css, { cssSources: ["ui-css"] }), react(), inspectorApi()],
});

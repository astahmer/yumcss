import react from "@vitejs/plugin-react-swc";
import { defineConfig, type Plugin } from "vite";
import { gather } from "./src/server/gather.ts";

/** Dev-server middleware: GET /api/data rebuilds the studio payload. */
const studioApi = (): Plugin => ({
	name: "studio-api",
	configureServer(server) {
		server.middlewares.use("/api/data", (_req, res) => {
			void (async () => {
				res.setHeader("content-type", "application/json");
				try {
					res.end(JSON.stringify(await gather()));
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

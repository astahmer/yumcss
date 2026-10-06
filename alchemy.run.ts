import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Output from "alchemy/Output";
import * as Effect from "effect/Effect";

export default Alchemy.Stack(
	"yumcss-sites",
	{ providers: Cloudflare.providers(), state: Cloudflare.state() },
	Effect.gen(function* () {
		const playground = yield* Cloudflare.Website.StaticSite("Playground", {
			name: "yumcss-playground",
			command: "pnpm --filter playground run build",
			outdir: "apps/playground/dist",
			assets: { notFoundHandling: "single-page-application" },
		});
		const playgroundUrl = Output.map(playground.url, (url) => {
			if (url === undefined) throw new Error("Playground has no public URL");
			return url;
		});
		const docs = yield* Cloudflare.Website.StaticSite("Docs", {
			name: "yumcss-docs",
			command: "pnpm --filter yumcss-docs run build",
			outdir: "docs/dist",
			env: { PUBLIC_PLAYGROUND_URL: playgroundUrl },
			assets: { htmlHandling: "auto-trailing-slash", notFoundHandling: "404-page" },
		});
		return { docs: docs.url, playground: playground.url };
	}),
);

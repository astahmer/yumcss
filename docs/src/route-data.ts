import { defineRouteMiddleware } from "@astrojs/starlight/route-data";

// Cards are rendered ahead of time by og/generate.mjs into public/og/.
const homeCard = "og/home.png";

export const onRequest = defineRouteMiddleware((context) => {
	const route = context.locals.starlightRoute;
	const isDocsPage = route.id !== "" && route.id !== "404";
	const imagePath = isDocsPage ? `og/docs/${route.id}.png` : homeCard;
	const imageUrl = new URL(imagePath, context.site).href;
	const imageAlt = isDocsPage
		? `${route.entry.data.title} — YumCSS documentation`
		: "YumCSS: Your design system, as a type system.";

	route.head.push(
		{ tag: "meta", attrs: { property: "og:image", content: imageUrl } },
		{ tag: "meta", attrs: { property: "og:image:type", content: "image/png" } },
		{ tag: "meta", attrs: { property: "og:image:width", content: "1200" } },
		{ tag: "meta", attrs: { property: "og:image:height", content: "630" } },
		{ tag: "meta", attrs: { property: "og:image:alt", content: imageAlt } },
		{ tag: "meta", attrs: { name: "twitter:image", content: imageUrl } },
		{ tag: "meta", attrs: { name: "twitter:image:alt", content: imageAlt } },
	);
});

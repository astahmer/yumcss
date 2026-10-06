import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const [root, serverBundle, serializedOptions] = process.argv.slice(2);
if (root === undefined || serverBundle === undefined || serializedOptions === undefined)
	throw new Error("Expected project root, server bundle path, and render options");

const options = JSON.parse(serializedOptions);
const requireFromProject = createRequire(join(root, "package.json"));
const React = requireFromProject("react");
const render =
	options.renderer === "static"
		? requireFromProject("react-dom/server").renderToStaticMarkup
		: requireFromProject("react-dom/server").renderToString;
const serverModule = await import(pathToFileURL(serverBundle).href);
const element = React.createElement(serverModule.App);

if (options.collectAphrodite === true) {
	const rendered = requireFromProject("aphrodite").StyleSheetServer.renderStatic(() =>
		render(element),
	);
	console.log(JSON.stringify({ markup: rendered.html, css: rendered.css.content }));
} else if (serverModule.yumcssCss !== undefined) {
	const css =
		typeof serverModule.yumcssCss === "function"
			? serverModule.yumcssCss()
			: serverModule.yumcssCss;
	console.log(JSON.stringify({ markup: render(element), css }));
} else if (serverModule.stitchesCss !== undefined) {
	const css =
		typeof serverModule.stitchesCss === "function"
			? serverModule.stitchesCss()
			: serverModule.stitchesCss;
	console.log(JSON.stringify({ markup: render(element), css }));
} else if (serverModule.sourceCss !== undefined) {
	const css =
		typeof serverModule.sourceCss === "function"
			? serverModule.sourceCss()
			: serverModule.sourceCss;
	console.log(JSON.stringify({ markup: render(element), css }));
} else if (!options.collectStyledComponents) {
	console.log(JSON.stringify({ markup: render(element), css: "" }));
} else {
	const ServerStyleSheet = requireFromProject("styled-components").ServerStyleSheet;
	const sheet = new ServerStyleSheet();
	try {
		console.log(
			JSON.stringify({
				markup: render(sheet.collectStyles(element)),
				css: sheet.getStyleTags().replace(/<style[^>]*>|<\/style>/gu, ""),
			}),
		);
	} finally {
		sheet.seal();
	}
}

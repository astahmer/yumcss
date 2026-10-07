// HTML/CSS sources for the 1200×630 Open Graph cards. Rendered to PNG by generate.mjs.
const fileUrl = (relative) => new URL(relative, import.meta.url).href;
const fontUrl = (family, file) =>
	new URL(import.meta.resolve(`@fontsource-variable/${family}/files/${file}`)).href;

const logoMark = fileUrl("../yums/brand/logo-mark.svg");

const palette = {
	charcoal: "#1f1f1f",
	cream: "#fef7ed",
	orange: "#f59e42",
	orangeOnCream: "#c45f09",
	editor: "#262422",
	editorSunken: "#1a1918",
};

const escapeHtml = (value) =>
	value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");

const baseStyles = `
	@font-face { font-family: "Bricolage"; src: url("${fontUrl("bricolage-grotesque", "bricolage-grotesque-latin-wght-normal.woff2")}") format("woff2"); font-weight: 200 800; }
	@font-face { font-family: "Inter"; src: url("${fontUrl("inter", "inter-latin-wght-normal.woff2")}") format("woff2"); font-weight: 100 900; }
	@font-face { font-family: "JetBrains Mono"; src: url("${fontUrl("jetbrains-mono", "jetbrains-mono-latin-wght-normal.woff2")}") format("woff2"); font-weight: 100 800; }
	* { box-sizing: border-box; margin: 0; }
	html, body { width: 1200px; height: 630px; overflow: hidden; }
	body { position: relative; font-family: "Inter", sans-serif; -webkit-font-smoothing: antialiased; }
	.brand { display: flex; align-items: center; gap: 12px; }
	.brand img { height: 46px; }
	.brand span { font-family: "Bricolage", sans-serif; font-size: 32px; font-weight: 750; letter-spacing: -0.03em; }
	.brand b { font-weight: inherit; color: var(--accent); }
	.site { font-family: "JetBrains Mono", monospace; font-size: 18px; color: var(--muted); }
`;

const page = (styles, body) =>
	`<!doctype html><html><head><meta charset="utf-8"><style>${baseStyles}${styles}</style></head><body>${body}</body></html>`;

const brand = `<div class="brand"><img src="${logoMark}" alt=""><span>Yum<b>CSS</b></span></div>`;

// Real YumCSS syntax and real output from the playground's example preset (same as the homepage hero).
const editorCode = [
	`<span class="k">import</span> { <span class="f">css</span> } <span class="k">from</span> <span class="s">"./css"</span>;`,
	``,
	`<span class="f">css</span>.<span class="f">class</span>({`,
	`  <span class="p">display</span>: <span class="s">"flex"</span>,`,
	`  <span class="p">borderRadius</span>: <span class="s">"xl"</span>,`,
	`  <span class="p">backgroundColor</span>: <span class="t">"$white"</span>,`,
	`  <span class="p">color</span>: <span class="t">"$gray-900"</span>,`,
	`  <span class="p">_hover</span>: { <span class="p">backgroundColor</span>: <span class="t">"$gray-50"</span> },`,
	`  <span class="p">md</span>: { <span class="p">borderRadius</span>: <span class="s">"2xl"</span> },`,
	`});`,
];

/** @param {{ theme: "dark" | "light" }} options */
export const homeCard = (options) => {
	const dark = options.theme === "dark";
	const styles = `
		:root {
			--bg: ${dark ? palette.charcoal : palette.cream};
			--heading: ${dark ? palette.cream : palette.charcoal};
			--text: ${dark ? "rgb(254 247 237 / 0.8)" : "rgb(31 31 31 / 0.78)"};
			--muted: ${dark ? "rgb(254 247 237 / 0.55)" : "rgb(31 31 31 / 0.6)"};
			--accent: ${dark ? palette.orange : palette.orangeOnCream};
		}
		body { background: var(--bg); color: var(--heading); }
		.copy { position: absolute; left: 72px; top: 64px; bottom: 64px; width: 560px; display: flex; flex-direction: column; }
		h1 { margin-top: 46px; font-family: "Bricolage", sans-serif; font-size: 72px; font-weight: 760; line-height: 0.98; letter-spacing: -0.045em; }
		h1 span { display: block; color: var(--accent); }
		.lead { margin-top: 26px; max-width: 520px; font-size: 25px; line-height: 1.4; color: var(--text); }

		.demo { position: absolute; left: 664px; right: 48px; top: 164px; }
		.peek { position: absolute; right: 44px; top: -112px; width: 156px; }
		.editor { position: relative; overflow: hidden; border-radius: 18px; background: ${palette.editor}; border: 1px solid rgb(254 247 237 / 0.12); box-shadow: 0 30px 60px -36px rgb(0 0 0 / ${dark ? 0.9 : 0.5}); }
		.bar { display: flex; align-items: center; gap: 14px; height: 44px; padding: 0 18px; border-bottom: 1px solid rgb(254 247 237 / 0.08); }
		.bar i { width: 11px; height: 11px; border-radius: 99px; background: rgb(254 247 237 / 0.16); }
		.bar span { margin-left: 4px; font-family: "JetBrains Mono", monospace; font-size: 15px; color: rgb(254 247 237 / 0.75); }
		pre { padding: 18px 22px; font-family: "JetBrains Mono", monospace; font-size: 17.5px; line-height: 1.68; color: rgb(254 247 237 / 0.85); }
		.k { color: #ef8f7d; } .f { color: #f3d6a6; } .s { color: #c9d1a0; } .p { color: rgb(254 247 237 / 0.8); } .t { color: ${palette.orange}; }
		.output { padding: 14px 22px 16px; border-top: 1px solid rgb(254 247 237 / 0.08); background: ${palette.editorSunken}; font-family: "JetBrains Mono", monospace; font-size: 15px; color: rgb(254 247 237 / 0.7); white-space: nowrap; }
		.output b { font-weight: 500; color: ${palette.orange}; }
	`;
	const body = `
		<div class="copy">
			${brand}
			<h1>Your design system, <span>as a type system.</span></h1>
			<p class="lead">Typed styles checked against your tokens, compiled to atomic CSS.</p>
		</div>
		<div class="demo">
			<img class="peek" src="${logoMark}" alt="">
			<div class="editor">
				<div class="bar"><i></i><i></i><i></i><span>card.tsx</span></div>
				<pre>${editorCode.join("\n")}</pre>
				<div class="output"><b>✓ built</b> className="1f29p40 14edf0f d660fb 1qg7yvw …"</div>
			</div>
		</div>`;
	return page(styles, body);
};

/** @param {{ title: string, section: string | undefined, description: string | undefined, site: string }} options */
export const docCard = (options) => {
	const length = options.title.length;
	const titleSize = length <= 20 ? 88 : length <= 32 ? 74 : length <= 44 ? 62 : 54;
	const styles = `
		:root { --heading: ${palette.cream}; --text: rgb(254 247 237 / 0.74); --muted: rgb(254 247 237 / 0.55); --accent: ${palette.orange}; }
		body { background: ${palette.charcoal}; color: var(--heading); }
		.content { position: absolute; left: 72px; top: 64px; right: 72px; bottom: 64px; display: flex; flex-direction: column; }
		.main { margin-top: auto; }
		.kicker { font-family: "JetBrains Mono", monospace; font-size: 21px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--accent); }
		h1 { margin-top: 18px; max-width: 780px; overflow-wrap: anywhere; font-family: "Bricolage", sans-serif; font-size: ${titleSize}px; font-weight: 760; line-height: 1.02; letter-spacing: -0.04em; text-wrap: balance; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
		.description { margin-top: 22px; max-width: 760px; font-size: 25px; line-height: 1.42; color: var(--text); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
		.site { margin-top: 34px; }
		/* Peek rises from the card's bottom edge; logo-mark.svg's paws end at the bottom of its frame. */
		.peek { position: absolute; right: 72px; bottom: 0; width: 236px; }
	`;
	const body = `
		<div class="content">
			${brand}
			<div class="main">
				${options.section ? `<p class="kicker">${escapeHtml(options.section)}</p>` : ""}
				<h1>${escapeHtml(options.title)}</h1>
				${options.description ? `<p class="description">${escapeHtml(options.description)}</p>` : ""}
				<p class="site">${escapeHtml(options.site)}</p>
			</div>
		</div>
		<img class="peek" src="${logoMark}" alt="">`;
	return page(styles, body);
};

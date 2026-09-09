import { tw } from "../tw";

const apiCatalog = [
	["tw()", "typed utility objects", "Tailwind-shaped class strings with variants and conflicts"],
	["createCss()", "CSS factory", "binds a preset to typed atomic style methods"],
	["css() / css.class()", "typed atomic CSS", "declaration maps or one class string from a preset"],
	["css.vars()", "runtime values", "classes plus inherited inline custom properties"],
	["css.props()", "host props", "normalizes classes and styles for JSX spreading"],
	["css.group() / input()", "reusable runtime styles", "typed input contracts for dynamic groups"],
	["createRuntimeCss()", "runtime sheet", "registers dynamic classes and SSR-safe styles"],
	["css.raw()", "escape hatch", "plain style objects for an inline-style host"],
	["cx()", "composition", "composes Pandwind, Tailwind, and caller class strings"],
	["createDesignCss()", "design vocabulary", "$frame, $layout, $text modules over the same engine"],
	["definePreset()", "design system", "tokens, conditions, properties, and strictness"],
	["pandwindCssVite", "build integration", "extracts static calls and emits the stylesheet"],
] as const;

/** A compact map of the public web surface, backed by executable examples above. */
export function ApiCatalogApp() {
	return (
		<section
			className={tw({ colSpan: "full", rounded: "xl", bg: "gray-900", p: "6", textColor: "white" })}
		>
			<h2 className={tw({ textSize: "xl", font: "bold" })}>Pandwind API catalog</h2>
			<p className={tw({ mt: "2", maxW: "md", textSize: "sm", textColor: "gray-300" })}>
				Each row points to a live example in this app. The catalog shows how the small public
				surface fits together instead of presenting disconnected snippets.
			</p>
			<div className={tw({ mt: "4", flex: "col", gap: "2" })}>
				{apiCatalog.map(([api, role, detail]) => (
					<div
						key={api}
						className={tw({ flex: "col", gap: "1", rounded: "md", bg: "gray-800", p: "3" })}
					>
						<div className={tw({ flex: "row", gap: "2", font: "semibold" })}>
							<code className={tw({ textColor: "sky-300" })}>{api}</code>
							<span className={tw({ textColor: "gray-400" })}>{role}</span>
						</div>
						<span className={tw({ textSize: "sm", textColor: "gray-300" })}>{detail}</span>
					</div>
				))}
			</div>
		</section>
	);
}

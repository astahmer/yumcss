/**
 * WEB target — design vocabulary -> resolved declarations at RUNTIME via
 * css.raw() (same runtime-only emission philosophy as the native/tui
 * targets). Build-time atomic extraction is demonstrated separately in
 * examples/css-example.
 */
import { createDesignCss } from "pandwind/design";
import { examplePreset } from "pandwind/preset";
import { header, status, body } from "../shared-styles.ts";

const css = createDesignCss(examplePreset);

export function ShowcaseWeb() {
	return (
		<section data-testid="web-root" style={{ fontFamily: "monospace", display: "flex", gap: 12 }}>
			<div data-testid="web-header" style={css.raw(header)}>
				web header
			</div>
			<div data-testid="web-status" style={css.raw(status)}>
				web status
			</div>
			<div data-testid="web-body" style={css.raw(body)}>
				web body
			</div>
		</section>
	);
}

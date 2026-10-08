/**
 * WEB target — design vocabulary -> resolved declarations at RUNTIME via
 * dss.raw() (same runtime-only emission philosophy as the native/tui
 * targets). Build-time atomic extraction is demonstrated separately in
 * examples/css-example.
 */
import { createDesignCss } from "yumcss/design";
import { examplePreset } from "@yumcss/example-preset";
import { header, headerCorners, statusBase, body, bodyCorners } from "../shared-styles.ts";

const dss = createDesignCss(examplePreset);

export function ShowcaseWeb() {
	return (
		<section data-testid="web-root" style={{ fontFamily: "monospace", display: "flex", gap: 12 }}>
			<div data-testid="web-header" style={dss.raw(header, headerCorners)}>
				web header
			</div>
			<div data-testid="web-status" style={dss.raw(statusBase)}>
				web status
			</div>
			<div data-testid="web-body" style={dss.raw(body, bodyCorners)}>
				web body
			</div>
		</section>
	);
}

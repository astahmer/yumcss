import { css } from "./css.ts";

/**
 * Raw-engine call site. The import binding is named `css` and comes from a
 * `css`-basenamed source, so pandwindCssVite extracts this literal into the
 * generated stylesheet (runtime hash matches by construction).
 */
export const cardBClass = css.class({ color: "#16a34a", padding: "10px" });

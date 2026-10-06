import { css } from "./css.ts";

/**
 * Composed raw-engine call site. The import binding is named `css` and comes
 * from a `css`-basenamed source, so yumcssExtractVite extracts both literal
 * objects into the generated stylesheet (runtime hashes match by
 * construction).
 */
const cardBStyles = css({ color: "#16a34a" }, { padding: "10px" });

export const cardBProps = css.props(cardBStyles);

import { createCss } from "yumcss/css";
import { createCx } from "yumcss/cx";
import { preset } from "./css-custom.ts";

const css = createCss(preset);
const cx = createCx({ css });

const base = css.class({ display: "flex", color: "$blue-500", padding: 4 });
const override = css({ color: "$blue-600", padding: 6 });
const variables = css.vars({ color: "var(--runtime-color)" });

const classNames = [
	cx("external", base, override),
	cx(base, "md:flex", false, undefined),
	cx([base, "rounded-md"], override),
	cx.vars(variables, "font-medium", base),
	cx.vars([variables, "text-sm"], false, override),
	cx("one", ["two", ["three", base]]),
];

export const workload = { base, classNames, override, variables };

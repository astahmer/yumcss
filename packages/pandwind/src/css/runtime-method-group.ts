import { cssVar } from "../lib/utils.ts";
import type { StyleObject } from "../types/typings.ts";
import {
	DYNAMIC,
	type AnyInput,
	type DynamicReturn,
	type DynamicStyles,
	type RuntimeCssAttachment,
} from "./runtime-base.ts";
import type { VarsOutput } from "./var-compiler.ts";

type GroupValue =
	| StyleObject
	| DynamicStyles<StyleObject>
	| string
	| ((...args: any[]) => StyleObject);

export const attachGroup: RuntimeCssAttachment = (css, context) => {
	const vars = css.vars as ((...styles: Array<StyleObject>) => VarsOutput) | undefined;
	const transform = (styles: StyleObject | DynamicStyles | string) => {
		if (typeof styles === "string") return styles;
		if ("$input" in styles) {
			const { $input: _input, ...rest } = styles as DynamicStyles;
			const flat = context.flatten(rest);
			const compiled: Record<string, string> = {};
			for (const [key, value] of Object.entries(flat)) {
				compiled[key] = context.backend.declare(
					key,
					typeof value === "string" && value.startsWith("input>$")
						? `$${value.slice("input>$".length)}`
						: value,
				);
			}
			return (input: AnyInput): DynamicReturn => ({
				[DYNAMIC]: true,
				style: Object.fromEntries(
					Object.entries(input).map(([key, value]) => [cssVar(key), value]),
				),
				compiled,
			});
		}
		return context.compileStyles(styles);
	};

	css.group = <TGroup extends Record<string, GroupValue>>(groups: TGroup) => {
		const merged: Record<string, unknown> = {};
		for (const [name, groupStyles] of Object.entries(groups)) {
			if (typeof groupStyles === "function") {
				if (vars === undefined) throw new Error("css.group function values require css.vars");
				merged[name] = (...args: unknown[]) => vars(groupStyles(...args));
			} else {
				merged[name] = transform(groupStyles);
			}
		}
		return merged;
	};
};

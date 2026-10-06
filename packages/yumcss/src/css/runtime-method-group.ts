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
import { isCompilableCssValue } from "./first-that-works.ts";
import { isSafeCssValue, normalizeCssValue } from "./value-normalization.ts";
import { cssPropertyFromKey } from "../backends/css.ts";

type GroupValue =
	| StyleObject
	| DynamicStyles<StyleObject>
	| string
	| ((...args: any[]) => StyleObject);

const INPUT_NAME = /^[-_A-Za-z][-_A-Za-z0-9]*$/;

/** Attach reusable static and dynamic group definitions to the CSS runtime. */
export const attachGroup: RuntimeCssAttachment = (css, context) => {
	const vars = css.vars as ((...styles: Array<StyleObject>) => VarsOutput) | undefined;
	const conditions = context.backendOptions.conditions ?? {};
	const propertyForInput = (key: string): string => cssPropertyFromKey(key, conditions);
	const transform = (styles: StyleObject | DynamicStyles | string) => {
		if (typeof styles === "string") return styles;
		if (typeof styles !== "object" || styles === null) return context.compileStyles({});
		if (Object.hasOwn(styles, "$input")) {
			const { $input: _input, ...rest } = styles as DynamicStyles;
			const flat = context.flatten(rest);
			const compiled = Object.create(null) as Record<string, string>;
			const inputProperties = new Map<string, string | undefined>();
			for (const [key, value] of Object.entries(flat)) {
				if (!isCompilableCssValue(value)) continue;
				const inputName =
					typeof value === "string" && value.startsWith("input>$")
						? value.slice("input>$".length)
						: undefined;
				if (inputName !== undefined && !INPUT_NAME.test(inputName)) continue;
				if (inputName !== undefined) {
					const property = propertyForInput(key);
					if (!inputProperties.has(inputName)) inputProperties.set(inputName, property);
					else if (inputProperties.get(inputName) !== property)
						inputProperties.set(inputName, undefined);
				}
				compiled[key] = context.declare(
					key,
					inputName === undefined ? value : `var(${cssVar(inputName)})`,
				);
			}
			return (input: AnyInput): DynamicReturn => ({
				[DYNAMIC]: true,
				style: Object.fromEntries(
					input !== null && typeof input === "object" && !Array.isArray(input)
						? Object.entries(input).flatMap(([key, value]) => {
								if (!inputProperties.has(key) || !isSafeCssValue(value)) return [];
								const property = inputProperties.get(key);
								return [[cssVar(key), normalizeCssValue(property ?? "--runtime", value)]];
							})
						: [],
				) as Record<string, string>,
				compiled,
			});
		}
		return context.compileStyles(styles);
	};

	css.group = <TGroup extends Record<string, GroupValue>>(groups: TGroup) => {
		const merged = Object.create(null) as Record<string, unknown>;
		if (groups === null || typeof groups !== "object" || Array.isArray(groups)) return merged;
		for (const [name, groupStyles] of Object.entries(groups)) {
			if (typeof groupStyles === "function") {
				if (vars === undefined) throw new Error("css.group function values require css.vars");
				merged[name] = (...args: unknown[]) => {
					// Resolve the method at call time so runtime bindings installed
					// after attachment can observe and register the var key.
					const currentVars = css.vars as typeof vars;
					return (currentVars ?? vars)(groupStyles(...args));
				};
			} else {
				merged[name] = transform(groupStyles);
			}
		}
		return merged;
	};
};

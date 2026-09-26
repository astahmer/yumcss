import { assign } from "../lib/utils.ts";
import type {
	RuntimeCssAttachment,
	DynamicReturn,
	CompiledStyles,
	CssStyle,
} from "./runtime-base.ts";
import { DYNAMIC } from "./runtime-base.ts";
import type { VarsOutput } from "./var-compiler.ts";

type PropsInput =
	| CompiledStyles
	| DynamicReturn
	| VarsOutput
	| string
	| readonly PropsInput[]
	| false
	| null
	| undefined;

interface PropsReturn {
	style: CssStyle | undefined;
	className: string | undefined;
	[key: string]: unknown;
}

const isVarsOutput = (value: object): value is VarsOutput => {
	const candidate = value as { class?: unknown; style?: unknown };
	return (
		Object.hasOwn(value, "class") &&
		typeof candidate.class === "string" &&
		Object.hasOwn(value, "style") &&
		typeof candidate.style === "object" &&
		candidate.style !== null
	);
};

const mergeFlatCssStyles = (styles: Array<CssStyle>): CssStyle | undefined => {
	const merged: CssStyle = {};
	for (const style of styles) {
		if (style === null || typeof style !== "object" || Array.isArray(style)) return undefined;
		for (const key of Object.keys(style)) {
			const value = style[key];
			if (typeof value !== "string") return undefined;
			merged[key] = value;
		}
	}
	return merged;
};

/** Attach the host-prop projection that combines classes and inline variables. */
export const attachProps: RuntimeCssAttachment = (css) => {
	css.props = (...props: Array<PropsInput>): PropsReturn => {
		let compiled: CompiledStyles | undefined;
		let copiedCompiled = false;
		let styles: Array<CssStyle> | undefined;
		let classNames: string[] | undefined;
		let stack: PropsInput[] | undefined;
		let active: WeakSet<object> | undefined;
		const appendCompiled = (value: CompiledStyles): void => {
			if (typeof value !== "object" || value === null || Array.isArray(value)) return;
			if (compiled === undefined) {
				compiled = value;
				return;
			}
			if (!copiedCompiled) {
				const copy = Object.create(null) as CompiledStyles;
				for (const key of Object.keys(compiled)) copy[key] = compiled[key]!;
				compiled = copy;
				copiedCompiled = true;
			}
			for (const key of Object.keys(value)) compiled[key] = value[key]!;
		};
		const append = (current: PropsInput): void => {
			if (!current) return;
			if (typeof current === "string") {
				classNames ??= [];
				classNames.push(current);
				return;
			}
			if (typeof current !== "object") return;
			if (DYNAMIC in current) {
				const dynamic = current as Partial<DynamicReturn>;
				if (dynamic.compiled !== undefined && dynamic.style !== undefined) {
					appendCompiled(dynamic.compiled);
					styles ??= [];
					styles.push(dynamic.style);
				}
				return;
			}
			if (isVarsOutput(current)) {
				if (current.class) {
					classNames ??= [];
					classNames.push(current.class);
				}
				if (current.style) {
					styles ??= [];
					styles.push(current.style);
				}
				return;
			}
			appendCompiled(current as CompiledStyles);
		};
		for (const prop of props) {
			if (!Array.isArray(prop)) {
				append(prop);
				continue;
			}
			active ??= new WeakSet<object>();
			if (active.has(prop)) continue;
			active.add(prop);
			stack ??= [];
			for (let index = prop.length - 1; index >= 0; index--) {
				stack.push(prop[index]!);
			}
			while (stack.length > 0) {
				const current = stack.pop();
				if (!current) continue;
				if (Array.isArray(current)) {
					if (active.has(current)) continue;
					active.add(current);
					for (let index = current.length - 1; index >= 0; index--) {
						stack.push(current[index]!);
					}
					continue;
				}
				append(current);
			}
		}
		if (compiled !== undefined) {
			for (const key of Object.keys(compiled)) {
				const value = compiled[key];
				if (typeof value !== "string") continue;
				classNames ??= [];
				classNames.push(value);
			}
		}
		const style = styles?.length
			? (mergeFlatCssStyles(styles) ?? Object.assign({}, assign(...styles)))
			: undefined;
		return {
			style,
			className: classNames?.length ? classNames.join(" ") : undefined,
		};
	};
};

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

/** Attach the host-prop projection that combines classes and inline variables. */
export const attachProps: RuntimeCssAttachment = (css) => {
	css.props = (...props: Array<PropsInput>): PropsReturn => {
		const compiled: Array<CompiledStyles> = [];
		const styles: Array<CssStyle> = [];
		const classNames: string[] = [];
		const stack = props.slice().reverse() as PropsInput[];
		const active = new WeakSet<object>();
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
			if (typeof current === "string") {
				classNames.push(current);
				continue;
			}
			if (typeof current !== "object") continue;
			if (DYNAMIC in current) {
				const dynamic = current as Partial<DynamicReturn>;
				if (dynamic.compiled !== undefined && dynamic.style !== undefined) {
					compiled.push(dynamic.compiled);
					styles.push(dynamic.style);
				}
				continue;
			}
			if (isVarsOutput(current)) {
				if (current.class) classNames.push(current.class);
				if (current.style) styles.push(current.style);
				continue;
			}
			compiled.push(current as CompiledStyles);
		}
		const compiledClassNames = compiled.length
			? Object.values(assign(...compiled)).filter(
					(value): value is string => typeof value === "string",
				)
			: [];
		return {
			style: styles.length ? assign(...styles) : undefined,
			className:
				compiledClassNames.length || classNames.length
					? [...classNames, ...compiledClassNames].join(" ")
					: undefined,
		};
	};
};

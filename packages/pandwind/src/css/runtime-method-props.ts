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

const isVarsOutput = (value: object): value is VarsOutput =>
	"class" in value &&
	typeof value.class === "string" &&
	"style" in value &&
	typeof value.style === "object" &&
	value.style !== null;

/** Attach the host-prop projection that combines classes and inline variables. */
export const attachProps: RuntimeCssAttachment = (css) => {
	css.props = (...props: Array<PropsInput>): PropsReturn => {
		const compiled: Array<CompiledStyles> = [];
		const styles: Array<CssStyle> = [];
		const classNames: string[] = [];

		const add = (current: PropsInput): void => {
			if (!current) return;
			if (Array.isArray(current)) {
				current.forEach(add);
				return;
			}
			if (typeof current === "string") {
				classNames.push(current);
				return;
			}
			if (typeof current !== "object") return;
			if (DYNAMIC in current) {
				compiled.push(current.compiled);
				styles.push(current.style);
				return;
			}
			if (isVarsOutput(current)) {
				if (current.class) classNames.push(current.class);
				if (current.style) styles.push(current.style);
				return;
			}
			compiled.push(current as CompiledStyles);
		};

		props.forEach(add);
		return {
			style: styles.length ? assign(...styles) : undefined,
			className:
				compiled.length || classNames.length
					? [...classNames, ...Object.values(assign(...compiled))].join(" ")
					: undefined,
		};
	};
};

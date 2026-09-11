import type { DesignPreset, DesignStyleObject } from "../design/types.ts";
import { resolveDesignStyle } from "../design/resolve.ts";
import { assign } from "../lib/utils.ts";
import type { StyleObject } from "../types/typings.ts";
import type { ObjectBackend, TargetStyle } from "./object-engine.ts";

export interface ObjectCssFn<TStyles extends StyleObject = StyleObject> {
	(...styles: Array<TStyles | undefined | null | false>): TargetStyle;
	raw: (...styles: Array<TStyles | undefined | null | false>) => StyleObject;
}

export function createObjectCss<TStyles extends StyleObject = StyleObject>(
	backend: ObjectBackend,
): ObjectCssFn<TStyles> {
	const css = (...styles: Array<TStyles | undefined | null | false>): TargetStyle =>
		backend.resolve(assign(...(styles.filter((style) => style) as Array<StyleObject>)));
	css.raw = (...styles: Array<TStyles | undefined | null | false>): StyleObject =>
		assign(...(styles.filter((style) => style) as Array<StyleObject>));
	return css;
}

export interface ObjectCxFn {
	(...inputs: Array<ObjectCxInput>): TargetStyle;
}

type ObjectCxInput = TargetStyle | undefined | null | false | readonly ObjectCxInput[];

export function createObjectCx(backend: ObjectBackend): ObjectCxFn {
	return (...inputs) => {
		const flat: Array<TargetStyle> = [];
		type Frame = { readonly value: readonly ObjectCxInput[]; index: number };
		const active = new WeakSet<object>();
		const stack: Frame[] = [{ value: inputs, index: 0 }];
		active.add(inputs);
		while (stack.length > 0) {
			const frame = stack.at(-1)!;
			const input = frame.value[frame.index++];
			if (input === undefined && frame.index > frame.value.length) {
				stack.pop();
				active.delete(frame.value);
				continue;
			}
			if (Array.isArray(input)) {
				if (active.has(input)) continue;
				active.add(input);
				stack.push({ value: input, index: 0 });
				continue;
			}
			if (input && typeof input === "object") flat.push(input as TargetStyle);
		}
		return backend.merge(...flat);
	};
}

export function createDesignObjectCss<TPreset extends DesignPreset>(
	preset: TPreset,
	backend: ObjectBackend,
): ObjectCssFn<DesignStyleObject<TPreset>> {
	const resolveAll = (
		...styles: Array<DesignStyleObject<TPreset> | undefined | null | false>
	): StyleObject => {
		let resolved: StyleObject = {};
		for (const style of styles) {
			if (!style) continue;
			resolved = assign(
				resolved,
				resolveDesignStyle(style as unknown as Record<string, unknown>, preset.tokens) as never,
			);
		}
		return resolved;
	};

	const css = (
		...styles: Array<DesignStyleObject<TPreset> | undefined | null | false>
	): TargetStyle => backend.resolve(resolveAll(...styles));
	css.raw = (
		...styles: Array<DesignStyleObject<TPreset> | undefined | null | false>
	): StyleObject => resolveAll(...styles);
	return css;
}

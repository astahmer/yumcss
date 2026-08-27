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
	(
		...inputs: Array<
			TargetStyle | undefined | null | false | Array<TargetStyle | undefined | null | false>
		>
	): TargetStyle;
}

export function createObjectCx(backend: ObjectBackend): ObjectCxFn {
	return (...inputs) => {
		const flat: Array<TargetStyle> = [];
		for (const input of inputs) {
			if (Array.isArray(input)) {
				for (const nested of input) if (nested) flat.push(nested);
			} else if (input) flat.push(input);
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

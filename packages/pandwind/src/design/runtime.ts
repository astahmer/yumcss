import { assign } from "../lib/utils.ts";
import { ATOM_REGISTRY, type AtomRegistry } from "../css/atoms.ts";
import { attachCssFactoryMetadata, CssFactoryKind } from "../css/factory-metadata.ts";
import { createPresetCssRuntime, type TypedPreset } from "../css/runtime-preset.ts";
import type {
	CreateCssOptions,
	RuntimeCssAttachment,
	RuntimeCssFunction,
} from "../css/runtime-base.ts";
import type { StyleObject } from "../types/typings.ts";
import { resolveDesignStyle } from "./resolve.ts";
import type { DesignPreset } from "./types.ts";

type Maybe<T> = T | undefined | null | false;

export const createDesignCssRuntime = (
	preset: DesignPreset & TypedPreset,
	options: CreateCssOptions = {},
	attachments: readonly RuntimeCssAttachment[] = [],
): RuntimeCssFunction => {
	const engine = createPresetCssRuntime(preset, options, attachments);
	const resolve = (style: Record<string, unknown>): StyleObject =>
		resolveDesignStyle(style, preset.tokens);
	const dss = ((...styles: Array<Maybe<Record<string, unknown>>>) =>
		engine(
			...(styles.filter(Boolean) as Array<Record<string, unknown>>).map(resolve),
		)) as RuntimeCssFunction;

	const classMethod = engine.class;
	if (typeof classMethod === "function") {
		dss.class = (...styles: Array<StyleObject>) =>
			classMethod(...(styles.filter(Boolean).map(resolve) as Array<StyleObject>));
	}

	const rawMethod = engine.raw;
	if (typeof rawMethod === "function") {
		dss.raw = (...styles: Array<StyleObject>) =>
			rawMethod(...(styles.filter(Boolean).map(resolve) as Array<StyleObject>));
	}

	const varsMethod = engine.vars;
	if (typeof varsMethod === "function") {
		dss.vars = (...styles: Array<StyleObject>) => {
			const resolvedStyles = assign(
				...(styles.filter(Boolean).map(resolve) as Array<StyleObject>),
			) as StyleObject;
			return varsMethod(resolvedStyles);
		};
	}

	const propsMethod = engine.props;
	if (typeof propsMethod === "function") dss.props = propsMethod;
	const inputMethod = engine.input;
	if (typeof inputMethod === "function") dss.input = inputMethod;
	const keyframesMethod = engine.keyframes;
	if (typeof keyframesMethod === "function") dss.keyframes = keyframesMethod;

	const groupMethod = engine.group;
	if (typeof groupMethod === "function") {
		dss.group = (groups: Record<string, unknown>) => {
			const resolved = Object.create(null) as Record<string, unknown>;
			for (const key of Object.keys(groups)) {
				const value = groups[key];
				if (typeof value === "function") {
					resolved[key] = (...args: Array<unknown>) =>
						resolve(value(...args) as Record<string, unknown>);
				} else if (value) {
					resolved[key] = resolve(value as Record<string, unknown>);
				}
			}
			return groupMethod(resolved);
		};
	}

	(dss as RuntimeCssFunction & { [ATOM_REGISTRY]?: AtomRegistry })[ATOM_REGISTRY] =
		engine[ATOM_REGISTRY];
	attachCssFactoryMetadata(dss, {
		kind: CssFactoryKind.Design,
		preset,
		options,
	});
	return dss;
};

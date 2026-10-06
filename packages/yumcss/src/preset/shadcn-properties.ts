import { define } from "../types/define-preset.export.ts";
import { presetProperties } from "./properties.ts";

export const createShadcnProperties = <
	const TColorGroup extends string,
	const TRadiusGroup extends string,
	const TFontGroup extends string,
>(groups: {
	readonly colors: TColorGroup;
	readonly radii: TRadiusGroup;
	readonly fonts: TFontGroup;
}) => {
	const boundTo = <const TGroup extends string>(group: TGroup) =>
		({
			$tokens: group,
		}) as const;
	const strictBoundTo = <const TGroup extends string>(group: TGroup) =>
		({ $tokens: group, $strict: true }) as const;

	return define.properties({
		...presetProperties,
		fontFamily: boundTo(groups.fonts),
		borderRadius: boundTo(groups.radii),
		borderTopLeftRadius: boundTo(groups.radii),
		borderTopRightRadius: boundTo(groups.radii),
		borderBottomLeftRadius: boundTo(groups.radii),
		borderBottomRightRadius: boundTo(groups.radii),
		borderStartStartRadius: boundTo(groups.radii),
		borderStartEndRadius: boundTo(groups.radii),
		borderEndStartRadius: boundTo(groups.radii),
		borderEndEndRadius: boundTo(groups.radii),
		color: strictBoundTo(groups.colors),
		background: strictBoundTo(groups.colors),
		backgroundColor: strictBoundTo(groups.colors),
		borderColor: strictBoundTo(groups.colors),
		borderTopColor: strictBoundTo(groups.colors),
		borderRightColor: strictBoundTo(groups.colors),
		borderBottomColor: strictBoundTo(groups.colors),
		borderLeftColor: strictBoundTo(groups.colors),
		borderInlineEndColor: strictBoundTo(groups.colors),
		outlineColor: strictBoundTo(groups.colors),
		textDecorationColor: strictBoundTo(groups.colors),
		textEmphasisColor: strictBoundTo(groups.colors),
		fill: strictBoundTo(groups.colors),
		stroke: strictBoundTo(groups.colors),
	});
};

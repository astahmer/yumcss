import { expect, test } from "vitest";
import { CodemodAdapterId } from "../src/swap/index.ts";
import { createAdapterRouteSpec, routeEvidence } from "./route-spec-support.ts";

const route = createAdapterRouteSpec(CodemodAdapterId.NextYak, CodemodAdapterId.YumCSS);
const source = `import React from "react";
import { styled } from "next-yak";

type Props = { readonly $translateX: number; children?: React.ReactNode };

const TranslatedDot = styled.div<Props>\`
	transform: translateX(\${({ $translateX }) => $translateX}px);
	width: 160px;
	height: 56px;
	display: block;
\`;

export const App = () => <TranslatedDot data-proof $translateX={1} />;
`;

test("next-yak prop interpolation lowers to a YumCSS runtime component", () => {
	const result = route.run({ source, file: "App.tsx" });

	expect(result.converted).toBe(1);
	expect(result.skipped).toBe(0);
	expect(result.residuals).toEqual([]);
	expect(result.code).not.toContain('from "next-yak"');
	expect(result.code).toContain("runtimeCss.vars");
	expect(result.code).toContain("__yumcssForwardRef");
	expect(result.code).toContain("__yumcssReact");
	expect(result.code).toContain('!key.startsWith("$")');
	expect(result.code).toContain("$translateX");
	expect(routeEvidence(result)).toMatchInlineSnapshot(`
		{
		  "changed": true,
		  "code": "import React from "react";
		import { forwardRef as __yumcssForwardRef } from "react";
		import { createRuntimeCss } from "yumcss/css/runtime";
		import { defaultPreset } from "yumcss/preset/default";
		import type * as __yumcssReact from "react";
		const runtimeCss = createRuntimeCss(defaultPreset);

		type Props = { readonly $translateX: number; children?: React.ReactNode };

		const TranslatedDot = __yumcssForwardRef<__yumcssReact.ComponentRef<"div">, { readonly as?: __yumcssReact.ElementType; readonly className?: string; readonly style?: __yumcssReact.CSSProperties; readonly children?: __yumcssReact.ReactNode; readonly [key: string]: unknown }>((props: { readonly as?: __yumcssReact.ElementType; readonly className?: string; readonly style?: __yumcssReact.CSSProperties; readonly children?: __yumcssReact.ReactNode; readonly [key: string]: unknown }, ref) => { const style = runtimeCss.vars({ transform: (($yumcssProps) => \`translateX(\${(({ $translateX }) => $translateX)($yumcssProps)}px)\`)(props), width: "160px", height: "56px", display: "block" }); const attrs: { readonly as?: __yumcssReact.ElementType; readonly className?: string; readonly style?: __yumcssReact.CSSProperties; readonly children?: __yumcssReact.ReactNode; readonly [key: string]: unknown } = {}; const ResolvedComponent = attrs.as ?? props.as ?? "div"; const { as: _as, ...rest } = props; const { as: _attrsAs, ...attrsProps } = attrs; const forwarded = Object.fromEntries([...Object.entries(rest), ...Object.entries(attrsProps)].filter(([key]) => !key.startsWith("$"))); return <ResolvedComponent {...forwarded} ref={ref} className={runtimeCss.props(style, attrs.className, props.className).className} style={{ ...props.style, ...style.style, ...attrs.style }} />; });

		export const App = () => <TranslatedDot data-proof $translateX={1} />;
		",
		  "converted": 1,
		  "generatedFiles": [],
		  "loweringPlans": [
		    {
		      "applied": [],
		      "availableRepresentations": [
		        "named-map",
		        "residual",
		        "target-native",
		      ],
		      "representation": "target-native",
		      "residuals": [],
		    },
		  ],
		  "outcomes": [
		    {
		      "outcome": "host-runtime",
		      "representation": "target-native",
		    },
		  ],
		  "residuals": [],
		  "skipped": 0,
		  "validations": [
		    {
		      "differences": [],
		      "lossiness": "lossless",
		      "valid": true,
		    },
		  ],
		}
	`);
});

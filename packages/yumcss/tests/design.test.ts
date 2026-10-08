import { expect, test } from "vitest";
import { createStylesheet } from "../src/css/create-stylesheet.ts";
import { createDesignCss } from "../src/design/index.ts";
import {
	createDesignModuleRegistry,
	DesignStyleResolver,
	resolveDesignStyle,
} from "../src/design/resolve.ts";
import { examplePreset } from "@yumcss/example-preset";

const tokens = examplePreset.tokens;

test("design resolver accepts a substituted module adapter", () => {
	const resolver = new DesignStyleResolver(
		createDesignModuleRegistry([
			{
				key: "$frame",
				resolve: () => ({ outline: "substituted" }),
			},
		]),
	);
	expect(resolver.resolve({ $frame: { w: 1 } }, tokens)).toEqual({ outline: "substituted" });
});

test("resolve $frame — the box", () => {
	expect(
		resolveDesignStyle(
			{
				$frame: {
					w: "20",
					h: "40px",
					corners: "lg",
					fill: "$blue-500",
					pad: [4, 8],
					overflow: "clip",
					z: 10,
					opacity: 50,
				},
			},
			tokens,
		),
	).toEqual({
		width: "20px",
		height: "40px",
		borderRadius: "0.5rem",
		backgroundColor: "#3182ce",
		padding: "4px 8px",
		overflow: "hidden",
		zIndex: "10",
		opacity: "0.5",
	});
});

test("resolve $frame with dot-delimited aliases from legacy presets", () => {
	expect(resolveDesignStyle({ $frame: { fill: "blue.500" } }, tokens)).toEqual({
		backgroundColor: "#3182ce",
	});
});

test("resolve $frame — corners, border, blur and axis padding", () => {
	expect(
		resolveDesignStyle(
			{
				$frame: {
					corners: ["none", "full", "xl", "sm"],
					border: { color: "$red-300", width: "2px", style: "dashed" },
					blurBg: "8px",
					padX: "16",
					padY: 12,
				},
			},
			tokens,
		),
	).toEqual({
		borderRadius: "0 9999px 0.75rem 0.125rem",
		border: "2px dashed #FC8181",
		backdropFilter: "blur(8px)",
		paddingInline: "16px",
		paddingBlock: "12px",
	});
});

test("numeric strings without tokens require explicit units", () => {
	expect(() => resolveDesignStyle({ $frame: { w: "40" } }, tokens)).toThrow("explicit CSS unit");
	expect(() => resolveDesignStyle({ $layout: { gap: "6" } }, tokens)).toThrow("explicit CSS unit");
});

test("resolve $layout — stack flows, align and gaps", () => {
	expect(
		resolveDesignStyle(
			{
				$layout: {
					flow: "stackY",
					wrap: true,
					align: "top-center",
					gap: "16",
					gapX: "8",
				},
			},
			tokens,
		),
	).toEqual({
		display: "flex",
		flexDirection: "column",
		flexWrap: "wrap",
		justifyContent: "flex-start",
		alignItems: "center",
		gap: "16px",
		columnGap: "8px",
	});

	// stackX swaps the axes: align stays semantic ("top-left" means top-left).
	expect(
		resolveDesignStyle({ $layout: { flow: "stackX", align: "bottom-right" } }, tokens),
	).toEqual({
		display: "flex",
		flexDirection: "row",
		justifyContent: "flex-end",
		alignItems: "flex-end",
	});
});

test("resolve $layout — grid", () => {
	expect(
		resolveDesignStyle({ $layout: { flow: "grid", cols: 3, rows: 2, gapY: "12" } }, tokens),
	).toEqual({
		display: "grid",
		gridAutoFlow: "row",
		gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
		gridTemplateRows: "repeat(2, minmax(0, 1fr))",
		rowGap: "12px",
	});
});

test("resolve $text — the type", () => {
	expect(
		resolveDesignStyle(
			{
				$text: {
					color: "$red-300",
					font: "sans",
					weight: "semibold",
					size: "xl",
					align: "center",
					case: "upper",
					truncate: true,
					spacing: { line: "tight", letter: "wider" },
					decoration: { type: "underline", color: "$blue-500" },
					highlight: { bg: "$green-100" },
				},
			},
			tokens,
		),
	).toEqual({
		color: "#FC8181",
		fontFamily: "ui-sans-serif, system-ui, sans-serif",
		fontWeight: "600",
		fontSize: "1.25rem",
		textAlign: "center",
		textTransform: "uppercase",
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
		lineHeight: "1.25",
		letterSpacing: "0.05em",
		textDecorationLine: "underline",
		textDecorationColor: "#3182ce",
		backgroundColor: "#EFF6F8",
	});
});

test("modules nest inside conditions and selectors", () => {
	expect(
		resolveDesignStyle(
			{
				$frame: { w: "20" },
				_hover: { $frame: { fill: "$blue-600" } },
				sm: { $layout: { flow: "stackX" } },
				"&[data-open]": { $text: { color: "$red-500" } },
			},
			tokens,
		),
	).toEqual({
		width: "20px",
		_hover: { backgroundColor: "#2b6cb0" },
		sm: { display: "flex", flexDirection: "row" },
		"&[data-open]": { color: "#E53E3E" },
	});
});

test("$raw is passed through verbatim and falsey styles are dropped", () => {
	expect(
		resolveDesignStyle(
			{
				$raw: {
					color: "$red-500",
					_hover: { backgroundColor: "$blue-500" },
				},
				$frame: false,
				sm: false,
			},
			tokens,
		),
	).toEqual({
		color: "$red-500",
		_hover: { backgroundColor: "$blue-500" },
	});
});

test("createDesignCss compiles to hashed atomic classes", () => {
	const dss = createDesignCss(examplePreset, { debug: true });

	expect(
		dss({
			$frame: { w: "20", fill: "$blue-500" },
			_hover: { $text: { color: "$red-300" } },
		}),
	).toMatchInlineSnapshot(`
		{
		  "_hover__color": "_hover__color__#FC8181",
		  "backgroundColor": "backgroundColor__#3182ce",
		  "width": "width__20px",
		}
	`);
});

test("design CSS forwards the dynamic-carrier namespace", () => {
	const dss = createDesignCss(examplePreset, { namespace: "checkout" });

	expect(dss.vars({ $frame: { fill: "$blue-500" } })).toMatchObject({
		class: "checkout-background-color",
		style: { "--checkout-c-background-color": "#3182ce" },
	});
});

test("design class strings match the generated stylesheet", () => {
	const dss = createDesignCss(examplePreset, { debug: true });
	const sheet = createStylesheet(examplePreset, { debug: true });

	const styles = dss.raw({
		$frame: { w: "20", fill: "$blue-500", corners: "lg" },
		$text: { color: "$red-300" },
		_hover: { $frame: { fill: "$blue-600" } },
	});
	expect(Object.getPrototypeOf(styles)).toBe(Object.prototype);

	expect(sheet.process([styles])).toMatchInlineSnapshot(`
		Map {
		  "width__20px" => {
		    "css": ".width__20px{width:20px}",
		    "id": "width__20px",
		    "priority": 4000,
		  },
		  "borderRadius__0.5rem" => {
		    "css": ".borderRadius__0\\.5rem{border-radius:0.5rem}",
		    "id": "borderRadius__0.5rem",
		    "priority": 2000,
		  },
		  "backgroundColor__#3182ce" => {
		    "css": ".backgroundColor__\\#3182ce{background-color:#3182ce}",
		    "id": "backgroundColor__#3182ce",
		    "priority": 3000,
		  },
		  "color__#FC8181" => {
		    "css": ".color__\\#FC8181{color:#FC8181}",
		    "id": "color__#FC8181",
		    "priority": 3000,
		  },
		  "_hover__backgroundColor__#2b6cb0" => {
		    "css": "._hover__backgroundColor__\\#2b6cb0:hover{background-color:#2b6cb0}",
		    "id": "_hover__backgroundColor__#2b6cb0",
		    "priority": 3130,
		  },
		}
	`);
});

test("design dss.class and dss.props compose", () => {
	const dss = createDesignCss(examplePreset, { debug: true });

	expect(
		dss.class({
			$frame: { pad: "8", corners: "md" },
			$text: { weight: "bold" },
		}),
	).toBe("borderRadius__0.375rem padding__8px fontWeight__700");

	expect(
		dss.props(dss({ $frame: { fill: "$blue-500" } }), dss({ $text: { color: "$red-300" } })),
	).toEqual({
		className: "backgroundColor__#3182ce color__#FC8181",
		style: undefined,
	});
});

test("design dss.group resolves modules per slot", () => {
	const dss = createDesignCss(examplePreset, { debug: true });

	const group = dss.group({
		header: { $frame: { w: "20" } },
		body: { $text: { color: "$green-500" } },
	});

	expect(group).toMatchInlineSnapshot(`
    {
      "body": {
        "color": "color__#60A3BC",
      },
      "header": {
        "width": "width__20px",
      },
    }
  `);
});

test("design dss.group resolves function-valued slots at invocation time", () => {
	const dss = createDesignCss(examplePreset, { debug: true });
	const group = dss.group({
		item: ((padding: number) => ({ $raw: { padding: `${padding}px` } })) as any,
	});

	expect(dss.props((group.item as any)(8))).toEqual({
		className: "pw-padding",
		style: { "--pw-c-padding": "8px" },
	});
});

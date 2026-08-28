import { expect, test } from "vitest";
import { createStylesheet } from "../src/css/create-stylesheet.ts";
import { createDesignCss } from "../src/design/index.ts";
import {
	createDesignModuleRegistry,
	DesignStyleResolver,
	resolveDesignStyle,
} from "../src/design/resolve.ts";
import { examplePreset } from "../src/preset/example-preset.ts";

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
					h: 40,
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

test("resolve $frame — corners, border, blur and axis padding", () => {
	expect(
		resolveDesignStyle(
			{
				$frame: {
					corners: ["none", "full", "xl", "sm"],
					border: { color: "$red-300", width: 2, style: "dashed" },
					blurBg: 8,
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

test("numeric strings fall back to px when they are not tokens", () => {
	expect(
		resolveDesignStyle({ $frame: { w: "40" }, $layout: { flow: "stackX", gap: "6" } }, tokens),
	).toEqual({
		width: "40px",
		display: "flex",
		flexDirection: "row",
		gap: "6px",
	});
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
	const css = createDesignCss(examplePreset, { debug: true });

	expect(
		css({
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

test("design class strings match the generated stylesheet", () => {
	const css = createDesignCss(examplePreset, { debug: true });
	const sheet = createStylesheet(examplePreset, { debug: true });

	const styles = css.raw({
		$frame: { w: "20", fill: "$blue-500", corners: "lg" },
		$text: { color: "$red-300" },
		_hover: { $frame: { fill: "$blue-600" } },
	});

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
		    "priority": 3000,
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

test("design css().class and css().props compose", () => {
	const css = createDesignCss(examplePreset, { debug: true });

	expect(
		css.class({
			$frame: { pad: "8", corners: "md" },
			$text: { weight: "bold" },
		}),
	).toBe("borderRadius__0.375rem padding__8px fontWeight__700");

	expect(
		css.props(css({ $frame: { fill: "$blue-500" } }), css({ $text: { color: "$red-300" } })),
	).toEqual({
		className: "backgroundColor__#3182ce color__#FC8181",
		style: undefined,
	});
});

test("design css().group resolves modules per slot", () => {
	const css = createDesignCss(examplePreset, { debug: true });

	const group = css.group({
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

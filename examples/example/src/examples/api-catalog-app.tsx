import type { PropsWithChildren } from "react";
import { useState } from "react";
import { createCx } from "pandwind/cx";
import { css, relaxedCss, runtimeCss, untypedCss } from "../css";
import { dss } from "../design";
import { tw } from "../tw";

type RuntimeButtonInput = {
	background: string;
	padding: string;
};

const declarationMap = css({ color: "$blue-600", padding: 8 });
const declarationProps = css.props(declarationMap);
const classOutput = css.class({
	backgroundColor: "$gray-100",
	borderRadius: "md",
	color: "$gray-900",
	padding: 8,
});
const hostProps = css.props(
	css({
		backgroundColor: "$blue-600",
		borderRadius: "md",
		color: "$white",
		padding: 8,
	}),
);
const staticGroups = css.group({
	badge: {
		backgroundColor: "$gray-100",
		borderRadius: "base",
		color: "$gray-700",
		padding: 4,
	},
});
const inputButtonGroup = css.group({
	button: {
		$input: {} as RuntimeButtonInput,
		backgroundColor: css.input("background"),
		borderRadius: "md",
		color: "$white",
		padding: css.input("padding"),
	},
});
const rawStyle = untypedCss.raw({
	backgroundColor: "#f9fafb",
	border: "1px solid #e5e7eb",
	padding: "8px 12px",
});
const relaxedStyle = relaxedCss.raw({
	borderRadius: "10px",
	color: "rebeccapurple",
	padding: "12px",
});
const catalogCx = createCx({ css: dss });
const composedClassName = catalogCx(
	dss.class({ $text: { color: "$blue-600", weight: "semibold" } }),
	tw({ rounded: "md", p: "2" }),
	"caller-class",
);
const designClassName = dss.class({
	$frame: { fill: "$blue-50", pad: 2, corners: "md" },
	$text: { color: "$blue-700", size: "sm" },
});

const setupCode = `import { createCss } from "pandwind/css";
import { definePreset } from "pandwind/preset";

const preset = definePreset(theme, { conditions, properties });
const css = createCss(preset);
const openCss = createCss();`;

const buildCode = `import { pandwindCssVite } from "pandwind/vite";

export default defineConfig({
  plugins: [pandwindCssVite(preset)],
});

// main.tsx
import "pandwind:css";`;

type ApiCardProps = PropsWithChildren<{
	name: string;
	call: string;
	detail: string;
}>;

function ApiCard({ name, call, detail, children }: ApiCardProps) {
	return (
		<article
			className={tw({
				flex: "col",
				gap: "3",
				rounded: "lg",
				border: "1",
				borderColor: "gray-200",
				bg: "white",
				p: "4",
			})}
		>
			<header className={tw({ flex: "col", gap: "1" })}>
				<code className={tw({ font: "semibold", textColor: "sky-700" })}>{name}</code>
				<span className={tw({ textSize: "sm", textColor: "gray-600" })}>{detail}</span>
			</header>
			<pre
				className={tw({
					overflow: "auto",
					rounded: "md",
					bg: "gray-950",
					p: "3",
					textSize: "xs",
					textColor: "gray-200",
				})}
			>
				<code>{call}</code>
			</pre>
			<div className={tw({ rounded: "md", bg: "gray-50", p: "3" })}>{children}</div>
		</article>
	);
}

/**
 * A runnable API catalog. Every runtime entry below executes the API it
 * documents and renders its result; setup-only APIs show the exact project
 * file where they are called instead of pretending they are browser calls.
 */
export function ApiCatalogApp() {
	const [accent, setAccent] = useState("#0284c7");
	const [runtimePadding, setRuntimePadding] = useState(12);
	const varsProps = css.props(css.vars({ color: accent }));
	const inputProps = css.props(
		inputButtonGroup.button({
			background: accent,
			padding: `${runtimePadding}px ${runtimePadding * 2}px`,
		}),
	);
	const runtimeClass = runtimeCss.class({ outlineColor: accent });

	return (
		<section
			className={tw({
				colSpan: "full",
				flex: "col",
				gap: "4",
				rounded: "xl",
				bg: "gray-100",
				p: "6",
			})}
		>
			<header className={tw({ flex: "col", gap: "2" })}>
				<h2 className={tw({ textSize: "xl", font: "bold", textColor: "gray-900" })}>
					Pandwind API catalog
				</h2>
				<p className={tw({ maxW: "2xl", textSize: "sm", textColor: "gray-600" })}>
					These are executable examples, not an inventory. The code block is the call shape and the
					panel below it is the value or host props that call produces.
				</p>
			</header>

			<div className={tw({ grid: "cols-1", gap: "4", lg: { grid: "cols-2" } })}>
				<ApiCard
					name="tw()"
					call={`tw({ bg: "blue-600", p: "3", rounded: "md" })`}
					detail="typed utility objects become portable class strings"
				>
					<div className={tw({ rounded: "md", bg: "blue-600", p: "3", textColor: "white" })}>
						The rendered class string is the value of <code>tw()</code>.
					</div>
				</ApiCard>

				<ApiCard
					name="css()"
					call={`css({ color: "$blue-600", padding: 8 })`}
					detail="strict preset-bound declarations become an atomic declaration map"
				>
					<div {...declarationProps}>
						<code>{Object.keys(declarationMap).join(", ")}</code> are the compiled declaration keys.
					</div>
				</ApiCard>

				<ApiCard
					name="css.class()"
					call={`css.class({ backgroundColor: "$gray-100", borderRadius: "md", padding: 8 })`}
					detail="the same style object projected directly to one className"
				>
					<div className={classOutput}>The class projection is ready for a host element.</div>
				</ApiCard>

				<ApiCard
					name="css.vars()"
					call={`css.vars({ color: accent })`}
					detail="runtime values stay in inherited custom properties while the class stays stable"
				>
					<label className={tw({ flex: "col", gap: "2", textSize: "sm" })}>
						Accent value: {accent}
						<input
							type="color"
							value={accent}
							onChange={(event) => setAccent(event.currentTarget.value)}
							className={tw({ h: "8", w: "full", rounded: "md", border: "0", p: "0" })}
						/>
						<span {...varsProps}>This text follows the selected custom property.</span>
					</label>
				</ApiCard>

				<ApiCard
					name="css.props()"
					call={`<button {...css.props(css({ ... }))} />`}
					detail="the host projection combines className and style for JSX spreading"
				>
					<button type="button" {...hostProps}>
						Spread the generated host props
					</button>
				</ApiCard>

				<ApiCard
					name="css.group()"
					call={`const styles = css.group({ badge: { ... } })`}
					detail="named static groups compile once and can be reused"
				>
					<span {...css.props(staticGroups.badge)}>Reusable static badge</span>
				</ApiCard>

				<ApiCard
					name="createCss() + input()"
					call={`css.group({ button: { $input, padding: css.input("padding") } })`}
					detail="a typed input group keeps its class stable; pandwindCssVite extracts its structural var rules"
				>
					<label className={tw({ flex: "col", gap: "2", textSize: "sm" })}>
						Runtime padding: {runtimePadding}px
						<input
							type="range"
							min="8"
							max="24"
							step="4"
							value={runtimePadding}
							onChange={(event) => setRuntimePadding(Number(event.currentTarget.value))}
						/>
						<button type="button" {...inputProps}>
							Typed input group
						</button>
					</label>
				</ApiCard>

				<ApiCard
					name="createRuntimeCss()"
					call={`const runtimeCss = createRuntimeCss(preset); runtimeCss.class({ outlineColor: value })`}
					detail="use when runtime code must register CSS itself; prefer css.vars() for unbounded values in a built app"
				>
					<div className={catalogCx(runtimeClass, tw({ rounded: "md", border: "2", p: "3" }))}>
						This outline rule is registered through the runtime sheet.
					</div>
				</ApiCard>

				<ApiCard
					name="css.raw()"
					call={`const style = untypedCss.raw({ border: "1px solid #e5e7eb" })`}
					detail="an explicit inline-style escape hatch for hosts that need plain objects"
				>
					<div style={rawStyle}>This panel receives the raw style object directly.</div>
				</ApiCard>

				<ApiCard
					name="createCx() / cx()"
	call={`cx(dss.class({ ... }), tw({ ... }), "caller-class")`}
					detail="composition merges design atoms, utility strings, and caller classes"
				>
					<div className={composedClassName}>{composedClassName}</div>
				</ApiCard>

				<ApiCard
					name="createDesignCss()"
					call={`dss.class({ $frame: { fill: "$blue-50" }, $text: { size: "sm" } })`}
					detail="the design vocabulary resolves through the same preset-bound engine"
				>
					<div className={designClassName}>$frame and $text are live design modules.</div>
				</ApiCard>

				<ApiCard
					name="createCss() / definePreset()"
					call={setupCode}
					detail="bind a project preset for strict tokens, conditions, and property values"
				>
					<div className={tw({ flex: "col", gap: "2", textSize: "sm" })}>
						<strong>Preset-bound in this page:</strong>
						<code>{`css({ color: "$blue-600", padding: 8 })`}</code>
						<div style={relaxedStyle}>
							<strong>strict: false</strong> allows values such as <code>rebeccapurple</code> and
							<code>10px</code> while keeping the preset's conditions.
						</div>
					</div>
				</ApiCard>

				<ApiCard
					name="pandwindCssVite()"
					call={buildCode}
					detail="extract literal css() calls into the generated stylesheet at build time"
				>
					<div className={tw({ flex: "col", gap: "2", textSize: "sm" })}>
						<strong>Build integration:</strong>
						<span>
							Static calls in this catalog are discovered by the Vite plugin; runtime values remain
							runtime.
						</span>
					</div>
				</ApiCard>
			</div>
		</section>
	);
}

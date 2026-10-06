import type { exampleThemeScopes } from "@yumcss/example-preset";
import { useState } from "react";
import { untypedCss } from "../css";
import { cx } from "../cx";
import { tw } from "../tw";

const themeScopes = {
	base: undefined,
	ocean: "ocean",
	forest: "forest",
	sunset: "sunset",
} as const satisfies Record<
	"base" | keyof (typeof exampleThemeScopes)["themes"],
	string | undefined
>;

type ThemeName = keyof typeof themeScopes;
type ThemeScope = (typeof themeScopes)[ThemeName];

const inheritedVarProps = (accent: string, gap: number) =>
	untypedCss.props(
		untypedCss.vars({
			"--demo-accent": accent,
			"--demo-gap": `${gap}px`,
		}),
	);

const inheritedVarText = untypedCss.class({
	color: "var(--demo-accent)",
	padding: "var(--demo-gap)",
	border: "1px solid var(--demo-accent)",
});

const themedSurface = untypedCss.class({
	backgroundColor: "var(--color-surface)",
});

/**
 * Theme scopes only replace variables. The `bg-brand` utility and the
 * inherited custom variables keep the same classes while their values change.
 */
export function ThemesApp() {
	const [theme, setTheme] = useState<ThemeName>("base");
	const [accent, setAccent] = useState("#7c3aed");
	const [gap, setGap] = useState(8);
	const scope: ThemeScope = themeScopes[theme];
	const vars = inheritedVarProps(accent, gap);

	return (
		<section
			data-theme={scope}
			className={tw({
				mx: "auto",
				maxW: "md",
				rounded: "xl",
				border: "1",
				borderColor: "gray-200",
				p: "6",
			})}
		>
			<h2 className={tw({ textSize: "xl", font: "bold", textColor: "gray-900" })}>
				Theme scopes and inherited vars
			</h2>
			<p className={tw({ mt: "2", textSize: "sm", textColor: "gray-600" })}>
				Switching the scope changes semantic token values without changing the utility class. The
				custom variables below are inherited by their children and can change independently.
			</p>

			<div className={tw({ mt: "4", flex: "col", gap: "3", textSize: "sm" })}>
				<label className={tw({ flex: "col", gap: "1", font: "medium" })}>
					Theme: {theme}
					<select
						value={theme}
						onChange={(event) => {
							const value = event.currentTarget.value;
							setTheme(
								value === "ocean" || value === "forest" || value === "sunset" ? value : "base",
							);
						}}
						className={tw({ rounded: "md", border: "1", borderColor: "gray-300", p: "2" })}
					>
						<option value="base">base preset</option>
						<option value="ocean">ocean</option>
						<option value="forest">forest</option>
						<option value="sunset">sunset</option>
					</select>
				</label>
				<label className={tw({ flex: "col", gap: "1", font: "medium" })}>
					Inherited accent: {accent}
					<input
						type="color"
						value={accent}
						onChange={(event) => setAccent(event.currentTarget.value)}
						className={tw({ h: "10", w: "full", rounded: "md", border: "0", p: "0" })}
					/>
				</label>
				<label className={tw({ flex: "col", gap: "1", font: "medium" })}>
					Inherited gap: {gap}px
					<input
						type="range"
						min="4"
						max="24"
						step="4"
						value={gap}
						onChange={(event) => setGap(Number(event.currentTarget.value))}
					/>
				</label>
			</div>

			<div
				className={cx(
					tw({ mt: "4", rounded: "lg", p: "4", shadow: "sm" }),
					themedSurface,
					vars.className,
				)}
				style={vars.style}
			>
				<button
					type="button"
					className={tw({
						rounded: "md",
						bg: "brand",
						px: "4",
						py: "2",
						font: "semibold",
						text: "white",
					})}
				>
					Same bg-brand class in every theme
				</button>
				<p className={cx(tw({ mt: "3", textSize: "sm" }), inheritedVarText)}>
					This child reads <code>var(--demo-accent)</code> and <code>var(--demo-gap)</code> from its
					parent.
				</p>
			</div>
		</section>
	);
}

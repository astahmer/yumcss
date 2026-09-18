import type { Properties } from "csstype";
import { define } from "pandwind/preset";

const rawTokens = define.tokens({
	colors: {
		"$page-dark": "#09090b",
		"$page-light": "#f4f6f8",
		"$surface-dark": "#0e0e11",
		"$surface-light": "#ffffff",
		"$surface-raised-dark": "#121216",
		"$surface-raised-light": "#f8fafc",
		"$control-dark": "#16161b",
		"$control-light": "#eef2f6",
		"$control-selected-dark": "rgba(255, 255, 255, 0.08)",
		"$control-selected-light": "#dfe7f0",
		"$control-hover-dark": "rgba(255, 255, 255, 0.06)",
		"$control-hover-light": "#e7edf3",
		"$text-dark": "#d4d4d8",
		"$text-light": "#334155",
		"$text-strong-dark": "#f4f4f5",
		"$text-strong-light": "#172033",
		"$text-soft-dark": "#a1a1aa",
		"$text-soft-light": "#526074",
		"$text-muted-dark": "#71717a",
		"$text-muted-light": "#64748b",
		"$text-faint-dark": "#52525b",
		"$text-faint-light": "#8491a3",
		"$text-disabled-dark": "#3f3f46",
		"$text-disabled-light": "#a8b3c1",
		"$border-dark": "rgba(255, 255, 255, 0.07)",
		"$border-light": "rgba(29, 42, 60, 0.12)",
		"$border-strong-dark": "rgba(255, 255, 255, 0.1)",
		"$border-strong-light": "rgba(29, 42, 60, 0.17)",
		"$border-hover-dark": "rgba(255, 255, 255, 0.2)",
		"$border-hover-light": "rgba(29, 42, 60, 0.28)",
		"$accent-dark": "#e8955c",
		"$accent-light": "#b45f3e",
		"$accent-text-dark": "#fed7aa",
		"$accent-text-light": "#8a3f28",
		"$accent-soft-dark": "rgba(251, 146, 60, 0.12)",
		"$accent-soft-light": "rgba(180, 95, 62, 0.12)",
		"$success-dark": "#6ee7b7",
		"$success-light": "#16735b",
		"$warning-dark": "#fcd34d",
		"$warning-light": "#936400",
		"$info-dark": "#7dd3fc",
		"$info-light": "#196a8a",
		"$danger-dark": "#fca5a5",
		"$danger-light": "#ae3f3a",
		"$code-surface-dark": "#0e0e11",
		"$code-surface-light": "#f8fafc",
	},
	shadows: {
		"$menu-dark": "0 16px 40px rgba(0, 0, 0, 0.4)",
		"$menu-light": "0 16px 40px rgba(37, 52, 72, 0.16)",
		"$focus-dark": "0 0 0 1px rgba(251, 146, 60, 0.12)",
		"$focus-light": "0 0 0 1px rgba(180, 95, 62, 0.12)",
		"$glow-dark": "0 0 12px #e8955c",
		"$glow-light": "0 0 12px #b45f3e",
	},
	borders: {
		"$hairline-dark": "1px solid rgba(255, 255, 255, 0.07)",
		"$hairline-light": "1px solid rgba(29, 42, 60, 0.12)",
		"$strong-dark": "1px solid rgba(255, 255, 255, 0.1)",
		"$strong-light": "1px solid rgba(29, 42, 60, 0.17)",
		"$hover-dark": "1px solid rgba(255, 255, 255, 0.2)",
		"$hover-light": "1px solid rgba(29, 42, 60, 0.28)",
	},
});

const themeConditions = { base: "", _light: '[data-theme="light"] &' };
const semanticTokens = rawTokens.defineSemanticTokens(themeConditions, {
	colors: {
		page: { base: rawTokens.colors["$page-dark"], _light: rawTokens.colors["$page-light"] },
		surface: {
			base: rawTokens.colors["$surface-dark"],
			_light: rawTokens.colors["$surface-light"],
		},
		surfaceRaised: {
			base: rawTokens.colors["$surface-raised-dark"],
			_light: rawTokens.colors["$surface-raised-light"],
		},
		control: {
			base: rawTokens.colors["$control-dark"],
			_light: rawTokens.colors["$control-light"],
		},
		controlSelected: {
			base: rawTokens.colors["$control-selected-dark"],
			_light: rawTokens.colors["$control-selected-light"],
		},
		controlHover: {
			base: rawTokens.colors["$control-hover-dark"],
			_light: rawTokens.colors["$control-hover-light"],
		},
		text: { base: rawTokens.colors["$text-dark"], _light: rawTokens.colors["$text-light"] },
		textStrong: {
			base: rawTokens.colors["$text-strong-dark"],
			_light: rawTokens.colors["$text-strong-light"],
		},
		textSoft: {
			base: rawTokens.colors["$text-soft-dark"],
			_light: rawTokens.colors["$text-soft-light"],
		},
		textMuted: {
			base: rawTokens.colors["$text-muted-dark"],
			_light: rawTokens.colors["$text-muted-light"],
		},
		textFaint: {
			base: rawTokens.colors["$text-faint-dark"],
			_light: rawTokens.colors["$text-faint-light"],
		},
		textDisabled: {
			base: rawTokens.colors["$text-disabled-dark"],
			_light: rawTokens.colors["$text-disabled-light"],
		},
		border: {
			base: rawTokens.colors["$border-dark"],
			_light: rawTokens.colors["$border-light"],
		},
		borderStrong: {
			base: rawTokens.colors["$border-strong-dark"],
			_light: rawTokens.colors["$border-strong-light"],
		},
		borderHover: {
			base: rawTokens.colors["$border-hover-dark"],
			_light: rawTokens.colors["$border-hover-light"],
		},
		accent: {
			base: rawTokens.colors["$accent-dark"],
			_light: rawTokens.colors["$accent-light"],
		},
		accentText: {
			base: rawTokens.colors["$accent-text-dark"],
			_light: rawTokens.colors["$accent-text-light"],
		},
		accentSoft: {
			base: rawTokens.colors["$accent-soft-dark"],
			_light: rawTokens.colors["$accent-soft-light"],
		},
		success: {
			base: rawTokens.colors["$success-dark"],
			_light: rawTokens.colors["$success-light"],
		},
		warning: {
			base: rawTokens.colors["$warning-dark"],
			_light: rawTokens.colors["$warning-light"],
		},
		info: { base: rawTokens.colors["$info-dark"], _light: rawTokens.colors["$info-light"] },
		danger: {
			base: rawTokens.colors["$danger-dark"],
			_light: rawTokens.colors["$danger-light"],
		},
		codeSurface: {
			base: rawTokens.colors["$code-surface-dark"],
			_light: rawTokens.colors["$code-surface-light"],
		},
	},
	shadows: {
		menu: { base: rawTokens.shadows["$menu-dark"], _light: rawTokens.shadows["$menu-light"] },
		focus: { base: rawTokens.shadows["$focus-dark"], _light: rawTokens.shadows["$focus-light"] },
		glow: { base: rawTokens.shadows["$glow-dark"], _light: rawTokens.shadows["$glow-light"] },
	},
	borders: {
		hairline: {
			base: rawTokens.borders["$hairline-dark"],
			_light: rawTokens.borders["$hairline-light"],
		},
		strong: {
			base: rawTokens.borders["$strong-dark"],
			_light: rawTokens.borders["$strong-light"],
		},
		hover: {
			base: rawTokens.borders["$hover-dark"],
			_light: rawTokens.borders["$hover-light"],
		},
	},
});

const theme = define.theme({
	config: {} as Properties,
	tokens: semanticTokens,
});

export type PlaygroundColorToken = keyof typeof semanticTokens.colors;

export const playgroundPreset = define.preset(theme, {
	strict: true,
	conditions: themeConditions,
	properties: {
		backgroundColor: { $tokens: "colors", $strict: false },
		color: { $tokens: "colors", $strict: false },
		borderColor: { $tokens: "colors", $strict: false },
		outlineColor: { $tokens: "colors", $strict: false },
		accentColor: { $tokens: "colors", $strict: false },
		fill: { $tokens: "colors", $strict: false },
		stroke: { $tokens: "colors", $strict: false },
		textDecorationColor: { $tokens: "colors", $strict: false },
		boxShadow: { $tokens: "shadows", $strict: false },
		border: { $tokens: "borders", $strict: false },
		borderTop: { $tokens: "borders", $strict: false },
		borderRight: { $tokens: "borders", $strict: false },
		borderBottom: { $tokens: "borders", $strict: false },
		borderLeft: { $tokens: "borders", $strict: false },
		$all: true,
	},
});

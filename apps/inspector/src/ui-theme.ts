import { define } from "yumcss/preset";
import { csstypePreset } from "yumcss/preset/csstype";

type InspectorCssConfig = { [Property in keyof typeof csstypePreset._config]?: string | number };

const inspectorCssConfig: InspectorCssConfig = {};

const inspectorTheme = define.theme({
	config: inspectorCssConfig,
	tokens: csstypePreset.tokens,
});

export const inspectorPreset = define.preset(
	inspectorTheme,
	{
		strict: true,
		conditions: csstypePreset.conditions,
		properties: { $all: true },
	},
	{
		globals: {
			"*": { boxSizing: "border-box" },
			":root": {
				colorScheme: "dark",
				"--bg": "#0b0e14",
				"--bg-raised": "#11151d",
				"--panel": "#151a23",
				"--panel-hover": "#1a2029",
				"--line": "#232a35",
				"--line-strong": "#2f3947",
				"--text": "#e6ebf4",
				"--muted": "#8b96a8",
				"--accent": "#63b3ed",
				"--accent-dim": "#3182ce",
				"--good": "#68d391",
				"--warn": "#f6ad55",
				"--bad": "#fc8181",
				"--mono": 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
			},
			html: { scrollBehavior: "smooth" },
			body: {
				margin: 0,
				background:
					"radial-gradient(1200px 500px at 80% -10%, rgba(49, 130, 206, 0.08), transparent), var(--bg)",
				color: "var(--text)",
				font: "14px/1.55 ui-sans-serif, system-ui, sans-serif",
				WebkitFontSmoothing: "antialiased",
			},
			header: {
				display: "flex",
				alignItems: "center",
				gap: 16,
				padding: "14px 0 18px",
				borderBottom: "1px solid var(--line)",
				marginBottom: 18,
				position: "sticky",
				top: 0,
				background: "color-mix(in srgb, var(--bg) 88%, transparent)",
				backdropFilter: "blur(8px)",
				zIndex: 5,
			},
			"header nav": {
				display: "flex",
				gap: 6,
				marginLeft: "auto",
				alignItems: "center",
			},
			h1: {
				fontSize: 17,
				fontWeight: 700,
				letterSpacing: "-0.01em",
				margin: 0,
				display: "flex",
				alignItems: "center",
				gap: 8,
			},
			button: {
				background: "transparent",
				color: "var(--text)",
				border: "1px solid var(--line)",
				borderRadius: 7,
				padding: "6px 13px",
				cursor: "pointer",
				font: "inherit",
				fontSize: 13,
				transition: "border-color 120ms, background 120ms, color 120ms",
			},
			"button:hover:not(:disabled)": {
				borderColor: "var(--line-strong)",
				background: "var(--panel-hover)",
			},
			"button:disabled": { opacity: 0.5, cursor: "default" },
			":focus-visible": { outline: "2px solid var(--accent)", outlineOffset: 2 },
			h2: {
				fontSize: 12,
				textTransform: "uppercase",
				letterSpacing: "0.09em",
				color: "var(--muted)",
				margin: "30px 0 10px",
			},
			h3: {
				fontSize: 12.5,
				color: "var(--muted)",
				margin: "18px 0 8px",
				fontWeight: 600,
			},
			section: { marginTop: 10 },
			table: {
				width: "100%",
				borderCollapse: "collapse",
				background: "var(--panel)",
				border: "1px solid var(--line)",
				borderRadius: 9,
				overflow: "hidden",
			},
			"th, td": {
				textAlign: "left",
				padding: "7px 13px",
				borderBottom: "1px solid var(--line)",
			},
			th: { color: "var(--muted)", fontWeight: 500, fontSize: 12 },
			"tr:last-child td": { borderBottom: "none" },
			"tbody tr:hover td": { background: "var(--panel-hover)" },
			code: { color: "var(--accent)", fontFamily: "var(--mono)", fontSize: 12.5 },
			a: { color: "var(--accent)", textDecoration: "none" },
			"a:hover": { textDecoration: "underline" },
			label: { cursor: "pointer" },
		},
		keyframes: {
			spin: { to: { transform: "rotate(360deg)" } },
			skeleton: { to: { backgroundPosition: "-200% 0" } },
		},
	},
);

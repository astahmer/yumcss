import { css } from "./css";

/**
 * The same surface authored with Pandwind's typed atomic object syntax.
 */
export function CssInJsApp() {
	return (
		<section
			className={css.class({
				maxWidth: "28rem",
				margin: "0 auto",
				padding: "24px",
				borderRadius: "12px",
				backgroundColor: "#ffffff",
				boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)",
			})}
		>
			<h1 className={css.class({ fontSize: "24px", fontWeight: 700, color: "#111827" })}>
				typed css()
			</h1>
			<p className={css.class({ fontSize: "14px", lineHeight: "24px", color: "#4b5563" })}>
				Hover the button:{" "}
				<code
					className={css.class({
						borderRadius: "6px",
						backgroundColor: "#f3f4f6",
						padding: "2px 4px",
						fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
						fontSize: "12px",
						color: "#0369a1",
					})}
				>
					css.class()
				</code>{" "}
				emits atomic CSS from the Pandwind engine.
			</p>
			<button
				type="button"
				className={css.class({
					border: "0",
					borderRadius: "6px",
					backgroundColor: "#0284c7",
					padding: "8px 16px",
					fontSize: "14px",
					fontWeight: 600,
					color: "#ffffff",
					boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
					transition: "background-color 120ms",
					"&:hover": { backgroundColor: "#0369a1" },
					"&:focus-visible": { outline: "2px solid #0284c7", outlineOffset: "2px" },
				})}
			>
				Atomic button
			</button>
			<div
				className={css.class({
					display: "flex",
					flexDirection: "column",
					gap: "8px",
					"@media (min-width: 640px)": { flexDirection: "row" },
				})}
			>
				<span className={css.class({ fontSize: "12px", color: "#6b7280" })}>responsive:</span>
				<span
					className={css.class({
						fontSize: "12px",
						fontWeight: 500,
						color: "#374151",
					})}
				>
					stack on mobile, row on sm+
				</span>
			</div>
		</section>
	);
}

import { untypedCss } from "./css";

/** Raw Pandwind atomic CSS with the deliberately untyped convenience form. */
export function AtomicApp() {
	return (
		<section
			className={untypedCss.class({
				maxWidth: "28rem",
				margin: "0 auto",
				padding: "24px",
				borderRadius: "12px",
				backgroundColor: "#ffffff",
				boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)",
			})}
		>
			<h1 className={untypedCss.class({ fontSize: "24px", fontWeight: 700, color: "#111827" })}>
				createCss()
			</h1>
			<p className={untypedCss.class({ fontSize: "14px", lineHeight: "24px", color: "#4b5563" })}>
				This is the open convenience form. Bind a preset to get token and condition types.
			</p>
			<button
				type="button"
				className={untypedCss.class({
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
		</section>
	);
}

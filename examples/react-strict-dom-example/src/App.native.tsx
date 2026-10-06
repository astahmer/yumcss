import { html } from "react-strict-dom";
import { createCss, ReactStrictDomPlatform } from "yumcss/react-strict-dom";

const css = createCss({ platform: ReactStrictDomPlatform.Native });
const styles = css.create({
	card: {
		backgroundColor: "white",
		borderRadius: "8px",
		padding: "1rem",
	},
	selected: { borderColor: "blue", borderWidth: "2px" },
	opacity: (value: number) => ({ opacity: value }),
});

export function App({ selected = false, opacity = 1 }) {
	return (
		<html.div style={[styles.card, selected && styles.selected, styles.opacity(opacity)]}>
			<html.span>React Strict DOM + YumCSS</html.span>
		</html.div>
	);
}

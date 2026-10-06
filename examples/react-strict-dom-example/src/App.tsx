import { html } from "react-strict-dom";
import { createCss } from "yumcss/react-strict-dom";

const css = createCss();
const styles = css.create({
	card: {
		backgroundColor: "white",
		borderRadius: "8px",
		padding: "1rem",
	},
	selected: { borderColor: "blue", borderWidth: "2px" },
});

export function App({ selected = false }) {
	return (
		<html.div style={[styles.card, selected && styles.selected]}>
			<html.span>React Strict DOM + YumCSS</html.span>
		</html.div>
	);
}

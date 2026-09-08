import { html } from "react-strict-dom";
import { createCss } from "pandwind/react-strict-dom";

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
			<html.span>React Strict DOM + Pandwind</html.span>
		</html.div>
	);
}

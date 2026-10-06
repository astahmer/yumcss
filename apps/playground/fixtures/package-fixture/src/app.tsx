import { useState } from "react";
import { css } from "./css";

export const App = () => {
	const [clicks, setClicks] = useState(0);
	const className = css.class({
		backgroundColor: "$blue-500",
		color: "$white",
		padding: 16,
	});
	return (
		<main data-testid="fixture-host" className={className}>
			YumCSS package fixture
			<button data-testid="hydration-control" onClick={() => setClicks((count) => count + 1)}>
				Clicks: {clicks}
			</button>
		</main>
	);
};

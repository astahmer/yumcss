import { css } from "./css";

export const App = () => {
	const className = css.class({
		backgroundColor: "$blue-500",
		color: "$white",
		padding: 16,
	});
	return (
		<main data-testid="fixture-host" className={className}>
			Pandwind package fixture
		</main>
	);
};

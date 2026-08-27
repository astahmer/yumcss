import { createUseStyles } from "react-jss";

export const useCardStyles = createUseStyles({
	card: { color: "red", "&:hover": { color: "blue" } },
});

declare module "@linaria/core" {
	export const css: (...args: unknown[]) => string;
}

declare module "react-jss" {
	export const createUseStyles: (...args: unknown[]) => unknown;
}

declare module "style9" {
	const style9: { create: (...args: unknown[]) => unknown };
	export default style9;
}

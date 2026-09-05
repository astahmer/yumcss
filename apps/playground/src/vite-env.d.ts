/// <reference types="vite/client" />

/** Virtual CSS module served by `pandwindCssVite`. */
declare module "pandwind:css" {}

declare module "virtual:pandwind-tailwind-default-css" {
	const css: string;
	export default css;
}

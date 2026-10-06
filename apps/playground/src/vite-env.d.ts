/// <reference types="vite/client" />

/** Virtual CSS module served by `yumcssExtractVite`. */
declare module "yumcss:css" {}
declare module "yumcss:ui-css" {}

declare module "virtual:yumcss-tailwind-default-css" {
	const css: string;
	export default css;
}

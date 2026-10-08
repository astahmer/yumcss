/// <reference types="vite/client" />

/** Virtual CSS module served by `yumcssExtractVite`. */
declare module "yumcss:css" {}
declare module "yumcss:ui-css" {}

declare module "virtual:yumcss-tailwind-default-css" {
	const css: string;
	export default css;
}

declare module "virtual:yumcss-preview-tailwind-stylesheets" {
	const stylesheets: Record<string, string>;
	export default stylesheets;
}

declare module "*/generated/panda/css/css.mjs" {
	export const css: (style: Record<string, unknown>) => string;
}

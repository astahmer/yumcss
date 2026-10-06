import { createUnplugin } from "unplugin";
import {
	createVirtualMigrationPlugin,
	type YumCSSMigrateOptions,
} from "./virtual-migration-core.ts";

export type { YumCSSMigrateOptions, VirtualMigrationResidual } from "./virtual-migration-core.ts";

/**
 * Universal codemod bundler plugin. Use a platform slice such as
 * `yumcssMigrateUnplugin.vite` or the named exports below in a bundler
 * configuration. All slices execute the same migration use case.
 */
export const yumcssMigrateUnplugin = createUnplugin<YumCSSMigrateOptions, false>(
	(options: YumCSSMigrateOptions) => createVirtualMigrationPlugin(options),
);

export const yumcssMigrateVite = yumcssMigrateUnplugin.vite;
export const yumcssMigrateRollup = yumcssMigrateUnplugin.rollup;
export const yumcssMigrateRolldown = yumcssMigrateUnplugin.rolldown;
export const yumcssMigrateWebpack = yumcssMigrateUnplugin.webpack;
export const yumcssMigrateRspack = yumcssMigrateUnplugin.rspack;
export const yumcssMigrateRsbuild = yumcssMigrateUnplugin.rsbuild;
export const yumcssMigrateEsbuild = yumcssMigrateUnplugin.esbuild;
export const yumcssMigrateFarm = yumcssMigrateUnplugin.farm;
export const yumcssMigrateBun = yumcssMigrateUnplugin.bun;
export const yumcssMigrateUnloader = yumcssMigrateUnplugin.unloader;

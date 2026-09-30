import { createUnplugin } from "unplugin";
import {
	createVirtualMigrationPlugin,
	type PandwindMigrateOptions,
} from "./virtual-migration-core.ts";

export type {
	PandwindMigrateOptions,
	VirtualMigrationResidual,
} from "./virtual-migration-core.ts";

/**
 * Universal codemod bundler plugin. Use a platform slice such as
 * `pandwindMigrateUnplugin.vite` or the named exports below in a bundler
 * configuration. All slices execute the same migration use case.
 */
export const pandwindMigrateUnplugin = createUnplugin<PandwindMigrateOptions, false>(
	(options: PandwindMigrateOptions) => createVirtualMigrationPlugin(options),
);

export const pandwindMigrateVite = pandwindMigrateUnplugin.vite;
export const pandwindMigrateRollup = pandwindMigrateUnplugin.rollup;
export const pandwindMigrateRolldown = pandwindMigrateUnplugin.rolldown;
export const pandwindMigrateWebpack = pandwindMigrateUnplugin.webpack;
export const pandwindMigrateRspack = pandwindMigrateUnplugin.rspack;
export const pandwindMigrateRsbuild = pandwindMigrateUnplugin.rsbuild;
export const pandwindMigrateEsbuild = pandwindMigrateUnplugin.esbuild;
export const pandwindMigrateFarm = pandwindMigrateUnplugin.farm;
export const pandwindMigrateBun = pandwindMigrateUnplugin.bun;
export const pandwindMigrateUnloader = pandwindMigrateUnplugin.unloader;

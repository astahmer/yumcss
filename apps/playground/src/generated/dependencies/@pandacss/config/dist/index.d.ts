// Generated from the workspace-linked pandwind package. Do not edit.
import * as _pandacss_types from '@pandacss/types';
import { Config, ConfigTsOptions, PandaHooks, LoadConfigResult } from '@pandacss/types';
export { diffConfigs } from './diff-config.d.ts';
import { TSConfig } from 'pkg-types';
import { P as PathMapping } from './ts-config-paths-qwrwgu2Q.d.ts';
export { c as convertTsPathsToRegexes } from './ts-config-paths-qwrwgu2Q.d.ts';
export { mergeConfigs, mergeHooks } from './merge-config.d.ts';
import * as get_tsconfig from 'get-tsconfig';
import { TsConfigJsonResolved } from 'get-tsconfig';

interface ConfigFileOptions {
    cwd: string;
    file?: string;
}
interface BundleConfigResult<T = Config> {
    config: T;
    dependencies: string[];
    path: string;
}

declare function bundleConfig(options: ConfigFileOptions): Promise<BundleConfigResult>;

declare function findConfig(options: Partial<ConfigFileOptions>): string;

interface GetDepsOptions {
    filename: string;
    ext: string;
    cwd: string;
    seen: Set<string>;
    baseUrl: string | undefined;
    pathMappings: PathMapping[];
    foundModuleAliases: Map<string, string>;
    compilerOptions?: TSConfig['compilerOptions'];
}
declare function getConfigDependencies(filePath: string, tsOptions?: ConfigTsOptions, compilerOptions?: TSConfig['compilerOptions']): {
    deps: Set<string>;
    aliases: Map<string, string>;
};

type Extendable<T> = T & {
    extend?: T;
};
type ExtendableConfig = Extendable<Config>;
/**
 * Recursively merge all presets into a single config (depth-first using stack)
 */
declare function getResolvedConfig(config: ExtendableConfig, cwd: string, hooks?: Partial<PandaHooks>): Promise<Config>;

/**
 * Find, load and resolve the final config (including presets)
 */
declare function loadConfig(options: ConfigFileOptions): Promise<_pandacss_types.LoadConfigResult>;

/**
 * Resolve the final config (including presets)
 * @pandacss/preset-base: ALWAYS included if NOT using eject: true
 * @pandacss/preset-panda: only included by default if no presets
 */
declare function resolveConfig(result: BundleConfigResult, cwd: string): Promise<LoadConfigResult>;

/**
 * Resolve the tsconfig file esbuild should use when bundling a config file.
 *
 * 1. Prefer the project that owns the config file (inclusion / references).
 * 2. If that project has no `paths`, fall back to the first referenced project
 *    that defines them (Vite: config owned by tsconfig.node.json, aliases on
 *    tsconfig.app.json).
 */
declare function resolveTsconfigForConfigBundle(configFile: string, cwd: string): Promise<string | undefined>;

/**
 * If `filename` points to a `.json` file that exists as a regular file, return its absolute path.
 */
declare function resolveDirectTsconfigJson(filename: string): Promise<string | null>;
/**
 * Walk upward from `dirname(filename)` and return the first existing `configName`,
 * stopping at `root` (inclusive) or the filesystem root.
 */
declare function findClosestTsconfig(filename: string, root: string, configName?: string): Promise<string | null>;
/**
 * Resolve `compilerOptions.baseUrl` the same way TypeScript does: relative to the tsconfig file.
 * Falls back to `cwd` when `baseUrl` is omitted.
 */
declare function resolveBaseUrlForCompilerOptions(baseUrl: string | undefined, tsconfigFile: string, cwd: string): string;
/**
 * When a file belongs to a referenced project (TypeScript project references),
 * return that project's merged tsconfig for `compilerOptions`.
 */
declare function resolveSolutionTsconfigForFile(absoluteFilename: string, rootTsconfigPath: string, rootParsed: TsConfigJsonResolved, getTsconfigModule: typeof get_tsconfig): Promise<{
    tsconfig: TsConfigJsonResolved;
    tsconfigFile: string;
}>;
/** Whether `absoluteFilename` is part of the compilation set defined by this tsconfig. */
declare function isSourceFileIncludedInTsconfig(absoluteFilename: string, tsconfigFile: string, tsconfig: TsConfigJsonResolved): boolean;

export { type BundleConfigResult, type GetDepsOptions, bundleConfig, findClosestTsconfig, findConfig, getConfigDependencies, getResolvedConfig, isSourceFileIncludedInTsconfig, loadConfig, resolveBaseUrlForCompilerOptions, resolveConfig, resolveDirectTsconfigJson, resolveSolutionTsconfigForFile, resolveTsconfigForConfigBundle };

import { type CssConfigReturn } from "pandwind/types/typings";
import { resolve } from "node:path";
import {
	NODE_PROJECT_MODULE_LOADER,
	type ProjectModuleLoader,
} from "./swap/project-module-loader.ts";

type RecordValue = Record<string, unknown>;

const isRecord = (value: unknown): value is RecordValue =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const isPreset = (value: unknown): value is CssConfigReturn =>
	isRecord(value) &&
	isRecord(value.conditions) &&
	isRecord(value.properties) &&
	typeof value.strict === "boolean" &&
	isRecord(value.tokens);

const isPackageSpecifier = (value: string): boolean =>
	!value.startsWith("/") && !value.startsWith(".");

export interface LoadPandwindPresetOptions {
	readonly root: string;
	readonly presetImport: string;
	readonly presetExport: string;
}

/** Load and validate a Pandwind preset through the host project's module boundary. */
export const loadPandwindPreset = async (
	options: LoadPandwindPresetOptions,
	moduleLoader: ProjectModuleLoader = NODE_PROJECT_MODULE_LOADER,
): Promise<CssConfigReturn> => {
	const module = isPackageSpecifier(options.presetImport)
		? await moduleLoader.importPackage<Record<string, unknown>>(options.presetImport, options.root)
		: await moduleLoader.importFile<Record<string, unknown>>(
				resolve(options.root, options.presetImport),
			);
	if (module === undefined)
		throw new Error(`could not load preset module ${options.presetImport} from ${options.root}`);
	const preset = options.presetExport === "default" ? module.default : module[options.presetExport];
	if (!isPreset(preset))
		throw new Error(
			`export ${options.presetExport} from ${options.presetImport} is not a Pandwind preset`,
		);
	return preset;
};

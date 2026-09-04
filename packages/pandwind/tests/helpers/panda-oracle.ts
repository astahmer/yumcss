/**
 * @pandacss/shared oracle: Panda's real classname runtime, loaded from the
 * workspace root (it is reachable only as a phantom dependency of the root's
 * @pandacss/config, so the pandwind package's own dependency graph stays
 * unchanged). Typed structurally against the package's .d.mts surface.
 */
import { createRequire } from "node:module";

const rootRequire = createRequire(new URL("../../../../package.json", import.meta.url));

interface PandaShared {
	createCss: (context: {
		utility: {
			prefix?: string;
			hasShorthand: boolean;
			resolveShorthand: (prop: string) => string;
			transform: (prop: string, value: string) => { className: string };
		};
		conditions?: {
			breakpoints: { keys: string[] };
			shift: (paths: string[]) => string[];
			finalize: (paths: string[]) => string[];
		};
	}) => (styles?: Record<string, unknown>) => string;
	hypenateProperty: (prop: string) => string;
	withoutSpace: (value: string) => string;
}

export const pandaShared = async (): Promise<PandaShared> => {
	const pkgDir = rootRequire.resolve("@pandacss/shared/package.json").replace("/package.json", "");
	return (await import(pkgDir + "/dist/index.mjs")) as PandaShared;
};

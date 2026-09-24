import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createCompilerPreviewWorkspace, type CompilerPreviewWorkspace } from "./workspace.ts";

const MAX_SOURCE_BYTES = 1_000_000;

interface VitePlugin {
	readonly name?: string;
}

interface ViteDevServer {
	readonly config: {
		readonly plugins: readonly VitePlugin[];
	};
	transformRequest(url: string): Promise<{ readonly code: string } | null>;
	close(): Promise<void>;
}

interface ViteModule {
	readonly version?: string;
	createServer(options: {
		readonly root: string;
		readonly configFile?: string;
		readonly server: { readonly middlewareMode: true; readonly hmr: false };
		readonly appType: "custom";
		readonly logLevel: "error";
	}): Promise<ViteDevServer>;
}

export interface CompilerPreviewRuntimeInfo {
	readonly root: string;
	readonly viteVersion: string;
	readonly plugins: readonly string[];
	readonly pandwindPlugins: readonly string[];
}

export interface CompilerPreviewTransform {
	readonly file: string;
	readonly source: string;
	readonly code: string;
	readonly sourceBytes: number;
	readonly outputBytes: number;
	readonly durationMs: number;
}

export interface CompilerPreviewSource {
	readonly file: string;
	readonly source: string;
	readonly sourceBytes: number;
}

export interface CompilerPreviewRuntime {
	readonly info: CompilerPreviewRuntimeInfo;
	files(): readonly { readonly path: string; readonly bytes: number }[];
	read(file: string): CompilerPreviewSource;
	transform(file: string): Promise<CompilerPreviewTransform>;
	close(): Promise<void>;
}

export interface CompilerPreviewRuntimeOptions {
	readonly root: string;
	readonly configFile?: string;
	readonly workspace?: CompilerPreviewWorkspace;
}

const resolveViteEntry = (root: string): string => {
	const projectRequire = createRequire(resolve(root, "package.json"));
	try {
		return projectRequire.resolve("vite");
	} catch {
		const packageRequire = createRequire(import.meta.url);
		try {
			return packageRequire.resolve("vite");
		} catch {
			throw new Error(
				`Vite is not installed from the project root or pandwind-analyze package: ${root}`,
			);
		}
	}
};

const viteUrl = (file: string): string =>
	`/${file
		.split("/")
		.map((segment) => encodeURIComponent(segment))
		.join("/")}`;

export const createCompilerPreviewRuntime = async (
	options: CompilerPreviewRuntimeOptions,
): Promise<CompilerPreviewRuntime> => {
	const workspace = options.workspace ?? createCompilerPreviewWorkspace(options.root);
	const viteUrlPath = resolveViteEntry(workspace.root);
	const vite: ViteModule = await import(pathToFileURL(viteUrlPath).href);
	const server = await vite.createServer({
		root: workspace.root,
		...(options.configFile === undefined
			? {}
			: { configFile: resolve(workspace.root, options.configFile) }),
		server: { middlewareMode: true, hmr: false },
		appType: "custom",
		logLevel: "error",
	});
	const plugins = server.config.plugins.flatMap((plugin) =>
		typeof plugin.name === "string" ? [plugin.name] : [],
	);

	return {
		info: {
			root: workspace.root,
			viteVersion: vite.version ?? "unknown",
			plugins,
			pandwindPlugins: plugins.filter((name) => name.toLowerCase().includes("pandwind")),
		},
		files: () => workspace.files(),
		read(file) {
			const sourceFile = workspace.read(file);
			const sourceBytes = Buffer.byteLength(sourceFile.source, "utf8");
			if (sourceBytes > MAX_SOURCE_BYTES)
				throw new Error(
					`Source file exceeds the ${MAX_SOURCE_BYTES.toLocaleString()} byte preview limit`,
				);
			return { file: sourceFile.path, source: sourceFile.source, sourceBytes };
		},
		async transform(file) {
			const sourceFile = workspace.read(file);
			const sourceBytes = Buffer.byteLength(sourceFile.source, "utf8");
			if (sourceBytes > MAX_SOURCE_BYTES)
				throw new Error(
					`Source file exceeds the ${MAX_SOURCE_BYTES.toLocaleString()} byte preview limit`,
				);
			const startedAt = performance.now();
			const result = await server.transformRequest(viteUrl(sourceFile.path));
			if (result === null)
				throw new Error("Vite did not return a transformed module for this file");
			return {
				file: sourceFile.path,
				source: sourceFile.source,
				code: result.code,
				sourceBytes,
				outputBytes: Buffer.byteLength(result.code, "utf8"),
				durationMs: performance.now() - startedAt,
			};
		},
		close: () => server.close(),
	};
};

interface PlaygroundFormatter {
	format(source: string): Promise<string>;
}

let formatterPromise: Promise<PlaygroundFormatter> | undefined;

function loadFormatter(): Promise<PlaygroundFormatter> {
	return (formatterPromise ??= Promise.all([
		import("prettier/standalone"),
		import("prettier/plugins/estree"),
		import("prettier/plugins/typescript"),
	]).then(([prettier, estree, typescript]) => ({
		format: (source) =>
			prettier.format(source, {
				filepath: "playground.tsx",
				parser: "typescript",
				plugins: [estree, typescript],
				printWidth: 100,
				useTabs: true,
			}),
	})));
}

/** Format emitted source in the browser; preserve it verbatim if formatting fails. */
export async function formatPlaygroundCode(source: string): Promise<string> {
	try {
		return await (await loadFormatter()).format(source);
	} catch {
		return source;
	}
}

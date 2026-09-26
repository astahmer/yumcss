import { realpathSync, readFileSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
	parseDtcgTokenDocument,
	type TokenJsonValue,
	type TokenSourceLoader,
} from "./token-document.ts";

const isWithinRoot = (root: string, path: string): boolean => {
	const relativePath = relative(root, path);
	return (
		relativePath === "" ||
		(!isAbsolute(relativePath) && relativePath !== ".." && !relativePath.startsWith(`..${sep}`))
	);
};

export const createLocalTokenSourceLoader = (
	resolverPath: string,
	projectRoot = process.cwd(),
): TokenSourceLoader => {
	const canonicalRoot = realpathSync(resolve(projectRoot));
	const baseUrl = pathToFileURL(resolve(resolverPath));
	return {
		load: async (reference) => {
			let sourceUrl: URL;
			try {
				sourceUrl = new URL(reference, baseUrl);
			} catch {
				throw new Error("DTCG Resolver source must be a valid local file reference");
			}
			if (sourceUrl.protocol !== "file:")
				throw new Error("DTCG Resolver sources must use local file references");
			const sourcePath = realpathSync(fileURLToPath(sourceUrl));
			if (!isWithinRoot(canonicalRoot, sourcePath))
				throw new Error("DTCG Resolver source resolves outside the project root");
			return parseDtcgTokenDocument(readFileSync(sourcePath, "utf8"));
		},
		parseInline: async (source: TokenJsonValue) => parseDtcgTokenDocument(JSON.stringify(source)),
	};
};

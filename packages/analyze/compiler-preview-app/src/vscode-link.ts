const encodePathSegment = (segment: string, index: number): string =>
	index === 0 && /^[A-Za-z]:$/u.test(segment) ? segment : encodeURIComponent(segment);

export const vscodeFileUri = (root: string, file: string): string => {
	const normalizedRoot = root.replaceAll("\\", "/").replace(/\/+$/u, "");
	const normalizedFile = file.replaceAll("\\", "/");
	const absolutePath = `${normalizedRoot}/${normalizedFile}`;
	const encodedPath = absolutePath.split("/").map(encodePathSegment).join("/").replace(/^\/+/, "");
	return `vscode://file/${encodedPath}`;
};

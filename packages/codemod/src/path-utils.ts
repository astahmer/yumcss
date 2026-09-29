/**
 * Small POSIX path primitives for source transforms.
 *
 * Codemod paths are document identifiers, not host filesystem paths. Keeping
 * these operations platform-neutral lets the browser migration entry point
 * share the same adapter policy without importing Node's path module.
 */
export function joinDocumentPath(...parts: readonly string[]): string {
	let absolute = false;
	const segments: string[] = [];
	for (const [index, part] of parts.entries()) {
		const normalizedPart = part.replaceAll("\\", "/");
		if (normalizedPart.startsWith("/")) {
			absolute = true;
			if (index > 0) segments.length = 0;
		}
		for (const segment of normalizedPart.split("/")) {
			if (segment === "" || segment === ".") continue;
			if (segment === "..") {
				segments.pop();
				continue;
			}
			segments.push(segment);
		}
	}
	return `${absolute ? "/" : ""}${segments.join("/")}` || (absolute ? "/" : ".");
}

export function dirnameDocumentPath(file: string): string {
	const normalized = file.replaceAll("\\", "/");
	const slash = normalized.lastIndexOf("/");
	return slash < 0 ? "." : slash === 0 ? "/" : normalized.slice(0, slash);
}

export function isAbsoluteDocumentPath(file: string): boolean {
	return file.startsWith("/") || /^[A-Za-z]:\//.test(file.replaceAll("\\", "/"));
}

export function relativeDocumentPath(fromFile: string, toFile: string): string {
	const from = joinDocumentPath(fromFile)
		.split("/")
		.filter((segment) => segment !== "" && segment !== ".");
	const to = joinDocumentPath(toFile)
		.split("/")
		.filter((segment) => segment !== "" && segment !== ".");
	let common = 0;
	while (common < from.length && common < to.length && from[common] === to[common]) common++;
	const result = [...from.slice(common).map(() => ".."), ...to.slice(common)].join("/");
	return result === "" ? "." : result;
}

import { lstatSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, posix, relative, resolve, sep } from "node:path";

const errorCode = (error: unknown): unknown =>
	typeof error === "object" && error !== null && "code" in error ? error.code : undefined;

const isWithin = (root: string, target: string, allowRoot: boolean): boolean => {
	const pathFromRoot = relative(root, target);
	return (
		(allowRoot && pathFromRoot === "") ||
		(pathFromRoot !== "" &&
			pathFromRoot !== ".." &&
			!pathFromRoot.startsWith(`..${sep}`) &&
			!isAbsolute(pathFromRoot))
	);
};

export const normalizeProjectRelativePath = (path: string): string => {
	const slashed = path.replaceAll("\\", "/");
	if (
		slashed === "" ||
		slashed.includes("\u0000") ||
		slashed.startsWith("/") ||
		/^[A-Za-z]:/u.test(slashed)
	)
		throw new Error(`codemod: path must be project-relative: ${path}`);
	const normalized = posix.normalize(slashed).replace(/\/+$/u, "");
	if (
		normalized === "" ||
		normalized === "." ||
		normalized === ".." ||
		normalized.startsWith("../")
	)
		throw new Error(`codemod: path must be project-relative: ${path}`);
	return normalized;
};

export const createProjectPathBoundary = (root: string) => {
	const canonicalRoot = realpathSync(root);
	const rootIdentity = statSync(canonicalRoot);
	const assertRootIdentity = (): void => {
		let currentRoot: string;
		try {
			currentRoot = realpathSync(canonicalRoot);
		} catch {
			throw new Error("codemod: project root changed during migration");
		}
		const currentIdentity = statSync(currentRoot);
		if (
			currentRoot !== canonicalRoot ||
			currentIdentity.dev !== rootIdentity.dev ||
			currentIdentity.ino !== rootIdentity.ino
		)
			throw new Error("codemod: project root changed during migration");
	};
	const relativePath = (path: string): string => {
		assertRootIdentity();
		const absolutePath = isAbsolute(path) ? path : resolve(canonicalRoot, path);
		let actualPath: string;
		try {
			actualPath = realpathSync(absolutePath);
		} catch (error) {
			if (errorCode(error) === "ENOENT" || errorCode(error) === "ENOTDIR")
				throw new Error(`codemod: refusing unresolved project path ${path}`, { cause: error });
			throw error;
		}
		if (!isWithin(canonicalRoot, actualPath, false))
			throw new Error(`codemod: path escapes project root: ${path}`);
		assertRootIdentity();
		return normalizeProjectRelativePath(relative(canonicalRoot, actualPath));
	};
	const resolvePath = (path: string): string => {
		const normalized = normalizeProjectRelativePath(path);
		assertRootIdentity();
		const target = resolve(canonicalRoot, normalized);
		let current = target;
		const suffix: string[] = [];
		while (true) {
			let entry: ReturnType<typeof lstatSync>;
			try {
				entry = lstatSync(current);
			} catch (error) {
				if (errorCode(error) !== "ENOENT" && errorCode(error) !== "ENOTDIR") throw error;
				const parent = dirname(current);
				if (parent === current) throw error;
				suffix.unshift(basename(current));
				current = parent;
				continue;
			}
			let actualPath: string;
			try {
				actualPath = realpathSync(current);
			} catch (error) {
				if (entry.isSymbolicLink())
					throw new Error(`codemod: refusing unresolved project symlink ${current}`, {
						cause: error,
					});
				throw error;
			}
			if (!isWithin(canonicalRoot, actualPath, true))
				throw new Error(`codemod: path escapes project root: ${path}`);
			const resolvedTarget = resolve(actualPath, ...suffix);
			if (!isWithin(canonicalRoot, resolvedTarget, false))
				throw new Error(`codemod: path escapes project root: ${path}`);
			assertRootIdentity();
			return resolvedTarget;
		}
	};
	const resolveEntry = (path: string): string => {
		const normalized = normalizeProjectRelativePath(path);
		resolvePath(normalized);
		const lexicalTarget = resolve(canonicalRoot, normalized);
		const actualParent = realpathSync(dirname(lexicalTarget));
		if (!isWithin(canonicalRoot, actualParent, true))
			throw new Error(`codemod: path escapes project root: ${path}`);
		return resolve(actualParent, basename(lexicalTarget));
	};
	return { root: canonicalRoot, relative: relativePath, resolve: resolvePath, resolveEntry };
};

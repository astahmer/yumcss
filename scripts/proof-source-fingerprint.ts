import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export const proofSourceFingerprint = (repositoryRoot: string): string => {
	const hash = createHash("sha256");
	for (const directory of ["packages/codemod/src", "packages/yumcss/src"]) {
		const root = join(repositoryRoot, directory);
		for (const file of readdirSync(root, { recursive: true, encoding: "utf8" })
			.filter((file) => /\.(?:ts|tsx|css)$/u.test(file))
			.toSorted()) {
			hash.update(`${directory}/${file}\0`);
			hash.update(readFileSync(join(root, file)));
			hash.update("\0");
		}
	}
	return hash.digest("hex");
};

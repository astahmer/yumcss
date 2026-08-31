import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * File effects owned by the Panda project adapter.
 *
 * Source discovery remains the shared SourceWorkspace's responsibility. This
 * smaller port covers only host-config integration and generated-file writes,
 * so the migration pipeline can be tested without a Node filesystem.
 */
export interface PandaProjectFileSystem {
	read(path: string): string | undefined;
	exists(path: string): boolean;
	write(path: string, content: string): void;
	ensureDirectory(path: string): void;
}

class NodePandaProjectFileSystem implements PandaProjectFileSystem {
	read(path: string): string | undefined {
		try {
			return readFileSync(path, "utf8");
		} catch {
			return undefined;
		}
	}

	exists(path: string): boolean {
		return existsSync(path);
	}

	write(path: string, content: string): void {
		this.ensureDirectory(dirname(path));
		writeFileSync(path, content);
	}

	ensureDirectory(path: string): void {
		mkdirSync(path, { recursive: true });
	}
}

export const createPandaProjectFileSystem = (): PandaProjectFileSystem =>
	new NodePandaProjectFileSystem();

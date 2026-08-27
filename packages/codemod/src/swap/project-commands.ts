import panda from "./adapters/panda/command.ts";
import type { ProjectMigrationCommand } from "./project-command.ts";

const commands: readonly ProjectMigrationCommand[] = [panda];
const byId = new Map(commands.map((command) => [command.id, command]));

export function getProjectMigrationCommand(id: string): ProjectMigrationCommand | undefined {
	return byId.get(id);
}

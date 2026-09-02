import { Effect, FileSystem, Layer, Path } from "effect";
import { NodeFileSystem, NodePath } from "@effect/platform-node";

/** A task has a stable id so failures remain actionable after batching. */
export interface ToolingTask<A> {
	readonly id: string;
	readonly run: () => Promise<A>;
}

export interface ToolingTaskOptions {
	readonly concurrency?: number;
	readonly signal?: AbortSignal;
}

export interface ToolingTaskRunner {
	run<A>(tasks: readonly ToolingTask<A>[], options?: ToolingTaskOptions): Promise<readonly A[]>;
}

export class ToolingTaskError extends Error {
	readonly taskId: string;
	override readonly cause: unknown;

	constructor(taskId: string, cause: unknown) {
		super(`tooling task failed: ${taskId}`);
		this.name = "ToolingTaskError";
		this.taskId = taskId;
		this.cause = cause;
	}
}

const nodeToolingLayer = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer);

/**
 * Effect is deliberately kept behind this local tooling port. Callers get an
 * ordered Promise API and do not need to depend on Effect's service model.
 */
export function createEffectToolingTaskRunner(): ToolingTaskRunner {
	return {
		run: async <A>(tasks: readonly ToolingTask<A>[], options: ToolingTaskOptions = {}) => {
			const concurrency = options.concurrency ?? 2;
			if (!Number.isInteger(concurrency) || concurrency < 1)
				throw new RangeError("tooling task concurrency must be a positive integer");
			const program = Effect.forEach(
				tasks,
				(task) =>
					Effect.tryPromise({
						try: task.run,
						catch: (cause) => new ToolingTaskError(task.id, cause),
					}),
				{ concurrency },
			);
			return Effect.runPromise(program, { signal: options.signal });
		},
	};
}

export interface ToolingFileSystem {
	readText(path: string): Promise<string>;
	writeText(path: string, content: string): Promise<void>;
	exists(path: string): Promise<boolean>;
	ensureDirectory(path: string): Promise<void>;
	resolve(...segments: readonly string[]): Promise<string>;
}

function runNode<A, E>(
	program: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>,
): Promise<A> {
	return Effect.runPromise(Effect.provide(program, nodeToolingLayer));
}

/** Node implementation of the tooling filesystem/path ports using Effect 4. */
export function createEffectToolingFileSystem(): ToolingFileSystem {
	return {
		readText: (path) =>
			runNode(
				Effect.gen(function* () {
					const fileSystem = yield* FileSystem.FileSystem;
					return yield* fileSystem.readFileString(path);
				}),
			),
		writeText: (path, content) =>
			runNode(
				Effect.gen(function* () {
					const fileSystem = yield* FileSystem.FileSystem;
					yield* fileSystem.writeFileString(path, content);
				}),
			),
		exists: (path) =>
			runNode(
				Effect.gen(function* () {
					const fileSystem = yield* FileSystem.FileSystem;
					return yield* fileSystem.exists(path);
				}),
			),
		ensureDirectory: (path) =>
			runNode(
				Effect.gen(function* () {
					const fileSystem = yield* FileSystem.FileSystem;
					yield* fileSystem.makeDirectory(path, { recursive: true });
				}),
			),
		resolve: (...segments) =>
			runNode(
				Effect.gen(function* () {
					const path = yield* Path.Path;
					return path.resolve(...segments);
				}),
			),
	};
}

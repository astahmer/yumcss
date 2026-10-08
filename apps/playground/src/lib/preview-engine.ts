import type { ClassNameStrategy } from "yumcss/css";
import type { PlaygroundNode, PlaygroundResult } from "./eval-playground.ts";

export const PreviewEngineId = {
	Atomic: "atomic",
	NamedAtoms: "named-atoms",
	Tailwind: "tailwind",
	UnoCSS: "unocss",
	Panda: "panda",
	StyleX: "stylex",
} as const;
export type PreviewEngineId = (typeof PreviewEngineId)[keyof typeof PreviewEngineId];
declare const customEngineId: unique symbol;
type CustomEngineId = string & { readonly [customEngineId]: true };
export type PreviewEngineIdentifier = PreviewEngineId | CustomEngineId;

export const PREVIEW_ENGINE_SCHEMA = "yumcss.playground-engine/1" as const;
export type PreviewSuccess = Extract<PlaygroundResult, { ok: true }>;

export interface PreviewEngineSession {
	readonly strategy: ClassNameStrategy | null;
	/** Actual owning engine's stylesheet, with its theme/layers intact. */
	compile(result: PreviewSuccess): Promise<{ css: string; engine: string; version: string }>;
}

export interface PreviewEngine {
	readonly schema: typeof PREVIEW_ENGINE_SCHEMA;
	readonly id: PreviewEngineIdentifier;
	createSession(signal: AbortSignal): Promise<PreviewEngineSession>;
}

/** Explicit extension point; orchestration has no ecosystem branches. */
export class PreviewEngineRegistry {
	static customId(value: string): CustomEngineId {
		if (value.trim() === "") throw new Error("A preview engine id must be nonempty");
		return value as CustomEngineId;
	}
	private readonly engines = new Map<string, PreviewEngine>();
	constructor(engines: readonly PreviewEngine[]) {
		for (const engine of engines) this.register(engine);
	}
	register(engine: PreviewEngine): void {
		if (this.engines.has(engine.id)) throw new Error(`Duplicate preview engine '${engine.id}'`);
		this.engines.set(engine.id, engine);
	}
	resolve(id: string): PreviewEngine {
		const engine = this.engines.get(id);
		if (engine === undefined) throw new Error(`Unknown preview engine '${id}'`);
		return engine;
	}
}

export function collectPreviewClasses(result: PreviewSuccess): string[] {
	const classes = new Set(result.output.split(/\s+/u).filter(Boolean));
	const collect = (node: PlaygroundNode | undefined): void => {
		if (Array.isArray(node)) {
			for (const child of node) collect(child);
			return;
		}
		if (node === null || typeof node !== "object" || !("props" in node)) return;
		if (typeof node.props.className === "string") {
			for (const token of node.props.className.split(/\s+/u).filter(Boolean)) classes.add(token);
		}
		for (const child of node.children) collect(child);
	};
	collect(result.rendered);
	return [...classes];
}

/** One owner for replacement, cancellation and stale completions. */
export class PreviewExecution {
	private operation = 0;
	private controller: AbortController | undefined;
	cancel(): void {
		this.operation++;
		this.controller?.abort();
	}
	async run(
		work: (signal: AbortSignal) => Promise<PlaygroundResult>,
		publish: (result: PlaygroundResult) => void,
	): Promise<void> {
		this.cancel();
		const operation = this.operation;
		const controller = new AbortController();
		this.controller = controller;
		try {
			const result = await work(controller.signal);
			if (operation === this.operation && !controller.signal.aborted) publish(result);
		} catch (error) {
			if (operation === this.operation && !controller.signal.aborted) {
				publish({ ok: false, error: error instanceof Error ? error.message : String(error) });
			}
		}
	}
}

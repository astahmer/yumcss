import { createCx, type CxInput } from "../cx/index.ts";
import { ATOM_REGISTRY } from "../css/atoms.ts";
import type { CssFn } from "../css/create-css.ts";
import type { PandwindEngineContext } from "./engine-context.ts";
import type { TwConfig } from "./inline.ts";

export type CxEvaluationConfig = Pick<TwConfig, "conflicts" | "compose">;

export interface CxEvaluationPort {
	merge(inputs: CxInput[]): string | undefined;
}

export interface CxEvaluationOptions {
	readonly engine?: PandwindEngineContext;
}

class RuntimeCxEvaluator implements CxEvaluationPort {
	private readonly evaluate: (...inputs: CxInput[]) => string;

	constructor(config: CxEvaluationConfig, options: CxEvaluationOptions = {}) {
		this.evaluate = createCx({
			conflicts: config.conflicts,
			compose: config.compose,
			...(options.engine === undefined
				? {}
				: { css: { [ATOM_REGISTRY]: options.engine.registry } as unknown as CssFn<never> }),
		});
	}

	merge(inputs: CxInput[]): string | undefined {
		try {
			return this.evaluate(...inputs);
		} catch {
			return undefined;
		}
	}
}

export const createCxEvaluationPort = (
	config: CxEvaluationConfig,
	options: CxEvaluationOptions = {},
): CxEvaluationPort => new RuntimeCxEvaluator(config, options);

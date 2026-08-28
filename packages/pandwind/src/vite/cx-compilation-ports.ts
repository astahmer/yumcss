/** Discovers constants that can safely participate in compile-time folding. */
export interface ConstantDiscovery<TProgram = unknown, TScope = unknown> {
	discover(program: TProgram): TScope;
}

/** Evaluates one expression according to the compiler's static-value policy. */
export interface StaticExpressionEvaluator {
	evaluate(node: unknown, fold?: unknown, constants?: unknown): unknown;
}

/** Merges evaluated class inputs through the target runtime's conflict policy. */
export interface ClassMergePort {
	merge(inputs: unknown[]): string | undefined;
}

export interface CxCompilationPorts {
	readonly constants: ConstantDiscovery;
	readonly evaluator: StaticExpressionEvaluator;
	readonly merger: ClassMergePort;
}

export type ResponsiveValue<T> = T | ResponsiveObject<T>;

export type ResponsiveObject<T> = {
	readonly [condition: string]: ResponsiveValue<T>;
};

export const isResponsiveObject = <T>(value: unknown): value is ResponsiveObject<T> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

export const isResponsiveValue = (value: unknown, leaf: (value: unknown) => boolean): boolean => {
	if (!isResponsiveObject(value)) return leaf(value);
	const entries = Object.entries(value);
	return (
		entries.length > 0 &&
		entries.every(([condition, nested]) => {
			return condition.length > 0 && isResponsiveValue(nested, leaf);
		})
	);
};

export const forEachResponsiveLeaf = <T>(
	value: ResponsiveValue<T>,
	visit: (value: T, conditions: readonly string[]) => void,
	conditions: readonly string[] = [],
): void => {
	if (!isResponsiveObject<T>(value)) {
		visit(value, conditions);
		return;
	}
	for (const [condition, nested] of Object.entries(value)) {
		forEachResponsiveLeaf(
			nested,
			visit,
			condition === "base" ? conditions : [...conditions, condition],
		);
	}
};

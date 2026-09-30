import { ATOM_REGISTRY, type AtomRegistry } from "../src/css/atoms.ts";
import type { CssFn } from "../src/css/create-css.ts";

const isAtomRegistry = (value: unknown): value is AtomRegistry => {
	if (!(value instanceof Map)) return false;
	return [...value].every(
		([atom, property]) => typeof atom === "string" && typeof property === "string",
	);
};

export const atomRegistryOf = (value: CssFn<never, never>): AtomRegistry => {
	const registry: unknown = Object.getOwnPropertyDescriptor(value, ATOM_REGISTRY)?.value;
	if (!isAtomRegistry(registry)) throw new Error("CSS function atom registry is malformed");
	return registry;
};

import { ATOM_REGISTRY, type AtomRegistry } from "../src/css/atoms.ts";

const isAtomRegistry = (value: unknown): value is AtomRegistry => {
	if (!(value instanceof Map)) return false;
	return [...value].every(
		([atom, property]) => typeof atom === "string" && typeof property === "string",
	);
};

export const atomRegistryOf = (value: object): AtomRegistry => {
	if (!(ATOM_REGISTRY in value)) throw new Error("CSS function has no atom registry");
	const registry: unknown = value[ATOM_REGISTRY];
	if (!isAtomRegistry(registry)) throw new Error("CSS function atom registry is malformed");
	return registry;
};

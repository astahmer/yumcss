/**
 * Shared atom registry for the css() engine.
 *
 * Every compiled declaration maps its hashed class name (the atom) back to
 * the flattened style key (`color`, `_hover__color`, `sm___hover__color`).
 * `createCx` uses this to resolve opaque css atoms to the CSS properties
 * they set, so tw classes and css atoms can merge against each other.
 * The map only stores unique atoms, and only fills when css() compiles —
 * zero cost when cx is never used.
 */
export const ATOM_REGISTRY: unique symbol = Symbol("yumcss.atoms");

export type AtomRegistry = Map<string, string>;

/**
 * Object-emitting backend skeleton (plans/021 step 2).
 *
 * Shared structure for every plain-style-object target (React Native,
 * OpenTUI, canvas). Pins the contract that is NOT target-specific:
 *
 * - resolution: flatten -> condition filter -> convert -> assemble;
 * - condition policy: resolvable conditions gate participation, unknown
 *   conditions throw (strict policy — no silently dead styles);
 * - registry: identical resolved styles return the SAME object reference;
 * - merge: later-wins across already-resolved target objects, registered.
 */
import { describe, expect, test } from "vitest";
import { createObjectBackend } from "../src/backends/object.ts";
import { createObjectCx } from "../src/backends/object-surface.ts";
import { createOpentuiBackend } from "../src/backends/opentui.ts";

describe("object backend", () => {
	test("resolve lowers flat declarations through convert (default pass-through)", () => {
		const backend = createObjectBackend({ name: "test" });
		expect(backend.resolve({ color: "red" })).toEqual({ color: "red" });
	});

	test("condition-nested declarations participate iff all resolvers are true", () => {
		let dark = false;
		const backend = createObjectBackend({ name: "test", conditions: { dark: () => dark } });
		const style = { color: "light", _dark: { color: "dim" } };
		dark = false;
		expect(backend.resolve(style)).toEqual({ color: "light" });
		dark = true;
		expect(backend.resolve(style)).toEqual({ color: "dim" });
	});

	test("nested conditions require every resolver to be true", () => {
		let dark = true;
		let hover = false;
		const backend = createObjectBackend({
			name: "test",
			conditions: { dark: () => dark, hover: () => hover },
		});
		const style = { color: "base", _hover: { _dark: { color: "lit" } } };
		expect(backend.resolve(style)).toEqual({ color: "base" });
		hover = true;
		expect(backend.resolve(style)).toEqual({ color: "lit" });
	});

	test("unknown conditions throw (strict policy)", () => {
		const backend = createObjectBackend({ name: "test" });
		expect(() => backend.resolve({ _hover: { color: "red" } })).toThrow(
			/condition "_hover" is not supported by this target/,
		);
	});

	test("condition lookup ignores inherited and non-function resolvers", () => {
		const inherited = Object.create({ hover: () => true }) as Record<string, () => boolean>;
		inherited.focus = "not-a-resolver" as never;
		const backend = createObjectBackend({ name: "test", conditions: inherited });

		expect(() => backend.resolve({ _hover: { color: "red" } })).toThrow(
			/condition "_hover" is not supported by this target/,
		);
		expect(() => backend.resolve({ _focus: { color: "red" } })).toThrow(
			/condition "_focus" is not supported by this target/,
		);
	});

	test("convert may expand one IR declaration into several target props", () => {
		const backend = createObjectBackend({
			name: "test",
			convert: (prop, value) =>
				prop === "gap" ? { rowGap: value, columnGap: value } : { [prop]: value },
		});
		expect(backend.resolve({ gap: "4px" })).toEqual({ rowGap: "4px", columnGap: "4px" });
	});

	test("identical resolved styles share one registered reference", () => {
		const backend = createObjectBackend({ name: "test" });
		const first = backend.resolve({ color: "red", margin: 4 } as never);
		const again = backend.resolve({ color: "red", margin: 4 } as never);
		expect(again).toBe(first);
		expect(backend.resolve({ color: "blue" })).not.toBe(first);
	});

	test("registered results distinguish value types and cannot be mutated", () => {
		const backend = createObjectBackend({
			name: "typed-values",
			convert: (property) => ({ value: property === "numeric" ? 1 : "1" }),
		});
		const numeric = backend.resolve({ numeric: "value" });
		const text = backend.resolve({ text: "value" });

		expect(numeric.value).toBe(1);
		expect(text.value).toBe("1");
		expect(text).not.toBe(numeric);
		expect(Reflect.set(numeric, "value", 999)).toBe(false);
		expect(backend.resolve({ numeric: "value" })).toBe(numeric);
		expect(numeric.value).toBe(1);
	});

	test("object targets ignore unsupported primitive declarations", () => {
		const backend = createObjectBackend({ name: "test" });

		expect(
			backend.resolve({ display: false, visibility: true, content: Symbol("bad") } as never),
		).toEqual({});
	});

	test("merge is later-wins over already-resolved styles, and registered", () => {
		const backend = createObjectBackend({ name: "test" });
		const base = backend.resolve({ color: "red", padding: 4 } as never);
		const patch = backend.resolve({ color: "blue" });
		const merged = backend.merge(base, patch);
		// The skeleton stringifies IR values on the way through declare/resolve.
		expect(merged).toEqual({ color: "blue", padding: "4" });
		expect(backend.merge(base, patch)).toBe(merged);
	});

	test("object cx flattens deeply nested and cyclic input arrays", () => {
		const backend = createObjectBackend({ name: "test" });
		const cx = createObjectCx(backend);
		const base = backend.resolve({ color: "red" });
		const patch = backend.resolve({ padding: 4 });
		const nested: unknown[] = [base, [undefined, [patch]]];
		nested.push(nested);

		expect(cx(nested as never)).toEqual({ color: "red", padding: "4" });
	});

	test("object backends do not throw when target values cannot be serialized", () => {
		const cyclic: Record<string, unknown> = {};
		cyclic.self = cyclic;
		const backend = createObjectBackend({
			name: "test",
			convert: () => ({ value: cyclic }),
		});

		expect(() => backend.resolve({ color: "red" })).not.toThrow();
		expect(backend.resolve({ color: "red" })).toEqual({ value: cyclic });
	});

	test("OpenTUI rejects invalid cell sizes before lowering values", () => {
		expect(() => createOpentuiBackend({ cellSize: 0 })).toThrow(/positive finite/);
		expect(() => createOpentuiBackend({ cellSize: Number.NaN })).toThrow(/positive finite/);
	});
});

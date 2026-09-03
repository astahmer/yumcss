import interopJson from "../pandwind.interop.json" with { type: "json" };
import { examplePreset } from "pandwind/preset";
import type { PandwindMeta } from "pandwind-codemod/migration/meta";
import type { PandwindInteropArtifact } from "pandwind/tw/interop";

const interop = interopJson as PandwindInteropArtifact;

/** Browser-safe migration metadata generated from the playground's own artifacts. */
export const PLAYGROUND_MIGRATION_META: PandwindMeta = (() => {
	const keys = interop.utilities.map(({ key, base, valueType }) => ({ key, base, valueType }));
	const keysByBase = new Map<string, typeof keys>();
	for (const key of keys) {
		const entries = keysByBase.get(key.base) ?? [];
		entries.push(key);
		keysByBase.set(key.base, entries);
	}
	const bridgeInverse = new Map<string, { property: string; value: string }>();
	for (const [property, values] of Object.entries(interop.bridge)) {
		for (const [value, utility] of Object.entries(values)) {
			if (!bridgeInverse.has(utility)) bridgeInverse.set(utility, { property, value });
		}
	}

	return {
		keys,
		keysByBase,
		valueLiterals: new Map(
			interop.utilities.map((utility) => [
				utility.valueType ?? utility.key,
				new Set(utility.values),
			]),
		),
		variants: new Map(
			Object.entries(interop.tw.variants).map(([name, value]) => [
				name,
				{ join: value.join ?? ":" },
			]),
		),
		conflicts: new Map(Object.entries(interop.tw.conflicts ?? {})),
		bridgeInverse,
		tokens: examplePreset.tokens,
		interop,
	};
})();

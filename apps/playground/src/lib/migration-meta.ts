import interopJson from "../yumcss.interop.json" with { type: "json" };
import { examplePreset } from "@yumcss/example-preset";
import type { YumCSSMeta } from "@yumcss/codemod/migration/meta";
import type { YumCSSInteropArtifact } from "@yumcss/codemod/tw";

const interop = interopJson as YumCSSInteropArtifact;

/** Browser-safe migration metadata generated from the playground's own artifacts. */
export const PLAYGROUND_MIGRATION_META: YumCSSMeta = (() => {
	const keys = interop.utilities.map(({ key, base, valueType }) => ({ key, base, valueType }));
	const keysByBase = new Map<string, typeof keys>();
	for (const key of keys) {
		const entries = keysByBase.get(key.base) ?? [];
		entries.push(key);
		keysByBase.set(key.base, entries);
	}
	const valueLiterals = new Map(
		Object.entries(interop.valueTypes).map(([valueType, values]) => [valueType, new Set(values)]),
	);
	for (const utility of keys) {
		const valueType = utility.valueType ?? utility.key;
		if (!valueLiterals.has(valueType)) valueLiterals.set(valueType, new Set());
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
		valueLiterals,
		variants: new Map(
			Object.entries(interop.tw.variants).map(([name, value]) => [
				name,
				{ join: value.join ?? ":" },
			]),
		),
		conflicts: new Map(Object.entries(interop.tw.conflicts ?? {})),
		bridgeInverse,
		tokens: examplePreset.tokens,
		conditions: examplePreset.conditions,
		interop,
	};
})();

import { __unstable__loadDesignSystem } from "@tailwindcss/node";

export type TailwindDesignSystem = Awaited<ReturnType<typeof __unstable__loadDesignSystem>>;

type DesignSystemLoader = (
	css: string,
	options: { readonly base: string },
) => Promise<TailwindDesignSystem>;

interface DesignSystemCacheOptions {
	readonly maxEntries?: number;
}

/** Share concurrent and repeated official Tailwind loads within one process. */
export function createTailwindDesignSystemLoader(
	loader: DesignSystemLoader = __unstable__loadDesignSystem,
	options: DesignSystemCacheOptions = {},
): DesignSystemLoader {
	const maxEntries = Math.max(1, options.maxEntries ?? 8);
	const cache = new Map<string, Promise<TailwindDesignSystem>>();

	return (css, { base }) => {
		const key = `${base}\0${css}`;
		const cached = cache.get(key);
		if (cached !== undefined) return cached;

		while (cache.size >= maxEntries) {
			const oldest = cache.keys().next().value;
			if (oldest === undefined) break;
			cache.delete(oldest);
		}

		const pending = loader(css, { base });
		cache.set(key, pending);
		return pending.catch((error: unknown) => {
			if (cache.get(key) === pending) cache.delete(key);
			throw error;
		});
	};
}

export const loadTailwindDesignSystem = createTailwindDesignSystemLoader();

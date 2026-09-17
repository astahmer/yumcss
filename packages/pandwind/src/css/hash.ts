import murmurHash from "../lib/murmur-hash2.ts";
import { concatPair, dashCase } from "../lib/utils.ts";

export { dashCase };

export const createHashFn = (debug: boolean) => {
	const hashFn = debug
		? (key: string, value: string) => {
				const readable = concatPair(key, value);
				return /\s/.test(readable) || readable.includes("\u0000")
					? murmurHash(`${key}\u0000${value}`)
					: readable;
			}
		: (key: string, value: string) => murmurHash(concatPair(key, value));

	return hashFn;
};

const escRegex = /[^a-zA-Z0-9_\u0081-\uffff-]/g;
function esc(string: string) {
	return `${string}`.replace(escRegex, (s) => `\\${s}`);
}

/**
 * Escape a name for use as a CSS identifier (class name or custom property).
 * A leading digit must be hex-escaped: `.\\32 mprtg` === class "2mprtg".
 */
export const escapeIdentifier = (name: string): string => {
	const escaped = name.replace(escRegex, (s) => `\\${s}`);
	if (/^[0-9]/.test(escaped)) {
		return `\\3${escaped[0]} ${escaped.slice(1)}`;
	}
	return escaped;
};

export const hashCssVar = (key: string, debug?: boolean) =>
	escapeIdentifier(debug ? esc(dashCase(key)) : murmurHash(key));

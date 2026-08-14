import murmurHash from "../lib/murmur-hash2.js";
import { concatPair } from "../lib/utils.js";

export const createHashFn = (debug: boolean) => {
	const hashFn = debug
		? (key: string, value: string) => concatPair(key, value)
		: (key: string, value: string) => murmurHash(concatPair(key, value));

	return hashFn;
};

const escRegex = /[^a-zA-Z0-9_\u0081-\uffff-]/g;
function esc(string: string) {
	return `${string}`.replace(escRegex, (s) => `\\${s}`);
}

const dashCaseRegex = /[A-Z]/g;
export function dashCase(string: string) {
	return string.replace(dashCaseRegex, (match) => `-${match.toLowerCase()}`);
}

export const hashCssVar = (key: string, debug?: boolean) =>
	debug ? esc(dashCase(key)) : murmurHash(key);

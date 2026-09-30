import { expect } from "vitest";

/**
 * Vitest resolves update mode on the server and propagates it through private
 * snapshot state; worker argv does not retain the original CLI flags.
 */
export const updatingSnapshots = (): boolean => {
	const snapshotState: unknown = Reflect.get(expect.getState(), "snapshotState");
	if (typeof snapshotState !== "object" || snapshotState === null) return false;
	return Reflect.get(snapshotState, "_updateSnapshot") === "all";
};

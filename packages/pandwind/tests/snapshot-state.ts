import { expect } from "vitest";

/**
 * Vitest resolves update mode on the server and propagates it through private
 * snapshot state; worker argv does not retain the original CLI flags.
 */
export const updatingSnapshots = (): boolean => {
	const state = expect.getState();
	if (!("snapshotState" in state)) return false;
	const snapshotState = state.snapshotState;
	if (typeof snapshotState !== "object" || snapshotState === null) return false;
	return Object.getOwnPropertyDescriptor(snapshotState, "_updateSnapshot")?.value === "all";
};

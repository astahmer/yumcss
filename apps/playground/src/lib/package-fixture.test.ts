import { describe, expect, test } from "vitest";
import {
	PLAYGROUND_EXECUTION_LANE,
	PLAYGROUND_EXECUTION_SCOPE,
	PLAYGROUND_EVIDENCE_CHECK,
} from "./eval-playground.ts";
import { runPackageFixtureProof } from "./package-fixture.ts";

describe("playground package fixture lane", () => {
	test("proves a real package through typecheck, Vite, Chromium, and hydration", () => {
		const proof = runPackageFixtureProof();
		expect(proof).toMatchObject({
			lane: PLAYGROUND_EXECUTION_LANE.PackageFixture,
			scope: PLAYGROUND_EXECUTION_SCOPE.ProjectPackage,
			verified: expect.arrayContaining([
				PLAYGROUND_EVIDENCE_CHECK.ProjectTypecheck,
				PLAYGROUND_EVIDENCE_CHECK.ProjectBuild,
				PLAYGROUND_EVIDENCE_CHECK.SsrBuild,
				PLAYGROUND_EVIDENCE_CHECK.BrowserHost,
				PLAYGROUND_EVIDENCE_CHECK.Hydration,
			]),
			unavailable: [],
		});
	}, 120_000);
});

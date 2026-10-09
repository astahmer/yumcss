import { describe, expect, it } from "vitest";
import { SOURCE_SCANNER_SERVICE, SourceRuntimeBoundary } from "../src/source-scanner.ts";

describe("source scanner runtime boundaries", () => {
	it("classifies only exact directives in the module prologue", () => {
		const cases = [
			{
				source: "'use client';\nexport const value = 1;",
				boundary: SourceRuntimeBoundary.Client,
			},
			{
				source: '// "use client"\nexport const value = 1;',
				boundary: SourceRuntimeBoundary.Shared,
			},
			{
				source: 'const note = "use client";\nexport { note };',
				boundary: SourceRuntimeBoundary.Shared,
			},
			{
				source: 'const ready = true;\n"use client";\nexport { ready };',
				boundary: SourceRuntimeBoundary.Shared,
			},
			{
				source: "\"use strict\";\n'use server';\nexport const value = 1;",
				boundary: SourceRuntimeBoundary.Server,
			},
		];

		for (const [index, candidate] of cases.entries())
			expect(
				SOURCE_SCANNER_SERVICE.scan({
					file: `runtime-boundary-${index}.ts`,
					source: candidate.source,
				}).runtimeBoundary,
			).toBe(candidate.boundary);
	});
});

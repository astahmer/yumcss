import { describe, expect, it } from "vitest";
import {
	createSourceScannerRegistry,
	SOURCE_SCANNER_PLUGIN_SCHEMA,
	SOURCE_SCANNER_SCHEMA,
	SOURCE_SCANNER_SERVICE,
	SourceRuntimeBoundary,
} from "../src/source-scanner.ts";

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

	it("does not leave adapters registered when a plugin contains a duplicate id", () => {
		const adapter = (id: string) => ({
			schema: SOURCE_SCANNER_SCHEMA,
			id,
			languages: ["typescript"] as const,
			detect: () => false,
			scan: SOURCE_SCANNER_SERVICE.scan,
		});
		const registry = createSourceScannerRegistry([adapter("occupied")]);

		expect(() =>
			registry.registerPlugin({
				schema: SOURCE_SCANNER_PLUGIN_SCHEMA,
				id: "partially-registered",
				adapters: [adapter("added-first"), adapter("occupied")],
			}),
		).toThrow("source scanner already registered: occupied");
		expect(registry.adapters.map(({ id }) => id)).toEqual(["occupied"]);
		expect(registry.plugins).toEqual([]);
	});
});

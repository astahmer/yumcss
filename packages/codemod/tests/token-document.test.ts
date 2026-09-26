import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { DefaultTokenFormatRegistry } from "../src/swap/token-format-registry.ts";
import {
	createTokenDocument,
	parseDtcgResolverDocument,
	parseDtcgTokenDocument,
	resolveInlineTokenContext,
	resolveTokenContext,
	serializeDtcgTokenDocument,
	serializeTokenResolverDocument,
	TokenDocumentValidationError,
} from "../src/swap/token-document.ts";
import { TokenDocumentCodec, tokenDocumentCodec } from "../src/swap/token-document-codec.ts";
import {
	TOKEN_FORMAT_SCHEMA,
	TokenFormatId,
	type TokenFormatAdapter,
} from "../src/swap/token-format-contracts.ts";

const dtcgText = JSON.stringify({
	$type: "color",
	$description: "Brand palette",
	$extensions: { "com.example": { source: "brand" } },
	$root: {
		$value: { colorSpace: "srgb", components: [0.1, 0.2, 0.3], alpha: 1 },
		$description: "Default brand color",
	},
	brand: {
		blue: { $value: "{palette.blue}", $deprecated: "Use palette.blue" },
	},
	palette: {
		blue: { $value: { colorSpace: "srgb", components: [0, 0, 1] } },
	},
});

describe("typed token documents", () => {
	test("round-trips the pinned DTCG 2025.10 token and Resolver fixtures", () => {
		const tokensText = readFileSync(
			new URL("./fixtures/dtcg-2025-10/typed.tokens.json", import.meta.url),
			"utf8",
		);
		const resolverText = readFileSync(
			new URL("./fixtures/dtcg-2025-10/resolver.json", import.meta.url),
			"utf8",
		);
		const document = parseDtcgTokenDocument(tokensText);
		const tokenOutput = tokenDocumentCodec.to(TokenFormatId.Dtcg, document);
		const roundTrip = parseDtcgTokenDocument(tokenOutput.text);
		const resolver = parseDtcgResolverDocument(resolverText);
		const resolverRoundTrip = parseDtcgResolverDocument(serializeTokenResolverDocument(resolver));

		expect(tokenOutput.fidelity).toMatchObject({ status: "lossless", losses: [] });
		expect(roundTrip.root).toEqual(document.root);
		expect(resolverRoundTrip).toEqual(resolver);
	});

	test("round-trips DTCG hierarchy, metadata, values, references, and extensions", () => {
		const document = parseDtcgTokenDocument(dtcgText);
		const serialized = serializeDtcgTokenDocument(document);

		expect(JSON.parse(serialized)).toEqual(JSON.parse(dtcgText));
		expect(document.root.root?.value).toMatchObject({ kind: "object" });
		expect(document.root.children.brand).toMatchObject({
			kind: "group",
			children: {
				blue: {
					kind: "token",
					deprecated: "Use palette.blue",
					effectiveType: "color",
					value: { kind: "reference", target: "palette.blue", authored: "{palette.blue}" },
				},
			},
		});
	});

	test("round-trips standard JSON Pointer references and infers alias types", () => {
		const source = JSON.stringify({
			base: { $type: "color", $value: { colorSpace: "srgb", components: [0.1, 0.2, 0.3] } },
			alias: { $ref: "#/base/$value" },
			componentAlias: { $ref: "#/base/$value/components/0" },
			derived: {
				$type: "color",
				$value: {
					colorSpace: "srgb",
					components: [{ $ref: "#/base/$value/components/0" }, 0.2, 0.3],
				},
			},
			size: { $type: "dimension", $value: { value: 16, unit: "px" } },
			sizeParts: {
				$type: "dimension",
				$value: {
					value: { $ref: "#/size/$value/value" },
					unit: { $ref: "#/size/$value/unit" },
				},
			},
			typeStyle: {
				$type: "typography",
				$value: {
					fontFamily: ["Inter", "sans-serif"],
					fontSize: { value: 16, unit: "px" },
					fontWeight: 400,
					letterSpacing: { value: 0, unit: "px" },
					lineHeight: 1.5,
				},
			},
			typeStyleAlias: {
				$type: "typography",
				$value: {
					fontFamily: { $ref: "#/typeStyle/$value/fontFamily" },
					fontSize: { value: 18, unit: "px" },
					fontWeight: 500,
					letterSpacing: { value: 0, unit: "px" },
					lineHeight: { $ref: "#/typeStyle/$value/lineHeight" },
				},
			},
		});
		const document = parseDtcgTokenDocument(source);

		expect(document.root.children.alias).toMatchObject({
			kind: "token",
			effectiveType: "color",
			value: { kind: "reference", syntax: "json-pointer", target: "#/base/$value" },
		});
		expect(document.root.children.componentAlias).toMatchObject({
			kind: "token",
			effectiveType: "number",
			value: {
				kind: "reference",
				syntax: "json-pointer",
				target: "#/base/$value/components/0",
			},
		});
		expect(JSON.parse(serializeDtcgTokenDocument(document))).toEqual(JSON.parse(source));
	});

	test("rejects missing types, invalid names, unresolved references, and reference cycles", () => {
		const invalidCases = [
			{
				source: { colors: { brand: { $value: "red" } } },
				code: "missing-token-type",
				path: "/colors/brand/$type",
			},
			{
				source: { "bad.name": { $type: "string", $value: "bad" } },
				code: "invalid-token-name",
				path: "/bad.name",
			},
			{
				source: { alias: { $type: "color", $value: "{missing.token}" } },
				code: "unresolved-token-reference",
				path: "/alias/$value",
			},
			{
				source: { a: { $value: "{b}" }, b: { $value: "{a}" } },
				code: "circular-token-reference",
				path: "/a/$value",
			},
		];

		for (const { source, code, path } of invalidCases) {
			let caught: unknown;
			try {
				parseDtcgTokenDocument(JSON.stringify(source));
			} catch (error) {
				caught = error;
			}
			expect(caught).toMatchObject({
				diagnostics: expect.arrayContaining([expect.objectContaining({ code, path })]),
			});
		}
	});

	test("validates group references and rejects extension cycles", () => {
		const valid = parseDtcgTokenDocument(
			JSON.stringify({
				base: { $type: "string", label: { $value: "base" } },
				derived: { $extends: "{base}", another: { $value: "derived" } },
			}),
		);
		expect(valid.root.children.derived).toMatchObject({
			kind: "group",
			extends: "{base}",
		});

		let caught: unknown;
		try {
			parseDtcgTokenDocument(
				JSON.stringify({
					first: { $extends: "{second}" },
					second: { $extends: "{first}" },
				}),
			);
		} catch (error) {
			caught = error;
		}
		expect(caught).toMatchObject({
			diagnostics: expect.arrayContaining([
				expect.objectContaining({ code: "circular-group-reference" }),
			]),
		});
	});

	test("reports malformed token metadata at its source path", () => {
		expect(() =>
			parseDtcgTokenDocument(
				JSON.stringify({
					colors: { brand: { $value: "red", $extensions: [] } },
				}),
			),
		).toThrow(TokenDocumentValidationError);
		try {
			parseDtcgTokenDocument(
				JSON.stringify({
					colors: { brand: { $value: "red", $extensions: [] } },
				}),
			);
		} catch (error) {
			expect(error).toMatchObject({
				diagnostics: expect.arrayContaining([
					expect.objectContaining({
						code: "invalid-extensions",
						path: "/colors/brand/$extensions",
					}),
				]),
			});
		}
	});

	test("reports malformed composite values at the exact field path", () => {
		const source = {
			border: {
				$type: "border",
				focus: {
					$value: {
						color: { colorSpace: "srgb", components: [0, 0, 0] },
						width: { value: 1, unit: "em" },
						style: "solid",
					},
				},
			},
		};
		let caught: unknown;
		try {
			parseDtcgTokenDocument(JSON.stringify(source));
		} catch (error) {
			caught = error;
		}
		expect(caught).toBeInstanceOf(TokenDocumentValidationError);
		expect(caught).toMatchObject({
			diagnostics: [expect.objectContaining({ path: "/border/focus/$value/width/unit" })],
		});
	});

	test("rejects out-of-range color components and unsupported composite fields", () => {
		let caught: unknown;
		try {
			parseDtcgTokenDocument(
				JSON.stringify({
					colors: {
						$type: "color",
						invalid: {
							$value: {
								colorSpace: "srgb",
								components: [0, 0, 1.1],
								luminance: 0.4,
							},
						},
					},
				}),
			);
		} catch (error) {
			caught = error;
		}
		expect(caught).toBeInstanceOf(TokenDocumentValidationError);
		expect(caught).toMatchObject({
			diagnostics: expect.arrayContaining([
				expect.objectContaining({ path: "/colors/invalid/$value/components/2" }),
				expect.objectContaining({ path: "/colors/invalid/$value/luminance" }),
			]),
		});
	});

	test("validates and round-trips a DTCG Resolver sidecar", () => {
		const source = JSON.stringify({
			$schema: "https://design-tokens.github.io/community-group/format/resolver.schema.json",
			version: "2025.10",
			name: "Example",
			sets: { base: { sources: [{ $ref: "./base.tokens.json" }] } },
			modifiers: {
				mode: {
					contexts: {
						light: [{ $ref: "./light.tokens.json" }],
						dark: [{ $ref: "./dark.tokens.json" }],
					},
					default: "light",
				},
			},
			resolutionOrder: [{ $ref: "#/sets/base" }, { $ref: "#/modifiers/mode" }],
		});
		const resolver = parseDtcgResolverDocument(source);

		expect(JSON.parse(serializeTokenResolverDocument(resolver))).toEqual(JSON.parse(source));
		expect(resolver.modifiers.mode?.contexts.dark).toEqual([{ $ref: "./dark.tokens.json" }]);
	});

	test("resolves only the explicitly selected context in resolver order", async () => {
		const blue = { colorSpace: "srgb", components: [0, 0, 1], hex: "#0000ff" };
		const navy = { colorSpace: "srgb", components: [0, 0, 0.5], hex: "#000080" };
		const sky = { colorSpace: "srgb", components: [0.2, 0.7, 1], hex: "#33b3ff" };
		const baseTokens = parseDtcgTokenDocument(
			JSON.stringify({ colors: { brand: { $type: "color", $value: blue } } }),
		);
		const resolver = parseDtcgResolverDocument(
			JSON.stringify({
				version: "2025.10",
				sets: { base: { sources: [{ $ref: "./base.tokens.json" }] } },
				modifiers: {
					mode: {
						contexts: {
							light: [{ $ref: "./light.tokens.json" }],
							dark: [{ $ref: "./dark.tokens.json" }],
						},
					},
				},
				resolutionOrder: [{ $ref: "#/sets/base" }, { $ref: "#/modifiers/mode" }],
			}),
		);
		const document = createTokenDocument({
			format: TokenFormatId.Dtcg,
			root: baseTokens.root,
			resolver,
		});
		const files = {
			"./base.tokens.json": JSON.stringify({ colors: { brand: { $type: "color", $value: blue } } }),
			"./dark.tokens.json": JSON.stringify({ colors: { brand: { $type: "color", $value: navy } } }),
			"./light.tokens.json": JSON.stringify({ colors: { brand: { $type: "color", $value: sky } } }),
		};
		const resolved = await resolveTokenContext(
			document,
			{ contexts: { mode: "dark" } },
			{
				load: async (reference) => {
					const content = Object.entries(files).find(([path]) => path === reference)?.[1];
					if (content === undefined) throw new Error(`unknown fixture source '${reference}'`);
					return parseDtcgTokenDocument(content);
				},
			},
		);

		expect(resolved.root.children.colors).toMatchObject({
			children: {
				brand: {
					value: {
						kind: "object",
						entries: {
							colorSpace: { kind: "string", value: "srgb" },
							components: {
								kind: "array",
								items: [
									{ kind: "number", value: 0 },
									{ kind: "number", value: 0 },
									{ kind: "number", value: 0.5 },
								],
							},
							hex: { kind: "string", value: "#000080" },
						},
					},
				},
			},
		});
		await expect(
			resolveTokenContext(
				document,
				{ contexts: {} },
				{
					load: async () => baseTokens,
				},
			),
		).rejects.toThrow("resolver context required for modifier 'mode'");
	});

	test("keeps inline values contextual until one is explicitly selected", () => {
		const document = createTokenDocument({
			format: TokenFormatId.Preset,
			root: {
				kind: "group",
				children: {
					colors: {
						kind: "group",
						children: {
							brand: {
								kind: "token",
								value: {
									kind: "contextual",
									source: "preset",
									values: {
										base: { kind: "string", value: "base" },
										dark: { kind: "string", value: "dark" },
									},
								},
							},
						},
					},
				},
			},
		});

		expect(document.root.children.colors).toMatchObject({
			kind: "group",
			children: { brand: { value: { kind: "contextual" } } },
		});
		expect(
			resolveInlineTokenContext(document, { contexts: { preset: "dark" } }).root.children.colors,
		).toMatchObject({
			kind: "group",
			children: { brand: { value: { kind: "string", value: "dark" } } },
		});
		expect(() => resolveInlineTokenContext(document, { contexts: {} })).toThrow(
			"token context selection required for 'preset'",
		);
	});

	test("registry accepts a minimal replacement adapter without changing codec orchestration", () => {
		const adapter: TokenFormatAdapter = {
			schema: TOKEN_FORMAT_SCHEMA,
			id: TokenFormatId.Theme,
			canImport: true,
			canExport: true,
			fidelity: { import: "lossless", export: "lossless", preserves: ["scalar"], mayLose: [] },
			importText: (text) => createTokenDocument({ format: TokenFormatId.Theme, sourceText: text }),
			export: () => ({ text: "fake-format", fidelity: { status: "lossless", losses: [] } }),
		};
		const registry = new DefaultTokenFormatRegistry([adapter]);
		const codec = new TokenDocumentCodec(registry);
		const document = codec.fromText(TokenFormatId.Theme, "fixture");

		expect(registry.adapters).toEqual([adapter]);
		expect(codec.to(TokenFormatId.Theme, document).text).toBe("fake-format");
	});

	test("refuses flattened export by default and returns exact loss records with consent", () => {
		const document = tokenDocumentCodec.fromText(TokenFormatId.Dtcg, dtcgText);

		expect(() => tokenDocumentCodec.to(TokenFormatId.Theme, document)).toThrow(
			"pass --allow-lossy",
		);
		const output = tokenDocumentCodec.to(TokenFormatId.Theme, document, { allowLossy: true });
		expect(output.fidelity.status).toBe("lossy");
		expect(output.fidelity.losses).toContainEqual(
			expect.objectContaining({
				feature: "reference",
				path: "/brand/blue/$value",
			}),
		);
	});

	test("exports contextual values through a DTCG Resolver sidecar", async () => {
		const document = createTokenDocument({
			format: TokenFormatId.Preset,
			root: {
				kind: "group",
				children: {
					colors: {
						kind: "group",
						type: "string",
						children: {
							brand: {
								kind: "token",
								value: {
									kind: "contextual",
									source: "preset",
									values: {
										base: { kind: "string", value: "base" },
										dark: { kind: "string", value: "dark" },
									},
								},
							},
						},
					},
				},
			},
		});

		expect(() => tokenDocumentCodec.to(TokenFormatId.Dtcg, document)).toThrow("pass --allow-lossy");
		const output = tokenDocumentCodec.to(TokenFormatId.Dtcg, document, {
			allowLossy: true,
			resolverSidecar: true,
		});
		if (output.resolverText === undefined) throw new Error("expected Resolver sidecar output");
		const base = parseDtcgTokenDocument(output.text);
		const resolver = parseDtcgResolverDocument(output.resolverText);
		expect(base.root.children.colors).toMatchObject({
			kind: "group",
			children: { brand: { value: { kind: "string", value: "base" } } },
		});
		expect(resolver.modifiers.pandwindPresetContexts?.contexts.dark).toHaveLength(1);
		expect(output.fidelity).toMatchObject({ status: "lossless", losses: [] });

		const resolved = await resolveTokenContext(
			createTokenDocument({
				format: TokenFormatId.Dtcg,
				root: base.root,
				resolver,
			}),
			{ contexts: { pandwindPresetContexts: "dark" } },
			{
				load: async () => {
					throw new Error("inline resolver source expected");
				},
				parseInline: async (source) => parseDtcgTokenDocument(JSON.stringify(source)),
			},
		);
		expect(resolved.root.children.colors).toMatchObject({
			kind: "group",
			children: { brand: { value: { kind: "string", value: "dark" } } },
		});
	});

	test("prunes invalid DTCG values only with a path-specific lossy export", () => {
		const document = createTokenDocument({
			format: TokenFormatId.Preset,
			root: {
				kind: "group",
				children: { label: { kind: "token", value: { kind: "string", value: "untyped" } } },
			},
		});
		expect(() => tokenDocumentCodec.to(TokenFormatId.Dtcg, document)).toThrow("pass --allow-lossy");
		const output = tokenDocumentCodec.to(TokenFormatId.Dtcg, document, { allowLossy: true });
		expect(JSON.parse(output.text)).toEqual({});
		expect(output.fidelity.losses).toContainEqual(
			expect.objectContaining({
				path: "/label/$type",
				feature: "unsupported DTCG token",
			}),
		);
	});

	test("reports nested resolver values and preserves source losses through export", () => {
		const document = createTokenDocument({
			format: TokenFormatId.Preset,
			root: {
				kind: "group",
				children: {
					label: {
						kind: "token",
						type: "string",
						value: {
							kind: "object",
							entries: {
								content: {
									kind: "contextual",
									source: "mode",
									values: {
										base: { kind: "string", value: "base" },
										dark: { kind: "string", value: "dark" },
									},
								},
							},
						},
					},
				},
			},
			sourceLosses: [
				{
					path: "/source/value",
					feature: "source projection",
					reason: "source format was flattened",
				},
			],
		});
		const output = tokenDocumentCodec.to(TokenFormatId.Dtcg, document, { allowLossy: true });
		expect(output.fidelity.losses).toContainEqual(
			expect.objectContaining({
				path: "/label/$value/content",
				feature: "nested resolver context",
			}),
		);
		expect(output.fidelity.losses).toContainEqual(
			expect.objectContaining({ path: "/source/value", feature: "source projection" }),
		);
	});

	test("reports scalar name collisions and conditional CSS scopes", () => {
		const document = tokenDocumentCodec.fromText(
			TokenFormatId.Theme,
			"@theme { --color-brand: red; } @media (prefers-color-scheme: dark) { @theme { --color-brand: blue; } }",
		);
		expect(document.sourceLosses).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ feature: "token name collision", path: "/css/color-brand" }),
				expect.objectContaining({ feature: "conditional CSS scope", path: "/css/color-brand" }),
			]),
		);
		const output = tokenDocumentCodec.to(TokenFormatId.Theme, document, { allowLossy: true });
		expect(output.fidelity.losses).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ feature: "token name collision" }),
				expect.objectContaining({ feature: "conditional CSS scope" }),
			]),
		);
	});

	test("reports custom properties outside root CSS scope", () => {
		const document = tokenDocumentCodec.fromText(
			TokenFormatId.RootCss,
			":root { --color-brand: red; } .button { --color-brand: blue; }",
		);
		expect(document.sourceLosses).toContainEqual(
			expect.objectContaining({
				feature: "non-root custom property",
				path: "/css/color-brand",
			}),
		);
	});
});

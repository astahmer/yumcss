import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "vitest";
import { tokenDocumentCodec } from "../src/swap/token-document-codec.ts";
import { TokenFormatId } from "../src/swap/token-format-contracts.ts";
import { createTokenDocument, parseDtcgTokenDocument } from "../src/swap/token-document.ts";

test("preset exporter output can be read and exported to valid DTCG without losing dollars", async () => {
	const document = await tokenDocumentCodec.fromFile(
		TokenFormatId.Preset,
		new URL("./fixtures/docs-repairs/tokens.ts", import.meta.url).pathname,
	);
	const output = tokenDocumentCodec.to(TokenFormatId.Dtcg, document, { allowLossy: true });
	const parsed = parseDtcgTokenDocument(output.text);
	expect(output.text).not.toContain('"$brand-500"');
	expect(output.text).toContain('"brand-500"');
	expect(parsed.root.children.colors).toMatchObject({
		children: { "brand-500": { value: { kind: "string", value: "#123456" } } },
	});
});

test("generated preset export reimports through the same codec", async () => {
	const original = await tokenDocumentCodec.fromFile(
		TokenFormatId.Preset,
		new URL("./fixtures/docs-repairs/tokens.ts", import.meta.url).pathname,
	);
	const generated = tokenDocumentCodec.to(TokenFormatId.Preset, original, { allowLossy: true });
	const directory = await mkdtemp(
		new URL("./fixtures/docs-repairs/roundtrip-", import.meta.url).pathname,
	);
	try {
		const path = join(directory, "tokens.mjs");
		await writeFile(path, generated.text);
		const reimported = await tokenDocumentCodec.fromFile(TokenFormatId.Preset, path);
		expect(reimported.root.children).toEqual(original.root.children);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

test("DTCG name normalization preserves collisions and rewrites curly and pointer references", () => {
	const document = createTokenDocument({
		format: TokenFormatId.Preset,
		root: {
			kind: "group",
			type: "string",
			children: {
				$brand: { kind: "token", value: { kind: "string", value: "first" } },
				brand: { kind: "token", value: { kind: "string", value: "second" } },
				alias: {
					kind: "token",
					value: { kind: "reference", syntax: "curly", target: "$brand", authored: "{$brand}" },
				},
				pointer: {
					kind: "token",
					value: {
						kind: "reference",
						syntax: "json-pointer",
						target: "#/$brand/$value",
						authored: "#/$brand/$value",
					},
				},
			},
		},
	});
	expect(() => tokenDocumentCodec.to(TokenFormatId.Dtcg, document)).toThrow();
	const output = tokenDocumentCodec.to(TokenFormatId.Dtcg, document, { allowLossy: true });
	const roundtrip = parseDtcgTokenDocument(output.text);
	expect(Object.keys(roundtrip.root.children)).toEqual(["brand", "brand2", "alias", "pointer"]);
	expect(roundtrip.root.children.brand).toMatchObject({ value: { value: "first" } });
	expect(roundtrip.root.children.brand2).toMatchObject({ value: { value: "second" } });
	expect(roundtrip.root.children.alias).toMatchObject({
		value: { target: "brand", authored: "{brand}" },
	});
	expect(roundtrip.root.children.pointer).toMatchObject({ value: { target: "#/brand/$value" } });
	expect(output.fidelity.losses).toHaveLength(2);
});

import { describe, expect, test } from "vitest";
import { SourcePass } from "../src/source-pass-utils.ts";

describe("SourcePass", () => {
	test("returns the original source for no edits and avoids sorting one edit", () => {
		const source = "const value = old;";

		expect(SourcePass.applyEdits(source, [])).toBe(source);
		expect(
			SourcePass.applyEdits(source, [
				{ start: source.indexOf("old"), end: source.indexOf("old") + 3, text: "new" },
			]),
		).toBe("const value = new;");
	});

	test("applies edits from right to left without shifting offsets", () => {
		const source = "const value = old;";
		expect(
			SourcePass.applyEdits(source, [
				{ start: 0, end: 5, text: "let" },
				{ start: source.indexOf("old"), end: source.indexOf("old") + 3, text: "new" },
			]),
		).toBe("let value = new;");
	});

	test("keeps insertion order at a shared source position", () => {
		expect(
			SourcePass.applyEdits("ab", [
				{ start: 0, end: 0, text: "first" },
				{ start: 0, end: 0, text: "second" },
			]),
		).toBe("firstsecondab");
	});

	test("rejects overlapping source ranges", () => {
		expect(() =>
			SourcePass.applyEdits("abcdef", [
				{ start: 0, end: 3, text: "first" },
				{ start: 2, end: 4, text: "second" },
			]),
		).toThrow();
	});

	test("matches nested blocks and returns the exclusive end", () => {
		const source = "css({ color: red, states: { hover: { color: blue } } })";
		const block = SourcePass.matchBlock(source, source.indexOf("{"));
		expect(block).toEqual({
			body: " color: red, states: { hover: { color: blue } } ",
			end: source.lastIndexOf("}") + 1,
		});
	});

	test("inserts an indented skip marker at the containing line", () => {
		expect(
			SourcePass.insertSkipMarker("  css({ color: value });", 10, "dynamic", "yumcss:migrate-skip"),
		).toBe("  // yumcss:migrate-skip (dynamic)\n  css({ color: value });");
	});

	test("uses a JSX comment when a residual marks a JSX child", () => {
		const source = ["const value = (", "  <Tooltip>", "    <Badge />", "  </Tooltip>", ");"].join(
			"\n",
		);
		const migrated = SourcePass.insertSkipMarker(
			source,
			source.indexOf("<Badge"),
			"dynamic",
			"yumcss:migrate-skip",
			"App.tsx",
		);

		expect(migrated).toContain("    {/* yumcss:migrate-skip (dynamic) */}\n    <Badge />");
		expect(migrated).not.toContain("    // yumcss:migrate-skip");
	});

	test("recognizes a JSX child when insertion starts at its indentation", () => {
		const source = ["const value = (", "  <Tooltip>", "    <Badge />", "  </Tooltip>", ");"].join(
			"\n",
		);
		const index = source.lastIndexOf("\n", source.indexOf("<Badge")) + 1;
		const migrated = SourcePass.insertSkipMarker(
			source,
			index,
			"dynamic",
			"yumcss:migrate-skip",
			"App.tsx",
		);

		expect(migrated).toContain("    {/* yumcss:migrate-skip (dynamic) */}\n    <Badge />");
	});

	test("uses a JSX comment when the residual starts inside a child opening tag", () => {
		const source = [
			"const value = (",
			"  <Tooltip>",
			'    <Badge gap="2" />',
			"  </Tooltip>",
			");",
		].join("\n");
		const migrated = SourcePass.insertSkipMarker(
			source,
			source.indexOf("gap"),
			"dynamic",
			"yumcss:migrate-skip",
			"App.tsx",
		);

		expect(migrated).toContain('    {/* yumcss:migrate-skip (dynamic) */}\n    <Badge gap="2" />');
		expect(migrated).not.toContain("    // yumcss:migrate-skip");
	});

	test("recognizes children of JSX member elements", () => {
		const source = [
			"const value = (",
			"  <Table.Cell>",
			"    <Badge />",
			"  </Table.Cell>",
			");",
		].join("\n");
		const index = source.lastIndexOf("\n", source.indexOf("<Badge")) + 1;
		const migrated = SourcePass.insertSkipMarker(
			source,
			index,
			"dynamic",
			"yumcss:migrate-skip",
			"App.tsx",
		);

		expect(migrated).toContain("    {/* yumcss:migrate-skip (dynamic) */}\n    <Badge />");
	});

	test("keeps markers before a root JSX element as JavaScript comments", () => {
		const source = ["const value = (", "  <Widget />", ");"].join("\n");
		const migrated = SourcePass.insertSkipMarker(
			source,
			source.indexOf("<Widget"),
			"residual",
			"yumcss:migrate-skip",
			"App.tsx",
		);

		expect(migrated).toContain("  // yumcss:migrate-skip (residual)\n  <Widget />");
		expect(migrated).not.toContain("{/* yumcss:migrate-skip");
	});

	test("keeps markers inside JSX expression containers as JavaScript comments", () => {
		const source = [
			"const value = (",
			"  <div>",
			"    {enabled && (",
			"      <Widget />",
			"    )}",
			"  </div>",
			");",
		].join("\n");
		const migrated = SourcePass.insertSkipMarker(
			source,
			source.indexOf("<Widget"),
			"residual",
			"yumcss:migrate-skip",
			"App.tsx",
		);

		expect(migrated).toContain("      // yumcss:migrate-skip (residual)\n      <Widget />");
		expect(migrated).not.toContain("{/* yumcss:migrate-skip");
	});

	test("keeps nested JSX comments valid across an outer expression container", () => {
		const source = [
			"const value = (",
			"  <Table.Cell>",
			"    {enabled && (",
			"      <Stack>",
			"        <Badge />",
			"      </Stack>",
			"    )}",
			"  </Table.Cell>",
			");",
		].join("\n");
		const index = source.lastIndexOf("\n", source.indexOf("<Badge")) + 1;
		const migrated = SourcePass.insertSkipMarker(
			source,
			index,
			"residual",
			"yumcss:migrate-skip",
			"App.tsx",
		);

		expect(migrated).toContain("        {/* yumcss:migrate-skip (residual) */}\n        <Badge />");
	});

	test("keeps nested JSX comments valid inside a JSX callback attribute", () => {
		const source = [
			"const value = (",
			"  <VirtualizedTableBody",
			"    renderRow={() => (",
			"      <Table.Cell>",
			"        <Badge />",
			"      </Table.Cell>",
			"    )}",
			"  />",
			");",
		].join("\n");
		const index = source.lastIndexOf("\n", source.indexOf("<Badge")) + 1;
		const migrated = SourcePass.insertSkipMarker(
			source,
			index,
			"residual",
			"yumcss:migrate-skip",
			"App.tsx",
		);

		expect(migrated).toContain("        {/* yumcss:migrate-skip (residual) */}\n        <Badge />");
	});

	test("keeps markers inside JSX attributes as JavaScript comments", () => {
		const source = [
			"const value = (",
			"  <div className={cx(",
			"    className,",
			"    sourceCss({ color: value }),",
			"  )} />",
			");",
		].join("\n");
		const index = source.indexOf("sourceCss");
		const migrated = SourcePass.insertSkipMarker(
			source,
			index,
			"dynamic",
			"yumcss:migrate-skip",
			"App.tsx",
		);

		expect(migrated).toContain("    // yumcss:migrate-skip (dynamic)\n    sourceCss");
		expect(migrated).not.toContain("{/* yumcss:migrate-skip");
	});
});

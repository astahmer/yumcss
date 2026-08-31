import { CodemodAdapterId } from "../src/swap/index.ts";
import type { AdapterContractFixture, AdapterMatrixFixture } from "../src/swap/index.ts";
import { adapterContractFixtures } from "./adapter-contract-fixtures.ts";

function semanticFor(adapter: string): AdapterContractFixture["semantic"] {
	if (adapter === CodemodAdapterId.StyledComponents) return { source: { framework: "react" } };
	if (adapter === CodemodAdapterId.SolidStyled) return { source: { framework: "solid" } };
	if (adapter === CodemodAdapterId.VueStyled) return { source: { framework: "vue" } };
	if (
		adapter === CodemodAdapterId.ChakraUi ||
		adapter === CodemodAdapterId.Mui ||
		adapter === CodemodAdapterId.Mantine
	)
		return { source: { framework: "react" } };
	return undefined;
}

function edgeSource(adapter: string, source: string): string {
	if (source.includes("'red'")) return source.replaceAll("'red'", "theme.foreground");
	if (source.includes('"red"')) return source.replaceAll('"red"', "theme.foreground");
	if (source.includes("color: red"))
		return source.replaceAll("color: red", "color: ${theme.foreground}");
	if (source.includes("bg='tomato'")) return source.replace("bg='tomato'", "bg={theme.foreground}");
	if (adapter === CodemodAdapterId.UnoCSS)
		return '<div className="flex unknown-project-utility" />';
	return `${source}\nconst unresolvedStyle = runtimeTheme.foreground;`;
}

/**
 * Complete source corpus for the Cartesian route gate. Each adapter gets a
 * static happy path plus dynamic and malformed source so both ordered
 * directions are checked for conversion and source-preserving safety.
 */
export const completeAdapterMatrixFixtures: readonly AdapterMatrixFixture[] =
	adapterContractFixtures.flatMap((fixture) => [
		{
			sourceAdapter: fixture.adapter,
			file: fixture.file,
			source: fixture.source,
			scenario: "happy" as const,
			semantic: semanticFor(fixture.adapter),
		},
		{
			sourceAdapter: fixture.adapter,
			file: fixture.file,
			source: edgeSource(fixture.adapter, fixture.source),
			scenario: "edge" as const,
			semantic: semanticFor(fixture.adapter),
		},
		{
			sourceAdapter: fixture.adapter,
			file: fixture.file,
			source: `${fixture.source}\n/* unfinished ${fixture.adapter} */`,
			scenario: "malformed" as const,
			semantic: semanticFor(fixture.adapter),
		},
	]);

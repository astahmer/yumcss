import { compile } from "@tailwindcss/node";
import { parse, type Root } from "postcss";
import type { CssArtifactCompiler, CssBudgetInput } from "./css-budget-contracts.ts";

/** Tailwind-specific artifact port. Compilation is replaceable for other CSS engines. */
export class TailwindArtifactCompiler implements CssArtifactCompiler {
	async compile(input: CssBudgetInput, candidates: readonly string[]): Promise<Root> {
		const cssInput = `@import "tailwindcss";\n${input.themeCss ?? ""}\n`;
		const compiled = await compile(cssInput, { base: input.base, onDependency: () => {} });
		return parse(compiled.build([...candidates]));
	}
}

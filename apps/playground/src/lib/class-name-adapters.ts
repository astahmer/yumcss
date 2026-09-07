import {
	createNamedAtomsStrategy,
	createPandaAdapter,
	createStyleXAdapter,
	createUnoCssAdapter,
	type ClassNameStrategy,
} from "pandwind/css";
import { examplePreset } from "@pandwind/example-preset";
import { twAdapter } from "../bridge.ts";

/** Runtime-selectable class-name strategies shown by the own-API playground. */
export const ClassNameAdapterId = {
	Atomic: "atomic",
	NamedAtoms: "named-atoms",
	Tailwind: "tailwind",
	UnoCSS: "unocss",
	Panda: "panda",
	StyleX: "stylex",
} as const;

export type ClassNameAdapterId = (typeof ClassNameAdapterId)[keyof typeof ClassNameAdapterId];

export interface ClassNameAdapterDefinition {
	id: ClassNameAdapterId;
	label: string;
	description: string;
	/** `undefined` selects Pandwind's normal hashed atomic output. */
	strategy: ClassNameStrategy | undefined;
}

const strategies: Readonly<Record<ClassNameAdapterId, ClassNameStrategy | undefined>> = {
	[ClassNameAdapterId.Atomic]: undefined,
	[ClassNameAdapterId.NamedAtoms]: createNamedAtomsStrategy(),
	[ClassNameAdapterId.Tailwind]: twAdapter,
	[ClassNameAdapterId.UnoCSS]: createUnoCssAdapter({ preset: examplePreset }),
	[ClassNameAdapterId.Panda]: createPandaAdapter({ conditions: examplePreset.conditions }),
	[ClassNameAdapterId.StyleX]: createStyleXAdapter({ conditions: examplePreset.conditions }),
};

export const CLASS_NAME_ADAPTERS: readonly ClassNameAdapterDefinition[] = [
	{
		id: ClassNameAdapterId.Atomic,
		label: "Pandwind atomic",
		description: "hashed classes and a Pandwind-owned runtime sheet",
		strategy: strategies[ClassNameAdapterId.Atomic],
	},
	{
		id: ClassNameAdapterId.NamedAtoms,
		label: "Pandwind named atoms",
		description: "readable classes and a Pandwind-owned runtime sheet",
		strategy: strategies[ClassNameAdapterId.NamedAtoms],
	},
	{
		id: ClassNameAdapterId.Tailwind,
		label: "Tailwind CSS",
		description: "Tailwind utility candidates for Tailwind's compiler",
		strategy: strategies[ClassNameAdapterId.Tailwind],
	},
	{
		id: ClassNameAdapterId.UnoCSS,
		label: "UnoCSS",
		description: "UnoCSS arbitrary-property candidates",
		strategy: strategies[ClassNameAdapterId.UnoCSS],
	},
	{
		id: ClassNameAdapterId.Panda,
		label: "Panda",
		description: "Panda-shaped atomic class names",
		strategy: strategies[ClassNameAdapterId.Panda],
	},
	{
		id: ClassNameAdapterId.StyleX,
		label: "StyleX",
		description: "StyleX-shaped classes with a Pandwind-owned sheet",
		strategy: strategies[ClassNameAdapterId.StyleX],
	},
];

export function classNameAdapterById(id: string | null | undefined): ClassNameAdapterDefinition {
	return CLASS_NAME_ADAPTERS.find((adapter) => adapter.id === id) ?? CLASS_NAME_ADAPTERS[0]!;
}

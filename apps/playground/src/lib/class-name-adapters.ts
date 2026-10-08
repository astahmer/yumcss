import { createNamedAtomsStrategy } from "yumcss/css/named";
import {
	PREVIEW_ENGINE_SCHEMA,
	PreviewEngineId,
	PreviewEngineRegistry,
	type PreviewEngine,
} from "./preview-engine.ts";
import { yumcssPreviewEngine } from "./preview-engines/yumcss.ts";

/** Runtime-selectable class-name strategies shown by the own-API playground. */
export interface ClassNameAdapterDefinition {
	id: PreviewEngineId;
	label: string;
	description: string;
	engine: PreviewEngine;
}

export const CLASS_NAME_ADAPTERS: readonly ClassNameAdapterDefinition[] = [
	{
		id: PreviewEngineId.Atomic,
		label: "YumCSS atomic",
		description: "hashed classes and a YumCSS-owned runtime sheet",
		engine: yumcssPreviewEngine(PreviewEngineId.Atomic, null),
	},
	{
		id: PreviewEngineId.NamedAtoms,
		label: "YumCSS named atoms",
		description: "readable classes and a YumCSS-owned runtime sheet",
		engine: yumcssPreviewEngine(PreviewEngineId.NamedAtoms, createNamedAtomsStrategy()),
	},
	{
		id: PreviewEngineId.Tailwind,
		label: "Tailwind CSS",
		description: "Tailwind utility candidates for Tailwind's compiler",
		engine: {
			schema: PREVIEW_ENGINE_SCHEMA,
			id: PreviewEngineId.Tailwind,
			createSession: async (signal) =>
				(await import("./preview-engines/tailwind.ts")).tailwindPreviewEngine.createSession(signal),
		},
	},
	{
		id: PreviewEngineId.UnoCSS,
		label: "UnoCSS",
		description: "UnoCSS arbitrary-property candidates",
		engine: {
			schema: PREVIEW_ENGINE_SCHEMA,
			id: PreviewEngineId.UnoCSS,
			createSession: async (signal) =>
				(await import("./preview-engines/unocss.ts")).unocssPreviewEngine.createSession(signal),
		},
	},
	{
		id: PreviewEngineId.Panda,
		label: "Panda",
		description: "Panda generator and generated runtime",
		engine: {
			schema: PREVIEW_ENGINE_SCHEMA,
			id: PreviewEngineId.Panda,
			createSession: async (signal) =>
				(await import("./preview-engines/panda.ts")).pandaPreviewEngine.createSession(signal),
		},
	},
	{
		id: PreviewEngineId.StyleX,
		label: "StyleX",
		description: "StyleX browser compiler and runtime",
		engine: {
			schema: PREVIEW_ENGINE_SCHEMA,
			id: PreviewEngineId.StyleX,
			createSession: async (signal) =>
				(await import("./preview-engines/stylex.ts")).stylexPreviewEngine.createSession(signal),
		},
	},
];

export function classNameAdapterById(id: string | null | undefined): ClassNameAdapterDefinition {
	return CLASS_NAME_ADAPTERS.find((adapter) => adapter.id === id) ?? CLASS_NAME_ADAPTERS[0]!;
}

export const previewEngineRegistry = new PreviewEngineRegistry(
	CLASS_NAME_ADAPTERS.map((adapter) => adapter.engine),
);

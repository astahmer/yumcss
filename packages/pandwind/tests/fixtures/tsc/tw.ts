import { createTw, type TwConflictsMeta, type TwVariantsMeta } from "pandwind/tw";

type WindVariants = {
	display?: "flex" | "grid";
	bg?: "blue-600" | "gray-50" | "white";
	text?: "gray-900" | "white";
	p?: "2" | "4" | "6" | "8";
	gap?: "2" | "4" | "6";
	rounded?: "md" | "lg";
	opacity?: "50" | "100";
	sm?: { p?: "4" | "6" | "8"; gap?: "2" | "4" };
	dark?: { bg?: "gray-50" | "gray-900" };
	group?: { hover?: { opacity?: "50" | "100" } };
};

const variants: TwVariantsMeta = {
	sm: { join: ":" },
	dark: { join: ":" },
	group: { join: "-" },
	hover: { join: ":" },
};
const conflicts: TwConflictsMeta = {
	bg: { "*": ["background-color"] },
	text: { "*": ["color"] },
	p: { "*": ["padding"] },
	gap: { "*": ["gap"] },
	rounded: { "*": ["border-radius"] },
	opacity: { "*": ["opacity"] },
};

const tw = createTw<WindVariants>({
	variants,
	conflicts,
	compose: ["scale-x", "scale-y"],
});

const outputs = [
	tw({ display: "flex", bg: "blue-600", text: "white", p: "4", gap: "2", rounded: "md" }),
	tw({ display: "grid", bg: "gray-50", text: "gray-900", p: "6", gap: "4", rounded: "lg" }),
	tw({ bg: "blue-600", p: "4", sm: { p: "6", gap: "4" } }),
	tw({ bg: "gray-50", dark: { bg: "gray-900" }, group: { hover: { opacity: "50" } } }),
	tw({ display: "flex", bg: "blue-600", p: "8", opacity: "100" }),
	tw({ display: "grid", bg: "gray-50", p: "2", opacity: "50" }),
	tw({ display: "flex", bg: "blue-600", p: "4", gap: "2" }),
	tw({ display: "grid", bg: "gray-50", p: "6", gap: "4" }),
	tw({ display: "flex", bg: "blue-600", p: "8", gap: "6" }),
	tw({ display: "grid", bg: "gray-50", p: "2", gap: "2" }),
];

export const workload = { outputs, variants, conflicts };

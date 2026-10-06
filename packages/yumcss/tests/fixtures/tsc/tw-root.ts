import { tw } from "yumcss";

const outputs = [
	tw({ display: "flex", gap: "4", padding: "6" }),
	tw({ display: "grid", color: "blue-600", text: "white" }),
	tw({ flex: "col", items: "center", justify: "between" }),
	tw({ hidden: false, block: true, opacity: 50 }),
];

export const workload = outputs;

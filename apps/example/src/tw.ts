import { createTw } from "pandwind/tw";
import type { WindVariants } from "./types";

export const tw = createTw<WindVariants>({
	variants: {
		not: { join: "-" },
		group: { join: "-" },
		peer: { join: "-" },
		in: { join: "-" },
		has: { join: "-" },
		aria: { join: "-" },
		data: { join: "-" },
		nth: { join: "-" },
		nthLast: { join: "-" },
		nthOfType: { join: "-" },
		nthLastOfType: { join: "-" },
		supports: { join: "-" },
		max: { join: "-" },
		min: { join: "-" },
		"@max": { join: "-" },
		"@": { join: "" },
		"@min": { join: "-" },
	},
});

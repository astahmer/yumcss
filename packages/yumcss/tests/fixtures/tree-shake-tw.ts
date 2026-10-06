// Root barrel, tw() only — css()/cx()/preset must be shaken out.
import { createTw } from "../../src/index.ts";

const tw = createTw<Record<string, unknown>>({});

export const a = tw({ flex: "col" });
export const b = tw({ bg: ["red-500", "blue-500"] });

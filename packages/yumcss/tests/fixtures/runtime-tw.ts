import { createTw } from "../../src/tw/index.ts";

const tw = createTw<Record<string, unknown>>({});

export const a = tw({ flex: "col" });
export const b = tw({ bg: ["red-500", "blue-500"] });

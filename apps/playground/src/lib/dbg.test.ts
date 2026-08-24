import { test } from "vitest";
import { writeFileSync } from "node:fs";
import { cx } from "../cx.ts";
import { css } from "../design.ts";
import { tw } from "../tw.ts";
import { evalPlayground } from "./eval-playground.ts";

test("dbg", () => {
	const mk = (code: string) =>
		evalPlayground({
			code,
			tw: tw as unknown as (...a: unknown[]) => unknown,
			css: css as unknown as ((...a: unknown[]) => unknown) & Record<string, unknown>,
			cx: cx as unknown as (...a: never[]) => string,
		});
	const out = {
		multi: mk('const base = tw({ display: "flex", gap: "4" });\ncx(base, "p-2");'),
		cond: mk('cx(props.active ? "bg-blue-600" : "bg-gray-100", "px-4")'),
	};
	writeFileSync("/tmp/dbg-multi.json", JSON.stringify(out));
});

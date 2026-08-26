/**
 * Style usage analytics (plans/023 #6) — panda-cloud-style insight into
 * HOW the app's styles are used, computed from the same source files the
 * coverage pass scans:
 *
 * - per-token usage counts (preset/theme `$tokens`), including ZERO-usage
 *   tokens when the caller supplies the full token universe;
 * - top properties and top property+value combinations across tw()/css
 *   call-site object literals;
 * - condition frequency with a responsive / pseudo / media-ish breakdown.
 *
 * Pure string analysis — brace-matched extraction, no AST dependency.
 */

import type { ConditionUsage, StyleUsageReport, UsageCount } from "../types.ts";

export type { ConditionUsage, StyleUsageReport, UsageCount };

const RESPONSIVE = /^(sm|md|lg|xl|2xl|min|max|maxMd|maxLg)(:|$)/;
const PSEUDO =
	/^(hover|focus|focusWithin|focusVisible|active|visited|disabled|enabled|checked|placeholder|first|last|odd|even|firstLetter|firstLine|selection|marker|before|after|file|backdrop)$/;

function classifyCondition(name: string): ConditionUsage["kind"] {
	if (RESPONSIVE.test(name)) return "responsive";
	if (PSEUDO.test(name)) return "pseudo";
	if (
		/^(dark|light|motionSafe|motionReduce|contrastMore|contrastLess|print|portrait|landscape|ltr|rtl)$/.test(
			name,
		)
	)
		return "media";
	return "other";
}

/** Extract balanced `{ ... }` body starting at `open`. */
function matchBlock(source: string, open: number): string | null {
	let depth = 0;
	for (let i = open; i < source.length; i++) {
		if (source[i] === "{") depth++;
		else if (source[i] === "}") {
			depth--;
			if (depth === 0) return source.slice(open + 1, i);
		}
	}
	return null;
}

interface Collected {
	properties: Map<string, number>;
	combos: Map<string, number>;
	conditions: Map<string, number>;
	tokens: Map<string, number>;
}

function walkObject(body: string, collected: Collected): void {
	let segment = "";
	const flushTopLevel = (): void => {
		const trimmed = segment.trim();
		segment = "";
		if (trimmed === "") return;
		const colon = trimmed.indexOf(":");
		if (colon === -1) return;
		const key = trimmed
			.slice(0, colon)
			.trim()
			.replace(/^["']|["']$/g, "");
		if (key === "") return;
		// Condition keys reach here with an empty body right before their
		// opening brace — counted by the condition branch instead.
		const rawValue = trimmed.slice(colon + 1).trim();
		if (rawValue === "" || rawValue === "{" || rawValue === "[") return;
		collected.properties.set(key, (collected.properties.get(key) ?? 0) + 1);
		const value = rawValue.replace(/\s+/g, " ");
		collected.combos.set(`${key}: ${value}`, (collected.combos.get(`${key}: ${value}`) ?? 0) + 1);
		const unquoted = value.replace(/^["']|["']$/g, "");
		if (unquoted.startsWith("$")) {
			const token = unquoted.split(/[\s/[\]]/)[0]!;
			collected.tokens.set(token, (collected.tokens.get(token) ?? 0) + 1);
		}
	};
	for (let i = 0; i < body.length; i++) {
		const ch = body[i]!;
		if (ch === '"' || ch === "'" || ch === "`") {
			const quote = ch;
			segment += ch;
			i++;
			while (i < body.length && body[i] !== quote) {
				if (body[i] === "\\") {
					segment += body.slice(i, i + 2);
					i += 2;
					continue;
				}
				segment += body[i]!;
				i++;
			}
			if (i < body.length) segment += quote;
			continue;
		}
		if (ch === "/" && body[i + 1] === "/") {
			while (i < body.length && body[i] !== "\n") i++;
			continue;
		}
		if (ch === "{") {
			// read the condition key BEFORE flushTopLevel clears the segment
			const condName = /^["']?([\w$*-]+)["']?\s*:\s*$/.exec(segment.trim())?.[1] ?? "";
			flushTopLevel();
			if (condName !== "") {
				collected.conditions.set(condName, (collected.conditions.get(condName) ?? 0) + 1);
			}

			// find matching close to skip nested content but keep scanning siblings:
			// recurse so nested keys are counted under their own conditions.
			let innerDepth = 1;
			const innerStart = i + 1;
			while (i < body.length && innerDepth > 0) {
				i++;
				if (body[i] === "{") innerDepth++;
				else if (body[i] === "}") innerDepth--;
			}
			walkObject(body.slice(innerStart, i), collected);
			continue;
		}
		if (ch === ",") {
			flushTopLevel();
			continue;
		}
		segment += ch;
	}
	flushTopLevel();
}

const CALL_REGEX = /\b(?:tw|css)\s*(?:\.\s*\w+)?\s*\(\s*\{/g;

function topUsage(map: Map<string, number>, cap: number): UsageCount[] {
	return [...map.entries()]
		.map(([name, count]) => ({ name, count }))
		.toSorted((x, y) => y.count - x.count || x.name.localeCompare(y.name))
		.slice(0, cap);
}

export function analyzeStyleUsage(
	files: Array<{ file: string; content: string }>,
	tokenUniverse?: ReadonlyArray<string>,
): StyleUsageReport {
	const collected: Collected = {
		properties: new Map(),
		combos: new Map(),
		conditions: new Map(),
		tokens: new Map(),
	};
	let sitesScanned = 0;
	for (const file of files) {
		for (const match of file.content.matchAll(CALL_REGEX)) {
			const open = (match.index ?? 0) + match[0].length - 1;
			const body = matchBlock(file.content, open);
			if (body === null) continue;
			sitesScanned++;
			walkObject(body, collected);
		}
	}

	const tokenUsage = [...collected.tokens.entries()]
		.map(([name, count]) => ({ name, count }))
		.toSorted((a, b) => b.count - a.count || a.name.localeCompare(b.name));

	const unusedTokens =
		tokenUniverse === undefined
			? []
			: [...tokenUniverse]
					.map((token) => (token.startsWith("$") ? token : `$${token}`))
					.filter((token) => !collected.tokens.has(token))
					.toSorted();

	const conditions: ConditionUsage[] = [...collected.conditions.entries()]
		.map(([name, count]) => ({ name, count, kind: classifyCondition(name.replace(/^\$/, "")) }))
		.toSorted((a, b) => b.count - a.count);

	const breakdown = { responsive: 0, pseudo: 0, media: 0, other: 0 };
	for (const c of conditions) breakdown[c.kind] += c.count;

	const topPropertyValues = [...collected.combos.entries()]
		.map(([combo, count]) => ({ combo, count }))
		.toSorted((a, b) => b.count - a.count)
		.slice(0, 20);

	return {
		sitesScanned,
		tokenUsage,
		unusedTokens,
		topProperties: topUsage(collected.properties, 20),
		topPropertyValues,
		conditions: conditions.slice(0, 30),
		conditionBreakdown: breakdown,
	};
}

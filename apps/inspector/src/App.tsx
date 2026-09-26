import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { css as uiCss } from "./ui-css.ts";
import { InspectorApi, type AnalyticsHistoryPoint, type HistoryListItem } from "./lib/api.ts";
import { diffRuns, type HistoryEntry } from "./lib/history-diff.ts";
import { InspectorExport } from "./lib/export.ts";
import { filterNamed, makeTextMatcher } from "./lib/filter.ts";
import {
	evaluateContrastPair,
	groupThemeVars,
	resolveChain,
	splitTokenValue,
	type ThemeVarCategory,
} from "pandwind-analyze/collect/browser";
import type { InspectorPayload, ThemeVar, TokenSection, TokenGraph, TokenTier } from "./types.ts";
import {
	authoredTokenSpelling,
	type GovernanceCoverageBoundary,
	type RemovalSafety,
	type TokenReleaseReport,
	type TokenPolicySnapshot,
} from "pandwind-analyze/governance/browser";

import {
	CLEANUP_SAFETIES,
	INSPECTOR_TABS,
	TOKEN_CONDITION_KINDS,
	TOKEN_USAGE_ACTIVITIES,
	readInspectorUrlState,
	serializeInspectorUrlState,
	type BuildAuthoredValueFilter,
	type BuildFileFilter,
	type CleanupSafetyFilter,
	type InspectorBuildFilters,
	type InspectorTab,
	type InspectorUrlState,
} from "./lib/url-state.ts";
import {
	getTokenRelationships,
	mostConnectedTokenId,
	presentTokenNode,
} from "./lib/token-relationships.ts";
import { InspectorTable } from "./lib/inspector-table.tsx";

/* ---------------------------------- helpers ---------------------------------- */

const stripDollar = (name: string): string => (name.startsWith("$") ? name.slice(1) : name);

const isHex = (value: string): boolean => /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim());

const projectRelativeFile = (root: string, file: string): string => {
	const normalizedRoot = root.replaceAll("\\", "/").replace(/\/+$/, "");
	const normalizedFile = file.replaceAll("\\", "/");
	const rootPrefix = `${normalizedRoot}/`;
	return normalizedFile.startsWith(rootPrefix)
		? normalizedFile.slice(rootPrefix.length)
		: normalizedFile;
};

type BuildFileStatus = Exclude<BuildFileFilter, "eliminated">;

const buildFileStatus = (file: InspectorPayload["coverage"]["files"][number]): BuildFileStatus => {
	if (file.cxCalls === 0) return "no-calls";
	if (file.cxRuntime > 0) return "runtime";
	if (file.cxFoldedPartial > 0) return "partial";
	return "full";
};

function CopyButton(props: { text: string; className?: string }) {
	const [copied, setCopied] = useState(false);
	const copy = (): void => {
		const clipboard = navigator.clipboard;
		if (clipboard === undefined) return;
		void clipboard.writeText(props.text).then(
			() => {
				setCopied(true);
				setTimeout(() => setCopied(false), 900);
			},
			() => {},
		);
	};
	return (
		<button
			type="button"
			className={
				copied
					? `${props.className ?? uiCss.class({ padding: "2px 7px", fontSize: 12, opacity: 0.55, "&:hover": { opacity: 1 } })} ${uiCss.class({ color: "var(--good)", opacity: 1 })}`
					: (props.className ??
						uiCss.class({
							padding: "2px 7px",
							fontSize: 12,
							opacity: 0.55,
							"&:hover": { opacity: 1 },
						}))
			}
			aria-label={copied ? `copied ${props.text}` : `copy ${props.text}`}
			aria-live="polite"
			title={`copy ${props.text}`}
			onClick={copy}
		>
			<span aria-hidden="true">{copied ? "✓" : "⧉"}</span>
			<span
				className={uiCss.class({
					position: "absolute",
					width: 1,
					height: 1,
					padding: 0,
					margin: -1,
					overflow: "hidden",
					clipPath: "inset(50%)",
					whiteSpace: "nowrap",
					border: 0,
				})}
			>
				{copied ? "copied" : "copy"}
			</span>
		</button>
	);
}

function SwatchButton(props: { name: string; mode: string; color: string }) {
	const [copied, setCopied] = useState(false);
	const copy = (): void => {
		const clipboard = navigator.clipboard;
		if (clipboard === undefined) return;
		void clipboard.writeText(props.color).then(
			() => {
				setCopied(true);
				setTimeout(() => setCopied(false), 900);
			},
			() => {},
		);
	};
	return (
		<button
			type="button"
			{...uiCss.props(
				uiCss.class({
					flex: 1,
					border: "none",
					cursor: "copy",
					padding: 0,
					minWidth: 0,
					"& + &": { borderLeft: "1px solid rgba(255, 255, 255, 0.14)" },
				}),
				copied ? uiCss.class({ color: "var(--good)", opacity: 1 }) : undefined,
				uiCss.vars({ background: props.color }),
			)}
			aria-label={`${copied ? "Copied" : "Copy"} ${props.name}${props.mode === "base" ? "" : ` (${props.mode})`} color ${props.color}`}
			title={`${props.name}${props.mode === "base" ? "" : ` (${props.mode})`} = ${props.color} — click to copy`}
			onClick={copy}
		>
			<span
				className={uiCss.class({
					position: "absolute",
					width: 1,
					height: 1,
					padding: 0,
					margin: -1,
					overflow: "hidden",
					clipPath: "inset(50%)",
					whiteSpace: "nowrap",
					border: 0,
				})}
			>
				{copied ? "copied" : "copy"}
			</span>
		</button>
	);
}

function SearchControl(props: {
	query: string;
	queryChange: (value: string) => void;
	matchCount: number;
	totalCount: number;
}) {
	return (
		<div
			className={uiCss.class({
				display: "grid",
				gridTemplateColumns: "1fr auto auto",
				alignItems: "center",
				gap: 8,
				margin: "14px 0 10px",
			})}
		>
			<label
				className={uiCss.class({
					position: "absolute",
					width: 1,
					height: 1,
					padding: 0,
					margin: -1,
					overflow: "hidden",
					clipPath: "inset(50%)",
					whiteSpace: "nowrap",
					border: 0,
				})}
				htmlFor="inspector-search"
			>
				Filter visible inspector data
			</label>
			<input
				id="inspector-search"
				className={uiCss.class({
					width: "100%",
					padding: "8px 13px",
					font: "inherit",
					background: "var(--panel)",
					color: "var(--text)",
					border: "1px solid var(--line)",
					borderRadius: 7,
					outline: "none",
					"&:focus": { borderColor: "var(--accent-dim)" },
				})}
				type="search"
				placeholder="filter tokens & utilities…"
				value={props.query}
				aria-label="Filter visible inspector data"
				aria-controls="inspector-panel"
				aria-describedby="inspector-search-status inspector-search-hint"
				aria-keyshortcuts="/"
				onChange={(event) => props.queryChange(event.target.value)}
			/>
			<button
				type="button"
				className={uiCss.class({ padding: "6px 10px" })}
				disabled={props.query === ""}
				aria-label="Clear search"
				onClick={() => props.queryChange("")}
			>
				clear
			</button>
			<span
				id="inspector-search-status"
				className={uiCss.class({ color: "var(--muted)", fontSize: 12, whiteSpace: "nowrap" })}
				role="status"
				aria-live="polite"
			>
				{props.matchCount} of {props.totalCount} matches
			</span>
			<span
				id="inspector-search-hint"
				className={uiCss.class({
					position: "absolute",
					width: 1,
					height: 1,
					padding: 0,
					margin: -1,
					overflow: "hidden",
					clipPath: "inset(50%)",
					whiteSpace: "nowrap",
					border: 0,
				})}
			>
				Press slash to focus search.
			</span>
		</div>
	);
}

function ErrorState(props: { message: string; retry: () => void }) {
	return (
		<div
			className={uiCss.class({
				display: "flex",
				alignItems: "center",
				gap: 12,
				padding: "48px 0",
				color: "var(--muted)",
				justifyContent: "center",
			})}
			role="alert"
		>
			<div>
				<p className={uiCss.class({ color: "var(--bad)" })}>{props.message}</p>
				<p className={uiCss.class({ color: "var(--muted, #888)" })}>
					Check that the Inspector dev server and analyzer dependencies are running, then retry. If
					the project is large, the first gather can take a moment.
				</p>
				<button type="button" onClick={props.retry}>
					retry analysis
				</button>
			</div>
		</div>
	);
}

function LoadingSkeleton() {
	return (
		<div
			className={uiCss.class({
				display: "flex",
				flexDirection: "column",
				gap: 14,
				padding: "22px 0",
			})}
			role="status"
			aria-live="polite"
			aria-label="Loading inspector data"
		>
			<div
				className={uiCss.class({
					display: "grid",
					gridTemplateColumns: "repeat(auto-fit, minmax(215px, 1fr))",
					gap: 12,
				})}
				aria-hidden="true"
			>
				<div
					className={uiCss.class({
						height: 104,
						borderRadius: 10,
						background:
							"linear-gradient(90deg, var(--bg-raised), var(--panel-hover), var(--bg-raised))",
						backgroundSize: "200% 100%",
						animation: "skeleton 1.3s ease-in-out infinite",
					})}
				/>
				<div
					className={uiCss.class({
						height: 104,
						borderRadius: 10,
						background:
							"linear-gradient(90deg, var(--bg-raised), var(--panel-hover), var(--bg-raised))",
						backgroundSize: "200% 100%",
						animation: "skeleton 1.3s ease-in-out infinite",
					})}
				/>
				<div
					className={uiCss.class({
						height: 104,
						borderRadius: 10,
						background:
							"linear-gradient(90deg, var(--bg-raised), var(--panel-hover), var(--bg-raised))",
						backgroundSize: "200% 100%",
						animation: "skeleton 1.3s ease-in-out infinite",
					})}
				/>
				<div
					className={uiCss.class({
						height: 104,
						borderRadius: 10,
						background:
							"linear-gradient(90deg, var(--bg-raised), var(--panel-hover), var(--bg-raised))",
						backgroundSize: "200% 100%",
						animation: "skeleton 1.3s ease-in-out infinite",
					})}
				/>
			</div>
			<div
				className={uiCss.class({
					height: 220,
					borderRadius: 9,
					background: "linear-gradient(90deg, var(--panel), var(--panel-hover), var(--panel))",
					backgroundSize: "200% 100%",
					animation: "skeleton 1.3s ease-in-out infinite",
				})}
				aria-hidden="true"
			/>
			<span className={uiCss.class({ color: "var(--muted, #888)" })}>analyzing project…</span>
		</div>
	);
}

function HelpPopover(props: { title: string; children: ReactNode }) {
	return (
		<details className={uiCss.class({ position: "relative", flex: "0 0 auto" })}>
			<summary
				className={uiCss.class({
					listStyle: "none",
					cursor: "pointer",
					width: 24,
					height: 24,
					display: "grid",
					placeItems: "center",
					border: "1px solid var(--line)",
					borderRadius: "50%",
					color: "var(--muted)",
					fontSize: 12,
					fontWeight: 650,
					lineHeight: 1,

					"&::-webkit-details-marker": { display: "none" },
					"&:hover": { color: "var(--accent)", borderColor: "var(--accent-dim)" },
					"&:focus-visible": { outline: "2px solid var(--accent)", outlineOffset: 2 },
				})}
				aria-label={`About ${props.title}`}
			>
				?
			</summary>
			<div
				className={uiCss.class({
					position: "absolute",
					top: "calc(100% + 8px)",
					right: 0,
					zIndex: 40,
					width: 300,
					maxWidth: "calc(100vw - 48px)",
					padding: "10px 12px",
					background: "var(--panel)",
					color: "var(--text)",
					border: "1px solid var(--line-strong)",
					borderRadius: 8,
					boxShadow: "0 10px 26px rgb(0 0 0 / 35%)",
					fontSize: 12,
					fontWeight: 400,
					letterSpacing: "normal",
					lineHeight: 1.5,
					"& p": { margin: 0 },
					"& ul": { margin: "7px 0 0", paddingLeft: 17 },
				})}
				role="note"
			>
				<strong>{props.title}</strong>
				<div>{props.children}</div>
			</div>
		</details>
	);
}

function Card(props: { label: string; value: ReactNode; sub?: ReactNode; help?: ReactNode }) {
	return (
		<div
			className={uiCss.class({
				background: "linear-gradient(180deg, var(--bg-raised), var(--panel))",
				border: "1px solid var(--line)",
				borderRadius: 10,
				padding: "15px 17px",
			})}
		>
			<div className={uiCss.class({ fontSize: 26, fontWeight: 650, letterSpacing: "-0.02em" })}>
				{props.value}
			</div>
			<div
				className={uiCss.class({
					color: "var(--muted)",
					marginTop: 2,
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					gap: 8,
				})}
			>
				<span>{props.label}</span>
				{props.help !== undefined && <HelpPopover title={props.label}>{props.help}</HelpPopover>}
			</div>
			{props.sub !== undefined && (
				<div className={uiCss.class({ color: "var(--muted)", fontSize: 12, marginTop: 4 })}>
					{props.sub}
				</div>
			)}
		</div>
	);
}

function InspectorLink(props: {
	target: InspectorUrlState;
	navigateTo: (state: InspectorUrlState) => void;
	label: string;
	children: ReactNode;
}) {
	const href = `${window.location.pathname}${serializeInspectorUrlState(props.target, window.location.search)}`;
	return (
		<a
			href={href}
			className={uiCss.class({
				color: "var(--accent)",
				textDecoration: "underline",
				textDecorationColor: "color-mix(in srgb, var(--accent) 42%, transparent)",
				textUnderlineOffset: 3,
				borderRadius: 2,

				"&:hover": { textDecorationColor: "currentColor" },
				"&:focus-visible": { outline: "2px solid var(--accent)", outlineOffset: 3 },
			})}
			aria-label={props.label}
			onClick={(event) => {
				if (
					event.defaultPrevented ||
					event.button !== 0 ||
					event.metaKey ||
					event.ctrlKey ||
					event.shiftKey ||
					event.altKey
				)
					return;
				event.preventDefault();
				props.navigateTo(props.target);
			}}
		>
			{props.children}
		</a>
	);
}

function BuildReportLink(props: {
	state: InspectorUrlState;
	section: string;
	filters?: InspectorBuildFilters;
	navigateTo: (state: InspectorUrlState) => void;
	label: string;
	children: ReactNode;
}) {
	const target: InspectorUrlState = {
		tab: "build",
		query: props.state.query,
		section: props.section,
		...(props.filters === undefined ? {} : { buildFilters: props.filters }),
	};
	return (
		<InspectorLink target={target} navigateTo={props.navigateTo} label={props.label}>
			{props.children}
		</InspectorLink>
	);
}

/** Horizontal bar scaled against the max value in its set. */
function Bar(props: {
	label: ReactNode;
	value: number;
	max: number;
	suffix?: string;
	renderValue?: ReactNode;
}) {
	const pct = props.max > 0 ? Math.max(2, Math.round((props.value / props.max) * 100)) : 2;
	return (
		<div
			className={uiCss.class({
				display: "grid",
				gridTemplateColumns: "190px 1fr 60px",
				alignItems: "center",
				gap: 12,
				margin: "5px 0",

				"@media (max-width: 900px)": {
					gridTemplateColumns: "minmax(110px, 0.55fr) 1fr 50px",
					gap: 8,
				},
			})}
		>
			<span
				className={uiCss.class({
					fontFamily: "var(--mono)",
					fontSize: 12,
					color: "var(--muted)",
					textAlign: "right",

					"@media (max-width: 900px)": {
						textAlign: "left",
						overflow: "hidden",
						textOverflow: "ellipsis",
						whiteSpace: "nowrap",
					},
				})}
			>
				{props.label}
			</span>
			<span
				className={uiCss.class({
					background: "var(--panel)",
					border: "1px solid var(--line)",
					borderRadius: 5,
					height: 16,
					overflow: "hidden",
				})}
			>
				<span
					{...uiCss.props(
						uiCss.class({
							display: "block",
							height: "100%",
							background: "linear-gradient(90deg, var(--accent-dim), var(--accent))",
							borderRadius: 4,
						}),
						uiCss.vars({ width: `${pct}%` }),
					)}
				/>
			</span>
			<span
				className={uiCss.class({ fontFamily: "var(--mono)", fontSize: 12, color: "var(--muted)" })}
			>
				{props.renderValue ?? (
					<>
						{props.value}
						{props.suffix ?? ""}
					</>
				)}
			</span>
		</div>
	);
}

/* ------------------------------ design system tab ------------------------------ */

function ColorSwatches(props: {
	section: TokenSection;
	rawColors: Map<string, string>;
	matches: (text: string) => boolean;
}) {
	const swatches = filterNamed(props.section.entries, props.matches).map((entry) => {
		const split = splitTokenValue(entry.value);
		if (split.conditionBound && split.json !== null) {
			return { name: entry.name, modes: split.json, chain: [entry.name] };
		}
		if (isHex(split.raw))
			return { name: entry.name, modes: { base: split.raw }, chain: [entry.name] };
		// $ref or named ref -> resolve through raw colors
		const chain = resolveChain(split.raw, props.rawColors);
		const leaf = chain[chain.length - 1] ?? "";
		if (isHex(leaf)) return { name: entry.name, modes: { base: leaf }, chain };
		return null;
	});
	const usable = swatches.filter((s) => s !== null) as Array<{
		name: string;
		modes: Record<string, string>;
		chain: Array<string>;
	}>;
	if (usable.length === 0) return null;
	return (
		<section id={props.section.id}>
			<h2>{props.section.label}</h2>
			<div
				className={uiCss.class({
					display: "grid",
					gridTemplateColumns: "repeat(auto-fill, minmax(148px, 1fr))",
					gap: 10,
				})}
			>
				{usable.map((s) => (
					<div
						className={uiCss.class({
							background: "var(--panel)",
							border: "1px solid var(--line)",
							borderRadius: 9,
							padding: 8,
							display: "flex",
							flexDirection: "column",
							gap: 7,
							position: "relative",
							"&:hover": { borderColor: "var(--line-strong)" },
						})}
						key={`${props.section.id}:${s.name}`}
					>
						<div
							className={uiCss.class({
								display: "flex",
								height: 52,
								borderRadius: 6,
								overflow: "hidden",
							})}
						>
							{Object.entries(s.modes).map(([mode, color]) => (
								<SwatchButton key={mode} name={s.name} mode={mode} color={color} />
							))}
						</div>
						<div
							className={uiCss.class({
								display: "flex",
								flexDirection: "column",
								gap: 1,
								minWidth: 0,
							})}
						>
							<span className={uiCss.class({ fontSize: 12.5, fontWeight: 600 })}>
								{stripDollar(s.name)}
							</span>
							<span
								className={uiCss.class({
									fontFamily: "var(--mono)",
									fontSize: 11,
									color: "var(--muted)",
									overflow: "hidden",
									textOverflow: "ellipsis",
									whiteSpace: "nowrap",
								})}
							>
								{s.chain.length > 1 ? s.chain.join(" ← ") : Object.values(s.modes).join(" ")}
							</span>
						</div>
						<CopyButton
							text={stripDollar(s.name)}
							className={uiCss.class({
								position: "absolute",
								top: 8,
								right: 8,
								background: "color-mix(in srgb, var(--bg) 70%, transparent)",
								padding: "2px 7px",
								fontSize: 12,
								opacity: 0.55,
								"&:hover": { opacity: 1 },
							})}
						/>
					</div>
				))}
			</div>
		</section>
	);
}

const isRenderableColorEntry = (
	entry: TokenSection["entries"][number],
	rawColors: Map<string, string>,
): boolean => {
	const split = splitTokenValue(entry.value);
	if (split.conditionBound && split.json !== null) return true;
	if (isHex(split.raw)) return true;
	const chain = resolveChain(split.raw, rawColors);
	return isHex(chain[chain.length - 1] ?? "");
};

const categorizeColor = (v: ThemeVar): string | null =>
	v.name.startsWith("--color-") ? v.value : null;

const FONT_SIZE_SAMPLE = "The quick brown fox jumps over the lazy dog";

function DesignSystemView(props: {
	data: InspectorPayload;
	query: string;
	queryChange: (v: string) => void;
	section: string | null;
	sectionChange: (section: string) => void;
	navigateTo: (state: InspectorUrlState) => void;
}) {
	const d = props.data.designSystem;
	const matchText = makeTextMatcher(props.query);

	const sectionsById = new Map(d.tokenSections.map((s) => [s.id, s]));
	const rawColors = new Map<string, string>();
	for (const e of sectionsById.get("colors")?.entries ?? []) {
		if (!splitTokenValue(e.value).conditionBound) rawColors.set(e.name, e.value);
	}
	const groupedVars = useMemo(() => groupThemeVars(d.themeVars), [d.themeVars]);

	const fontSizeEntries = sectionsById.get("fontSizes")?.entries ?? [];
	const weightEntries = sectionsById.get("fontWeights")?.entries ?? [];
	const familyEntries = sectionsById.get("fonts")?.entries ?? [];
	const lineHeightEntries = sectionsById.get("lineHeights")?.entries ?? [];
	const trackingEntries = sectionsById.get("letterSpacings")?.entries ?? [];
	const spacingEntries = sectionsById.get("spacing")?.entries ?? [];
	const radiiEntries = sectionsById.get("radii")?.entries ?? [];
	const visibleColorEntries = filterNamed(
		sectionsById.get("colors")?.entries ?? [],
		matchText,
	).filter((entry) => isRenderableColorEntry(entry, rawColors));
	const visibleSemanticEntries = filterNamed(
		sectionsById.get("semantic")?.entries ?? [],
		matchText,
	).filter((entry) => isRenderableColorEntry(entry, rawColors));
	const visibleFontSizeEntries = filterNamed(fontSizeEntries, matchText);
	const visibleWeightEntries = filterNamed(weightEntries, matchText);
	const visibleFamilyEntries = filterNamed(familyEntries, matchText);
	const visibleLineHeightEntries = filterNamed(lineHeightEntries, matchText);
	const visibleTrackingEntries = filterNamed(trackingEntries, matchText);
	const visibleSpacingEntries = filterNamed(spacingEntries, matchText);
	const visibleRadiiEntries = filterNamed(radiiEntries, matchText);
	const visibleUtilities = d.utilities.filter((u) => matchText(u.key) || u.sample.some(matchText));
	const visibleThemeGroups = (
		Object.entries(groupedVars) as Array<[ThemeVarCategory, Array<ThemeVar>]>
	).map(
		([category, vars]) =>
			[category, vars.filter((v) => matchText(v.name) || matchText(v.value))] as const,
	);
	const typographyVisible =
		visibleFontSizeEntries.length > 0 ||
		visibleWeightEntries.length > 0 ||
		visibleFamilyEntries.length > 0 ||
		visibleLineHeightEntries.length > 0 ||
		visibleTrackingEntries.length > 0;
	const themeVisible = visibleThemeGroups.some(([, vars]) => vars.length > 0);
	const showEmptyThemeSection = props.query === "" && d.themeVars.length === 0;
	const showEmptyUtilitiesSection = props.query === "" && d.utilities.length === 0;
	const sectionLinks = [
		{ id: "sec-colors", label: "colors", visible: visibleColorEntries.length > 0 },
		{ id: "sec-semantic", label: "semantic", visible: visibleSemanticEntries.length > 0 },
		{ id: "sec-typography", label: "typography", visible: typographyVisible },
		{ id: "sec-spacing", label: "spacing", visible: visibleSpacingEntries.length > 0 },
		{ id: "sec-radii", label: "radii", visible: visibleRadiiEntries.length > 0 },
		{
			id: "sec-utilities",
			label: "utilities",
			visible: visibleUtilities.length > 0 || showEmptyUtilitiesSection,
		},
		{ id: "sec-theme-vars", label: "CSS tokens", visible: themeVisible || showEmptyThemeSection },
	].filter((link) => link.visible);
	const visibleSectionIds = sectionLinks.map((link) => link.id);
	const visibleSectionKey = visibleSectionIds.join("|");
	const totalCount =
		d.tokenSections.reduce((count, section) => count + section.entries.length, 0) +
		d.utilities.length +
		d.themeVars.length;
	const matchCount =
		visibleColorEntries.length +
		visibleSemanticEntries.length +
		visibleFontSizeEntries.length +
		visibleWeightEntries.length +
		visibleFamilyEntries.length +
		visibleLineHeightEntries.length +
		visibleTrackingEntries.length +
		visibleSpacingEntries.length +
		visibleRadiiEntries.length +
		visibleUtilities.length +
		visibleThemeGroups.reduce((count, [, vars]) => count + vars.length, 0);
	const sectionTarget = (section: string): InspectorUrlState => ({
		tab: "tokens",
		query: "",
		section,
	});
	const componentNode = props.data.tokenGraph.nodes.find((node) => node.tier === "component");
	const graphNode = componentNode?.id ?? mostConnectedTokenId(props.data.tokenGraph) ?? undefined;
	const relationshipsTarget: InspectorUrlState = {
		tab: "tokens",
		query: "",
		section: "relationships",
		...(graphNode === undefined ? {} : { relationshipNode: graphNode }),
	};
	const [activeSection, setActiveSection] = useState(props.section ?? visibleSectionIds[0] ?? null);

	useEffect(() => {
		if (typeof IntersectionObserver === "undefined") return;
		const elements = visibleSectionIds
			.map((id) => document.getElementById(id))
			.filter((element): element is HTMLElement => element !== null);
		if (elements.length === 0) return;
		const observer = new IntersectionObserver(
			(entries) => {
				const visible = entries
					.filter((entry) => entry.isIntersecting)
					.toSorted((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
				const next = visible[0]?.target.id;
				if (next !== undefined) setActiveSection(next);
			},
			{ rootMargin: "-92px 0px -60% 0px", threshold: [0, 1] },
		);
		for (const element of elements) observer.observe(element);
		return () => observer.disconnect();
	}, [visibleSectionKey]);

	useEffect(() => {
		if (props.section === null || !visibleSectionIds.includes(props.section)) return;
		setActiveSection(props.section);
		requestAnimationFrame(() =>
			document
				.getElementById(props.section!)
				?.scrollIntoView({ behavior: "smooth", block: "start" }),
		);
	}, [props.section, visibleSectionKey]);

	return (
		<>
			<section
				className={uiCss.class({
					display: "grid",
					gridTemplateColumns: "repeat(auto-fit, minmax(215px, 1fr))",
					gap: 12,
					marginBottom: 6,
				})}
			>
				<Card
					label="CSS tokens"
					help={
						<p>
							CSS custom properties found in the project’s stylesheets, including imported theme
							files and scoped overrides. This is separate from the named token groups provided by
							the preset.
						</p>
					}
					value={
						<InspectorLink
							target={sectionTarget("sec-theme-vars")}
							navigateTo={props.navigateTo}
							label={`Show ${d.themeVars.length} CSS tokens`}
						>
							{d.themeVars.length}
						</InspectorLink>
					}
				/>
				<Card
					label="Style utilities"
					help={
						<p>
							The generated TypeScript definitions describe which values each styling utility
							accepts, providing editor completions and catching unsupported values. Some utilities
							also allow custom CSS values.
						</p>
					}
					value={
						<InspectorLink
							target={sectionTarget("sec-utilities")}
							navigateTo={props.navigateTo}
							label={`Show ${d.utilities.length} style utilities`}
						>
							{d.utilities.length}
						</InspectorLink>
					}
				/>
				<Card
					label="Utility behavior"
					help={
						<ul>
							<li>
								<strong>Conditions</strong> add context such as hover or responsive breakpoints.
							</li>
							<li>
								<strong>Conflict groups</strong> tell <code>cx()</code> which utilities override
								each other.
							</li>
							<li>
								<strong>Compositions</strong> group related utilities, such as translate or scale
								directions.
							</li>
						</ul>
					}
					value={
						<div
							className={uiCss.class({
								display: "grid",
								gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
								gap: 8,

								"& > div": { minWidth: 0 },
								"& > div > span": {
									display: "block",
									marginTop: 2,
									color: "var(--muted)",
									fontSize: 10,
									fontWeight: 400,
									letterSpacing: "normal",
									lineHeight: 1.25,
								},
							})}
						>
							<div>
								<InspectorLink
									target={sectionTarget("sec-utilities")}
									navigateTo={props.navigateTo}
									label={`Show utility definitions for ${d.variantCount} conditions`}
								>
									{d.variantCount}
								</InspectorLink>
								<span>conditions</span>
							</div>
							<div>
								<InspectorLink
									target={sectionTarget("sec-utilities")}
									navigateTo={props.navigateTo}
									label={`Show utility definitions for ${d.conflictUtilities} conflict groups`}
								>
									{d.conflictUtilities}
								</InspectorLink>
								<span>conflict groups</span>
							</div>
							<div>
								<InspectorLink
									target={sectionTarget("sec-utilities")}
									navigateTo={props.navigateTo}
									label={`Show utility definitions for ${d.composeUtilities} compositions`}
								>
									{d.composeUtilities}
								</InspectorLink>
								<span>compositions</span>
							</div>
						</div>
					}
				/>
				<Card
					label="Tailwind mappings"
					help={
						<p>
							An optional generated mapping connects a CSS property and resolved value to a Tailwind
							class. It is used only when a project selects the Tailwind adapter.
						</p>
					}
					value={
						<InspectorLink
							target={relationshipsTarget}
							navigateTo={props.navigateTo}
							label={`Inspect ${d.bridgeProperties} Tailwind CSS property mappings`}
						>
							{d.bridgeProperties}
						</InspectorLink>
					}
					sub={
						<InspectorLink
							target={relationshipsTarget}
							navigateTo={props.navigateTo}
							label={`Inspect ${d.bridgeMappings} Tailwind property and value mappings`}
						>
							{d.bridgeMappings.toLocaleString()} property/value mappings
						</InspectorLink>
					}
				/>
			</section>

			<SearchControl
				query={props.query}
				queryChange={props.queryChange}
				matchCount={matchCount}
				totalCount={totalCount}
			/>

			{sectionLinks.length > 0 && (
				<nav
					className={uiCss.class({
						display: "flex",
						flexWrap: "wrap",
						gap: 14,
						margin: "0 0 6px",
						fontSize: 12.5,

						"& a": { color: "var(--muted)", textDecoration: "none", padding: "2px 0" },
						"& a:hover": { color: "var(--accent)" },
						"& a[aria-current='true']": { color: "var(--accent)", fontWeight: 650 },
					})}
				>
					{sectionLinks.map((link) => (
						<a
							key={link.id}
							className={uiCss.class({ borderBottom: "1px solid transparent" })}
							href={`#tokens/${link.id}`}
							aria-current={activeSection === link.id ? "true" : undefined}
							onClick={(event) => {
								event.preventDefault();
								props.sectionChange(link.id);
								document
									.getElementById(link.id)
									?.scrollIntoView({ behavior: "smooth", block: "start" });
							}}
						>
							{link.label}
						</a>
					))}
				</nav>
			)}

			{visibleColorEntries.length > 0 && (
				<ColorSwatches
					section={{ id: "sec-colors", label: "Colors", entries: visibleColorEntries }}
					rawColors={rawColors}
					matches={() => true}
				/>
			)}
			{visibleSemanticEntries.length > 0 && (
				<ColorSwatches
					section={{
						id: "sec-semantic",
						label: "Semantic tokens",
						entries: visibleSemanticEntries,
					}}
					rawColors={rawColors}
					matches={() => true}
				/>
			)}

			{typographyVisible && (
				<section id="sec-typography">
					<h2>Typography — font sizes at real size</h2>
					{visibleFontSizeEntries.length > 0 && (
						<div
							className={uiCss.class({
								display: "flex",
								flexDirection: "column",
								gap: 4,
								background: "var(--panel)",
								border: "1px solid var(--line)",
								borderRadius: 9,
								padding: "10px 14px",
							})}
						>
							{visibleFontSizeEntries.map((e) => (
								<div
									className={uiCss.class({
										display: "flex",
										alignItems: "baseline",
										gap: 16,
										padding: "6px 0",
										borderBottom: "1px dashed var(--line)",
										minWidth: 0,

										"&:last-child": { borderBottom: "none" },
										"@media (max-width: 900px)": { flexWrap: "wrap" },
									})}
									key={e.name}
								>
									<span
										{...uiCss.props(
											uiCss.class({
												flex: 1,
												whiteSpace: "nowrap",
												overflow: "hidden",
												textOverflow: "ellipsis",
											}),
											uiCss.vars({ fontSize: e.value }),
										)}
									>
										Ag {FONT_SIZE_SAMPLE}
									</span>
									<code>
										{e.name} · {e.value}
									</code>
									<CopyButton text={e.name} />
								</div>
							))}
						</div>
					)}

					{visibleWeightEntries.length > 0 && (
						<>
							<h3>weights</h3>
							<div className={uiCss.class({ display: "flex", flexWrap: "wrap", gap: 8 })}>
								{visibleWeightEntries.map((e) => (
									<span
										{...uiCss.props(
											uiCss.class({
												background: "color-mix(in srgb, currentColor 8%, transparent)",
												border: "1px solid var(--line)",
												borderRadius: 6,
												padding: "2px 8px",
												fontSize: 12,
												fontFamily: "var(--mono)",
											}),
											uiCss.vars({ fontWeight: Number(e.value) }),
										)}
										key={e.name}
									>
										{e.name} {e.value}
									</span>
								))}
							</div>
						</>
					)}

					{visibleFamilyEntries.length > 0 && (
						<>
							<h3>families</h3>
							<div>
								{visibleFamilyEntries.map((e) => (
									<div
										className={uiCss.class({
											display: "flex",
											alignItems: "baseline",
											gap: 16,
											padding: "6px 0",
											borderBottom: "1px dashed var(--line)",
											minWidth: 0,

											"&:last-child": { borderBottom: "none" },
											"@media (max-width: 900px)": { flexWrap: "wrap" },
										})}
										key={e.name}
									>
										<span
											{...uiCss.props(
												uiCss.class({
													flex: 1,
													whiteSpace: "nowrap",
													overflow: "hidden",
													textOverflow: "ellipsis",
												}),
												uiCss.vars({ fontFamily: e.value }),
											)}
										>
											{e.name}: Ag 0123456789
										</span>
										<code>{e.value}</code>
									</div>
								))}
							</div>
						</>
					)}

					{(visibleLineHeightEntries.length > 0 || visibleTrackingEntries.length > 0) && (
						<InspectorTable
							title="line heights & letter spacings"
							rows={[
								...visibleLineHeightEntries.map((entry) => ({
									...entry,
									id: `line-height:${entry.name}`,
									kind: "line height",
								})),
								...visibleTrackingEntries.map((entry) => ({
									...entry,
									id: `letter-spacing:${entry.name}`,
									kind: "letter spacing",
								})),
							]}
							rowKey={(row) => row.id}
							columns={[
								{ id: "kind", label: "kind", value: (row) => row.kind },
								{
									id: "name",
									label: "token",
									value: (row) => row.name,
									render: (row) => <code>{row.name}</code>,
								},
								{ id: "value", label: "value", value: (row) => row.value },
								{
									id: "sample",
									label: "sample",
									value: () => "Hamburgefonstiv 0123",
									render: (row) => (
										<span
											{...uiCss.props(
												uiCss.vars(
													row.kind === "letter spacing"
														? { letterSpacing: row.value }
														: { lineHeight: row.value },
												),
											)}
										>
											Hamburgefonstiv 0123
										</span>
									),
								},
							]}
							filters={[{ id: "kind", label: "kind", value: (row) => row.kind }]}
						/>
					)}
				</section>
			)}

			{visibleSpacingEntries.length > 0 && (
				<section id="sec-spacing">
					<h2>Spacing scale</h2>
					{(() => {
						const px = visibleSpacingEntries.map((e) => ({
							...e,
							n: Number.parseFloat(e.value) || 0,
						}));
						const max = Math.max(...px.map((p) => p.n), 1);
						return px.map((p) => (
							<Bar
								key={p.name}
								label={`${stripDollar(p.name)} (${p.value})`}
								value={p.n}
								max={max}
								suffix="px"
							/>
						));
					})()}
				</section>
			)}

			{visibleRadiiEntries.length > 0 && (
				<section id="sec-radii">
					<h2>Radii</h2>
					<div className={uiCss.class({ display: "flex", flexWrap: "wrap", gap: 18 })}>
						{visibleRadiiEntries.map((e) => (
							<div
								className={uiCss.class({
									display: "flex",
									flexDirection: "column",
									alignItems: "center",
									gap: 5,
									fontSize: 12,
									color: "var(--muted)",
								})}
								key={e.name}
							>
								<div
									{...uiCss.props(
										uiCss.class({
											width: 74,
											height: 74,
											background: "linear-gradient(135deg, var(--accent-dim), var(--accent))",
											opacity: 0.85,
											border: "1px solid var(--line-strong)",
										}),
										uiCss.vars({ borderRadius: e.value === "9999px" ? "9999px" : e.value }),
									)}
								/>
								<span>{e.name}</span>
								<code>{e.value}</code>
							</div>
						))}
					</div>
				</section>
			)}

			{(visibleUtilities.length > 0 || showEmptyUtilitiesSection) && (
				<section id="sec-utilities">
					{visibleUtilities.length === 0 ? (
						<p className={uiCss.class({ color: "var(--muted, #888)" })}>
							No style utilities were found.
						</p>
					) : (
						<InspectorTable
							title="style utilities"
							rows={visibleUtilities}
							rowKey={(utility) => utility.key}
							columns={[
								{ id: "key", label: "key", value: (utility) => utility.key },
								{ id: "values", label: "values", value: (utility) => utility.count },
								{
									id: "sample",
									label: "sample",
									value: (utility) => utility.sample.join(", "),
								},
								{
									id: "open",
									label: "open",
									value: (utility) => (utility.openEnded ? "open ended" : "fixed"),
									render: (utility) => (utility.openEnded ? "∞" : "—"),
								},
							]}
							filters={[
								{
									id: "open",
									label: "values",
									value: (utility) => (utility.openEnded ? "open ended" : "fixed"),
								},
							]}
						/>
					)}
				</section>
			)}

			{(themeVisible || showEmptyThemeSection) && (
				<section id="sec-theme-vars">
					<h2>CSS tokens by category</h2>
					{showEmptyThemeSection ? (
						<p className={uiCss.class({ color: "var(--muted, #888)" })}>
							No CSS tokens were found.
						</p>
					) : (
						visibleThemeGroups
							.filter(([, vars]) => vars.length > 0)
							.map(([category, vars]) => (
								<div key={category}>
									<InspectorTable
										title={`${category} · ${vars.length}`}
										rows={vars}
										rowKey={(variable) => `${variable.scope ?? ":root"}:${variable.name}`}
										columns={[
											{
												id: "name",
												label: "variable",
												value: (variable) => variable.name,
												render: (variable) => (
													<>
														{categorizeColor(variable) !== null && (
															<span
																{...uiCss.props(
																	uiCss.class({
																		display: "inline-block",
																		width: 11,
																		height: 11,
																		borderRadius: 3,
																		marginRight: 7,
																		verticalAlign: "-1px",
																		border: "1px solid rgba(255, 255, 255, 0.18)",
																	}),
																	uiCss.vars({ background: categorizeColor(variable) ?? "" }),
																)}
															/>
														)}
														<code>{variable.name}</code>
														{variable.scope !== undefined && <small> · {variable.scope}</small>}
													</>
												),
											},
											{
												id: "scope",
												label: "scope",
												value: (variable) => variable.scope ?? ":root",
											},
											{ id: "value", label: "value", value: (variable) => variable.value },
										]}
										filters={[
											{
												id: "scope",
												label: "scope",
												value: (variable) => variable.scope ?? ":root",
											},
										]}
									/>
								</div>
							))
					)}
				</section>
			)}
			{props.query !== "" && matchCount === 0 && (
				<p
					className={uiCss.class({
						display: "flex",
						alignItems: "center",
						gap: 12,
						padding: "48px 0",
						color: "var(--muted)",
						justifyContent: "center",
					})}
				>
					No visible inspector data matches “{props.query}”.
				</p>
			)}
		</>
	);
}

/* ------------------------------ class drill-down ------------------------------ */

function ClassDrillDown(props: { data: InspectorPayload }) {
	const [open, setOpen] = useState<string | null>(null);
	const [query, setQuery] = useState("");
	const normalizedQuery = query.trim().toLocaleLowerCase();
	const entries = props.data.classDrillDown.filter(
		(entry) =>
			normalizedQuery === "" ||
			entry.candidate.toLocaleLowerCase().includes(normalizedQuery) ||
			entry.rules.some((rule) =>
				`${rule.selector} ${rule.declarations}`.toLocaleLowerCase().includes(normalizedQuery),
			),
	);

	if (props.data.classDrillDown.length === 0) return null;

	const categoryForProperty = (property: string) => {
		if (property.startsWith("--tw-space-") || /^(margin|padding|inset)(-|$)/.test(property)) {
			return "Spacing";
		}
		if (
			property === "gap" ||
			property === "row-gap" ||
			property === "column-gap" ||
			property.startsWith("scroll-margin") ||
			property.startsWith("scroll-padding")
		) {
			return "Spacing";
		}
		if (property === "--tw-font-weight" || property === "--tw-leading") return "Typography";
		if (
			property === "color" ||
			property.startsWith("background-") ||
			property === "accent-color" ||
			property === "caret-color" ||
			property === "fill" ||
			property === "stroke" ||
			property === "border-color" ||
			property === "outline-color" ||
			property === "text-decoration-color" ||
			property === "--tw-ring-color"
		) {
			return "Color";
		}
		if (/^(border|border-radius|outline)(-|$)/.test(property)) return "Borders & shape";
		if (
			property.startsWith("--tw-border-") ||
			property.startsWith("font-") ||
			property.startsWith("text-") ||
			property === "line-height" ||
			property === "letter-spacing" ||
			property === "word-spacing" ||
			property === "white-space" ||
			property === "word-break" ||
			property === "hyphens"
		) {
			return property.startsWith("--tw-border-") ? "Borders & shape" : "Typography";
		}
		if (
			property.startsWith("--tw-shadow") ||
			property.startsWith("--tw-ring-") ||
			property === "box-shadow" ||
			property === "text-shadow" ||
			property === "opacity" ||
			property === "filter" ||
			property.startsWith("backdrop-") ||
			property === "mix-blend-mode"
		) {
			return "Effects";
		}
		if (property.startsWith("transition-") || property === "animation") return "Motion";
		if (
			property === "cursor" ||
			property === "pointer-events" ||
			property === "user-select" ||
			property === "resize" ||
			property === "touch-action"
		) {
			return "Interaction";
		}
		if (
			property === "display" ||
			property.startsWith("flex-") ||
			property.startsWith("grid-") ||
			property.startsWith("align-") ||
			property.startsWith("justify-") ||
			property.startsWith("place-") ||
			property === "position" ||
			property === "z-index" ||
			property.startsWith("overflow") ||
			/^(width|height|min-width|max-width|min-height|max-height)$/.test(property) ||
			property === "aspect-ratio" ||
			property === "object-fit"
		) {
			return "Layout";
		}
		return "Other";
	};
	const groupsByCategory = new Map<string, Array<(typeof entries)[number]>>();
	const categoryOrder = [
		"Spacing",
		"Layout",
		"Color",
		"Typography",
		"Borders & shape",
		"Effects",
		"Motion",
		"Interaction",
		"Other",
	];
	for (const entry of entries) {
		const properties = new Set<string>();
		for (const rule of entry.rules) {
			for (const line of rule.declarations.split("\n")) {
				const declaration = line.trim();
				const separator = declaration.indexOf(":");
				if (!declaration.endsWith(";") || separator < 1) continue;
				const property = declaration.slice(0, separator).trim();
				if (/^[-\w]+$/.test(property)) properties.add(property);
			}
		}
		const categoryCounts = new Map<string, number>();
		for (const property of properties) {
			const category = categoryForProperty(property);
			categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
		}
		const category =
			[...categoryCounts.entries()].toSorted(
				(left, right) =>
					right[1] - left[1] || categoryOrder.indexOf(left[0]) - categoryOrder.indexOf(right[0]),
			)[0]?.[0] ?? "Other";
		const group = groupsByCategory.get(category) ?? [];
		group.push(entry);
		groupsByCategory.set(category, group);
	}
	const groups = [...groupsByCategory.entries()]
		.map(([key, groupEntries]) => ({ key, entries: groupEntries }))
		.toSorted(
			(left, right) =>
				right.entries.length - left.entries.length || left.key.localeCompare(right.key),
		);

	return (
		<section>
			<h2>class drill-down — grouped by CSS concern</h2>
			<p>related utilities share a group. select a class to inspect the CSS rules it emits.</p>
			<label className={uiCss.class({ display: "grid", flex: "1 1 230px", minWidth: 180 })}>
				<span
					className={uiCss.class({
						position: "absolute",
						width: 1,
						height: 1,
						padding: 0,
						margin: -1,
						overflow: "hidden",
						clipPath: "inset(50%)",
						whiteSpace: "nowrap",
						border: 0,
					})}
				>
					Search class candidates
				</span>
				<input
					className={uiCss.class({
						width: "100%",
						padding: "8px 13px",
						font: "inherit",
						background: "var(--panel)",
						color: "var(--text)",
						border: "1px solid var(--line)",
						borderRadius: 7,
						outline: "none",
						"&:focus": { borderColor: "var(--accent-dim)" },
					})}
					type="search"
					value={query}
					placeholder="Search classes, properties, or CSS…"
					aria-label="Search classes, CSS properties, or emitted rules"
					onChange={(event) => setQuery(event.target.value)}
				/>
			</label>
			<p className={uiCss.class({ color: "var(--muted, #888)" })} role="status" aria-live="polite">
				{entries.length} of {props.data.classDrillDown.length} candidates · {groups.length} CSS
				groups
			</p>
			<div className={uiCss.class({ display: "flex", flexDirection: "column", gap: 8 })}>
				{groups.map((group) => {
					const groupEntries = group.entries.toSorted((left, right) =>
						left.candidate.localeCompare(right.candidate),
					);
					const selectedEntry = groupEntries.find((entry) => entry.candidate === open);
					const ruleCount = group.entries.reduce((total, entry) => total + entry.rules.length, 0);
					return (
						<details
							key={group.key}
							className={uiCss.class({
								background: "var(--panel)",
								border: "1px solid var(--line)",
								borderRadius: 8,

								"&[open] > summary": {
									borderBottom: "1px solid var(--line)",
									borderRadius: "8px 8px 0 0",
								},
								"&[open] > summary::before": { content: "'▾'" },
							})}
							open={group.key === groups[0]?.key}
						>
							<summary
								className={uiCss.class({
									display: "flex",
									alignItems: "center",
									flexWrap: "wrap",
									gap: 8,
									cursor: "pointer",
									listStyle: "none",
									padding: "10px 13px",

									"&::-webkit-details-marker": { display: "none" },
									"&::before": {
										content: "'▸'",
										color: "var(--accent)",
										fontFamily: "var(--mono)",
									},
									"&:hover": { background: "var(--panel-hover)" },
									"& strong": {
										fontFamily: "var(--mono)",
										fontSize: 12,
										overflowWrap: "anywhere",
									},
								})}
							>
								<strong>{group.key}</strong>
								<span
									className={uiCss.class({
										marginLeft: "auto",
										color: "var(--muted)",
										fontSize: 12,
									})}
								>
									{group.entries.length} classes · {ruleCount} rules
								</span>
							</summary>
							<div
								className={uiCss.class({
									display: "grid",
									gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))",
									gap: 8,
									padding: 10,
								})}
							>
								{groupEntries.map((entry) => (
									<button
										key={entry.candidate}
										type="button"
										className={uiCss.class({
											display: "flex",
											alignItems: "center",
											justifyContent: "space-between",
											gap: 10,
											width: "100%",
											minWidth: 0,
											padding: "9px 11px",
											textAlign: "left",
											color: "var(--text)",
											background: "var(--bg)",
											border: "1px solid var(--line)",
											borderRadius: 7,
											cursor: "pointer",

											"&:hover": {
												borderColor: "var(--line-strong)",
												background: "var(--panel-hover)",
											},
											"&[aria-expanded='true']": {
												borderColor: "var(--accent)",
												background: "var(--accent-dim)",
											},
											"& code": {
												minWidth: 0,
												overflow: "hidden",
												textOverflow: "ellipsis",
												whiteSpace: "nowrap",
											},
											"& span": { flexShrink: 0, color: "var(--muted)", fontSize: 11 },
										})}
										aria-expanded={open === entry.candidate}
										onClick={() => setOpen(open === entry.candidate ? null : entry.candidate)}
									>
										<code>{entry.candidate}</code>
										<span>{entry.rules.length} rules</span>
									</button>
								))}
							</div>
							{selectedEntry !== undefined && (
								<pre
									className={uiCss.class({
										maxHeight: 360,
										margin: "0 10px 10px",
										padding: 12,
										overflow: "auto",
										background: "var(--bg)",
										border: "1px solid var(--line)",
										borderRadius: 7,
										fontSize: 12,
									})}
								>
									{selectedEntry.rules
										.map((rule) => `${rule.selector} {\n  ${rule.declarations}\n}`)
										.join("\n")}
								</pre>
							)}
						</details>
					);
				})}
			</div>
		</section>
	);
}

/* ---------------------------------- stats tab ---------------------------------- */

function HistoryView(props: {
	list: Array<HistoryListItem> | null;
	error: string | null;
	diffPair: { a: string; b: string } | null;
	diffData: { a: HistoryEntry; b: HistoryEntry } | null;
	setDiffPair: (pair: { a: string; b: string }) => void;
	loadDiff: (a: string, b: string) => void;
	retry: () => void;
}) {
	return (
		<div>
			{props.error !== null && (
				<div
					className={uiCss.class({
						display: "flex",
						alignItems: "center",
						gap: 12,
						padding: "48px 0",
						color: "var(--muted)",
						justifyContent: "center",
					})}
					role="alert"
				>
					<div>
						<p className={uiCss.class({ color: "var(--bad)" })}>{props.error}</p>
						<p className={uiCss.class({ color: "var(--muted, #888)" })}>
							The Inspector could not read saved runs. Check the Inspector server, then retry.
						</p>
						<button type="button" onClick={props.retry}>
							retry history
						</button>
					</div>
				</div>
			)}
			{(props.list ?? []).length < 2 && props.error === null && (
				<p className={uiCss.class({ color: "var(--muted, #888)" })}>
					need at least 2 runs — hit refresh to snapshot another one.
				</p>
			)}
			{props.diffPair !== null && props.diffPair.a === props.diffPair.b && (
				<p className={uiCss.class({ color: "var(--muted, #888)" })}>
					select two different runs to compare
				</p>
			)}
			<section>
				<h2>runs</h2>
				{(props.list ?? []).map((run) => (
					<label key={run.timestamp} className={uiCss.class({ display: "block", margin: "4px 0" })}>
						<input
							type="radio"
							name="hist-a"
							checked={props.diffPair?.a === run.timestamp}
							onChange={() =>
								props.setDiffPair({ a: run.timestamp, b: props.diffPair?.b ?? run.timestamp })
							}
						/>
						{" A "}
						<input
							type="radio"
							name="hist-b"
							checked={props.diffPair?.b === run.timestamp}
							onChange={() =>
								props.setDiffPair({ b: run.timestamp, a: props.diffPair?.a ?? run.timestamp })
							}
						/>
						{" B — "}
						{run.timestamp}
					</label>
				))}
				<button
					disabled={props.diffPair === null || props.diffPair.a === props.diffPair.b}
					onClick={() => props.diffPair && props.loadDiff(props.diffPair.a, props.diffPair.b)}
				>
					compare
				</button>
			</section>
			{props.diffData !== null &&
				(() => {
					const d = diffRuns(props.diffData.a, props.diffData.b);
					return (
						<section>
							<InspectorTable
								title={`diff — older (${props.diffData.a.timestamp}) → newer (${props.diffData.b.timestamp})`}
								rows={[
									...d.coverage.map((metric) => ({
										id: `coverage:${metric.label}`,
										group: "coverage",
										label: metric.label,
										before: metric.before,
										after: metric.after,
										delta: metric.delta,
									})),
									...d.budget.map((metric) => ({
										id: `budget:${metric.label}`,
										group: "budget",
										label: metric.label,
										before: metric.before,
										after: metric.after,
										delta: metric.delta,
									})),
									{
										id: "missing-css",
										group: "missing css",
										label: "missing-css delta",
										before: null,
										after: null,
										delta: d.missingCssDelta,
									},
								]}
								rowKey={(metric) => metric.id}
								columns={[
									{ id: "metric", label: "metric", value: (metric) => metric.label },
									{ id: "before", label: "before", value: (metric) => metric.before },
									{ id: "after", label: "after", value: (metric) => metric.after },
									{
										id: "delta",
										label: "delta",
										value: (metric) => metric.delta,
										render: (metric) => `${metric.delta > 0 ? "+" : ""}${metric.delta}`,
									},
								]}
								filters={[{ id: "group", label: "group", value: (metric) => metric.group }]}
								defaultSort={{ columnId: "metric", direction: "ascending" }}
							/>
							{(d.resolvedDead.length > 0 || d.newDead.length > 0) && (
								<>
									<h3>dead candidates</h3>
									{d.resolvedDead.length > 0 && (
										<p className={uiCss.class({ color: "var(--good, #4ade80)" })}>
											resolved: {d.resolvedDead.join(", ")}
										</p>
									)}
									{d.newDead.length > 0 && (
										<p className={uiCss.class({ color: "var(--warn, #fbbf24)" })}>
											new: {d.newDead.join(", ")}
										</p>
									)}
								</>
							)}
						</section>
					);
				})()}
		</div>
	);
}

function StatsView(props: {
	data: InspectorPayload;
	state: InspectorUrlState;
	navigateTo: (state: InspectorUrlState) => void;
	buildFiltersChange: (filters: InspectorBuildFilters | undefined) => void;
}) {
	const c = props.data.coverage;
	const valueCoverageByFile = new Map(
		(props.data.analytics?.fileValueCoverage ?? []).map((coverage) => [
			projectRelativeFile(props.data.meta.root, coverage.file),
			coverage,
		]),
	);
	const fileGroups = {
		full: c.files.filter((file) => buildFileStatus(file) === "full").length,
		partial: c.files.filter((file) => buildFileStatus(file) === "partial").length,
		runtime: c.files.filter((file) => buildFileStatus(file) === "runtime").length,
		noCalls: c.files.filter((file) => buildFileStatus(file) === "no-calls").length,
		eliminated: c.files.filter((file) => file.cxCalls > 0 && file.cxRuntime === 0).length,
		withCalls: c.files.filter((file) => file.cxCalls > 0).length,
	};
	const valueCoverage = props.data.analytics?.valueCoverage;
	const maxPrefix = Math.max(...c.budget.perPrefix.map((p) => p.rules), 1);
	const filtersFor = (values: Partial<InspectorBuildFilters> = {}): InspectorBuildFilters => ({
		fold: values.fold ?? null,
		missingCss: values.missingCss ?? null,
		authoredValue: values.authoredValue ?? null,
	});
	const activeFilters = props.state.buildFilters;
	const tableFilterValues: Record<string, string> = {};
	if (activeFilters?.fold !== null && activeFilters?.fold !== undefined)
		tableFilterValues.fold = activeFilters.fold;
	if (activeFilters?.missingCss !== null && activeFilters?.missingCss !== undefined)
		tableFilterValues.missingCss = activeFilters.missingCss;
	if (activeFilters?.authoredValue !== null && activeFilters?.authoredValue !== undefined)
		tableFilterValues.authoredValue = activeFilters.authoredValue;
	const hasActiveTableFilters = Object.keys(tableFilterValues).length > 0;
	const foldLink = (outcome: BuildFileFilter, count: number, unit: "calls" | "files" = "files") => {
		const noun = unit === "calls" ? "call" : "file";
		const callKind =
			outcome === "has-full" ? "full" : outcome === "has-partial" ? "partial" : outcome;
		const quantity =
			unit === "calls"
				? `${count} ${callKind} ${count === 1 ? noun : `${noun}s`}`
				: outcome === "no-calls"
					? `${count} ${count === 1 ? noun : `${noun}s`} without cx() calls`
					: outcome === "eliminated"
						? `${count} ${count === 1 ? noun : `${noun}s`} without runtime cx()`
						: `${count} ${outcome} ${count === 1 ? noun : `${noun}s`}`;
		const label =
			unit === "files" && (outcome === "no-calls" || outcome === "eliminated")
				? `Show ${quantity}`
				: unit === "calls"
					? `Show files containing ${callKind} calls (${quantity})`
					: `Show file rows with ${outcome} folding (${quantity})`;
		return (
			<BuildReportLink
				state={props.state}
				section="per-file-fold-coverage"
				filters={filtersFor({ fold: outcome })}
				navigateTo={props.navigateTo}
				label={label}
			>
				{quantity}
			</BuildReportLink>
		);
	};
	const authoredLink = (kind: BuildAuthoredValueFilter, count: number) => (
		<BuildReportLink
			state={props.state}
			section="per-file-fold-coverage"
			filters={filtersFor({ authoredValue: kind })}
			navigateTo={props.navigateTo}
			label={`Show files with ${kind} authored values (${count})`}
		>
			{count} {kind}
		</BuildReportLink>
	);

	return (
		<>
			<div className={uiCss.class({ display: "grid", gap: 12 })}>
				<section
					className={uiCss.class({
						marginTop: 0,
						"& h2": { marginTop: 0 },
					})}
				>
					<h2>build-time folding</h2>
					<div
						className={uiCss.class({
							display: "grid",
							gridTemplateColumns: "repeat(auto-fit, minmax(215px, 1fr))",
							gap: 12,
							marginBottom: 6,
						})}
					>
						<Card
							label="cx eliminated"
							value={
								<BuildReportLink
									state={props.state}
									section="per-file-fold-coverage"
									navigateTo={props.navigateTo}
									label={`View cx elimination by file (${c.eliminatedPct}%)`}
								>
									{c.eliminatedPct}%
								</BuildReportLink>
							}
							sub={
								<>
									{foldLink("has-full", c.fullFolded, "calls")} ·{" "}
									{foldLink("has-partial", c.partialFolded, "calls")} ·{" "}
									{foldLink("runtime", c.runtimeCalls, "calls")}
								</>
							}
						/>
						<Card
							label="files without runtime cx()"
							value={
								<BuildReportLink
									state={props.state}
									section="per-file-fold-coverage"
									filters={filtersFor({ fold: "eliminated" })}
									navigateTo={props.navigateTo}
									label={`Show files without runtime cx() (${c.entryEliminatedPct}%)`}
								>
									{c.entryEliminatedPct}%
								</BuildReportLink>
							}
							sub={
								<BuildReportLink
									state={props.state}
									section="per-file-fold-coverage"
									filters={filtersFor({ fold: "eliminated" })}
									navigateTo={props.navigateTo}
									label={`Show ${fileGroups.eliminated} of ${fileGroups.withCalls} files with cx calls and no runtime cx()`}
								>
									{fileGroups.eliminated} of {fileGroups.withCalls} files with cx calls
								</BuildReportLink>
							}
						/>
						<Card
							label="file outcomes"
							value={
								<BuildReportLink
									state={props.state}
									section="per-file-fold-coverage"
									navigateTo={props.navigateTo}
									label={`Show all ${c.files.length} file outcomes`}
								>
									{c.files.length}
								</BuildReportLink>
							}
							sub={
								<>
									{foldLink("full", fileGroups.full)} · {foldLink("partial", fileGroups.partial)} ·{" "}
									{foldLink("runtime", fileGroups.runtime)} ·{" "}
									{foldLink("no-calls", fileGroups.noCalls)}
								</>
							}
						/>
					</div>
				</section>
				<section
					className={uiCss.class({
						marginTop: 0,
						"& h2": { marginTop: 0 },
					})}
				>
					<h2>stylesheet budget</h2>
					<div
						className={uiCss.class({
							display: "grid",
							gridTemplateColumns: "repeat(auto-fit, minmax(215px, 1fr))",
							gap: 12,
							marginBottom: 6,
						})}
					>
						<Card
							label="css budget"
							value={
								<BuildReportLink
									state={props.state}
									section="css-budget"
									navigateTo={props.navigateTo}
									label={`View stylesheet budget (${InspectorApi.kb(c.budget.cssBytes)})`}
								>
									{InspectorApi.kb(c.budget.cssBytes)}
								</BuildReportLink>
							}
							sub={
								<>
									<BuildReportLink
										state={props.state}
										section="css-budget"
										navigateTo={props.navigateTo}
										label={`View gzip stylesheet size (${InspectorApi.kb(c.budget.cssGzipBytes)})`}
									>
										{InspectorApi.kb(c.budget.cssGzipBytes)} gzip
									</BuildReportLink>
									{" · "}
									<BuildReportLink
										state={props.state}
										section="css-budget"
										navigateTo={props.navigateTo}
										label={`View ${c.budget.rules} generated CSS rules`}
									>
										{c.budget.rules} rules
									</BuildReportLink>
								</>
							}
						/>
						<Card
							label="missing-css warnings"
							value={
								<BuildReportLink
									state={props.state}
									section="missing-css-sites"
									navigateTo={props.navigateTo}
									label={`View ${c.totalMissingCss} missing CSS warnings`}
								>
									{c.totalMissingCss}
								</BuildReportLink>
							}
							sub={
								<BuildReportLink
									state={props.state}
									section="dead-candidates"
									navigateTo={props.navigateTo}
									label={`View ${c.budget.deadCandidates} dead CSS candidates`}
								>
									dead candidates: {c.budget.deadCandidates}
								</BuildReportLink>
							}
						/>
						{valueCoverage !== undefined && (
							<Card
								label="tokenized authored values"
								value={
									<BuildReportLink
										state={props.state}
										section="per-file-fold-coverage"
										filters={filtersFor({ authoredValue: "token" })}
										navigateTo={props.navigateTo}
										label={`Show files with tokenized authored values (${valueCoverage.tokenPct}%)`}
									>
										{valueCoverage.tokenPct}%
									</BuildReportLink>
								}
								sub={
									<>
										{authoredLink("token", valueCoverage.tokenValues)} ·{" "}
										{authoredLink("literal", valueCoverage.literalValues)} ·{" "}
										{authoredLink("dynamic", valueCoverage.dynamicValues)}
									</>
								}
							/>
						)}
					</div>
				</section>
			</div>

			<section id="css-budget">
				<h2>css budget — rule distribution by prefix</h2>
				{c.budget.perPrefix.slice(0, 12).map((p) => (
					<Bar key={p.prefix} label={p.prefix} value={p.rules} max={maxPrefix} />
				))}
			</section>

			{c.shape !== undefined && (
				<section>
					<h2>stylesheet shape</h2>
					<p className={uiCss.class({ color: "var(--muted, #888)" })}>
						{c.shape.totalRules} rules · {InspectorApi.kb(c.shape.totalBytes)} compiled
					</p>
					{c.shape.categories.map((cat) => {
						const maxBytes = Math.max(...c.shape.categories.map((x) => x.bytes), 1);
						return (
							<div key={cat.category} className={uiCss.class({ marginBottom: 14 })}>
								<div
									className={uiCss.class({
										display: "flex",
										justifyContent: "space-between",
										alignItems: "baseline",
										marginBottom: 4,
										"& span": { color: "var(--muted, #888)", fontSize: 12 },
									})}
								>
									<strong>{cat.category}</strong>
									<span>
										{cat.rules} rules · {InspectorApi.kb(cat.bytes)}
									</span>
								</div>
								<Bar label="bytes" value={cat.bytes} max={maxBytes} />
								<div
									className={uiCss.class({
										display: "flex",
										flexWrap: "wrap",
										gap: 6,
										marginTop: 6,
									})}
								>
									{cat.topValues.map((tv) => (
										<span
											key={tv.value}
											className={uiCss.class({
												background: "color-mix(in srgb, currentColor 8%, transparent)",
												border: "1px solid var(--line)",
												borderRadius: 6,
												padding: "2px 8px",
												fontSize: 12,
												fontFamily: "var(--mono)",
											})}
										>
											{tv.value} ×{tv.count}
										</span>
									))}
								</div>
							</div>
						);
					})}
					<h3>specificity distribution</h3>
					{(() => {
						const maxSpec = Math.max(...c.shape.specificity.map((x) => x.rules), 1);
						return c.shape.specificity.map((b) => (
							<Bar key={b.label} label={`id:${b.label}`} value={b.rules} max={maxSpec} />
						));
					})()}
				</section>
			)}

			<InspectorTable
				id="per-file-fold-coverage"
				title="per-file fold coverage"
				rows={c.files}
				rowKey={(file) => file.file}
				columns={[
					{ id: "file", label: "file", value: (file) => file.file },
					{
						id: "eliminatedPct",
						label: "eliminated %",
						value: (file) => file.eliminatedPct,
						render: (file) => (
							<span className={uiCss.class({ fontFamily: "var(--mono)", fontSize: 13 })}>
								{file.eliminatedPct}%
							</span>
						),
					},
					{
						id: "foldCounts",
						label: "full / part / runtime",
						value: (file) => `${file.cxFoldedFull}/${file.cxFoldedPartial}/${file.cxRuntime}`,
					},
					{ id: "runtime", label: "runtime", value: (file) => file.cxRuntime },
					{
						id: "tokenLiteralDynamic",
						label: "token / literal / dynamic",
						value: (file) => {
							const coverage = valueCoverageByFile.get(file.file);
							return coverage === undefined
								? "—"
								: `${coverage.tokenValues} / ${coverage.literalValues} / ${coverage.dynamicValues}`;
						},
					},
					{ id: "missingCss", label: "missing CSS", value: (file) => file.missingCssCount },
				]}
				filters={[
					{
						id: "fold",
						label: "file status",
						options: [
							"eliminated",
							"full",
							"has-full",
							"partial",
							"has-partial",
							"runtime",
							"no-calls",
						],
						optionLabels: {
							eliminated: "without runtime cx()",
							full: "fully folded files",
							"has-full": "contains full folds",
							partial: "partially folded files",
							"has-partial": "contains partial folds",
							runtime: "runtime files",
							"no-calls": "no cx() calls",
						},
						value: (file) => buildFileStatus(file),
						matches: (file, selected) =>
							selected === "eliminated"
								? file.cxCalls > 0 && file.cxRuntime === 0
								: selected === "has-full"
									? file.cxFoldedFull > 0
									: selected === "has-partial"
										? file.cxFoldedPartial > 0
										: buildFileStatus(file) === selected,
					},
					{
						id: "missingCss",
						label: "missing CSS",
						value: (file) => (file.missingCssCount > 0 ? "present" : "none"),
					},
					{
						id: "authoredValue",
						label: "authored value",
						options: ["token", "literal", "dynamic"],
						value: () => null,
						matches: (file, selected) => {
							const coverage = valueCoverageByFile.get(file.file);
							if (coverage === undefined) return false;
							if (selected === "token") return coverage.tokenValues > 0;
							if (selected === "literal") return coverage.literalValues > 0;
							if (selected === "dynamic") return coverage.dynamicValues > 0;
							return false;
						},
					},
				]}
				filterValues={tableFilterValues}
				onFilterValuesChange={(values) => {
					const fold = values.fold;
					const missingCss = values.missingCss;
					const authoredValue = values.authoredValue;
					const nextFilters: InspectorBuildFilters = {
						fold:
							fold === "full" ||
							fold === "partial" ||
							fold === "runtime" ||
							fold === "no-calls" ||
							fold === "eliminated" ||
							fold === "has-full" ||
							fold === "has-partial"
								? fold
								: null,
						missingCss: missingCss === "present" || missingCss === "none" ? missingCss : null,
						authoredValue:
							authoredValue === "token" ||
							authoredValue === "literal" ||
							authoredValue === "dynamic"
								? authoredValue
								: null,
					};
					props.buildFiltersChange(
						Object.values(nextFilters).some((value) => value !== null) ? nextFilters : undefined,
					);
				}}
				defaultSort={{ columnId: "eliminatedPct", direction: "ascending" }}
				defaultOpen={hasActiveTableFilters || props.state.section === "per-file-fold-coverage"}
				tableClassName={uiCss.class({
					"& thead th": {
						position: "sticky",
						top: "var(--inspector-header-height)",
						zIndex: 1,
						background: "var(--panel)",
					},
				})}
			/>

			<ClassDrillDown data={props.data} />

			{props.data.cssSources.length > 0 && (
				<section>
					<h2>CSS-in-JS provenance</h2>
					<p className={uiCss.class({ color: "var(--muted, #888)" })}>
						Source calls and the semantic rules emitted for each call site.
					</p>
					<ul
						className={uiCss.class({
							listStyle: "none",
							padding: 0,
							margin: 0,
							background: "var(--panel)",
							border: "1px solid var(--line)",
							borderRadius: 9,

							"& li": { padding: "7px 13px", borderBottom: "1px solid var(--line)" },
							"& li:last-child": { borderBottom: "none" },
						})}
					>
						{props.data.cssSources.map((site) => (
							<li key={`${site.file}:${site.start}`}>
								<a
									href={InspectorApi.vscodeLinkAt(
										props.data.meta.root,
										site.file,
										site.line,
										site.column,
									)}
								>
									{site.file}:{site.line}:{site.column}
								</a>{" "}
								— <code>{site.callKind}</code> · {site.staticArguments} static /{" "}
								{site.dynamicArguments} dynamic
								{site.rules !== undefined && site.rules.length > 0 && (
									<ul>
										{site.rules.map((rule) => (
											<li key={rule.id}>
												<code>{rule.id}</code> <code>{rule.css}</code>
											</li>
										))}
									</ul>
								)}
							</li>
						))}
					</ul>
				</section>
			)}

			<section id="missing-css-sites">
				<h2>missing-css sites</h2>
				{c.missingCssSites.length === 0 ? (
					<p className={uiCss.class({ color: "var(--muted, #888)" })}>
						No missing-css sites found.
					</p>
				) : (
					<ul
						className={uiCss.class({
							listStyle: "none",
							padding: 0,
							margin: 0,
							background: "var(--panel)",
							border: "1px solid var(--line)",
							borderRadius: 9,

							"& li": { padding: "7px 13px", borderBottom: "1px solid var(--line)" },
							"& li:last-child": { borderBottom: "none" },
						})}
					>
						{c.missingCssSites.map((s) => (
							<li key={`${s.file}:${s.line}:${s.token}`}>
								<a href={InspectorApi.vscodeLink(props.data.meta.root, s.file, s.line)}>
									{s.file}:{s.line}
								</a>{" "}
								— no Tailwind candidate for <code>{s.token}</code>
							</li>
						))}
					</ul>
				)}
			</section>

			<section id="dead-candidates">
				<h2>dead CSS candidates</h2>
				{c.budget.deadSample.length === 0 ? (
					<p className={uiCss.class({ color: "var(--muted, #888)" })}>
						No dead CSS candidates found.
					</p>
				) : (
					<>
						<p className={uiCss.class({ color: "var(--muted, #888)" })}>
							{c.budget.deadCandidates} candidates · showing {c.budget.deadSample.length} sample
							{c.budget.deadSample.length === 1 ? "" : "s"}
						</p>
						<ul
							className={uiCss.class({
								listStyle: "none",
								padding: 0,
								margin: 0,
								background: "var(--panel)",
								border: "1px solid var(--line)",
								borderRadius: 9,

								"& li": { padding: "7px 13px", borderBottom: "1px solid var(--line)" },
								"& li:last-child": { borderBottom: "none" },
							})}
						>
							{c.budget.deadSample.map((candidate) => (
								<li key={candidate}>
									<code>{candidate}</code>
								</li>
							))}
						</ul>
					</>
				)}
			</section>

			{c.runtimeSites.length > 0 && (
				<section>
					<h2>runtime cx() sites</h2>
					<ul
						className={uiCss.class({
							listStyle: "none",
							padding: 0,
							margin: 0,
							background: "var(--panel)",
							border: "1px solid var(--line)",
							borderRadius: 9,

							"& li": { padding: "7px 13px", borderBottom: "1px solid var(--line)" },
							"& li:last-child": { borderBottom: "none" },
						})}
					>
						{c.runtimeSites.map((s) => (
							<li key={`${s.file}:${s.line}`}>
								<a href={InspectorApi.vscodeLink(props.data.meta.root, s.file, s.line)}>
									{s.file}:{s.line}
								</a>{" "}
								— {s.token}
							</li>
						))}
					</ul>
				</section>
			)}
		</>
	);
}

/* --------------------------------- token graph --------------------------------- */

const TIER_COLOR: Record<TokenTier, string> = {
	component: "#7c5cff",
	scope: "#d97706",
	semantic: "#0ea5e9",
	raw: "#64748b",
};
function TokenGraphView(props: {
	data: InspectorPayload;
	state: InspectorUrlState;
	navigateTo: (state: InspectorUrlState) => void;
}) {
	const data = props.data;
	const graph = data.tokenGraph;
	const requestedNode = graph.nodes.find((node) => node.id === props.state.relationshipNode);
	const initialId = requestedNode?.id ?? mostConnectedTokenId(graph);
	const initialNode = graph.nodes.find((node) => node.id === initialId);
	const [focusedId, setFocusedId] = useState<string | null>(initialId);
	const [searchValue, setSearchValue] = useState(
		initialNode === undefined ? "" : presentTokenNode(initialNode).label,
	);
	useEffect(() => {
		setFocusedId(initialId);
		setSearchValue(initialNode === undefined ? "" : presentTokenNode(initialNode).label);
	}, [initialId, initialNode]);
	const focusNode = (node: TokenGraph["nodes"][number]): void => {
		setFocusedId(node.id);
		setSearchValue(presentTokenNode(node).label);
		props.navigateTo({
			tab: "tokens",
			query: "",
			section: "relationships",
			anchor: "token-relationship-search-section",
			relationshipNode: node.id,
		});
	};
	const relationshipTarget = (
		options: { node?: string; anchor?: string } = {},
	): InspectorUrlState => ({
		tab: "tokens",
		query: "",
		section: "relationships",
		anchor: options.anchor ?? "token-relationship-search-section",
		...(options.node === undefined ? {} : { relationshipNode: options.node }),
	});
	const selectedId = graph.nodes.some((node) => node.id === focusedId) ? focusedId : initialId;
	const selectedNode = graph.nodes.find((node) => node.id === selectedId);
	const selectedPresentation = selectedNode === undefined ? null : presentTokenNode(selectedNode);
	const relationships =
		selectedNode === undefined ? null : getTokenRelationships(graph, selectedNode.id);
	const themeVar =
		selectedPresentation === null
			? undefined
			: data.designSystem.themeVars.find(
					(variable) =>
						variable.name === selectedPresentation.variableName &&
						(selectedPresentation.scope === null || variable.scope === selectedPresentation.scope),
				);
	const renderRelationList = (
		id: string,
		title: string,
		description: string,
		nodes: TokenGraph["nodes"],
		emptyMessage: string,
	) => (
		<section
			id={id}
			className={uiCss.class({
				minWidth: 0,
				background: "var(--panel)",
				border: "1px solid var(--line)",
				borderRadius: 10,
				padding: "12px 14px",
				"& h3": { margin: "0 0 2px" },
				"& p": { fontSize: 12, margin: "4px 0 12px" },
			})}
		>
			<h3>{title}</h3>
			<p className={uiCss.class({ color: "var(--muted, #888)" })}>{description}</p>
			{nodes.length > 0 ? (
				<ul
					className={uiCss.class({
						listStyle: "none",
						padding: 0,
						margin: 0,
						display: "grid",
						gap: 7,
					})}
				>
					{nodes.map((node) => {
						const presentation = presentTokenNode(node);
						return (
							<li key={node.id}>
								<button
									type="button"

									{...uiCss.props(
										uiCss.class({
											width: "100%",
											minWidth: 0,
											display: "flex",
											alignItems: "center",
											justifyContent: "space-between",
											gap: 8,
											textAlign: "left",
											background: "var(--bg-raised)",
											border: "1px solid var(--line-strong)",
											borderRadius: 7,
											padding: "8px 10px",

											"& code": {
												overflow: "hidden",
												textOverflow: "ellipsis",
												whiteSpace: "nowrap",
											},
											"&:hover": { background: "var(--panel-hover)" },
										}),
										uiCss.vars({ borderColor: TIER_COLOR[node.tier] }),
									)}
									aria-label={`Focus ${presentation.label}, ${node.tier} token`}
									onClick={() => focusNode(node)}
								>
									<code>{presentation.label}</code>
									<span
										className={uiCss.class({
											flexShrink: 0,
											color: "var(--muted)",
											fontSize: 10,
											textTransform: "uppercase",
											letterSpacing: "0.04em",
										})}
									>
										{node.tier}
									</span>
								</button>
							</li>
						);
					})}
				</ul>
			) : (
				<p
					className={uiCss.class({
						padding: "10px 12px",
						color: "var(--muted)",
						fontSize: 12,
						background: "var(--bg)",
						border: "1px dashed var(--line-strong)",
						borderRadius: 7,
					})}
				>
					{emptyMessage}
				</p>
			)}
		</section>
	);

	if (graph.nodes.length === 0) {
		return (
			<div
				id="relationships"
				className={uiCss.class({ maxWidth: 1180, margin: "0 auto", padding: "20px 24px 80px" })}
			>
				<h2>Token relationships</h2>
				<p className={uiCss.class({ color: "var(--muted, #888)" })}>
					No CSS tokens or component mappings were found.
				</p>
			</div>
		);
	}
	return (
		<div
			id="relationships"
			className={uiCss.class({ maxWidth: 1180, margin: "0 auto", padding: "20px 24px 80px" })}
		>
			<h2>Token relationships</h2>
			<p className={uiCss.class({ color: "var(--muted, #888)" })}>
				Follow direct references for one token at a time. Choose another token in either column to
				continue through the graph.
			</p>
			<section
				className={uiCss.class({
					display: "grid",
					gridTemplateColumns: "repeat(auto-fit, minmax(215px, 1fr))",
					gap: 12,
					marginBottom: 6,
				})}
			>
				<Card
					label="tokens and mappings"
					value={
						<InspectorLink
							target={relationshipTarget({ node: initialId ?? undefined })}
							navigateTo={props.navigateTo}
							label={`Inspect ${graph.nodes.length} tokens and mappings`}
						>
							{graph.nodes.length}
						</InspectorLink>
					}
				/>
				<Card
					label="direct references"
					value={
						<InspectorLink
							target={relationshipTarget({ node: initialId ?? undefined })}
							navigateTo={props.navigateTo}
							label={`Inspect ${graph.edges.length} direct references`}
						>
							{graph.edges.length}
						</InspectorLink>
					}
				/>
				<Card
					label="unlinked variables"
					value={
						<InspectorLink
							target={relationshipTarget({ node: graph.orphans[0] })}
							navigateTo={props.navigateTo}
							label={`Inspect ${graph.orphans.length} unlinked variables`}
						>
							{graph.orphans.length}
						</InspectorLink>
					}
					sub="not referenced by another token here"
				/>
				{(graph.cycles.length > 0 || graph.dangling.length > 0) && (
					<Card
						label="cycles / missing references"
						value={
							<InspectorLink
								target={relationshipTarget({ anchor: "token-graph-issues" })}
								navigateTo={props.navigateTo}
								label={`Inspect ${graph.cycles.length} cycles and ${graph.dangling.length} missing references`}
							>
								{graph.cycles.length} / {graph.dangling.length}
							</InspectorLink>
						}
					/>
				)}
			</section>
			<div
				id="token-relationship-search-section"
				className={uiCss.class({ display: "grid", gap: 6, maxWidth: 720, margin: "18px 0" })}
			>
				<label htmlFor="token-relationship-search">Find a token</label>
				<input
					id="token-relationship-search"
					className={uiCss.class({
						width: "100%",
						padding: "8px 13px",
						font: "inherit",
						background: "var(--panel)",
						color: "var(--text)",
						border: "1px solid var(--line)",
						borderRadius: 7,
						outline: "none",
						"&:focus": { borderColor: "var(--accent-dim)" },
					})}
					type="search"
					list="token-relationship-options"
					placeholder={`Search ${graph.nodes.length} token nodes…`}
					value={searchValue}
					aria-describedby="token-relationship-hint"
					onChange={(event) => {
						const value = event.target.value;
						setSearchValue(value);
						const match = graph.nodes.find(
							(node) => node.id === value || presentTokenNode(node).label === value,
						);
						if (match !== undefined) focusNode(match);
					}}
				/>
				<datalist id="token-relationship-options">
					{graph.nodes.map((node) => (
						<option key={node.id} value={presentTokenNode(node).label} label={node.tier} />
					))}
				</datalist>
				<p id="token-relationship-hint" className={uiCss.class({ color: "var(--muted, #888)" })}>
					Choose a suggestion to focus it. Each relationship link is also keyboard accessible.
				</p>
			</div>
			{selectedNode !== undefined && relationships !== null && (
				<div
					className={uiCss.class({
						display: "grid",
						gridTemplateColumns: "minmax(0, 1fr) minmax(230px, 0.9fr) minmax(0, 1fr)",
						alignItems: "start",
						gap: 12,
						"@media (max-width: 760px)": { gridTemplateColumns: "1fr" },
					})}
				>
					{renderRelationList(
						"token-graph-used-by",
						"Used by",
						"Mappings and tokens that refer to this token.",
						relationships.usedBy,
						"Nothing in the generated graph refers to this token.",
					)}
					<article
						className={uiCss.class({
							minWidth: 0,
							background: "linear-gradient(180deg, var(--bg-raised), var(--panel))",
							border: "1px solid var(--line-strong)",
							borderRadius: 10,
							padding: 16,

							"& h3": { margin: "8px 0", overflowWrap: "anywhere" },
							"& p": { fontSize: 12 },
						})}
					>
						<span
							{...uiCss.props(
								uiCss.class({
									flexShrink: 0,
									color: "var(--muted)",
									fontSize: 10,
									textTransform: "uppercase",
									letterSpacing: "0.04em",
								}),
								uiCss.vars({ color: TIER_COLOR[selectedNode.tier] }),
							)}
						>
							{selectedNode.tier} token
						</span>
						<h3>
							<code>{selectedPresentation?.label}</code>
						</h3>
						{themeVar !== undefined && (
							<code
								className={uiCss.class({
									display: "block",
									padding: 8,
									background: "var(--bg)",
									borderRadius: 6,
									overflowWrap: "anywhere",
								})}
							>
								{themeVar.value}
							</code>
						)}
						<p className={uiCss.class({ color: "var(--muted)", fontSize: 12, marginTop: 4 })}>
							<InspectorLink
								target={relationshipTarget({
									node: selectedNode.id,
									anchor: "token-graph-used-by",
								})}
								navigateTo={props.navigateTo}
								label={`Show ${relationships.usedBy.length} dependents for ${selectedPresentation?.label ?? selectedNode.id}`}
							>
								{relationships.usedBy.length} dependents
							</InspectorLink>
							{" · "}
							<InspectorLink
								target={relationshipTarget({
									node: selectedNode.id,
									anchor: "token-graph-references",
								})}
								navigateTo={props.navigateTo}
								label={`Show ${relationships.references.length} references for ${selectedPresentation?.label ?? selectedNode.id}`}
							>
								{relationships.references.length} references
							</InspectorLink>
						</p>
						{relationships.isCyclic && (
							<p className={uiCss.class({ color: "var(--warn, #fbbf24)" })}>
								Part of a cycle. The emitter skips cyclic references.
							</p>
						)}
						{relationships.isUnlinkedRaw && (
							<p className={uiCss.class({ color: "var(--muted, #888)" })}>
								No other graph node references this raw variable. It may still be used in source
								code; check Usage &amp; cleanup for application-level coverage.
							</p>
						)}
						<CopyButton
							text={
								selectedNode.tier === "scope"
									? (selectedPresentation?.variableName ?? selectedNode.id)
									: selectedNode.tier === "component"
										? selectedNode.label
										: selectedNode.id
							}
						/>
					</article>
					{renderRelationList(
						"token-graph-references",
						"References",
						"Tokens this value or component mapping depends on.",
						relationships.references,
						"This token does not reference another graph node.",
					)}
				</div>
			)}
			<section id="token-graph-issues">
				<h3>Graph issues</h3>
				{graph.cycles.length === 0 && graph.dangling.length === 0 ? (
					<p className={uiCss.class({ color: "var(--muted, #888)" })}>
						No cycles or missing references found.
					</p>
				) : (
					<ul
						className={uiCss.class({
							listStyle: "none",
							padding: 0,
							margin: 0,
							background: "var(--panel)",
							border: "1px solid var(--line)",
							borderRadius: 9,

							"& li": { padding: "7px 13px", borderBottom: "1px solid var(--line)" },
							"& li:last-child": { borderBottom: "none" },
						})}
					>
						{graph.cycles.map((cycle, index) => (
							<li key={`cycle:${index}`}>
								cycle · <code>{cycle.join(" → ")}</code>
							</li>
						))}
						{graph.dangling.map((reference) => (
							<li key={`missing:${reference}`}>
								missing reference · <code>{reference}</code>
							</li>
						))}
					</ul>
				)}
			</section>
		</div>
	);
}

/* ---------------------------------- usage tab ---------------------------------- */

type TokenUsageStatus = "hot" | "used" | "unused";

interface TokenUsageRow {
	id: string;
	group: string;
	groupLabel: string;
	name: string;
	value: string;
	count: number;
	status: TokenUsageStatus;
}

interface TokenUsageData {
	rows: Array<TokenUsageRow>;
	unknown: Array<{ name: string; count: number }>;
}

const tokenName = (name: string): string => (name.startsWith("$") ? name : `$${name}`);

const tokenLabel = (group: string, name: string): string =>
	group === "" ? tokenName(name) : `${group}/${tokenName(name)}`;

const buildTokenUsageData = (data: InspectorPayload): TokenUsageData => {
	const sections = data.designSystem.tokenSections;
	const rows: Array<TokenUsageRow> = sections.flatMap((section) =>
		section.entries.map((entry) => ({
			id: `${section.id}/${entry.name.replace(/^\$/, "")}`,
			group: section.id,
			groupLabel: section.label,
			name: entry.name,
			value: entry.value,
			count: 0,
			status: "unused",
		})),
	);
	const ids = new Set(rows.map((row) => row.id));
	const authoredToIds = new Map<string, Array<string>>();
	for (const row of rows) {
		const authored = tokenName(row.name);
		const matches = authoredToIds.get(authored) ?? [];
		matches.push(row.id);
		authoredToIds.set(authored, matches);
	}
	const counts = new Map<string, number>();
	const unknown: Array<{ name: string; count: number }> = [];
	for (const usage of data.analytics?.tokenUsage ?? []) {
		if (ids.has(usage.name)) {
			counts.set(usage.name, (counts.get(usage.name) ?? 0) + usage.count);
			continue;
		}
		const matches = authoredToIds.get(usage.name) ?? [];
		if (matches.length === 1) {
			const id = matches[0]!;
			counts.set(id, (counts.get(id) ?? 0) + usage.count);
			continue;
		}
		unknown.push(usage);
	}
	const ranked = rows
		.map((row) => ({ id: row.id, count: counts.get(row.id) ?? 0 }))
		.filter((row) => row.count > 0)
		.toSorted((a, b) => b.count - a.count || a.id.localeCompare(b.id));
	const hot = new Set(ranked.slice(0, 8).map((row) => row.id));
	return {
		rows: rows.map((row) => {
			const count = counts.get(row.id) ?? 0;
			return {
				...row,
				count,
				status: count === 0 ? "unused" : hot.has(row.id) ? "hot" : "used",
			};
		}),
		unknown: unknown.toSorted((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
	};
};

const ANALYSIS_BOUNDARIES: ReadonlyArray<{
	key: GovernanceCoverageBoundary;
	label: string;
}> = [
	{ key: "configuration-failure", label: "configuration failure" },
	{ key: "unresolved-import", label: "unresolved import" },
	{ key: "dynamic-expression", label: "dynamic expression" },
	{ key: "runtime-theme-access", label: "runtime theme access" },
	{ key: "generated-css", label: "generated CSS" },
	{ key: "plugin-output", label: "plugin output" },
	{ key: "public-export", label: "public export" },
	{ key: "safelist", label: "safelist" },
	{ key: "unscanned-file", label: "unscanned file" },
];

type AnalysisConfidenceLevel = "verified" | "scan" | "conservative";

interface AnalysisConfidence {
	level: AnalysisConfidenceLevel;
	label: string;
	summary: string;
	reasons: Array<string>;
}

const getAnalysisConfidence = (data: InspectorPayload): AnalysisConfidence => {
	const governance = data.governance;
	const reasons: Array<string> = [];
	if (governance !== undefined) {
		for (const boundary of ANALYSIS_BOUNDARIES) {
			const count = governance.summary.boundaries[boundary.key] ?? 0;
			if (count > 0) reasons.push(`${boundary.label} (${count})`);
		}
	}
	if (data.coverage.runtimeCalls > 0) reasons.push(`runtime cx() (${data.coverage.runtimeCalls})`);
	const unresolvedImports = data.cssCrawl?.unresolved.length ?? 0;
	if (unresolvedImports > 0) {
		reasons.push(`unresolved CSS imports (${unresolvedImports})`);
	}
	if (data.coverage.totalMissingCss > 0) {
		reasons.push(`missing CSS candidates (${data.coverage.totalMissingCss})`);
	}
	if (reasons.length > 0) {
		return {
			level: "conservative",
			label: "conservative",
			summary:
				"Some usage claims are incomplete; unobserved tokens are not automatically safe to remove.",
			reasons,
		};
	}
	if (governance?.policy?.resolved === true && data.cssSources.length > 0) {
		return {
			level: "verified",
			label: "extraction-backed",
			summary: "Structured source extraction and resolved project policy back this snapshot.",
			reasons: [],
		};
	}
	return {
		level: "scan",
		label: "static source scan",
		summary: "Metrics come from static source scanning without a fully resolved cleanup policy.",
		reasons: [],
	};
};

function AnalysisConfidenceBadge({ data }: { data: InspectorPayload }) {
	const confidence = getAnalysisConfidence(data);
	const tone =
		confidence.level === "verified"
			? uiCss.class({ color: "var(--good)" })
			: confidence.level === "conservative"
				? uiCss.class({ color: "var(--warn)" })
				: uiCss.class({ color: "var(--accent)" });
	return (
		<details className={uiCss.class({ position: "relative" })}>
			<summary
				className={`${uiCss.class({
					listStyle: "none",
					cursor: "pointer",
					border: "1px solid var(--line)",
					borderRadius: 999,
					padding: "4px 9px",
					fontSize: 12,
					whiteSpace: "nowrap",
					"&::-webkit-details-marker": { display: "none" },
				})} ${tone}`}
			>
				<span aria-hidden="true">●</span> {confidence.label} analysis
			</summary>
			<div
				className={uiCss.class({
					position: "absolute",
					top: "calc(100% + 8px)",
					right: 0,
					zIndex: 30,
					width: 300,
					padding: "10px 12px",
					background: "var(--panel)",
					border: "1px solid var(--line-strong)",
					borderRadius: 8,
					boxShadow: "0 10px 26px rgb(0 0 0 / 35%)",
					fontSize: 12,
					lineHeight: 1.45,
					"& ul": { margin: "7px 0 0", paddingLeft: 17 },
				})}
			>
				<strong>{confidence.summary}</strong>
				{confidence.reasons.length > 0 && (
					<ul>
						{confidence.reasons.map((reason) => (
							<li key={reason}>{reason}</li>
						))}
					</ul>
				)}
			</div>
		</details>
	);
}

const pct = (n: number): string => `${n}`;

function UsageView(props: {
	data: InspectorPayload;
	state: InspectorUrlState;
	navigateTo: (state: InspectorUrlState) => void;
	urlStateChange: (state: Partial<InspectorUrlState>) => void;
}) {
	const a = props.data.analytics;
	const crawl = props.data.cssCrawl;
	if (a === undefined) {
		return (
			<div id="usage">
				<p className={uiCss.class({ color: "var(--muted, #888)" })}>
					no analytics in this snapshot — hit refresh.
				</p>
			</div>
		);
	}
	return (
		<div id="usage">
			<section>
				<h2>usage overview</h2>
				<p className={uiCss.class({ color: "var(--muted, #888)" })}>
					{a.sitesScanned} styling call site(s) scanned
					{crawl !== undefined && ` · ${crawl.files} css file(s) crawled`}
					{crawl !== undefined &&
						crawl.unresolved.length > 0 &&
						` · ${crawl.unresolved.length} unresolved import(s)`}
				</p>
				<div
					className={uiCss.class({
						display: "grid",
						gridTemplateColumns: "repeat(auto-fit, minmax(215px, 1fr))",
						gap: 12,
						marginBottom: 6,
					})}
				>
					{TOKEN_CONDITION_KINDS.map((kind) => (
						<Card
							key={kind}
							label={kind}
							value={
								<InspectorLink
									target={{
										tab: "tokens",
										query: "",
										section: "usage",
										anchor: "usage-conditions",
										conditionKind: kind,
									}}
									navigateTo={props.navigateTo}
									label={`Show ${kind} conditions (${a.conditionBreakdown[kind]})`}
								>
									{pct(a.conditionBreakdown[kind])}
								</InspectorLink>
							}
						/>
					))}
				</div>
			</section>
			<section>
				<InspectorTable
					title="top properties"
					rows={a.topProperties}
					rowKey={(property) => property.name}
					columns={[
						{ id: "property", label: "property", value: (property) => property.name },
						{ id: "uses", label: "uses", value: (property) => property.count },
					]}
					filters={[
						{
							id: "frequency",
							label: "frequency",
							value: (property) =>
								property.count >= 10 ? "10+" : property.count >= 3 ? "3–9" : "1–2",
						},
					]}
					defaultSort={{ columnId: "uses", direction: "descending" }}
				/>
			</section>
			<section>
				<InspectorTable
					title="property + value combos"
					rows={a.topPropertyValues}
					rowKey={(combo) => combo.combo}
					columns={[
						{ id: "combo", label: "combo", value: (combo) => combo.combo },
						{ id: "uses", label: "uses", value: (combo) => combo.count },
					]}
					filters={[
						{
							id: "frequency",
							label: "frequency",
							value: (combo) => (combo.count >= 10 ? "10+" : combo.count >= 3 ? "3–9" : "1–2"),
						},
					]}
					defaultSort={{ columnId: "uses", direction: "descending" }}
				/>
			</section>
			<section>
				<InspectorTable
					id="usage-conditions"
					title="conditions"
					rows={a.conditions}
					rowKey={(condition) => condition.name}
					columns={[
						{ id: "condition", label: "condition", value: (condition) => condition.name },
						{ id: "kind", label: "kind", value: (condition) => condition.kind },
						{ id: "uses", label: "uses", value: (condition) => condition.count },
					]}
					filters={[
						{
							id: "kind",
							label: "kind",
							options: TOKEN_CONDITION_KINDS,
							value: (condition) => condition.kind,
						},
					]}
					filterValues={
						props.state.conditionKind === undefined ? {} : { kind: props.state.conditionKind }
					}
					onFilterValuesChange={(values) => {
						const kind = values.kind;
						props.urlStateChange({
							conditionKind: TOKEN_CONDITION_KINDS.find((candidate) => candidate === kind),
						});
					}}
					defaultSort={{ columnId: "uses", direction: "descending" }}
					defaultOpen={props.state.conditionKind !== undefined}
				/>
			</section>
			<TokenUsageIntelligence
				data={props.data}
				state={props.state}
				navigateTo={props.navigateTo}
				urlStateChange={props.urlStateChange}
			/>
			<ContrastWarningsView
				warnings={props.data.contrastWarnings ?? []}
				navigateTo={props.navigateTo}
			/>
			<ContrastPairView data={props.data} />
			<CleanupReportView
				data={props.data}
				state={props.state}
				navigateTo={props.navigateTo}
				urlStateChange={props.urlStateChange}
			/>
			<AnalyticsHistoryChart />
		</div>
	);
}

function TokenUsageIntelligence(props: {
	data: InspectorPayload;
	state: InspectorUrlState;
	navigateTo: (state: InspectorUrlState) => void;
	urlStateChange: (state: Partial<InspectorUrlState>) => void;
}) {
	const data = props.data;
	const usage = buildTokenUsageData(data);
	const total = usage.rows.length;
	const used = usage.rows.filter((row) => row.count > 0).length;
	const hot = usage.rows.filter((row) => row.status === "hot");
	const maxHotUses = Math.max(...hot.map((row) => row.count), 1);
	const groupStats = data.designSystem.tokenSections
		.map((section) => {
			const rows = usage.rows.filter((row) => row.group === section.id);
			return {
				id: section.id,
				label: section.label,
				used: rows.filter((row) => row.count > 0).length,
				total: rows.length,
			};
		})
		.filter((group) => group.total > 0);
	const coverage = total === 0 ? 0 : Math.round((used / total) * 100);
	const usageTarget = (
		filters: Pick<InspectorUrlState, "tokenActivity" | "tokenCategory" | "tokenSearch"> = {},
	): InspectorUrlState => ({
		tab: "tokens",
		query: "",
		section: "usage",
		anchor: "token-usage",
		...filters,
	});
	const categoryLabels = Object.fromEntries(
		data.designSystem.tokenSections.map((section) => [section.id, section.label]),
	);
	const filterValues: Record<string, string> = {};
	if (props.state.tokenActivity !== undefined) filterValues.activity = props.state.tokenActivity;
	if (props.state.tokenCategory !== undefined) filterValues.category = props.state.tokenCategory;
	return (
		<section id="token-intelligence">
			<h2>token intelligence</h2>
			<p className={uiCss.class({ color: "var(--muted, #888)" })}>
				Authored shorthand is normalized to its catalog group before usage is compared. “Not
				observed” is an analysis result, not an automatic removal recommendation.
			</p>
			<div
				className={uiCss.class({
					display: "grid",
					gridTemplateColumns: "repeat(auto-fit, minmax(215px, 1fr))",
					gap: 12,
					marginBottom: 6,
				})}
			>
				<Card
					label="catalog coverage"
					value={
						<InspectorLink
							target={usageTarget()}
							navigateTo={props.navigateTo}
							label={`Inspect token usage for ${used} of ${total} catalog entries`}
						>
							{total === 0 ? "—" : `${used}/${total}`}
						</InspectorLink>
					}
					sub={total === 0 ? "no token catalog loaded" : `${coverage}% observed`}
				/>
				<Card
					label="hot tokens"
					value={
						<InspectorLink
							target={usageTarget({ tokenActivity: "hot" })}
							navigateTo={props.navigateTo}
							label={`Show ${hot.length} hot tokens`}
						>
							{hot.length}
						</InspectorLink>
					}
					sub="most-used catalog entries"
				/>
				<Card
					label="not observed"
					value={
						<InspectorLink
							target={usageTarget({ tokenActivity: "not-observed" })}
							navigateTo={props.navigateTo}
							label={`Show ${total - used} unobserved tokens`}
						>
							{total - used}
						</InspectorLink>
					}
					sub="catalog entries not seen in this scan"
				/>
			</div>
			{groupStats.length > 0 && (
				<div
					className={uiCss.class({
						padding: "10px 14px",
						background: "var(--panel)",
						border: "1px solid var(--line)",
						borderRadius: 9,
						margin: "12px 0",
					})}
					aria-label="token coverage by category"
				>
					{groupStats.map((group) => (
						<Bar
							key={group.label}
							label={group.label}
							value={group.used}
							max={group.total}
							renderValue={
								<InspectorLink
									target={usageTarget({ tokenCategory: group.id })}
									navigateTo={props.navigateTo}
									label={`Show token usage for ${group.label}: ${group.used} of ${group.total}`}
								>
									{group.used} / {group.total}
								</InspectorLink>
							}
						/>
					))}
				</div>
			)}
			{hot.length > 0 && (
				<div
					className={uiCss.class({
						padding: "10px 14px",
						background:
							"linear-gradient(135deg, color-mix(in srgb, var(--accent) 8%, var(--panel)), var(--panel))",
						border: "1px solid var(--line)",
						borderRadius: 9,
						margin: "12px 0",
						"& h3": { marginTop: 0 },
					})}
				>
					<h3>hot tokens</h3>
					{hot.map((row) => (
						<Bar
							key={row.id}
							label={tokenLabel(row.group, row.name)}
							value={row.count}
							max={maxHotUses}
							renderValue={
								<InspectorLink
									target={usageTarget({
										tokenActivity: "hot",
										tokenSearch: tokenLabel(row.group, row.name),
									})}
									navigateTo={props.navigateTo}
									label={`Show ${row.count} uses of ${tokenLabel(row.group, row.name)}`}
								>
									{row.count}
								</InspectorLink>
							}
						/>
					))}
				</div>
			)}
			<InspectorTable
				id="token-usage"
				title="token usage"
				rows={usage.rows}
				rowKey={(row) => row.id}
				columns={[
					{ id: "category", label: "category", value: (row) => row.groupLabel },
					{
						id: "token",
						label: "token",
						value: (row) => tokenLabel(row.group, row.name),
						render: (row) => <code title={row.value}>{tokenLabel(row.group, row.name)}</code>,
					},
					{ id: "uses", label: "uses", value: (row) => row.count },
					{
						id: "status",
						label: "status",
						value: (row) => (row.status === "unused" ? "not observed" : row.status),
						render: (row) => (
							<span
								className={
									row.status === "unused"
										? uiCss.class({ color: "var(--muted, #888)" })
										: uiCss.class({ color: "var(--good, #4ade80)" })
								}
							>
								{row.status === "unused" ? "not observed" : row.status}
							</span>
						),
					},
				]}
				filters={[
					{
						id: "activity",
						label: "activity",
						options: TOKEN_USAGE_ACTIVITIES,
						optionLabels: { "not-observed": "not observed" },
						value: (row) =>
							row.count === 0 ? "not-observed" : row.status === "hot" ? "hot" : "used",
					},
					{
						id: "category",
						label: "category",
						optionLabels: categoryLabels,
						value: (row) => row.group,
					},
				]}
				filterValues={filterValues}
				onFilterValuesChange={(values) => {
					const activity = values.activity;
					const category = values.category;
					props.urlStateChange({
						tokenActivity:
							activity === "hot" || activity === "used" || activity === "not-observed"
								? activity
								: undefined,
						tokenCategory: category === undefined || category === "" ? undefined : category,
					});
				}}
				searchValue={props.state.tokenSearch ?? ""}
				onSearchValueChange={(tokenSearch) =>
					props.urlStateChange({ tokenSearch: tokenSearch === "" ? undefined : tokenSearch })
				}
				onClearFilters={() =>
					props.urlStateChange({
						tokenActivity: undefined,
						tokenCategory: undefined,
						tokenSearch: undefined,
					})
				}
				defaultSort={{ columnId: "uses", direction: "descending" }}
				defaultOpen={
					props.state.tokenActivity !== undefined ||
					props.state.tokenCategory !== undefined ||
					props.state.tokenSearch !== undefined ||
					usage.rows.length <= 12
				}
			/>
			{usage.unknown.length > 0 && (
				<details
					className={uiCss.class({
						marginTop: 10,
						color: "var(--muted)",
						"& summary": { cursor: "pointer" },
					})}
				>
					<summary>observed outside the loaded catalog ({usage.unknown.length})</summary>
					<p className={uiCss.class({ color: "var(--muted, #888)" })}>
						{usage.unknown.map((entry) => `${entry.name} (${entry.count})`).join(", ")}
					</p>
				</details>
			)}
		</section>
	);
}

/* ------------------------------- analytics extras ------------------------------ */

function ContrastWarningsView({
	warnings,
	navigateTo,
}: {
	warnings: NonNullable<InspectorPayload["contrastWarnings"]>;
	navigateTo: (state: InspectorUrlState) => void;
}) {
	if (warnings.length === 0) {
		return (
			<section id="contrast-warnings">
				<h2>wcag contrast</h2>
				<p className={uiCss.class({ color: "var(--muted, #888)" })}>
					no text/background pairs below 4.5:1 found.
				</p>
			</section>
		);
	}
	return (
		<section id="contrast-warnings">
			<h2>
				wcag contrast —{" "}
				<InspectorLink
					target={{
						tab: "tokens",
						query: "",
						section: "usage",
						anchor: "contrast-warning-table",
					}}
					navigateTo={navigateTo}
					label={`Inspect ${warnings.length} contrast warnings`}
				>
					{warnings.length}
				</InspectorLink>{" "}
				warning(s)
			</h2>
			<p className={uiCss.class({ color: "var(--muted, #888)" })}>
				text/background pairs within one call site. &lt;4.5 fails normal text; &lt;3 also fails
				large text.
			</p>
			<InspectorTable
				id="contrast-warning-table"
				title="contrast warnings"
				rows={warnings.map((warning, index) => ({ id: `${warning.file}:${index}`, warning }))}
				rowKey={(row) => row.id}
				columns={[
					{
						id: "ratio",
						label: "ratio",
						value: (row) => row.warning.ratio,
						render: (row) => (
							<span
								{...uiCss.props(
									uiCss.vars({
										color: row.warning.severity === "fail-large" ? "#ef4444" : "#d97706",
									}),
								)}
							>
								{row.warning.ratio.toFixed(2)}
							</span>
						),
					},
					{ id: "severity", label: "severity", value: (row) => row.warning.severity },
					{ id: "text", label: "text", value: (row) => row.warning.fg },
					{ id: "background", label: "background", value: (row) => row.warning.bg },
					{ id: "file", label: "file", value: (row) => row.warning.file },
				]}
				filters={[
					{
						id: "severity",
						label: "severity",
						value: (row) => row.warning.severity,
					},
				]}
				defaultSort={{ columnId: "ratio", direction: "ascending" }}
			/>
		</section>
	);
}

function ContrastPairView({ data }: { data: InspectorPayload }) {
	const colorOptions = useMemo(
		() =>
			(
				data.designSystem.tokenSections.find((section) => section.id === "colors")?.entries ?? []
			).filter((entry) => !entry.value.includes("condition-bound")),
		[data.designSystem.tokenSections],
	);
	const colorValues = useMemo(() => {
		const values: Record<string, string> = {};
		for (const option of colorOptions) {
			values[option.name] = option.value;
			values[tokenName(option.name)] = option.value;
		}
		return values;
	}, [colorOptions]);
	const [foreground, setForeground] = useState(() => colorOptions[0]?.name ?? "");
	const [background, setBackground] = useState(
		() => colorOptions[1]?.name ?? colorOptions[0]?.name ?? "",
	);
	useEffect(() => {
		const names = new Set(colorOptions.map((option) => option.name));
		setForeground((current) => (names.has(current) ? current : (colorOptions[0]?.name ?? "")));
		setBackground((current) =>
			names.has(current) ? current : (colorOptions[1]?.name ?? colorOptions[0]?.name ?? ""),
		);
	}, [colorOptions]);
	if (colorOptions.length < 2) {
		return (
			<section>
				<h2>check a palette pair</h2>
				<p className={uiCss.class({ color: "var(--muted, #888)" })}>
					A resolved color catalog is required for focused contrast checks.
				</p>
			</section>
		);
	}
	const evaluation = evaluateContrastPair(foreground, background, colorValues);
	const statusClass =
		evaluation?.status === "pass"
			? uiCss.class({ color: "var(--good, #4ade80)" })
			: evaluation?.status === "fail-large"
				? uiCss.class({ color: "var(--bad)" })
				: uiCss.class({ color: "var(--warn, #fbbf24)" });
	return (
		<section>
			<h2>check a palette pair</h2>
			<p className={uiCss.class({ color: "var(--muted, #888)" })}>
				Choose one text and one background token. This keeps palette accessibility useful without
				producing an all-colors matrix.
			</p>
			<div
				className={uiCss.class({
					display: "grid",
					gridTemplateColumns: "repeat(2, minmax(180px, 1fr))",
					gap: 12,
					maxWidth: 620,

					"& label": {
						display: "flex",
						flexDirection: "column",
						gap: 5,
						color: "var(--muted)",
						fontSize: 12,
					},
					"& select": {
						font: "inherit",
						color: "var(--text)",
						background: "var(--panel)",
						border: "1px solid var(--line)",
						borderRadius: 6,
						padding: "7px 9px",
					},
					"@media (max-width: 560px)": { gridTemplateColumns: "1fr" },
				})}
			>
				<label>
					text
					<select value={foreground} onChange={(event) => setForeground(event.target.value)}>
						{colorOptions.map((option) => (
							<option key={option.name} value={option.name}>
								{tokenName(option.name)}
							</option>
						))}
					</select>
				</label>
				<label>
					background
					<select value={background} onChange={(event) => setBackground(event.target.value)}>
						{colorOptions.map((option) => (
							<option key={option.name} value={option.name}>
								{tokenName(option.name)}
							</option>
						))}
					</select>
				</label>
			</div>
			{evaluation === null ? (
				<p className={uiCss.class({ color: "var(--muted, #888)" })}>
					The selected values could not be resolved to colors.
				</p>
			) : (
				<div
					className={uiCss.class({
						display: "flex",
						alignItems: "baseline",
						gap: 9,
						marginTop: 12,
						fontSize: 13,

						"& span:first-child": { fontFamily: "var(--mono)", fontSize: 18, fontWeight: 650 },
					})}
					role="status"
					aria-live="polite"
				>
					<span className={statusClass}>{evaluation.ratio.toFixed(2)}:1</span>
					<span>
						{evaluation.status === "pass"
							? "passes AA for normal text"
							: evaluation.status === "fail-normal"
								? "passes large text only"
								: "fails AA for large text"}
					</span>
				</div>
			)}
		</section>
	);
}

function RemovalPreviewView({ unusedCount }: { unusedCount: number }) {
	const [content, setContent] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [copied, setCopied] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const generate = (): void => {
		setBusy(true);
		setError(null);
		InspectorApi.fetchPruneChangeset()
			.then((r) => setContent(r.content))
			.catch((e: Error) => setError(e.message))
			.finally(() => setBusy(false));
	};
	const copy = (): void => {
		if (content === null) return;
		void navigator.clipboard.writeText(content).then(() => {
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		});
	};
	return (
		<section>
			<h2>removal preview</h2>
			<p className={uiCss.class({ color: "var(--muted, #888)" })}>
				Previews a .changeset file for {unusedCount} token(s) classified safe by reachability
				analysis. The preview is read-only; nothing is written server-side, and it still needs human
				review.
			</p>
			<button type="button" onClick={generate} disabled={busy || unusedCount === 0}>
				{busy ? "generating…" : `generate removal preview (${unusedCount})`}
			</button>{" "}
			{error !== null && (
				<div role="alert">
					<p className={uiCss.class({ color: "var(--bad)" })}>{error}</p>
					<p className={uiCss.class({ color: "var(--muted, #888)" })}>
						Check that the Inspector server is running, then retry generation.
					</p>
					<button type="button" onClick={generate} disabled={busy || unusedCount === 0}>
						retry changeset
					</button>
				</div>
			)}
			{content !== null && (
				<button type="button" onClick={copy} aria-label="Copy generated changeset">
					{copied ? "copied ✓" : "copy to clipboard"}
				</button>
			)}
			{content !== null && (
				<pre
					className={uiCss.class({
						background: "linear-gradient(180deg, var(--bg-raised), var(--panel))",
						border: "1px solid var(--line)",
						borderRadius: 10,
						padding: "15px 17px",
					})}
				>
					{content}
				</pre>
			)}
		</section>
	);
}

const SAFETY_ORDER: Readonly<Record<RemovalSafety, number>> = {
	"safe-to-remove": 0,
	"review-required": 1,
	"not-removable": 2,
};

const SAFETY_COLOR: Readonly<Record<RemovalSafety, string>> = {
	"safe-to-remove": "#22c55e",
	"review-required": "#d97706",
	"not-removable": "#ef4444",
};

const BOUNDARY_ORDER: ReadonlyArray<GovernanceCoverageBoundary> = [
	"configuration-failure",
	"unresolved-import",
	"dynamic-expression",
	"runtime-theme-access",
	"generated-css",
	"plugin-output",
	"public-export",
	"safelist",
	"unscanned-file",
];

/** Cleanup evidence from the shared analysis report; all actions remain previews. */
function CleanupReportView(props: {
	data: InspectorPayload;
	state: InspectorUrlState;
	navigateTo: (state: InspectorUrlState) => void;
	urlStateChange: (state: Partial<InspectorUrlState>) => void;
}) {
	const g = props.data.governance;
	const [releaseReport, setReleaseReport] = useState<TokenReleaseReport | null>(null);
	const [releaseError, setReleaseError] = useState<string | null>(null);
	const [releaseLoading, setReleaseLoading] = useState(false);
	if (g === undefined) {
		return (
			<section>
				<h2>cleanup assessment</h2>
				<p className={uiCss.class({ color: "var(--muted, #888)" })}>
					This snapshot has no cleanup report. Refresh to rerun the analysis.
				</p>
			</section>
		);
	}
	const s = g.summary;
	const policy: TokenPolicySnapshot | null = g.policy;
	const unused = [...g.unusedCandidates].toSorted(
		(a, b) => SAFETY_ORDER[a.safety] - SAFETY_ORDER[b.safety] || a.tokenId.localeCompare(b.tokenId),
	);
	const suggestions = [...g.suggestions].toSorted(
		(a, b) => a.file.localeCompare(b.file) || a.start - b.start,
	);
	const nonZeroBoundaries = BOUNDARY_ORDER.filter((b) => (s.boundaries[b] ?? 0) > 0);
	const cleanupTarget = (
		anchor: string,
		cleanupSafety?: CleanupSafetyFilter,
	): InspectorUrlState => ({
		tab: "tokens",
		query: "",
		section: "usage",
		anchor,
		...(cleanupSafety === undefined ? {} : { cleanupSafety }),
	});
	const cleanupFilterValues: Record<string, string> =
		props.state.cleanupSafety === undefined ? {} : { safety: props.state.cleanupSafety };
	return (
		<div>
			<section id="release-impact">
				<h2>release impact</h2>
				<p className={uiCss.class({ color: "var(--muted, #888)" })}>
					Choose a prior DTCG token file to compare with the validated current snapshot. The report
					joins exact token paths to this project’s usage evidence and keeps scan boundaries
					visible.
				</p>
				<label className={uiCss.class({ display: "inline-flex", gap: 8, alignItems: "center" })}>
					<span>Compare baseline</span>
					<input
						type="file"
						accept=".tokens,.tokens.json,application/design-tokens+json,application/json"
						disabled={releaseLoading || props.data.interopTokens?.state !== "available"}
						aria-label="Choose baseline DTCG token file"
						onChange={async (event) => {
							const input = event.currentTarget;
							const file = input.files?.[0];
							if (file === undefined) return;
							setReleaseLoading(true);
							setReleaseError(null);
							setReleaseReport(null);
							try {
								setReleaseReport(await InspectorApi.compareTokenRelease(await file.text()));
							} catch (error) {
								setReleaseError(error instanceof Error ? error.message : String(error));
							} finally {
								setReleaseLoading(false);
								input.value = "";
							}
						}}
					/>
				</label>
				{releaseLoading && <p role="status">Comparing token release…</p>}
				{releaseError !== null && <p role="alert">{releaseError}</p>}
				{props.data.interopTokens?.state === "unavailable" && (
					<p role="status">
						Current token snapshot unavailable: {props.data.interopTokens.diagnostics.join("; ")}
					</p>
				)}
				{releaseReport !== null && (
					<div>
						<p>
							{releaseReport.changes.length === 0
								? "No token release changes."
								: `${releaseReport.changes.length} change(s) across ${releaseReport.consumerRoots.length} consumer project(s).`}
							<span className={uiCss.class({ color: "var(--muted, #888)", marginLeft: 8 })}>
								Baseline {releaseReport.baseline.format}@{releaseReport.baseline.formatVersion}
							</span>
						</p>
						{releaseReport.changes.map((change, index) => {
							const usageCount = change.consumers.reduce(
								(total, consumer) => total + consumer.usages.length,
								0,
							);
							const suggestionCount = change.consumers.reduce(
								(total, consumer) => total + consumer.exactSuggestions.length,
								0,
							);
							const boundaries = change.consumers.flatMap((consumer) =>
								Object.entries(consumer.coverageBoundaries)
									.filter(([, count]) => count > 0)
									.map(([name, count]) => `${name}: ${count}`),
							);
							return (
								<details key={`${change.path}:${change.kind}:${index}`}>
									<summary>
										<strong>{change.kind}</strong> {change.path} · {usageCount} exact usage(s) ·{" "}
										{suggestionCount} exact suggestion(s)
									</summary>
									{change.references.length > 0 && (
										<p>References: {change.references.join(", ")}</p>
									)}
									{change.changedFields !== undefined && (
										<p>Changed fields: {change.changedFields.join(", ")}</p>
									)}
									{change.consumers.flatMap((consumer) =>
										consumer.usages.map((use) => (
											<p key={`${consumer.root}:${use.file}:${use.start}`}>
												{consumer.root}/{use.file} · {use.property ?? "unknown property"} ·{" "}
												{use.confidence} · {use.strictness}
											</p>
										)),
									)}
									{boundaries.length > 0 && (
										<p>Coverage boundaries: {[...new Set(boundaries)].join(" · ")}</p>
									)}
								</details>
							);
						})}
					</div>
				)}
			</section>
			<section>
				<h2>cleanup assessment</h2>
				<p className={uiCss.class({ color: "var(--muted, #888)" })}>
					These counts use the analyzer’s reachable-token report, not the catalog coverage above. A
					candidate is a review classification, not approval to delete it; scan boundaries are shown
					before any removal preview.
				</p>
			</section>
			{s.boundaries["configuration-failure"] > 0 && (
				<section>
					<h2>configuration incomplete</h2>
					<p className={uiCss.class({ color: "var(--muted, #888)" })}>
						The project configuration could not be fully evaluated, so usage evidence is incomplete.
						Treat these tokens as “not observed” rather than “unused.”
					</p>
				</section>
			)}
			<section
				className={uiCss.class({
					display: "grid",
					gridTemplateColumns: "repeat(auto-fit, minmax(215px, 1fr))",
					gap: 12,
					marginBottom: 6,
				})}
			>
				<Card label="in analyzer scope" value={String(s.defined)} />
				<Card label="reachable" value={String(s.used)} />
				<Card
					label="cleanup candidates"
					value={
						<InspectorLink
							target={cleanupTarget("cleanup-candidates")}
							navigateTo={props.navigateTo}
							label={`Inspect ${s.unusedCandidates} cleanup candidates`}
						>
							{s.unusedCandidates}
						</InspectorLink>
					}
				/>
				<Card
					label="safe by analysis"
					value={
						<InspectorLink
							target={cleanupTarget("cleanup-candidates", "safe-to-remove")}
							navigateTo={props.navigateTo}
							label={`Show ${s.safeToRemove} safe cleanup candidates`}
						>
							{s.safeToRemove}
						</InspectorLink>
					}
				/>
				<Card
					label="needs review"
					value={
						<InspectorLink
							target={cleanupTarget("cleanup-candidates", "review-required")}
							navigateTo={props.navigateTo}
							label={`Show ${s.reviewRequired} candidates needing review`}
						>
							{s.reviewRequired}
						</InspectorLink>
					}
				/>
				<Card
					label="kept"
					value={
						<InspectorLink
							target={cleanupTarget("cleanup-candidates", "not-removable")}
							navigateTo={props.navigateTo}
							label={`Show ${s.notRemovable} candidates kept by policy`}
						>
							{s.notRemovable}
						</InspectorLink>
					}
				/>
				<Card
					label="strict issues"
					value={
						<InspectorLink
							target={cleanupTarget(
								g.diagnostics.length > 0 ? "cleanup-diagnostics-table" : "cleanup-diagnostics",
							)}
							navigateTo={props.navigateTo}
							label={`Inspect ${s.strictViolations} strict issues`}
						>
							{s.strictViolations}
						</InspectorLink>
					}
				/>
				<Card
					label="raw values allowed"
					value={
						<InspectorLink
							target={cleanupTarget("resolved-cleanup-policy")}
							navigateTo={props.navigateTo}
							label={`Inspect ${s.rawAllowed} allowed raw values`}
						>
							{s.rawAllowed}
						</InspectorLink>
					}
				/>
				<Card
					label="policy unknown"
					value={
						<InspectorLink
							target={cleanupTarget("resolved-cleanup-policy")}
							navigateTo={props.navigateTo}
							label={`Inspect ${s.unknownStrictness} unresolved policy values`}
						>
							{s.unknownStrictness}
						</InspectorLink>
					}
				/>
				<Card
					label="exact suggestions"
					value={
						<InspectorLink
							target={cleanupTarget(
								suggestions.length > 0 ? "raw-value-suggestions-table" : "raw-value-suggestions",
							)}
							navigateTo={props.navigateTo}
							label={`Inspect ${s.suggestions} exact value suggestions`}
						>
							{s.suggestions}
						</InspectorLink>
					}
				/>
			</section>
			{nonZeroBoundaries.length > 0 && (
				<section id="cleanup-boundaries">
					<h2>coverage boundaries</h2>
					<p className={uiCss.class({ color: "var(--muted, #888)" })}>
						conditions that prevent a definitive usage claim — nothing behind these is classified as
						safe-to-remove.
					</p>
					<div className={uiCss.class({ display: "flex", flexWrap: "wrap", gap: 8 })}>
						{nonZeroBoundaries.map((b) => (
							<span
								className={uiCss.class({
									background: "color-mix(in srgb, currentColor 8%, transparent)",
									border: "1px solid var(--line)",
									borderRadius: 6,
									padding: "2px 8px",
									fontSize: 12,
									fontFamily: "var(--mono)",
								})}
								key={b}
							>
								{b} ({s.boundaries[b]})
							</span>
						))}
					</div>
				</section>
			)}
			<section id="resolved-cleanup-policy">
				<h2>resolved cleanup policy</h2>
				{policy === null ? (
					<p className={uiCss.class({ color: "var(--muted, #888)" })}>
						no policy resolved — strictness is report-only/fail-open (unknown).
					</p>
				) : policy.resolved ? (
					<dl
						className={uiCss.class({
							display: "grid",
							gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
							gap: 8,
							margin: 0,

							"& > div": {
								minWidth: 0,
								padding: "10px 12px",
								background: "var(--panel)",
								border: "1px solid var(--line)",
								borderRadius: 8,
							},
							"& dt": { marginBottom: 4, color: "var(--muted)", fontSize: 11 },
							"& dd": { margin: 0, overflowWrap: "anywhere" },
						})}
					>
						<div>
							<dt>owner</dt>
							<dd>{policy.owner}</dd>
						</div>
						<div>
							<dt>origin</dt>
							<dd>{policy.origin ?? "—"}</dd>
						</div>
						<div>
							<dt>strict properties</dt>
							<dd>{(policy.strictProperties ?? []).join(", ") || "—"}</dd>
						</div>
						<div>
							<dt>allowed raw values</dt>
							<dd>{(policy.allowedRawValues ?? []).join(", ") || "—"}</dd>
						</div>
						{policy.allowedRawPrefixes !== undefined && policy.allowedRawPrefixes.length > 0 && (
							<div>
								<dt>allowed raw prefixes</dt>
								<dd>{policy.allowedRawPrefixes.join(", ")}</dd>
							</div>
						)}
					</dl>
				) : (
					<p className={uiCss.class({ color: "var(--muted, #888)" })}>
						policy for {policy.owner} could not be resolved — all strictness is unknown.
					</p>
				)}
			</section>
			<section>
				<p className={uiCss.class({ color: "var(--muted, #888)" })}>
					zero reachable usage after alias/composition/generated-artifact/export analysis — safety
					is a classification, not a deletion approval.
				</p>
				<InspectorTable
					id="cleanup-candidates"
					title={`cleanup candidates · ${unused.length}`}
					rows={unused}
					rowKey={(candidate) => candidate.tokenId}
					columns={[
						{
							id: "token",
							label: "token",
							value: (candidate) => stripDollar(authoredTokenSpelling(candidate.tokenId)),
						},
						{
							id: "safety",
							label: "safety",
							value: (candidate) => candidate.safety,
							render: (candidate) => (
								<span {...uiCss.props(uiCss.vars({ color: SAFETY_COLOR[candidate.safety] }))}>
									{candidate.safety}
								</span>
							),
						},
						{
							id: "reasons",
							label: "reasons / boundaries",
							value: (candidate) => candidate.reasons.join("; ") || "—",
						},
					]}
					filters={[
						{
							id: "safety",
							label: "safety",
							options: CLEANUP_SAFETIES,
							optionLabels: {
								"safe-to-remove": "safe by analysis",
								"review-required": "needs review",
								"not-removable": "kept",
							},
							value: (candidate) => candidate.safety,
						},
					]}
					filterValues={cleanupFilterValues}
					onFilterValuesChange={(values) => {
						const safety = values.safety;
						props.urlStateChange({
							cleanupSafety:
								safety === "safe-to-remove" ||
								safety === "review-required" ||
								safety === "not-removable"
									? safety
									: undefined,
						});
					}}
					defaultOpen={props.state.cleanupSafety !== undefined}
				/>
			</section>
			<section id="raw-value-suggestions">
				{suggestions.length === 0 ? (
					<>
						<h2>raw value suggestions · 0</h2>
						<p className={uiCss.class({ color: "var(--muted, #888)" })}>
							No exact raw value replacements were found.
						</p>
					</>
				) : (
					<>
						<p className={uiCss.class({ color: "var(--muted, #888)" })}>
							each suggestion is an exact resolved-value match with a legal spelling for the
							property; ambiguous matches are rejected, not ranked.
						</p>
						<InspectorTable
							id="raw-value-suggestions-table"
							title={`raw value suggestions · ${suggestions.length}`}
							rows={suggestions.map((suggestion, index) => ({
								id: `${suggestion.file}:${suggestion.start}:${index}`,
								suggestion,
							}))}
							rowKey={(row) => row.id}
							columns={[
								{ id: "file", label: "file", value: (row) => row.suggestion.file },
								{
									id: "property",
									label: "property",
									value: (row) => row.suggestion.property ?? "—",
								},
								{ id: "raw", label: "raw", value: (row) => row.suggestion.rawValue },
								{
									id: "replacement",
									label: "replacement",
									value: (row) => stripDollar(row.suggestion.replacement),
								},
								{
									id: "confidence",
									label: "confidence",
									value: (row) => row.suggestion.confidence,
								},
								{ id: "reason", label: "reason", value: (row) => row.suggestion.reason },
							]}
							filters={[
								{
									id: "confidence",
									label: "confidence",
									value: (row) => row.suggestion.confidence,
								},
								{
									id: "property",
									label: "property",
									value: (row) => row.suggestion.property ?? "unknown",
								},
							]}
							defaultSort={{ columnId: "file", direction: "ascending" }}
						/>
					</>
				)}
			</section>
			<section id="cleanup-diagnostics">
				{g.diagnostics.length === 0 ? (
					<>
						<h2>diagnostics · 0</h2>
						<p className={uiCss.class({ color: "var(--muted, #888)" })}>
							No cleanup diagnostics were reported.
						</p>
					</>
				) : (
					<>
						<InspectorTable
							id="cleanup-diagnostics-table"
							title="diagnostics"
							rows={g.diagnostics.map((diagnostic, index) => ({
								id: `${diagnostic.code}:${index}`,
								diagnostic,
							}))}
							rowKey={(row) => row.id}
							columns={[
								{
									id: "severity",
									label: "severity",
									value: (row) => row.diagnostic.severity,
									render: (row) => (
										<span
											{...uiCss.props(
												uiCss.vars({
													color:
														row.diagnostic.severity === "error"
															? "#ef4444"
															: row.diagnostic.severity === "warning"
																? "#d97706"
																: "#64748b",
												}),
											)}
										>
											{row.diagnostic.severity}
										</span>
									),
								},
								{ id: "code", label: "code", value: (row) => row.diagnostic.code },
								{ id: "message", label: "message", value: (row) => row.diagnostic.message },
							]}
							filters={[
								{
									id: "severity",
									label: "severity",
									value: (row) => row.diagnostic.severity,
								},
							]}
							defaultSort={{ columnId: "severity", direction: "ascending" }}
						/>
					</>
				)}
			</section>
			<RemovalPreviewView unusedCount={s.safeToRemove} />
		</div>
	);
}

const HISTORY_W = 560;
const HISTORY_H = 90;

function AnalyticsHistoryChart() {
	const [series, setSeries] = useState<Array<AnalyticsHistoryPoint> | null>(null);
	const [error, setError] = useState<string | null>(null);
	const load = useCallback(() => {
		setError(null);
		setSeries(null);
		InspectorApi.fetchAnalyticsHistory()
			.then(setSeries)
			.catch((e: Error) => setError(e.message));
	}, []);
	useEffect(load, [load]);
	if (error !== null) {
		return (
			<section role="alert">
				<h2>trend</h2>
				<p className={uiCss.class({ color: "var(--bad)" })}>{error}</p>
				<p className={uiCss.class({ color: "var(--muted, #888)" })}>
					History is optional. Enable INSPECTOR_HISTORY=1 to record snapshots, then retry if the
					server was restarted.
				</p>
				<button type="button" onClick={load}>
					retry trend
				</button>
			</section>
		);
	}
	if (series === null || series.length < 2) {
		return (
			<section>
				<h2>trend</h2>
				<p className={uiCss.class({ color: "var(--muted, #888)" })}>
					need at least 2 recorded snapshots — run with INSPECTOR_HISTORY=1 and refresh twice.
				</p>
			</section>
		);
	}
	const n = series.length;
	const x = (i: number): number => (n === 1 ? HISTORY_W / 2 : (i / (n - 1)) * HISTORY_W);
	const yElim = (v: number): number => HISTORY_H - (v / 100) * HISTORY_H;
	const maxCalls = Math.max(...series.map((p) => p.totalCalls), 1);
	const yCalls = (v: number): number => HISTORY_H - (v / maxCalls) * HISTORY_H;
	const elimPath = series
		.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${yElim(p.eliminatedPct)}`)
		.join(" ");
	const callsPath = series
		.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${yCalls(p.totalCalls)}`)
		.join(" ");
	return (
		<section>
			<h2>trend — {n} snapshots</h2>
			<svg
				width="100%"
				viewBox={`0 0 ${HISTORY_W} ${HISTORY_H + 24}`}
				{...uiCss.props(uiCss.vars({ minWidth: `${HISTORY_W}px` }))}
				role="img"
				aria-label="analytics trend chart"
			>
				<path d={elimPath} fill="none" stroke="#7c5cff" strokeWidth={2} />
				<path d={callsPath} fill="none" stroke="#0ea5e9" strokeWidth={2} opacity={0.8} />
				{series.map((p, i) => (
					<g key={p.timestamp}>
						<circle cx={x(i)} cy={yElim(p.eliminatedPct)} r={3} fill="#7c5cff">
							<title>{`${p.timestamp.slice(0, 19)} · eliminated ${p.eliminatedPct}%`}</title>
						</circle>
						<circle cx={x(i)} cy={yCalls(p.totalCalls)} r={3} fill="#0ea5e9">
							<title>{`${p.timestamp.slice(0, 19)} · calls ${p.totalCalls}`}</title>
						</circle>
					</g>
				))}
				<text x={4} y={12} fill="#7c5cff" fontSize={10}>
					eliminated %
				</text>
				<text x={110} y={12} fill="#0ea5e9" fontSize={10}>
					call sites
				</text>
			</svg>
			<p className={uiCss.class({ color: "var(--muted, #888)" })}>
				first {series[0]!.timestamp.slice(0, 19)} · last {series[n - 1]!.timestamp.slice(0, 19)}
			</p>
		</section>
	);
}

/* ------------------------------------- app ------------------------------------- */

const TAB_LABELS: Record<InspectorTab, string> = {
	tokens: "Tokens",
	build: "Build report",
	history: "History",
};

const TOKEN_VIEWS: ReadonlyArray<{ section: string | null; label: string }> = [
	{ section: null, label: "Catalog" },
	{ section: "usage", label: "Usage & cleanup" },
	{ section: "relationships", label: "Relationships" },
];

export function App() {
	const [urlState, setUrlState] = useState(() =>
		readInspectorUrlState({ hash: window.location.hash, search: window.location.search }),
	);
	const tab = urlState.tab;
	const query = urlState.query;
	const section = urlState.section;
	const [data, setData] = useState<InspectorPayload | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [historyList, setHistoryList] = useState<Array<HistoryListItem> | null>(null);
	const [diffPair, setDiffPair] = useState<{ a: string; b: string } | null>(null);
	const [diffData, setDiffData] = useState<{ a: HistoryEntry; b: HistoryEntry } | null>(null);
	const [historyError, setHistoryError] = useState<string | null>(null);

	const refresh = useCallback((forceRefresh = false) => {
		setLoading(true);
		setError(null);
		InspectorApi.fetchData(forceRefresh)
			.then(setData)
			.catch((e: Error) => setError(e.message))
			.finally(() => setLoading(false));
	}, []);

	useEffect(() => refresh(), [refresh]);

	useEffect(() => {
		const syncUrlState = (): void =>
			setUrlState(
				readInspectorUrlState({ hash: window.location.hash, search: window.location.search }),
			);
		window.addEventListener("hashchange", syncUrlState);
		window.addEventListener("popstate", syncUrlState);
		return () => {
			window.removeEventListener("hashchange", syncUrlState);
			window.removeEventListener("popstate", syncUrlState);
		};
	}, []);

	useEffect(() => {
		const targetId =
			urlState.anchor ??
			(tab === "build" || (tab === "tokens" && (section === "usage" || section === "relationships"))
				? section
				: null);
		if (targetId === null) return;
		const target = document.getElementById(targetId);
		if (target === null) return;
		if (target instanceof HTMLDetailsElement) target.open = true;
		const frame = window.requestAnimationFrame(() =>
			target.scrollIntoView({ behavior: "smooth", block: "start" }),
		);
		return () => window.cancelAnimationFrame(frame);
	}, [data, section, tab, urlState.anchor]);

	useEffect(() => {
		const focusSearch = (event: KeyboardEvent): void => {
			if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
			const target = event.target;
			if (
				target instanceof HTMLElement &&
				(target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
			)
				return;
			const search =
				document.getElementById("inspector-search") ??
				document.getElementById("token-relationship-search");
			if (!(search instanceof HTMLInputElement)) return;
			event.preventDefault();
			search.focus();
			search.select();
		};
		document.addEventListener("keydown", focusSearch);
		return () => document.removeEventListener("keydown", focusSearch);
	}, []);

	const updateUrlState = useCallback(
		(next: Partial<InspectorUrlState>): void => {
			const state = { ...urlState, ...next };
			setUrlState(state);
			window.history.replaceState(
				null,
				"",
				`${window.location.pathname}${serializeInspectorUrlState(state, window.location.search)}`,
			);
		},
		[urlState],
	);
	const navigateTo = useCallback((state: InspectorUrlState): void => {
		setUrlState(state);
		window.history.pushState(
			null,
			"",
			`${window.location.pathname}${serializeInspectorUrlState(state, window.location.search)}`,
		);
	}, []);
	const changeTab = useCallback(
		(next: InspectorTab): void =>
			updateUrlState({
				tab: next,
				section: null,
				anchor: undefined,
				...(next === "build" ? {} : { buildFilters: undefined }),
				...(next === "tokens"
					? {}
					: {
							tokenActivity: undefined,
							tokenCategory: undefined,
							tokenSearch: undefined,
							conditionKind: undefined,
							cleanupSafety: undefined,
							relationshipNode: undefined,
						}),
			}),
		[updateUrlState],
	);
	const queryChange = useCallback(
		(value: string): void => updateUrlState({ query: value }),
		[updateUrlState],
	);
	const sectionChange = useCallback(
		(next: string): void =>
			updateUrlState({
				tab: "tokens",
				section: next,
				anchor: undefined,
				buildFilters: undefined,
				tokenActivity: undefined,
				tokenCategory: undefined,
				tokenSearch: undefined,
				conditionKind: undefined,
				cleanupSafety: undefined,
				relationshipNode: undefined,
			}),
		[updateUrlState],
	);
	const changeTokenView = useCallback(
		(section: string | null): void =>
			updateUrlState({
				tab: "tokens",
				section,
				anchor: undefined,
				buildFilters: undefined,
				tokenActivity: undefined,
				tokenCategory: undefined,
				tokenSearch: undefined,
				conditionKind: undefined,
				cleanupSafety: undefined,
				relationshipNode: undefined,
			}),
		[updateUrlState],
	);

	const loadDiff = useCallback(async (a: string, b: string) => {
		setHistoryError(null);
		try {
			const [ea, eb] = await Promise.all([
				InspectorApi.fetchHistoryRun(a),
				InspectorApi.fetchHistoryRun(b),
			]);
			setDiffData({
				a: { timestamp: a, parent: null, payload: ea },
				b: { timestamp: b, parent: null, payload: eb },
			});
		} catch (e) {
			setHistoryError((e as Error).message);
		}
	}, []);

	const loadHistory = useCallback(() => {
		setHistoryError(null);
		InspectorApi.fetchHistoryList()
			.then(setHistoryList)
			.catch((e: Error) => setHistoryError(e.message));
	}, []);

	useEffect(() => {
		if (tab !== "history") return;
		loadHistory();
	}, [loadHistory, tab]);
	let body: React.ReactNode;
	if (error !== null) {
		body = <ErrorState message={error} retry={refresh} />;
	} else if (data === null) {
		body = <LoadingSkeleton />;
	} else {
		if (tab === "tokens") {
			body =
				section === "usage" ? (
					<UsageView
						data={data}
						state={urlState}
						navigateTo={navigateTo}
						urlStateChange={updateUrlState}
					/>
				) : section === "relationships" ? (
					<TokenGraphView data={data} state={urlState} navigateTo={navigateTo} />
				) : (
					<DesignSystemView
						data={data}
						query={query}
						queryChange={queryChange}
						section={section}
						sectionChange={sectionChange}
						navigateTo={navigateTo}
					/>
				);
		} else if (tab === "history") {
			body = (
				<HistoryView
					list={historyList}
					error={historyError}
					diffPair={diffPair}
					diffData={diffData}
					setDiffPair={setDiffPair}
					loadDiff={loadDiff}
					retry={loadHistory}
				/>
			);
		} else
			body = (
				<StatsView
					data={data}
					state={urlState}
					navigateTo={navigateTo}
					buildFiltersChange={(buildFilters) => updateUrlState({ buildFilters })}
				/>
			);
	}

	return (
		<main
			className={uiCss.class({
				maxWidth: 1180,
				margin: "0 auto",
				padding: "20px 24px 80px",

				"@media (max-width: 900px)": {
					"& header": {
						alignItems: "stretch",
						flexDirection: "column",
						gap: 10,
						padding: "12px 0 14px",
					},
					"& header nav": {
						marginLeft: 0,
						maxWidth: "100%",
						overflowX: "auto",
						padding: "2px 2px 5px",
						whiteSpace: "nowrap",
					},
					"& header nav button": { flex: "0 0 auto" },
					"& section": { minWidth: 0 },
					"& table": { display: "block", overflowX: "auto", whiteSpace: "nowrap" },
					"& thead": { width: "100%" },
					"& tbody": { width: "100%" },
				},
				"@media (max-width: 560px)": { "& h1": { fontSize: 16 } },
			})}
			aria-busy={loading}
		>
			<header>
				<h1>
					<span className={uiCss.class({ color: "var(--accent)" })}>◆</span> pandwind{" "}
					<span className={uiCss.class({ color: "var(--muted)", fontWeight: 400 })}>Inspector</span>
				</h1>
				<nav
					className={uiCss.class({ display: "flex", gap: 6, alignItems: "center" })}
					aria-label="Inspector views"
					role="tablist"
				>
					{INSPECTOR_TABS.map((tabId, index) => (
						<button
							key={tabId}
							type="button"
							id={`tab-${tabId}`}
							role="tab"
							aria-selected={tab === tabId}
							aria-controls="inspector-panel"
							tabIndex={tab === tabId ? 0 : -1}
							className={
								tab === tabId
									? uiCss.class({
											borderColor: "var(--accent-dim)",
											background: "color-mix(in srgb, var(--accent-dim) 18%, transparent)",
											color: "var(--accent)",
										})
									: undefined
							}
							onClick={() => changeTab(tabId)}
							onKeyDown={(event) => {
								if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
								event.preventDefault();
								const nextIndex =
									event.key === "Home"
										? 0
										: event.key === "End"
											? INSPECTOR_TABS.length - 1
											: (index + (event.key === "ArrowRight" ? 1 : -1) + INSPECTOR_TABS.length) %
												INSPECTOR_TABS.length;
								const nextTab = INSPECTOR_TABS[nextIndex]!;
								changeTab(nextTab);
								document.getElementById(`tab-${nextTab}`)?.focus();
							}}
						>
							{TAB_LABELS[tabId]}
						</button>
					))}
				</nav>
				<div className={uiCss.class({ display: "flex", gap: 6, alignItems: "center" })}>
					{data !== null && <AnalysisConfidenceBadge data={data} />}
					<button
						type="button"
						onClick={() => refresh(true)}
						disabled={loading}
						title="re-run analysis"
					>
						{loading ? "…" : "⟳ refresh"}
					</button>
					{data !== null && !loading && tab !== "history" && (
						<details
							className={uiCss.class({
								position: "relative",

								"& summary": {
									listStyle: "none",
									cursor: "pointer",
									padding: "0.35rem 0.7rem",
									border: "1px solid #2c2c34",
									borderRadius: 6,
									color: "inherit",
								},
								"& summary::-webkit-details-marker": { display: "none" },
								"&[open] summary": { background: "#1d1d24" },
							})}
						>
							<summary aria-label="Open export menu">⬇ export</summary>
							<div
								className={uiCss.class({
									position: "absolute",
									right: 0,
									top: "calc(100% + 4px)",
									minWidth: 220,
									display: "flex",
									flexDirection: "column",
									background: "#17171c",
									border: "1px solid #2c2c34",
									borderRadius: 8,
									zIndex: 20,
									boxShadow: "0 8px 24px rgb(0 0 0 / 45%)",

									"& button": {
										cursor: "pointer",
										border: "none",
										background: "transparent",
										color: "inherit",
										textAlign: "left",
										padding: "0.5rem 0.9rem",
										font: "inherit",
										fontSize: "0.85rem",
									},
									"& button:hover": { background: "#22222a" },
								})}
							>
								{tab === "tokens" ? (
									<>
										<button
											type="button"
											aria-label="Download tokens as DTCG JSON"
											title="Download tokens as DTCG JSON"
											disabled={data.interopTokens?.state !== "available"}
											onClick={async () => {
												try {
													const output = await InspectorApi.exportTokensDtcg();
													InspectorExport.downloadFile(
														"pandwind-tokens.tokens.json",
														output.text,
														"application/design-tokens+json",
													);
													if (output.resolverText !== undefined) {
														InspectorExport.downloadFile(
															"pandwind-tokens.resolver.json",
															output.resolverText,
															"application/design-tokens+json",
														);
													}
												} catch (error) {
													window.alert(error instanceof Error ? error.message : String(error));
												}
											}}
										>
											tokens — DTCG JSON
										</button>
										<button
											type="button"
											aria-label="Download CSS tokens as CSS"
											title="Download CSS tokens as CSS"
											onClick={() => {
												InspectorExport.downloadFile(
													"pandwind-css-tokens.css",
													`:root {
${InspectorExport.themeVarsToCss(data)}}
`,
													"text/css",
												);
											}}
										>
											CSS tokens — CSS
										</button>
										<button
											type="button"
											aria-label="Download style utilities as JSON"
											title="Download style utilities as JSON"
											onClick={() =>
												InspectorExport.downloadFile(
													"pandwind-style-utilities.json",
													InspectorExport.utilitiesToJson(data),
													"application/json",
												)
											}
										>
											style utilities — JSON
										</button>
									</>
								) : (
									<>
										<button
											type="button"
											aria-label="Download coverage as JSON"
											title="Download coverage as JSON"
											onClick={() =>
												InspectorExport.downloadFile(
													"pandwind-coverage.json",
													InspectorExport.coverageToJson(data),
													"application/json",
												)
											}
										>
											coverage — JSON
										</button>
										<button
											type="button"
											aria-label="Download per-file coverage as CSV"
											title="Download per-file coverage as CSV"
											onClick={() =>
												InspectorExport.downloadFile(
													"pandwind-coverage.csv",
													InspectorExport.coverageToCsv(data),
													"text/csv",
												)
											}
										>
											per-file coverage — CSV
										</button>
										<button
											type="button"
											aria-label="Download coverage report as Markdown"
											title="Download coverage report as Markdown"
											onClick={() =>
												InspectorExport.downloadFile(
													"pandwind-report.md",
													InspectorExport.coverageToMarkdown(data),
													"text/markdown",
												)
											}
										>
											report — Markdown
										</button>
										<button
											type="button"
											aria-label="Download coverage report as self-contained HTML"
											title="Download coverage report as self-contained HTML"
											onClick={() =>
												InspectorExport.downloadFile(
													"pandwind-report.html",
													InspectorExport.coverageToHtml(data, new Date().toISOString()),
													"text/html",
												)
											}
										>
											report — HTML (self-contained)
										</button>
									</>
								)}
							</div>
						</details>
					)}
				</div>
			</header>
			<div
				id="inspector-panel"
				className={uiCss.class({ outline: "none" })}
				role="tabpanel"
				aria-labelledby={`tab-${tab}`}
				tabIndex={-1}
				aria-busy={loading}
			>
				{loading && data !== null && (
					<div
						className={uiCss.class({ color: "var(--muted)", fontSize: 12, margin: "-8px 0 8px" })}
						role="status"
					>
						refreshing analysis…
					</div>
				)}
				{tab === "tokens" && error === null && (
					<nav
						className={uiCss.class({
							display: "flex",
							flexWrap: "wrap",
							gap: 6,
							margin: "0 0 18px",
							borderBottom: "1px solid var(--line)",

							"& a": {
								color: "var(--muted)",
								textDecoration: "none",
								padding: "8px 11px",
								fontSize: 13,
								borderBottom: "2px solid transparent",
							},
							"& a:hover": { color: "var(--text)" },
							"& a[aria-current='page']": {
								color: "var(--accent)",
								borderBottomColor: "var(--accent)",
							},
						})}
						aria-label="Token views"
					>
						{TOKEN_VIEWS.map((view) => (
							<a
								key={view.label}
								href={view.section === null ? "#tokens" : `#tokens/${view.section}`}
								aria-current={
									section === view.section ||
									(view.section === null && section !== "usage" && section !== "relationships")
										? "page"
										: undefined
								}
								onClick={(event) => {
									event.preventDefault();
									changeTokenView(view.section);
								}}
							>
								{view.label}
							</a>
						))}
					</nav>
				)}
				{body}
			</div>
		</main>
	);
}

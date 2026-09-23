import { useCallback, useEffect, useMemo, useState } from "react";
import { ui } from "./ui-css.ts";
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
	type TokenPolicySnapshot,
} from "pandwind-analyze/governance/browser";

import {
	INSPECTOR_TABS,
	readInspectorUrlState,
	serializeInspectorUrlState,
	type InspectorTab,
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
				copied ? `${props.className ?? ui.copy} ${ui.copied}` : (props.className ?? ui.copy)
			}
			aria-label={copied ? `copied ${props.text}` : `copy ${props.text}`}
			aria-live="polite"
			title={`copy ${props.text}`}
			onClick={copy}
		>
			<span aria-hidden="true">{copied ? "✓" : "⧉"}</span>
			<span className={ui.srOnly}>{copied ? "copied" : "copy"}</span>
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
			className={copied ? `${ui.swatch} ${ui.copied}` : ui.swatch}
			style={{ background: props.color }}
			aria-label={`${copied ? "Copied" : "Copy"} ${props.name}${props.mode === "base" ? "" : ` (${props.mode})`} color ${props.color}`}
			title={`${props.name}${props.mode === "base" ? "" : ` (${props.mode})`} = ${props.color} — click to copy`}
			onClick={copy}
		>
			<span className={ui.srOnly}>{copied ? "copied" : "copy"}</span>
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
		<div className={ui.searchRow}>
			<label className={ui.srOnly} htmlFor="inspector-search">
				Filter visible inspector data
			</label>
			<input
				id="inspector-search"
				className={ui.search}
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
				className={ui.searchClear}
				disabled={props.query === ""}
				aria-label="Clear search"
				onClick={() => props.queryChange("")}
			>
				clear
			</button>
			<span id="inspector-search-status" className={ui.searchMeta} role="status" aria-live="polite">
				{props.matchCount} of {props.totalCount} matches
			</span>
			<span id="inspector-search-hint" className={ui.srOnly}>
				Press slash to focus search.
			</span>
		</div>
	);
}

function ErrorState(props: { message: string; retry: () => void }) {
	return (
		<div className={ui.emptyState} role="alert">
			<div>
				<p className={ui.error}>{props.message}</p>
				<p className={ui.muted}>
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
			className={ui.loadingState}
			role="status"
			aria-live="polite"
			aria-label="Loading inspector data"
		>
			<div className={ui.skeletonGrid} aria-hidden="true">
				<div className={ui.skeletonCard} />
				<div className={ui.skeletonCard} />
				<div className={ui.skeletonCard} />
				<div className={ui.skeletonCard} />
			</div>
			<div className={ui.skeletonTable} aria-hidden="true" />
			<span className={ui.muted}>analyzing project…</span>
		</div>
	);
}

function Card(props: { label: string; value: string; sub?: string }) {
	return (
		<div className={ui.card}>
			<div className={ui.cardValue}>{props.value}</div>
			<div className={ui.cardLabel}>{props.label}</div>
			{props.sub !== undefined && <div className={ui.cardSub}>{props.sub}</div>}
		</div>
	);
}

/** Horizontal bar scaled against the max value in its set. */
function Bar(props: { label: string; value: number; max: number; suffix?: string }) {
	const pct = props.max > 0 ? Math.max(2, Math.round((props.value / props.max) * 100)) : 2;
	return (
		<div className={ui.barRow}>
			<span className={ui.barLabel}>{props.label}</span>
			<span className={ui.barTrack}>
				<span className={ui.barFill} style={{ width: `${pct}%` }} />
			</span>
			<span className={ui.barValue}>
				{props.value}
				{props.suffix ?? ""}
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
			<div className={ui.swatches}>
				{usable.map((s) => (
					<div className={ui.swatchCard} key={`${props.section.id}:${s.name}`}>
						<div className={ui.swatchModes}>
							{Object.entries(s.modes).map(([mode, color]) => (
								<SwatchButton key={mode} name={s.name} mode={mode} color={color} />
							))}
						</div>
						<div className={ui.swatchMeta}>
							<span className={ui.swatchName}>{stripDollar(s.name)}</span>
							<span className={ui.swatchChain}>
								{s.chain.length > 1 ? s.chain.join(" ← ") : Object.values(s.modes).join(" ")}
							</span>
						</div>
						<CopyButton text={stripDollar(s.name)} className={ui.swatchCardCopy} />
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
	const sectionLinks = [
		{ id: "sec-colors", label: "colors", visible: visibleColorEntries.length > 0 },
		{ id: "sec-semantic", label: "semantic", visible: visibleSemanticEntries.length > 0 },
		{ id: "sec-typography", label: "typography", visible: typographyVisible },
		{ id: "sec-spacing", label: "spacing", visible: visibleSpacingEntries.length > 0 },
		{ id: "sec-radii", label: "radii", visible: visibleRadiiEntries.length > 0 },
		{ id: "sec-utilities", label: "utilities", visible: visibleUtilities.length > 0 },
		{ id: "sec-theme-vars", label: "theme vars", visible: themeVisible },
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
			<section className={ui.cards}>
				<Card label="@theme variables" value={String(d.themeVars.length)} />
				<Card label="typed utility unions" value={String(d.utilities.length)} />
				<Card
					label="variants / conflicts / compose"
					value={`${d.variantCount}/${d.conflictUtilities}/${d.composeUtilities}`}
				/>
				<Card
					label="bridge"
					value={String(d.bridgeProperties)}
					sub={`${d.bridgeMappings} value mappings`}
				/>
			</section>

			<SearchControl
				query={props.query}
				queryChange={props.queryChange}
				matchCount={matchCount}
				totalCount={totalCount}
			/>

			{sectionLinks.length > 0 && (
				<nav className={ui.sectionNav}>
					{sectionLinks.map((link) => (
						<a
							key={link.id}
							className={ui.sectionNavLink}
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
						<div className={ui.typeSizes}>
							{visibleFontSizeEntries.map((e) => (
								<div className={ui.typeSizeRow} key={e.name}>
									<span className={ui.typeSizeSample} style={{ fontSize: e.value }}>
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
							<div className={ui.chipRow}>
								{visibleWeightEntries.map((e) => (
									<span className={ui.chip} key={e.name} style={{ fontWeight: Number(e.value) }}>
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
									<div className={ui.typeSizeRow} key={e.name}>
										<span className={ui.typeSizeSample} style={{ fontFamily: e.value }}>
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
									value: (row) => "Hamburgefonstiv 0123",
									render: (row) => (
										<span
											style={
												row.kind === "letter spacing"
													? { letterSpacing: row.value }
													: { lineHeight: row.value }
											}
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
					<div className={ui.radii}>
						{visibleRadiiEntries.map((e) => (
							<div className={ui.radiusDemo} key={e.name}>
								<div
									className={ui.radiusBox}
									style={{ borderRadius: e.value === "9999px" ? "9999px" : e.value }}
								/>
								<span>{e.name}</span>
								<code>{e.value}</code>
							</div>
						))}
					</div>
				</section>
			)}

			{visibleUtilities.length > 0 && (
				<section id="sec-utilities">
					<InspectorTable
						title="typed utility unions"
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
				</section>
			)}

			{themeVisible && (
				<section id="sec-theme-vars">
					<h2>@theme variables by category</h2>
					{visibleThemeGroups
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
															className={ui.miniSwatch}
															style={{ background: categorizeColor(variable) ?? "" }}
														/>
													)}
													<code>{variable.name}</code>
													{variable.scope !== undefined && <small> · {variable.scope}</small>}
												</>
											),
										},
										{ id: "scope", label: "scope", value: (variable) => variable.scope ?? ":root" },
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
						))}
				</section>
			)}
			{props.query !== "" && matchCount === 0 && (
				<p className={ui.emptyState}>No visible inspector data matches “{props.query}”.</p>
			)}
		</>
	);
}

/* ------------------------------ class drill-down ------------------------------ */

function ClassDrillDown(props: { data: InspectorPayload }) {
	const [open, setOpen] = useState<string | null>(null);
	const [query, setQuery] = useState("");
	const entries = props.data.classDrillDown.filter((entry) =>
		entry.candidate.toLowerCase().includes(query.trim().toLowerCase()),
	);

	if (props.data.classDrillDown.length === 0) return null;

	return (
		<section>
			<h2>class drill-down — rules per candidate</h2>
			<p>every rule the real Tailwind compiler emitted for a scanned class. click to expand.</p>
			<label className={ui.tableSearch}>
				<span className={ui.srOnly}>Search class candidates</span>
				<input
					className={ui.search}
					type="search"
					value={query}
					placeholder="Search class candidates…"
					aria-label="Search class candidates"
					onChange={(event) => setQuery(event.target.value)}
				/>
			</label>
			<p className={ui.muted} role="status" aria-live="polite">
				{entries.length} of {props.data.classDrillDown.length} candidates
			</p>
			<ul className={ui.sites}>
				{entries.map((d) => (
					<li key={d.candidate}>
						<button
							type="button"
							onClick={() => setOpen(open === d.candidate ? null : d.candidate)}
						>
							<code>{d.candidate}</code> — {d.rules.length} rule(s)
						</button>
						{open === d.candidate && (
							<pre>{d.rules.map((r) => `${r.selector} {\n  ${r.declarations}\n}`).join("\n")}</pre>
						)}
					</li>
				))}
			</ul>
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
				<div className={ui.emptyState} role="alert">
					<div>
						<p className={ui.error}>{props.error}</p>
						<p className={ui.muted}>
							The Inspector could not read saved runs. Check the Inspector server, then retry.
						</p>
						<button type="button" onClick={props.retry}>
							retry history
						</button>
					</div>
				</div>
			)}
			{(props.list ?? []).length < 2 && props.error === null && (
				<p className={ui.muted}>need at least 2 runs — hit refresh to snapshot another one.</p>
			)}
			{props.diffPair !== null && props.diffPair.a === props.diffPair.b && (
				<p className={ui.muted}>select two different runs to compare</p>
			)}
			<section>
				<h2>runs</h2>
				{(props.list ?? []).map((run) => (
					<label key={run.timestamp} style={{ display: "block", margin: "4px 0" }}>
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
										<p className={ui.good}>resolved: {d.resolvedDead.join(", ")}</p>
									)}
									{d.newDead.length > 0 && <p className={ui.warn}>new: {d.newDead.join(", ")}</p>}
								</>
							)}
						</section>
					);
				})()}
		</div>
	);
}

function StatsView(props: { data: InspectorPayload }) {
	const c = props.data.coverage;
	const valueCoverageByFile = new Map(
		(props.data.analytics?.fileValueCoverage ?? []).map((coverage) => [coverage.file, coverage]),
	);
	const fileGroups = {
		full: c.files.filter((file) => file.cxRuntime === 0 && file.cxFoldedPartial === 0).length,
		partial: c.files.filter((file) => file.cxRuntime === 0 && file.cxFoldedPartial > 0).length,
		runtime: c.files.filter((file) => file.cxRuntime > 0).length,
	};
	const valueCoverage = props.data.analytics?.valueCoverage;
	const maxPrefix = Math.max(...c.budget.perPrefix.map((p) => p.rules), 1);

	return (
		<>
			<div className={ui.statsGroups}>
				<section className={ui.statsGroup}>
					<h2>build-time folding</h2>
					<div className={ui.cards}>
						<Card
							label="cx eliminated"
							value={`${c.eliminatedPct}%`}
							sub={`${c.fullFolded} full · ${c.partialFolded} partial · ${c.runtimeCalls} runtime`}
						/>
						<Card
							label="files fully eliminated"
							value={`${c.entryEliminatedPct}%`}
							sub={`${c.totalCxCalls} cx calls across ${c.files.length} files`}
						/>
						<Card
							label="file outcomes"
							value={String(c.files.length)}
							sub={`${fileGroups.full} full · ${fileGroups.partial} partial · ${fileGroups.runtime} runtime`}
						/>
					</div>
				</section>
				<section className={ui.statsGroup}>
					<h2>stylesheet budget</h2>
					<div className={ui.cards}>
						<Card
							label="css budget"
							value={InspectorApi.kb(c.budget.cssBytes)}
							sub={`${InspectorApi.kb(c.budget.cssGzipBytes)} gzip · ${c.budget.rules} rules`}
						/>
						<Card
							label="missing-css warnings"
							value={String(c.totalMissingCss)}
							sub={`dead candidates: ${c.budget.deadCandidates}`}
						/>
						{valueCoverage !== undefined && (
							<Card
								label="tokenized authored values"
								value={`${valueCoverage.tokenPct}%`}
								sub={`${valueCoverage.tokenValues} token · ${valueCoverage.literalValues} literal · ${valueCoverage.dynamicValues} dynamic`}
							/>
						)}
					</div>
				</section>
			</div>

			<section>
				<h2>css budget — rule distribution by prefix</h2>
				{c.budget.perPrefix.slice(0, 12).map((p) => (
					<Bar key={p.prefix} label={p.prefix} value={p.rules} max={maxPrefix} />
				))}
			</section>

			{c.shape !== undefined && (
				<section>
					<h2>stylesheet shape</h2>
					<p className={ui.muted}>
						{c.shape.totalRules} rules · {InspectorApi.kb(c.shape.totalBytes)} compiled
					</p>
					{c.shape.categories.map((cat) => {
						const maxBytes = Math.max(...c.shape.categories.map((x) => x.bytes), 1);
						return (
							<div key={cat.category} className={ui.shapeCat}>
								<div className={ui.shapeHead}>
									<strong>{cat.category}</strong>
									<span>
										{cat.rules} rules · {InspectorApi.kb(cat.bytes)}
									</span>
								</div>
								<Bar label="bytes" value={cat.bytes} max={maxBytes} />
								<div className={ui.shapeValues}>
									{cat.topValues.map((tv) => (
										<span key={tv.value} className={ui.chip}>
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
				title="per-file fold coverage"
				rows={c.files}
				rowKey={(file) => file.file}
				columns={[
					{ id: "file", label: "file", value: (file) => file.file },
					{
						id: "eliminatedPct",
						label: "eliminated %",
						value: (file) => file.eliminatedPct,
						render: (file) => <span className={ui.pct}>{file.eliminatedPct}%</span>,
					},
					{
						id: "foldCounts",
						label: "full / part / runtime",
						value: (file) => `${file.cxFoldedFull}/${file.cxFoldedPartial}/${file.cxRuntime}`,
					},
					{ id: "runtime", label: "runtime", value: (file) => file.cxRuntime },
					{
						id: "tokenLiteral",
						label: "token / literal",
						value: (file) => {
							const coverage = valueCoverageByFile.get(file.file);
							return coverage === undefined
								? "—"
								: `${coverage.tokenPct}% / ${coverage.literalPct}%`;
						},
					},
					{ id: "missingCss", label: "missing CSS", value: (file) => file.missingCssCount },
				]}
				filters={[
					{
						id: "fold",
						label: "fold outcome",
						value: (file) =>
							file.cxRuntime > 0 ? "runtime" : file.cxFoldedPartial > 0 ? "partial" : "full",
					},
					{
						id: "missingCss",
						label: "missing CSS",
						value: (file) => (file.missingCssCount > 0 ? "present" : "none"),
					},
				]}
				defaultSort={{ columnId: "eliminatedPct", direction: "ascending" }}
				defaultOpen={false}
				tableClassName={ui.stickyTable}
			/>

			<ClassDrillDown data={props.data} />

			{props.data.cssSources.length > 0 && (
				<section>
					<h2>CSS-in-JS provenance</h2>
					<p className={ui.muted}>
						Source calls and the semantic rules emitted for each call site.
					</p>
					<ul className={ui.sites}>
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

			{c.missingCssSites.length > 0 && (
				<section>
					<h2>missing-css sites</h2>
					<ul className={ui.sites}>
						{c.missingCssSites.map((s) => (
							<li key={`${s.file}:${s.line}:${s.token}`}>
								<a href={InspectorApi.vscodeLink(props.data.meta.root, s.file, s.line)}>
									{s.file}:{s.line}
								</a>{" "}
								— no Tailwind candidate for <code>{s.token}</code>
							</li>
						))}
					</ul>
				</section>
			)}

			{c.runtimeSites.length > 0 && (
				<section>
					<h2>runtime cx() sites</h2>
					<ul className={ui.sites}>
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
function TokenGraphView({ data }: { data: InspectorPayload }) {
	const graph = data.tokenGraph;
	const initialId = mostConnectedTokenId(graph);
	const initialNode = graph.nodes.find((node) => node.id === initialId);
	const [focusedId, setFocusedId] = useState<string | null>(initialId);
	const [searchValue, setSearchValue] = useState(
		initialNode === undefined ? "" : presentTokenNode(initialNode).label,
	);
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
		title: string,
		description: string,
		nodes: TokenGraph["nodes"],
		emptyMessage: string,
	) => (
		<section className={ui.relationshipColumn}>
			<h3>{title}</h3>
			<p className={ui.muted}>{description}</p>
			{nodes.length > 0 ? (
				<ul className={ui.relationshipList}>
					{nodes.map((node) => {
						const presentation = presentTokenNode(node);
						return (
							<li key={node.id}>
								<button
									type="button"
									className={ui.relationshipNode}
									style={{ borderColor: TIER_COLOR[node.tier] }}
									aria-label={`Focus ${presentation.label}, ${node.tier} token`}
									onClick={() => {
										setFocusedId(node.id);
										setSearchValue(presentation.label);
									}}
								>
									<code>{presentation.label}</code>
									<span className={ui.relationshipTier}>{node.tier}</span>
								</button>
							</li>
						);
					})}
				</ul>
			) : (
				<p className={ui.relationshipEmpty}>{emptyMessage}</p>
			)}
		</section>
	);

	if (graph.nodes.length === 0) {
		return (
			<div className={ui.wrap}>
				<h2>Token relationships</h2>
				<p className={ui.muted}>No theme variables or component mappings were found.</p>
			</div>
		);
	}
	return (
		<div className={ui.wrap}>
			<h2>Token relationships</h2>
			<p className={ui.muted}>
				Follow direct references for one token at a time. Choose another token in either column to
				continue through the graph.
			</p>
			<section className={ui.cards}>
				<Card label="tokens and mappings" value={String(graph.nodes.length)} />
				<Card label="direct references" value={String(graph.edges.length)} />
				<Card
					label="unlinked variables"
					value={String(graph.orphans.length)}
					sub="not referenced by another token here"
				/>
				{(graph.cycles.length > 0 || graph.dangling.length > 0) && (
					<Card
						label="cycles / missing references"
						value={`${graph.cycles.length} / ${graph.dangling.length}`}
					/>
				)}
			</section>
			<div className={ui.relationshipSearch}>
				<label htmlFor="token-relationship-search">Find a token</label>
				<input
					id="token-relationship-search"
					className={ui.search}
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
						if (match !== undefined) setFocusedId(match.id);
					}}
				/>
				<datalist id="token-relationship-options">
					{graph.nodes.map((node) => (
						<option key={node.id} value={presentTokenNode(node).label} label={node.tier} />
					))}
				</datalist>
				<p id="token-relationship-hint" className={ui.muted}>
					Choose a suggestion to focus it. Each relationship link is also keyboard accessible.
				</p>
			</div>
			{selectedNode !== undefined && relationships !== null && (
				<div className={ui.relationshipLayout}>
					{renderRelationList(
						"Used by",
						"Mappings and tokens that refer to this token.",
						relationships.usedBy,
						"Nothing in the generated graph refers to this token.",
					)}
					<article className={ui.relationshipCurrent}>
						<span className={ui.relationshipTier} style={{ color: TIER_COLOR[selectedNode.tier] }}>
							{selectedNode.tier} token
						</span>
						<h3>
							<code>{selectedPresentation?.label}</code>
						</h3>
						{themeVar !== undefined && (
							<code className={ui.relationshipValue}>{themeVar.value}</code>
						)}
						<p className={ui.cardSub}>
							{relationships.usedBy.length} dependents · {relationships.references.length}{" "}
							references
						</p>
						{relationships.isCyclic && (
							<p className={ui.warn}>Part of a cycle. The emitter skips cyclic references.</p>
						)}
						{relationships.isUnlinkedRaw && (
							<p className={ui.muted}>
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
						"References",
						"Tokens this value or component mapping depends on.",
						relationships.references,
						"This token does not reference another graph node.",
					)}
				</div>
			)}
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
			? ui.confidenceVerified
			: confidence.level === "conservative"
				? ui.confidenceConservative
				: ui.confidenceScan;
	return (
		<details className={ui.confidenceDetails}>
			<summary className={`${ui.confidenceBadge} ${tone}`}>
				<span aria-hidden="true">●</span> {confidence.label} analysis
			</summary>
			<div className={ui.confidencePopover}>
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

function UsageView(props: { data: InspectorPayload }) {
	const a = props.data.analytics;
	const crawl = props.data.cssCrawl;
	if (a === undefined) {
		return (
			<div>
				<p className={ui.muted}>no analytics in this snapshot — hit refresh.</p>
			</div>
		);
	}
	return (
		<div>
			<section>
				<h2>usage overview</h2>
				<p className={ui.muted}>
					{a.sitesScanned} styling call site(s) scanned
					{crawl !== undefined && ` · ${crawl.files} css file(s) crawled`}
					{crawl !== undefined &&
						crawl.unresolved.length > 0 &&
						` · ${crawl.unresolved.length} unresolved import(s)`}
				</p>
				<div className={ui.cards}>
					<Card label="responsive" value={pct(a.conditionBreakdown.responsive)} />
					<Card label="pseudo" value={pct(a.conditionBreakdown.pseudo)} />
					<Card label="media" value={pct(a.conditionBreakdown.media)} />
					<Card label="other" value={pct(a.conditionBreakdown.other)} />
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
					title="conditions"
					rows={a.conditions}
					rowKey={(condition) => condition.name}
					columns={[
						{ id: "condition", label: "condition", value: (condition) => condition.name },
						{ id: "kind", label: "kind", value: (condition) => condition.kind },
						{ id: "uses", label: "uses", value: (condition) => condition.count },
					]}
					filters={[{ id: "kind", label: "kind", value: (condition) => condition.kind }]}
					defaultSort={{ columnId: "uses", direction: "descending" }}
				/>
			</section>
			<TokenUsageIntelligence data={props.data} />
			<ContrastWarningsView warnings={props.data.contrastWarnings ?? []} />
			<ContrastPairView data={props.data} />
			<CleanupReportView data={props.data} />
			<AnalyticsHistoryChart />
		</div>
	);
}

function TokenUsageIntelligence({ data }: { data: InspectorPayload }) {
	const usage = buildTokenUsageData(data);
	const total = usage.rows.length;
	const used = usage.rows.filter((row) => row.count > 0).length;
	const hot = usage.rows.filter((row) => row.status === "hot");
	const maxHotUses = Math.max(...hot.map((row) => row.count), 1);
	const groupStats = data.designSystem.tokenSections
		.map((section) => {
			const rows = usage.rows.filter((row) => row.group === section.id);
			return {
				label: section.label,
				used: rows.filter((row) => row.count > 0).length,
				total: rows.length,
			};
		})
		.filter((group) => group.total > 0);
	const coverage = total === 0 ? 0 : Math.round((used / total) * 100);
	return (
		<section>
			<h2>token intelligence</h2>
			<p className={ui.muted}>
				Authored shorthand is normalized to its catalog group before usage is compared. “Not
				observed” is an analysis result, not an automatic removal recommendation.
			</p>
			<div className={ui.cards}>
				<Card
					label="catalog coverage"
					value={total === 0 ? "—" : `${used}/${total}`}
					sub={total === 0 ? "no token catalog loaded" : `${coverage}% observed`}
				/>
				<Card label="hot tokens" value={String(hot.length)} sub="most-used catalog entries" />
				<Card
					label="not observed"
					value={String(total - used)}
					sub="catalog entries not seen in this scan"
				/>
			</div>
			{groupStats.length > 0 && (
				<div className={ui.usageCoverage} aria-label="token coverage by category">
					{groupStats.map((group) => (
						<Bar
							key={group.label}
							label={group.label}
							value={group.used}
							max={group.total}
							suffix={` / ${group.total}`}
						/>
					))}
				</div>
			)}
			{hot.length > 0 && (
				<div className={ui.usageHot}>
					<h3>hot tokens</h3>
					{hot.map((row) => (
						<Bar
							key={row.id}
							label={tokenLabel(row.group, row.name)}
							value={row.count}
							max={maxHotUses}
						/>
					))}
				</div>
			)}
			<InspectorTable
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
							<span className={row.status === "unused" ? ui.muted : ui.good}>
								{row.status === "unused" ? "not observed" : row.status}
							</span>
						),
					},
				]}
				filters={[
					{
						id: "activity",
						label: "activity",
						value: (row) =>
							row.count === 0 ? "not observed" : row.status === "hot" ? "hot" : "used",
					},
					{ id: "category", label: "category", value: (row) => row.groupLabel },
				]}
				defaultSort={{ columnId: "uses", direction: "descending" }}
			/>
			{usage.unknown.length > 0 && (
				<details className={ui.unknownTokens}>
					<summary>observed outside the loaded catalog ({usage.unknown.length})</summary>
					<p className={ui.muted}>
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
}: {
	warnings: NonNullable<InspectorPayload["contrastWarnings"]>;
}) {
	if (warnings.length === 0) {
		return (
			<section>
				<h2>wcag contrast</h2>
				<p className={ui.muted}>no text/background pairs below 4.5:1 found.</p>
			</section>
		);
	}
	return (
		<section>
			<h2>wcag contrast — {warnings.length} warning(s)</h2>
			<p className={ui.muted}>
				text/background pairs within one call site. &lt;4.5 fails normal text; &lt;3 also fails
				large text.
			</p>
			<InspectorTable
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
								style={{ color: row.warning.severity === "fail-large" ? "#ef4444" : "#d97706" }}
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
				<p className={ui.muted}>
					A resolved color catalog is required for focused contrast checks.
				</p>
			</section>
		);
	}
	const evaluation = evaluateContrastPair(foreground, background, colorValues);
	const statusClass =
		evaluation?.status === "pass"
			? ui.good
			: evaluation?.status === "fail-large"
				? ui.error
				: ui.warn;
	return (
		<section>
			<h2>check a palette pair</h2>
			<p className={ui.muted}>
				Choose one text and one background token. This keeps palette accessibility useful without
				producing an all-colors matrix.
			</p>
			<div className={ui.contrastControls}>
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
				<p className={ui.muted}>The selected values could not be resolved to colors.</p>
			) : (
				<div className={ui.contrastResult} role="status" aria-live="polite">
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
			<p className={ui.muted}>
				Previews a .changeset file for {unusedCount} token(s) classified safe by reachability
				analysis. The preview is read-only; nothing is written server-side, and it still needs human
				review.
			</p>
			<button type="button" onClick={generate} disabled={busy || unusedCount === 0}>
				{busy ? "generating…" : `generate removal preview (${unusedCount})`}
			</button>{" "}
			{error !== null && (
				<div role="alert">
					<p className={ui.error}>{error}</p>
					<p className={ui.muted}>
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
			{content !== null && <pre className={ui.card}>{content}</pre>}
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
function CleanupReportView(props: { data: InspectorPayload }) {
	const g = props.data.governance;
	if (g === undefined) {
		return (
			<section>
				<h2>cleanup assessment</h2>
				<p className={ui.muted}>
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
	return (
		<div>
			<section>
				<h2>cleanup assessment</h2>
				<p className={ui.muted}>
					These counts use the analyzer’s reachable-token report, not the catalog coverage above. A
					candidate is a review classification, not approval to delete it; scan boundaries are shown
					before any removal preview.
				</p>
			</section>
			{s.boundaries["configuration-failure"] > 0 && (
				<section>
					<h2>configuration incomplete</h2>
					<p className={ui.muted}>
						The project configuration could not be fully evaluated, so usage evidence is incomplete.
						Treat these tokens as “not observed” rather than “unused.”
					</p>
				</section>
			)}
			<section className={ui.cards}>
				<Card label="in analyzer scope" value={String(s.defined)} />
				<Card label="reachable" value={String(s.used)} />
				<Card label="cleanup candidates" value={String(s.unusedCandidates)} />
				<Card label="safe by analysis" value={String(s.safeToRemove)} />
				<Card label="needs review" value={String(s.reviewRequired)} />
				<Card label="kept" value={String(s.notRemovable)} />
				<Card label="strict issues" value={String(s.strictViolations)} />
				<Card label="raw values allowed" value={String(s.rawAllowed)} />
				<Card label="policy unknown" value={String(s.unknownStrictness)} />
				<Card label="exact suggestions" value={String(s.suggestions)} />
			</section>
			{nonZeroBoundaries.length > 0 && (
				<section>
					<h2>coverage boundaries</h2>
					<p className={ui.muted}>
						conditions that prevent a definitive usage claim — nothing behind these is classified as
						safe-to-remove.
					</p>
					<div className={ui.chipRow}>
						{nonZeroBoundaries.map((b) => (
							<span className={ui.chip} key={b}>
								{b} ({s.boundaries[b]})
							</span>
						))}
					</div>
				</section>
			)}
			<section>
				<h2>resolved cleanup policy</h2>
				{policy === null ? (
					<p className={ui.muted}>
						no policy resolved — strictness is report-only/fail-open (unknown).
					</p>
				) : policy.resolved ? (
					<dl className={ui.definitionGrid}>
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
					<p className={ui.muted}>
						policy for {policy.owner} could not be resolved — all strictness is unknown.
					</p>
				)}
			</section>
			<section>
				<p className={ui.muted}>
					zero reachable usage after alias/composition/generated-artifact/export analysis — safety
					is a classification, not a deletion approval.
				</p>
				<InspectorTable
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
								<span style={{ color: SAFETY_COLOR[candidate.safety] }}>{candidate.safety}</span>
							),
						},
						{
							id: "reasons",
							label: "reasons / boundaries",
							value: (candidate) => candidate.reasons.join("; ") || "—",
						},
					]}
					filters={[{ id: "safety", label: "safety", value: (candidate) => candidate.safety }]}
					defaultOpen={false}
				/>
			</section>
			{suggestions.length > 0 && (
				<section>
					<p className={ui.muted}>
						each suggestion is an exact resolved-value match with a legal spelling for the property;
						ambiguous matches are rejected, not ranked.
					</p>
					<InspectorTable
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
							{ id: "confidence", label: "confidence", value: (row) => row.suggestion.confidence },
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
				</section>
			)}
			{g.diagnostics.length > 0 && (
				<section>
					<InspectorTable
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
										style={{
											color:
												row.diagnostic.severity === "error"
													? "#ef4444"
													: row.diagnostic.severity === "warning"
														? "#d97706"
														: "#64748b",
										}}
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
				</section>
			)}
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
				<p className={ui.error}>{error}</p>
				<p className={ui.muted}>
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
				<p className={ui.muted}>
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
				style={{ minWidth: `${HISTORY_W}px` }}
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
			<p className={ui.muted}>
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
		(next: Partial<typeof urlState>): void => {
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
	const changeTab = useCallback(
		(next: InspectorTab): void => updateUrlState({ tab: next, section: null }),
		[updateUrlState],
	);
	const queryChange = useCallback(
		(value: string): void => updateUrlState({ query: value }),
		[updateUrlState],
	);
	const sectionChange = useCallback(
		(next: string): void => updateUrlState({ tab: "tokens", section: next }),
		[updateUrlState],
	);
	const changeTokenView = useCallback(
		(section: string | null): void => updateUrlState({ tab: "tokens", section }),
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
					<UsageView data={data} />
				) : section === "relationships" ? (
					<TokenGraphView data={data} />
				) : (
					<DesignSystemView
						data={data}
						query={query}
						queryChange={queryChange}
						section={section}
						sectionChange={sectionChange}
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
		} else body = <StatsView data={data} />;
	}

	return (
		<main className={ui.wrap} aria-busy={loading}>
			<header>
				<h1>
					<span className={ui.brandMark}>◆</span> pandwind{" "}
					<span className={ui.brandThin}>Inspector</span>
				</h1>
				<nav className={ui.tabList} aria-label="Inspector views" role="tablist">
					{INSPECTOR_TABS.map((tabId, index) => (
						<button
							key={tabId}
							type="button"
							id={`tab-${tabId}`}
							role="tab"
							aria-selected={tab === tabId}
							aria-controls="inspector-panel"
							tabIndex={tab === tabId ? 0 : -1}
							className={tab === tabId ? ui.active : undefined}
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
				<div className={ui.headerActions}>
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
						<details className={ui.exportMenu}>
							<summary aria-label="Open export menu">⬇ export</summary>
							<div className={ui.exportItems}>
								{tab === "tokens" ? (
									<>
										<button
											type="button"
											aria-label="Download tokens as DTCG JSON"
											title="Download tokens as DTCG JSON"
											onClick={() =>
												InspectorExport.downloadFile(
													"pandwind-tokens.json",
													InspectorExport.tokensToDtcg(data),
													"application/json",
												)
											}
										>
											tokens — DTCG JSON
										</button>
										<button
											type="button"
											aria-label="Download theme variables as CSS"
											title="Download theme variables as CSS"
											onClick={() => {
												InspectorExport.downloadFile(
													"pandwind-theme-vars.css",
													`:root {
${InspectorExport.themeVarsToCss(data)}}
`,
													"text/css",
												);
											}}
										>
											theme vars — CSS
										</button>
										<button
											type="button"
											aria-label="Download utility unions as JSON"
											title="Download utility unions as JSON"
											onClick={() =>
												InspectorExport.downloadFile(
													"pandwind-unions.json",
													InspectorExport.utilitiesToJson(data),
													"application/json",
												)
											}
										>
											unions — JSON
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
				className={ui.tabPanel}
				role="tabpanel"
				aria-labelledby={`tab-${tab}`}
				tabIndex={-1}
				aria-busy={loading}
			>
				{loading && data !== null && (
					<div className={ui.refreshing} role="status">
						refreshing analysis…
					</div>
				)}
				{tab === "tokens" && error === null && (
					<nav className={ui.tokenViewNav} aria-label="Token views">
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

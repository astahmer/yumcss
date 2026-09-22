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
import type { StudioPayload, ThemeVar, TokenSection, TokenGraph, TokenTier } from "./types.ts";
import {
	authoredTokenSpelling,
	type GovernanceCoverageBoundary,
	type RawTokenSuggestion,
	type RemovalSafety,
	type TokenPolicySnapshot,
	type UnusedTokenCandidate,
} from "pandwind-analyze/governance/browser";

import {
	INSPECTOR_TABS,
	readInspectorUrlState,
	serializeInspectorUrlState,
	type InspectorTab,
} from "./lib/url-state.ts";

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
			<label className={ui.srOnly} htmlFor="studio-search">
				Filter visible inspector data
			</label>
			<input
				id="studio-search"
				className={ui.search}
				type="search"
				placeholder="filter tokens & utilities…"
				value={props.query}
				aria-label="Filter visible inspector data"
				aria-controls="studio-panel"
				aria-describedby="studio-search-status studio-search-hint"
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
			<span id="studio-search-status" className={ui.searchMeta} role="status" aria-live="polite">
				{props.matchCount} of {props.totalCount} matches
			</span>
			<span id="studio-search-hint" className={ui.srOnly}>
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
	data: StudioPayload;
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
							href={`#design/${link.id}`}
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
											{e.name}: Pandwind studio preview 123
										</span>
										<code>{e.value}</code>
									</div>
								))}
							</div>
						</>
					)}

					{(visibleLineHeightEntries.length > 0 || visibleTrackingEntries.length > 0) && (
						<>
							<h3>line heights & letter spacings</h3>
							<table>
								<tbody>
									{[
										...visibleLineHeightEntries.map((x) => ({ ...x, _k: "lh-" + x.name })),
										...visibleTrackingEntries.map((x) => ({ ...x, _k: "ls-" + x.name })),
									].map((e) => (
										<tr key={e._k}>
											<td>
												<code>{e.name}</code>
											</td>
											<td>{e.value}</td>
											<td className={ui.sample}>
												<span
													style={
														e.value.includes("em")
															? { letterSpacing: e.value }
															: { lineHeight: e.value }
													}
												>
													Hamburgefonstiv 0123
												</span>
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</>
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
					<h2>typed utility unions</h2>
					<table>
						<thead>
							<tr>
								<th>key</th>
								<th>values</th>
								<th>sample</th>
								<th>open</th>
							</tr>
						</thead>
						<tbody>
							{visibleUtilities.map((u) => (
								<tr key={u.key}>
									<td>{u.key}</td>
									<td>{u.count}</td>
									<td className={ui.sample}>{u.sample.join(", ")}</td>
									<td>{u.openEnded ? "∞" : ""}</td>
								</tr>
							))}
						</tbody>
					</table>
				</section>
			)}

			{themeVisible && (
				<section id="sec-theme-vars">
					<h2>@theme variables by category</h2>
					{visibleThemeGroups
						.filter(([, vars]) => vars.length > 0)
						.map(([category, vars]) => (
							<div key={category}>
								<h3>
									{category} · {vars.length}
								</h3>
								<table>
									<tbody>
										{vars.map((v: ThemeVar) => (
											<tr key={`${v.scope ?? ":root"}:${v.name}`}>
												<td>
													{categorizeColor(v) !== null ? (
														<span
															className={ui.miniSwatch}
															style={{ background: categorizeColor(v) ?? "" }}
														/>
													) : null}
													<code>{v.name}</code>
													{v.scope !== undefined ? <small> · {v.scope}</small> : null}
												</td>
												<td>{v.value}</td>
											</tr>
										))}
									</tbody>
								</table>
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

function ClassDrillDown(props: { data: StudioPayload; query: string }) {
	const [open, setOpen] = useState<string | null>(null);
	const q = props.query.toLowerCase();
	const entries = props.data.classDrillDown.filter((d) => d.candidate.toLowerCase().includes(q));

	if (entries.length === 0) return null;

	return (
		<section>
			<h2>class drill-down — rules per candidate</h2>
			<p>every rule the real Tailwind compiler emitted for a scanned class. click to expand.</p>
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
							History is optional and may be disabled for this project. Check the Inspector server,
							then retry.
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
							<h2>
								diff — older ({props.diffData.a.timestamp}) → newer ({props.diffData.b.timestamp})
							</h2>
							<table>
								<thead>
									<tr>
										<th>metric</th>
										<th>before</th>
										<th>after</th>
										<th>delta</th>
									</tr>
								</thead>
								<tbody>
									{[...d.coverage, ...d.budget].map((m) => (
										<tr key={m.label}>
											<td>{m.label}</td>
											<td>{m.before}</td>
											<td>{m.after}</td>
											<td>
												{m.delta > 0 ? "+" : ""}
												{m.delta}
											</td>
										</tr>
									))}
									<tr>
										<td>missing-css delta</td>
										<td />
										<td />
										<td>
											{d.missingCssDelta > 0 ? "+" : ""}
											{d.missingCssDelta}
										</td>
									</tr>
								</tbody>
							</table>
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

function StatsView(props: {
	data: StudioPayload;
	query: string;
	queryChange: (value: string) => void;
}) {
	const c = props.data.coverage;
	const [sortKey, setSortKey] = useState<"file" | "eliminatedPct" | "cxRuntime">("eliminatedPct");
	const [asc, setAsc] = useState(true);
	const q = props.query.toLowerCase();
	const valueCoverageByFile = new Map(
		(props.data.analytics?.fileValueCoverage ?? []).map((coverage) => [coverage.file, coverage]),
	);
	const fileGroups = {
		full: c.files.filter((file) => file.cxRuntime === 0 && file.cxFoldedPartial === 0).length,
		partial: c.files.filter((file) => file.cxRuntime === 0 && file.cxFoldedPartial > 0).length,
		runtime: c.files.filter((file) => file.cxRuntime > 0).length,
	};
	const valueCoverage = props.data.analytics?.valueCoverage;

	const sortedFiles = [...c.files]
		.filter((f) => f.file.toLowerCase().includes(q))
		.toSorted((a, b) => {
			const dir = asc ? 1 : -1;
			if (sortKey === "file") return a.file.localeCompare(b.file) * dir;
			return (a[sortKey] - b[sortKey]) * dir;
		});
	const maxPrefix = Math.max(...c.budget.perPrefix.map((p) => p.rules), 1);

	const sortHeader = (key: "file" | "eliminatedPct" | "cxRuntime", label: string) => (
		<th aria-sort={sortKey === key ? (asc ? "ascending" : "descending") : "none"}>
			<button
				type="button"
				className={ui.sortButton}
				onClick={() => {
					if (sortKey === key) setAsc(!asc);
					else {
						setSortKey(key);
						setAsc(key === "file");
					}
				}}
			>
				{label}
				{sortKey === key ? (asc ? " ▲" : " ▼") : ""}
			</button>
		</th>
	);

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

			<SearchControl
				query={props.query}
				queryChange={props.queryChange}
				matchCount={sortedFiles.length}
				totalCount={c.files.length}
			/>

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

			<section>
				<h2>per-file fold coverage</h2>
				<table className={ui.stickyTable}>
					<thead>
						<tr>
							{sortHeader("file", "file")}
							{sortHeader("eliminatedPct", "eliminated %")}
							<th>full/part/runtime</th>
							{sortHeader("cxRuntime", "runtime")}
							<th>token / literal</th>
							<th>missing-css</th>
						</tr>
					</thead>
					<tbody>
						{sortedFiles.map((f) => (
							<tr key={f.file}>
								<td>{f.file}</td>
								<td>
									<span className={ui.pct}>{f.eliminatedPct}%</span>
								</td>
								<td>{`${f.cxFoldedFull}/${f.cxFoldedPartial}/${f.cxRuntime}`}</td>
								<td>{f.cxRuntime}</td>
								<td>
									{valueCoverageByFile.get(f.file) === undefined
										? "—"
										: `${valueCoverageByFile.get(f.file)!.tokenPct}% / ${valueCoverageByFile.get(f.file)!.literalPct}%`}
								</td>
								<td>{f.missingCssCount}</td>
							</tr>
						))}
					</tbody>
				</table>
			</section>

			<ClassDrillDown data={props.data} query={props.query} />

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

const TIER_ORDER: Array<TokenTier> = ["component", "scope", "semantic", "raw"];
const TIER_COLOR: Record<TokenTier, string> = {
	component: "#7c5cff",
	scope: "#d97706",
	semantic: "#0ea5e9",
	raw: "#64748b",
};
const NODE_W = 190;
const NODE_H = 26;
const COL_W = 250;
const ROW_H = 38;

function TokenGraphView({ graph }: { graph: TokenGraph }) {
	const [selected, setSelected] = useState<string | null>(null);
	if (graph.nodes.length === 0) {
		return (
			<div className={ui.wrap}>
				<h2>token graph</h2>
				<p className={ui.muted}>no theme variables found in the generated bridge.</p>
			</div>
		);
	}
	const columns = TIER_ORDER.map((tier) =>
		graph.nodes.filter((n) => n.tier === tier).toSorted((a, b) => a.label.localeCompare(b.label)),
	).filter((col) => col.length > 0);
	const width = columns.length * COL_W + 80;
	const height = Math.max(...columns.map((c) => c.length)) * ROW_H + 60;

	const pos = new Map<string, { x: number; y: number }>();
	columns.forEach((col, ci) => {
		col.forEach((node, ri) => {
			pos.set(node.id, { x: ci * COL_W + 40, y: (height - col.length * ROW_H) / 2 + ri * ROW_H });
		});
	});

	const byId = new Map(graph.nodes.map((n) => [n.id, n]));
	const cyclesSet = new Set(graph.cycles.flat());

	return (
		<div className={ui.wrap}>
			<h2>token graph</h2>
			<p className={ui.muted}>
				{graph.nodes.length} nodes · {graph.edges.length} edges · {graph.cycles.length} cycle(s) ·{" "}
				{graph.dangling.length} dangling · {graph.orphans.length} orphaned raws
			</p>
			{selected !== null && byId.has(selected) ? (
				<div className={ui.card}>
					<div className={ui.cardValue}>{selected}</div>
					<div className={ui.cardSub}>
						tier: {byId.get(selected)!.tier}
						{graph.reachability[selected] !== undefined
							? ` · resolves to: ${graph.reachability[selected]!.join(", ")}`
							: ""}
						{cyclesSet.has(selected) ? " · ⚠ part of a cycle (skipped at emission)" : ""}
						{graph.dangling.includes(selected) ? " · ⚠ dangling reference" : ""}
					</div>
				</div>
			) : null}
			<svg
				width="100%"
				viewBox={`0 0 ${width} ${height}`}
				style={{ background: "transparent", minWidth: `${width}px` }}
				role="img"
				aria-label="token reference graph"
			>
				<defs>
					<marker
						id="tg-arrow"
						viewBox="0 0 10 10"
						refX="9"
						refY="5"
						markerWidth="6"
						markerHeight="6"
						orient="auto-start-reverse"
					>
						<path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
					</marker>
				</defs>
				{graph.edges.map((e) => {
					const a = pos.get(e.from);
					const b = pos.get(e.to);
					if (a === undefined || b === undefined) return null;
					const x1 = a.x + NODE_W;
					const y1 = a.y + NODE_H / 2;
					const x2 = b.x;
					const y2 = b.y + NODE_H / 2;
					const isCycle = cyclesSet.has(e.from) && cyclesSet.has(e.to);
					return (
						<path
							key={`${e.from}->${e.to}`}
							d={`M ${x1} ${y1} C ${x1 + COL_W / 2} ${y1}, ${x2 - COL_W / 2} ${y2}, ${x2 - 4} ${y2}`}
							fill="none"
							stroke={isCycle ? "#ef4444" : "#94a3b8"}
							strokeWidth={isCycle ? 1.8 : 1}
							markerEnd="url(#tg-arrow)"
							opacity={0.7}
						/>
					);
				})}
				{[...pos.entries()].map(([id, p]) => {
					const node = byId.get(id)!;
					const isCyc = cyclesSet.has(id);
					return (
						<g
							key={id}
							transform={`translate(${p.x}, ${p.y})`}
							style={{ cursor: "pointer" }}
							onClick={() => setSelected(id)}
						>
							<rect
								width={NODE_W}
								height={NODE_H}
								rx={6}
								fill={isCyc ? "#450a0a" : "#111827"}
								stroke={TIER_COLOR[node.tier] ?? "#64748b"}
								strokeWidth={isCyc ? 2 : 1}
							/>
							<text x={8} y={17} fill="#e5e7eb" fontSize={11} fontFamily="monospace">
								{node.label.length > 28 ? `${node.label.slice(0, 27)}…` : node.label}
							</text>
						</g>
					);
				})}
			</svg>
		</div>
	);
}

/* ---------------------------------- usage tab ---------------------------------- */

type TokenUsageFilter = "all" | "hot" | "used" | "unused";
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

const buildTokenUsageData = (data: StudioPayload): TokenUsageData => {
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

const getAnalysisConfidence = (data: StudioPayload): AnalysisConfidence => {
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

function AnalysisConfidenceBadge({ data }: { data: StudioPayload }) {
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

function UsageView(props: { data: StudioPayload }) {
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
				<table>
					<tbody>
						<tr>
							<th>responsive</th>
							<td>{pct(a.conditionBreakdown.responsive)}</td>
							<th>pseudo</th>
							<td>{pct(a.conditionBreakdown.pseudo)}</td>
							<th>media</th>
							<td>{pct(a.conditionBreakdown.media)}</td>
							<th>other</th>
							<td>{pct(a.conditionBreakdown.other)}</td>
						</tr>
					</tbody>
				</table>
			</section>
			<section>
				<h2>top properties</h2>
				<table>
					<thead>
						<tr>
							<th>property</th>
							<th>uses</th>
						</tr>
					</thead>
					<tbody>
						{a.topProperties.map((p) => (
							<tr key={p.name}>
								<td>{p.name}</td>
								<td>{p.count}</td>
							</tr>
						))}
					</tbody>
				</table>
			</section>
			<section>
				<h2>property + value combos</h2>
				<table>
					<thead>
						<tr>
							<th>combo</th>
							<th>uses</th>
						</tr>
					</thead>
					<tbody>
						{a.topPropertyValues.map((c) => (
							<tr key={c.combo}>
								<td>{c.combo}</td>
								<td>{c.count}</td>
							</tr>
						))}
					</tbody>
				</table>
			</section>
			<section>
				<h2>conditions</h2>
				<table>
					<thead>
						<tr>
							<th>condition</th>
							<th>kind</th>
							<th>uses</th>
						</tr>
					</thead>
					<tbody>
						{a.conditions.map((c) => (
							<tr key={c.name}>
								<td>{c.name}</td>
								<td>{c.kind}</td>
								<td>{c.count}</td>
							</tr>
						))}
					</tbody>
				</table>
			</section>
			<TokenUsageIntelligence data={props.data} />
			<ContrastWarningsView warnings={props.data.contrastWarnings ?? []} />
			<ContrastPairView data={props.data} />
			<CleanupReportView data={props.data} />
			<AnalyticsHistoryChart />
		</div>
	);
}

const TOKEN_USAGE_FILTERS: ReadonlyArray<{ id: TokenUsageFilter; label: string }> = [
	{ id: "all", label: "all" },
	{ id: "hot", label: "hot" },
	{ id: "used", label: "used" },
	{ id: "unused", label: "not observed" },
];

function TokenUsageIntelligence({ data }: { data: StudioPayload }) {
	const usage = buildTokenUsageData(data);
	const [filter, setFilter] = useState<TokenUsageFilter>("all");
	const total = usage.rows.length;
	const used = usage.rows.filter((row) => row.count > 0).length;
	const hot = usage.rows.filter((row) => row.status === "hot");
	const visible = usage.rows.filter(
		(row) => filter === "all" || (filter === "used" ? row.count > 0 : row.status === filter),
	);
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
			<div className={ui.usageFilters} role="group" aria-label="Filter token usage">
				{TOKEN_USAGE_FILTERS.map((option) => (
					<button
						key={option.id}
						type="button"
						className={filter === option.id ? ui.active : undefined}
						aria-pressed={filter === option.id}
						onClick={() => setFilter(option.id)}
					>
						{option.label}
					</button>
				))}
			</div>
			{visible.length > 0 ? (
				<table>
					<thead>
						<tr>
							<th>category</th>
							<th>token</th>
							<th>uses</th>
							<th>status</th>
						</tr>
					</thead>
					<tbody>
						{visible
							.toSorted((a, b) => b.count - a.count || a.id.localeCompare(b.id))
							.slice(0, 80)
							.map((row) => (
								<tr key={row.id}>
									<td>{row.groupLabel}</td>
									<td title={row.value}>
										<code>{tokenLabel(row.group, row.name)}</code>
									</td>
									<td>{row.count}</td>
									<td>
										<span className={row.status === "unused" ? ui.muted : ui.good}>
											{row.status === "unused" ? "not observed" : row.status}
										</span>
									</td>
								</tr>
							))}
					</tbody>
				</table>
			) : (
				<p className={ui.muted}>No catalog tokens match this view.</p>
			)}
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
	warnings: NonNullable<StudioPayload["contrastWarnings"]>;
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
			<table>
				<thead>
					<tr>
						<th>ratio</th>
						<th>severity</th>
						<th>text</th>
						<th>background</th>
						<th>file</th>
					</tr>
				</thead>
				<tbody>
					{warnings.map((w, i) => (
						<tr key={i}>
							<td style={{ color: w.severity === "fail-large" ? "#ef4444" : "#d97706" }}>
								{w.ratio.toFixed(2)}
							</td>
							<td>{w.severity}</td>
							<td>{w.fg}</td>
							<td>{w.bg}</td>
							<td>{w.file}</td>
						</tr>
					))}
				</tbody>
			</table>
		</section>
	);
}

function ContrastPairView({ data }: { data: StudioPayload }) {
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
function CleanupReportView(props: { data: StudioPayload }) {
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
					<table>
						<tbody>
							<tr>
								<th>owner</th>
								<td>{policy.owner}</td>
								<th>origin</th>
								<td>{policy.origin ?? "—"}</td>
							</tr>
							<tr>
								<th>strict properties</th>
								<td>{(policy.strictProperties ?? []).join(", ") || "—"}</td>
								<th>allowed raw values</th>
								<td>{(policy.allowedRawValues ?? []).join(", ") || "—"}</td>
							</tr>
							{policy.allowedRawPrefixes !== undefined && policy.allowedRawPrefixes.length > 0 && (
								<tr>
									<th>allowed raw prefixes</th>
									<td>{policy.allowedRawPrefixes.join(", ")}</td>
								</tr>
							)}
						</tbody>
					</table>
				) : (
					<p className={ui.muted}>
						policy for {policy.owner} could not be resolved — all strictness is unknown.
					</p>
				)}
			</section>
			<section>
				<h2>unused candidates ({unused.length})</h2>
				<p className={ui.muted}>
					zero reachable usage after alias/composition/generated-artifact/export analysis — safety
					is a classification, not a deletion approval.
				</p>
				<details className={ui.unknownTokens}>
					<summary>show {unused.length} cleanup candidates</summary>
					<table>
						<thead>
							<tr>
								<th>token</th>
								<th>safety</th>
								<th>reasons / boundaries</th>
							</tr>
						</thead>
						<tbody>
							{unused.map((c: UnusedTokenCandidate) => (
								<tr key={c.tokenId}>
									<td>{stripDollar(authoredTokenSpelling(c.tokenId))}</td>
									<td style={{ color: SAFETY_COLOR[c.safety] }}>{c.safety}</td>
									<td>{c.reasons.join("; ") || "—"}</td>
								</tr>
							))}
						</tbody>
					</table>
				</details>
			</section>
			{suggestions.length > 0 && (
				<section>
					<h2>raw value suggestions ({suggestions.length}) — exact matches only</h2>
					<p className={ui.muted}>
						each suggestion is an exact resolved-value match with a legal spelling for the property;
						ambiguous matches are rejected, not ranked.
					</p>
					<table>
						<thead>
							<tr>
								<th>file</th>
								<th>property</th>
								<th>raw</th>
								<th>replacement</th>
								<th>confidence</th>
								<th>reason</th>
							</tr>
						</thead>
						<tbody>
							{suggestions.map((sg: RawTokenSuggestion, i) => (
								<tr key={`${sg.file}:${sg.start}:${i}`}>
									<td>{sg.file}</td>
									<td>{sg.property ?? "—"}</td>
									<td>{sg.rawValue}</td>
									<td>{stripDollar(sg.replacement)}</td>
									<td>{sg.confidence}</td>
									<td>{sg.reason}</td>
								</tr>
							))}
						</tbody>
					</table>
				</section>
			)}
			{g.diagnostics.length > 0 && (
				<section>
					<h2>diagnostics</h2>
					<table>
						<tbody>
							{g.diagnostics.map((d, i) => (
								<tr key={i}>
									<td
										style={{
											color:
												d.severity === "error"
													? "#ef4444"
													: d.severity === "warning"
														? "#d97706"
														: "#64748b",
										}}
									>
										{d.severity}
									</td>
									<td>{d.code}</td>
									<td>{d.message}</td>
								</tr>
							))}
						</tbody>
					</table>
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
	design: "Design system",
	graph: "Token graph",
	stats: "Stats",
	usage: "Usage & cleanup",
	history: "History",
};

export function App() {
	const [urlState, setUrlState] = useState(() =>
		readInspectorUrlState({ hash: window.location.hash, search: window.location.search }),
	);
	const tab = urlState.tab;
	const query = urlState.query;
	const section = urlState.section;
	const [data, setData] = useState<StudioPayload | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [historyList, setHistoryList] = useState<Array<HistoryListItem> | null>(null);
	const [diffPair, setDiffPair] = useState<{ a: string; b: string } | null>(null);
	const [diffData, setDiffData] = useState<{ a: HistoryEntry; b: HistoryEntry } | null>(null);
	const [historyError, setHistoryError] = useState<string | null>(null);

	const refresh = useCallback(() => {
		setLoading(true);
		setError(null);
		InspectorApi.fetchData()
			.then(setData)
			.catch((e: Error) => setError(e.message))
			.finally(() => setLoading(false));
	}, []);

	useEffect(refresh, [refresh]);

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
			const search = document.getElementById("studio-search");
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
		(next: string): void => updateUrlState({ tab: "design", section: next }),
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
		body =
			tab === "graph" ? (
				<TokenGraphView graph={data.tokenGraph} />
			) : tab === "usage" ? (
				<UsageView data={data} />
			) : tab === "design" ? (
				<DesignSystemView
					data={data}
					query={query}
					queryChange={queryChange}
					section={section}
					sectionChange={sectionChange}
				/>
			) : tab === "history" ? (
				<HistoryView
					list={historyList}
					error={historyError}
					diffPair={diffPair}
					diffData={diffData}
					setDiffPair={setDiffPair}
					loadDiff={loadDiff}
					retry={loadHistory}
				/>
			) : (
				<StatsView data={data} query={query} queryChange={queryChange} />
			);
	}

	return (
		<main className={ui.wrap} aria-busy={loading}>
			<header>
				<h1>
					<span className={ui.brandMark}>◆</span> pandwind{" "}
					<span className={ui.brandThin}>studio</span>
				</h1>
				<nav className={ui.tabList} aria-label="Inspector views" role="tablist">
					{INSPECTOR_TABS.map((tabId, index) => (
						<button
							key={tabId}
							type="button"
							id={`tab-${tabId}`}
							role="tab"
							aria-selected={tab === tabId}
							aria-controls="studio-panel"
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
					<button type="button" onClick={refresh} disabled={loading} title="re-run analysis">
						{loading ? "…" : "⟳ refresh"}
					</button>
					{data !== null && !loading && (
						<details className={ui.exportMenu}>
							<summary aria-label="Open export menu">⬇ export</summary>
							<div className={ui.exportItems}>
								{tab === "design" ? (
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
				id="studio-panel"
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
				{body}
			</div>
		</main>
	);
}

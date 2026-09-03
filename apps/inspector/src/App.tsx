import { useCallback, useEffect, useMemo, useState } from "react";
import { InspectorApi, type AnalyticsHistoryPoint, type HistoryListItem } from "./lib/api.ts";
import { diffRuns, type HistoryEntry } from "./lib/history-diff.ts";
import { InspectorExport } from "./lib/export.ts";
import { filterNamed, makeTextMatcher } from "./lib/filter.ts";
import { CollectionToolkit, type ThemeVarCategory } from "pandwind-analyze/collect";
import type { StudioPayload, ThemeVar, TokenSection, TokenGraph, TokenTier } from "./types.ts";

type Tab = "design" | "stats" | "history" | "graph" | "usage";

/* ---------------------------------- helpers ---------------------------------- */

const stripDollar = (name: string): string => (name.startsWith("$") ? name.slice(1) : name);

const isHex = (value: string): boolean => /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim());

function CopyButton(props: { text: string }) {
	const [copied, setCopied] = useState(false);
	return (
		<button
			className="copy"
			title={`copy ${props.text}`}
			onClick={() => {
				navigator.clipboard?.writeText(props.text).then(
					() => {
						setCopied(true);
						setTimeout(() => setCopied(false), 900);
					},
					() => {},
				);
			}}
		>
			{copied ? "✓" : "⧉"}
		</button>
	);
}

function Card(props: { label: string; value: string; sub?: string }) {
	return (
		<div className="card">
			<div className="card-value">{props.value}</div>
			<div className="card-label">{props.label}</div>
			{props.sub !== undefined && <div className="card-sub">{props.sub}</div>}
		</div>
	);
}

/** Horizontal bar scaled against the max value in its set. */
function Bar(props: { label: string; value: number; max: number; suffix?: string }) {
	const pct = props.max > 0 ? Math.max(2, Math.round((props.value / props.max) * 100)) : 2;
	return (
		<div className="bar-row">
			<span className="bar-label">{props.label}</span>
			<span className="bar-track">
				<span className="bar-fill" style={{ width: `${pct}%` }} />
			</span>
			<span className="bar-value">
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
		const split = CollectionToolkit.splitTokenValue(entry.value);
		if (split.conditionBound && split.json !== null) {
			return { name: entry.name, modes: split.json, chain: [entry.name] };
		}
		if (isHex(split.raw))
			return { name: entry.name, modes: { base: split.raw }, chain: [entry.name] };
		// $ref or named ref -> resolve through raw colors
		const chain = CollectionToolkit.resolveChain(split.raw, props.rawColors);
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
		<section>
			<h2>{props.section.label}</h2>
			<div className="swatches">
				{usable.map((s) => (
					<div className="swatch-card" key={`${props.section.id}:${s.name}`}>
						<div className="swatch-modes">
							{Object.entries(s.modes).map(([mode, color]) => (
								<button
									key={mode}
									className="swatch"
									style={{ background: color }}
									title={`${s.name}${mode === "base" ? "" : ` (${mode})`} = ${color} — click to copy`}
									onClick={() => navigator.clipboard?.writeText(color)}
								/>
							))}
						</div>
						<div className="swatch-meta">
							<span className="swatch-name">{stripDollar(s.name)}</span>
							<span className="swatch-chain">
								{s.chain.length > 1 ? s.chain.join(" ← ") : Object.values(s.modes).join(" ")}
							</span>
						</div>
						<CopyButton text={stripDollar(s.name)} />
					</div>
				))}
			</div>
		</section>
	);
}

const categorizeColor = (v: ThemeVar): string | null =>
	v.name.startsWith("--color-") ? v.value : null;

const FONT_SIZE_SAMPLE = "The quick brown fox jumps over the lazy dog";

function DesignSystemView(props: {
	data: StudioPayload;
	query: string;
	queryChange: (v: string) => void;
}) {
	const d = props.data.designSystem;
	const matchText = makeTextMatcher(props.query);

	const sectionsById = new Map(d.tokenSections.map((s) => [s.id, s]));
	const rawColors = new Map<string, string>();
	for (const e of sectionsById.get("colors")?.entries ?? []) {
		if (!CollectionToolkit.splitTokenValue(e.value).conditionBound) rawColors.set(e.name, e.value);
	}
	const groupedVars = useMemo(() => CollectionToolkit.groupThemeVars(d.themeVars), [d.themeVars]);

	const fontSizeEntries = sectionsById.get("fontSizes")?.entries ?? [];
	const weightEntries = sectionsById.get("fontWeights")?.entries ?? [];
	const familyEntries = sectionsById.get("fonts")?.entries ?? [];
	const lineHeightEntries = sectionsById.get("lineHeights")?.entries ?? [];
	const trackingEntries = sectionsById.get("letterSpacings")?.entries ?? [];
	const spacingEntries = sectionsById.get("spacing")?.entries ?? [];
	const radiiEntries = sectionsById.get("radii")?.entries ?? [];

	return (
		<>
			<section className="cards">
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

			<input
				className="search"
				placeholder="filter tokens & utilities…"
				value={props.query}
				onChange={(e) => props.queryChange(e.target.value)}
			/>

			{(sectionsById.get("colors") !== undefined || sectionsById.get("semantic") !== undefined) && (
				<nav className="section-nav">
					<a href="#sec-colors">colors</a>
					<a href="#sec-typography">typography</a>
					<a href="#sec-spacing">spacing</a>
					<a href="#sec-radii">radii</a>
					<a href="#sec-utilities">utilities</a>
					<a href="#sec-theme-vars">theme vars</a>
				</nav>
			)}

			{sectionsById.get("colors") !== undefined && <div id="sec-colors" />}
			<ColorSwatches
				section={{
					id: "colors",
					label: "Colors",
					entries: sectionsById.get("colors")?.entries ?? [],
				}}
				rawColors={rawColors}
				matches={matchText}
			/>
			{sectionsById.get("semantic") !== undefined && (
				<ColorSwatches
					section={{
						id: "semantic",
						label: "Semantic tokens",
						entries: sectionsById.get("semantic")?.entries ?? [],
					}}
					rawColors={rawColors}
					matches={matchText}
				/>
			)}

			<section id="sec-typography">
				<h2>Typography — font sizes at real size</h2>
				<div className="type-sizes">
					{fontSizeEntries
						.filter((e) => matchText(e.name))
						.map((e) => (
							<div className="type-size-row" key={e.name}>
								<span className="type-size-sample" style={{ fontSize: e.value }}>
									Ag {FONT_SIZE_SAMPLE}
								</span>
								<code>
									{e.name} · {e.value}
								</code>
								<CopyButton text={e.name} />
							</div>
						))}
				</div>

				<h3>weights</h3>
				<div className="chip-row">
					{filterNamed(weightEntries, matchText).map((e) => (
						<span className="chip" key={e.name} style={{ fontWeight: Number(e.value) }}>
							{e.name} {e.value}
						</span>
					))}
				</div>

				<h3>families</h3>
				<div className="family-list">
					{filterNamed(familyEntries, matchText).map((e) => (
						<div className="type-size-row" key={e.name}>
							<span className="type-size-sample" style={{ fontFamily: e.value }}>
								{e.name}: Pandwind studio preview 123
							</span>
							<code>{e.value}</code>
						</div>
					))}
				</div>

				{(lineHeightEntries.length > 0 || trackingEntries.length > 0) && (
					<>
						<h3>line heights & letter spacings</h3>
						<table>
							<tbody>
								{filterNamed(
									[
										...lineHeightEntries.map((x) => ({ ...x, _k: "lh-" + x.name })),
										...trackingEntries.map((x) => ({ ...x, _k: "ls-" + x.name })),
									],
									matchText,
								).map((e) => (
									<tr key={e._k}>
										<td>
											<code>{e.name}</code>
										</td>
										<td>{e.value}</td>
										<td className="sample">
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

			{spacingEntries.length > 0 && (
				<section id="sec-spacing">
					<h2>Spacing scale</h2>
					{(() => {
						const px = spacingEntries.map((e) => ({ ...e, n: Number.parseFloat(e.value) || 0 }));
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

			{radiiEntries.length > 0 && (
				<section id="sec-radii">
					<h2>Radii</h2>
					<div className="radii">
						{radiiEntries.map((e) => (
							<div className="radius-demo" key={e.name}>
								<div
									className="radius-box"
									style={{ borderRadius: e.value === "9999px" ? "9999px" : e.value }}
								/>
								<span>{e.name}</span>
								<code>{e.value}</code>
							</div>
						))}
					</div>
				</section>
			)}

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
						{d.utilities
							.filter((u) => matchText(u.key) || u.sample.some(matchText))
							.map((u) => (
								<tr key={u.key}>
									<td>{u.key}</td>
									<td>{u.count}</td>
									<td className="sample">{u.sample.join(", ")}</td>
									<td>{u.openEnded ? "∞" : ""}</td>
								</tr>
							))}
					</tbody>
				</table>
			</section>

			<section id="sec-theme-vars">
				<h2>@theme variables by category</h2>
				{(Object.entries(groupedVars) as Array<[ThemeVarCategory, Array<ThemeVar>]>)
					.filter(([, vars]) => vars.length > 0)
					.map(([category, vars]) => (
						<div key={category}>
							<h3>
								{category} · {vars.length}
							</h3>
							<table>
								<tbody>
									{vars
										.filter((v: ThemeVar) => matchText(v.name) || matchText(v.value))
										.map((v: ThemeVar) => (
											<tr key={`${v.scope ?? ":root"}:${v.name}`}>
												<td>
													{categorizeColor(v) !== null ? (
														<span
															className="mini-swatch"
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
			<p className="hint">
				every rule the real Tailwind compiler emitted for a scanned class. click to expand.
			</p>
			<ul className="sites">
				{entries.map((d) => (
					<li key={d.candidate}>
						<button
							type="button"
							className="linklike"
							onClick={() => setOpen(open === d.candidate ? null : d.candidate)}
						>
							<code>{d.candidate}</code> — {d.rules.length} rule(s)
						</button>
						{open === d.candidate && (
							<pre className="rules">
								{d.rules.map((r) => `${r.selector} {\n  ${r.declarations}\n}`).join("\n")}
							</pre>
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
}) {
	return (
		<div>
			{props.error !== null && <p className="error">{props.error}</p>}
			{(props.list ?? []).length < 2 && props.error === null && (
				<p className="muted">need at least 2 runs — hit refresh to snapshot another one.</p>
			)}
			{props.diffPair !== null && props.diffPair.a === props.diffPair.b && (
				<p className="muted">select two different runs to compare</p>
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
										<p className="good">resolved: {d.resolvedDead.join(", ")}</p>
									)}
									{d.newDead.length > 0 && <p className="warn">new: {d.newDead.join(", ")}</p>}
								</>
							)}
						</section>
					);
				})()}
		</div>
	);
}

function StatsView(props: { data: StudioPayload; query: string }) {
	const c = props.data.coverage;
	const [sortKey, setSortKey] = useState<"file" | "eliminatedPct" | "cxRuntime">("eliminatedPct");
	const [asc, setAsc] = useState(true);
	const q = props.query.toLowerCase();

	const sortedFiles = [...c.files]
		.filter((f) => f.file.toLowerCase().includes(q))
		.toSorted((a, b) => {
			const dir = asc ? 1 : -1;
			if (sortKey === "file") return a.file.localeCompare(b.file) * dir;
			return (a[sortKey] - b[sortKey]) * dir;
		});
	const maxPrefix = Math.max(...c.budget.perPrefix.map((p) => p.rules), 1);

	const sortHeader = (key: "file" | "eliminatedPct" | "cxRuntime", label: string) => (
		<th
			className="sortable"
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
		</th>
	);

	return (
		<>
			<section className="cards">
				<Card
					label="cx eliminated (build time)"
					value={`${c.eliminatedPct}%`}
					sub={`${c.fullFolded} full · ${c.partialFolded} partial · ${c.runtimeCalls} runtime`}
				/>
				<Card
					label="files fully eliminated"
					value={`${c.entryEliminatedPct}%`}
					sub={`${c.totalCxCalls} cx calls across ${c.files.length} files`}
				/>
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
			</section>

			<section>
				<h2>css budget — rule distribution by prefix</h2>
				{c.budget.perPrefix.slice(0, 12).map((p) => (
					<Bar key={p.prefix} label={p.prefix} value={p.rules} max={maxPrefix} />
				))}
			</section>

			{c.shape !== undefined && (
				<section>
					<h2>stylesheet shape</h2>
					<p className="muted">
						{c.shape.totalRules} rules · {InspectorApi.kb(c.shape.totalBytes)} compiled
					</p>
					{c.shape.categories.map((cat) => {
						const maxBytes = Math.max(...c.shape.categories.map((x) => x.bytes), 1);
						return (
							<div key={cat.category} className="shape-cat">
								<div className="shape-head">
									<strong>{cat.category}</strong>
									<span>
										{cat.rules} rules · {InspectorApi.kb(cat.bytes)}
									</span>
								</div>
								<Bar label="bytes" value={cat.bytes} max={maxBytes} />
								<div className="shape-values">
									{cat.topValues.map((tv) => (
										<span key={tv.value} className="chip">
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
				<table>
					<thead>
						<tr>
							{sortHeader("file", "file")}
							{sortHeader("eliminatedPct", "eliminated %")}
							<th>full/part/runtime</th>
							{sortHeader("cxRuntime", "runtime")}
							<th>missing-css</th>
						</tr>
					</thead>
					<tbody>
						{sortedFiles.map((f) => (
							<tr key={f.file}>
								<td>{f.file}</td>
								<td>
									<span className="pct">{f.eliminatedPct}%</span>
								</td>
								<td>{`${f.cxFoldedFull}/${f.cxFoldedPartial}/${f.cxRuntime}`}</td>
								<td>{f.cxRuntime}</td>
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
					<p className="muted">Source calls and the semantic rules emitted for each call site.</p>
					<ul className="sites">
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
					<ul className="sites">
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
					<ul className="sites">
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
			<div className="wrap">
				<h2>token graph</h2>
				<p className="muted">no theme variables found in the generated bridge.</p>
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
		<div className="wrap">
			<h2>token graph</h2>
			<p className="muted">
				{graph.nodes.length} nodes · {graph.edges.length} edges · {graph.cycles.length} cycle(s) ·{" "}
				{graph.dangling.length} dangling · {graph.orphans.length} orphaned raws
			</p>
			{selected !== null && byId.has(selected) ? (
				<div className="card">
					<div className="card-value">{selected}</div>
					<div className="card-sub">
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

const pct = (n: number): string => `${n}`;

function UsageView(props: { data: StudioPayload }) {
	const a = props.data.analytics;
	const crawl = props.data.cssCrawl;
	if (a === undefined) {
		return (
			<div>
				<p className="muted">no analytics in this snapshot — hit refresh.</p>
			</div>
		);
	}
	return (
		<div>
			<section>
				<h2>usage overview</h2>
				<p className="muted">
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
			<section>
				<h2>token usage</h2>
				<table>
					<thead>
						<tr>
							<th>token</th>
							<th>uses</th>
						</tr>
					</thead>
					<tbody>
						{a.tokenUsage.slice(0, 20).map((t) => (
							<tr key={t.name}>
								<td>{t.name}</td>
								<td>{t.count}</td>
							</tr>
						))}
					</tbody>
				</table>
				{a.unusedTokens.length > 0 && (
					<>
						<h3>unused tokens ({a.unusedTokens.length}) — pruning candidates</h3>
						<p className="muted">{a.unusedTokens.slice(0, 40).join(", ")}</p>
					</>
				)}
			</section>
			<ContrastWarningsView warnings={props.data.contrastWarnings ?? []} />
			<PruneChangesetView unusedCount={a.unusedTokens.length} />
			<AnalyticsHistoryChart />
		</div>
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
				<p className="muted">no text/background pairs below 4.5:1 found.</p>
			</section>
		);
	}
	return (
		<section>
			<h2>wcag contrast — {warnings.length} warning(s)</h2>
			<p className="muted">
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

function PruneChangesetView({ unusedCount }: { unusedCount: number }) {
	const [content, setContent] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [copied, setCopied] = useState(false);
	const generate = (): void => {
		setBusy(true);
		InspectorApi.fetchPruneChangeset()
			.then((r) => setContent(r.content))
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
			<h2>prune changeset</h2>
			<p className="muted">
				generates a .changeset file proposing removal of the {unusedCount} zero-use token(s).
				read-only: nothing is written server-side.
			</p>
			<button onClick={generate} disabled={busy || unusedCount === 0}>
				{busy ? "generating…" : `generate changeset (${unusedCount})`}
			</button>{" "}
			{content !== null && (
				<button onClick={copy}>{copied ? "copied ✓" : "copy to clipboard"}</button>
			)}
			{content !== null && <pre className="card">{content}</pre>}
		</section>
	);
}

const HISTORY_W = 560;
const HISTORY_H = 90;

function AnalyticsHistoryChart() {
	const [series, setSeries] = useState<Array<AnalyticsHistoryPoint> | null>(null);
	const [error, setError] = useState<string | null>(null);
	useEffect(() => {
		InspectorApi.fetchAnalyticsHistory()
			.then(setSeries)
			.catch((e: Error) => setError(e.message));
	}, []);
	if (error !== null) {
		return (
			<section>
				<h2>trend</h2>
				<p className="muted">{error} (enable INSPECTOR_HISTORY=1 to record snapshots)</p>
			</section>
		);
	}
	if (series === null || series.length < 2) {
		return (
			<section>
				<h2>trend</h2>
				<p className="muted">
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
			<p className="muted">
				first {series[0]!.timestamp.slice(0, 19)} · last {series[n - 1]!.timestamp.slice(0, 19)}
			</p>
		</section>
	);
}

/* ------------------------------------- app ------------------------------------- */

export function App() {
	const [tab, setTab] = useState<Tab>("design");
	const [data, setData] = useState<StudioPayload | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [query, setQuery] = useState("");
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

	useEffect(() => {
		if (tab !== "history") return;
		setHistoryError(null);
		InspectorApi.fetchHistoryList()
			.then(setHistoryList)
			.catch((e: Error) => setHistoryError(e.message));
	}, [tab]);
	const queryChange = useCallback((v: string) => setQuery(v), []);

	let body: React.ReactNode;
	if (error !== null) {
		body = (
			<div className="empty-state">
				<p className="error">{error}</p>
				<button onClick={refresh}>retry</button>
			</div>
		);
	} else if (data === null || loading) {
		body = (
			<div className="empty-state">
				<span className="spinner" /> analyzing…
			</div>
		);
	} else {
		body =
			tab === "graph" ? (
				<TokenGraphView graph={data.tokenGraph} />
			) : tab === "usage" ? (
				<UsageView data={data} />
			) : tab === "design" ? (
				<DesignSystemView data={data} query={query} queryChange={queryChange} />
			) : tab === "history" ? (
				<HistoryView
					list={historyList}
					error={historyError}
					diffPair={diffPair}
					diffData={diffData}
					setDiffPair={setDiffPair}
					loadDiff={loadDiff}
				/>
			) : (
				<StatsView data={data} query={query} />
			);
	}

	return (
		<main className="wrap">
			<header>
				<h1>
					<span className="brand-mark">◆</span> pandwind <span className="brand-thin">studio</span>
				</h1>
				<nav>
					<button className={tab === "design" ? "active" : ""} onClick={() => setTab("design")}>
						Design system
					</button>
					<button className={tab === "graph" ? "active" : ""} onClick={() => setTab("graph")}>
						token graph
					</button>
					<button className={tab === "stats" ? "active" : ""} onClick={() => setTab("stats")}>
						Stats
					</button>
					<button className={tab === "usage" ? "active" : ""} onClick={() => setTab("usage")}>
						Usage
					</button>
					<button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>
						History
					</button>
					<button onClick={refresh} disabled={loading} title="re-run analysis">
						{loading ? "…" : "⟳ refresh"}
					</button>
					{data !== null && !loading && (
						<details className="export-menu">
							<summary>⬇ export</summary>
							<div className="export-items">
								{tab === "design" ? (
									<>
										<button
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
				</nav>
			</header>
			{body}
		</main>
	);
}

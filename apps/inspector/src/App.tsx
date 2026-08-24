import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchData, kb, vscodeLink } from "./lib/api.ts";
import { filterNamed, makeTextMatcher } from "./lib/filter.ts";
import {
	groupThemeVars,
	resolveChain,
	splitTokenValue,
	type ThemeVarCategory,
} from "./server/parsers.ts";
import type { StudioPayload, ThemeVar, TokenSection } from "./types.ts";

type Tab = "design" | "stats";

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
											<tr key={v.name}>
												<td>
													{categorizeColor(v) !== null ? (
														<span
															className="mini-swatch"
															style={{ background: categorizeColor(v) ?? "" }}
														/>
													) : null}
													<code>{v.name}</code>
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
					value={kb(c.budget.cssBytes)}
					sub={`${kb(c.budget.cssGzipBytes)} gzip · ${c.budget.rules} rules`}
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

			{c.missingCssSites.length > 0 && (
				<section>
					<h2>missing-css sites</h2>
					<ul className="sites">
						{c.missingCssSites.map((s) => (
							<li key={`${s.file}:${s.line}:${s.token}`}>
								<a href={vscodeLink(props.data.meta.root, s.file, s.line)}>
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
								<a href={vscodeLink(props.data.meta.root, s.file, s.line)}>
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

/* ------------------------------------- app ------------------------------------- */

export function App() {
	const [tab, setTab] = useState<Tab>("design");
	const [data, setData] = useState<StudioPayload | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [query, setQuery] = useState("");

	const refresh = useCallback(() => {
		setLoading(true);
		setError(null);
		fetchData()
			.then(setData)
			.catch((e: Error) => setError(e.message))
			.finally(() => setLoading(false));
	}, []);

	useEffect(refresh, [refresh]);
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
			tab === "design" ? (
				<DesignSystemView data={data} query={query} queryChange={queryChange} />
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
					<button className={tab === "stats" ? "active" : ""} onClick={() => setTab("stats")}>
						Stats
					</button>
					<button onClick={refresh} disabled={loading} title="re-run analysis">
						{loading ? "…" : "⟳ refresh"}
					</button>
				</nav>
			</header>
			{body}
		</main>
	);
}

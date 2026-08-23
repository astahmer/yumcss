import { useCallback, useEffect, useState } from "react";
import { fetchData, kb, vscodeLink } from "./lib/api.ts";
import type { StudioPayload } from "./types.ts";

type Tab = "coverage" | "design";

function Card(props: { label: string; value: string; sub?: string }) {
	return (
		<div className="card">
			<div className="card-value">{props.value}</div>
			<div className="card-label">{props.label}</div>
			{props.sub !== undefined && <div className="card-sub">{props.sub}</div>}
		</div>
	);
}

export function App() {
	const [tab, setTab] = useState<Tab>("coverage");
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

	if (error !== null) {
		return (
			<main className="wrap">
				<h1>pandwind studio</h1>
				<p className="error">{error}</p>
				<button onClick={refresh}>retry</button>
			</main>
		);
	}
	if (data === null || loading) {
		return (
			<main className="wrap">
				<h1>pandwind studio</h1>
				<p>analyzing…</p>
			</main>
		);
	}

	const c = data.coverage;
	const d = data.designSystem;
	const q = query.toLowerCase();
	const matchText = (text: string): boolean => text.toLowerCase().includes(q);

	return (
		<main className="wrap">
			<header>
				<h1>pandwind studio</h1>
				<nav>
					<button className={tab === "coverage" ? "active" : ""} onClick={() => setTab("coverage")}>
						Coverage
					</button>
					<button className={tab === "design" ? "active" : ""} onClick={() => setTab("design")}>
						Design system
					</button>
					<button onClick={refresh} disabled={loading}>
						{loading ? "…" : "refresh"}
					</button>
				</nav>
			</header>

			{tab === "coverage" ? (
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
						<h2>per-file fold coverage</h2>
						<table>
							<thead>
								<tr>
									<th>file</th>
									<th>full/part/runtime</th>
									<th>missing-css</th>
								</tr>
							</thead>
							<tbody>
								{c.files.map((f) => (
									<tr key={f.file}>
										<td>{f.file}</td>
										<td>{`${f.cxFoldedFull}/${f.cxFoldedPartial}/${f.cxRuntime}`}</td>
										<td>{f.missingCssCount}</td>
									</tr>
								))}
							</tbody>
						</table>
					</section>

					{c.missingCssSites.length > 0 && (
						<section>
							<h2>missing-css sites</h2>
							<ul className="sites">
								{c.missingCssSites.map((s) => (
									<li key={`${s.file}:${s.line}:${s.token}`}>
										<a href={vscodeLink(data.meta.root, s.file, s.line)}>
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
										<a href={vscodeLink(data.meta.root, s.file, s.line)}>
											{s.file}:{s.line}
										</a>{" "}
										— {s.token}
									</li>
								))}
							</ul>
						</section>
					)}

					<section>
						<h2>top css prefixes</h2>
						<table>
							<tbody>
								{c.budget.perPrefix.map((p) => (
									<tr key={p.prefix}>
										<td>{p.prefix}</td>
										<td>{p.rules}</td>
									</tr>
								))}
							</tbody>
						</table>
					</section>
				</>
			) : (
				<>
					<section className="cards">
						<Card label="theme vars (@theme)" value={String(d.themeVars.length)} />
						<Card label="utilities typed" value={String(d.utilities.length)} />
						<Card
							label="variants / conflicts / compose"
							value={`${d.variantCount}/${d.conflictUtilities}/${d.composeUtilities}`}
						/>
						<Card
							label="bridge"
							value={`${d.bridgeProperties}`}
							sub={`${d.bridgeMappings} value mappings`}
						/>
					</section>

					<input
						className="search"
						placeholder="filter tokens & utilities…"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
					/>

					{d.themeVars.length > 0 && (
						<section>
							<h2>@theme variables {q !== "" ? `(filtered by "${q}")` : ""}</h2>
							<table>
								<tbody>
									{d.themeVars
										.filter((v) => matchText(v.name) || matchText(v.value))
										.map((v) => (
											<tr key={v.name}>
												<td>
													<code>{v.name}</code>
												</td>
												<td>{v.value}</td>
											</tr>
										))}
								</tbody>
							</table>
						</section>
					)}

					<section>
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

					{d.tokenSections.map((section) => {
						const entries = section.entries.filter((e) => matchText(e.name) || matchText(e.value));
						if (entries.length === 0) return null;
						return (
							<section key={section.id}>
								<h2>{section.label}</h2>
								<table>
									<tbody>
										{entries.map((e) => (
											<tr key={e.name}>
												<td>
													<code>{e.name}</code>
												</td>
												<td className="sample">{e.value}</td>
											</tr>
										))}
									</tbody>
								</table>
							</section>
						);
					})}
				</>
			)}
		</main>
	);
}

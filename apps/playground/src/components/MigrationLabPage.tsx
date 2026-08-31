import { useEffect, useMemo, useState } from "react";
import { codeToHtml } from "shiki";
import { CodemodAdapterId } from "pandwind-codemod/swap/browser";
import { EditorPane } from "./EditorPane.tsx";
import { GhostButton, Kbd, Pane } from "./ui.tsx";
import {
	MIGRATION_LAB,
	type MigrationLabEndpoint,
	type MigrationLabResult,
} from "../lib/migration-lab.ts";

const DEFAULT_SOURCE = CodemodAdapterId.StyledComponents;
const DEFAULT_TARGET = CodemodAdapterId.Pandwind;

function endpointById(
	endpoints: readonly MigrationLabEndpoint[],
	id: string,
): MigrationLabEndpoint {
	return endpoints.find((endpoint) => endpoint.id === id) ?? endpoints[0]!;
}

function SelectField(props: {
	label: string;
	value: string;
	options: readonly MigrationLabEndpoint[];
	onChange: (value: string) => void;
}) {
	return (
		<label className="flex min-w-0 flex-1 flex-col gap-1">
			<span className="font-mono text-[10px] uppercase tracking-[0.1em] text-zinc-600">
				{props.label}
			</span>
			<select
				aria-label={props.label}
				value={props.value}
				onChange={(event) => props.onChange(event.target.value)}
				className="h-9 min-w-0 rounded-md border border-white/10 bg-[#16161b] px-2.5 font-mono text-[12px] text-zinc-200 outline-none transition-colors hover:border-white/20 focus:border-orange-400/60 focus:ring-1 focus:ring-orange-400/30"
			>
				{props.options.map((option) => (
					<option key={option.id} value={option.id}>
						{option.label}
					</option>
				))}
			</select>
		</label>
	);
}

function CopyButton(props: { text: string }) {
	const [copied, setCopied] = useState(false);
	return (
		<GhostButton
			active={copied}
			title="Copy migrated source"
			onClick={() => {
				void navigator.clipboard.writeText(props.text).then(() => {
					setCopied(true);
					window.setTimeout(() => setCopied(false), 1200);
				});
			}}
		>
			<span aria-live="polite">{copied ? "copied" : "copy"}</span>
		</GhostButton>
	);
}

function CodeBlock(props: { code: string }) {
	const [html, setHtml] = useState("");
	useEffect(() => {
		let active = true;
		void codeToHtml(props.code, { lang: "tsx", theme: "vesper" })
			.then((value) => {
				if (active) setHtml(value);
			})
			.catch(() => {
				if (active) setHtml("");
			});
		return () => {
			active = false;
		};
	}, [props.code]);
	const base =
		"[&_pre]:m-0 [&_pre]:max-h-[min(52vh,34rem)] [&_pre]:overflow-auto [&_pre]:bg-transparent [&_pre]:p-3 [&_pre]:font-mono [&_pre]:text-[12px] [&_pre]:leading-5";
	return html === "" ? (
		<pre className={`${base} whitespace-pre-wrap`}>
			<code>{props.code}</code>
		</pre>
	) : (
		<div className={base} dangerouslySetInnerHTML={{ __html: html }} />
	);
}

function Summary(props: { result: MigrationLabResult }) {
	const result = props.result;
	const residualCount = result.residuals.length;
	return (
		<div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-white/[0.07] bg-white/[0.07] sm:grid-cols-4">
			{(
				[
					["converted", result.converted, "text-emerald-300"],
					["skipped", result.skipped, result.skipped === 0 ? "text-zinc-300" : "text-amber-300"],
					["residuals", residualCount, residualCount === 0 ? "text-emerald-300" : "text-amber-300"],
					["changed", result.changed ? "yes" : "no", "text-orange-300"],
				] as const
			).map(([label, value, color]) => (
				<div key={label} className="bg-[#0e0e11] px-3 py-2">
					<div className="font-mono text-[10px] uppercase tracking-[0.1em] text-zinc-600">
						{label}
					</div>
					<div className={`mt-0.5 font-mono text-[13px] ${color}`}>{value}</div>
				</div>
			))}
		</div>
	);
}

function Residuals(props: { result: MigrationLabResult }) {
	if (props.result.residuals.length === 0)
		return (
			<p className="px-3 py-2 text-[12px] text-emerald-300/80">
				No residuals. Every matched site was converted.
			</p>
		);
	return (
		<div className="divide-y divide-white/[0.05]">
			{props.result.residuals.map((residual, index) => (
				<div key={`${residual.kind}:${index}`} className="px-3 py-2.5">
					<div className="flex items-baseline gap-2">
						<span className="rounded border border-amber-500/20 bg-amber-500/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-amber-300">
							{residual.kind}
						</span>
						<code className="min-w-0 truncate text-[11px] text-zinc-400">{residual.text}</code>
					</div>
					<p className="mt-1 text-[12px] leading-5 text-zinc-600">
						{residual.hint ?? "The adapter reported a residual without additional guidance."}
					</p>
				</div>
			))}
		</div>
	);
}

function Validation(props: { result: MigrationLabResult }) {
	if (props.result.validations.length === 0)
		return (
			<p className="px-3 py-2 text-[12px] text-zinc-600">
				No matched program was available to validate.
			</p>
		);
	return (
		<div className="divide-y divide-white/[0.05]">
			{props.result.validations.map((validation, index) => (
				<div key={index} className="flex items-center justify-between gap-3 px-3 py-2.5">
					<div>
						<div className="font-mono text-[11px] text-zinc-400">program {index + 1}</div>
						<div className="mt-0.5 text-[12px] text-zinc-600">{validation.lossiness}</div>
					</div>
					<span
						className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${
							validation.valid
								? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
								: "border-amber-500/25 bg-amber-500/10 text-amber-300"
						}`}
					>
						{validation.valid ? "canonical match" : "review"}
					</span>
				</div>
			))}
		</div>
	);
}

function CapabilityReport(props: { result: MigrationLabResult }) {
	const blockers = props.result.reports.flatMap((report) =>
		report.blockers.map((issue) => ({ adapter: report.adapter, ...issue })),
	);
	if (blockers.length === 0)
		return (
			<p className="px-3 py-2 text-[12px] text-emerald-300/80">
				The target contract accepts the semantic program or a registered lowering.
			</p>
		);
	return (
		<div className="divide-y divide-white/[0.05]">
			{blockers.map((blocker, index) => (
				<div key={`${blocker.adapter}:${blocker.capability}:${index}`} className="px-3 py-2.5">
					<div className="flex items-baseline gap-2">
						<span className="rounded border border-amber-500/20 bg-amber-500/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-amber-300">
							{blocker.capability}
						</span>
						<span className="font-mono text-[10px] text-zinc-600">{blocker.level}</span>
					</div>
					<p className="mt-1 text-[12px] leading-5 text-zinc-600">{blocker.detail}</p>
				</div>
			))}
		</div>
	);
}

function Contract(props: { endpoint: MigrationLabEndpoint }) {
	return (
		<div className="flex flex-wrap gap-1.5 p-3">
			{props.endpoint.capabilities.map((capability) => (
				<span
					key={capability}
					className="rounded border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 font-mono text-[10.5px] text-zinc-500"
				>
					{capability}
				</span>
			))}
		</div>
	);
}

function ResultPane(props: {
	result: ReturnType<typeof MIGRATION_LAB.migrate>;
	target: MigrationLabEndpoint;
}) {
	if (!props.result.ok)
		return (
			<Pane label="Migration error" className="border-red-500/20">
				<pre className="whitespace-pre-wrap p-3 font-mono text-[12px] leading-5 text-red-300/90">
					{props.result.message}
				</pre>
			</Pane>
		);
	return (
		<div className="flex min-h-0 flex-col gap-3 overflow-y-auto pr-0.5">
			<Pane
				label={`Output · ${props.target.label}`}
				right={<CopyButton text={props.result.code} />}
			>
				<CodeBlock code={props.result.code} />
			</Pane>
			<Summary result={props.result} />
			<Pane label="Target capability decision">
				<CapabilityReport result={props.result} />
			</Pane>
			<Pane label="Residual report">
				<Residuals result={props.result} />
			</Pane>
			<Pane label="Canonical validation">
				<Validation result={props.result} />
			</Pane>
			<Pane label={`Target contract · ${props.target.label}`}>
				<Contract endpoint={props.target} />
			</Pane>
		</div>
	);
}

export function MigrationLabPage() {
	const sourceOptions = MIGRATION_LAB.sources;
	const targetOptions = MIGRATION_LAB.targets;
	const [from, setFrom] = useState(endpointById(sourceOptions, DEFAULT_SOURCE).id);
	const [to, setTo] = useState(endpointById(targetOptions, DEFAULT_TARGET).id);
	const [source, setSource] = useState(() => MIGRATION_LAB.sampleFor(DEFAULT_SOURCE));
	const sourceEndpoint = endpointById(sourceOptions, from);
	const targetEndpoint = endpointById(targetOptions, to);
	const result = useMemo(() => MIGRATION_LAB.migrate(from, to, source), [from, source, to]);

	const selectSource = (next: string) => {
		setFrom(next);
		setSource(MIGRATION_LAB.sampleFor(next));
	};

	return (
		<div className="flex h-full min-h-0 flex-col gap-3 p-4">
			<div className="shrink-0">
				<div className="flex items-start justify-between gap-4">
					<div>
						<div className="flex items-center gap-2">
							<span className="h-1.5 w-1.5 rounded-full bg-orange-400 shadow-[0_0_12px_#e8955c]" />
							<h1 className="text-[13px] font-medium text-zinc-200">Migration lab</h1>
						</div>
						<p className="mt-1 max-w-2xl text-[12px] leading-5 text-zinc-600">
							Route a real source adapter through Pandwind&apos;s migration contract and inspect the
							emitted code, capability checks, and anything that needs human review.
						</p>
					</div>
					<div className="hidden items-center gap-1.5 text-[11px] text-zinc-600 sm:flex">
						<span>edit</span>
						<Kbd>⌘</Kbd>
						<Kbd>↵</Kbd>
					</div>
				</div>
				<div className="mt-3 flex flex-col gap-2 rounded-lg border border-white/[0.07] bg-[#0e0e11] p-3 sm:flex-row sm:items-end">
					<SelectField
						label="from · source adapter"
						value={from}
						options={sourceOptions}
						onChange={selectSource}
					/>
					<div className="hidden pb-2 font-mono text-[12px] text-zinc-700 sm:block">→</div>
					<SelectField
						label="to · target adapter"
						value={to}
						options={targetOptions}
						onChange={setTo}
					/>
					<div className="flex items-end justify-between gap-3 sm:max-w-[18rem] sm:flex-1">
						<div className="min-w-0 pb-0.5 text-[11px] leading-4 text-zinc-600">
							{sourceEndpoint.dependencies.length > 0
								? `source: ${sourceEndpoint.dependencies.join(", ")}`
								: "source dependencies: none"}
						</div>
						<GhostButton
							onClick={() => setSource(MIGRATION_LAB.sampleFor(from))}
							title="Restore the selected adapter sample"
						>
							reset
						</GhostButton>
					</div>
				</div>
			</div>
			<div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-2">
				<EditorPane
					code={source}
					onChange={setSource}
					onRun={() => undefined}
					className="min-h-72"
				/>
				<ResultPane result={result} target={targetEndpoint} />
			</div>
		</div>
	);
}

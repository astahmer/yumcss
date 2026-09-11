import { useEffect, useMemo, useState } from "react";
import { codeToHtml } from "shiki";
import { CodemodAdapterId } from "pandwind-codemod/swap/browser";
import { EditorPane } from "./EditorPane.tsx";
import { GhostButton, Kbd, Pane, ResizableSplitter, type ResizableSplitterPanel } from "./ui.tsx";
import { css as uiCss } from "../ui-css.ts";
import { useTheme } from "../theme.tsx";
import {
	MIGRATION_LAB,
	type MigrationLabScenario,
	type MigrationLabEndpoint,
	type MigrationLabExecutionEvidence,
	type MigrationLabResult,
} from "../lib/migration-lab.ts";
import { formatPlaygroundCode } from "../lib/format-playground-code.ts";

const DEFAULT_SOURCE = CodemodAdapterId.StyledComponents;
const DEFAULT_TARGET = CodemodAdapterId.Pandwind;

function endpointById(
	endpoints: readonly MigrationLabEndpoint[],
	id: string,
): MigrationLabEndpoint {
	return endpoints.find((endpoint) => endpoint.id === id) ?? endpoints[0]!;
}

const EXPECTATION_STYLE: Record<NonNullable<MigrationLabScenario["expectation"]>, string> = {
	converted: uiCss.class({
		borderColor: "borderStrong",
		backgroundColor: "controlHover",
		color: "success",
	}),
	runtime: uiCss.class({
		borderColor: "borderStrong",
		backgroundColor: "controlHover",
		color: "info",
	}),
	residual: uiCss.class({
		borderColor: "borderStrong",
		backgroundColor: "controlHover",
		color: "warning",
	}),
	identity: uiCss.class({
		borderColor: "borderStrong",
		backgroundColor: "controlHover",
		color: "text",
	}),
	context: uiCss.class({
		borderColor: "borderStrong",
		backgroundColor: "accentSoft",
		color: "accentText",
	}),
};

function ScenarioChips(props: {
	scenarios: readonly MigrationLabScenario[];
	activeKey: string | undefined;
	onSelect: (scenario: MigrationLabScenario) => void;
}) {
	if (props.scenarios.length === 0) return null;
	return (
		<div
			className={uiCss.class({
				display: "flex",
				flexWrap: "wrap",
				alignItems: "center",
				gap: "6px",
			})}
		>
			{props.scenarios.map((scenario) => (
				<button
					key={scenario.key}
					type="button"
					onClick={() => props.onSelect(scenario)}
					className={`${uiCss.class({ display: "flex", alignItems: "center", gap: "6px", border: "1px solid", borderRadius: "9999px", padding: "4px 10px", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "11px", transition: "color 120ms, background-color 120ms, border-color 120ms" })} ${scenario.key === props.activeKey ? uiCss.class({ borderColor: "accent", backgroundColor: "accentSoft", color: "accentText" }) : uiCss.class({ borderColor: "borderStrong", backgroundColor: "control", color: "textSoft", "&:hover": { borderColor: "borderHover", color: "textStrong" } })}`}
				>
					<span>{scenario.name}</span>
					{scenario.expectation === undefined ? null : (
						<span
							className={`${uiCss.class({ border: "1px solid", borderRadius: "9999px", padding: "1px 6px", fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.08em" })} ${EXPECTATION_STYLE[scenario.expectation]}`}
						>
							{scenario.expectation}
						</span>
					)}
				</button>
			))}
		</div>
	);
}

function SelectField(props: {
	label: string;
	value: string;
	options: readonly MigrationLabEndpoint[];
	onChange: (value: string) => void;
}) {
	return (
		<label
			className={uiCss.class({
				display: "flex",
				minWidth: "0px",
				flex: "1 1 0%",
				flexDirection: "column",
				gap: "4px",
			})}
		>
			<span
				className={uiCss.class({
					fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
					fontSize: "10px",
					textTransform: "uppercase",
					letterSpacing: "0.1em",
					color: "textFaint",
				})}
			>
				{props.label}
			</span>
			<select
				aria-label={props.label}
				value={props.value}
				onChange={(event) => props.onChange(event.target.value)}
				className={uiCss.class({
					height: "36px",
					minWidth: "0px",
					border: "strong",
					borderRadius: "6px",
					backgroundColor: "control",
					padding: "0 10px",
					fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
					fontSize: "12px",
					color: "textStrong",
					outline: "none",
					transition: "border-color 120ms",
					"&:hover": { borderColor: "borderHover" },
					"&:focus": {
						borderColor: "accent",
						boxShadow: "focus",
					},
				})}
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

const PLAIN_CODE = uiCss.class({
	margin: "0",
	maxHeight: "52vh",
	overflow: "auto",
	backgroundColor: "transparent",
	padding: "12px",
	fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
	fontSize: "12px",
	lineHeight: "20px",
	whiteSpace: "pre-wrap",
});
const HIGHLIGHTED_CODE = uiCss.class({
	"& pre": {
		margin: "0",
		maxHeight: "52vh",
		overflow: "auto",
		backgroundColor: "transparent",
		padding: "12px",
		fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
		fontSize: "12px",
		lineHeight: "20px",
	},
});

function CodeBlock(props: { code: string }) {
	const { mode } = useTheme();
	const [html, setHtml] = useState("");
	useEffect(() => {
		let active = true;
		void codeToHtml(props.code, {
			lang: "tsx",
			theme: mode === "light" ? "github-light" : "vesper",
		})
			.then((value) => {
				if (active) setHtml(value);
			})
			.catch(() => {
				if (active) setHtml("");
			});
		return () => {
			active = false;
		};
	}, [mode, props.code]);
	return html === "" ? (
		<pre className={PLAIN_CODE}>
			<code>{props.code}</code>
		</pre>
	) : (
		<div className={HIGHLIGHTED_CODE} dangerouslySetInnerHTML={{ __html: html }} />
	);
}

function useFormattedCode(code: string): string {
	const [formatted, setFormatted] = useState(code);
	useEffect(() => {
		let active = true;
		setFormatted(code);
		void formatPlaygroundCode(code).then((value) => {
			if (active) setFormatted(value);
		});
		return () => {
			active = false;
		};
	}, [code]);
	return formatted;
}

function Summary(props: { result: MigrationLabResult }) {
	const result = props.result;
	const residualCount = result.residuals.length;
	return (
		<div
			className={uiCss.class({
				display: "grid",
				gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
				gap: "1px",
				overflow: "hidden",
				border: "hairline",
				borderRadius: "6px",
				backgroundColor: "controlHover",
				"@media (min-width: 640px)": { gridTemplateColumns: "repeat(4, minmax(0, 1fr))" },
			})}
		>
			{(
				[
					["converted", result.converted, uiCss.class({ color: "success" })],
					[
						"skipped",
						result.skipped,
						result.skipped === 0
							? uiCss.class({ color: "text" })
							: uiCss.class({ color: "warning" }),
					],
					[
						"residuals",
						residualCount,
						residualCount === 0
							? uiCss.class({ color: "success" })
							: uiCss.class({ color: "warning" }),
					],
					["changed", result.changed ? "yes" : "no", uiCss.class({ color: "accentText" })],
				] as const
			).map(([label, value, color]) => (
				<div
					key={label}
					className={uiCss.class({ backgroundColor: "surface", padding: "8px 12px" })}
				>
					<div
						className={uiCss.class({
							fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
							fontSize: "10px",
							textTransform: "uppercase",
							letterSpacing: "0.1em",
							color: "textFaint",
						})}
					>
						{label}
					</div>
					<div
						className={`${uiCss.class({ marginTop: "2px", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "13px" })} ${color}`}
					>
						{value}
					</div>
				</div>
			))}
		</div>
	);
}

function ProofBoundary(props: {
	execution: MigrationLabExecutionEvidence;
	routeProof: MigrationLabResult["routeProof"];
}) {
	const route = props.routeProof;
	return (
		<div
			className={uiCss.class({
				display: "grid",
				gap: "8px",
				padding: "10px 12px",
				fontSize: "11px",
				lineHeight: "16px",
				color: "textSoft",
			})}
		>
			<div className={uiCss.class({ display: "flex", flexWrap: "wrap", gap: "6px" })}>
				<span
					className={uiCss.class({
						border: "strong",
						borderRadius: "4px",
						padding: "2px 6px",
						fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
						fontSize: "10px",
						color: "info",
					})}
				>
					lane: {props.execution.lane}
				</span>
				<span
					className={uiCss.class({
						border: "strong",
						borderRadius: "4px",
						padding: "2px 6px",
						fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
						fontSize: "10px",
						color: "warning",
					})}
				>
					{route === undefined ? "route: unregistered" : `route: ${route.maturity}`}
				</span>
				{route === undefined ? null : (
					<span
						className={uiCss.class({
							border: "hairline",
							borderRadius: "4px",
							padding: "2px 6px",
							fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
							fontSize: "10px",
							color: "textSoft",
						})}
					>
						proof: {route.execution}
					</span>
				)}
			</div>
			<p className={uiCss.class({ margin: "0", color: "text" })}>{props.execution.note}</p>
			<p className={uiCss.class({ margin: "0", color: "textMuted" })}>
				verified: {props.execution.verified.join(", ")}; unavailable:{" "}
				{props.execution.unavailable.join(", ")}
			</p>
			{route === undefined ? null : (
				<p className={uiCss.class({ margin: "0", color: "textMuted" })}>{route.note}</p>
			)}
		</div>
	);
}

function Residuals(props: { result: MigrationLabResult }) {
	if (props.result.residuals.length === 0)
		return (
			<p
				className={uiCss.class({
					margin: "0",
					padding: "8px 12px",
					fontSize: "12px",
					color: "success",
				})}
			>
				No residuals. Every matched site was converted.
			</p>
		);
	return (
		<div className={uiCss.class({ "& > * + *": { borderTop: "hairline" } })}>
			{props.result.residuals.map((residual, index) => (
				<div key={`${residual.kind}:${index}`} className={uiCss.class({ padding: "10px 12px" })}>
					<div className={uiCss.class({ display: "flex", alignItems: "baseline", gap: "8px" })}>
						<span
							className={uiCss.class({
								border: "strong",
								borderRadius: "4px",
								backgroundColor: "controlHover",
								padding: "2px 6px",
								fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
								fontSize: "10px",
								color: "warning",
							})}
						>
							{residual.kind}
						</span>
						<code
							className={uiCss.class({
								minWidth: "0px",
								overflow: "hidden",
								textOverflow: "ellipsis",
								whiteSpace: "nowrap",
								fontSize: "11px",
								color: "textSoft",
							})}
						>
							{residual.text}
						</code>
					</div>
					<p
						className={uiCss.class({
							margin: "4px 0 0",
							fontSize: "12px",
							lineHeight: "20px",
							color: "textFaint",
						})}
					>
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
			<p
				className={uiCss.class({
					margin: "0",
					padding: "8px 12px",
					fontSize: "12px",
					color: "textFaint",
				})}
			>
				No matched program was available to validate.
			</p>
		);
	return (
		<div className={uiCss.class({ "& > * + *": { borderTop: "hairline" } })}>
			{props.result.validations.map((validation, index) => (
				<div
					key={index}
					className={uiCss.class({
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
						gap: "12px",
						padding: "10px 12px",
					})}
				>
					<div>
						<div
							className={uiCss.class({
								fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
								fontSize: "11px",
								color: "textSoft",
							})}
						>
							program {index + 1}
						</div>
						<div
							className={uiCss.class({
								marginTop: "2px",
								fontSize: "12px",
								color: "textFaint",
							})}
						>
							{validation.lossiness}
						</div>
					</div>
					<span
						className={`${uiCss.class({ border: "1px solid", borderRadius: "4px", padding: "2px 6px", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "10px" })} ${validation.valid ? uiCss.class({ borderColor: "borderStrong", backgroundColor: "controlHover", color: "success" }) : uiCss.class({ borderColor: "borderStrong", backgroundColor: "controlHover", color: "warning" })}`}
					>
						{validation.valid ? "canonical match" : "review"}
					</span>
				</div>
			))}
		</div>
	);
}

function Outcomes(props: { result: MigrationLabResult }) {
	if (props.result.outcomes.length === 0)
		return (
			<p
				className={uiCss.class({
					margin: "0",
					padding: "8px 12px",
					fontSize: "12px",
					color: "textFaint",
				})}
			>
				No matched style program.
			</p>
		);
	return (
		<div className={uiCss.class({ "& > * + *": { borderTop: "hairline" } })}>
			{props.result.outcomes.map((outcome) => (
				<div
					key={`${outcome.sourceStart}:${outcome.sourceText}`}
					className={uiCss.class({ padding: "10px 12px" })}
				>
					<div className={uiCss.class({ display: "flex", alignItems: "baseline", gap: "8px" })}>
						<span
							className={uiCss.class({
								border: "strong",
								borderRadius: "4px",
								backgroundColor: "controlHover",
								padding: "2px 6px",
								fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
								fontSize: "10px",
								color: "info",
							})}
						>
							{outcome.outcome}
						</span>
						<span
							className={uiCss.class({
								fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
								fontSize: "10px",
								color: "textFaint",
							})}
						>
							{outcome.representation}
						</span>
					</div>
					{outcome.detail === undefined ? null : (
						<p
							className={uiCss.class({
								margin: "4px 0 0",
								fontSize: "12px",
								lineHeight: "20px",
								color: "textFaint",
							})}
						>
							{outcome.detail}
						</p>
					)}
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
			<p
				className={uiCss.class({
					margin: "0",
					padding: "8px 12px",
					fontSize: "12px",
					color: "success",
				})}
			>
				The target contract accepts the semantic program or a registered lowering; any remaining
				host/configuration issue is listed in the residual report.
			</p>
		);
	return (
		<div className={uiCss.class({ "& > * + *": { borderTop: "hairline" } })}>
			{blockers.map((blocker, index) => (
				<div
					key={`${blocker.adapter}:${blocker.capability}:${index}`}
					className={uiCss.class({ padding: "10px 12px" })}
				>
					<div className={uiCss.class({ display: "flex", alignItems: "baseline", gap: "8px" })}>
						<span
							className={uiCss.class({
								border: "strong",
								borderRadius: "4px",
								backgroundColor: "controlHover",
								padding: "2px 6px",
								fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
								fontSize: "10px",
								color: "warning",
							})}
						>
							{blocker.capability}
						</span>
						<span
							className={uiCss.class({
								fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
								fontSize: "10px",
								color: "textFaint",
							})}
						>
							{blocker.level}
						</span>
					</div>
					<p
						className={uiCss.class({
							margin: "4px 0 0",
							fontSize: "12px",
							lineHeight: "20px",
							color: "textFaint",
						})}
					>
						{blocker.detail}
					</p>
				</div>
			))}
		</div>
	);
}

function Contract(props: { endpoint: MigrationLabEndpoint }) {
	return (
		<div
			className={uiCss.class({ display: "flex", flexWrap: "wrap", gap: "6px", padding: "12px" })}
		>
			{props.endpoint.capabilities.map((capability) => (
				<span
					key={capability}
					className={uiCss.class({
						border: "hairline",
						borderRadius: "4px",
						backgroundColor: "controlHover",
						padding: "2px 6px",
						fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
						fontSize: "10.5px",
						color: "textMuted",
					})}
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
	const formattedCode = useFormattedCode(props.result.ok ? props.result.code : "");
	if (!props.result.ok)
		return (
			<Pane label="Migration error" className={uiCss.class({ borderColor: "danger" })}>
				<pre
					className={uiCss.class({
						margin: "0",
						whiteSpace: "pre-wrap",
						padding: "12px",
						fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
						fontSize: "12px",
						lineHeight: "20px",
						color: "danger",
					})}
				>
					{props.result.message}
				</pre>
			</Pane>
		);
	const panels: ResizableSplitterPanel[] = [
		{
			id: "proof-boundary",
			initialSize: 16,
			collapsible: true,
			content: (
				<Pane label="Proof boundary">
					<ProofBoundary execution={props.result.execution} routeProof={props.result.routeProof} />
				</Pane>
			),
		},
		{
			id: "migration-output",
			initialSize: 30,
			collapsible: true,
			content: (
				<Pane
					label={`Output · ${props.target.label}`}
					className={uiCss.class({ height: "100%" })}
					right={<CopyButton text={formattedCode} />}
				>
					<CodeBlock code={formattedCode} />
				</Pane>
			),
		},
		{
			id: "migration-summary",
			initialSize: 13,
			collapsible: true,
			content: (
				<Pane label="Summary" className={uiCss.class({ height: "100%" })}>
					<Summary result={props.result} />
				</Pane>
			),
		},
		{
			id: "target-capability",
			initialSize: 14,
			collapsible: true,
			content: (
				<Pane label="Target capability decision">
					<CapabilityReport result={props.result} />
				</Pane>
			),
		},
		{
			id: "negotiated-outcome",
			initialSize: 14,
			collapsible: true,
			content: (
				<Pane label="Negotiated outcome">
					<Outcomes result={props.result} />
				</Pane>
			),
		},
		{
			id: "residual-report",
			initialSize: 16,
			collapsible: true,
			content: (
				<Pane label="Residual report">
					<Residuals result={props.result} />
				</Pane>
			),
		},
		{
			id: "canonical-validation",
			initialSize: 8,
			collapsible: true,
			content: (
				<Pane label="Canonical validation">
					<Validation result={props.result} />
				</Pane>
			),
		},
		{
			id: "target-contract",
			initialSize: 8,
			collapsible: true,
			content: (
				<Pane label={`Target contract · ${props.target.label}`}>
					<Contract endpoint={props.target} />
				</Pane>
			),
		},
	];
	return (
		<div
			className={uiCss.class({
				display: "flex",
				height: "100%",
				minHeight: "0px",
				overflow: "hidden",
			})}
		>
			<ResizableSplitter orientation="vertical" panels={panels} />
		</div>
	);
}

export function MigrationLabPage() {
	const sourceOptions = MIGRATION_LAB.sources;
	const targetOptions = MIGRATION_LAB.targets;
	const [from, setFrom] = useState(endpointById(sourceOptions, DEFAULT_SOURCE).id);
	const [to, setTo] = useState(endpointById(targetOptions, DEFAULT_TARGET).id);
	const [source, setSource] = useState(() => MIGRATION_LAB.sampleFor(DEFAULT_SOURCE));
	const [scenarioKey, setScenarioKey] = useState<string | undefined>(undefined);
	const [tailwindReady, setTailwindReady] = useState(false);
	useEffect(() => {
		let active = true;
		void MIGRATION_LAB.ready.then(() => {
			if (active) setTailwindReady(true);
		});
		return () => {
			active = false;
		};
	}, []);
	const sourceEndpoint = endpointById(sourceOptions, from);
	const targetEndpoint = endpointById(targetOptions, to);
	const result = useMemo(
		() => MIGRATION_LAB.migrate(from, to, source),
		[from, source, to, tailwindReady],
	);
	const scenarios = useMemo(() => MIGRATION_LAB.scenariosFor(from), [from]);

	const selectSource = (next: string) => {
		setFrom(next);
		setSource(MIGRATION_LAB.sampleFor(next));
		setScenarioKey(undefined);
	};

	const selectScenario = (scenario: MigrationLabScenario) => {
		setScenarioKey(scenario.key);
		setSource(scenario.source);
	};

	return (
		<div
			className={uiCss.class({
				display: "flex",
				height: "100%",
				minHeight: "0px",
				flexDirection: "column",
				gap: "12px",
				padding: "16px",
			})}
		>
			<div className={uiCss.class({ flexShrink: "0" })}>
				<div
					className={uiCss.class({
						display: "flex",
						alignItems: "flex-start",
						justifyContent: "space-between",
						gap: "16px",
					})}
				>
					<div>
						<div className={uiCss.class({ display: "flex", alignItems: "center", gap: "8px" })}>
							<span
								className={uiCss.class({
									width: "6px",
									height: "6px",
									borderRadius: "9999px",
									backgroundColor: "accent",
									boxShadow: "glow",
								})}
							/>
							<h1
								className={uiCss.class({
									margin: "0",
									fontSize: "13px",
									fontWeight: "500",
									color: "textStrong",
								})}
							>
								Migration lab
							</h1>
						</div>
						<p
							className={uiCss.class({
								maxWidth: "42rem",
								margin: "4px 0 0",
								fontSize: "12px",
								lineHeight: "20px",
								color: "textFaint",
							})}
						>
							Route a real source adapter through Pandwind&apos;s migration contract and inspect the
							emitted code, capability checks, and anything that needs human review.
						</p>
					</div>
					<div
						className={uiCss.class({
							display: "none",
							alignItems: "center",
							gap: "6px",
							fontSize: "11px",
							color: "textFaint",
							"@media (min-width: 640px)": { display: "flex" },
						})}
					>
						<span>edit</span>
						<Kbd>⌘</Kbd>
						<Kbd>↵</Kbd>
					</div>
				</div>
				<div
					className={uiCss.class({
						display: "flex",
						marginTop: "12px",
						flexDirection: "column",
						gap: "8px",
						border: "hairline",
						borderRadius: "8px",
						backgroundColor: "surface",
						padding: "12px",
						"@media (min-width: 640px)": { flexDirection: "row", alignItems: "flex-end" },
					})}
				>
					<div
						className={uiCss.class({
							display: "flex",
							flexDirection: "column",
							gap: "6px",
							"@media (min-width: 1024px)": { flexDirection: "row", alignItems: "flex-start" },
						})}
					>
						<SelectField
							label="from · source adapter"
							value={from}
							options={sourceOptions}
							onChange={selectSource}
						/>
						<div
							className={uiCss.class({
								display: "none",
								paddingBottom: "8px",
								fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
								fontSize: "12px",
								color: "textDisabled",
								"@media (min-width: 640px)": { display: "block" },
							})}
						>
							→
						</div>
						<SelectField
							label="to · target adapter"
							value={to}
							options={targetOptions}
							onChange={setTo}
						/>
					</div>
					<div className={uiCss.class({ minWidth: "0px", flex: "1 1 0%" })}>
						<div
							className={uiCss.class({
								marginBottom: "4px",
								fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
								fontSize: "10px",
								textTransform: "uppercase",
								letterSpacing: "0.1em",
								color: "textFaint",
							})}
						>
							documented scenarios
						</div>
						<ScenarioChips
							scenarios={scenarios}
							activeKey={scenarioKey}
							onSelect={selectScenario}
						/>
						{scenarios.length === 0 ? (
							<div
								className={uiCss.class({
									paddingBottom: "2px",
									fontSize: "11px",
									lineHeight: "16px",
									color: "textFaint",
								})}
							>
								no cataloged scenarios — paste any source to try this adapter
							</div>
						) : null}
					</div>
					<div
						className={uiCss.class({
							display: "flex",
							alignItems: "flex-end",
							justifyContent: "space-between",
							gap: "12px",
							"@media (min-width: 640px)": { maxWidth: "18rem", flex: "1 1 0%" },
						})}
					>
						<div
							className={uiCss.class({
								minWidth: "0px",
								paddingBottom: "2px",
								fontSize: "11px",
								lineHeight: "16px",
								color: "textFaint",
							})}
						>
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
			<ResizableSplitter
				orientation="horizontal"
				className={uiCss.class({ flex: "1 1 0%", minHeight: "18rem" })}
				panels={[
					{
						id: "source-editor",
						initialSize: 50,
						content: (
							<EditorPane
								code={source}
								onChange={setSource}
								onRun={() => undefined}
								className={uiCss.class({ height: "100%", minHeight: "0px" })}
							/>
						),
					},
					{
						id: "migration-result",
						initialSize: 50,
						content: <ResultPane result={result} target={targetEndpoint} />,
					},
				]}
			/>
		</div>
	);
}

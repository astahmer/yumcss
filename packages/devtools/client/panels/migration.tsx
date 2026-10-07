import type { ReactNode, FormEvent } from "react";
import type { DevtoolsMigrationPreview } from "../../src/rpc.ts";
import { Badge, Card, EmptyState, type PanelSnapshot } from "./shared.tsx";

export interface MigrationCatalogEntry {
	readonly id: string;
	readonly officialApi?: string;
}

export interface MigrationPanelProps {
	readonly data: PanelSnapshot;
	readonly migration: DevtoolsMigrationPreview | undefined;
	readonly pending: boolean;
	readonly error: string | undefined;
	readonly catalog: readonly MigrationCatalogEntry[];
	readonly onPreview: (form: FormData) => void;
}

export function MigrationPanel({
	data,
	migration,
	pending,
	error,
	catalog,
	onPreview,
}: MigrationPanelProps): ReactNode {
	const last = migration;
	const history = data.migrations[0];
	const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
		event.preventDefault();
		onPreview(new FormData(event.currentTarget));
	};

	return (
		<Card title="Migration lab" eyebrow="READ-ONLY PREVIEW" className="wide-card">
			<form className="migration-form" onSubmit={handleSubmit}>
				<label>
					Files or globs
					<input name="files" defaultValue="src/**/*.{ts,tsx}" />
				</label>
				<label>
					From
					<select name="from" defaultValue="styled-components">
						{catalog.length > 0 ? (
							catalog.map((entry) => (
								<option value={entry.id} key={entry.id}>
									{entry.id}
								</option>
							))
						) : (
							<option value="styled-components">styled-components</option>
						)}
					</select>
				</label>
				<label>
					To
					<select name="to" defaultValue="yumcss">
						{catalog.length > 0 ? (
							catalog.map((entry) => (
								<option value={entry.id} key={entry.id}>
									{entry.id}
								</option>
							))
						) : (
							<option value="yumcss">yumcss</option>
						)}
					</select>
				</label>
				<label>
					Mode
					<select name="mode" defaultValue="safe">
						<option value="safe">safe</option>
						<option value="partial">partial</option>
					</select>
				</label>
				<button type="submit" className="primary-button" disabled={pending}>
					{pending ? (
						"Previewing…"
					) : (
						<>
							Preview migration <span>↗</span>
						</>
					)}
				</button>
			</form>

			{pending ? (
				<div className="loading">
					Running the codemod on the matched files <span className="loader" />
				</div>
			) : error !== undefined ? (
				<EmptyState title="Preview failed" detail={error} />
			) : last ? (
				<div className="migration-result">
					<div className="metric-strip">
						<div>
							<span>Files</span>
							<strong>{last.files.length}</strong>
						</div>
						<div>
							<span>Changed</span>
							<strong>{last.files.filter((file) => file.changed).length}</strong>
						</div>
						<div>
							<span>Residuals</span>
							<strong
								className={
									last.files.some((file) => file.residuals.length > 0) ? "metric-warn" : undefined
								}
							>
								{last.files.reduce((count, file) => count + file.residuals.length, 0)}
							</strong>
						</div>
					</div>
					{last.files.map((file) => (
						<details className="diff-block" open key={file.file}>
							<summary>
								{file.file}{" "}
								{file.changed ? <Badge label="changed" tone="good" /> : <Badge label="unchanged" />}
							</summary>
							<pre>{file.diff || "No source changes"}</pre>
							{file.generatedFiles.length > 0 ? (
								<div className="generated-files">
									{file.generatedFiles.map((generated) => (
										<span className="chip" key={generated.path}>
											<b>generated</b>
											{generated.path}
										</span>
									))}
								</div>
							) : null}
						</details>
					))}
				</div>
			) : history ? (
				<div className="migration-result">
					<div className="metric-strip">
						<div>
							<span>Files</span>
							<strong>{history.files.length}</strong>
						</div>
						<div>
							<span>Changed</span>
							<strong>{history.changed}</strong>
						</div>
						<div>
							<span>Residuals</span>
							<strong className={history.residuals > 0 ? "metric-warn" : undefined}>
								{history.residuals}
							</strong>
						</div>
					</div>
					<div className="generated-files">
						{history.files.map((file) => (
							<span className="chip" key={file}>
								{file}
							</span>
						))}
					</div>
				</div>
			) : (
				<EmptyState
					title="No preview yet"
					detail="Preview a registered source → target route. The panel never writes files."
				/>
			)}
		</Card>
	);
}

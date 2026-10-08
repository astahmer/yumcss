import {
	MIGRATION_PREVIEW_SESSION_SCHEMA,
	MIGRATION_PREVIEW_SNAPSHOT_SCHEMA,
	type MigrationPreviewEditRequest,
	type MigrationPreviewEvaluationRequest,
	type MigrationPreviewOpenRequest,
	type MigrationPreviewSelection,
	type MigrationPreviewSession,
	type MigrationPreviewSessionDependencies,
	type MigrationPreviewSnapshot,
	type MigrationPreviewTargetSelection,
	type MigrationPreviewThemeSelection,
	type MigrationPreviewWorkspaceSnapshot,
} from "./contracts.ts";

class DefaultMigrationPreviewSession implements MigrationPreviewSession {
	readonly schema = MIGRATION_PREVIEW_SESSION_SCHEMA;
	private workspace: MigrationPreviewWorkspaceSnapshot | null = null;
	private selection: MigrationPreviewSelection | null = null;
	private target: MigrationPreviewTargetSelection | null = null;
	private theme: MigrationPreviewThemeSelection = { scope: null };
	private revision = 0;
	private readonly listeners = new Set<(snapshot: MigrationPreviewSnapshot) => void>();
	private readonly unsubscribeWorkspace: () => void;
	private previewStarted = false;
	private evaluationVersion = 0;
	private latestRefresh: Promise<MigrationPreviewSnapshot> | undefined;
	private previewQueue: Promise<void> = Promise.resolve();

	constructor(private readonly dependencies: MigrationPreviewSessionDependencies) {
		this.unsubscribeWorkspace = dependencies.workspace.subscribe((workspace) => {
			this.workspace = workspace;
			this.revision += 1;
			if (this.workspace !== null) void this.refresh();
		});
	}

	async open(request: MigrationPreviewOpenRequest): Promise<MigrationPreviewSnapshot> {
		this.workspace = await this.dependencies.workspace.open(request);
		this.revision += 1;
		return this.refresh();
	}

	async edit(request: MigrationPreviewEditRequest): Promise<MigrationPreviewSnapshot> {
		this.workspace = await this.dependencies.workspace.edit(request);
		this.revision += 1;
		return this.refresh();
	}

	async select(selection: MigrationPreviewSelection): Promise<MigrationPreviewSnapshot> {
		this.selection = selection;
		this.revision += 1;
		return this.refresh();
	}

	async switchTarget(target: MigrationPreviewTargetSelection): Promise<MigrationPreviewSnapshot> {
		this.target = target;
		this.revision += 1;
		return this.refresh();
	}

	async switchTheme(theme: MigrationPreviewThemeSelection): Promise<MigrationPreviewSnapshot> {
		this.theme = theme;
		this.revision += 1;
		return this.refresh();
	}

	subscribe(listener: (snapshot: MigrationPreviewSnapshot) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	async close(): Promise<void> {
		this.unsubscribeWorkspace();
		this.listeners.clear();
		this.workspace = null;
		this.evaluationVersion += 1;
		await this.previewQueue;
		await this.dependencies.preview?.stop?.();
		await this.dependencies.workspace.close?.();
	}

	private refresh(): Promise<MigrationPreviewSnapshot> {
		if (this.workspace === null)
			return Promise.reject(
				new Error("YumCSS Migration Preview session must be opened before it can be evaluated"),
			);
		const request: MigrationPreviewEvaluationRequest = {
			workspace: this.workspace,
			selection: this.selection,
			target: this.target,
			theme: this.theme,
		};
		const version = ++this.evaluationVersion;
		const pending = this.evaluate({ request, version, revision: this.revision });
		this.latestRefresh = pending;
		return pending;
	}

	private async evaluate(input: {
		request: MigrationPreviewEvaluationRequest;
		version: number;
		revision: number;
	}): Promise<MigrationPreviewSnapshot> {
		const evaluation = await this.dependencies.evaluation.evaluate(input.request);
		const adapters = await this.dependencies.adapters?.list();
		const previewTask = this.previewQueue.then(() => {
			if (input.version !== this.evaluationVersion) return undefined;
			return this.previewFor(input.request, evaluation);
		});
		this.previewQueue = previewTask.then(
			() => undefined,
			() => undefined,
		);
		const preview = await previewTask;
		const snapshot: MigrationPreviewSnapshot = {
			schema: MIGRATION_PREVIEW_SNAPSHOT_SCHEMA,
			revision: input.revision,
			workspace: input.request.workspace,
			selection: input.request.selection,
			target: input.request.target,
			theme: input.request.theme,
			evaluation,
			...(adapters === undefined ? {} : { adapters }),
			...(preview === undefined ? {} : { preview }),
		};
		if (this.workspace === null) return snapshot;
		if (input.version !== this.evaluationVersion && this.latestRefresh !== undefined)
			return this.latestRefresh;
		for (const listener of this.listeners) listener(snapshot);
		return snapshot;
	}

	private async previewFor(
		request: MigrationPreviewEvaluationRequest,
		evaluation: NonNullable<MigrationPreviewSnapshot["evaluation"]>,
	): Promise<MigrationPreviewSnapshot["preview"]> {
		const host = this.dependencies.preview;
		if (host === undefined) return undefined;
		const previewRequest = { ...request, evaluation };
		if (!host.available) {
			return {
				host: host.id,
				status: "unavailable",
				message: "No supported host preview is configured for this project",
			};
		}
		if (!this.previewStarted) {
			this.previewStarted = true;
			if (host.start === undefined)
				return { host: host.id, status: "error", message: "Preview host has no start operation" };
			return host.start(previewRequest);
		}
		if (host.update === undefined)
			return { host: host.id, status: "ready", message: "Preview host is unchanged" };
		return host.update(previewRequest);
	}
}

export const createMigrationPreviewSession = (
	dependencies: MigrationPreviewSessionDependencies,
): MigrationPreviewSession => new DefaultMigrationPreviewSession(dependencies);

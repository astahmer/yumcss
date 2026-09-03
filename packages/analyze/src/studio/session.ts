import {
	STUDIO_SESSION_SCHEMA,
	STUDIO_SNAPSHOT_SCHEMA,
	type StudioEditRequest,
	type StudioEvaluationRequest,
	type StudioOpenRequest,
	type StudioSelection,
	type StudioSession,
	type StudioSessionDependencies,
	type StudioSnapshot,
	type StudioTargetSelection,
	type StudioThemeSelection,
	type StudioWorkspaceSnapshot,
} from "./contracts.ts";

class DefaultStudioSession implements StudioSession {
	readonly schema = STUDIO_SESSION_SCHEMA;
	private workspace: StudioWorkspaceSnapshot | null = null;
	private selection: StudioSelection | null = null;
	private target: StudioTargetSelection | null = null;
	private theme: StudioThemeSelection = { scope: null };
	private revision = 0;
	private readonly listeners = new Set<(snapshot: StudioSnapshot) => void>();
	private readonly unsubscribeWorkspace: () => void;
	private previewStarted = false;

	constructor(private readonly dependencies: StudioSessionDependencies) {
		this.unsubscribeWorkspace = dependencies.workspace.subscribe((workspace) => {
			this.workspace = workspace;
			this.revision += 1;
			if (this.workspace !== null) void this.refresh();
		});
	}

	async open(request: StudioOpenRequest): Promise<StudioSnapshot> {
		this.workspace = await this.dependencies.workspace.open(request);
		this.revision += 1;
		return this.refresh();
	}

	async edit(request: StudioEditRequest): Promise<StudioSnapshot> {
		this.workspace = await this.dependencies.workspace.edit(request);
		this.revision += 1;
		return this.refresh();
	}

	async select(selection: StudioSelection): Promise<StudioSnapshot> {
		this.selection = selection;
		this.revision += 1;
		return this.refresh();
	}

	async switchTarget(target: StudioTargetSelection): Promise<StudioSnapshot> {
		this.target = target;
		this.revision += 1;
		return this.refresh();
	}

	async switchTheme(theme: StudioThemeSelection): Promise<StudioSnapshot> {
		this.theme = theme;
		this.revision += 1;
		return this.refresh();
	}

	subscribe(listener: (snapshot: StudioSnapshot) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	async close(): Promise<void> {
		this.unsubscribeWorkspace();
		this.listeners.clear();
		await this.dependencies.preview?.stop?.();
		await this.dependencies.workspace.close?.();
	}

	private async refresh(): Promise<StudioSnapshot> {
		if (this.workspace === null) {
			throw new Error("pandwind studio session must be opened before it can be evaluated");
		}
		const request: StudioEvaluationRequest = {
			workspace: this.workspace,
			selection: this.selection,
			target: this.target,
			theme: this.theme,
		};
		const evaluation = await this.dependencies.evaluation.evaluate(request);
		const adapters = await this.dependencies.adapters?.list();
		const preview = await this.previewFor(request, evaluation);
		const snapshot: StudioSnapshot = {
			schema: STUDIO_SNAPSHOT_SCHEMA,
			revision: this.revision,
			workspace: this.workspace,
			selection: this.selection,
			target: this.target,
			theme: this.theme,
			evaluation,
			...(adapters === undefined ? {} : { adapters }),
			...(preview === undefined ? {} : { preview }),
		};
		for (const listener of this.listeners) listener(snapshot);
		return snapshot;
	}

	private async previewFor(
		request: StudioEvaluationRequest,
		evaluation: NonNullable<StudioSnapshot["evaluation"]>,
	): Promise<StudioSnapshot["preview"]> {
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

export const createStudioSession = (dependencies: StudioSessionDependencies): StudioSession =>
	new DefaultStudioSession(dependencies);

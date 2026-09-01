// Generated from the workspace-linked pandwind package. Do not edit.
type EventHandler<Event> = ((event?: Event) => void) | undefined;
export declare function createEventHandler<Event>(parentEventHandler: EventHandler<Event>, eventHandler: EventHandler<Event>): (event?: Event) => void;
export {};

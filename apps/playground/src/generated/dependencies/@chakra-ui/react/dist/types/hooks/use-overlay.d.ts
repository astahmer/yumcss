// Generated from the workspace-linked pandwind package. Do not edit.
import * as React from "react";
import { type Dict } from "../utils.d.ts";
/**
 * Props that are injected into the overlay component by the `createOverlay` function.
 * These props are used to control the overlay's state and lifecycle.
 */
export interface CreateOverlayProps<TReturn = unknown> {
    /** Whether the overlay is currently open */
    open?: boolean;
    /** Callback fired when the overlay's open state changes */
    onOpenChange?: (e: {
        open: boolean;
    }) => void;
    /** Callback fired when the overlay's exit animation completes */
    onExitComplete?: () => void;
    /** Internal callback used to set the return value when the overlay closes */
    setReturnValue?: ((value: TReturn) => void) | undefined;
    /** Internal callback used to signal when the exit animation is complete */
    setExitComplete?: (() => void) | undefined;
}
export interface OverlayOptions<TProps extends CreateOverlayProps> {
    props?: TProps;
}
export interface CreateOverlayReturn<TProps extends CreateOverlayProps, TReturn = unknown> {
    /** The root component for the overlay */
    Viewport: React.ElementType;
    /** Opens a new overlay with the given id and props */
    open: (id: string, props: TProps) => Promise<TReturn | undefined>;
    /** Closes the overlay with the given id and returns the value */
    close: (id: string, value?: TReturn | undefined) => Promise<void>;
    /** Updates the props of the overlay with the given id */
    update: (id: string, props: TProps) => void;
    /** Removes the overlay with the given id */
    remove: (id: string) => void;
    /** Removes all overlays */
    removeAll: () => void;
    /** Gets the props of the overlay with the given id */
    get: (id: string) => TProps;
    /** Checks if the overlay with the given id exists */
    has: (id: string) => boolean;
    /** Gets the current snapshot of the overlays */
    getSnapshot: () => TProps[];
    /** Waits for the exit animation to complete for the overlay with the given id */
    waitForExit: (id: string) => Promise<void>;
}
export declare function createOverlay<TProps extends Dict, TReturn = unknown>(Component: React.ComponentType<CreateOverlayProps<TReturn> & TProps>, options?: OverlayOptions<TProps>): CreateOverlayReturn<TProps, TReturn>;

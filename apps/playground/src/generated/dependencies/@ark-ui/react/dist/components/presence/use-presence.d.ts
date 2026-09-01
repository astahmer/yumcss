// Generated from the workspace-linked pandwind package. Do not edit.
import { Optional } from '../../types.d.ts';
import { HideMode, RenderStrategyProps } from '../../utils/render-strategy.d.ts';
import * as presence from '@zag-js/presence';
export interface UsePresenceProps extends Optional<presence.Props, 'present'>, RenderStrategyProps {
    /**
     * Whether to allow the initial presence animation.
     * @default false
     */
    skipAnimationOnMount?: boolean | undefined;
}
export type UsePresenceReturn = ReturnType<typeof usePresence>;
export declare const usePresence: (props?: UsePresenceProps) => {
    ref: (node: HTMLElement | null) => void;
    getPresenceProps: () => {
        'data-state': string | undefined;
        hidden: boolean;
    };
    present: boolean;
    unmounted: boolean | undefined;
    hideMode: HideMode;
};

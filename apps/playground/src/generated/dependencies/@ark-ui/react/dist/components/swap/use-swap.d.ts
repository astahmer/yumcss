// Generated from the workspace-linked pandwind package. Do not edit.
import { RenderStrategyProps } from '../../utils/render-strategy.d.ts';
import { HTMLProps } from '../factory.d.ts';
import { UsePresenceReturn } from '../presence/use-presence.d.ts';
export interface UseSwapProps extends RenderStrategyProps {
    /**
     * Whether the swap is in the "on" state.
     * @default false
     */
    swap?: boolean;
}
export interface IndicatorProps {
    type: 'on' | 'off';
}
export interface UseSwapReturn {
    /**
     * Whether the swap is in the "on" state.
     */
    swap: boolean;
    /**
     * The presence instance for the "on" indicator.
     */
    onPresence: UsePresenceReturn;
    /**
     * The presence instance for the "off" indicator.
     */
    offPresence: UsePresenceReturn;
    /**
     * Props for the root element.
     */
    getRootProps: () => HTMLProps<'span'>;
    /**
     * Props for the indicator element.
     */
    getIndicatorProps: (props: IndicatorProps) => HTMLProps<'span'>;
}
export declare const useSwap: (props?: UseSwapProps) => UseSwapReturn;

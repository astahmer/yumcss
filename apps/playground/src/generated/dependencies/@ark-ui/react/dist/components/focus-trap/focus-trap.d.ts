// Generated from the workspace-linked pandwind package. Do not edit.
import { FocusTrapOptions } from '@zag-js/focus-trap';
import { Assign } from '../../types.d.ts';
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
export interface TrapOptions extends Pick<FocusTrapOptions, 'onActivate' | 'onDeactivate' | 'initialFocus' | 'fallbackFocus' | 'returnFocusOnDeactivate' | 'setReturnFocus' | 'persistentElements'> {
    /**
     * Whether the focus trap is disabled.
     */
    disabled?: boolean | undefined;
}
export interface FocusTrapBaseProps extends PolymorphicProps, TrapOptions {
}
export interface FocusTrapProps extends Assign<HTMLProps<'div'>, FocusTrapBaseProps> {
}
export declare const FocusTrap: ForwardRefExoticComponent<FocusTrapProps & RefAttributes<HTMLDivElement>>;

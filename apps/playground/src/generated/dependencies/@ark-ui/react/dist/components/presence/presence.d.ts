// Generated from the workspace-linked pandwind package. Do not edit.
import { HTMLProps, PolymorphicProps } from '../factory.d.ts';
import { UsePresenceProps } from './use-presence.d.ts';
import { ForwardRefExoticComponent, RefAttributes } from 'react';
export interface PresenceBaseProps extends UsePresenceProps, PolymorphicProps {
}
export interface PresenceProps extends HTMLProps<'div'>, PresenceBaseProps {
}
export declare const Presence: ForwardRefExoticComponent<PresenceProps & RefAttributes<HTMLDivElement>>;

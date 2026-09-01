// Generated from the workspace-linked pandwind package. Do not edit.
import { TabsProps, ContentProps, TriggerProps } from './tabs.types.d.ts';
import '@zag-js/core';
import '@zag-js/types';

declare const props: (keyof TabsProps)[];
declare const splitProps: <Props extends Partial<TabsProps>>(props: Props) => [Partial<TabsProps>, Omit<Props, keyof TabsProps>];
declare const triggerProps: (keyof TriggerProps)[];
declare const splitTriggerProps: <Props extends TriggerProps>(props: Props) => [TriggerProps, Omit<Props, keyof TriggerProps>];
declare const contentProps: "value"[];
declare const splitContentProps: <Props extends ContentProps>(props: Props) => [ContentProps, Omit<Props, "value">];

export { contentProps, props, splitContentProps, splitProps, splitTriggerProps, triggerProps };

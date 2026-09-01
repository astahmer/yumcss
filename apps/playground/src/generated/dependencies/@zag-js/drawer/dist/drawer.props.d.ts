// Generated from the workspace-linked pandwind package. Do not edit.
import { e as DrawerProps } from './drawer.types-D7JKduDn.d.ts';
import '@zag-js/core';
import '@zag-js/dismissable';
import '@zag-js/dom-query';
import '@zag-js/types';
import './utils/session.d.ts';

declare const props: (keyof DrawerProps)[];
declare const splitProps: <Props extends Partial<DrawerProps>>(props: Props) => [Partial<DrawerProps>, Omit<Props, keyof DrawerProps>];

export { props, splitProps };

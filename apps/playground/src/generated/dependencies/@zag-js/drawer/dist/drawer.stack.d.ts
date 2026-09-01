// Generated from the workspace-linked pandwind package. Do not edit.
import { PropTypes, NormalizeProps } from '@zag-js/types';
import { c as DrawerStackSnapshot, b as DrawerStackApi, a as DrawerStack } from './drawer.types-D7JKduDn.d.ts';
import '@zag-js/core';
import '@zag-js/dismissable';
import '@zag-js/dom-query';
import './utils/session.d.ts';

declare function createStack(): DrawerStack;
declare function connectStack<T extends PropTypes>(snapshot: DrawerStackSnapshot, normalize: NormalizeProps<T>): DrawerStackApi<T>;

export { connectStack, createStack };

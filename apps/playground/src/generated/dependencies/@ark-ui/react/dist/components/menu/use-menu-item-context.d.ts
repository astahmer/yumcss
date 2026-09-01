// Generated from the workspace-linked pandwind package. Do not edit.
import { OptionItemState } from '@zag-js/menu';
import { Optional } from '../../types.d.ts';
import { Provider } from 'react';
export interface UseMenuItemContext extends Optional<OptionItemState, 'checked'> {
}
export declare const MenuItemProvider: Provider<UseMenuItemContext>, useMenuItemContext: () => UseMenuItemContext;

// Generated from the workspace-linked pandwind package. Do not edit.
import { Provider } from 'react';
export interface ValueChangeDetails {
    value: string;
}
export interface UseMenuItemGroupContext {
    id: string;
    value?: string | undefined;
    onValueChange?: ((e: ValueChangeDetails) => void) | undefined;
}
export declare const MenuItemGroupProvider: Provider<UseMenuItemGroupContext>, useMenuItemGroupContext: () => UseMenuItemGroupContext;

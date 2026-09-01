// Generated from the workspace-linked pandwind package. Do not edit.
import { UseHotkeyStoreProps } from './use-hotkey-store.d.ts';
export interface UseIsKeyPressedProps extends UseHotkeyStoreProps {
    /**
     * The key or combination to watch.
     */
    hotkey: string;
}
export declare const useIsKeyPressed: (props: UseIsKeyPressedProps) => boolean;

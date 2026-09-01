// Generated from the workspace-linked pandwind package. Do not edit.
import { UsePresenceProps } from './use-presence.d.ts';
export declare const splitPresenceProps: <T extends UsePresenceProps>(props: T) => [UsePresenceProps, Omit<T, "lazyMount" | "unmountOnExit" | "hideMode" | "onExitComplete" | "present" | "onEnterComplete" | "immediate" | "skipAnimationOnMount">];

// Generated from the workspace-linked pandwind package. Do not edit.
import { Rect, Point } from './types.d.ts';

declare function containsPoint(r: Rect, p: Point): boolean;
declare function containsRect(a: Rect, b: Rect): boolean;
declare function contains(r: Rect, v: Rect | Point): boolean;

export { contains, containsPoint, containsRect };

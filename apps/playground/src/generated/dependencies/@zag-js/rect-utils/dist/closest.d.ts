// Generated from the workspace-linked pandwind package. Do not edit.
import { Point, Rect, RectSide } from './types.d.ts';

declare function closest(...pts: Point[]): (a: Point) => Point;
declare function closestSideToRect(ref: Rect, r: Rect): RectSide;
declare function closestSideToPoint(ref: Rect, p: Point): RectSide;

export { closest, closestSideToPoint, closestSideToRect };

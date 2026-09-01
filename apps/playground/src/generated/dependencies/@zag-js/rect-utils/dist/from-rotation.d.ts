// Generated from the workspace-linked pandwind package. Do not edit.
import { Rect, Point } from './types.d.ts';

declare function toRad(d: number): number;
declare function rotate(a: Point, d: number, c: Point): Point;
declare function getRotationRect(r: Rect, deg: number): Rect;

export { getRotationRect, rotate, toRad };

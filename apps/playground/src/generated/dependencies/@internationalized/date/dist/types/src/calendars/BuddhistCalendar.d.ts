// Generated from the workspace-linked pandwind package. Do not edit.
import { AnyCalendarDate, CalendarIdentifier } from '../types.d.ts';
import { CalendarDate } from '../CalendarDate.d.ts';
import { GregorianCalendar } from './GregorianCalendar.d.ts';
/**
 * The Buddhist calendar is the same as the Gregorian calendar, but counts years
 * starting from the birth of Buddha in 543 BC (Gregorian). It supports only one
 * era, identified as 'BE'.
 */
export declare class BuddhistCalendar extends GregorianCalendar {
    identifier: CalendarIdentifier;
    fromJulianDay(jd: number): CalendarDate;
    toJulianDay(date: AnyCalendarDate): number;
    getEras(): string[];
    getDaysInMonth(date: AnyCalendarDate): number;
    balanceDate(): void;
}

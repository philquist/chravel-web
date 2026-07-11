/**
 * Trip IDs are UUID strings. A recurring footgun coerced them with
 * `parseInt(id) || 0`, which yields **0** for any UUID
 * (`parseInt('22be43ef-…')` is `NaN`, then `|| 0`), after which the UI silently
 * queries the non-existent trip `"0"` — surfacing as empty member lists, "0 members",
 * and broken cover-photo / join-request fetches on Pro trips.
 *
 * Use this to normalize a trip id for any component that historically expected a
 * numeric id: it keeps UUID strings intact and only stringifies genuinely numeric ids.
 */
export function toStableTripId(id: string | number | null | undefined): string {
  if (id === null || id === undefined) return '';
  return String(id);
}

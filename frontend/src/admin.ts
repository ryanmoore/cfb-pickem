/** The year a season document is for, or what is wrong with the text. */
export function documentYear(text: string): number | string {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch (e) {
    return `That isn't valid JSON: ${(e as Error).message}`;
  }
  const year = (doc as { year?: unknown } | null)?.year;
  return Number.isInteger(year) ? (year as number) : 'The document needs a whole-number "year".';
}

/**
 * Internal product codes: "2" followed by 7 digits (the GS1 in-store range, so they never clash
 * with the barcodes printed by manufacturers). Every product without its own code gets the next
 * one of its business; it is what its QR code carries.
 */
export const INTERNAL_CODE = /^2\d{7}$/;

/** The code after the highest internal one in use (null: none yet). */
export function nextInternalCode(highest: string | null): string {
  const current = highest !== null && INTERNAL_CODE.test(highest) ? Number(highest.slice(1)) : 0;
  return `2${String(current + 1).padStart(7, '0')}`;
}

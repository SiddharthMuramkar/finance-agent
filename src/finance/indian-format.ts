// Rupee, lakh and crore formatting. One lakh is 1,00,000 and one crore is 1,00,00,000.

const GROUPED = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 0 });
const WITH_PAISE = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });

const LAKH = 100_000;
const CRORE = 10_000_000;

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Rupees with Indian digit grouping: ₹12,34,567. A fraction shows only when there is one. */
export function formatInr(amount: number): string {
  const abs = Math.abs(amount);
  const text = (Number.isInteger(round2(abs)) ? GROUPED : WITH_PAISE).format(abs);
  return `${amount < 0 && text !== "0" ? "-" : ""}₹${text}`;
}

/** Rupees in words for large sums: ₹1.5 crore, ₹2.35 lakh; below one lakh the grouped number. */
export function formatInrWords(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(amount);
  const lakhs = round2(abs / LAKH);
  if (abs >= CRORE || lakhs >= 100) return `${sign}₹${GROUPED.format(round2(abs / CRORE))} crore`;
  if (abs >= LAKH) return `${sign}₹${GROUPED.format(lakhs)} lakh`;
  return formatInr(amount);
}

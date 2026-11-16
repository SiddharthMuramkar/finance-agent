import { FAQ } from "@/site/copy";

// The FAQ (spec 5.17, Appendix B): `details` rows that share one name, so opening one closes the others (the browser's
// own exclusive accordion; without it they simply open independently). `numbers` picks questions by their 1-based
// number in Appendix B; with none, every question shows. `home` reads a row's Home wording when it has one (#74: Home asks a
// Visitor to learn only four product words).

export function FaqList({ numbers, home = false }: { numbers?: readonly number[]; home?: boolean }) {
  const rows = numbers ? numbers.map((n) => FAQ[n - 1]) : FAQ;
  return (
    <div className="v-faq">
      {rows.map((row) => (
        <details key={row.q} name="faq">
          <summary>{row.q}</summary>
          <p>{home && "home" in row ? row.home : row.a}</p>
        </details>
      ))}
    </div>
  );
}

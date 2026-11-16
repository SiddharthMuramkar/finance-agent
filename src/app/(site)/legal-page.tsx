import { CONTACT_EMAIL, legal } from "@/site/copy";

// Privacy and Terms (issue #77): one plain reading page each, in the site chrome. Each section is a heading and its
// paragraphs; the contact address closes the page as text a Visitor can copy.

type LegalCopy = (typeof legal)["privacy" | "terms"];

export function LegalPage({ copy, page }: { copy: LegalCopy; page: "privacy" | "terms" }) {
  return (
    <div data-page={page}>
      <header className="v-wrap v-stack v-section tight">
        <h1 className="page-h1 v-page-title" tabIndex={-1}>
          {copy.title}
        </h1>
        <p className="v-lede v-measure">{copy.lede}</p>
        <p className="v-fine">{legal.updated}</p>
      </header>
      <div className="v-wrap v-stack v-legal">
        {copy.sections.map((section) => (
          <section key={section.heading} className="v-stack v-measure">
            <h2 className="v-h3">{section.heading}</h2>
            {section.body.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </section>
        ))}
        <section className="v-stack v-measure">
          <h2 className="v-h3">{legal.contact}</h2>
          <p>
            <ContactAddress />
          </p>
        </section>
      </div>
    </div>
  );
}

/** The contact address as plain, selectable text (spec §14): one press selects all of it. */
export function ContactAddress() {
  return (
    <span className="v-contact" data-contact="">
      {CONTACT_EMAIL}
    </span>
  );
}

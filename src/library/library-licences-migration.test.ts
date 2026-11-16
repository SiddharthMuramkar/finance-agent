import { afterAll, describe, expect, it } from "vitest";
import { closeBeforeExpand, databaseBefore, migrateToLatest } from "@/test/before-expand";
import { rowsOf } from "./search";
import { sql } from "drizzle-orm";

/**
 * #118: the data migration that takes the Yale lecture Sources out of the Library on the deploy (the build snapshots
 * Neon first), and keeps the blog Source's licence link on the fair-use statute rather than the NYU site guide.
 */

afterAll(closeBeforeExpand);

const SECTION_107 = "https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title17-section107&num=0&edition=prelim";

describe("the Library licences migration", () => {
  it("deletes every stored Yale lecture passage, document and Source, keeps the other Sources, and fixes the blog's licence link", async () => {
    const { client, db } = await databaseBefore("_library_licences");
    await client.exec(`
      INSERT INTO library_sources (id, title, kind, licence, licence_url, credit, url, fetched_on) VALUES
        ('yale-econ-251', 'Yale ECON 251', 'timeless', 'CC BY-NC-SA 3.0 US', 'https://creativecommons.org/licenses/by-nc-sa/3.0/us/', 'John Geanakoplos, Financial Theory', 'https://oyc.yale.edu/economics/econ-251', '2026-11-02'),
        ('yale-econ-252', 'Yale ECON 252', 'timeless', 'CC BY-NC-SA 3.0 US', 'https://creativecommons.org/licenses/by-nc-sa/3.0/us/', 'Robert Shiller, Financial Markets', 'https://oyc.yale.edu/economics/econ-252', '2026-11-02'),
        ('damodaran-blog', 'Musings on Markets', 'dated', 'All rights reserved', 'https://pages.stern.nyu.edu/~adamodar/New_Home_Page/guide.html', 'Aswath Damodaran', 'https://aswathdamodaran.blogspot.com/', '2026-11-02'),
        ('openstax-principles-finance-1e', 'Principles of Finance', 'timeless', 'CC BY 4.0', 'https://creativecommons.org/licenses/by/4.0/', 'Dahlquist and Knight', 'https://github.com/openstax/osbooks-principles-finance', '2026-11-02');
      INSERT INTO library_passages (source_id, ref, heading, url, text, licence, credit) VALUES
        ('yale-econ-251', 'lecture-1#1', 'Why finance?', 'https://oyc.yale.edu/economics/econ-251/lecture-1', 'Collateral and leverage.', 'CC BY-NC-SA 3.0 US', 'John Geanakoplos'),
        ('yale-econ-252', 'lecture-7#2', 'Efficient markets', 'https://oyc.yale.edu/economics/econ-252/lecture-7', 'Prices and news.', 'CC BY-NC-SA 3.0 US', 'Robert Shiller'),
        ('damodaran-blog', '2024-01#1', 'Equity risk premium', 'https://aswathdamodaran.blogspot.com/2024/01', 'The price of risk.', 'All rights reserved', 'Aswath Damodaran'),
        ('openstax-principles-finance-1e', 'm1#1', 'Present value', 'https://github.com/openstax/osbooks-principles-finance', 'A dollar today.', 'CC BY 4.0', 'Dahlquist and Knight');
      INSERT INTO library_documents (source_id, ref, published_at) VALUES
        ('yale-econ-252', 'lecture-7', '2011-05-01T00:00:00Z'),
        ('damodaran-blog', '2024-01', '2024-01-05T00:00:00Z');
    `);

    await migrateToLatest(client);

    const held = await rowsOf<{ id: string; licenceUrl: string; passages: number; documents: number }>(
      db,
      sql`select s.id, s.licence_url as "licenceUrl",
                 (select count(*)::integer from library_passages p where p.source_id = s.id) as passages,
                 (select count(*)::integer from library_documents d where d.source_id = s.id) as documents
          from library_sources s order by s.id`,
    );
    expect(held).toEqual([
      { id: "damodaran-blog", licenceUrl: SECTION_107, passages: 1, documents: 1 },
      { id: "openstax-principles-finance-1e", licenceUrl: "https://creativecommons.org/licenses/by/4.0/", passages: 1, documents: 0 },
    ]);
    const [{ yale }] = await rowsOf<{ yale: number }>(db, sql`select count(*)::integer as yale from library_passages where source_id like 'yale-%'`);
    expect(yale).toBe(0);
  });

  it("runs on a database that holds no Yale lectures (a fresh test database)", async () => {
    const { client, db } = await databaseBefore("_library_licences");
    await migrateToLatest(client);
    const [{ sources }] = await rowsOf<{ sources: number }>(db, sql`select count(*)::integer as sources from library_sources`);
    expect(sources).toBe(0);
  });
});

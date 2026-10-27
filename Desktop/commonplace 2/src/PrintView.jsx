import React from 'react';
import { citations } from './citations.js';
import { Rich } from './ui.jsx';

/** A clean, print-only layout. The browser's "Save as PDF" turns it into a file. */
export default function PrintView({ job }) {
  if (!job) return null;

  if (job.source) {
    const { source, quotes, notes, terms = [] } = job;
    const c = citations(source);
    return (
      <article className="print">
        <h1>{source.title}</h1>
        <p className="print-bib"><Rich segs={c.bib} /></p>
        {terms.length > 0 && <h2>Terms</h2>}
        {terms.map((t) => (
          <section key={t.id} className="print-term">
            <p className="print-term-name">{t.term}</p>
            <p className="print-term-def">{t.definition}</p>
          </section>
        ))}
        {quotes.length > 0 && <h2>Quotes</h2>}
        {quotes.map((q) => (
          <section key={q.id} className="print-quote">
            <blockquote>{q.text}</blockquote>
            <p className="print-cite"><Rich segs={citations(source, q.locator).short} />{q.tags.length > 0 && <span className="print-tags"> {q.tags.map((t) => `#${t}`).join(' ')}</span>}</p>
          </section>
        ))}
        {notes.length > 0 && <h2>Notes</h2>}
        {notes.map((n) => <p key={n.id} className="print-note">{n.body}</p>)}
      </article>
    );
  }

  // Search results: quotes grouped by source, bibliography entries at the end
  const groups = [];
  job.quotes.forEach((q) => {
    let g = groups.find((x) => x.source.id === q.source_id);
    if (!g) { g = { source: job.byId[q.source_id], quotes: [] }; groups.push(g); }
    g.quotes.push(q);
  });
  const label = [job.tags.map((t) => `#${t}`).join(' '), job.text ? `“${job.text}”` : ''].filter(Boolean).join(' ');

  return (
    <article className="print">
      <h1>Quotes: {label}</h1>
      {groups.map(({ source, quotes }) => (
        <section key={source.id} className="print-group">
          <h2>{source.title}</h2>
          {quotes.map((q) => (
            <section key={q.id} className="print-quote">
              <blockquote>{q.text}</blockquote>
              <p className="print-cite"><Rich segs={citations(source, q.locator).note} /></p>
            </section>
          ))}
        </section>
      ))}
      <h2>Bibliography</h2>
      {groups.map(({ source }) => source)
        .sort((a, b) => (a.authors || a.title).localeCompare(b.authors || b.title))
        .map((s) => <p key={s.id} className="print-bib hanging"><Rich segs={citations(s).bib} /></p>)}
    </article>
  );
}

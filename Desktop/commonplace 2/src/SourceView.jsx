import React, { useEffect, useMemo, useState } from 'react';
import { citations, parseAuthors } from './citations.js';
import QuoteForm from './QuoteForm.jsx';
import SourceForm from './SourceForm.jsx';
import { useData } from './store.jsx';
import { CopyButton, Rich, shortDate, submitOnMetaEnter, TagChips, TYPE_LABEL } from './ui.jsx';

// ── Outline formatting ──────────────────────────────────────────────────────
const ROMAN_UP = ['I','II','III','IV','V','VI','VII','VIII','IX','X',
                  'XI','XII','XIII','XIV','XV','XVI','XVII','XVIII','XIX','XX'];
const ROMAN_LO = ROMAN_UP.map(s => s.toLowerCase());
const OL_INDENT = 3; // spaces per level
const OL_FIRST  = ['I', 'A', '1', 'a', 'i'];

function olNext(marker, level) {
  if (level === 0) { const i = ROMAN_UP.indexOf(marker); return i >= 0 && i < 19 ? ROMAN_UP[i + 1] : marker; }
  if (level === 1) { const c = marker.charCodeAt(0); return c < 90 ? String.fromCharCode(c + 1) : marker; }
  if (level === 2) return String(parseInt(marker, 10) + 1);
  if (level === 3) { const c = marker.charCodeAt(0); return c < 122 ? String.fromCharCode(c + 1) : marker; }
  if (level === 4) { const i = ROMAN_LO.indexOf(marker); return i >= 0 && i < 19 ? ROMAN_LO[i + 1] : marker; }
  return marker;
}

function olValid(marker, level) {
  if (level === 0) return ROMAN_UP.includes(marker);
  if (level === 1) return /^[A-Z]$/.test(marker);
  if (level === 2) return /^\d+$/.test(marker);
  if (level === 3) return /^[a-z]$/.test(marker);
  if (level === 4) return ROMAN_LO.includes(marker);
  return false;
}

function olParse(line) {
  const m = line.match(/^( *)(\w+)\. (.*)/s);
  if (!m) return null;
  const [, sp, marker] = m;
  const level = Math.round(sp.length / OL_INDENT);
  if (level > 4 || !olValid(marker, level)) return null;
  return { sp, marker, level };
}

function olPrevMarker(text, level) {
  const lines = text.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const p = olParse(lines[i]);
    if (p && p.level === level) return p.marker;
  }
  return null;
}

/** Handles Enter and Tab for outline lists in a controlled textarea. */
function applyOutline(e, value, setBody) {
  if (e.metaKey || e.ctrlKey) return;
  if (e.key !== 'Enter' && e.key !== 'Tab') return;
  const el = e.target;
  const ss = el.selectionStart, se = el.selectionEnd;
  if (ss !== se) return;

  const lineStart = value.lastIndexOf('\n', ss - 1) + 1;
  const nlAfter  = value.indexOf('\n', ss);
  const lineEnd  = nlAfter >= 0 ? nlAfter : value.length;
  const line     = value.slice(lineStart, lineEnd);
  const p        = olParse(line);
  if (!p) return;

  const { sp, marker, level } = p;
  const prefixLen = sp.length + marker.length + 2; // "X. "
  const content   = line.slice(prefixLen);

  if (e.key === 'Enter') {
    e.preventDefault();
    if (!content.trim()) {
      // Empty item → strip the marker, leave cursor on a plain line
      const newVal = value.slice(0, lineStart + sp.length) + value.slice(lineStart + prefixLen);
      const cur = lineStart + sp.length;
      setBody(newVal);
      requestAnimationFrame(() => el.setSelectionRange(cur, cur));
    } else {
      // Advance to next item at same level
      const ins = '\n' + sp + olNext(marker, level) + '. ';
      const newVal = value.slice(0, ss) + ins + value.slice(ss);
      const cur = ss + ins.length;
      setBody(newVal);
      requestAnimationFrame(() => el.setSelectionRange(cur, cur));
    }
  } else {
    // Tab / Shift+Tab
    const newLevel = e.shiftKey ? level - 1 : level + 1;
    if (newLevel < 0 || newLevel > 4) return;
    e.preventDefault();
    const newSp     = ' '.repeat(newLevel * OL_INDENT);
    const prev      = olPrevMarker(value.slice(0, lineStart), newLevel);
    const newMarker = prev ? olNext(prev, newLevel) : OL_FIRST[newLevel];
    const newPrefix = newSp + newMarker + '. ';
    const posInContent = Math.max(0, ss - lineStart - prefixLen);
    const newVal = value.slice(0, lineStart) + newPrefix + content + value.slice(lineEnd);
    const cur = lineStart + newPrefix.length + posInContent;
    setBody(newVal);
    requestAnimationFrame(() => el.setSelectionRange(cur, cur));
  }
}
// ───────────────────────────────────────────────────────────────────────────

function TermComposer({ sourceId, onClose }) {
  const { saveTerm } = useData();
  const [term, setTerm] = useState('');
  const [definition, setDefinition] = useState('');
  const [busy, setBusy] = useState(false);
  const canSave = term.trim() && definition.trim();
  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    try { await saveTerm({ source_id: sourceId, term, definition }); onClose(); } finally { setBusy(false); }
  };
  return (
    <div className="term-composer">
      <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Term" autoFocus />
      <textarea rows={2} value={definition} onChange={(e) => setDefinition(e.target.value)}
        onKeyDown={submitOnMetaEnter(save)} placeholder="Definition" />
      <div className="form-actions">
        <span className="hint">⌘ Enter to save</span>
        <span className="spacer" />
        <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
        <button type="button" className="btn" disabled={busy || !canSave} onClick={save}>Save</button>
      </div>
    </div>
  );
}

function TermCard({ term: t }) {
  const { saveTerm, deleteTerm } = useData();
  const [editing, setEditing] = useState(false);
  const [term, setTerm] = useState(t.term);
  const [definition, setDefinition] = useState(t.definition);
  const save = async () => {
    if (!term.trim() || !definition.trim()) return;
    await saveTerm({ source_id: t.source_id, term, definition }, t.id);
    setEditing(false);
  };

  if (editing) {
    return (
      <li className="term-card editing">
        <input value={term} onChange={(e) => setTerm(e.target.value)} autoFocus />
        <textarea rows={Math.max(2, definition.split('\n').length + 1)} value={definition}
          onChange={(e) => setDefinition(e.target.value)} onKeyDown={submitOnMetaEnter(save)} />
        <div className="form-actions">
          <span className="spacer" />
          <button type="button" className="btn-ghost" onClick={() => { setTerm(t.term); setDefinition(t.definition); setEditing(false); }}>Cancel</button>
          <button type="button" className="btn" onClick={save}>Save changes</button>
        </div>
      </li>
    );
  }
  return (
    <li className="term-card">
      <p className="term-name">{t.term}</p>
      <p className="term-def">{t.definition}</p>
      <div className="card-actions">
        <span className="hint">{shortDate(t.created_at)}</span>
        <span className="spacer" />
        <button type="button" className="btn-ghost reveal" onClick={() => setEditing(true)}>Edit</button>
        <button type="button" className="btn-ghost btn-quiet-danger reveal" onClick={() => {
          if (window.confirm('Delete this term?')) deleteTerm(t.id);
        }}>Delete</button>
      </div>
    </li>
  );
}

function QuoteCard({ quote, source, activeTags, onTag, focused }) {
  const { saveQuote, deleteQuote } = useData();
  const [editing, setEditing] = useState(false);
  const cites = citations(source, quote.locator);

  useEffect(() => {
    if (focused) document.getElementById(`q-${quote.id}`)?.scrollIntoView({ block: 'center' });
  }, [focused, quote.id]);

  if (editing) {
    return (
      <li className="quote-card editing">
        <QuoteForm sourceType={source.type} initial={quote} submitLabel="Save changes" onCancel={() => setEditing(false)}
          onSubmit={async (f) => { await saveQuote({ ...f, source_id: source.id }, quote.id); setEditing(false); }} />
      </li>
    );
  }
  return (
    <li className={`quote-card ${focused ? 'focused' : ''}`} id={`q-${quote.id}`}>
      <blockquote><span className="marked">{quote.text}</span></blockquote>
      <div className="quote-meta">
        {quote.locator && <span className="locator">{source.type === 'podcast' ? quote.locator : `p. ${quote.locator}`}</span>}
        <TagChips tags={quote.tags} active={activeTags} onPick={onTag} />
      </div>
      <div className="card-actions">
        <CopyButton segs={cites.note} label="Copy footnote" />
        <CopyButton segs={cites.short} label="Copy short footnote" />
        <span className="spacer" />
        <button type="button" className="btn-ghost reveal" onClick={() => setEditing(true)}>Edit</button>
        <button type="button" className="btn-ghost btn-quiet-danger reveal" onClick={() => {
          if (window.confirm('Delete this quote?')) deleteQuote(quote.id);
        }}>Delete</button>
      </div>
    </li>
  );
}

function NoteCard({ note }) {
  const { saveNote, deleteNote } = useData();
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(note.body);
  const save = async () => { if (body.trim()) { await saveNote({ source_id: note.source_id, body }, note.id); setEditing(false); } };

  if (editing) {
    return (
      <li className="note-card editing">
        <textarea
          rows={Math.max(4, body.split('\n').length + 1)}
          value={body}
          autoFocus
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => { applyOutline(e, body, setBody); submitOnMetaEnter(save)(e); }}
        />
        <div className="form-actions">
          <span className="spacer" />
          <button type="button" className="btn-ghost" onClick={() => { setBody(note.body); setEditing(false); }}>Cancel</button>
          <button type="button" className="btn" onClick={save}>Save changes</button>
        </div>
      </li>
    );
  }
  return (
    <li className="note-card">
      <p className="note-body">{note.body}</p>
      <div className="card-actions">
        <span className="hint">{shortDate(note.created_at)}</span>
        <span className="spacer" />
        <button type="button" className="btn-ghost reveal" onClick={() => setEditing(true)}>Edit</button>
        <button type="button" className="btn-ghost btn-quiet-danger reveal" onClick={() => {
          if (window.confirm('Delete this note?')) deleteNote(note.id);
        }}>Delete</button>
      </div>
    </li>
  );
}

function NoteComposer({ sourceId }) {
  const { saveNote } = useData();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!body.trim()) return;
    setBusy(true);
    try { await saveNote({ source_id: sourceId, body }); setBody(''); } finally { setBusy(false); }
  };
  return (
    <div className="note-composer">
      <textarea
        rows={Math.max(3, body.split('\n').length + 1)}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => { applyOutline(e, body, setBody); submitOnMetaEnter(save)(e); }}
        placeholder="Write a note"
      />
      {body.trim() && (
        <div className="form-actions">
          <span className="hint">⌘ Enter to save</span>
          <span className="spacer" />
          <button type="button" className="btn" disabled={busy} onClick={save}>Save note</button>
        </div>
      )}
    </div>
  );
}

export default function SourceView({ id, focusQuoteId, onExport }) {
  const { sources, quotes, notes, terms, saveQuote, loading } = useData();
  const source = sources.find((s) => s.id === id);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addingTerm, setAddingTerm] = useState(false);
  const [tagFilter, setTagFilter] = useState([]);
  const [termSearch, setTermSearch] = useState('');

  const myQuotes = useMemo(() => quotes.filter((q) => q.source_id === id), [quotes, id]);
  const myNotes = useMemo(() => notes.filter((n) => n.source_id === id), [notes, id]);
  const myTerms = useMemo(() => terms.filter((t) => t.source_id === id), [terms, id]);
  const shownTerms = useMemo(() => {
    const q = termSearch.trim().toLowerCase();
    return q ? myTerms.filter((t) => t.term.toLowerCase().includes(q) || t.definition.toLowerCase().includes(q)) : myTerms;
  }, [myTerms, termSearch]);
  const tagsHere = useMemo(() => [...new Set(myQuotes.flatMap((q) => q.tags))].sort(), [myQuotes]);
  const shown = tagFilter.length ? myQuotes.filter((q) => tagFilter.every((t) => q.tags.includes(t))) : myQuotes;
  const toggle = (t) => setTagFilter((f) => (f.includes(t) ? f.filter((x) => x !== t) : [...f, t]));

  if (loading) return <p className="hint pad">Loading…</p>;
  if (!source) return <div className="empty pad"><p>This source was deleted or doesn't exist. <a href="#/">Back to the library</a></p></div>;

  const cites = citations(source);
  const names = parseAuthors(source.authors).map((a) => [a.first, a.last].filter(Boolean).join(' '));
  const d = source.details || {};
  const where = source.type === 'podcast' ? d.podcast : source.type === 'article' ? d.publication : d.publisher;
  const when = source.type === 'book' ? d.year : d.date?.slice(0, 4);

  return (
    <div className="source">
      <header className="source-head">
        <div className="source-id">
          <a href="#/" className="back">Library</a>
          <span className="type-tag">{TYPE_LABEL[source.type]}</span>
          <h1>{source.title}{d.subtitle && <span className="subtitle">{d.subtitle}</span>}</h1>
          <p className="source-by">{[names.join(', '), [where, when].filter(Boolean).join(', ')].filter(Boolean).join(' / ')}</p>
        </div>
        <div className="source-actions">
          <button type="button" className="btn-ghost" onClick={() => setEditing(true)}>Edit source</button>
          <button type="button" className="btn-ghost" onClick={() => onExport({ source, quotes: myQuotes, notes: myNotes, terms: myTerms })}>Export PDF</button>
        </div>
      </header>

      <dl className="cite-bar">
        {[['Bibliography', cites.bib], ['Footnote', cites.note], ['Short footnote', cites.short]].map(([label, segs]) => (
          <div key={label} className="cite-row">
            <dt>{label}</dt>
            <dd><Rich segs={segs} /></dd>
            <CopyButton segs={segs} />
          </div>
        ))}
      </dl>

      <div className="spread">
        <section className="page page-left" aria-label="Notes">
          <div className="page-head">
            <h2>Notes</h2>
            <span className="hint">{myNotes.length}</span>
          </div>
          <NoteComposer sourceId={source.id} />
          <ul className="note-list">
            {myNotes.map((n) => <NoteCard key={n.id} note={n} />)}
          </ul>
        </section>

        <section className="page page-right" aria-label="Terms and Quotes">
          <div className="page-head">
            <h2>Terms</h2>
            <span className="hint">{myTerms.length}</span>
            <span className="spacer" />
            {!addingTerm && <button type="button" className="btn" onClick={() => setAddingTerm(true)}>Add term</button>}
          </div>
          {myTerms.length > 0 && (
            <input className="term-search" placeholder="Search terms…" value={termSearch}
              onChange={(e) => setTermSearch(e.target.value)} />
          )}
          {addingTerm && <TermComposer sourceId={source.id} onClose={() => setAddingTerm(false)} />}
          {myTerms.length === 0 && !addingTerm && <p className="hint">No terms yet.</p>}
          {shownTerms.length === 0 && myTerms.length > 0 && <p className="hint">No terms match.</p>}
          <ul className="term-list">
            {shownTerms.map((t) => <TermCard key={t.id} term={t} />)}
          </ul>

          <hr className="page-divider" />

          <div className="page-head">
            <h2>Quotes</h2>
            <span className="hint">{shown.length}{tagFilter.length ? ` of ${myQuotes.length}` : ''}</span>
            <span className="spacer" />
            {!adding && <button type="button" className="btn" onClick={() => setAdding(true)}>Add quote</button>}
          </div>
          {tagsHere.length > 0 && (
            <div className="tag-filter">
              <TagChips tags={tagsHere} active={tagFilter} onPick={toggle} />
              {tagFilter.length > 0 && <button type="button" className="btn-ghost" onClick={() => setTagFilter([])}>Show all</button>}
            </div>
          )}
          {adding && (
            <div className="quote-composer">
              <QuoteForm sourceType={source.type} onCancel={() => setAdding(false)}
                onSubmit={(f) => saveQuote({ ...f, source_id: source.id })} />
            </div>
          )}
          {myQuotes.length === 0 && !adding && <p className="hint">No quotes yet. Add the first one, or press Q from anywhere.</p>}
          <ul className="quote-list">
            {shown.map((q) => (
              <QuoteCard key={q.id} quote={q} source={source} activeTags={tagFilter} onTag={toggle} focused={q.id === focusQuoteId} />
            ))}
          </ul>
        </section>
      </div>

      {editing && <SourceForm source={source} onClose={() => setEditing(false)} />}
    </div>
  );
}

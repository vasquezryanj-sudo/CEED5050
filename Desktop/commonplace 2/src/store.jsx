import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase.js';

const DataContext = createContext(null);
export const useData = () => useContext(DataContext);

const byNewest = (a, b) => (b.created_at || '').localeCompare(a.created_at || '');

export function DataProvider({ children, onError }) {
  const [sources, setSources] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [notes, setNotes] = useState([]);
  const [terms, setTerms] = useState([]);
  const [loading, setLoading] = useState(true);

  const fail = useCallback((error) => {
    if (error) { onError?.(error.message || String(error)); throw error; }
  }, [onError]);

  useEffect(() => {
    (async () => {
      const [s, q, n, tm] = await Promise.all([
        supabase.from('sources').select('*'),
        supabase.from('quotes').select('*'),
        supabase.from('notes').select('*'),
        supabase.from('terms').select('*'),
      ]);
      const err = s.error || q.error || n.error;
      if (err) onError?.(`Couldn't load your library: ${err.message}`);
      setSources(s.data || []);
      setQuotes((q.data || []).sort(byNewest));
      setNotes((n.data || []).sort(byNewest));
      setTerms((tm.data || []).sort(byNewest));
      setLoading(false);
    })();
  }, [onError]);

  // Mark a source as recently touched so it rises to the top of the library
  const touch = (sourceId) => setSources((list) => list.map((s) =>
    s.id === sourceId ? { ...s, updated_at: new Date().toISOString() } : s));

  const api = useMemo(() => ({
    async saveSource(fields, id) {
      const row = {
        type: fields.type, title: fields.title.trim(), authors: fields.authors.trim(),
        details: fields.details, citation_overrides: fields.citation_overrides,
      };
      if (id) {
        const { data, error } = await supabase.from('sources').update(row).eq('id', id).select().single();
        fail(error);
        setSources((l) => l.map((s) => (s.id === id ? data : s)));
        return data;
      }
      const { data, error } = await supabase.from('sources').insert(row).select().single();
      fail(error);
      setSources((l) => [data, ...l]);
      return data;
    },
    async deleteSource(id) {
      const { error } = await supabase.from('sources').delete().eq('id', id);
      fail(error);
      setSources((l) => l.filter((s) => s.id !== id));
      setQuotes((l) => l.filter((q) => q.source_id !== id));
      setNotes((l) => l.filter((n) => n.source_id !== id));
      setTerms((l) => l.filter((t) => t.source_id !== id));
    },
    async saveQuote(fields, id) {
      const row = { source_id: fields.source_id, text: fields.text.trim(), locator: fields.locator.trim(), tags: fields.tags };
      const query = id
        ? supabase.from('quotes').update(row).eq('id', id)
        : supabase.from('quotes').insert(row);
      const { data, error } = await query.select().single();
      fail(error);
      setQuotes((l) => (id ? l.map((q) => (q.id === id ? data : q)) : [data, ...l]));
      touch(row.source_id);
      return data;
    },
    async deleteQuote(id) {
      const { error } = await supabase.from('quotes').delete().eq('id', id);
      fail(error);
      setQuotes((l) => l.filter((q) => q.id !== id));
    },
    async saveNote(fields, id) {
      const row = { source_id: fields.source_id, body: fields.body.trim() };
      const query = id
        ? supabase.from('notes').update(row).eq('id', id)
        : supabase.from('notes').insert(row);
      const { data, error } = await query.select().single();
      fail(error);
      setNotes((l) => (id ? l.map((n) => (n.id === id ? data : n)) : [data, ...l]));
      touch(row.source_id);
      return data;
    },
    async deleteNote(id) {
      const { error } = await supabase.from('notes').delete().eq('id', id);
      fail(error);
      setNotes((l) => l.filter((n) => n.id !== id));
    },
    async saveTerm(fields, id) {
      const row = { source_id: fields.source_id, term: fields.term.trim(), definition: fields.definition.trim() };
      const query = id
        ? supabase.from('terms').update(row).eq('id', id)
        : supabase.from('terms').insert(row);
      const { data, error } = await query.select().single();
      fail(error);
      setTerms((l) => (id ? l.map((t) => (t.id === id ? data : t)) : [data, ...l]));
      touch(row.source_id);
      return data;
    },
    async deleteTerm(id) {
      const { error } = await supabase.from('terms').delete().eq('id', id);
      fail(error);
      setTerms((l) => l.filter((t) => t.id !== id));
    },
  }), [fail]);

  const allTags = useMemo(() => {
    const counts = new Map();
    quotes.forEach((q) => q.tags.forEach((t) => counts.set(t, (counts.get(t) || 0) + 1)));
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [quotes]);

  const value = { sources, quotes, notes, terms, loading, allTags, ...api };
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

/** "privacy, Surveillance Capitalism , #power" -> ["privacy", "surveillance capitalism", "power"] */
export function parseTags(str) {
  const seen = new Set();
  return str.split(',').map((t) => t.trim().replace(/^#/, '').toLowerCase()).filter((t) => {
    if (!t || seen.has(t)) return false;
    seen.add(t);
    return true;
  });
}

/** Split a search box value into #tags and plain words. Multi-word tags use hyphens or quotes: #"civic tech" */
export function parseQuery(q) {
  const tags = [];
  const text = q.replace(/#"([^"]+)"|#(\S+)/g, (_, quoted, bare) => {
    tags.push((quoted || bare).toLowerCase());
    return ' ';
  }).trim().toLowerCase();
  return { tags, text };
}

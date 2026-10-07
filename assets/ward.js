/* ============================================================================
   SaberGuard SRA Workspace: Ward evidence import
   SRAWard.read(data)                  -> a checked Ward evidence file
   SRAWard.plan(controls, meta, file)  -> what attaching it would do
   SRAWard.apply(controls, plan, opts) -> attaches files, fills empty notes
   Pure functions. No DOM. Loaded after catalog.js.

   Ward is SaberGuard's configuration collector. It reads a client's Microsoft
   365 tenant, runs deterministic rules, and exports one file per collection
   with the rule outcomes and observed facts, grouped by 45 CFR citation.
   Each safeguard in that file goes to the catalog row with the same citation
   as one JSON attachment. If the row has no notes yet, one line naming the
   collection, the rule outcome and the fact keys is written there.

   Nothing here sets a status or a verification basis. Met, Partially met and
   Not met stay the assessor's call, made with the evidence in front of them.
   ========================================================================== */
const SRAWard = (function () {
  'use strict';

  const FORMAT = 'SaberGuard Ward evidence';
  const VERSION = 1;
  const OUTCOMES = {
    finding: 'finding',
    met: 'met',
    insufficient_evidence: 'insufficient evidence',
    /* Not "not applicable": on a catalog row that reads like a status. The
       rule's precondition was false (for example no device enrolled), so
       the rule had nothing to evaluate. */
    not_applicable: 'did not apply'
  };
  const SOURCES = { microsoft: 'Microsoft 365', google: 'Google Workspace' };

  const isStr = v => typeof v === 'string' && v.length > 0;
  /* UTF-8 byte length without TextEncoder, so this also runs in the test vm. */
  const utf8Bytes = s => encodeURIComponent(s).replace(/%[0-9A-F]{2}/gi, 'x').length;
  const nameKey = s => String(s || '').toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\b(llc|pllc|inc|pc|ltd|co|corp|the|and)\b/g, ' ')
    .replace(/[^a-z0-9]/g, '');

  function read(data) {
    if (!data || typeof data !== 'object') throw new Error('This is not a Ward evidence file.');
    if (data.format === FILE_FORMAT.name) throw new Error('This is a saved assessment file, not a Ward evidence file. Use Open for assessment files.');
    if (data.format !== FORMAT) throw new Error('This is not a Ward evidence file.');
    if (data.version !== VERSION) throw new Error(`This Ward evidence file is version ${data.version}; this workspace reads version ${VERSION}.`);
    const { client, collection } = data;
    if (!client || !isStr(client.id) || !isStr(client.name)) throw new Error('The Ward evidence file has no client id or name.');
    if (!collection || !isStr(collection.id) || !isStr(collection.collected_at) || !isStr(collection.source)) throw new Error('The Ward evidence file has no collection id, date or source.');
    if (!Array.isArray(data.safeguards)) throw new Error('The Ward evidence file has no safeguards list.');
    data.safeguards.forEach((s, i) => {
      if (!s || !isStr(s.citation)) throw new Error(`Safeguard ${i + 1} in the Ward evidence file has no citation.`);
      if (!OUTCOMES[s.outcome]) throw new Error(`Safeguard ${s.citation} has an unknown outcome "${s.outcome}".`);
    });
    return data;
  }

  function attachmentName(file, rowId) {
    return `ward-${file.client.id}-${file.collection.collected_at.slice(0, 10)}-${file.collection.id.slice(0, 8)}-${rowId}.json`;
  }

  function attachmentFor(file, safeguard, rowId) {
    const slice = {
      format: `${FORMAT}, one safeguard`,
      version: VERSION,
      generated_at: file.generated_at || null,
      client: file.client,
      collection: file.collection,
      engine_version: file.engine_version || '',
      safeguard
    };
    const json = JSON.stringify(slice, null, 2);
    return {
      name: attachmentName(file, rowId),
      type: 'application/json',
      size: utf8Bytes(json),
      data: 'data:application/json;charset=utf-8,' + encodeURIComponent(json)
    };
  }

  function noteFor(file, s) {
    const c = file.collection;
    const source = SOURCES[c.source] || c.source;
    const rules = (s.rules || []).map(r => {
      const f = r.status === 'finding' ? (s.findings || []).find(x => x.rule_id === r.rule_id) : null;
      const rejected = (s.rejected_findings || []).some(x => x.rule_id === r.rule_id);
      return `${r.rule_id} ${rejected ? 'finding rejected in review' : (OUTCOMES[r.status] || r.status)}${f && f.severity ? ` (${f.severity})` : ''}`;
    });
    const rejected = s.rejected_findings || [];
    const keys = [...new Set((s.facts || []).map(f => f.key).filter(Boolean))];
    return [
      `Ward, ${source} collection of ${c.collected_at.slice(0, 10)} (${c.id.slice(0, 8)}):`,
      `Rule outcome: ${OUTCOMES[s.outcome]}.`,
      rules.length ? `Rules: ${rules.join(', ')}.` : '',
      rejected.length ? `${rejected.length} finding${rejected.length === 1 ? '' : 's'} rejected in review (${rejected.map(r => r.rule_id).join(', ')}).` : '',
      keys.length ? `Facts: ${keys.join(', ')}.` : 'No facts recorded.',
      'Evidence attached. Status is the assessor\'s call.'
    ].filter(Boolean).join(' ');
  }

  function plan(controls, meta, file) {
    const byCite = {};
    CONTROLS.forEach(c => { byCite[c.cite] = c; });
    const rows = [];
    const unmatched = [];
    file.safeguards.forEach(s => {
      const c = byCite[s.citation];
      if (!c) { unmatched.push(s.citation); return; }
      const attachment = attachmentFor(file, s, c.id);
      const existing = (controls[c.id] && controls[c.id].evidence) || [];
      rows.push({
        id: c.id,
        title: c.title,
        citation: s.citation,
        outcome: s.outcome,
        attachment,
        note: noteFor(file, s),
        duplicate: existing.some(e => e && e.name === attachment.name)
      });
    });
    const org = nameKey(meta && meta.orgName);
    return {
      client: file.client,
      collection: file.collection,
      rows,
      unmatched,
      nameMismatch: !!org && org !== nameKey(file.client.name)
    };
  }

  /* opts.budget is the number of evidence bytes still allowed in the
     assessment. A row whose attachment would pass it is skipped. */
  function apply(controls, p, opts = {}) {
    let budget = typeof opts.budget === 'number' ? opts.budget : Infinity;
    const attached = [], noted = [], overLimit = [], skipped = [];
    p.rows.forEach(r => {
      if (r.duplicate) { skipped.push(r.id); return; }
      if (r.attachment.size > budget) { overLimit.push(r.id); return; }
      const c = controls[r.id] || (controls[r.id] = SRAFormat.newControl());
      if (!Array.isArray(c.evidence)) c.evidence = [];
      c.evidence.push({ ...r.attachment });
      budget -= r.attachment.size;
      attached.push(r.id);
      if (!String(c.notes || '').trim()) { c.notes = r.note; noted.push(r.id); }
    });
    return { attached, noted, overLimit, skipped };
  }

  return { read, plan, apply, FORMAT, VERSION };
})();
if (typeof window !== 'undefined') window.SRAWard = SRAWard;

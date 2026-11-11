/* ============================================================================
   SaberGuard SRA Workspace: Ward evidence import
   SRAWard.read(data)                  -> a checked Ward evidence file
   SRAWard.plan(controls, meta, file)  -> what attaching it would do
   SRAWard.apply(controls, plan, opts) -> attaches files, fills empty notes
   SRAWard.drafts(state, file)         -> inventory rows and risks to offer
   SRAWard.describe(file)              -> one line naming the collections
   Pure functions. No DOM. Loaded after catalog.js and format.js.

   Ward is SaberGuard's configuration collector. It reads a client's Microsoft
   365 or Google Workspace tenant, the devices its RMM (Level) manages, the
   public DNS records of its mail domains, and the answers the consultant
   records in the interview, runs deterministic rules, and exports one file
   per client with the rule outcomes and observed facts, grouped by 45 CFR
   citation. Each safeguard in that file goes to the catalog row with the same
   citation as one JSON attachment. If the row has no notes yet, one line
   naming the collections, the rule outcome and the fact keys is written
   there, with the basis of each attested fact.

   File versions: 1 has one `collection`. 2 adds `collections`, the newest
   evaluated collection of every source, and names the source on every fact,
   finding and rule; `collection` stays as the newest of them. A version 2
   file may also carry `inventory`: the tenant services, managed devices and
   mail domains Ward saw. An older file without it still reads.

   A row whose newest Ward attachment says the same thing as the new one
   (same outcome, rules, findings and fact values) is not attached again, so
   a weekly collection with nothing new adds nothing.

   Drafts. drafts() offers, and only offers, two things the assessor adds by
   choice: an inventory row for each service and device Ward saw that the
   inventory does not name yet, and a draft risk for each open finding (one
   not rejected in review) not already in the register. Draft inventory rows
   leave the ePHI held and the lifecycle blank, and draft risks leave
   likelihood, impact, owner, date and treatment blank, so the completeness
   checks stay open until the assessor has confirmed each one.

   Nothing here sets a status or a verification basis. Met, Partially met and
   Not met stay the assessor's call, made with the evidence in front of them.
   An attested fact's basis is quoted in the note and goes no further.
   ========================================================================== */
const SRAWard = (function () {
  'use strict';

  const FORMAT = 'SaberGuard Ward evidence';
  const VERSIONS = [1, 2];
  const OUTCOMES = {
    finding: 'finding',
    met: 'met',
    insufficient_evidence: 'insufficient evidence',
    /* Not "not applicable": on a catalog row that reads like a status. The
       rule's precondition was false (for example no device enrolled), so
       the rule had nothing to evaluate. */
    not_applicable: 'did not apply'
  };
  /* Ward's own names for its sources (ui/lib/labels.ts in Ward). An unknown
     source shows as itself rather than hiding. */
  const SOURCES = {
    microsoft: 'Microsoft 365',
    google: 'Google Workspace',
    level: 'Devices (Level)',
    dns: 'Mail domain (DNS)',
    attestation: 'Attestation'
  };
  /* An attested fact's source_ref is attestation/<question key>/<basis>. */
  const ATTESTED = /^attestation\/.+\/([a-z]+)$/;
  /* Tenant services and the vendor each one names in the inventory. */
  const SERVICES = {
    microsoft: { name: 'Microsoft 365', vendor: 'Microsoft' },
    google: { name: 'Google Workspace', vendor: 'Google' }
  };
  const PLATFORMS = { windows: 'Windows', mac: 'macOS', linux: 'Linux' };

  const isStr = v => typeof v === 'string' && v.length > 0;
  const sourceLabel = s => SOURCES[s] || s;
  const day = c => c.collected_at.slice(0, 10);
  /* UTF-8 byte length without TextEncoder, so this also runs in the test vm. */
  const utf8Bytes = s => encodeURIComponent(s).replace(/%[0-9A-F]{2}/gi, 'x').length;
  const nameKey = s => String(s || '').toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\b(llc|pllc|inc|pc|ltd|co|corp|the|and)\b/g, ' ')
    .replace(/[^a-z0-9]/g, '');
  /* JSON with object keys sorted, so two exports of the same safeguard compare
     equal whatever order the keys were written in. */
  const stable = v => Array.isArray(v) ? `[${v.map(stable).join(',')}]`
    : v && typeof v === 'object' ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`
    : JSON.stringify(v === undefined ? null : v);
  /* FNV-1a, 32 bits. Tells two evaluations of one collection apart in a file
     name; not a security measure. */
  const fingerprint = s => {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(16).padStart(8, '0');
  };

  const validCollection = c => c && isStr(c.id) && isStr(c.collected_at) && isStr(c.source);

  function read(data) {
    if (!data || typeof data !== 'object') throw new Error('This is not a Ward evidence file.');
    if (data.format === FILE_FORMAT.name) throw new Error('This is a saved assessment file, not a Ward evidence file. Use Open for assessment files.');
    if (data.format !== FORMAT) throw new Error('This is not a Ward evidence file.');
    if (!VERSIONS.includes(data.version)) throw new Error(`This Ward evidence file is version ${data.version}; this workspace reads versions ${VERSIONS.join(' and ')}.`);
    const { client, collection } = data;
    if (!client || !isStr(client.id) || !isStr(client.name)) throw new Error('The Ward evidence file has no client id or name.');
    if (!validCollection(collection)) throw new Error('The Ward evidence file has no collection id, date or source.');
    if (data.version >= 2) {
      if (!Array.isArray(data.collections) || !data.collections.length) throw new Error('The Ward evidence file has no collections list.');
      data.collections.forEach((c, i) => {
        if (!validCollection(c)) throw new Error(`Collection ${i + 1} in the Ward evidence file has no id, date or source.`);
      });
    }
    if (!Array.isArray(data.safeguards)) throw new Error('The Ward evidence file has no safeguards list.');
    data.safeguards.forEach((s, i) => {
      if (!s || !isStr(s.citation)) throw new Error(`Safeguard ${i + 1} in the Ward evidence file has no citation.`);
      if (!OUTCOMES[s.outcome]) throw new Error(`Safeguard ${s.citation} has an unknown outcome "${s.outcome}".`);
    });
    if (data.inventory != null && (typeof data.inventory !== 'object' || Array.isArray(data.inventory))) throw new Error('The Ward evidence file has an inventory that is not a list of services, devices and domains.');
    return data;
  }

  /* Every collection the file draws on, newest first. */
  function collectionsOf(file) {
    return file.version >= 2 ? file.collections : [file.collection];
  }

  /* The collections one safeguard draws on: those its rules, findings and
     facts name. A version 1 file has only one. */
  function usedBy(file, s) {
    const all = collectionsOf(file);
    if (file.version < 2) return all;
    const ids = new Set(), sources = new Set();
    [...(s.rules || []), ...(s.findings || []), ...(s.facts || [])].forEach(x => {
      if (x && isStr(x.collection_id)) ids.add(x.collection_id);
      if (x && isStr(x.source)) sources.add(x.source);
    });
    const used = all.filter(c => ids.has(c.id) || sources.has(c.source));
    return used.length ? used : all;
  }

  function describe(file) {
    const all = collectionsOf(file);
    if (all.length === 1) return `${sourceLabel(all[0].source)} collection of ${day(all[0])}`;
    return `${all.length} collections (${all.map(c => `${sourceLabel(c.source)} ${day(c)}`).join(', ')})`;
  }

  function attachmentName(file, rowId, revision) {
    return `ward-${file.client.id}-${day(file.collection)}-${file.collection.id.slice(0, 8)}-${rowId}${revision ? '-' + revision : ''}.json`;
  }

  function attachmentFor(file, safeguard, rowId, revision) {
    const slice = {
      format: `${FORMAT}, one safeguard`,
      version: file.version,
      generated_at: file.generated_at || null,
      client: file.client,
      collection: file.collection,
      ...(file.version >= 2 ? { collections: usedBy(file, safeguard) } : {}),
      engine_version: file.engine_version || '',
      safeguard
    };
    const json = JSON.stringify(slice, null, 2);
    return {
      name: attachmentName(file, rowId, revision),
      type: 'application/json',
      size: utf8Bytes(json),
      data: 'data:application/json;charset=utf-8,' + encodeURIComponent(json)
    };
  }

  /* The safeguard inside an attachment this module made, or null when the
     attachment has no data (an assessment saved without evidence). */
  function safeguardIn(evidence) {
    const d = evidence && evidence.data;
    if (!isStr(d) || !d.startsWith('data:application/json')) return null;
    try { return JSON.parse(decodeURIComponent(d.slice(d.indexOf(',') + 1))).safeguard || null; } catch (e) { return null; }
  }

  /* What a safeguard says, without when it was collected: two collections
     that observed the same thing compare equal. */
  const substance = s => stable({
    outcome: s.outcome,
    rules: (s.rules || []).map(r => stable([r.rule_id, r.status])).sort(),
    findings: (s.findings || []).map(f => stable([f.rule_id, f.severity, f.narrative, f.review ? f.review.verdict : null])).sort(),
    rejected: (s.rejected_findings || []).map(r => r.rule_id).sort(),
    facts: (s.facts || []).filter(f => f && isStr(f.key)).map(f => stable([f.key, f.value])).sort()
  });

  const andList = xs => xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;

  function noteFor(file, s) {
    const used = usedBy(file, s).map(c => `${sourceLabel(c.source)} collection of ${day(c)} (${c.id.slice(0, 8)})`);
    const rules = (s.rules || []).map(r => {
      const f = r.status === 'finding' ? (s.findings || []).find(x => x.rule_id === r.rule_id) : null;
      const rejected = (s.rejected_findings || []).some(x => x.rule_id === r.rule_id);
      return `${r.rule_id} ${rejected ? 'finding rejected in review' : (OUTCOMES[r.status] || r.status)}${f && f.severity ? ` (${f.severity})` : ''}`;
    });
    const rejected = s.rejected_findings || [];
    const keys = [], basis = {};
    (s.facts || []).forEach(f => {
      if (!f || !isStr(f.key)) return;
      if (!keys.includes(f.key)) keys.push(f.key);
      const m = isStr(f.source_ref) && f.source_ref.match(ATTESTED);
      if (m && !basis[f.key]) basis[f.key] = (BASIS_LABELS[m[1]] || m[1]).toLowerCase();
    });
    return [
      `Ward, ${andList(used)}:`,
      `Rule outcome: ${OUTCOMES[s.outcome]}.`,
      rules.length ? `Rules: ${rules.join(', ')}.` : '',
      rejected.length ? `${rejected.length} finding${rejected.length === 1 ? '' : 's'} rejected in review (${rejected.map(r => r.rule_id).join(', ')}).` : '',
      keys.length ? `Facts: ${keys.map(k => basis[k] ? `${k} (attested, ${basis[k]})` : k).join(', ')}.` : 'No facts recorded.',
      'Evidence attached. Status and verification basis are the assessor\'s call.'
    ].filter(Boolean).join(' ');
  }

  /* A row's citation may name two paragraphs ("164.308(b)(1) and (b)(2)");
     a safeguard citing either one lands on that row. */
  function citesOf(cite) {
    const [first, ...rest] = String(cite).split(' and ');
    const section = first.replace(/\(.*$/, '');
    return [cite, first, ...rest.map(p => p.startsWith('(') ? section + p : p)];
  }

  function plan(controls, meta, file) {
    const byCite = {};
    CONTROLS.forEach(c => { byCite[c.cite] = c; });
    CONTROLS.forEach(c => citesOf(c.cite).forEach(k => { if (!byCite[k]) byCite[k] = c; }));
    const rows = [];
    const unmatched = [];
    file.safeguards.forEach(s => {
      const c = byCite[s.citation];
      if (!c) { unmatched.push(s.citation); return; }
      const existing = ((controls[c.id] && controls[c.id].evidence) || []).filter(Boolean);
      const named = name => existing.find(e => e.name === name);
      let attachment = attachmentFor(file, s, c.id);
      let duplicate = false;
      const prior = named(attachment.name);
      if (prior) {
        /* Same file name: the same collection was attached before. If the
           safeguard is unchanged (or the earlier file kept no data to compare)
           it is a duplicate. If the collection was evaluated again since, for
           example after new rules were activated, the new outcome is attached
           beside the old one under a name that tells them apart. */
        const was = safeguardIn(prior);
        if (!was || stable(was) === stable(s)) duplicate = true;
        else {
          attachment = attachmentFor(file, s, c.id, fingerprint(stable(s)));
          duplicate = !!named(attachment.name);
        }
      }
      /* The newest Ward attachment already on the row for this citation. If
         it says the same thing, a newer collection adds nothing to attach. */
      let unchanged = null;
      if (!duplicate) {
        const latest = existing.map(e => ({ e, was: safeguardIn(e) })).filter(x => x.was && x.was.citation === s.citation).pop();
        if (latest && substance(latest.was) === substance(s)) unchanged = latest.e.name;
      }
      rows.push({
        id: c.id,
        title: c.title,
        citation: s.citation,
        outcome: s.outcome,
        attachment,
        note: noteFor(file, s),
        duplicate,
        unchanged
      });
    });
    const org = nameKey(meta && meta.orgName);
    return {
      client: file.client,
      collection: file.collection,
      collections: collectionsOf(file),
      rows,
      unmatched,
      nameMismatch: !!org && org !== nameKey(file.client.name)
    };
  }

  /* opts.budget is the number of evidence bytes still allowed in the
     assessment. A row whose attachment would pass it is skipped. */
  function apply(controls, p, opts = {}) {
    let budget = typeof opts.budget === 'number' ? opts.budget : Infinity;
    const attached = [], noted = [], overLimit = [], skipped = [], unchanged = [];
    p.rows.forEach(r => {
      if (r.duplicate) { skipped.push(r.id); return; }
      if (r.unchanged) { unchanged.push(r.id); return; }
      if (r.attachment.size > budget) { overLimit.push(r.id); return; }
      const c = controls[r.id] || (controls[r.id] = SRAFormat.newControl());
      if (!Array.isArray(c.evidence)) c.evidence = [];
      c.evidence.push({ ...r.attachment });
      budget -= r.attachment.size;
      attached.push(r.id);
      if (!String(c.notes || '').trim()) { c.notes = r.note; noted.push(r.id); }
    });
    return { attached, noted, overLimit, skipped, unchanged };
  }

  /* ---- Drafts: inventory rows and risks ----------------------------------- */
  const lower = s => String(s || '').trim().toLowerCase();
  const list = v => Array.isArray(v) ? v : [];
  const sentence = s => { const t = String(s || '').trim(); return !t || /[.!?]$/.test(t) ? t : t + '.'; };

  /* The inventory section of the file, every list checked, every entry kept
     only if it names what it is. */
  function inventoryOf(file) {
    const inv = file.inventory || {};
    return {
      services: list(inv.services).filter(x => x && SERVICES[x.source]),
      devices: list(inv.devices).filter(x => x && isStr(x.name)),
      domains: list(inv.domains).filter(x => x && isStr(x.domain))
    };
  }

  function collectionLabel(file, id, source) {
    const c = collectionsOf(file).find(x => x.id === id) || collectionsOf(file).find(x => x.source === source);
    return c ? `${sourceLabel(c.source)} collection of ${day(c)}` : sourceLabel(source);
  }

  function assetDrafts(file) {
    const inv = inventoryOf(file);
    const out = [];
    const providers = new Set(inv.services.map(s => s.source));
    inv.services.forEach(s => {
      const svc = SERVICES[s.source];
      const domains = inv.domains.filter(d => d.mx_provider === s.source).map(d => d.domain);
      out.push({
        key: svc.name,
        source: s.source,
        asset: {
          name: svc.name,
          kind: 'application',
          zone: 'systems',
          vendor: svc.vendor,
          location: 'vendor-hosted',
          protection: [
            `From Ward, ${collectionLabel(file, s.collection_id, s.source)}${isStr(s.tenant_id) ? `, tenant ${s.tenant_id}` : ''}.`,
            domains.length ? `Mail for ${andList(domains)} is delivered here.` : '',
            'Confirm the ePHI it holds (for example email and files), the lifecycle stages, and the business associate agreement. The configuration evidence is on the catalog rows.'
          ].filter(Boolean).join(' ')
        }
      });
    });
    /* Mail delivered somewhere Ward does not read as a tenant. */
    const elsewhere = inv.domains.filter(d => d.mx_provider && !['none', ...providers].includes(d.mx_provider));
    elsewhere.forEach(d => {
      const svc = SERVICES[d.mx_provider];
      const name = svc ? `${svc.name} (mail for ${d.domain})` : `Email service for ${d.domain}`;
      out.push({
        key: name,
        source: 'dns',
        domain: d.domain,
        asset: {
          name,
          kind: 'application',
          zone: 'external',
          vendor: svc ? svc.vendor : '',
          location: 'vendor-hosted',
          protection: `From Ward, ${collectionLabel(file, d.collection_id, 'dns')}: the MX records of ${d.domain} point to ${svc ? svc.name : 'a provider Ward does not recognize'}. Name the provider, confirm whether it handles ePHI and whether a business associate agreement is on file.`
        }
      });
    });
    inv.devices.forEach(d => {
      const platform = PLATFORMS[d.platform] || (isStr(d.platform) && d.platform !== 'unknown' ? d.platform : '');
      out.push({
        key: d.name,
        source: 'level',
        asset: {
          name: d.name,
          kind: 'device',
          zone: 'devices',
          atRest: d.encryption_failing === true ? 'no' : 'unknown',
          protection: [
            `From Ward, ${collectionLabel(file, d.collection_id, 'level')}${platform ? `: ${platform}` : ''}.`,
            d.ephi_tagged === true ? 'Tagged as holding ePHI in Level.' : 'Not tagged as holding ePHI in Level: confirm whether it holds ePHI, and remove this row if it does not.',
            d.encryption_failing === true ? 'Level reports its disk encryption check failing.' : '',
            d.os_end_of_life === true ? 'Its operating system is past end of life.' : '',
            d.stale === true ? 'It has not checked in recently.' : ''
          ].filter(Boolean).join(' ')
        }
      });
    });
    return out;
  }

  /* An open finding is one in `findings`: rejected ones are listed apart. */
  const RISK_TAG = id => `Ward finding ${id}`;
  const hasTag = (text, id) => new RegExp(`\\b${RISK_TAG(id).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(String(text || ''));

  function drafts(state, file) {
    const assets = list(state && state.assets);
    const risks = list(state && state.risks);
    const names = new Set(assets.map(a => lower(a.name)));
    const offered = [], alreadyInInventory = [];
    assetDrafts(file).forEach(d => {
      if (names.has(lower(d.asset.name))) { alreadyInInventory.push(d.asset.name); return; }
      names.add(lower(d.asset.name));
      offered.push({ ...d, asset: SRAFormat.newAsset(d.asset) });
    });

    /* Inventory rows a finding can point at: what is there and what is offered. */
    const pool = [...assets.map(a => ({ id: a.id, name: a.name })), ...offered.map(d => ({ id: d.asset.id, name: d.asset.name, source: d.source, domain: d.domain }))];
    const byName = name => pool.find(a => lower(a.name) === lower(name));
    const inv = inventoryOf(file);
    function assetsFor(f, s) {
      if (SERVICES[f.source]) { const a = byName(SERVICES[f.source].name); return a ? [a.id] : []; }
      if (f.source === 'dns') {
        const values = (s.facts || []).filter(x => (f.facts || []).includes(x.key)).flatMap(x => Array.isArray(x.value) ? x.value : []);
        const domains = inv.domains.filter(d => values.includes(d.domain));
        return [...new Set(domains.map(d => {
          const own = SERVICES[d.mx_provider] && byName(SERVICES[d.mx_provider].name);
          const other = pool.find(a => a.domain === d.domain);
          return (own || other || {}).id;
        }).filter(Boolean))];
      }
      if (f.source === 'level') {
        const values = (s.facts || []).filter(x => (f.facts || []).includes(x.key)).flatMap(x => Array.isArray(x.value) ? x.value : []);
        return [...new Set(values.filter(isStr).map(v => (byName(v) || {}).id).filter(Boolean))];
      }
      return [];
    }

    const byCite = {};
    CONTROLS.forEach(c => { byCite[c.cite] = c; });
    CONTROLS.forEach(c => citesOf(c.cite).forEach(k => { if (!byCite[k]) byCite[k] = c; }));
    const risksOffered = [], alreadyInRegister = [];
    const seen = new Set();
    file.safeguards.forEach(s => {
      const row = byCite[s.citation];
      (s.findings || []).forEach(f => {
        if (!f || !isStr(f.rule_id) || seen.has(f.rule_id)) return;
        seen.add(f.rule_id);
        if (risks.some(r => hasTag(r.description, f.rule_id))) { alreadyInRegister.push(f.rule_id); return; }
        /* A reviewed narrative is the consultant's wording and comes along;
           a template one only repeats the facts, which are on the row. */
        const narrative = f.narrative_source === 'review' ? String(f.narrative || '').replace(/\s+/g, ' ').trim() : '';
        const description = [
          `${RISK_TAG(f.rule_id)}${f.severity ? ` (${f.severity})` : ''}, ${collectionLabel(file, f.collection_id, f.source)}: ${sentence(f.title)}`,
          narrative ? sentence(narrative) : '',
          'Rewrite as the threat, the weakness it could exploit, and the ePHI affected.'
        ].filter(Boolean).join(' ');
        risksOffered.push({
          rule_id: f.rule_id,
          title: f.title,
          severity: f.severity || '',
          risk: SRAFormat.newRisk({
            description,
            controlIds: row ? [row.id] : [],
            assetIds: assetsFor(f, s)
          })
        });
      });
    });
    return { assets: offered, risks: risksOffered, alreadyInInventory, alreadyInRegister };
  }

  return { read, plan, apply, drafts, describe, FORMAT, VERSIONS, SOURCES };
})();
if (typeof window !== 'undefined') window.SRAWard = SRAWard;

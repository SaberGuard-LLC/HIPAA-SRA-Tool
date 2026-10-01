/* ============================================================================
   SaberGuard SRA Workspace: analysis and report renderer
   SRAReport.stats(state)  -> derived metrics used by the dashboard and report
   SRAReport.render(state, stats) -> HTML for the printable report
   Loaded after catalog.js and format.js.
   ========================================================================== */
const SRAReport = (function () {
  'use strict';

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const text = (s, placeholder) => (s && String(s).trim()) ? `<span class="prewrap">${esc(String(s).trim())}</span>` : `<span class="placeholder">${esc(placeholder || 'Not provided')}</span>`;
  const plain = (s, placeholder) => (s && String(s).trim()) ? esc(String(s).trim()) : `<span class="placeholder">${esc(placeholder || 'Not provided')}</span>`;
  const trunc = (s, n) => { s = String(s || '').trim(); return s.length > n ? s.slice(0, n - 1).trimEnd() + '...' : s; };
  const pad2 = n => String(n).padStart(2, '0');
  const num = n => n == null ? '<span class="placeholder">No score</span>' : n + '%';

  function parseDate(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '').trim());
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }
  function fmtDate(iso, fallback) {
    const d = parseDate(iso);
    if (!d) return iso ? esc(iso) : `<span class="placeholder">${esc(fallback || 'Not set')}</span>`;
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }
  function fmtShort(iso, fallback) {
    const d = parseDate(iso);
    return d ? d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : (iso ? esc(iso) : `<span class="placeholder">${esc(fallback || 'Not set')}</span>`);
  }
  const formatBytes = n => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;
  /* Shorter labels for the two long statuses so chips fit table columns. */
  const TABLE_LABEL = { alt: 'Alternative measure', doc: 'Decision documented' };
  const chip = (status, full) => { const st = STATUSES[status]; return st ? `<span class="chip ${st.tone}">${full ? st.label : (TABLE_LABEL[status] || st.label)}</span>` : '<span class="chip none">Not reviewed</span>'; };
  const levelChip = (level, score) => level ? `<span class="chip ${level.tone}">${score != null ? score + ' · ' : ''}${level.label}</span>` : '<span class="chip none">Not rated</span>';
  const cite = c => `45 CFR ${esc(c.cite)}`;
  const label = (list, key) => INVENTORY_LABELS[list][key] || key;
  /* Yes, no, unknown and n/a rendered with the tone the fact deserves. */
  const fact = (v, yes, no) => v === 'yes' ? esc(yes) : v === 'no' ? `<span class="t-crit">${esc(no)}</span>` : v === 'unknown' ? '<span class="t-warn">Not checked</span>' : '<span class="t-na">n/a</span>';
  const baaState = v => v === 'yes' ? 'BAA on file' : v === 'no' ? '<span class="t-crit">No BAA</span>' : v === 'unknown' ? '<span class="t-warn">BAA not confirmed</span>' : 'BAA not required';

  /* ---- Derived metrics --------------------------------------------------- */
  function emptyTally() { return { total: 0, reviewed: 0, met: 0, partial: 0, 'not-met': 0, alt: 0, doc: 0, na: 0, none: 0, applicable: 0, score: null }; }
  function scoreOf(t) { return t.applicable ? Math.round((t.met + t.alt + t.partial * 0.5) / t.applicable * 100) : null; }

  function stats(state) {
    const meta = state.meta || {};
    const derived = profileApplicability(meta);
    const byCategory = {};
    Object.keys(CATEGORIES).forEach(k => byCategory[k] = { key: k, ...emptyTally() });
    const all = emptyTally();
    let evidence = 0, carried = 0;
    const controls = CONTROLS.map(c => {
      const s = state.controls?.[c.id] || {};
      const st = STATUSES[s.status];
      let status = st && (!st.addressableOnly || c.type === 'Addressable') ? s.status : '';
      let notes = s.notes || '';
      const derivedNA = !!derived[c.id];
      if (derivedNA) { status = 'na'; notes = derived[c.id] + (notes.trim() ? '\n' + notes.trim() : ''); }
      /* An answer carried from version 3 counts as not reviewed until confirmed. */
      const isCarried = !!s.carried && !derivedNA;
      const counted = isCarried ? '' : status;
      if (isCarried) carried++;
      const cat = byCategory[c.category];
      [cat, all].forEach(t => {
        t.total++;
        if (counted) { t.reviewed++; t[counted]++; if (STATUSES[counted].scoreAs !== 'excluded') t.applicable++; } else t.none++;
      });
      const ev = Array.isArray(s.evidence) ? s.evidence : [];
      evidence += ev.length;
      return { ...c, status: counted, recordedStatus: status, carried: isCarried, derivedNA, basis: BASIS_LABELS[s.basis] ? s.basis : '', notes, recommendation: s.recommendation || '', evidence: ev };
    });
    Object.values(byCategory).forEach(t => { t.score = scoreOf(t); });
    all.score = scoreOf(all);

    const assets = (state.assets || []).map(a => SRAFormat.newAsset(a));
    const assetIndex = Object.fromEntries(assets.map((a, i) => [a.id, i]));
    const flows = (state.flows || []).map(f => SRAFormat.newFlow(f));
    const flowIndex = Object.fromEntries(flows.map((f, i) => [f.id, i]));
    const assetRef = id => assetIndex[id] == null ? null : assetIndex[id] + 1;
    const flowRef = id => flowIndex[id] == null ? null : `F-${pad2(flowIndex[id] + 1)}`;

    const risks = (state.risks || []).map((r0, i) => {
      const r = SRAFormat.newRisk(r0);
      const L = r.likelihood || 0, I = r.impact || 0;
      const sc = L && I ? L * I : null;
      const rL = r.residualLikelihood || 0, rI = r.residualImpact || 0;
      const rScore = rL && rI ? rL * rI : null;
      return { ...r, ref: `R-${pad2(i + 1)}`, L, I, rated: !!sc, score: sc, level: sc ? riskLevel(sc) : null, rL, rI, rScore, rLevel: rScore ? riskLevel(rScore) : null };
    });
    const risksByAsset = {}, risksByFlow = {};
    risks.forEach(r => {
      r.assetIds.forEach(id => (risksByAsset[id] = risksByAsset[id] || []).push(r));
      r.flowIds.forEach(id => (risksByFlow[id] = risksByFlow[id] || []).push(r));
    });
    const high = risks.filter(r => r.level?.key === 'high').length;
    const medium = risks.filter(r => r.level?.key === 'medium').length;
    const low = risks.filter(r => r.level?.key === 'low').length;
    const unrated = risks.filter(r => !r.rated).length;
    const open = risks.filter(r => r.status !== 'Closed').length;

    const flowOk = f => f.from && f.to && f.from !== f.to && assetIndex[f.from] != null && assetIndex[f.to] != null;
    const byId = Object.fromEntries(assets.map(a => [a.id, a]));
    const leaves = f => { const A = byId[f.from], B = byId[f.to]; return !!(A && B && (A.vendor || B.vendor || A.zone === 'external' || B.zone === 'external')); };
    const facts = {
      systems: assets.length,
      flows: flows.length,
      out: flows.filter(f => flowOk(f) && leaves(f)).length,
      weak: flows.filter(f => f.inTransit === 'no' || f.inTransit === 'unknown').length,
      noBaa: assets.filter(a => a.vendor && (a.baa === 'no' || a.baa === 'unknown')).length,
      unclassified: assets.filter(a => a.kind === 'unknown' || a.zone === 'unknown').length
    };

    const checkResults = {
      profile: !!(meta.orgName && meta.assessmentDate && meta.assessor && meta.scope && meta.entityType && meta.clearinghouse && meta.groupHealthPlan),
      inventory: assets.length > 0 && assets.every(a => a.name.trim() && a.data.trim() && a.kind !== 'unknown' && a.zone !== 'unknown' && a.lifecycle.length > 0),
      flows: flows.every(flowOk),
      reviewed: all.reviewed === CONTROLS.length,
      basis: controls.every(c => !c.status || c.derivedNA || c.basis),
      gapnotes: controls.every(c => !c.status || !STATUSES[c.status].needsNote || c.notes.trim()),
      recs: controls.every(c => !['partial', 'not-met'].includes(c.status) || c.recommendation.trim()),
      risksExist: risks.length > 0,
      risks: risks.every(r => r.description && r.rated && r.owner && r.target && r.treatment),
      approval: !!meta.executive
    };
    const checks = READINESS_CHECKS.map(ch => ({ ...ch, ok: !!checkResults[ch.key] }));
    const missing = checks.filter(c => !c.ok);
    const finalRequested = meta.reportStatus === 'Final';
    const isDraft = missing.length > 0 || !finalRequested;

    return { total: CONTROLS.length, reviewed: all.reviewed, met: all.met, partial: all.partial, notMet: all['not-met'], alt: all.alt, doc: all.doc, na: all.na,
      applicable: all.applicable, score: all.score, evidence, carried, derived, byCategory, controls, assets, flows, facts, assetRef, flowRef, risks, risksByAsset, risksByFlow,
      high, medium, low, unrated, open, checks, missing, finalRequested, isDraft };
  }

  /* ---- Report ------------------------------------------------------------ */
  function render(state, S) {
    const m = state.meta || {};
    const org = (m.orgName || '').trim();
    const orgLabel = org ? esc(org) : '<span class="placeholder">Organization name not provided</span>';
    const classification = CLASSIFICATIONS.includes(m.classification) ? m.classification : 'Confidential';
    const version = (m.reportVersion || '1.0').trim() || '1.0';
    const generated = new Date();
    const generatedLabel = generated.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const statusLabel = S.isDraft ? 'Draft' : 'Final';
    const assessor = (m.assessor || '').trim();
    const preparedBy = assessor ? esc(assessor) : '<span class="placeholder">Preparer not named</span>';
    const risksByControl = {};
    S.risks.forEach(r => r.controlIds.forEach(id => (risksByControl[id] = risksByControl[id] || []).push(r)));
    const rowsLabel = 'standards and implementation specifications';
    const entityLabel = Object.fromEntries(ENTITY_TYPES)[m.entityType] || '';
    const yesNo = v => v === 'yes' ? 'Yes' : v === 'no' ? 'No' : '<span class="placeholder">Not answered</span>';
    const assetName = id => { const a = S.assets.find(x => x.id === id); return a ? (a.name.trim() || 'Unnamed row') : 'Removed row'; };

    const sections = [
      ['01', 'Document control'], ['02', 'Executive summary'], ['03', 'Scope, environment & method'], ['04', 'ePHI systems & data-flow inventory'],
      ['05', 'Security Rule catalog review'], ['06', 'Findings & recommendations'], ['07', 'Risk register & analysis'], ['08', 'Remediation roadmap'],
      ['09', 'Management review & attestation'], ['A', 'Appendix A · Evidence index'], ['B', 'Appendix B · Report completeness checks']
    ];
    const head = (n, title) => `<div class="rpt-sec-head"><span class="n">${n}</span><h2>${esc(title)}</h2></div>`;
    const requirement = c => {
      const parent = c.parent && CONTROL_BY_ID[c.parent];
      return `<b>${esc(c.title)}</b>${c.titleBy ? ` <span class="cite wrap">(${esc(c.titleBy)}'s label)</span>` : ''}<br><span class="cite wrap">${cite(c)} · ${esc(c.type)}${parent ? `<br>Under ${esc(parent.title)}` : ''}</span><br><span class="small muted">${c.regulation ? esc(c.regulation) : `<i>SaberGuard's summary:</i> ${esc(c.summary)}`}</span>`;
    };
    const statusCell = c => {
      if (c.carried) return `${chip('')}<br><span class="cite wrap">Carried from version 3 (${esc(STATUSES[c.recordedStatus]?.label || 'no answer')}), review pending</span>`;
      return `${chip(c.status)}${c.status ? `<br><span class="cite wrap">${c.derivedNA ? 'From the entity profile' : (c.basis ? esc(BASIS_LABELS[c.basis]) : '<span class="placeholder">Basis not recorded</span>')}</span>` : ''}`;
    };

    /* Cover ------------------------------------------------------------- */
    const cover = `
      <section class="rpt-cover">
        <div class="rpt-grad"></div>
        <div class="rpt-cover-top"><span class="rpt-tag">${esc(classification)}</span></div>
        <div class="rpt-cover-body">
          <div class="kicker">HIPAA Security Rule · 45 CFR Part 164, Subpart C</div>
          <h1>Security Rule<br>Risk Analysis</h1>
          <p class="subtitle">Risk analysis under 45 CFR 164.308(a)(1)(ii)(A), with a review of the Security Rule ${rowsLabel}</p>
          <div class="org">${orgLabel}</div>
          <div class="org-sub">${entityLabel ? esc(entityLabel) + ' · ' : ''}${m.orgType ? esc(m.orgType) + ' · ' : ''}Review period: ${plain(m.period, 'not specified')}</div>
          <div class="rpt-cover-meta">
            <div><span>Assessment date</span><b>${fmtDate(m.assessmentDate)}</b></div>
            <div><span>Report version</span><b>${esc(version)} · ${statusLabel}</b></div>
            <div><span>Report generated</span><b>${generatedLabel}</b></div>
            <div><span>Prepared by</span><b>${preparedBy}</b></div>
            <div><span>Security official</span><b>${plain(m.securityOfficial)}</b></div>
            <div><span>Executive approver</span><b>${plain(m.executive, 'Not named')}</b><small class="muted">Signature in section 09</small></div>
          </div>
          ${S.isDraft ? `<div class="rpt-draft-note"><b>Draft report${S.missing.length ? ` · ${S.missing.length} completeness ${S.missing.length === 1 ? 'check' : 'checks'} open` : ' · report status not set to Final'}</b>${S.missing.map(c => esc(c.label)).join(' · ')}</div>` : ''}
        </div>
        <div class="rpt-cover-foot">
          <div><b>Prepared by</b><br>${preparedBy}</div>
          <div class="handling">This document contains sensitive security information about ${org ? esc(org) : 'the assessed organization'}. Distribute only to authorized personnel under the organization's access-control and documentation-retention policies.</div>
        </div>
      </section>`;

    /* 01 Document control ---------------------------------------------- */
    const docControl = `
      <section class="rpt-section">
        ${head('01', 'Document control')}
        <table class="tbl defs compact"><colgroup><col class="c18"></colgroup><tbody>
          <tr><td>Document</td><td>HIPAA Security Rule risk analysis: ${orgLabel}</td></tr>
          <tr><td>Version / status</td><td>${esc(version)} · ${statusLabel}</td></tr>
          <tr><td>Assessment date</td><td>${fmtDate(m.assessmentDate)}</td></tr>
          <tr><td>Review period</td><td>${plain(m.period)}</td></tr>
          <tr><td>Prepared by</td><td>${preparedBy}</td></tr>
          <tr><td>Security official</td><td>${plain(m.securityOfficial)}</td></tr>
          <tr><td>Executive approver</td><td>${plain(m.executive, 'Not named')}. Approval is recorded by signature and date in section 09.</td></tr>
          <tr><td>Classification</td><td>${esc(classification)}</td></tr>
          <tr><td>Next planned review</td><td>${fmtDate(m.nextReview, 'Not set')}, or sooner if environmental or operational changes affect the security of ePHI (45 CFR 164.306(e) and 164.316(b)(2)(iii)). The date is the organization's planned cadence. The Security Rule does not set a fixed interval.</td></tr>
          <tr><td>Retention</td><td>Retain this analysis and the records that support it for at least 6 years from the date of creation or the date it was last in effect, whichever is later (45 CFR 164.316(b)(2)(i)). State law or contracts may require longer.</td></tr>
        </tbody></table>
        <h3>Contents</h3>
        <ol class="toc">${sections.map(([n, t]) => `<li><span class="n">${n}</span><span>${esc(t)}</span></li>`).join('')}</ol>
        <h3>Distribution &amp; handling</h3>
        <p class="small muted">This report is classified <b>${esc(classification)}</b>. It documents security weaknesses that could be exploited if disclosed. Share only with the organization's leadership, the HIPAA security and privacy officials, legal counsel, and personnel responsible for remediation. Supporting evidence referenced in Appendix A is retained with the assessment file.</p>
      </section>`;

    /* 02 Executive summary --------------------------------------------- */
    const narrative = (m.executiveSummary || '').trim() ? `<p class="lead prewrap">${esc(m.executiveSummary.trim())}</p>` : autoNarrative(S, m, org);
    const notMetList = S.controls.filter(c => c.status === 'not-met');
    const partialList = S.controls.filter(c => c.status === 'partial');
    const topRisks = S.risks.filter(r => r.rated).sort((a, b) => b.score - a.score).slice(0, 6);
    const bars = Object.values(byCatOrdered(S)).map(cat => {
      const seg = (n, cls) => n ? `<span class="${cls}" style="width:${(n / cat.total * 100).toFixed(1)}%" title="${n}">${n / cat.total >= 0.09 ? n : ''}</span>` : '';
      return `<div class="rpt-bar-row"><div class="lbl">${esc(CATEGORIES[cat.key].short)}<small>${esc(CATEGORIES[cat.key].cite)} · ${cat.total} rows</small></div><div class="rpt-bar">${seg(cat.met, 'good')}${seg(cat.alt, 'alt')}${seg(cat.partial, 'warn')}${seg(cat['not-met'], 'crit')}${seg(cat.doc, 'doc')}${seg(cat.na, 'na')}${seg(cat.none, 'none')}</div><div class="pct">${cat.score == null ? '<span class="placeholder">No score</span>' : cat.score + '%'}</div></div>`;
    }).join('');
    const execSummary = `
      <section class="rpt-section pb">
        ${head('02', 'Executive summary')}
        ${narrative}
        <div class="rpt-kpis">
          <div class="rpt-kpi accent"><b>${num(S.score)}</b><span>Implementation score</span><small class="on-dark">met plus alternative, plus half of partial, over ${S.applicable} applicable rows reviewed. Not a compliance score.</small></div>
          <div class="rpt-kpi"><b>${S.met}</b><span>Met</span><small>of ${S.total} rows${S.alt ? ` · ${S.alt} with an alternative measure` : ''}</small></div>
          <div class="rpt-kpi"><b>${S.partial}</b><span>Partially met</span><small>corrective action recommended</small></div>
          <div class="rpt-kpi"><b>${S.notMet}</b><span>Not met</span><small>open gaps</small></div>
          <div class="rpt-kpi"><b>${S.high}</b><span>High risks</span><small>${S.medium} medium · ${S.low} low${S.unrated ? ` · ${S.unrated} not rated` : ''}</small></div>
        </div>
        <h3>Catalog status by category</h3>
        <div class="rpt-bars">${bars}</div>
        <div class="rpt-legend"><span><i class="good"></i>Met</span><span><i class="alt"></i>Alternative measure</span><span><i class="warn"></i>Partially met</span><span><i class="crit"></i>Not met</span><span><i class="doc"></i>Decision documented</span><span><i class="na"></i>Not applicable</span>${S.reviewed < S.total ? '<span><i class="none"></i>Not yet reviewed</span>' : ''}<span class="muted">Score = (met + alternative + half of partial) ÷ applicable rows reviewed</span></div>
        <div class="rpt-cols keep">
          <div>
            <h3>Priority gaps</h3>
            ${notMetList.length || partialList.length ? `<table class="tbl compact"><thead><tr><th class="c13">ID</th><th>Row</th><th class="c27">Status</th></tr></thead><tbody>${[...notMetList, ...partialList].slice(0, 8).map(c => `<tr><td class="id">${c.id}</td><td><b>${esc(c.title)}</b><br><span class="cite">${cite(c)} · ${esc(c.type)}</span></td><td>${chip(c.status)}</td></tr>`).join('')}</tbody></table>${notMetList.length + partialList.length > 8 ? `<p class="small muted">${notMetList.length + partialList.length - 8} additional gaps are detailed in section 06.</p>` : ''}` : `<div class="rpt-callout good">${S.reviewed ? `No row was rated Partially met or Not met among the ${S.reviewed} rows reviewed.` : 'No catalog rows have been reviewed yet.'}</div>`}
          </div>
          <div>
            <h3>Highest-rated risks</h3>
            ${topRisks.length ? `<table class="tbl compact"><thead><tr><th class="c13">ID</th><th>Risk</th><th class="c27">Rating</th></tr></thead><tbody>${topRisks.map(r => `<tr><td class="id">${r.ref}</td><td>${esc(trunc(r.description, 110)) || '<span class="placeholder">No description</span>'}</td><td>${levelChip(r.level, r.score)}</td></tr>`).join('')}</tbody></table>` : `<div class="rpt-callout">${S.risks.length ? 'No recorded risk has been rated yet.' : 'No risks have been recorded in the risk register.'}</div>`}
          </div>
        </div>
      </section>`;

    /* 03 Scope & method ------------------------------------------------ */
    const scope = `
      <section class="rpt-section pb">
        ${head('03', 'Scope, environment & method')}
        <h3>Organization profile</h3>
        <div class="rpt-kv three">
          <div><span>Organization</span><b>${orgLabel}</b></div>
          <div><span>Entity type</span><b>${entityLabel ? esc(entityLabel) : '<span class="placeholder">Not answered</span>'}</b></div>
          <div><span>Description &amp; location</span><b>${plain(m.orgType)}</b></div>
          <div><span>Health care clearinghouse within a larger organization</span><b>${yesNo(m.clearinghouse)}</b></div>
          <div><span>Group health plan</span><b>${yesNo(m.groupHealthPlan)}</b></div>
          <div><span>Review period</span><b>${plain(m.period)}</b></div>
          <div><span>Assessment date</span><b>${fmtDate(m.assessmentDate)}</b></div>
          <div><span>Prepared by</span><b>${preparedBy}</b></div>
          <div><span>HIPAA security official</span><b>${plain(m.securityOfficial)}</b></div>
        </div>
        <h3>Scope statement</h3><p>${text(m.scope, 'Scope statement not provided.')}</p>
        <h3>Environment summary</h3><p>${text(m.environment, 'Environment summary not provided.')}</p>
        <h3>Methodology &amp; participants</h3><p>${text(m.methodology, 'Methodology not provided.')}</p>
        <h3>Assessment approach</h3>
        <p>This assessment uses SaberGuard's method. It is organized around the elements listed under "Elements of a Risk Analysis" in the HHS Office for Civil Rights Guidance on Risk Analysis. HHS states that it does not endorse or recommend any particular risk analysis model, and that guidance does not prescribe the rating scales used here. The catalog review in section 05 covers the Security Rule ${rowsLabel} in 45 CFR 164.308, 164.310, 164.312, 164.314, and 164.316 as rated by the assessor, with the basis on which each rating was verified. The steps were:</p>
        <table class="tbl compact"><colgroup><col class="c6"></colgroup><tbody>
          <tr><td class="id">1</td><td><b>Scope</b> (OCR element 1). Define the organization, locations, workforce, systems, and vendors covered (section 03).</td></tr>
          <tr><td class="id">2</td><td><b>ePHI data collection</b> (OCR element 2). Identify and document where ePHI is stored, received, maintained or transmitted, and the flows between those places (section 04).</td></tr>
          <tr><td class="id">3</td><td><b>Current security measures</b> (OCR element 4). Rate each Security Rule standard and implementation specification as Met, Partially met, Not met, Not applicable, Alternative measure in place, or Not implemented, decision documented, with notes, evidence, and the verification basis (section 05). This review records what is in place. By itself it is not the risk analysis.</td></tr>
          <tr><td class="id">4</td><td><b>Threats and vulnerabilities</b> (OCR element 3). Record reasonably anticipated threats and the vulnerabilities they could exploit as risk statements tied to affected systems, data flows, and catalog rows (section 07).</td></tr>
          <tr><td class="id">5</td><td><b>Likelihood, impact, and risk level</b> (OCR elements 5 to 7). Rate likelihood and impact from 1 to 5 using the definitions below. Inherent risk is likelihood multiplied by impact, grouped as Low, Medium, or High. These scales and thresholds are SaberGuard's own.</td></tr>
          <tr><td class="id">6</td><td><b>Risk treatment</b> (risk management, 45 CFR 164.308(a)(1)(ii)(B)). Assign a treatment decision, owner, target date, and remediation plan, and estimate residual risk (sections 07 and 08).</td></tr>
          <tr><td class="id">7</td><td><b>Documentation and review</b> (OCR elements 8 and 9). This report is the documented analysis. The planned review date is in section 01.</td></tr>
        </tbody></table>
        <div class="rpt-callout">An <b>addressable</b> implementation specification is not optional. For each one, the organization must assess whether it is reasonable and appropriate in its environment. If it is, the organization must implement it. If it is not, the organization must document why and implement an equivalent alternative measure if one is reasonable and appropriate (45 CFR 164.306(d)(3)). <b>Required</b> implementation specifications must be implemented (45 CFR 164.306(d)(2)). Rows rated Alternative measure in place or Not implemented, decision documented, and every Not applicable determination, are listed with the recorded reason in section 06.</div>
        <h3>Rating definitions</h3>
        <p class="small muted">These rating scales and risk level thresholds are SaberGuard's own. They are not taken from HHS or NIST guidance.</p>
        <h4>Catalog row status</h4>
        <table class="tbl compact defs status-defs"><colgroup><col class="c30"></colgroup><tbody>${Object.values(STATUSES).map(st => `<tr><td>${chip(st.key, true)}</td><td>${esc(st.definition)}</td></tr>`).join('')}</tbody></table>
        <h4>Verification basis</h4>
        <p class="small">Each rated row records how the status was verified: <b>Observed</b> (the assessor saw the measure operating or inspected the configuration), <b>Document reviewed</b> (the assessor read a policy, record, or report), or <b>Stated by the client</b> (the organization described the measure and the assessor did not observe it or review a document).</p>
        <div class="rpt-cols">
          <div><h4>Likelihood scale</h4><table class="tbl compact defs"><colgroup><col class="c34"></colgroup><tbody>${LIKELIHOOD.map(([n, l, d]) => `<tr><td>${n} · ${esc(l)}</td><td>${esc(d)}</td></tr>`).join('')}</tbody></table></div>
          <div><h4>Impact scale</h4><table class="tbl compact defs"><colgroup><col class="c34"></colgroup><tbody>${IMPACT.map(([n, l, d]) => `<tr><td>${n} · ${esc(l)}</td><td>${esc(d)}</td></tr>`).join('')}</tbody></table></div>
        </div>
        <h4>Risk level (likelihood × impact)</h4>
        <table class="tbl compact defs"><colgroup><col class="c24"></colgroup><tbody>${RISK_LEVELS.map(l => `<tr><td>${levelChip(l)} <span class="muted">${l.min} to ${l.max}</span></td><td>${esc(l.guidance)}</td></tr>`).join('')}</tbody></table>
      </section>`;

    /* 04 ePHI inventory ------------------------------------------------- */
    const F = S.facts;
    const refs = list => (list || []).map(r => r.ref).join(' ');
    const lifecycle = a => INVENTORY.lifecycle.map(([k, l]) => `<span class="lc ${a.lifecycle.includes(k) ? 'on' : ''}" title="${esc(l)}">${l.charAt(0)}</span>`).join('');
    const kindZone = a => (a.kind === 'unknown' || a.zone === 'unknown') ? '<span class="t-warn">Unclassified</span>' : `${esc(label('kind', a.kind))} · ${esc(label('zone', a.zone))}`;
    const systemsTable = S.assets.length ? `<table class="tbl compact rec"><thead><tr><th class="c4">#</th><th class="c20">System / location</th><th class="c24">ePHI held</th><th class="c10">Lifecycle</th><th class="c17">Vendor / BAA</th><th class="c11">At rest</th><th class="c7">MFA</th><th class="c7">Ref</th></tr></thead><tbody>
      ${S.assets.map((a, i) => `<tr><td class="id">${i + 1}</td><td class="strong">${plain(a.name, 'Unnamed row')}${a.count > 1 ? ` ×${a.count}` : ''}<span class="sub">${kindZone(a)}</span></td><td>${text(a.data)}</td><td class="nw">${lifecycle(a)}</td><td>${a.vendor ? `${esc(a.vendor)}<span class="sub">${baaState(a.baa)}</span>` : `<span class="t-na">${a.zone === 'external' ? 'Outside party' : 'In-house'}</span>${a.baa !== 'not-required' && a.zone === 'external' ? `<span class="sub">${baaState(a.baa)}</span>` : ''}`}</td><td class="keep">${fact(a.atRest, 'Encrypted', 'Not encrypted')}</td><td class="keep">${fact(a.mfa, 'On', 'Off')}</td><td class="id">${refs(S.risksByAsset[a.id])}</td></tr>`).join('')}
      </tbody></table>
      <p class="small muted">Lifecycle: C create · R receive · M maintain · T transmit. Ref is the risk register entry that addresses the row. "Not checked" means the fact could not be confirmed during the assessment and is treated as a gap until it is.</p>` : '';
    const hasNotes = S.assets.some(a => a.owner || a.accountable || a.protection || a.flow || a.location !== 'unknown');
    const notesTable = S.assets.length && hasNotes ? `<h3>Inventory notes</h3><table class="tbl compact rec"><thead><tr><th class="c4">#</th><th class="c16">Row</th><th class="c12">Location</th><th class="c14">Owner</th><th class="c14">Accountable</th><th>Protection and notes</th><th class="c18">Flow notes (version 3)</th></tr></thead><tbody>
      ${S.assets.map((a, i) => `<tr><td class="id">${i + 1}</td><td class="strong">${plain(a.name, 'Unnamed row')}</td><td>${a.location === 'unknown' ? '<span class="t-warn">Unknown</span>' : esc(label('location', a.location))}</td><td>${plain(a.owner, 'Not recorded')}</td><td>${plain(a.accountable, 'Not recorded')}</td><td>${text(a.protection, 'None')}</td><td>${text(a.flow, 'None')}</td></tr>`).join('')}
      </tbody></table>` : '';
    const flowsTable = S.flows.length ? `<table class="tbl compact rec"><thead><tr><th class="c5">#</th><th class="c18">From</th><th class="c20">To</th><th class="c22">ePHI</th><th class="c12">Transport</th><th class="c13">In transit</th><th class="c7">Ref</th></tr></thead><tbody>
      ${S.flows.map((f, i) => `<tr><td class="id">F-${pad2(i + 1)}</td><td>${esc(assetName(f.from))}</td><td>${f.twoWay ? '↔ ' : '→ '}${esc(assetName(f.to))}</td><td>${text(f.data)}</td><td class="keep">${esc(label('transport', f.transport))}</td><td class="keep">${fact(f.inTransit, 'Encrypted', 'Not encrypted')}</td><td class="id">${refs(S.risksByFlow[f.id])}</td></tr>`).join('')}
      </tbody></table>` : '<div class="rpt-callout warn">No data flows have been recorded. Record each connection that carries ePHI between two inventory rows.</div>';
    const inventory = `
      <section class="rpt-section">
        ${head('04', 'ePHI systems & data-flow inventory')}
        <p class="small muted">Systems, locations, people, and outside parties within scope that store, receive, maintain, or transmit ePHI, the flows between them, and the protections currently applied.</p>
        ${S.assets.length ? `<p class="small">${F.systems} system${F.systems === 1 ? '' : 's'}, people and locations and ${F.flows} data flow${F.flows === 1 ? '' : 's'} are in scope. ${F.out} flow${F.out === 1 ? '' : 's'} reach a vendor or outside party. ${F.weak} flow${F.weak === 1 ? ' is' : 's are'} not encrypted or not checked in transit, and ${F.noBaa} vendor${F.noBaa === 1 ? ' has' : 's have'} no confirmed business associate agreement.${F.unclassified ? ` ${F.unclassified} row${F.unclassified === 1 ? ' is' : 's are'} not yet classified by kind and zone.` : ''}</p><h3>Systems and locations</h3>${systemsTable}${notesTable}` : '<div class="rpt-callout warn">No ePHI systems or locations have been inventoried. The risk analysis covers all ePHI the organization holds (45 CFR 164.308(a)(1)(ii)(A)), so the inventory sets its scope.</div>'}
        <h3>Data flows</h3>
        ${flowsTable}
      </section>`;

    /* 05 Catalog review ------------------------------------------------- */
    const catSummary = `<table class="tbl compact"><thead><tr><th class="c20">Category</th><th class="c12">Citation</th><th class="num c7">Total</th><th class="num c7">Met</th><th class="num c7">Alt.</th><th class="num c7">Partial</th><th class="num c7">Not met</th><th class="num c7">Doc.</th><th class="num c7">N/A</th><th class="num c8">Pending</th><th class="num c9">Score</th></tr></thead><tbody>
      ${Object.values(byCatOrdered(S)).map(c => `<tr><td class="strong">${esc(CATEGORIES[c.key].label)}</td><td class="cite">${esc(CATEGORIES[c.key].cite)}</td><td class="num">${c.total}</td><td class="num">${c.met}</td><td class="num">${c.alt}</td><td class="num">${c.partial}</td><td class="num">${c['not-met']}</td><td class="num">${c.doc}</td><td class="num">${c.na}</td><td class="num">${c.none}</td><td class="num strong">${num(c.score)}</td></tr>`).join('')}
      <tr><td class="strong">Total</td><td></td><td class="num strong">${S.total}</td><td class="num strong">${S.met}</td><td class="num strong">${S.alt}</td><td class="num strong">${S.partial}</td><td class="num strong">${S.notMet}</td><td class="num strong">${S.doc}</td><td class="num strong">${S.na}</td><td class="num strong">${S.total - S.reviewed}</td><td class="num strong">${num(S.score)}</td></tr></tbody></table>
      <p class="small muted">Alt. = Alternative measure in place. Doc. = Not implemented, decision documented. Pending includes rows not yet reviewed${S.carried ? ` and ${S.carried} answer${S.carried === 1 ? '' : 's'} carried from a version 3 file that await confirmation` : ''}. Score = (met + alternative + half of partial) ÷ applicable rows reviewed; rows rated Not applicable or Not implemented, decision documented are left out of the applicable count.</p>`;
    const catTables = Object.keys(CATEGORIES).map(key => {
      const list = S.controls.filter(c => c.category === key);
      return `<h3>${esc(CATEGORIES[key].label)} <span class="muted light">· ${esc(CATEGORIES[key].cite)}</span></h3>
        <table class="tbl compact"><thead><tr><th class="c7">ID</th><th class="c32">Standard or implementation specification</th><th class="c14">Status and basis</th><th>Assessment notes / finding</th><th class="c8">Files</th></tr></thead><tbody>
        ${list.map(c => `<tr><td class="id">${c.id}</td><td>${requirement(c)}</td><td>${statusCell(c)}</td><td>${c.notes.trim() ? `<span class="prewrap">${esc(c.notes.trim())}</span>` : `<span class="placeholder">${c.status ? 'No notes recorded' : 'Not yet reviewed'}</span>`}</td><td class="small">${c.evidence.length ? `${c.evidence.length} file${c.evidence.length === 1 ? '' : 's'}` : 'None'}</td></tr>`).join('')}
        </tbody></table>`;
    }).join('');
    const catalogSection = `
      <section class="rpt-section pb">
        ${head('05', 'Security Rule catalog review')}
        <p class="small muted">${S.reviewed} of ${S.total} catalog rows were rated using the definitions in section 03. The catalog has one row per standard, one per titled implementation specification, and one for the untitled implementation specifications paragraph at 45 CFR 164.314(b)(2); the count is SaberGuard's convention. Each row prints the regulation's own wording, the status, and the basis on which the status was verified. Evidence files are indexed in Appendix A.</p>
        <h3>Summary by category</h3>${catSummary}
        ${catTables}
      </section>`;

    /* 06 Findings & recommendations ------------------------------------ */
    const gaps = [...notMetList, ...partialList];
    const altList = S.controls.filter(c => c.status === 'alt');
    const docList = S.controls.filter(c => c.status === 'doc');
    const naList = S.controls.filter(c => c.status === 'na');
    const findingCard = (c, n) => {
      const related = risksByControl[c.id] || [];
      return `<div class="rpt-finding ${STATUSES[c.status].tone}">
        <div class="rpt-finding-head"><span class="id">F-${pad2(n)} · ${c.id}</span><h4>${esc(c.title)}</h4><span class="cite">${cite(c)} · ${esc(c.type)}</span>${chip(c.status)}</div>
        <p class="req">${c.regulation ? esc(c.regulation) : `<i>SaberGuard's summary:</i> ${esc(c.summary)}`}</p>
        <dl>
          <dt>Finding</dt><dd>${text(c.notes, 'Not provided')}</dd>
          <dt>Basis</dt><dd>${c.basis ? esc(BASIS_LABELS[c.basis]) : '<span class="placeholder">Not recorded</span>'}</dd>
          <dt>Recommendation</dt><dd>${text(c.recommendation, 'Not provided')}</dd>
          <dt>Evidence</dt><dd>${c.evidence.length ? esc(c.evidence.map(e => e.name).join(', ')) : '<span class="placeholder">None attached</span>'}</dd>
          <dt>Related risks</dt><dd>${related.length ? related.map(r => `<b>${r.ref}</b> ${levelChip(r.level, r.score)}`).join(' &nbsp; ') : '<span class="placeholder">No risk register entry references this row</span>'}</dd>
        </dl></div>`;
    };
    const reasonTable = (list, title, intro, column) => list.length ? `<h3>${esc(title)}</h3><p class="small muted">${esc(intro)}</p><table class="tbl compact"><thead><tr><th class="c7">ID</th><th class="c30">Row</th><th>${esc(column)}</th></tr></thead><tbody>${list.map(c => `<tr><td class="id">${c.id}</td><td><b>${esc(c.title)}</b><br><span class="cite">${cite(c)} · ${esc(c.type)}</span></td><td>${text(c.notes, 'Not provided')}</td></tr>`).join('')}</tbody></table>` : '';
    const findings = `
      <section class="rpt-section pb">
        ${head('06', 'Findings & recommendations')}
        ${gaps.length ? `<p class="small muted">${S.notMet} row${S.notMet === 1 ? '' : 's'} rated Not met and ${S.partial} rated Partially met. Findings are listed with Not met rows first, then in catalog order. Each finding should be traced to a risk register entry with an owner and target date.</p>${gaps.map((c, i) => findingCard(c, i + 1)).join('')}` : `<div class="rpt-callout good">${S.reviewed ? `No row was rated Partially met or Not met among the ${S.reviewed} rows reviewed. Keep the analysis current (45 CFR 164.306(e)) and continue periodic evaluation (45 CFR 164.308(a)(8)).` : 'No catalog rows have been reviewed yet, so no findings can be reported.'}</div>`}
        ${reasonTable(altList, 'Alternative measures in place', 'Addressable specifications not implemented as written. The recorded reason and the equivalent alternative measure reviewed for each (45 CFR 164.306(d)(3)).', 'Reason and alternative measure recorded')}
        ${reasonTable(docList, 'Decisions not to implement', 'Addressable specifications with neither the specification nor an alternative measure in place. The recorded reason why neither is reasonable and appropriate (45 CFR 164.306(d)(3)). These rows are left out of the implementation score. The parent standard still has to be met.', 'Reason recorded')}
        ${reasonTable(naList, 'Applicability determinations', 'Rows rated Not applicable and the recorded basis for each determination. Determinations that follow from the entity profile in section 03 say so.', 'Applicability basis')}
      </section>`;

    /* 07 Risk register -------------------------------------------------- */
    const sortedRisks = [...S.risks].sort((a, b) => (b.score || 0) - (a.score || 0) || a.ref.localeCompare(b.ref));
    const heat = (() => {
      let cells = '';
      for (let I = 5; I >= 1; I--) {
        if (I === 5) cells += '<div class="ax y">Impact →</div>';
        for (let L = 1; L <= 5; L++) {
          const sc = L * I, lvl = riskLevel(sc);
          const ids = S.risks.filter(r => r.L === L && r.I === I).map(r => r.ref.replace('R-', 'R')).join(' ');
          cells += `<div class="cell ${lvl.key}"><span class="s">${sc}</span><span class="ids">${ids}</span></div>`;
        }
      }
      cells += '<div class="xlab">Likelihood → &nbsp; 1 Rare · 2 Unlikely · 3 Possible · 4 Likely · 5 Almost certain</div>';
      return `<div class="rpt-heat">${cells}</div><div class="rpt-legend"><span><i class="low"></i>Low 1 to 7</span><span><i class="medium"></i>Medium 8 to 14</span><span><i class="high"></i>High 15 to 25</span><span class="muted">· Rows: impact 5 (top) to 1 (bottom)${S.unrated ? ` · ${S.unrated} risk${S.unrated === 1 ? '' : 's'} not yet rated and not shown` : ''}</span></div>`;
    })();
    const affected = r => {
      const parts = r.assetIds.map(id => `<b>${S.assetRef(id) ?? '?'}</b> ${esc(assetName(id))}`);
      if (r.legacyAssets) parts.push(`<span class="muted">Version 3 text: ${esc(r.legacyAssets)}</span>`);
      return parts.length ? parts.join('; ') : '<span class="placeholder">None linked</span>';
    };
    const flowsOf = r => r.flowIds.length ? r.flowIds.map(id => { const f = S.flows.find(x => x.id === id); return f ? `<b>${S.flowRef(id)}</b> ${esc(assetName(f.from))} ${f.twoWay ? '↔' : '→'} ${esc(assetName(f.to))}` : esc(id); }).join('; ') : '<span class="placeholder">None linked</span>';
    const rowsOf = r => {
      const parts = r.controlIds.map(id => CONTROL_BY_ID[id] ? `<b>${id}</b> ${esc(CONTROL_BY_ID[id].title)}` : esc(id));
      if (r.legacyControls && !r.controlIds.length) parts.push(`<span class="muted">Version 3 text: ${esc(r.legacyControls)}</span>`);
      return parts.length ? parts.join('; ') : '<span class="placeholder">None linked</span>';
    };
    const riskTable = sortedRisks.length ? `<table class="tbl compact"><thead><tr><th class="c7">ID</th><th>Risk statement</th><th class="num c4">L</th><th class="num c4">I</th><th class="c12">Inherent</th><th class="c10">Decision</th><th class="c14">Owner / target</th><th class="c9">Status</th><th class="c12">Residual</th></tr></thead><tbody>
      ${sortedRisks.map(r => `<tr><td class="id">${r.ref}</td><td>${text(r.description, 'No description')}${r.controlIds.length ? `<br><span class="cite">Catalog rows: ${esc(r.controlIds.join(', '))}</span>` : ''}${r.assetIds.length || r.flowIds.length ? `<br><span class="cite">Inventory: ${esc([...r.assetIds.map(id => '#' + (S.assetRef(id) ?? '?')), ...r.flowIds.map(id => S.flowRef(id) || id)].join(', '))}</span>` : ''}</td><td class="num">${r.L || '<span class="placeholder">-</span>'}</td><td class="num">${r.I || '<span class="placeholder">-</span>'}</td><td>${levelChip(r.level, r.score)}</td><td>${esc(r.decision)}</td><td>${plain(r.owner, 'Unassigned')}<br><span class="cite">${fmtShort(r.target, 'No target date')}</span></td><td>${esc(r.status)}</td><td>${levelChip(r.rLevel, r.rScore)}</td></tr>`).join('')}
      </tbody></table>` : '';
    const riskDetails = sortedRisks.map(r => `<div class="rpt-risk ${r.level ? r.level.key : 'none'}">
        <div class="rpt-risk-head"><span class="id">${r.ref}</span><span class="stmt">${text(r.description, 'No description')}</span>${levelChip(r.level, r.score)}</div>
        <dl>
          <dt>Affected rows</dt><dd>${affected(r)}</dd>
          <dt>Data flows</dt><dd>${flowsOf(r)}</dd>
          <dt>Catalog rows</dt><dd>${rowsOf(r)}</dd>
          <dt>Existing measures</dt><dd>${plain(r.existing, 'Not specified')}</dd>
          <dt>Rating</dt><dd>${r.rated ? `Likelihood ${r.L} (${esc(LIKELIHOOD[r.L - 1][1])}) × Impact ${r.I} (${esc(IMPACT[r.I - 1][1])}) = ${r.score} · ${r.level.label}` : '<span class="placeholder">Likelihood and impact not rated</span>'}${r.rScore ? ` &nbsp;→&nbsp; Residual ${r.rL} × ${r.rI} = ${r.rScore} · ${r.rLevel.label}` : ''}</dd>
          <dt>Treatment</dt><dd><b>${esc(r.decision)}</b> · Owner: ${plain(r.owner, 'Unassigned')} · Target: ${fmtShort(r.target, 'Not set')} · Status: ${esc(r.status)}</dd>
          <dt>Remediation plan</dt><dd>${text(r.treatment, 'Not provided')}</dd>
        </dl></div>`).join('');
    const riskSection = `
      <section class="rpt-section pb">
        ${head('07', 'Risk register & analysis')}
        <p class="small muted">Risks identified from the catalog review, the ePHI inventory and data flows, interviews, and risk scenarios. Inherent risk is scored before planned remediation; residual risk is the assessor's estimate after the treatment plan is complete.</p>
        <div class="rpt-kpis four">
          <div class="rpt-kpi"><b>${S.risks.length}</b><span>Risks recorded</span><small>${S.open} open or in progress</small></div>
          <div class="rpt-kpi"><b>${S.high}</b><span>High</span><small>score 15 to 25</small></div>
          <div class="rpt-kpi"><b>${S.medium}</b><span>Medium</span><small>score 8 to 14</small></div>
          <div class="rpt-kpi"><b>${S.low}</b><span>Low</span><small>score 1 to 7${S.unrated ? ` · ${S.unrated} not rated` : ''}</small></div>
        </div>
        <h3>Risk heat map</h3>${heat}
        <h3>Risk register</h3>
        ${riskTable || '<div class="rpt-callout warn">No risks have been recorded. The risk analysis identifies the threats and vulnerabilities to ePHI, rates likelihood and impact, and assigns treatment. Add entries in the workspace risk register.</div>'}
        ${sortedRisks.length ? `<h3>Risk detail &amp; treatment plans</h3>${riskDetails}` : ''}
      </section>`;

    /* 08 Remediation roadmap ------------------------------------------- */
    const roadmapRows = sortedRisks.filter(r => r.status !== 'Closed');
    const roadmap = `
      <section class="rpt-section pb">
        ${head('08', 'Remediation roadmap')}
        ${roadmapRows.length ? `<p class="small muted">Open and in-progress risks in priority order. Under the rating method in section 03, High risks are scheduled first, and any decision to accept one is documented and approved by management. The Security Rule requires risks and vulnerabilities to be reduced to a reasonable and appropriate level (45 CFR 164.308(a)(1)(ii)(B)). It does not define Low, Medium, or High.</p>
        <table class="tbl compact"><thead><tr><th class="c13">Priority</th><th class="c7">ID</th><th>Action</th><th class="c15">Owner</th><th class="c12">Target</th><th class="c11">Status</th></tr></thead><tbody>
        ${roadmapRows.map(r => `<tr><td>${levelChip(r.level)}</td><td class="id">${r.ref}</td><td>${r.treatment.trim() ? `<span class="prewrap">${esc(trunc(r.treatment.trim(), 320))}</span>` : '<span class="placeholder">Not provided</span>'}<br><span class="cite">${esc(r.decision)} · ${esc(trunc(r.description, 90))}</span></td><td>${plain(r.owner, 'Unassigned')}</td><td>${fmtShort(r.target, 'Not set')}</td><td>${esc(r.status)}</td></tr>`).join('')}
        </tbody></table>` : `<div class="rpt-callout ${S.risks.length ? 'good' : ''}">${S.risks.length ? 'All recorded risks are closed. Keep the analysis current (45 CFR 164.306(e)) and continue periodic evaluation (45 CFR 164.308(a)(8)).' : 'No remediation actions are scheduled because the risk register is empty.'}</div>`}
      </section>`;

    /* 09 Attestation ---------------------------------------------------- */
    const attestation = `
      <section class="rpt-section pb">
        ${head('09', 'Management review & attestation')}
        <h3>Assessor's statement</h3>
        <p>This risk analysis was performed by ${plain(assessor, 'the preparer named in section 01')} for ${orgLabel} using the method in section 03. Conclusions reflect the policies, practices, configurations, and evidence made available during the assessment period${m.period ? ` (${esc(m.period)})` : ''}. The Security Rule does not set a fixed interval for updating a risk analysis. This analysis should be reviewed and updated when environmental or operational changes affect the security of ePHI, for example new systems, a move, a security incident, vendor changes, or turnover in key staff (45 CFR 164.306(e) and 164.316(b)(2)(iii)). The planned review date is in section 01.</p>
        <h3>Management statement</h3>
        <div class="rpt-statement prewrap">${esc((m.attestationText || '').trim() || 'Management has reviewed this security risk analysis, acknowledges the identified risks, and approves the documented remediation priorities and risk treatment decisions.')}</div>
        <div class="rpt-sign">
          <div><div class="role">Lead assessor</div><div class="line"></div><b>${plain(assessor, 'Name, title')}</b><div class="date">Date: ________________</div></div>
          <div><div class="role">HIPAA security official</div><div class="line"></div><b>${plain(m.securityOfficial, 'Name, title')}</b><div class="date">Date: ________________</div></div>
          <div><div class="role">Executive approver</div><div class="line"></div><b>${plain(m.executive, 'Name, title')}</b><div class="date">Date: ________________</div></div>
        </div>
      </section>`;

    /* Appendix A Evidence ------------------------------------------------ */
    const evidenceRows = S.controls.flatMap(c => c.evidence.map(e => ({ c, e })));
    const omitted = evidenceRows.filter(({ e }) => e.omitted).length;
    const appendixA = `
      <section class="rpt-section pb">
        ${head('A', 'Appendix A · Evidence index')}
        ${evidenceRows.length ? `<p class="small muted">${evidenceRows.length} evidence file${evidenceRows.length === 1 ? '' : 's'} attached to the assessment. Files are embedded in the saved assessment JSON unless it was saved without evidence, and are not reproduced in this report.${omitted ? ` ${omitted} file${omitted === 1 ? ' is' : 's are'} listed by name only because the opened file did not embed ${omitted === 1 ? 'it' : 'them'}.` : ''}</p><table class="tbl compact"><thead><tr><th class="c7">ID</th><th class="c28">Row</th><th>File</th><th class="c16">Type</th><th class="c9">Size</th></tr></thead><tbody>${evidenceRows.map(({ c, e }) => `<tr><td class="id">${c.id}</td><td>${esc(c.title)}</td><td>${esc(e.name)}${e.omitted ? ' <span class="placeholder">(not embedded)</span>' : ''}</td><td class="small">${esc(e.type || 'Unknown')}</td><td class="small">${formatBytes(e.size || 0)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">No evidence files were attached to this assessment. Attach policies, screenshots, reports, and agreements to the relevant catalog rows in the workspace so they are indexed here and preserved in the assessment file. Evidence must not show patient identifiers.</p>'}
      </section>`;

    /* Appendix B Completeness ------------------------------------------- */
    const appendixB = `
      <section class="rpt-section">
        ${head('B', 'Appendix B · Report completeness checks')}
        <p class="small muted">Checks the workspace applies to the report fields before removing the DRAFT watermark. They test whether fields are filled in. They do not test whether the risk analysis is accurate or thorough. ${S.missing.length ? 'Items marked open were outstanding when this report was generated.' : 'All checks passed when this report was generated.'}</p>
        <ul class="rpt-checks">${S.checks.map(c => `<li class="${c.ok ? 'ok' : 'todo'}"><span class="mk">${c.ok ? '&#10003;' : '&#8226;'}</span><span>${esc(c.label)}${c.ok ? '' : ' <span class="placeholder">(open)</span>'}</span></li>`).join('')}</ul>
        ${S.facts.unclassified ? `<p class="small muted">Inventory rows not yet classified by kind and zone: ${S.assets.map((a, i) => (a.kind === 'unknown' || a.zone === 'unknown') ? `#${i + 1} ${esc(a.name.trim() || 'Unnamed row')}` : null).filter(Boolean).join(', ')}.</p>` : ''}
        <div class="rpt-kv three">
          <div><span>Catalog rows reviewed</span><b>${S.reviewed} of ${S.total}</b></div>
          <div><span>Answers carried from version 3 awaiting confirmation</span><b>${S.carried}</b></div>
          <div><span>Risks recorded</span><b>${S.risks.length}${S.unrated ? ` (${S.unrated} not rated)` : ''}</b></div>
          <div><span>Evidence files</span><b>${S.evidence}</b></div>
          <div><span>Report generated</span><b>${generated.toLocaleString('en-US')}</b></div>
          <div><span>Assessment file last saved</span><b>${state.savedAt ? new Date(state.savedAt).toLocaleString('en-US') : 'Not saved this session'}</b></div>
          <div><span>Workspace</span><b>SaberGuard SRA Workspace · file format version ${FILE_FORMAT.version}</b></div>
          <div><span>Catalog</span><b>${esc(CATALOG_SOURCE.label)}${CATALOG_SOURCE.checked ? `, compared with the eCFR text on ${fmtDate(CATALOG_SOURCE.checked)}` : ', not yet compared with the eCFR text'}</b></div>
        </div>
        <p class="small muted">Produced with the SaberGuard SRA Workspace. SaberGuard publishes the workspace and did not review this report unless named as the assessor. The workspace is not the HHS Security Risk Assessment (SRA) Tool, is not affiliated with or endorsed by HHS, and does not replace the HHS tool. The report records the assessor's work and judgment. It is not legal advice and does not by itself establish compliance with the HIPAA Security Rule.</p>
      </section>`;

    return `<div class="rpt ${S.isDraft ? 'is-draft' : ''}">
      <div class="rpt-watermark" aria-hidden="true"><span>DRAFT</span></div>
      ${cover}
      <table class="rpt-frame">
        <thead><tr><td><div class="rpt-run-head"><span><b>HIPAA Security Rule risk analysis</b> · ${orgLabel}</span><span>${esc(classification)} · v${esc(version)} ${statusLabel}</span></div></td></tr></thead>
        <tfoot><tr><td><div class="rpt-run-foot"><span>Generated ${generatedLabel}</span><span>${assessor ? 'Prepared by ' + esc(trunc(assessor, 70)) : 'Preparer not named'}</span></div></td></tr></tfoot>
        <tbody><tr><td>${docControl}${execSummary}${scope}${inventory}${catalogSection}${findings}${riskSection}${roadmap}${attestation}${appendixA}${appendixB}</td></tr></tbody>
      </table>
    </div>`;
  }

  function byCatOrdered(S) { return Object.keys(CATEGORIES).map(k => S.byCategory[k]); }

  function autoNarrative(S, m, org) {
    const who = (m.assessor || '').trim() ? esc(m.assessor.trim()) : 'The preparer named in section 01';
    const orgName = org ? esc(org) : 'the organization';
    const period = (m.period || '').trim() ? ` covering ${esc(m.period.trim())}` : '';
    const parts = [];
    parts.push(`${who} performed a HIPAA Security Rule risk analysis of ${orgName}${period}. The catalog review covers ${S.reviewed} of ${S.total} rows drawn from the administrative, physical, technical, organizational, and documentation provisions of 45 CFR Part 164, Subpart C.`);
    if (S.reviewed) {
      const excluded = S.na + S.doc;
      parts.push(`Of the ${S.applicable} applicable rows reviewed, ${S.met} ${S.met === 1 ? 'was' : 'were'} rated Met${S.alt ? `, ${S.alt} ${S.alt === 1 ? 'has' : 'have'} an alternative measure in place` : ''}, ${S.partial} ${S.partial === 1 ? 'was' : 'were'} rated Partially met, and ${S.notMet} Not met, giving an implementation score of ${S.score == null ? 'none' : S.score + '%'}. The score is a progress measure, not a compliance score.${excluded ? ` ${S.na} ${S.na === 1 ? 'row was' : 'rows were'} determined not applicable${S.doc ? ` and ${S.doc} ${S.doc === 1 ? 'row has' : 'rows have'} a documented decision not to implement` : ''}.` : ''}`);
    } else {
      parts.push('The catalog review has not started; results in this report are preliminary.');
    }
    if (S.reviewed && S.reviewed < S.total) parts.push(`${S.total - S.reviewed} row${S.total - S.reviewed === 1 ? '' : 's'} remain to be reviewed before this analysis can be finalized${S.carried ? `, including ${S.carried} answer${S.carried === 1 ? '' : 's'} carried from a version 3 file that await confirmation` : ''}.`);
    if (S.assets.length) parts.push(`The ePHI inventory records ${S.facts.systems} system${S.facts.systems === 1 ? '' : 's'}, people and locations and ${S.facts.flows} data flow${S.facts.flows === 1 ? '' : 's'}.`);
    if (S.risks.length) {
      parts.push(`The risk register records ${S.risks.length} risk${S.risks.length === 1 ? '' : 's'}: ${S.high} high, ${S.medium} medium, ${S.low} low${S.unrated ? `, and ${S.unrated} not yet rated` : ''}. ${S.high ? 'Under the rating method in section 03, High risks are addressed first or accepted by a documented management decision. ' : ''}${S.open} ${S.open === 1 ? 'remains' : 'remain'} open or in progress.`);
    } else {
      parts.push('No risks have been recorded in the risk register; the register should be completed so that each threat and vulnerability is rated and tied to an owned treatment plan.');
    }
    return `<p class="lead">${parts.join(' ')}</p>`;
  }

  return { stats, render, fmtDate };
})();
if (typeof window !== 'undefined') window.SRAReport = SRAReport;

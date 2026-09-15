/* ============================================================================
   SaberGuard HIPAA SRA — analysis and report renderer
   SRAReport.stats(state)  -> derived metrics used by the dashboard and report
   SRAReport.render(state, stats) -> HTML for the printable report
   ========================================================================== */
window.SRAReport = (function () {
  'use strict';

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const text = (s, placeholder) => (s && String(s).trim()) ? `<span class="prewrap">${esc(String(s).trim())}</span>` : `<span class="placeholder">${esc(placeholder || 'Not provided')}</span>`;
  const plain = (s, placeholder) => (s && String(s).trim()) ? esc(String(s).trim()) : `<span class="placeholder">${esc(placeholder || 'Not provided')}</span>`;
  const trunc = (s, n) => { s = String(s || '').trim(); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; };
  const pad2 = n => String(n).padStart(2, '0');

  function parseDate(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '').trim());
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }
  function fmtDate(iso, fallback) {
    const d = parseDate(iso);
    if (!d) return iso ? esc(iso) : `<span class="placeholder">${esc(fallback || 'Not set')}</span>`;
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }
  function fmtShort(iso) {
    const d = parseDate(iso);
    return d ? d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : (iso ? esc(iso) : '—');
  }
  function plusOneYear(iso) {
    const d = parseDate(iso);
    if (!d) return null;
    d.setFullYear(d.getFullYear() + 1);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }
  const formatBytes = n => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;
  const chip = (status) => { const st = STATUSES[status]; return st ? `<span class="chip ${st.tone}">${st.label}</span>` : '<span class="chip none">Not reviewed</span>'; };
  const levelChip = (level, score) => `<span class="chip ${level.tone}">${score != null ? score + ' · ' : ''}${level.label}</span>`;
  const idList = s => String(s || '').split(/[\s,;]+/).map(x => x.trim().toUpperCase()).filter(Boolean);

  /* ---- Derived metrics --------------------------------------------------- */
  function stats(state) {
    const meta = state.meta || {};
    const byCategory = {};
    Object.keys(CATEGORIES).forEach(k => byCategory[k] = { key: k, total: 0, reviewed: 0, met: 0, partial: 0, 'not-met': 0, na: 0, none: 0, score: null });
    let reviewed = 0, met = 0, partial = 0, notMet = 0, na = 0, evidence = 0;
    const controls = CONTROLS.map(c => {
      const s = state.controls?.[c.id] || {};
      const status = STATUSES[s.status] ? s.status : '';
      const cat = byCategory[c.category];
      cat.total++;
      if (status) { reviewed++; cat.reviewed++; cat[status]++; } else cat.none++;
      if (status === 'met') met++; else if (status === 'partial') partial++; else if (status === 'not-met') notMet++; else if (status === 'na') na++;
      const ev = Array.isArray(s.evidence) ? s.evidence : [];
      evidence += ev.length;
      return { ...c, status, notes: s.notes || '', recommendation: s.recommendation || '', evidence: ev };
    });
    Object.values(byCategory).forEach(cat => { const app = cat.reviewed - cat.na; cat.score = app ? Math.round((cat.met + cat.partial * 0.5) / app * 100) : null; });
    const applicable = reviewed - na;
    const score = applicable ? Math.round((met + partial * 0.5) / applicable * 100) : null;

    const risks = (state.risks || []).map((r, i) => {
      const L = Number(r.likelihood) || 0, I = Number(r.impact) || 0, sc = L * I;
      const rL = Number(r.residualLikelihood) || 0, rI = Number(r.residualImpact) || 0;
      const rScore = rL && rI ? rL * rI : null;
      return { ...r, ref: `R-${pad2(i + 1)}`, L, I, score: sc, level: riskLevel(sc), rL, rI, rScore, rLevel: rScore ? riskLevel(rScore) : null, controlIds: idList(r.controls) };
    });
    const high = risks.filter(r => r.level.key === 'high').length;
    const medium = risks.filter(r => r.level.key === 'medium').length;
    const low = risks.filter(r => r.level.key === 'low').length;
    const open = risks.filter(r => r.status !== 'Closed').length;

    const checkResults = {
      profile: !!(meta.orgName && meta.assessmentDate && meta.assessor && meta.scope),
      inventory: (state.assets || []).length > 0 && state.assets.every(a => a.name && a.data && a.flow),
      reviewed: reviewed === CONTROLS.length,
      gapnotes: controls.every(c => !['partial', 'not-met', 'na'].includes(c.status) || c.notes.trim()),
      risks: risks.every(r => r.description && r.owner && r.target && r.treatment),
      approval: !!(meta.executive && meta.signDate)
    };
    const checks = READINESS_CHECKS.map(ch => ({ ...ch, ok: !!checkResults[ch.key] }));
    const missing = checks.filter(c => !c.ok);

    return { total: CONTROLS.length, reviewed, met, partial, notMet, na, applicable, score, evidence, byCategory, controls, risks, high, medium, low, open, checks, missing, isDraft: missing.length > 0 };
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
    const risksByControl = {};
    S.risks.forEach(r => r.controlIds.forEach(id => (risksByControl[id] = risksByControl[id] || []).push(r)));

    const sections = [
      ['01', 'Document control'], ['02', 'Executive summary'], ['03', 'Scope, environment & methodology'], ['04', 'ePHI systems & data-flow inventory'],
      ['05', 'Safeguard evaluation results'], ['06', 'Findings & recommendations'], ['07', 'Risk register & analysis'], ['08', 'Remediation roadmap'],
      ['09', 'Management review & attestation'], ['A', 'Appendix A · Evidence index'], ['B', 'Appendix B · Assessment completeness']
    ];
    const head = (n, title) => `<div class="rpt-sec-head"><span class="n">${n}</span><h2>${esc(title)}</h2></div>`;

    /* Cover ------------------------------------------------------------- */
    const cover = `
      <section class="rpt-cover">
        <div class="rpt-grad"></div>
        <div class="rpt-cover-top"><img src="SaberGuard_1.png" alt="SaberGuard"><span class="rpt-tag">${esc(classification)}</span></div>
        <div class="rpt-cover-body">
          <div class="kicker">HIPAA Security Rule · 45 CFR Part 164, Subpart C</div>
          <h1>Security Risk<br>Assessment Report</h1>
          <p class="subtitle">Risk analysis and safeguard evaluation under 45 CFR §164.308(a)(1)(ii)(A)</p>
          <div class="org">${orgLabel}</div>
          <div class="org-sub">${m.orgType ? esc(m.orgType) + ' · ' : ''}Review period: ${plain(m.period, 'not specified')}</div>
          <div class="rpt-cover-meta">
            <div><span>Assessment date</span><b>${fmtDate(m.assessmentDate)}</b></div>
            <div><span>Report version</span><b>${esc(version)} · ${statusLabel}</b></div>
            <div><span>Report generated</span><b>${generatedLabel}</b></div>
            <div><span>Lead assessor</span><b>${plain(assessor)}</b></div>
            <div><span>Security official</span><b>${plain(m.securityOfficial)}</b></div>
            <div><span>Approved by</span><b>${plain(m.executive, 'Pending approval')}</b></div>
          </div>
          ${S.isDraft ? `<div class="rpt-draft-note"><b>Draft report · ${S.missing.length} readiness ${S.missing.length === 1 ? 'check' : 'checks'} outstanding</b>${S.missing.map(c => esc(c.label)).join(' · ')}</div>` : ''}
        </div>
        <div class="rpt-cover-foot">
          <div><b>Prepared with the SaberGuard HIPAA SRA workspace</b><br>Local-first assessment tooling · saberguard.tech</div>
          <div style="text-align:right;max-width:88mm">This document contains sensitive security information about ${org ? esc(org) : 'the assessed organization'}. Distribute only to authorized personnel under the organization's access-control and documentation-retention policies.</div>
        </div>
      </section>`;

    /* 01 Document control ---------------------------------------------- */
    const nextReview = plusOneYear(m.assessmentDate);
    const docControl = `
      <section class="rpt-section">
        ${head('01', 'Document control')}
        <table class="tbl defs compact"><colgroup><col style="width:18%"></colgroup><tbody>
          <tr><td>Document</td><td>HIPAA Security Risk Assessment — ${orgLabel}</td></tr>
          <tr><td>Version / status</td><td>${esc(version)} · ${statusLabel}</td></tr>
          <tr><td>Assessment date</td><td>${fmtDate(m.assessmentDate)}</td></tr>
          <tr><td>Review period</td><td>${plain(m.period)}</td></tr>
          <tr><td>Prepared by</td><td>${plain(assessor)}</td></tr>
          <tr><td>Security official</td><td>${plain(m.securityOfficial)}</td></tr>
          <tr><td>Approved by</td><td>${plain(m.executive, 'Pending approval')}${m.signDate ? ' · ' + fmtDate(m.signDate) : ''}</td></tr>
          <tr><td>Classification</td><td>${esc(classification)}</td></tr>
          <tr><td>Next review due</td><td>${nextReview ? fmtDate(nextReview) : '<span class="placeholder">Set the assessment date</span>'}, or sooner following environmental or operational changes affecting ePHI security (§164.308(a)(8)).</td></tr>
          <tr><td>Retention</td><td>Retain this analysis, evidence, and approvals for six years from creation or last effective date, whichever is later (§164.316(b)(2)(i)).</td></tr>
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
    const topRisks = [...S.risks].sort((a, b) => b.score - a.score).slice(0, 6);
    const bars = Object.values(byCatOrdered(S)).map(cat => {
      const seg = (n, cls) => n ? `<span class="${cls}" style="width:${(n / cat.total * 100).toFixed(1)}%" title="${n}">${n / cat.total >= 0.09 ? n : ''}</span>` : '';
      return `<div class="rpt-bar-row"><div class="lbl">${esc(CATEGORIES[cat.key].short)}<small>${esc(CATEGORIES[cat.key].cite)} · ${cat.total} safeguards</small></div><div class="rpt-bar">${seg(cat.met, 'good')}${seg(cat.partial, 'warn')}${seg(cat['not-met'], 'crit')}${seg(cat.na, 'na')}${seg(cat.none, 'none')}</div><div class="pct">${cat.score == null ? '—' : cat.score + '%'}</div></div>`;
    }).join('');
    const execSummary = `
      <section class="rpt-section pb">
        ${head('02', 'Executive summary')}
        ${narrative}
        <div class="rpt-kpis">
          <div class="rpt-kpi accent"><b>${S.score == null ? '—' : S.score + '%'}</b><span>Overall score</span><small style="color:#a9b8cf">implementation · ${S.applicable} applicable safeguards</small></div>
          <div class="rpt-kpi"><b>${S.met}</b><span>Met</span><small>of ${S.total} safeguards</small></div>
          <div class="rpt-kpi"><b>${S.partial}</b><span>Partially met</span><small>corrective action needed</small></div>
          <div class="rpt-kpi"><b>${S.notMet}</b><span>Not met</span><small>open gaps</small></div>
          <div class="rpt-kpi"><b>${S.high}</b><span>High risks</span><small>${S.medium} medium · ${S.low} low</small></div>
        </div>
        <h3>Safeguard status by category</h3>
        <div class="rpt-bars">${bars}</div>
        <div class="rpt-legend"><span><i class="good"></i>Met</span><span><i class="warn"></i>Partially met</span><span><i class="crit"></i>Not met</span><span><i class="na"></i>Not applicable</span>${S.reviewed < S.total ? '<span><i class="none"></i>Not yet reviewed</span>' : ''}<span class="muted">· Percentage = (met + ½ partial) ÷ applicable safeguards reviewed</span></div>
        <div class="rpt-cols keep">
          <div>
            <h3>Priority gaps</h3>
            ${notMetList.length || partialList.length ? `<table class="tbl compact"><thead><tr><th style="width:13%">ID</th><th>Safeguard</th><th style="width:27%">Status</th></tr></thead><tbody>${[...notMetList, ...partialList].slice(0, 8).map(c => `<tr><td class="id">${c.id}</td><td><b>${esc(c.title)}</b><br><span class="cite">§${esc(c.cite)} · ${esc(c.type)}</span></td><td>${chip(c.status)}</td></tr>`).join('')}</tbody></table>${notMetList.length + partialList.length > 8 ? `<p class="small muted">${notMetList.length + partialList.length - 8} additional gaps are detailed in section 06.</p>` : ''}` : `<div class="rpt-callout good">${S.reviewed ? 'No partial or unmet safeguards were identified among the safeguards reviewed.' : 'Safeguards have not yet been evaluated.'}</div>`}
          </div>
          <div>
            <h3>Highest-rated risks</h3>
            ${topRisks.length ? `<table class="tbl compact"><thead><tr><th style="width:13%">ID</th><th>Risk</th><th style="width:27%">Rating</th></tr></thead><tbody>${topRisks.map(r => `<tr><td class="id">${r.ref}</td><td>${esc(trunc(r.description, 110)) || '<span class="placeholder">No description</span>'}</td><td>${levelChip(r.level, r.score)}</td></tr>`).join('')}</tbody></table>` : '<div class="rpt-callout">No risks have been recorded in the risk register.</div>'}
          </div>
        </div>
      </section>`;

    /* 03 Scope & methodology ------------------------------------------- */
    const scope = `
      <section class="rpt-section pb">
        ${head('03', 'Scope, environment & methodology')}
        <h3>Organization profile</h3>
        <div class="rpt-kv three">
          <div><span>Organization</span><b>${orgLabel}</b></div>
          <div><span>Entity type &amp; location</span><b>${plain(m.orgType)}</b></div>
          <div><span>Review period</span><b>${plain(m.period)}</b></div>
          <div><span>Assessment date</span><b>${fmtDate(m.assessmentDate)}</b></div>
          <div><span>Lead assessor</span><b>${plain(assessor)}</b></div>
          <div><span>HIPAA security official</span><b>${plain(m.securityOfficial)}</b></div>
        </div>
        <h3>Scope statement</h3><p>${text(m.scope, 'Scope statement not provided.')}</p>
        <h3>Environment summary</h3><p>${text(m.environment, 'Environment summary not provided.')}</p>
        <h3>Methodology &amp; participants</h3><p>${text(m.methodology, 'Methodology not provided.')}</p>
        <h3>Assessment approach</h3>
        <p>The assessment follows the risk analysis process described in HHS Office for Civil Rights guidance and NIST SP 800-30. Each Security Rule standard and implementation specification in 45 CFR §§164.308, 164.310, 164.312, 164.314, and 164.316 was evaluated against the organization's documented policies, observed practices, and technical configuration. The work proceeded in five steps:</p>
        <table class="tbl compact"><colgroup><col style="width:6%"></colgroup><tbody>
          <tr><td class="id">1</td><td><b>Scope and ePHI inventory.</b> Identify where ePHI is created, received, maintained, or transmitted, including vendors, backups, and remote work (section 04).</td></tr>
          <tr><td class="id">2</td><td><b>Safeguard evaluation.</b> Rate all ${S.total} safeguards as Met, Partially met, Not met, or Not applicable, with notes and evidence (section 05).</td></tr>
          <tr><td class="id">3</td><td><b>Threat and vulnerability identification.</b> Translate gaps and environmental threats into risk statements tied to affected systems and safeguards (section 07).</td></tr>
          <tr><td class="id">4</td><td><b>Risk determination.</b> Score likelihood and impact on a 1–5 scale; inherent risk = likelihood × impact, classified Low, Medium, or High.</td></tr>
          <tr><td class="id">5</td><td><b>Risk treatment.</b> Assign a treatment decision, owner, target date, and remediation plan, and estimate residual risk (sections 07–08).</td></tr>
        </tbody></table>
        <div class="rpt-callout">An <b>addressable</b> implementation specification is not optional. Where a specification was rated other than Met, the organization must implement it, implement an equivalent alternative, or document why it is not reasonable and appropriate. Every Not applicable determination records its applicability basis in section 05.</div>
        <h3>Rating definitions</h3>
        <h4>Safeguard status</h4>
        <table class="tbl compact defs"><colgroup><col style="width:22%"></colgroup><tbody>${Object.values(STATUSES).map(st => `<tr><td>${chip(st.key)}</td><td>${esc(st.definition)}</td></tr>`).join('')}</tbody></table>
        <div class="rpt-cols">
          <div><h4>Likelihood scale</h4><table class="tbl compact defs"><colgroup><col style="width:34%"></colgroup><tbody>${LIKELIHOOD.map(([n, l, d]) => `<tr><td>${n} · ${esc(l)}</td><td>${esc(d)}</td></tr>`).join('')}</tbody></table></div>
          <div><h4>Impact scale</h4><table class="tbl compact defs"><colgroup><col style="width:34%"></colgroup><tbody>${IMPACT.map(([n, l, d]) => `<tr><td>${n} · ${esc(l)}</td><td>${esc(d)}</td></tr>`).join('')}</tbody></table></div>
        </div>
        <h4>Risk level (likelihood × impact)</h4>
        <table class="tbl compact defs"><colgroup><col style="width:24%"></colgroup><tbody>${RISK_LEVELS.map(l => `<tr><td>${levelChip(l)} <span class="muted">${l.min}–${l.max}</span></td><td>${esc(l.guidance)}</td></tr>`).join('')}</tbody></table>
      </section>`;

    /* 04 ePHI inventory ------------------------------------------------- */
    const assets = state.assets || [];
    const inventory = `
      <section class="rpt-section">
        ${head('04', 'ePHI systems & data-flow inventory')}
        <p class="small muted">Systems, locations, and vendors within scope that create, receive, maintain, or transmit ePHI, with the protections currently applied.</p>
        ${assets.length ? `<table class="tbl compact"><thead><tr><th style="width:5%">#</th><th style="width:19%">System / location</th><th style="width:20%">ePHI &amp; purpose</th><th style="width:16%">Owner / vendor</th><th style="width:20%">Flow &amp; connections</th><th>Protection / notes</th></tr></thead><tbody>${assets.map((a, i) => `<tr><td class="id">${i + 1}</td><td class="strong">${text(a.name, '—')}</td><td>${text(a.data, '—')}</td><td>${text(a.owner, '—')}</td><td>${text(a.flow, '—')}</td><td>${text(a.protection, '—')}</td></tr>`).join('')}</tbody></table>` : '<div class="rpt-callout warn">No ePHI systems or locations have been inventoried. A complete inventory is required to establish the scope of the risk analysis.</div>'}
      </section>`;

    /* 05 Safeguard evaluation ------------------------------------------ */
    const catSummary = `<table class="tbl compact"><thead><tr><th style="width:25%">Category</th><th style="width:14%">Citation</th><th class="num">Total</th><th class="num">Met</th><th class="num">Partial</th><th class="num">Not met</th><th class="num">N/A</th><th class="num">Pending</th><th class="num">Score</th></tr></thead><tbody>
      ${Object.values(byCatOrdered(S)).map(c => `<tr><td class="strong">${esc(CATEGORIES[c.key].label)}</td><td class="cite">${esc(CATEGORIES[c.key].cite)}</td><td class="num">${c.total}</td><td class="num">${c.met}</td><td class="num">${c.partial}</td><td class="num">${c['not-met']}</td><td class="num">${c.na}</td><td class="num">${c.none}</td><td class="num strong">${c.score == null ? '—' : c.score + '%'}</td></tr>`).join('')}
      <tr><td class="strong">Total</td><td></td><td class="num strong">${S.total}</td><td class="num strong">${S.met}</td><td class="num strong">${S.partial}</td><td class="num strong">${S.notMet}</td><td class="num strong">${S.na}</td><td class="num strong">${S.total - S.reviewed}</td><td class="num strong">${S.score == null ? '—' : S.score + '%'}</td></tr></tbody></table>`;
    const catTables = Object.keys(CATEGORIES).map(key => {
      const list = S.controls.filter(c => c.category === key);
      return `<h3>${esc(CATEGORIES[key].label)} <span class="muted" style="font-weight:500">· ${esc(CATEGORIES[key].cite)}</span></h3>
        <table class="tbl compact"><thead><tr><th style="width:7.5%">ID</th><th style="width:32%">Safeguard &amp; requirement</th><th style="width:12.5%">Status</th><th>Assessment notes / finding</th><th style="width:8%">Files</th></tr></thead><tbody>
        ${list.map(c => `<tr><td class="id">${c.id}</td><td><b>${esc(c.title)}</b><br><span class="cite">§${esc(c.cite)} · ${esc(c.type)}</span><br><span class="small muted">${esc(c.text)}</span></td><td>${chip(c.status)}</td><td>${c.notes.trim() ? `<span class="prewrap">${esc(c.notes.trim())}</span>` : `<span class="placeholder">${c.status ? 'No notes recorded' : 'Not yet reviewed'}</span>`}</td><td class="small">${c.evidence.length ? `${c.evidence.length} file${c.evidence.length === 1 ? '' : 's'}` : '—'}</td></tr>`).join('')}
        </tbody></table>`;
    }).join('');
    const safeguards = `
      <section class="rpt-section pb">
        ${head('05', 'Safeguard evaluation results')}
        <p class="small muted">Every Security Rule standard and implementation specification was rated using the definitions in section 03. Evidence files are indexed in Appendix A.</p>
        <h3>Summary by category</h3>${catSummary}
        ${catTables}
      </section>`;

    /* 06 Findings & recommendations ------------------------------------ */
    const gaps = [...notMetList, ...partialList];
    const naList = S.controls.filter(c => c.status === 'na');
    const findingCard = (c, n) => {
      const related = risksByControl[c.id] || [];
      return `<div class="rpt-finding ${STATUSES[c.status].tone}">
        <div class="rpt-finding-head"><span class="id">F-${pad2(n)} · ${c.id}</span><h4>${esc(c.title)}</h4><span class="cite">§${esc(c.cite)} · ${esc(c.type)}</span>${chip(c.status)}</div>
        <p class="req">${esc(c.text)}</p>
        <dl>
          <dt>Finding</dt><dd>${text(c.notes, 'No assessment notes recorded for this gap.')}</dd>
          <dt>Recommendation</dt><dd>${text(c.recommendation, 'Recommendation to be documented by the assessor.')}</dd>
          <dt>Evidence</dt><dd>${c.evidence.length ? esc(c.evidence.map(e => e.name).join(', ')) : '<span class="placeholder">None attached</span>'}</dd>
          <dt>Related risks</dt><dd>${related.length ? related.map(r => `<b>${r.ref}</b> ${levelChip(r.level, r.score)}`).join(' &nbsp; ') : '<span class="placeholder">No risk register entry references this safeguard</span>'}</dd>
        </dl></div>`;
    };
    const findings = `
      <section class="rpt-section pb">
        ${head('06', 'Findings & recommendations')}
        ${gaps.length ? `<p class="small muted">${S.notMet} safeguard${S.notMet === 1 ? '' : 's'} rated Not met and ${S.partial} rated Partially met. Findings are listed with unmet safeguards first, then in catalog order. Each finding should be traced to a risk register entry with an owner and target date.</p>${gaps.map((c, i) => findingCard(c, i + 1)).join('')}` : `<div class="rpt-callout good">${S.reviewed ? 'No partial or unmet safeguards were identified among the safeguards reviewed. Continue to monitor the environment and re-evaluate upon operational or environmental change.' : 'No safeguards have been evaluated yet, so no findings can be reported.'}</div>`}
        ${naList.length ? `<h3>Applicability determinations</h3><p class="small muted">Safeguards rated Not applicable and the documented basis for each determination.</p><table class="tbl compact"><thead><tr><th style="width:7%">ID</th><th style="width:30%">Safeguard</th><th>Applicability basis</th></tr></thead><tbody>${naList.map(c => `<tr><td class="id">${c.id}</td><td><b>${esc(c.title)}</b><br><span class="cite">§${esc(c.cite)} · ${esc(c.type)}</span></td><td>${text(c.notes, 'Basis not documented')}</td></tr>`).join('')}</tbody></table>` : ''}
      </section>`;

    /* 07 Risk register -------------------------------------------------- */
    const sortedRisks = [...S.risks].sort((a, b) => b.score - a.score || a.ref.localeCompare(b.ref));
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
      return `<div class="rpt-heat">${cells}</div><div class="rpt-legend"><span><i class="low"></i>Low 1–7</span><span><i class="medium"></i>Medium 8–14</span><span><i class="high"></i>High 15–25</span><span class="muted">· Rows: impact 5 (top) to 1 (bottom)</span></div>`;
    })();
    const riskTable = sortedRisks.length ? `<table class="tbl compact"><thead><tr><th style="width:7%">ID</th><th>Risk statement</th><th class="num" style="width:4.5%">L</th><th class="num" style="width:4.5%">I</th><th style="width:12.5%">Inherent</th><th style="width:10%">Decision</th><th style="width:14%">Owner / target</th><th style="width:9%">Status</th><th style="width:12.5%">Residual</th></tr></thead><tbody>
      ${sortedRisks.map(r => `<tr><td class="id">${r.ref}</td><td>${text(r.description, 'No description')}${r.controlIds.length ? `<br><span class="cite">Safeguards: ${esc(r.controlIds.join(', '))}</span>` : ''}</td><td class="num">${r.L}</td><td class="num">${r.I}</td><td>${levelChip(r.level, r.score)}</td><td>${esc(r.decision)}</td><td>${plain(r.owner, 'Unassigned')}<br><span class="cite">${r.target ? fmtShort(r.target) : 'No target date'}</span></td><td>${esc(r.status)}</td><td>${r.rScore ? levelChip(r.rLevel, r.rScore) : '<span class="chip none">Not rated</span>'}</td></tr>`).join('')}
      </tbody></table>` : '';
    const riskDetails = sortedRisks.map(r => `<div class="rpt-risk ${r.level.key}">
        <div class="rpt-risk-head"><span class="id">${r.ref}</span><span class="stmt">${text(r.description, 'No description')}</span>${levelChip(r.level, r.score)}</div>
        <dl>
          <dt>Affected assets</dt><dd>${plain(r.assets, 'Not specified')}</dd>
          <dt>Safeguards</dt><dd>${r.controlIds.length ? r.controlIds.map(id => CONTROL_BY_ID[id] ? `<b>${id}</b> ${esc(CONTROL_BY_ID[id].title)}` : esc(id)).join('; ') : '<span class="placeholder">None linked</span>'}</dd>
          <dt>Existing controls</dt><dd>${plain(r.existing, 'Not specified')}</dd>
          <dt>Rating</dt><dd>Likelihood ${r.L} (${esc(LIKELIHOOD[r.L - 1]?.[1] || '')}) × Impact ${r.I} (${esc(IMPACT[r.I - 1]?.[1] || '')}) = ${r.score} · ${r.level.label}${r.rScore ? ` &nbsp;→&nbsp; Residual ${r.rL} × ${r.rI} = ${r.rScore} · ${r.rLevel.label}` : ''}</dd>
          <dt>Treatment</dt><dd><b>${esc(r.decision)}</b> · Owner: ${plain(r.owner, 'Unassigned')} · Target: ${r.target ? fmtShort(r.target) : '<span class="placeholder">Not set</span>'} · Status: ${esc(r.status)}</dd>
          <dt>Remediation plan</dt><dd>${text(r.treatment, 'Remediation plan not documented.')}</dd>
        </dl></div>`).join('');
    const riskSection = `
      <section class="rpt-section pb">
        ${head('07', 'Risk register & analysis')}
        <p class="small muted">Risks identified from safeguard gaps, the ePHI inventory, interviews, and threat scenarios. Inherent risk is scored before planned remediation; residual risk is the assessor's estimate after the treatment plan is complete.</p>
        <div class="rpt-kpis" style="grid-template-columns:repeat(4,1fr)">
          <div class="rpt-kpi"><b>${S.risks.length}</b><span>Risks recorded</span><small>${S.open} open or in progress</small></div>
          <div class="rpt-kpi"><b>${S.high}</b><span>High</span><small>score 15–25</small></div>
          <div class="rpt-kpi"><b>${S.medium}</b><span>Medium</span><small>score 8–14</small></div>
          <div class="rpt-kpi"><b>${S.low}</b><span>Low</span><small>score 1–7</small></div>
        </div>
        <h3>Risk heat map</h3>${heat}
        <h3>Risk register</h3>
        ${riskTable || '<div class="rpt-callout warn">No risks have been recorded. A complete risk analysis identifies the threats and vulnerabilities to ePHI, rates likelihood and impact, and assigns treatment. Add entries in the workspace risk register.</div>'}
        ${sortedRisks.length ? `<h3>Risk detail &amp; treatment plans</h3>${riskDetails}` : ''}
      </section>`;

    /* 08 Remediation roadmap ------------------------------------------- */
    const roadmapRows = sortedRisks.filter(r => r.status !== 'Closed');
    const roadmap = `
      <section class="rpt-section pb">
        ${head('08', 'Remediation roadmap')}
        ${roadmapRows.length ? `<p class="small muted">Open and in-progress risks in priority order. High risks require immediate action or a documented management acceptance; medium risks should be scheduled within the assessment cycle; low risks are monitored through routine operations.</p>
        <table class="tbl compact"><thead><tr><th style="width:11%">Priority</th><th style="width:7%">ID</th><th>Action</th><th style="width:15%">Owner</th><th style="width:12%">Target</th><th style="width:11%">Status</th></tr></thead><tbody>
        ${roadmapRows.map((r, i) => `<tr><td>${levelChip(r.level)}</td><td class="id">${r.ref}</td><td>${r.treatment.trim() ? `<span class="prewrap">${esc(trunc(r.treatment.trim(), 320))}</span>` : `<span class="placeholder">Plan not documented</span>`}<br><span class="cite">${esc(r.decision)} · ${esc(trunc(r.description, 90))}</span></td><td>${plain(r.owner, 'Unassigned')}</td><td>${r.target ? fmtShort(r.target) : '<span class="placeholder">Not set</span>'}</td><td>${esc(r.status)}</td></tr>`).join('')}
        </tbody></table>` : `<div class="rpt-callout ${S.risks.length ? 'good' : ''}">${S.risks.length ? 'All recorded risks are closed. Continue periodic evaluation under §164.308(a)(8).' : 'No remediation actions are scheduled because the risk register is empty.'}</div>`}
      </section>`;

    /* 09 Attestation ---------------------------------------------------- */
    const attestation = `
      <section class="rpt-section pb">
        ${head('09', 'Management review & attestation')}
        <h3>Assessor's statement</h3>
        <p>This risk analysis was performed by ${plain(assessor, 'the lead assessor')} for ${orgLabel} using the methodology in section 03. Conclusions reflect the policies, practices, configurations, and evidence made available during the assessment period${m.period ? ` (${esc(m.period)})` : ''}. The analysis should be updated when significant changes occur to systems, workforce, facilities, vendors, or the threat environment, and at least annually.</p>
        <h3>Management statement</h3>
        <div class="rpt-statement prewrap">${esc((m.attestationText || '').trim() || 'Management has reviewed this security risk analysis, acknowledges the identified risks, and approves the documented remediation priorities and risk treatment decisions.')}</div>
        <div class="rpt-sign">
          <div><div class="role">Lead assessor</div><div class="line"></div><b>${plain(assessor, 'Name, title')}</b><div class="date">Date: ${m.assessmentDate ? fmtDate(m.assessmentDate) : '________________'}</div></div>
          <div><div class="role">HIPAA security official</div><div class="line"></div><b>${plain(m.securityOfficial, 'Name, title')}</b><div class="date">Date: ________________</div></div>
          <div><div class="role">Executive approver</div><div class="line"></div><b>${plain(m.executive, 'Name, title')}</b><div class="date">Date: ${m.signDate ? fmtDate(m.signDate) : '________________'}</div></div>
        </div>
      </section>`;

    /* Appendix A Evidence ------------------------------------------------ */
    const evidenceRows = S.controls.flatMap(c => c.evidence.map(e => ({ c, e })));
    const appendixA = `
      <section class="rpt-section pb">
        ${head('A', 'Appendix A · Evidence index')}
        ${evidenceRows.length ? `<p class="small muted">${evidenceRows.length} evidence file${evidenceRows.length === 1 ? '' : 's'} attached to the assessment. Files are embedded in the saved assessment JSON and are not reproduced in this report.</p><table class="tbl compact"><thead><tr><th style="width:7%">ID</th><th style="width:28%">Safeguard</th><th>File</th><th style="width:16%">Type</th><th style="width:9%">Size</th></tr></thead><tbody>${evidenceRows.map(({ c, e }) => `<tr><td class="id">${c.id}</td><td>${esc(c.title)}</td><td>${esc(e.name)}</td><td class="small">${esc(e.type || '—')}</td><td class="small">${formatBytes(e.size || 0)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">No evidence files were attached to this assessment. Attach policies, screenshots, reports, and agreements to the relevant safeguards in the workspace so they are indexed here and preserved in the assessment file.</p>'}
      </section>`;

    /* Appendix B Completeness ------------------------------------------- */
    const appendixB = `
      <section class="rpt-section">
        ${head('B', 'Appendix B · Assessment completeness')}
        <p class="small muted">Readiness checks applied by the SaberGuard SRA workspace before the report is marked final. ${S.isDraft ? 'Items marked ! were outstanding when this report was generated.' : 'All checks passed when this report was generated.'}</p>
        <ul class="rpt-checks">${S.checks.map(c => `<li class="${c.ok ? 'ok' : 'todo'}"><span class="mk">${c.ok ? '✓' : '!'}</span><span>${esc(c.label)}</span></li>`).join('')}</ul>
        <div class="rpt-kv three">
          <div><span>Safeguards reviewed</span><b>${S.reviewed} of ${S.total}</b></div>
          <div><span>Risks recorded</span><b>${S.risks.length}</b></div>
          <div><span>Evidence files</span><b>${S.evidence}</b></div>
          <div><span>Report generated</span><b>${generated.toLocaleString('en-US')}</b></div>
          <div><span>Assessment file last saved</span><b>${state.savedAt ? new Date(state.savedAt).toLocaleString('en-US') : 'Not saved this session'}</b></div>
          <div><span>Tool</span><b>SaberGuard HIPAA SRA · open source (MIT)</b></div>
        </div>
        <p class="small muted">This report was produced with the SaberGuard HIPAA Security Risk Assessment workspace, an open-source, local-first tool. It supports but does not replace professional judgment; it is not legal advice and does not by itself establish compliance with the HIPAA Security Rule.</p>
      </section>`;

    return `<div class="rpt ${S.isDraft ? 'is-draft' : ''}">
      <div class="rpt-watermark" aria-hidden="true"><span>DRAFT</span></div>
      ${cover}
      <table class="rpt-frame">
        <thead><tr><td><div class="rpt-run-head"><span><b>HIPAA Security Risk Assessment</b> · ${orgLabel}</span><span>${esc(classification)} · v${esc(version)} ${statusLabel}</span></div></td></tr></thead>
        <tfoot><tr><td><div class="rpt-run-foot"><span>SaberGuard HIPAA SRA · Generated ${generatedLabel}</span><span>${assessor ? 'Prepared by ' + esc(trunc(assessor, 70)) : 'Prepared by the lead assessor'}</span></div></td></tr></tfoot>
        <tbody><tr><td>${docControl}${execSummary}${scope}${inventory}${safeguards}${findings}${riskSection}${roadmap}${attestation}${appendixA}${appendixB}</td></tr></tbody>
      </table>
    </div>`;
  }

  function byCatOrdered(S) { return Object.keys(CATEGORIES).map(k => S.byCategory[k]); }

  function autoNarrative(S, m, org) {
    const who = (m.assessor || '').trim() ? esc(m.assessor.trim()) : 'The lead assessor';
    const orgName = org ? esc(org) : 'the organization';
    const period = (m.period || '').trim() ? ` covering ${esc(m.period.trim())}` : '';
    const parts = [];
    parts.push(`${who} conducted a HIPAA Security Rule risk analysis of ${orgName}${period}. The assessment evaluated ${S.total} standards and implementation specifications across the administrative, physical, technical, organizational, and documentation requirements of 45 CFR Part 164, Subpart C.`);
    if (S.reviewed) {
      parts.push(`Of the ${S.applicable} applicable safeguards reviewed, ${S.met} ${S.met === 1 ? 'was' : 'were'} found fully implemented, ${S.partial} partially implemented, and ${S.notMet} not implemented, producing an implementation score of ${S.score}%. ${S.na} safeguard${S.na === 1 ? ' was' : 's were'} determined not applicable.`);
    } else {
      parts.push('Safeguard evaluation has not yet been completed; results in this report are preliminary.');
    }
    if (S.reviewed && S.reviewed < S.total) parts.push(`${S.total - S.reviewed} safeguard${S.total - S.reviewed === 1 ? '' : 's'} remain to be reviewed before this analysis can be finalized.`);
    if (S.risks.length) {
      parts.push(`The risk register records ${S.risks.length} risk${S.risks.length === 1 ? '' : 's'}: ${S.high} high, ${S.medium} medium, and ${S.low} low. ${S.high ? 'High-rated risks require immediate remediation or a documented management acceptance decision. ' : ''}${S.open} ${S.open === 1 ? 'remains' : 'remain'} open or in progress.`);
    } else {
      parts.push('No risks have been recorded in the risk register; the register should be completed so that each gap is tied to an owned treatment plan.');
    }
    return `<p class="lead">${parts.join(' ')}</p>`;
  }

  return { stats, render, fmtDate };
})();

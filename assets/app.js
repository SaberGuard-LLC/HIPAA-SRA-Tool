/* ============================================================================
   SaberGuard SRA Workspace: workspace logic
   State lives in memory only. Nothing is persisted unless the assessor saves
   a JSON file or prints the report.
   ========================================================================== */
(function () {
  'use strict';

  const MAX_FILE = 10 * 1024 * 1024;
  const MAX_TOTAL = 25 * 1024 * 1024;

  /* `dirty` is set on every edit and cleared when a file is saved or opened.
     The unsaved-work warning reads it. */
  const state = { meta: {}, assets: [], flows: [], controls: {}, risks: [], savedAt: null, dirty: false };
  let activeFilter = 'all';
  let reportMode = false;

  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad2 = n => String(n).padStart(2, '0');
  const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
  const formatBytes = n => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;
  const toDataUrl = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
  const rating = v => { const n = Number(v); return n >= 1 && n <= 5 ? n : ''; };
  const options = (list, value, blankLabel) => (blankLabel != null ? `<option value="" ${!value ? 'selected' : ''}>${esc(blankLabel)}</option>` : '') + list.map(([k, label]) => `<option value="${esc(k)}" ${value === k ? 'selected' : ''}>${esc(label)}</option>`).join('');
  const assetLabel = (a, i) => `${i + 1} · ${a.name.trim() || 'Unnamed row'}`;
  const assetName = id => { const i = state.assets.findIndex(a => a.id === id); return i < 0 ? 'Removed row' : assetLabel(state.assets[i], i); };
  const flowLabel = (f, i) => `F-${pad2(i + 1)} · ${assetName(f.from)} ${f.twoWay ? 'and' : 'to'} ${assetName(f.to)}`;

  function controlState(id) {
    const c = state.controls[id] || (state.controls[id] = SRAFormat.newControl());
    if (typeof c.status !== 'string') c.status = '';
    if (typeof c.notes !== 'string') c.notes = '';
    if (typeof c.recommendation !== 'string') c.recommendation = '';
    if (typeof c.basis !== 'string') c.basis = '';
    if (!Array.isArray(c.evidence)) c.evidence = [];
    return c;
  }

  /* ---- Catalog review ---------------------------------------------------- */
  const TONE = { 'not-met': 'has-gap', partial: 'is-partial', met: 'is-met', alt: 'is-alt', doc: 'is-doc', na: 'is-na' };
  function requirementHtml(c) {
    const parent = c.parent && CONTROL_BY_ID[c.parent];
    const under = parent ? `<div class="under">Implementation specification under ${esc(parent.title)} (45 CFR ${esc(parent.cite)})</div>` : '';
    const reg = c.regulation
      ? `<p class="reg">${esc(c.regulation)}</p>`
      : '<p class="reg pending">Regulation text pending confirmation against the official text.</p>';
    const label = c.titleBy ? ` <span class="muted">(${esc(c.titleBy)}'s label)</span>` : '';
    return `<h3>${esc(c.title)}${label}</h3>${under}${reg}<p class="summary"><span class="lbl">SaberGuard's summary:</span> ${esc(c.summary)}</p><p class="explain">Assessor prompt: ${esc(c.prompt)}</p>`;
  }
  function renderControls() {
    const wrap = $('controls');
    wrap.innerHTML = '';
    let last = '';
    const stats = SRAReport.stats(state);
    const derived = profileApplicability(state.meta);
    const duty = businessAssociateDuty(state.meta);
    CONTROLS.forEach(c => {
      const s = controlState(c.id);
      const effective = stats.controls.find(x => x.id === c.id);
      if (activeFilter === 'gaps' && !['partial', 'not-met'].includes(effective.status)) return;
      if (activeFilter === 'unreviewed' && effective.status) return;
      if (activeFilter === 'carried' && !s.carried) return;
      if (!['all', 'gaps', 'unreviewed', 'carried'].includes(activeFilter) && c.category !== activeFilter) return;
      if (c.category !== last) {
        const cat = stats.byCategory[c.category];
        const gaps = cat.partial + cat['not-met'];
        const head = document.createElement('div');
        head.className = 'cat-head';
        head.innerHTML = `<h3>${esc(CATEGORIES[c.category].label)} <span class="muted">· ${esc(CATEGORIES[c.category].cite)}</span></h3><span>${cat.reviewed} of ${cat.total} reviewed · ${gaps} gap${gaps === 1 ? '' : 's'}</span>`;
        wrap.appendChild(head);
        last = c.category;
      }
      const locked = !!derived[c.id];
      const card = document.createElement('article');
      card.className = `control-card ${TONE[effective.status] || ''} ${s.carried ? 'is-carried' : ''}`;
      card.dataset.id = c.id;
      const hasDoc = s.notes || s.recommendation || s.evidence.length;
      const choices = statusesFor(c).map(st => `<button type="button" class="choice ${s.status === st.key ? 'selected' : ''}" data-value="${st.key}" aria-pressed="${s.status === st.key}" title="${esc(st.label)}" ${locked ? 'disabled' : ''}>${st.short}</button>`).join('');
      const banners = [
        locked ? `<div class="banner derived">${esc(derived[c.id])} Change the entity profile in step 1 to review this row.</div>` : '',
        c.id === 'A29' && duty ? `<div class="banner duty">${esc(duty)}</div>` : '',
        s.carried ? `<div class="banner carried"><b>Carried from version 3, review again.</b> The citation or regulation text of this row changed after this answer was recorded${s.status ? ` (recorded answer: ${esc(STATUSES[s.status]?.label || s.status)})` : ''}. It counts as not reviewed until you confirm it or change it. <button type="button" class="btn small confirm-carried no-print">Confirm answer</button></div>` : ''
      ].join('');
      card.innerHTML = `
        <div class="control-top">
          <div>
            <div class="control-id">${c.id} · 45 CFR ${esc(c.cite)} · <span class="type ${c.type === 'Required' ? 'required' : ''}">${esc(c.type)}</span></div>
            ${requirementHtml(c)}
            ${banners}
            <button class="toggle-detail no-print" type="button">${hasDoc ? 'Edit notes, recommendation & evidence' : 'Add notes, recommendation & evidence'} <span class="caret">&#9662;</span></button>
          </div>
          <div class="choices-col">
            <div class="choices" role="radiogroup" aria-label="${esc(c.title)} status">${choices}</div>
            <label class="basis-pick">Verification basis <select class="control-basis" ${locked ? 'disabled' : ''}>${options(BASIS, s.basis, 'Not recorded')}</select></label>
          </div>
        </div>
        <div class="control-detail">
          <div class="field"><label>Assessment notes / finding</label><small>What was verified, how, and where the evidence lives. For Not applicable, Alternative measure in place, or Not implemented, decision documented, record the organization's reason.</small><textarea class="control-notes" placeholder="Reviewed the written policy (rev. 2025-03), sampled three access requests, and confirmed...">${esc(s.notes)}</textarea></div>
          <div class="field"><label>Recommendation / corrective action</label><small>Printed in the findings section when the row is partially met or not met.</small><textarea class="control-rec" placeholder="Implement..., assign an owner, and validate by...">${esc(s.recommendation)}</textarea></div>
          <div class="field full"><label>Supporting evidence</label><small class="warn-text">Do not attach files that show patient identifiers. Redact names, dates of birth, record numbers, and similar identifiers before attaching. Attached files are embedded in the saved assessment file unless you save without evidence.</small>
            <div class="evidence-box"><input class="evidence-input no-print" type="file" multiple aria-label="Attach evidence files for ${esc(c.title)}">
              <div class="evidence-list">${s.evidence.length ? s.evidence.map((e, i) => `<div class="file"><span>${esc(e.name)} <span class="muted">(${formatBytes(e.size)})${e.omitted ? ' · not embedded in the opened file' : ''}</span></span><button type="button" class="remove-evidence no-print" data-index="${i}" title="Remove file">Remove</button></div>`).join('') : '<span>No files attached. Files stay in memory until you save the assessment.</span>'}</div>
            </div>
          </div>
        </div>`;
      wrap.appendChild(card);
      if (hasDoc && activeFilter === 'gaps') card.classList.add('open');
      card.querySelector('.toggle-detail').onclick = () => card.classList.toggle('open');
      const reopen = () => { const open = card.classList.contains('open'); renderControls(); if (open) wrap.querySelector(`[data-id="${c.id}"]`)?.classList.add('open'); updateDashboard(); };
      card.querySelectorAll('.choice').forEach(b => b.onclick = () => {
        s.status = s.status === b.dataset.value ? '' : b.dataset.value;
        delete s.carried;
        reopen();
      });
      card.querySelector('.confirm-carried')?.addEventListener('click', () => { delete s.carried; reopen(); });
      card.querySelector('.control-basis').onchange = e => { s.basis = e.target.value; updateDashboard(); };
      card.querySelector('.control-notes').oninput = e => { s.notes = e.target.value; updateDashboard(); };
      card.querySelector('.control-rec').oninput = e => { s.recommendation = e.target.value; updateDashboard(); };
      card.querySelectorAll('.remove-evidence').forEach(b => b.onclick = () => { s.evidence.splice(Number(b.dataset.index), 1); reopen(); });
      card.querySelector('.evidence-input').onchange = async e => {
        const current = CONTROLS.reduce((n, x) => n + controlState(x.id).evidence.reduce((m, f) => m + f.size, 0), 0);
        let added = 0, rejected = 0;
        for (const file of e.target.files) {
          if (file.size > MAX_FILE || current + added + file.size > MAX_TOTAL) { rejected++; continue; }
          s.evidence.push({ name: file.name, type: file.type, size: file.size, data: await toDataUrl(file) });
          added += file.size;
        }
        if (rejected) $('saveStatus').textContent = `${rejected} file${rejected === 1 ? '' : 's'} not attached: limit is 10 MB per file and 25 MB per assessment.`;
        card.classList.add('open');
        reopen();
      };
    });
    if (!wrap.children.length) wrap.innerHTML = '<div class="empty">No catalog rows match this filter.</div>';
  }

  /* ---- ePHI inventory ---------------------------------------------------- */
  function addAsset(a = {}) {
    state.assets.push(SRAFormat.newAsset(a));
    renderAssets(); renderFlows(); renderRisks();
    updateDashboard();
    const cards = $('assetRows').querySelectorAll('.asset-card');
    cards[cards.length - 1]?.querySelector('input')?.focus();
  }
  function renderAssets() {
    const wrap = $('assetRows');
    wrap.innerHTML = '';
    $('assetEmpty').style.display = state.assets.length ? 'none' : 'block';
    state.assets.forEach((a, i) => {
      const card = document.createElement('article');
      const unclassified = a.kind === 'unknown' || a.zone === 'unknown';
      card.className = `asset-card ${unclassified ? 'is-unclassified' : ''}`;
      card.innerHTML = `
        <div class="asset-head"><span class="asset-ref">${i + 1}</span><span class="asset-title">${esc(a.name.trim() || 'Unnamed row')}</span>${unclassified ? '<span class="chip-gap">Unclassified: set kind and zone</span>' : ''}<span class="spacer"></span><button class="btn danger small remove no-print" type="button" title="Remove row">Remove</button></div>
        <div class="asset-grid">
          <div class="field span2"><label>System, location, person, or party</label><input class="input" data-k="name" placeholder="EHR and patient portal, therapist laptop, clients, billing contractor" value="${esc(a.name)}"></div>
          <div class="field"><label>Kind</label><select data-k="kind">${options(INVENTORY.kind, a.kind)}</select></div>
          <div class="field"><label>Zone</label><select data-k="zone">${options(INVENTORY.zone, a.zone)}</select></div>
          <div class="field span2"><label>ePHI held or handled</label><textarea data-k="data" placeholder="Data types and purpose">${esc(a.data)}</textarea></div>
          <div class="field span2"><label>Lifecycle</label><small>What this row does with ePHI.</small><div class="checks">${INVENTORY.lifecycle.map(([k, label]) => `<label><input type="checkbox" data-life="${k}" ${a.lifecycle.includes(k) ? 'checked' : ''}> ${esc(label)}</label>`).join('')}</div></div>
          <div class="field"><label>Owner</label><input class="input" data-k="owner" placeholder="Internal owner" value="${esc(a.owner)}"></div>
          <div class="field"><label>Accountable person or role</label><input class="input" data-k="accountable" placeholder="Practice owner" value="${esc(a.accountable)}"></div>
          <div class="field"><label>Vendor</label><small>Leave empty when in-house.</small><input class="input" data-k="vendor" placeholder="EHR vendor" value="${esc(a.vendor)}"></div>
          <div class="field"><label>Business associate agreement</label><select data-k="baa">${options(INVENTORY.baa, a.baa)}</select></div>
          <div class="field"><label>Location</label><select data-k="location">${options(INVENTORY.location, a.location)}</select></div>
          <div class="field"><label>Encrypted at rest</label><select data-k="atRest">${options(INVENTORY.yesNo, a.atRest)}</select></div>
          <div class="field"><label>Multi-factor authentication</label><select data-k="mfa">${options(INVENTORY.yesNo, a.mfa)}</select></div>
          <div class="field"><label>Count</label><small>How many of this row, for example 24 laptops.</small><input class="input" data-k="count" type="number" min="1" step="1" value="${a.count}"></div>
          <div class="field span2"><label>Protection and notes</label><textarea data-k="protection" placeholder="Encryption, access, backup, agreements">${esc(a.protection)}</textarea></div>
          ${a.flow ? `<div class="field span2"><label>Flow notes from version 3</label><small>Legacy text. Record the connections as data flows below.</small><textarea data-k="flow">${esc(a.flow)}</textarea></div>` : ''}
        </div>`;
      wrap.appendChild(card);
      card.querySelectorAll('[data-k]').forEach(el => el.oninput = e => {
        const k = e.target.dataset.k, v = e.target.value;
        a[k] = k === 'count' ? Math.max(1, parseInt(v, 10) || 1) : v;
        if (k === 'name') { card.querySelector('.asset-title').textContent = a.name.trim() || 'Unnamed row'; renderFlows(); renderRisks(); }
        if (['kind', 'zone'].includes(k)) renderAssets();
        updateDashboard();
      });
      card.querySelectorAll('[data-life]').forEach(el => el.onchange = e => {
        const k = e.target.dataset.life;
        a.lifecycle = INVENTORY.lifecycle.map(([x]) => x).filter(x => x === k ? e.target.checked : a.lifecycle.includes(x));
        updateDashboard();
      });
      card.querySelector('.remove').onclick = () => {
        state.assets.splice(i, 1);
        state.flows = state.flows.filter(f => f.from !== a.id && f.to !== a.id);
        state.risks.forEach(r => { r.assetIds = r.assetIds.filter(id => id !== a.id); r.flowIds = r.flowIds.filter(id => state.flows.some(f => f.id === id)); });
        renderAssets(); renderFlows(); renderRisks(); updateDashboard();
      };
    });
  }

  /* ---- Data flows -------------------------------------------------------- */
  function addFlow(f = {}) {
    state.flows.push(SRAFormat.newFlow(f));
    renderFlows(); renderRisks();
    updateDashboard();
    const rows = $('flowRows').querySelectorAll('tr');
    rows[rows.length - 1]?.querySelector('select')?.focus();
  }
  function renderFlows() {
    const body = $('flowRows');
    body.innerHTML = '';
    $('flowEmpty').style.display = state.flows.length ? 'none' : 'block';
    const assetOptions = sel => options(state.assets.map((a, i) => [a.id, assetLabel(a, i)]), sel, 'Choose a row');
    state.flows.forEach((f, i) => {
      const tr = document.createElement('tr');
      const bad = !f.from || !f.to || f.from === f.to || !state.assets.some(a => a.id === f.from) || !state.assets.some(a => a.id === f.to);
      tr.className = bad ? 'is-bad' : '';
      tr.innerHTML = `<td class="ref">F-${pad2(i + 1)}</td>
        <td><select data-k="from" aria-label="From">${assetOptions(f.from)}</select></td>
        <td><select data-k="twoWay" aria-label="Direction"><option value="" ${!f.twoWay ? 'selected' : ''}>One way</option><option value="1" ${f.twoWay ? 'selected' : ''}>Two way</option></select></td>
        <td><select data-k="to" aria-label="To">${assetOptions(f.to)}</select></td>
        <td><textarea data-k="data" placeholder="What ePHI moves" aria-label="ePHI carried">${esc(f.data)}</textarea></td>
        <td><select data-k="transport" aria-label="Transport">${options(INVENTORY.transport, f.transport)}</select></td>
        <td><select data-k="inTransit" aria-label="Encrypted in transit">${options(INVENTORY.yesNo, f.inTransit)}</select></td>
        <td><textarea data-k="notes" placeholder="Notes" aria-label="Notes">${esc(f.notes)}</textarea></td>
        <td class="no-print"><button class="btn danger small remove" type="button" title="Remove flow">&times;</button></td>`;
      body.appendChild(tr);
      tr.querySelectorAll('[data-k]').forEach(el => el.onchange = el.oninput = e => {
        const k = e.target.dataset.k, v = e.target.value;
        if (k === 'twoWay') f.twoWay = v === '1'; else f[k] = v;
        if (k === 'transport' && ['direct-entry', 'removable-media'].includes(v) && f.inTransit === 'unknown') f.inTransit = 'n/a';
        if (['from', 'to', 'twoWay', 'transport'].includes(k)) { renderFlows(); renderRisks(); }
        updateDashboard();
      });
      tr.querySelector('.remove').onclick = () => {
        state.flows.splice(i, 1);
        state.risks.forEach(r => { r.flowIds = r.flowIds.filter(id => id !== f.id); });
        renderFlows(); renderRisks(); updateDashboard();
      };
    });
  }

  /* ---- Risk register ----------------------------------------------------- */
  function addRisk(r = {}) {
    state.risks.push(SRAFormat.newRisk(r));
    renderRisks();
    updateDashboard();
    const cards = $('riskRows').querySelectorAll('.risk-card');
    cards[cards.length - 1]?.querySelector('textarea')?.focus();
  }
  const scaleOptions = (scale, value) => `<option value="" ${value === '' || value == null ? 'selected' : ''}>Not rated</option>` + scale.map(([n, label]) => `<option value="${n}" ${Number(value) === n ? 'selected' : ''}>${n} · ${label}</option>`).join('');
  /* A picker is a select that adds an id to a list, shown as removable chips. */
  function pickerHtml(key, selected, choices, addLabel, legacy, legacyLabel) {
    const label = id => choices.find(c => c[0] === id)?.[1] || id;
    const open = choices.filter(c => !selected.includes(c[0]));
    return `<div class="picker" data-pick="${key}">
      <div class="chips">${selected.map(id => `<span class="pick-chip">${esc(label(id))}<button type="button" class="pick-remove no-print" data-id="${esc(id)}" title="Remove">&times;</button></span>`).join('') || '<span class="muted">None linked</span>'}</div>
      <select class="no-print" aria-label="${esc(addLabel)}"><option value="">${esc(addLabel)}</option>${open.map(([id, l]) => `<option value="${esc(id)}">${esc(l)}</option>`).join('')}</select>
      ${legacy ? `<div class="legacy"><b>${esc(legacyLabel)}:</b> ${esc(legacy)}</div>` : ''}
    </div>`;
  }
  function renderRisks() {
    const wrap = $('riskRows');
    wrap.innerHTML = '';
    $('riskEmpty').style.display = state.risks.length ? 'none' : 'block';
    const assetChoices = state.assets.map((a, i) => [a.id, assetLabel(a, i)]);
    const flowChoices = state.flows.map((f, i) => [f.id, flowLabel(f, i)]);
    const controlChoices = CONTROLS.map(c => [c.id, `${c.id} · ${c.title}`]);
    state.risks.forEach((r, i) => {
      const score = r.likelihood && r.impact ? r.likelihood * r.impact : null;
      const level = score ? riskLevel(score) : null;
      const rScore = r.residualLikelihood && r.residualImpact ? r.residualLikelihood * r.residualImpact : null;
      const rLevel = rScore ? riskLevel(rScore) : null;
      const card = document.createElement('article');
      card.className = `risk-card ${level ? 'level-' + level.key : 'level-none'}`;
      card.innerHTML = `
        <div class="risk-head">
          <span class="risk-ref">R-${pad2(i + 1)}</span>
          <span class="score-chip ${level ? 'score-' + level.key : 'score-na'}">Inherent ${score ? `${score} · ${level.label}` : 'not rated'}</span>
          <span class="score-chip ${rLevel ? 'score-' + rLevel.key : 'score-na'}">Residual ${rScore ? `${rScore} · ${rLevel.label}` : 'not rated'}</span>
          <span class="spacer"></span>
          <button class="btn danger small remove no-print" type="button" title="Remove risk">Remove</button>
        </div>
        <div class="risk-grid">
          <div class="field full"><label>Risk statement</label><small>Threat, vulnerability, and the ePHI or process affected.</small><textarea data-k="description" placeholder="Phishing could compromise a clinician's email account, exposing ePHI in mailboxes, because the account is protected by a password alone.">${esc(r.description)}</textarea></div>
          <div class="field span2"><label>Affected systems, people, or parties</label>${pickerHtml('assetIds', r.assetIds, assetChoices, state.assets.length ? 'Add an inventory row' : 'No inventory rows yet', r.legacyAssets, 'Version 3 text')}</div>
          <div class="field span2"><label>Affected data flows</label>${pickerHtml('flowIds', r.flowIds, flowChoices, state.flows.length ? 'Add a data flow' : 'No data flows yet')}</div>
          <div class="field span2"><label>Related catalog rows</label>${pickerHtml('controlIds', r.controlIds, controlChoices, 'Add a catalog row', r.legacyControls, 'Version 3 text')}</div>
          <div class="field span2"><label>Existing measures</label><input class="input" data-k="existing" placeholder="Spam filtering, annual training" value="${esc(r.existing)}"></div>
          <div class="field"><label>Likelihood</label><select data-k="likelihood">${scaleOptions(LIKELIHOOD, r.likelihood)}</select></div>
          <div class="field"><label>Impact</label><select data-k="impact">${scaleOptions(IMPACT, r.impact)}</select></div>
          <div class="field"><label>Treatment decision</label><select data-k="decision">${DECISIONS.map(d => `<option ${r.decision === d ? 'selected' : ''}>${d}</option>`).join('')}</select></div>
          <div class="field"><label>Status</label><select data-k="status">${RISK_STATUSES.map(d => `<option ${r.status === d ? 'selected' : ''}>${d}</option>`).join('')}</select></div>
          <div class="field"><label>Owner</label><input class="input" data-k="owner" placeholder="Name or role" value="${esc(r.owner)}"></div>
          <div class="field"><label>Target date</label><input class="input" data-k="target" type="date" value="${esc(r.target)}"></div>
          <div class="field"><label>Residual likelihood</label><select data-k="residualLikelihood">${scaleOptions(LIKELIHOOD, r.residualLikelihood)}</select></div>
          <div class="field"><label>Residual impact</label><select data-k="residualImpact">${scaleOptions(IMPACT, r.residualImpact)}</select></div>
          <div class="field full"><label>Remediation plan</label><small>Actions, milestones, compensating measures, and how completion will be validated.</small><textarea data-k="treatment" placeholder="Turn on multi-factor authentication for all Microsoft 365 accounts by...; confirm with the tenant report; retrain staff on...">${esc(r.treatment)}</textarea></div>
        </div>`;
      wrap.appendChild(card);
      card.querySelectorAll('[data-k]').forEach(el => el.oninput = e => {
        const k = e.target.dataset.k, v = e.target.value;
        r[k] = ['likelihood', 'impact', 'residualLikelihood', 'residualImpact'].includes(k) ? rating(v) : v;
        if (['likelihood', 'impact', 'residualLikelihood', 'residualImpact', 'decision', 'status'].includes(k)) renderRisks();
        updateDashboard();
      });
      card.querySelectorAll('.picker').forEach(p => {
        const key = p.dataset.pick;
        p.querySelector('select').onchange = e => { if (e.target.value && !r[key].includes(e.target.value)) r[key].push(e.target.value); renderRisks(); updateDashboard(); };
        p.querySelectorAll('.pick-remove').forEach(b => b.onclick = () => { r[key] = r[key].filter(id => id !== b.dataset.id); renderRisks(); updateDashboard(); });
      });
      card.querySelector('.remove').onclick = () => { state.risks.splice(i, 1); renderRisks(); updateDashboard(); };
    });
  }

  /* ---- ePHI flow map ------------------------------------------------------ */
  function renderMap(S) {
    const box = $('mapBox');
    box.innerHTML = '';
    if (!state.assets.length) {
      box.innerHTML = '<div class="empty">No inventory rows yet. Add systems and locations in step 2 to draw the map.</div>';
      $('mapFacts').innerHTML = ''; $('mapLegend').innerHTML = ''; $('mapAttention').innerHTML = '';
      return;
    }
    const built = SRAMap.build(state);
    box.appendChild(SRAMap.toElement(built.tree));
    $('mapLegend').innerHTML = SRAMap.legendHtml();
    const f = built.facts;
    const stat = (n, label, flag) => `<div class="${flag && n > 0 ? 'flag' : ''}"><b>${n}</b><span>${esc(label)}</span></div>`;
    $('mapFacts').innerHTML = stat(f.systems, 'systems, people and parties') + stat(f.flows, 'data flows') + stat(f.out, 'reach a vendor or outside party') + stat(f.weak, 'not encrypted or not checked in transit', true) + stat(f.noBaa, 'vendors without a confirmed BAA', true) + stat(f.unclassified, 'rows not yet classified', true);
    const open = [...S.risks].filter(r => r.status !== 'Closed').sort((a, b) => (b.score || 0) - (a.score || 0) || a.ref.localeCompare(b.ref));
    const chip = r => `<span class="score-chip ${r.level ? 'score-' + r.level.key : 'score-na'}">${r.ref}${r.level ? ' · ' + r.level.label : ' · not rated'}</span>`;
    const items = open.map(r => `<li>${chip(r)}<span>${esc(r.description || 'No description')}${r.treatment ? `<span class="next"><b>Next:</b> ${esc(r.treatment)}${r.target ? ` By ${esc(r.target)}.` : ''}</span>` : ''}</span></li>`)
      .concat(built.unlinked.map(u => `<li><span class="score-chip none">No linked risk</span><span>${esc(u.ref)} ${esc(u.what)}<span class="next">${esc(u.why)}. Flagged on the map but nothing in the risk register points at it, so the report stays in draft. Add a risk in step 5 and link this ${u.type === 'flow' ? 'flow' : 'row'}, or correct the inventory.</span></span></li>`));
    $('mapAttention').innerHTML = `<h3>What needs attention</h3><p class="help">Tags on the map are risk register references. This list is the key, highest rated first.</p><ul>${items.join('') || '<li><span class="muted">Nothing flagged.</span></li>'}</ul>`;
  }

  /* ---- Metadata, dashboard, completeness checks -------------------------- */
  function collectMeta() { document.querySelectorAll('.meta').forEach(el => state.meta[el.id] = el.value); }
  function hydrateMeta() { document.querySelectorAll('.meta').forEach(el => { el.value = state.meta[el.id] != null ? state.meta[el.id] : ''; }); }

  function updateDashboard(opts = {}) {
    if (!opts.keepClean) state.dirty = true;
    collectMeta();
    const S = SRAReport.stats(state);
    const pct = Math.round(S.reviewed / S.total * 100);
    $('completeMetric').textContent = pct + '%';
    $('answeredMetric').textContent = `${S.reviewed} / ${S.total}`;
    $('openRiskMetric').textContent = S.risks.length;
    $('evidenceMetric').textContent = S.evidence;
    ['controlProgress', 'mobileProgress', 'sideProgress'].forEach(id => $(id).style.width = pct + '%');
    $('progressLabel').textContent = `${S.reviewed} of ${S.total} reviewed`;
    $('sideProgressLabel').textContent = `${S.reviewed} of ${S.total}`;
    $('scoreSummary').textContent = S.score == null ? 'Not scored' : S.score + '%';
    $('metSummary').textContent = S.met + S.alt;
    $('gapSummary').textContent = S.partial + S.notMet;
    $('highSummary').textContent = S.high;
    $('gapCount').textContent = S.partial + S.notMet ? ` ${S.partial + S.notMet}` : '';
    $('unreviewedCount').textContent = S.total - S.reviewed ? ` ${S.total - S.reviewed}` : '';
    $('carriedCount').textContent = S.carried ? ` ${S.carried}` : '';
    renderMap(S);
    $('filters').querySelector('[data-filter="carried"]').hidden = !S.carried && activeFilter !== 'carried';

    $('readinessList').innerHTML = S.checks.map(c => `<li class="${c.ok ? 'ok' : 'todo'}"><span class="mark" aria-hidden="true">${c.ok ? '&#10003;' : '&#8226;'}</span><span>${esc(c.label)}<span class="sr-only">: ${c.ok ? 'complete' : 'open'}</span></span></li>`).join('');
    const badge = $('readinessBadge');
    badge.textContent = S.missing.length ? `${S.checks.length - S.missing.length} of ${S.checks.length} checks passed` : (S.isDraft ? 'Checks passed, status Draft' : 'Final');
    badge.classList.toggle('ready', !S.missing.length);
    const notice = $('readinessNotice');
    notice.className = 'notice ' + (S.missing.length ? 'warn' : 'ok');
    notice.innerHTML = S.missing.length
      ? `<strong>Draft:</strong> the report prints with a DRAFT watermark until the ${S.missing.length} open ${S.missing.length === 1 ? 'check is' : 'checks are'} complete. ${state.meta.reportStatus === 'Final' ? 'The report status is set to Final but will print as Draft until then.' : ''}`
      : `<strong>Completeness checks passed.</strong> ${S.isDraft ? 'The report still prints as Draft until you set the report status to Final below.' : 'The report prints as Final without a watermark.'} These checks test whether fields are filled in, not whether the analysis is accurate or thorough. Review the report before approval.`;

    const ok = key => S.checks.find(c => c.key === key)?.ok;
    const dots = {
      profile: ok('profile') ? 'done' : (state.meta.orgName ? 'partial' : ''),
      inventory: ok('inventory') && ok('flows') ? 'done' : (state.assets.length ? 'partial' : ''),
      map: state.assets.length ? (ok('linked') && ok('inventory') ? 'done' : 'partial') : '',
      controls: S.reviewed === S.total ? 'done' : (S.reviewed ? 'partial' : ''),
      risks: ok('risksExist') && ok('risks') ? 'done' : (S.risks.length ? 'partial' : ''),
      attestation: ok('approval') ? 'done' : '',
      report: S.missing.length ? (S.missing.length < S.checks.length ? 'partial' : '') : 'done'
    };
    Object.entries(dots).forEach(([k, v]) => { const d = document.querySelector(`[data-dot="${k}"]`); if (d) d.className = 'dot ' + v; });
  }

  /* ---- Report ------------------------------------------------------------ */
  function renderReportView() {
    collectMeta();
    $('reportView').innerHTML = SRAReport.render(state, SRAReport.stats(state));
  }
  function showReport() {
    renderReportView();
    reportMode = true;
    document.body.classList.add('report-mode');
    $('workspace').hidden = true;
    $('reportMain').hidden = false;
    $('previewBtn').innerHTML = '<span class="label">Edit assessment</span>';
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  function hideReport() {
    reportMode = false;
    document.body.classList.remove('report-mode');
    $('workspace').hidden = false;
    $('reportMain').hidden = true;
    $('previewBtn').innerHTML = '<span class="label">Preview report</span>';
  }
  let savedTitle = document.title;
  function preparePrint() {
    renderReportView();
    $('reportMain').hidden = false;
    savedTitle = document.title;
    const org = (state.meta.orgName || '').trim();
    document.title = `${org ? org + ' - ' : ''}HIPAA Security Rule risk analysis${state.meta.assessmentDate ? ' - ' + state.meta.assessmentDate : ''}`;
  }
  function finishPrint() {
    document.title = savedTitle;
    if (!reportMode) $('reportMain').hidden = true;
  }
  function printReport() {
    preparePrint();
    window.print();
  }
  window.addEventListener('beforeprint', preparePrint);
  window.addEventListener('afterprint', finishPrint);

  /* ---- Save / open ------------------------------------------------------- */
  function exportAssessment(includeEvidence = true) {
    collectMeta();
    state.savedAt = new Date().toISOString();
    const payload = SRAFormat.serialize(state, { includeEvidence });
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'), url = URL.createObjectURL(blob);
    const slug = (state.meta.orgName || 'organization').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
    a.href = url;
    a.download = `${slug}-hipaa-sra-${state.meta.assessmentDate || 'draft'}${includeEvidence ? '' : '-no-evidence'}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 500);
    const embedded = Object.values(state.controls).some(c => (c.evidence || []).some(e => e.data));
    state.dirty = !includeEvidence && embedded;
    $('saveStatus').textContent = includeEvidence
      ? `Assessment file created ${new Date(state.savedAt).toLocaleString()}. Changes made after this are not saved until you save again.`
      : `Assessment file without evidence created ${new Date(state.savedAt).toLocaleString()}.${embedded ? ' The attached evidence is only in this tab until you save the full file.' : ''}`;
  }

  async function importAssessment(file) {
    try {
      const data = JSON.parse(await file.text());
      const up = SRAFormat.upgrade(data);
      state.meta = up.meta; state.assets = up.assets; state.flows = up.flows; state.controls = up.controls; state.risks = up.risks; state.savedAt = up.savedAt;
      activeFilter = 'all';
      document.querySelectorAll('.filter').forEach(x => x.classList.toggle('active', x.dataset.filter === 'all'));
      hydrateMeta();
      renderAssets(); renderFlows(); renderControls(); renderRisks(); updateDashboard({ keepClean: true });
      state.dirty = false;
      if (reportMode) renderReportView();
      const note = up.version < 4 ? ` This version ${up.version} file was read into format version ${FILE_FORMAT.version}. ${up.carried.length} answer${up.carried.length === 1 ? '' : 's'} carried over on rows that changed and marked for review; saving writes version ${FILE_FORMAT.version}.` : '';
      $('saveStatus').textContent = `Opened ${file.name}. Changes remain in memory until saved.${note}`;
    } catch (err) {
      $('saveStatus').textContent = 'Could not open that file. Choose a valid SaberGuard assessment JSON file.';
    }
  }

  /* ---- Wiring ------------------------------------------------------------ */
  document.querySelectorAll('.meta').forEach(el => {
    const h = () => { updateDashboard(); if (['entityType', 'clearinghouse', 'groupHealthPlan'].includes(el.id)) renderControls(); };
    el.addEventListener('input', h); el.addEventListener('change', h);
  });
  $('filters').onclick = e => {
    const b = e.target.closest('[data-filter]');
    if (!b) return;
    activeFilter = b.dataset.filter;
    document.querySelectorAll('.filter').forEach(x => x.classList.toggle('active', x === b));
    renderControls();
  };
  $('addAsset').onclick = () => addAsset();
  $('addFlow').onclick = () => addFlow();
  $('addRisk').onclick = () => addRisk();
  const pick = $('scenarioPick');
  RISK_SCENARIOS.forEach((t, i) => { const o = document.createElement('option'); o.value = i; o.textContent = t.text.length > 90 ? t.text.slice(0, 88) + '...' : t.text; pick.appendChild(o); });
  pick.onchange = () => { const t = RISK_SCENARIOS[pick.value]; if (t) addRisk({ description: t.text, controlIds: SRAFormat.parseIds(t.controls) }); pick.value = ''; };
  ['exportBtn', 'exportBtn2'].forEach(id => $(id).onclick = () => exportAssessment(true));
  $('exportNoEvidenceBtn').onclick = () => exportAssessment(false);
  $('importBtn').onclick = () => $('importFile').click();
  $('importFile').onchange = e => { if (e.target.files[0]) importAssessment(e.target.files[0]); e.target.value = ''; };
  ['printBtn', 'printBtn2', 'printBtn3'].forEach(id => $(id).onclick = printReport);
  $('previewBtn').onclick = () => reportMode ? hideReport() : showReport();
  $('previewBtn2').onclick = showReport;
  $('backBtn').onclick = hideReport;
  $('brandLink').onclick = e => { if (reportMode) { e.preventDefault(); hideReport(); } };
  document.querySelectorAll('.nav a').forEach(a => a.addEventListener('click', () => { if (reportMode) hideReport(); }));

  if ('IntersectionObserver' in window) {
    const links = [...document.querySelectorAll('.nav a[data-nav]')];
    const io = new IntersectionObserver(entries => {
      entries.forEach(en => { if (en.isIntersecting) links.forEach(l => l.classList.toggle('active', l.dataset.nav === en.target.id)); });
    }, { rootMargin: '-30% 0px -60% 0px' });
    links.forEach(l => { const t = document.getElementById(l.dataset.nav); if (t) io.observe(t); });
  }

  window.addEventListener('beforeunload', e => {
    if (state.dirty) { e.preventDefault(); e.returnValue = ''; }
  });

  /* ---- Init -------------------------------------------------------------- */
  $('assessmentDate').value = localToday();
  renderAssets(); renderFlows(); renderControls(); renderRisks(); updateDashboard({ keepClean: true });

  /* Exposed for testing and for automation hooks (for example loading a sample file). */
  window.SRA = { state, importAssessment, exportAssessment, renderReportView, showReport, hideReport, updateDashboard, addAsset, addFlow, addRisk, renderAll() { hydrateMeta(); renderAssets(); renderFlows(); renderControls(); renderRisks(); updateDashboard(); } };
})();

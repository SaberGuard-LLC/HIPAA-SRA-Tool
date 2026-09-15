/* ============================================================================
   SaberGuard HIPAA SRA — workspace logic
   State lives in memory only. Nothing is persisted unless the assessor saves
   a JSON file or prints the report.
   ========================================================================== */
(function () {
  'use strict';

  const FORMAT = 'SaberGuard HIPAA SRA';
  const VERSION = 3;
  const MAX_FILE = 10 * 1024 * 1024;
  const MAX_TOTAL = 25 * 1024 * 1024;

  const state = { meta: {}, assets: [], controls: {}, risks: [], savedAt: null };
  let activeFilter = 'all';
  let reportMode = false;

  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  const formatBytes = n => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;
  const toDataUrl = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });

  function controlState(id) {
    const c = state.controls[id] || (state.controls[id] = {});
    if (typeof c.status !== 'string') c.status = '';
    if (typeof c.notes !== 'string') c.notes = '';
    if (typeof c.recommendation !== 'string') c.recommendation = '';
    if (!Array.isArray(c.evidence)) c.evidence = [];
    return c;
  }

  function normalizeRisk(r) {
    return {
      id: r.id || uid(),
      description: r.description || '',
      assets: r.assets || '',
      controls: r.controls || '',
      existing: r.existing || '',
      likelihood: Number(r.likelihood) || 3,
      impact: Number(r.impact) || 3,
      decision: DECISIONS.includes(r.decision) ? r.decision : 'Mitigate',
      owner: r.owner || '',
      target: r.target || '',
      treatment: r.treatment || '',
      status: RISK_STATUSES.includes(r.status) ? r.status : 'Open',
      residualLikelihood: r.residualLikelihood ? Number(r.residualLikelihood) : '',
      residualImpact: r.residualImpact ? Number(r.residualImpact) : ''
    };
  }

  /* ---- Safeguards -------------------------------------------------------- */
  function renderControls() {
    const wrap = $('controls');
    wrap.innerHTML = '';
    let last = '';
    const stats = SRAReport.stats(state);
    CONTROLS.forEach(c => {
      const s = controlState(c.id);
      if (activeFilter === 'gaps' && !['partial', 'not-met'].includes(s.status)) return;
      if (activeFilter === 'unreviewed' && s.status) return;
      if (!['all', 'gaps', 'unreviewed'].includes(activeFilter) && c.category !== activeFilter) return;
      if (c.category !== last) {
        const cat = stats.byCategory[c.category];
        const head = document.createElement('div');
        head.className = 'cat-head';
        head.innerHTML = `<h3>${esc(CATEGORIES[c.category].label)} <span class="muted">· ${esc(CATEGORIES[c.category].cite)}</span></h3><span>${cat.reviewed} of ${cat.total} reviewed · ${cat.partial + cat['not-met']} gap${cat.partial + cat['not-met'] === 1 ? '' : 's'}</span>`;
        wrap.appendChild(head);
        last = c.category;
      }
      const card = document.createElement('article');
      const tone = s.status === 'not-met' ? 'has-gap' : s.status === 'partial' ? 'is-partial' : s.status === 'met' ? 'is-met' : s.status === 'na' ? 'is-na' : '';
      card.className = `control-card ${tone}`;
      card.dataset.id = c.id;
      const hasDoc = s.notes || s.recommendation || s.evidence.length;
      card.innerHTML = `
        <div class="control-top">
          <div>
            <div class="control-id">${c.id} · §${esc(c.cite)} · <span class="type ${c.type === 'Required' ? 'required' : ''}">${esc(c.type)}</span></div>
            <h3>${esc(c.title)} <span>— ${esc(c.text)}</span></h3>
            <p class="explain">Assessor prompt: ${esc(c.prompt)}</p>
            <button class="toggle-detail no-print" type="button">${hasDoc ? 'Edit notes, recommendation & evidence' : 'Add notes, recommendation & evidence'} <span class="caret">&#9662;</span></button>
          </div>
          <div class="choices" role="radiogroup" aria-label="${esc(c.title)} status">
            ${Object.values(STATUSES).map(st => `<button type="button" class="choice ${s.status === st.key ? 'selected' : ''}" data-value="${st.key}" aria-pressed="${s.status === st.key}">${st.short}</button>`).join('')}
          </div>
        </div>
        <div class="control-detail">
          <div class="field"><label>Assessment notes / finding</label><small>What was verified, how, and where the evidence lives. For N/A, record the applicability basis.</small><textarea class="control-notes" placeholder="Reviewed the written policy (rev. 2025-03), sampled three access requests, and confirmed...">${esc(s.notes)}</textarea></div>
          <div class="field"><label>Recommendation / corrective action</label><small>Printed in the findings section when the safeguard is partial or not met.</small><textarea class="control-rec" placeholder="Implement..., assign an owner, and validate by...">${esc(s.recommendation)}</textarea></div>
          <div class="field full"><label>Supporting evidence</label>
            <div class="evidence-box"><input class="evidence-input no-print" type="file" multiple aria-label="Attach evidence files for ${esc(c.title)}">
              <div class="evidence-list">${s.evidence.length ? s.evidence.map((e, i) => `<div class="file"><span>${esc(e.name)} <span class="muted">(${formatBytes(e.size)})</span></span><button type="button" class="remove-evidence no-print" data-index="${i}" title="Remove file">Remove</button></div>`).join('') : '<span>No files attached. Files stay in memory until you save the assessment.</span>'}</div>
            </div>
          </div>
        </div>`;
      wrap.appendChild(card);
      if (hasDoc && activeFilter === 'gaps') card.classList.add('open');
      card.querySelector('.toggle-detail').onclick = () => card.classList.toggle('open');
      card.querySelectorAll('.choice').forEach(b => b.onclick = () => {
        s.status = s.status === b.dataset.value ? '' : b.dataset.value;
        const open = card.classList.contains('open');
        renderControls();
        if (open) wrap.querySelector(`[data-id="${c.id}"]`)?.classList.add('open');
        updateDashboard();
      });
      card.querySelector('.control-notes').oninput = e => { s.notes = e.target.value; updateDashboard(); };
      card.querySelector('.control-rec').oninput = e => { s.recommendation = e.target.value; updateDashboard(); };
      card.querySelectorAll('.remove-evidence').forEach(b => b.onclick = () => { s.evidence.splice(Number(b.dataset.index), 1); renderControls(); wrap.querySelector(`[data-id="${c.id}"]`)?.classList.add('open'); updateDashboard(); });
      card.querySelector('.evidence-input').onchange = async e => {
        const current = CONTROLS.reduce((n, x) => n + controlState(x.id).evidence.reduce((m, f) => m + f.size, 0), 0);
        let added = 0, rejected = 0;
        for (const file of e.target.files) {
          if (file.size > MAX_FILE || current + added + file.size > MAX_TOTAL) { rejected++; continue; }
          s.evidence.push({ name: file.name, type: file.type, size: file.size, data: await toDataUrl(file) });
          added += file.size;
        }
        if (rejected) $('saveStatus').textContent = `${rejected} file${rejected === 1 ? '' : 's'} not attached: limit is 10 MB per file and 25 MB per assessment.`;
        renderControls();
        wrap.querySelector(`[data-id="${c.id}"]`)?.classList.add('open');
        updateDashboard();
      };
    });
    if (!wrap.children.length) wrap.innerHTML = '<div class="empty">No safeguards match this filter.</div>';
  }

  /* ---- ePHI inventory ---------------------------------------------------- */
  function addAsset(a = {}) {
    state.assets.push({ id: uid(), name: '', data: '', owner: '', flow: '', protection: '', ...a });
    renderAssets();
    updateDashboard();
    const rows = $('assetRows').querySelectorAll('textarea');
    rows[rows.length - 5]?.focus();
  }
  function renderAssets() {
    const body = $('assetRows');
    body.innerHTML = '';
    $('assetEmpty').style.display = state.assets.length ? 'none' : 'block';
    state.assets.forEach((a, i) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td><textarea data-k="name" placeholder="EHR, email, laptops, clinic site…" aria-label="System or location">${esc(a.name)}</textarea></td><td><textarea data-k="data" placeholder="Data types and business purpose" aria-label="ePHI and purpose">${esc(a.data)}</textarea></td><td><textarea data-k="owner" placeholder="Internal owner and vendor" aria-label="Owner or vendor">${esc(a.owner)}</textarea></td><td><textarea data-k="flow" placeholder="Sources, destinations, interfaces" aria-label="Flow and connections">${esc(a.flow)}</textarea></td><td><textarea data-k="protection" placeholder="Encryption, access, backup, BAA…" aria-label="Protection and notes">${esc(a.protection)}</textarea></td><td class="no-print"><button class="btn danger small remove" type="button" title="Remove system">&times;</button></td>`;
      body.appendChild(tr);
      tr.querySelectorAll('[data-k]').forEach(el => el.oninput = e => { a[e.target.dataset.k] = e.target.value; updateDashboard(); });
      tr.querySelector('.remove').onclick = () => { state.assets.splice(i, 1); renderAssets(); updateDashboard(); };
    });
  }

  /* ---- Risk register ----------------------------------------------------- */
  function addRisk(r = {}) {
    state.risks.push(normalizeRisk(r));
    renderRisks();
    updateDashboard();
    const cards = $('riskRows').querySelectorAll('.risk-card');
    cards[cards.length - 1]?.querySelector('textarea')?.focus();
  }
  const scaleOptions = (scale, value, blank) => (blank ? `<option value="" ${value === '' || value == null ? 'selected' : ''}>—</option>` : '') + scale.map(([n, label]) => `<option value="${n}" ${Number(value) === n ? 'selected' : ''}>${n} · ${label}</option>`).join('');
  function renderRisks() {
    const wrap = $('riskRows');
    wrap.innerHTML = '';
    $('riskEmpty').style.display = state.risks.length ? 'none' : 'block';
    state.risks.forEach((r, i) => {
      const score = r.likelihood * r.impact, level = riskLevel(score);
      const rScore = r.residualLikelihood && r.residualImpact ? r.residualLikelihood * r.residualImpact : null;
      const rLevel = rScore ? riskLevel(rScore) : null;
      const card = document.createElement('article');
      card.className = `risk-card level-${level.key}`;
      card.innerHTML = `
        <div class="risk-head">
          <span class="risk-ref">R-${String(i + 1).padStart(2, '0')}</span>
          <span class="score-chip score-${level.key}">Inherent ${score} · ${level.label}</span>
          <span class="score-chip ${rLevel ? 'score-' + rLevel.key : 'score-na'}">Residual ${rScore ? `${rScore} · ${rLevel.label}` : 'not rated'}</span>
          <span class="spacer"></span>
          <button class="btn danger small remove no-print" type="button" title="Remove risk">Remove</button>
        </div>
        <div class="risk-grid">
          <div class="field full"><label>Risk statement</label><small>Threat, vulnerability, and the ePHI or process affected.</small><textarea data-k="description" placeholder="Phishing could compromise a clinician's email account, exposing ePHI in mailboxes because MFA is not enforced.">${esc(r.description)}</textarea></div>
          <div class="field span2"><label>Affected systems / ePHI</label><input class="input" data-k="assets" placeholder="Microsoft 365 mailboxes, EHR portal" value="${esc(r.assets)}"></div>
          <div class="field"><label>Related safeguards</label><input class="input" data-k="controls" placeholder="A19, T09" value="${esc(r.controls)}"></div>
          <div class="field"><label>Existing controls</label><input class="input" data-k="existing" placeholder="Spam filtering, annual training" value="${esc(r.existing)}"></div>
          <div class="field"><label>Likelihood</label><select data-k="likelihood">${scaleOptions(LIKELIHOOD, r.likelihood)}</select></div>
          <div class="field"><label>Impact</label><select data-k="impact">${scaleOptions(IMPACT, r.impact)}</select></div>
          <div class="field"><label>Treatment decision</label><select data-k="decision">${DECISIONS.map(d => `<option ${r.decision === d ? 'selected' : ''}>${d}</option>`).join('')}</select></div>
          <div class="field"><label>Status</label><select data-k="status">${RISK_STATUSES.map(d => `<option ${r.status === d ? 'selected' : ''}>${d}</option>`).join('')}</select></div>
          <div class="field"><label>Owner</label><input class="input" data-k="owner" placeholder="Name or role" value="${esc(r.owner)}"></div>
          <div class="field"><label>Target date</label><input class="input" data-k="target" type="date" value="${esc(r.target)}"></div>
          <div class="field"><label>Residual likelihood</label><select data-k="residualLikelihood">${scaleOptions(LIKELIHOOD, r.residualLikelihood, true)}</select></div>
          <div class="field"><label>Residual impact</label><select data-k="residualImpact">${scaleOptions(IMPACT, r.residualImpact, true)}</select></div>
          <div class="field full"><label>Remediation plan</label><small>Actions, milestones, compensating controls, and how completion will be validated.</small><textarea data-k="treatment" placeholder="Enforce MFA for all Microsoft 365 accounts by…; confirm via tenant report; retrain staff on…">${esc(r.treatment)}</textarea></div>
        </div>`;
      wrap.appendChild(card);
      card.querySelectorAll('[data-k]').forEach(el => el.oninput = e => {
        const k = e.target.dataset.k, v = e.target.value;
        r[k] = ['likelihood', 'impact', 'residualLikelihood', 'residualImpact'].includes(k) ? (v === '' ? '' : Number(v)) : v;
        if (['likelihood', 'impact', 'residualLikelihood', 'residualImpact', 'decision', 'status'].includes(k)) renderRisks();
        updateDashboard();
      });
      card.querySelector('.remove').onclick = () => { state.risks.splice(i, 1); renderRisks(); updateDashboard(); };
    });
  }

  /* ---- Metadata, dashboard, readiness ----------------------------------- */
  function collectMeta() { document.querySelectorAll('.meta').forEach(el => state.meta[el.id] = el.value); }
  function hydrateMeta() { document.querySelectorAll('.meta').forEach(el => { if (state.meta[el.id] != null) el.value = state.meta[el.id]; }); }

  function updateDashboard() {
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
    $('scoreSummary').textContent = S.score == null ? '–' : S.score + '%';
    $('metSummary').textContent = S.met;
    $('gapSummary').textContent = S.partial + S.notMet;
    $('highSummary').textContent = S.high;
    $('gapCount').textContent = S.partial + S.notMet ? ` ${S.partial + S.notMet}` : '';
    $('unreviewedCount').textContent = S.total - S.reviewed ? ` ${S.total - S.reviewed}` : '';

    $('readinessList').innerHTML = S.checks.map(c => `<li class="${c.ok ? 'ok' : 'todo'}"><span class="mark">${c.ok ? '✓' : '!'}</span><span>${esc(c.label)}</span></li>`).join('');
    const badge = $('readinessBadge');
    badge.textContent = S.missing.length ? `${S.checks.length - S.missing.length} of ${S.checks.length} checks passed` : 'Review ready';
    badge.classList.toggle('ready', !S.missing.length);
    const notice = $('readinessNotice');
    notice.className = 'notice ' + (S.missing.length ? 'warn' : 'ok');
    notice.innerHTML = S.missing.length
      ? `<strong>Draft:</strong> the report prints with a DRAFT watermark until the ${S.missing.length} open readiness ${S.missing.length === 1 ? 'check is' : 'checks are'} complete.`
      : '<strong>Readiness checks passed.</strong> The report prints without a draft watermark. Perform a final quality and scope review before approval.';

    const dots = {
      profile: S.checks[0].ok ? 'done' : (state.meta.orgName ? 'partial' : ''),
      inventory: S.checks[1].ok ? 'done' : (state.assets.length ? 'partial' : ''),
      controls: S.reviewed === S.total ? 'done' : (S.reviewed ? 'partial' : ''),
      risks: S.risks.length && S.checks[4].ok ? 'done' : (S.risks.length ? 'partial' : ''),
      attestation: S.checks[5].ok ? 'done' : (state.meta.executive || state.meta.signDate ? 'partial' : ''),
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
    $('previewBtn').textContent = '✎ Edit assessment';
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  function hideReport() {
    reportMode = false;
    document.body.classList.remove('report-mode');
    $('workspace').hidden = false;
    $('reportMain').hidden = true;
    $('previewBtn').innerHTML = '&#9636; <span class="label">Preview report</span>';
  }
  let savedTitle = document.title;
  function preparePrint() {
    renderReportView();
    $('reportMain').hidden = false;
    savedTitle = document.title;
    const org = (state.meta.orgName || '').trim();
    document.title = `${org ? org + ' - ' : ''}HIPAA Security Risk Assessment${state.meta.assessmentDate ? ' - ' + state.meta.assessmentDate : ''}`;
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
  function exportAssessment() {
    collectMeta();
    const payload = { format: FORMAT, version: VERSION, exportedAt: new Date().toISOString(), ...state };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'), url = URL.createObjectURL(blob);
    const slug = (state.meta.orgName || 'organization').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
    a.href = url;
    a.download = `${slug}-hipaa-sra-${state.meta.assessmentDate || 'draft'}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 500);
    state.savedAt = new Date().toISOString();
    $('saveStatus').textContent = `Local assessment file created ${new Date(state.savedAt).toLocaleString()}.`;
  }

  async function importAssessment(file) {
    try {
      const data = JSON.parse(await file.text());
      if (data.format !== FORMAT && !data.responses) throw new Error('format');
      state.meta = (data.meta && typeof data.meta === 'object') ? data.meta : {};
      state.assets = Array.isArray(data.assets) ? data.assets.map(a => ({ id: a.id || uid(), name: a.name || '', data: a.data || '', owner: a.owner || '', flow: a.flow || '', protection: a.protection || '' })) : [];
      state.controls = (data.controls && typeof data.controls === 'object') ? data.controls : {};
      if (data.responses) { /* version 1 layout */
        Object.entries(data.responses).forEach(([id, v]) => state.controls[id] = { status: v === 2 ? 'met' : v === 1 ? 'partial' : 'not-met', notes: data.notes?.[id] || '', recommendation: '', evidence: [] });
      }
      CONTROLS.forEach(c => controlState(c.id));
      state.risks = Array.isArray(data.risks) ? data.risks.map(normalizeRisk) : [];
      state.savedAt = data.savedAt || data.exportedAt || null;
      if (!state.meta.reportVersion) state.meta.reportVersion = '1.0';
      if (!state.meta.classification) state.meta.classification = 'Confidential';
      hydrateMeta();
      renderAssets(); renderControls(); renderRisks(); updateDashboard();
      if (reportMode) renderReportView();
      $('saveStatus').textContent = `Opened ${file.name}. Changes remain in memory until saved.`;
    } catch (err) {
      $('saveStatus').textContent = 'Could not open that file. Choose a valid SaberGuard assessment JSON file.';
    }
  }

  /* ---- Wiring ------------------------------------------------------------ */
  document.querySelectorAll('.meta').forEach(el => { el.addEventListener('input', updateDashboard); el.addEventListener('change', updateDashboard); });
  $('filters').onclick = e => {
    const b = e.target.closest('[data-filter]');
    if (!b) return;
    activeFilter = b.dataset.filter;
    document.querySelectorAll('.filter').forEach(x => x.classList.toggle('active', x === b));
    renderControls();
  };
  $('addAsset').onclick = () => addAsset();
  $('addRisk').onclick = () => addRisk();
  const pick = $('threatPick');
  THREATS.forEach((t, i) => { const o = document.createElement('option'); o.value = i; o.textContent = t.text.length > 90 ? t.text.slice(0, 88) + '…' : t.text; pick.appendChild(o); });
  pick.onchange = () => { const t = THREATS[pick.value]; if (t) addRisk({ description: t.text, controls: t.controls }); pick.value = ''; };
  ['exportBtn', 'exportBtn2'].forEach(id => $(id).onclick = exportAssessment);
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
    const hasWork = Object.entries(state.meta).some(([k, v]) => v && !['assessmentDate', 'reportVersion', 'classification', 'attestationText'].includes(k))
      || state.assets.length || Object.values(state.controls).some(x => x.status || x.notes || x.recommendation || x.evidence?.length) || state.risks.length;
    if (hasWork && !state.savedAt) { e.preventDefault(); e.returnValue = ''; }
  });

  /* ---- Init -------------------------------------------------------------- */
  $('assessmentDate').value = new Date().toISOString().slice(0, 10);
  renderAssets(); renderControls(); renderRisks(); updateDashboard();

  /* Exposed for testing and for automation hooks (e.g. loading a sample file). */
  window.SRA = { state, importAssessment, exportAssessment, renderReportView, showReport, hideReport, updateDashboard, renderAll() { hydrateMeta(); renderAssets(); renderControls(); renderRisks(); updateDashboard(); } };
})();

/* ============================================================================
   SaberGuard SRA Workspace: workspace logic
   State lives in memory only. Nothing is persisted unless the assessor saves
   a JSON file or prints the report.
   ========================================================================== */
(function () {
  'use strict';

  const MAX_FILE = 10 * 1024 * 1024;
  const MAX_TOTAL = 25 * 1024 * 1024;

  const state = { meta: {}, assets: [], flows: [], controls: {}, risks: [], interviews: [], savedAt: null, dirty: false, pristine: true, lastSavedAt: null };
  let reportMode = false;

  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad2 = n => String(n).padStart(2, '0');
  const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
  const formatBytes = n => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;
  const toDataUrl = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
  const rating = v => { const n = Number(v); return n >= 1 && n <= 5 ? n : ''; };
  const plural = (n, one, many) => `${n} ${n === 1 ? one : (many || one + 's')}`;
  const options = (list, value, blankLabel) => (blankLabel != null ? `<option value="" ${!value ? 'selected' : ''}>${esc(blankLabel)}</option>` : '') + list.map(([k, label]) => `<option value="${esc(k)}" ${value === k ? 'selected' : ''}>${esc(label)}</option>`).join('');
  const assetLabel = (a, i) => `${i + 1} · ${a.name.trim() || 'Unnamed row'}`;
  const assetName = id => { const i = state.assets.findIndex(a => a.id === id); return i < 0 ? 'Removed row' : assetLabel(state.assets[i], i); };
  const flowLabel = (f, i) => `F-${pad2(i + 1)} · ${assetName(f.from)} ${f.twoWay ? 'and' : 'to'} ${assetName(f.to)}`;
  const clip = (s, n) => { s = String(s || '').trim(); if (s.length <= n) return s; const cut = s.slice(0, n); return cut.slice(0, Math.max(cut.lastIndexOf(' '), n - 12)).replace(/[,;:.]$/, '') + '...'; };
  const isTyping = el => !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

  function controlState(id) {
    const c = state.controls[id] || (state.controls[id] = SRAFormat.newControl());
    if (typeof c.status !== 'string') c.status = '';
    if (typeof c.notes !== 'string') c.notes = '';
    if (typeof c.recommendation !== 'string') c.recommendation = '';
    if (typeof c.basis !== 'string') c.basis = '';
    if (!Array.isArray(c.evidence)) c.evidence = [];
    return c;
  }

  /* ---- Views and routing ------------------------------------------------- */
  const VIEWS = ['start', 'overview', 'profile', 'inventory', 'map', 'catalog', 'risks', 'attestation', 'report'];
  const STEP_NAMES = { overview: 'Overview', profile: 'Organization and scope', inventory: 'ePHI inventory', map: 'ePHI flow map', catalog: 'Catalog review', risks: 'Risk register', attestation: 'Summary and attestation', report: 'Report and checks' };
  let view = null;
  const stale = new Set(VIEWS);

  function parseHash() {
    const raw = decodeURIComponent((location.hash || '').replace(/^#/, ''));
    const [name, sub] = raw.split('/');
    return { name: VIEWS.includes(name) ? name : '', sub: sub || '' };
  }

  function route() {
    let { name, sub } = parseHash();
    if (!name) name = state.pristine ? 'start' : 'overview';
    if (name === 'start' && !state.pristine) name = 'overview';
    if (name !== 'start') state.pristine = false;
    if (reportMode) hideReport();
    if (name === 'catalog' && sub && CONTROL_BY_ID[sub.toUpperCase()]) selectedId = sub.toUpperCase();
    const changed = name !== view;
    showView(name);
    if (!changed && name === 'catalog') { renderCatalogDetail(); markCurrentItem(); renderCatalogFoot(); }
    if (name === 'inventory' && sub) {
      const target = document.querySelector(`[data-view="inventory"] [data-id="${CSS.escape(sub)}"]`);
      if (target) { target.scrollIntoView({ block: 'center' }); target.querySelector('input,select,textarea')?.focus({ preventScroll: true }); }
    }
  }

  function showView(name) {
    const changed = name !== view;
    view = name;
    document.querySelectorAll('[data-view]').forEach(el => { el.hidden = el.dataset.view !== name; });
    document.body.classList.toggle('on-start', name === 'start');
    $('layout').classList.toggle('rail-wide', name === 'overview');
    document.querySelectorAll('.steps a').forEach(a => { if (a.dataset.step === name) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    if (stale.has(name)) renderView(name);
    refresh();
    if (changed) {
      window.scrollTo(0, 0);
      const title = document.querySelector(`[data-view="${name}"] h1`);
      document.title = name === 'start' ? 'SaberGuard SRA Workspace' : `${title ? title.textContent : STEP_NAMES[name]} · SaberGuard SRA Workspace`;
      if (document.activeElement && document.activeElement !== document.body && !$('main').contains(document.activeElement) && !document.activeElement.closest('.rail, .topbar')) $('main').focus({ preventScroll: true });
    }
  }

  function navigate(name, sub) {
    const target = `#${name}${sub ? '/' + sub : ''}`;
    if (location.hash !== target) history.pushState(history.state, '', target);
    route();
  }

  function renderView(name) {
    stale.delete(name);
    const S = SRAReport.stats(state);
    if (name === 'overview') renderOverview(S);
    if (name === 'profile') { hydrateMeta(); renderInterviews(); }
    if (name === 'inventory') { renderAssets(); renderFlows(); }
    if (name === 'map') renderMap(S);
    if (name === 'catalog') renderCatalog(S);
    if (name === 'risks') renderRisks(S);
    if (name === 'attestation' || name === 'report') hydrateMeta();
    if (name === 'report') renderReadiness(S);
  }

  function invalidate(except) { VIEWS.forEach(v => { if (v !== except) stale.add(v); }); }

  /* ---- Catalog review ---------------------------------------------------- */
  const KEY_STATUS = ['met', 'partial', 'not-met', 'na', 'alt', 'doc'];
  const STATUS_CLASS = { met: 'st-met', alt: 'st-met', partial: 'st-partial', 'not-met': 'st-gap', na: 'st-na', doc: 'st-na', '': 'st-none' };
  let catFilter = 'all';
  let catQuery = '';
  let selectedId = CONTROLS[0].id;

  function catalogRows(S) {
    const q = catQuery.trim().toLowerCase();
    return CONTROLS.filter(c => {
      const s = controlState(c.id);
      const eff = S.controls.find(x => x.id === c.id);
      if (catFilter === 'gaps' && !['partial', 'not-met'].includes(eff.status)) return false;
      if (catFilter === 'unreviewed' && eff.status) return false;
      if (catFilter === 'carried' && !s.carried) return false;
      if (catFilter === 'noevidence' && s.evidence.length) return false;
      if (CATEGORIES[catFilter] && c.category !== catFilter) return false;
      if (q && ![c.id, c.cite, `45 cfr ${c.cite}`, c.title, c.regulation || '', c.summary || ''].some(t => String(t).toLowerCase().includes(q))) return false;
      return true;
    });
  }

  function statusPill(eff) {
    if (eff.carried) return '<span class="pill st-partial">Carried, review again</span>';
    return `<span class="pill ${STATUS_CLASS[eff.status || '']}">${esc(eff.status ? STATUSES[eff.status].label : 'Not reviewed')}</span>`;
  }

  function renderCatalogFilters(S) {
    const count = f => { const keep = catFilter; catFilter = f; const n = catalogRowsNoQuery(S).length; catFilter = keep; return n; };
    const chips = [['all', 'All'], ...Object.entries(CATEGORIES).map(([k, v]) => [k, v.short]), ['gaps', 'Gaps'], ['unreviewed', 'Not reviewed'], ['noevidence', 'No evidence']];
    if (S.carried || catFilter === 'carried') chips.push(['carried', 'Carried from version 3']);
    $('filters').innerHTML = chips.map(([k, label]) => `<button class="filter${catFilter === k ? ' active' : ''}" data-filter="${k}" type="button" aria-pressed="${catFilter === k}">${esc(label)} <span class="count">${count(k)}</span></button>`).join('');
  }
  function catalogRowsNoQuery(S) { const q = catQuery; catQuery = ''; const rows = catalogRows(S); catQuery = q; return rows; }

  function renderCatalog(S = SRAReport.stats(state)) {
    renderCatalogFilters(S);
    const rows = catalogRows(S);
    if (rows.length && !rows.some(c => c.id === selectedId)) selectedId = rows[0].id;
    const groups = {};
    rows.forEach(c => (groups[c.category] = groups[c.category] || []).push(c));
    $('catList').innerHTML = rows.length ? Object.entries(groups).map(([k, list]) => {
      const cat = S.byCategory[k];
      const gaps = cat.partial + cat['not-met'];
      return `<div class="cat-group"><h2>${esc(CATEGORIES[k].label)}<span>${plural(cat.total, 'row')} · ${plural(gaps, 'gap')}</span></h2><ul>${list.map(c => {
        const eff = S.controls.find(x => x.id === c.id);
        return `<li><a class="cat-item" href="#catalog/${c.id}" data-id="${c.id}"${c.id === selectedId ? ' aria-current="true"' : ''}><span class="ci-top"><span class="cid">${c.id}</span><span class="ctitle">${esc(c.title)}</span></span><span class="ci-bottom"><span class="cmeta">${esc(c.cite)} · ${esc(c.type)}</span>${statusPill(eff)}</span></a></li>`;
      }).join('')}</ul></div>`;
    }).join('') : '<div class="empty">No catalog rows match this filter.</div>';
    const pct = Math.round(S.reviewed / S.total * 100);
    $('controlProgress').style.width = pct + '%';
    $('progressLabel').textContent = `${S.reviewed} of ${S.total} reviewed`;
    renderCatalogDetail(S);
    renderCatalogFoot(S);
  }

  function refreshCatalogList(S) {
    renderCatalogFilters(S);
    document.querySelectorAll('#catList .cat-item').forEach(a => {
      const eff = S.controls.find(x => x.id === a.dataset.id);
      const pill = a.querySelector('.pill');
      if (pill) pill.outerHTML = statusPill(eff);
    });
    document.querySelectorAll('#catList .cat-group').forEach(g => {
      const first = g.querySelector('.cat-item');
      if (!first) return;
      const k = CONTROL_BY_ID[first.dataset.id].category, cat = S.byCategory[k];
      g.querySelector('h2 span').textContent = `${plural(cat.total, 'row')} · ${plural(cat.partial + cat['not-met'], 'gap')}`;
    });
    const pct = Math.round(S.reviewed / S.total * 100);
    $('controlProgress').style.width = pct + '%';
    $('progressLabel').textContent = `${S.reviewed} of ${S.total} reviewed`;
  }

  function markCurrentItem() {
    document.querySelectorAll('#catList .cat-item').forEach(a => { if (a.dataset.id === selectedId) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); });
    const cur = document.querySelector(`#catList .cat-item[data-id="${selectedId}"]`);
    if (cur) {
      const list = $('catList'), top = cur.offsetTop - list.offsetTop;
      if (top < list.scrollTop || top + cur.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = top - list.clientHeight / 3;
    }
  }

  function radioGroup(name, labelId, items, value, disabled) {
    const focusKey = items.some(i => i.key === value) ? value : items[0].key;
    return `<div class="radios" role="radiogroup" aria-labelledby="${labelId}" data-group="${name}">${items.map(i => `<button type="button" role="radio" class="radio ${i.cls || ''}" data-value="${esc(i.key)}" aria-checked="${i.key === value}" tabindex="${i.key === focusKey ? 0 : -1}"${disabled ? ' aria-disabled="true" disabled' : ''}>${esc(i.label)}</button>`).join('')}</div>`;
  }

  function renderCatalogDetail(S = SRAReport.stats(state)) {
    const box = $('catDetail');
    const c = CONTROL_BY_ID[selectedId];
    if (!c || !catalogRows(S).some(x => x.id === selectedId)) { box.innerHTML = '<p class="muted">Choose a row from the list.</p>'; return; }
    const s = controlState(c.id);
    const eff = S.controls.find(x => x.id === c.id);
    const derived = profileApplicability(state.meta);
    const duty = businessAssociateDuty(state.meta);
    const locked = !!derived[c.id];
    const parent = c.parent && CONTROL_BY_ID[c.parent];
    const linked = S.risks.filter(r => r.controlIds.includes(c.id));
    const unlinked = S.risks.filter(r => !r.controlIds.includes(c.id));
    const banners = [
      locked ? `<div class="banner derived">${esc(derived[c.id])} Change the entity profile in step 1 to review this row.</div>` : '',
      c.id === 'A29' && duty ? `<div class="banner duty">${esc(duty)}</div>` : '',
      s.carried ? `<div class="banner carried"><b>Carried from version 3, review again.</b> The citation or regulation text of this row changed after this answer was recorded${s.status ? ` (recorded answer: ${esc(STATUSES[s.status]?.label || s.status)})` : ''}. It counts as not reviewed until you confirm it or change it. <button type="button" class="btn small confirm-carried">Confirm answer</button></div>` : ''
    ].join('');
    const statusItems = statusesFor(c).sort((a, b) => KEY_STATUS.indexOf(a.key) - KEY_STATUS.indexOf(b.key)).map(st => ({ key: st.key, label: st.label, cls: STATUS_CLASS[st.key] }));
    box.innerHTML = `<article aria-labelledby="detailTitle">
      <div class="d-meta"><span class="cid">${c.id}</span><span>45 CFR ${esc(c.cite)}</span><span class="pill ${c.type === 'Required' ? 'type-req' : 'type-addr'}">${esc(c.type)}</span>${parent ? `<span>Under ${esc(parent.title)}</span>` : ''}</div>
      <h2 id="detailTitle">${esc(c.title)}${c.titleBy ? ` <span class="muted">(${esc(c.titleBy)}'s label)</span>` : ''}</h2>
      <div class="reg-block"><div class="reg-label">Regulation text, as published</div>${c.regulation ? `<p class="reg">${esc(c.regulation)}</p>` : '<p class="reg pending">Regulation text pending confirmation against the official text.</p>'}</div>
      <p class="summary"><span class="lbl">SaberGuard's summary:</span> ${esc(c.summary)}</p>
      <p class="ask"><span class="lbl">Ask about:</span> ${esc(c.prompt)}</p>
      ${banners}
      <div class="d-field"><div class="d-label" id="statusLabel">Status</div>${radioGroup('status', 'statusLabel', statusItems, s.status, locked)}${s.status && !locked ? '<button type="button" class="btn small ghost clear-status">Clear status</button>' : ''}</div>
      <div class="d-field"><div class="d-label" id="basisLabel">Verification basis</div>${radioGroup('basis', 'basisLabel', BASIS.map(([k, label]) => ({ key: k, label })), s.basis, locked)}</div>
      <div class="d-two">
        <div class="field"><label for="dNotes">Assessment notes and finding</label><small>What was verified, how, and where the evidence lives. For Not applicable, Alternative measure in place, or Not implemented, decision documented, record the organization's reason.</small><textarea id="dNotes" class="control-notes" placeholder="Reviewed the written policy (rev. 2025-03), sampled three access requests, and confirmed...">${esc(s.notes)}</textarea></div>
        <div class="field"><label for="dRec">Recommendation and corrective action</label><small>Printed in the findings section when the row is partially met or not met.</small><textarea id="dRec" class="control-rec" placeholder="Implement..., assign an owner, and validate by...">${esc(s.recommendation)}</textarea></div>
      </div>
      <div class="d-field"><div class="d-label" id="linkedLabel">Linked risks</div><div class="risk-pills">${linked.length ? linked.map(r => `<a class="pill ${r.level ? 'score-' + r.level.key : 'score-na'}" href="#risks" data-risk="${esc(r.id)}">${r.ref}${r.level ? ' · ' + r.level.label : ' · not rated'}</a>`).join('') : '<span class="muted">None linked</span>'}</div>
        ${unlinked.length ? `<label class="sr-only" for="linkRisk">Link a risk to ${esc(c.id)}</label><select id="linkRisk" class="link-risk"><option value="">Link a risk</option>${unlinked.map(r => `<option value="${esc(r.id)}">${esc(r.ref)} · ${esc(clip(r.threat || r.description || 'No description', 70))}</option>`).join('')}</select>` : ''}
        <button type="button" class="btn small new-risk">New risk for this row</button></div>
      <div class="d-field"><div class="d-label">Evidence</div><p class="warn-text small">Do not attach files that show patient identifiers. Redact names, dates of birth, record numbers, and similar identifiers before attaching. Attached files are embedded in the saved assessment file unless you save without evidence.</p>
        <div class="evidence-box"><input class="evidence-input" type="file" multiple aria-label="Attach evidence files for ${esc(c.title)}"><div class="evidence-list">${evidenceTable(s, c.title)}</div></div></div>
    </article>`;
    wireDetail(c, s, eff, locked);
  }

  function wireDetail(c, s, eff, locked) {
    const box = $('catDetail');
    box.querySelectorAll('.radios').forEach(group => {
      const name = group.dataset.group;
      const radios = [...group.querySelectorAll('[role="radio"]')];
      const choose = (btn, focus) => {
        if (locked) return;
        const v = btn.dataset.value;
        if (name === 'status') setStatus(c.id, v, focus);
        else { s.basis = v; afterDetailChange(focus ? `[data-group="basis"] [data-value="${v}"]` : null); }
      };
      radios.forEach((btn, i) => {
        btn.onclick = () => choose(btn, true);
        btn.onkeydown = e => {
          const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
          if (step) { e.preventDefault(); choose(radios[(i + step + radios.length) % radios.length], true); }
          else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); choose(radios[e.key === 'Home' ? 0 : radios.length - 1], true); }
        };
      });
    });
    box.querySelector('.clear-status')?.addEventListener('click', () => { s.status = ''; delete s.carried; afterDetailChange('[data-group="status"] [role="radio"]'); });
    box.querySelector('.confirm-carried')?.addEventListener('click', () => { delete s.carried; afterDetailChange('[data-group="status"] [aria-checked="true"]'); });
    $('dNotes').oninput = e => { s.notes = e.target.value; updateDashboard(); };
    $('dRec').oninput = e => { s.recommendation = e.target.value; updateDashboard(); };
    box.querySelectorAll('[data-risk]').forEach(a => a.onclick = () => { openRiskId = a.dataset.risk; });
    const link = box.querySelector('.link-risk');
    if (link) link.onchange = () => { const r = state.risks.find(x => x.id === link.value); if (r && !r.controlIds.includes(c.id)) r.controlIds.push(c.id); afterDetailChange('#linkRisk'); };
    box.querySelector('.new-risk').onclick = () => { const r = SRAFormat.newRisk({ controlIds: [c.id] }); state.risks.push(r); openRiskId = r.id; riskFilter = 'all'; updateDashboard(); navigate('risks'); };
    box.querySelectorAll('.remove-evidence').forEach(b => b.onclick = () => { s.evidence.splice(Number(b.dataset.index), 1); afterDetailChange('.evidence-input'); });
    box.querySelector('.evidence-input').onchange = async e => {
      const current = CONTROLS.reduce((n, x) => n + controlState(x.id).evidence.reduce((m, f) => m + f.size, 0), 0);
      let added = 0, rejected = 0;
      for (const file of e.target.files) {
        if (file.size > MAX_FILE || current + added + file.size > MAX_TOTAL) { rejected++; continue; }
        s.evidence.push(await evidenceFrom(file));
        added += file.size;
      }
      if (rejected) $('wardStatus').textContent = `${plural(rejected, 'file')} not attached: the limit is 10 MB per file and 25 MB per assessment.`;
      afterDetailChange('.evidence-input');
    };
  }

  function afterDetailChange(focusSelector) {
    updateDashboard();
    const S = SRAReport.stats(state);
    renderCatalogDetail(S);
    if (focusSelector) $('catDetail').querySelector(focusSelector)?.focus();
  }

  function setStatus(id, value, focus) {
    const c = CONTROL_BY_ID[id];
    if (!c || profileApplicability(state.meta)[id]) return;
    if (!statusesFor(c).some(st => st.key === value)) return;
    const s = controlState(id);
    s.status = value;
    delete s.carried;
    afterDetailChange(focus ? `[data-group="status"] [data-value="${value}"]` : null);
  }

  function moveSelection(step) {
    const rows = catalogRows(SRAReport.stats(state));
    if (!rows.length) return;
    const i = rows.findIndex(c => c.id === selectedId);
    const next = rows[Math.min(rows.length - 1, Math.max(0, (i < 0 ? 0 : i + step)))];
    selectRow(next.id);
  }

  function selectRow(id) {
    selectedId = id;
    history.replaceState(history.state, '', `#catalog/${id}`);
    renderCatalogDetail();
    markCurrentItem();
    renderCatalogFoot();
  }

  function renderCatalogFoot(S = SRAReport.stats(state)) {
    const rows = catalogRows(S);
    const i = rows.findIndex(c => c.id === selectedId);
    const prev = i > 0 ? rows[i - 1] : null, next = i >= 0 && i < rows.length - 1 ? rows[i + 1] : null;
    $('catFoot').innerHTML = `<button class="btn" type="button" data-go="${prev ? prev.id : ''}" ${prev ? '' : 'disabled'}>${prev ? `Previous: ${prev.id} ${esc(prev.title)}` : 'Previous'}</button>
      <span class="hint">J and K move between rows, 1 to 6 set the status, / searches. <button class="linklike" type="button" id="keysBtn">Keyboard shortcuts</button></span>
      <button class="btn" type="button" data-go="${next ? next.id : ''}" ${next ? '' : 'disabled'}>${next ? `Next: ${next.id} ${esc(next.title)}` : 'Next'}</button>`;
    $('catFoot').querySelectorAll('[data-go]').forEach(b => b.onclick = () => { if (b.dataset.go) selectRow(b.dataset.go); });
    $('keysBtn').onclick = () => $('keysDialog').showModal();
  }

  /* ---- Evidence ---------------------------------------------------------- */
  const sourceLabel = e => e.source === 'ward' ? 'Ward' : e.source === 'upload' ? 'Upload' : '<span class="muted">Not recorded</span>';
  function hashCell(e) {
    if (!e.sha256) return '<span class="muted">Not recorded</span>';
    return `<span class="hash"><span aria-hidden="true">${esc(SRAIntegrity.shortHash(e.sha256))}</span><span class="sr-only">SHA-256 ${esc(e.sha256)}</span></span>${e.mismatch ? ' <span class="chip-gap">Does not match the embedded file</span>' : ''}`;
  }
  function evidenceTable(s, title) {
    if (!s.evidence.length) return '<p class="evidence-none">No files attached. Files stay in memory until you save the assessment.</p>';
    return `<div class="table-scroll"><table class="evidence-table"><caption class="sr-only">Evidence for ${esc(title)}</caption><thead><tr><th scope="col">File</th><th scope="col">Size</th><th scope="col">Source</th><th scope="col">SHA-256</th><th scope="col">Added</th><th scope="col" class="no-print"><span class="sr-only">Remove</span></th></tr></thead><tbody>${s.evidence.map((e, i) => `<tr><td>${esc(e.name)}${e.omitted ? '<span class="muted"> · not embedded in the opened file</span>' : ''}</td><td class="nowrap">${formatBytes(e.size)}</td><td>${sourceLabel(e)}</td><td>${hashCell(e)}</td><td class="nowrap">${e.addedAt ? esc(e.addedAt) : '<span class="muted">Not recorded</span>'}</td><td class="no-print"><button type="button" class="btn small danger remove-evidence" data-index="${i}" aria-label="Remove ${esc(e.name)}">Remove</button></td></tr>`).join('')}</tbody></table></div>`;
  }
  async function evidenceFrom(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const sha256 = await SRAIntegrity.sha256File(bytes);
    return { name: file.name, type: file.type, size: file.size, data: `data:${file.type || 'application/octet-stream'};base64,${SRAIntegrity.toBase64(bytes)}`, sha256, addedAt: localToday(), source: 'upload' };
  }

  /* ---- ePHI inventory ---------------------------------------------------- */
  function addAsset(a = {}) {
    state.assets.push(SRAFormat.newAsset(a));
    renderAssets(); renderFlows();
    updateDashboard();
    const cards = $('assetRows').querySelectorAll('.asset-card');
    cards[cards.length - 1]?.querySelector('input')?.focus();
  }
  function renderAssets() {
    const wrap = $('assetRows');
    wrap.innerHTML = '';
    $('assetEmpty').hidden = state.assets.length > 0;
    state.assets.forEach((a, i) => {
      const card = document.createElement('article');
      const unclassified = a.kind === 'unknown' || a.zone === 'unknown';
      card.className = `asset-card ${unclassified ? 'is-unclassified' : ''}`;
      card.dataset.id = a.id;
      card.setAttribute('aria-label', `Inventory row ${i + 1}`);
      card.innerHTML = `
        <div class="asset-head"><span class="asset-ref">${i + 1}</span><span class="asset-title">${esc(a.name.trim() || 'Unnamed row')}</span>${unclassified ? '<span class="chip-gap">Unclassified: set kind and zone</span>' : ''}<span class="spacer"></span><button class="btn danger small remove no-print" type="button" aria-label="Remove row ${i + 1}">Remove</button></div>
        <div class="asset-grid">
          <div class="field span2"><label for="a-name-${i}">System, location, person, or party</label><input class="input" id="a-name-${i}" data-k="name" placeholder="EHR and patient portal, therapist laptop, clients, billing contractor" value="${esc(a.name)}"></div>
          <div class="field"><label for="a-kind-${i}">Kind</label><select id="a-kind-${i}" data-k="kind">${options(INVENTORY.kind, a.kind)}</select></div>
          <div class="field"><label for="a-zone-${i}">Zone</label><select id="a-zone-${i}" data-k="zone">${options(INVENTORY.zone, a.zone)}</select></div>
          <div class="field span2"><label for="a-data-${i}">ePHI held or handled</label><textarea id="a-data-${i}" data-k="data" placeholder="Data types and purpose">${esc(a.data)}</textarea></div>
          <fieldset class="field span2 plain-set"><legend>Lifecycle</legend><small>What this row does with ePHI.</small><div class="checks">${INVENTORY.lifecycle.map(([k, label]) => `<label><input type="checkbox" data-life="${k}" ${a.lifecycle.includes(k) ? 'checked' : ''}> ${esc(label)}</label>`).join('')}</div></fieldset>
          <div class="field"><label for="a-owner-${i}">Owner</label><input class="input" id="a-owner-${i}" data-k="owner" placeholder="Internal owner" value="${esc(a.owner)}"></div>
          <div class="field"><label for="a-acc-${i}">Accountable person or role</label><input class="input" id="a-acc-${i}" data-k="accountable" placeholder="Practice owner" value="${esc(a.accountable)}"></div>
          <div class="field"><label for="a-vendor-${i}">Vendor</label><small>Leave empty when in-house.</small><input class="input" id="a-vendor-${i}" data-k="vendor" placeholder="EHR vendor" value="${esc(a.vendor)}"></div>
          <div class="field"><label for="a-baa-${i}">Business associate agreement</label><select id="a-baa-${i}" data-k="baa">${options(INVENTORY.baa, a.baa)}</select></div>
          <div class="field"><label for="a-loc-${i}">Location</label><select id="a-loc-${i}" data-k="location">${options(INVENTORY.location, a.location)}</select></div>
          <div class="field"><label for="a-rest-${i}">Encrypted at rest</label><select id="a-rest-${i}" data-k="atRest">${options(INVENTORY.yesNo, a.atRest)}</select></div>
          <div class="field"><label for="a-mfa-${i}">Multi-factor authentication</label><select id="a-mfa-${i}" data-k="mfa">${options(INVENTORY.yesNo, a.mfa)}</select></div>
          <div class="field"><label for="a-count-${i}">Count</label><small>How many of this row, for example 24 laptops.</small><input class="input" id="a-count-${i}" data-k="count" type="number" min="1" step="1" value="${a.count}"></div>
          <div class="field span2"><label for="a-prot-${i}">Protection and notes</label><textarea id="a-prot-${i}" data-k="protection" placeholder="Encryption, access, backup, agreements">${esc(a.protection)}</textarea></div>
          <div class="field span2"><label for="a-none-${i}">Why no risk applies</label><small>Leave empty when a risk in step 5 links this row. Otherwise explain why no reasonably anticipated threat applies, so the row counts as considered.</small><textarea id="a-none-${i}" data-k="noThreatNote" placeholder="Read-only reference copy, no ePHI stored">${esc(a.noThreatNote)}</textarea></div>
          ${a.flow ? `<div class="field span2"><label for="a-flow-${i}">Flow notes from version 3</label><small>Legacy text. Record the connections as data flows below.</small><textarea id="a-flow-${i}" data-k="flow">${esc(a.flow)}</textarea></div>` : ''}
        </div>`;
      wrap.appendChild(card);
      card.querySelectorAll('[data-k]').forEach(el => el.oninput = e => {
        const k = e.target.dataset.k, v = e.target.value;
        a[k] = k === 'count' ? Math.max(1, parseInt(v, 10) || 1) : v;
        if (k === 'name') { card.querySelector('.asset-title').textContent = a.name.trim() || 'Unnamed row'; }
        if (['kind', 'zone'].includes(k)) { renderAssets(); $('assetRows').querySelector(`[data-id="${a.id}"] [data-k="${k}"]`)?.focus(); }
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
        renderAssets(); renderFlows(); updateDashboard();
      };
    });
  }

  /* ---- Data flows -------------------------------------------------------- */
  function addFlow(f = {}) {
    state.flows.push(SRAFormat.newFlow(f));
    renderFlows();
    updateDashboard();
    const rows = $('flowRows').querySelectorAll('tr');
    rows[rows.length - 1]?.querySelector('select')?.focus();
  }
  function renderFlows() {
    const body = $('flowRows');
    body.innerHTML = '';
    $('flowEmpty').hidden = state.flows.length > 0;
    const assetOptions = sel => options(state.assets.map((a, i) => [a.id, assetLabel(a, i)]), sel, 'Choose a row');
    state.flows.forEach((f, i) => {
      const tr = document.createElement('tr');
      const bad = !f.from || !f.to || f.from === f.to || !state.assets.some(a => a.id === f.from) || !state.assets.some(a => a.id === f.to);
      tr.className = bad ? 'is-bad' : '';
      tr.dataset.id = f.id;
      const ref = `F-${pad2(i + 1)}`;
      tr.innerHTML = `<th class="ref" scope="row">${ref}</th>
        <td><select data-k="from" aria-label="${ref} from">${assetOptions(f.from)}</select></td>
        <td><select data-k="twoWay" aria-label="${ref} direction"><option value="" ${!f.twoWay ? 'selected' : ''}>One way</option><option value="1" ${f.twoWay ? 'selected' : ''}>Two way</option></select></td>
        <td><select data-k="to" aria-label="${ref} to">${assetOptions(f.to)}</select></td>
        <td><textarea data-k="data" placeholder="What ePHI moves" aria-label="${ref} ePHI carried">${esc(f.data)}</textarea></td>
        <td><select data-k="transport" aria-label="${ref} transport">${options(INVENTORY.transport, f.transport)}</select></td>
        <td><select data-k="inTransit" aria-label="${ref} encrypted in transit">${options(INVENTORY.yesNo, f.inTransit)}</select></td>
        <td><textarea data-k="notes" placeholder="Notes" aria-label="${ref} notes">${esc(f.notes)}</textarea></td>
        <td class="no-print"><button class="btn danger small remove" type="button" aria-label="Remove flow ${ref}">Remove</button></td>`;
      body.appendChild(tr);
      tr.querySelectorAll('[data-k]').forEach(el => el.onchange = el.oninput = e => {
        const k = e.target.dataset.k, v = e.target.value;
        if (k === 'twoWay') f.twoWay = v === '1'; else f[k] = v;
        if (k === 'transport' && ['direct-entry', 'removable-media'].includes(v) && f.inTransit === 'unknown') f.inTransit = 'n/a';
        if (['from', 'to', 'twoWay', 'transport'].includes(k) && e.type === 'change') { renderFlows(); $('flowRows').querySelector(`[data-id="${f.id}"] [data-k="${k}"]`)?.focus(); }
        updateDashboard();
      });
      tr.querySelector('.remove').onclick = () => {
        state.flows.splice(i, 1);
        state.risks.forEach(r => { r.flowIds = r.flowIds.filter(id => id !== f.id); });
        renderFlows(); updateDashboard();
      };
    });
  }

  /* ---- Interview and document log ---------------------------------------- */
  function addInterview(v = {}) {
    state.interviews.push(SRAFormat.newInterview(v));
    renderInterviews();
    updateDashboard();
    const rows = $('interviewRows').querySelectorAll('tr');
    rows[rows.length - 1]?.querySelector('input')?.focus();
  }
  function renderInterviews() {
    const body = $('interviewRows');
    body.innerHTML = '';
    $('interviewEmpty').hidden = state.interviews.length > 0;
    state.interviews.forEach((v, i) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td><input class="input" data-k="participant" aria-label="Participant ${i + 1}" placeholder="Name" value="${esc(v.participant)}"></td>
        <td><input class="input" data-k="role" aria-label="Role ${i + 1}" placeholder="Practice administrator" value="${esc(v.role)}"></td>
        <td><input class="input" data-k="date" type="date" aria-label="Date ${i + 1}" value="${esc(v.date)}"></td>
        <td><textarea data-k="topics" aria-label="Topics ${i + 1}" placeholder="Access control, backups">${esc(v.topics)}</textarea></td>
        <td><select data-k="method" aria-label="Method ${i + 1}">${options(INTERVIEW_METHODS, v.method)}</select></td>
        <td class="no-print"><button class="btn danger small remove" type="button" aria-label="Remove log entry ${i + 1}">Remove</button></td>`;
      body.appendChild(tr);
      tr.querySelectorAll('[data-k]').forEach(el => el.oninput = el.onchange = e => { v[e.target.dataset.k] = e.target.value; updateDashboard(); });
      tr.querySelector('.remove').onclick = () => { state.interviews.splice(i, 1); renderInterviews(); updateDashboard(); };
    });
  }

  /* ---- Risk register ----------------------------------------------------- */
  const RISK_FILTERS = [['all', 'All'], ['high', 'High'], ['open', 'Open'], ['progress', 'In progress'], ['late', 'Past target date'], ['accepted', 'Accepted']];
  let riskFilter = 'all';
  let openRiskId = null;
  let heatMode = 'inherent';
  const isLate = r => !!r.target && r.target < localToday() && r.status !== 'Closed';
  const riskMatches = (r, f) => f === 'all' || (f === 'high' && r.level?.key === 'high') || (f === 'open' && r.status === 'Open') || (f === 'progress' && r.status === 'In progress') || (f === 'late' && isLate(r)) || (f === 'accepted' && r.decision === 'Accept');
  const ratingText = (L, I, score, level) => score ? `${L} × ${I} = ${score} ${level.label}` : 'Not rated';

  function addRisk(r = {}) {
    const risk = SRAFormat.newRisk(r);
    state.risks.push(risk);
    openRiskId = risk.id;
    riskFilter = 'all';
    updateDashboard();
    renderRisks();
    $('riskRows').querySelector('.edit-row textarea')?.focus();
  }

  function renderRiskFilters(S) {
    $('riskFilters').innerHTML = RISK_FILTERS.map(([k, label]) => `<button class="filter${riskFilter === k ? ' active' : ''}" data-rfilter="${k}" type="button" aria-pressed="${riskFilter === k}">${esc(label)} <span class="count">${S.risks.filter(r => riskMatches(r, k)).length}</span></button>`).join('');
  }

  function riskRowHtml(r) {
    const affected = [...r.assetIds.map(id => { const i = state.assets.findIndex(a => a.id === id); return i < 0 ? '' : `#${i + 1}`; }), ...r.flowIds.map(id => { const i = state.flows.findIndex(f => f.id === id); return i < 0 ? '' : `F-${pad2(i + 1)}`; })].filter(Boolean);
    const lead = r.threat.trim() || r.description.trim() || 'No description';
    const open = r.id === openRiskId;
    return `<tr class="risk-row level-${r.level ? r.level.key : 'none'}${open ? ' is-open' : ''}" data-id="${esc(r.id)}">
      <th scope="row"><button class="row-open" type="button" aria-expanded="${open}" aria-controls="edit-${esc(r.id)}">${r.ref}</button></th>
      <td><div class="rt">${esc(lead)}</div><div class="rs">${r.vulnerability.trim() ? `Vulnerability: ${esc(r.vulnerability)}` : (r.threat.trim() ? '' : '<span class="warn-text">Split into threat and vulnerability</span>')}${affected.length ? `<span class="aff">Affects ${esc(affected.join(', '))}</span>` : ''}</div></td>
      <td><span class="pill ${r.level ? 'score-' + r.level.key : 'score-na'}">${esc(ratingText(r.L, r.I, r.score, r.level))}</span></td>
      <td>${esc(r.decision)}</td>
      <td>${r.owner.trim() ? esc(r.owner) : '<span class="muted">Unassigned</span>'}</td>
      <td class="nowrap">${r.target ? esc(r.target) : '<span class="muted">Not set</span>'}${isLate(r) ? '<br><span class="warn-text">Past target date</span>' : ''}</td>
      <td><span class="pill ${r.rLevel ? 'score-' + r.rLevel.key : 'score-na'}">${esc(ratingText(r.rL, r.rI, r.rScore, r.rLevel))}</span></td>
      <td>${esc(r.status)}</td>
    </tr>`;
  }

  function wireRowButtons() {
    $('riskRows').querySelectorAll('.row-open').forEach(b => b.onclick = () => {
      const id = b.closest('tr').dataset.id;
      openRiskId = openRiskId === id ? null : id;
      renderRisks();
      $('riskRows').querySelector(`tr[data-id="${CSS.escape(id)}"] .row-open`)?.focus();
    });
  }

  function renderRisks(S = SRAReport.stats(state)) {
    renderRiskFilters(S);
    const shown = S.risks.filter(r => riskMatches(r, riskFilter) || r.id === openRiskId);
    $('riskEmpty').hidden = state.risks.length > 0;
    $('riskTable').hidden = !state.risks.length;
    $('riskFilters').hidden = !state.risks.length;
    $('heatTitle').closest('.panel').hidden = !state.risks.length;
    $('riskRows').innerHTML = shown.map(r => riskRowHtml(r) + (r.id === openRiskId ? `<tr class="edit-row" id="edit-${esc(r.id)}"><td colspan="8"></td></tr>` : '')).join('')
      || '<tr><td colspan="8" class="muted">No risks match this filter.</td></tr>';
    wireRowButtons();
    const editRow = $('riskRows').querySelector('.edit-row td');
    if (editRow) {
      const i = state.risks.findIndex(r => r.id === openRiskId);
      if (i >= 0) editRow.appendChild(riskForm(state.risks[i], i));
    }
    renderHeat(S);
    renderCoverage(S);
  }

  function refreshRiskRow(r) {
    const S = SRAReport.stats(state);
    const sr = S.risks.find(x => x.id === r.id);
    const row = $('riskRows').querySelector(`tr.risk-row[data-id="${CSS.escape(r.id)}"]`);
    if (row && sr) row.outerHTML = riskRowHtml(sr);
    wireRowButtons();
    renderRiskFilters(S);
    renderHeat(S);
    renderCoverage(S);
  }

  const scaleOptions = (scale, value) => `<option value="" ${value === '' || value == null ? 'selected' : ''}>Not rated</option>` + scale.map(([n, label]) => `<option value="${n}" ${Number(value) === n ? 'selected' : ''}>${n} · ${label}</option>`).join('');
  function pickerHtml(key, selected, choices, addLabel, labelId, legacy, legacyLabel) {
    const label = id => choices.find(c => c[0] === id)?.[1] || id;
    const open = choices.filter(c => !selected.includes(c[0]));
    return `<div class="picker" data-pick="${key}" role="group" aria-labelledby="${labelId}">
      <div class="chips">${selected.map(id => `<span class="pick-chip">${esc(label(id))}<button type="button" class="pick-remove no-print" data-id="${esc(id)}" aria-label="Remove ${esc(label(id))}">&times;</button></span>`).join('') || '<span class="muted">None linked</span>'}</div>
      <select class="no-print" aria-label="${esc(addLabel)}"><option value="">${esc(addLabel)}</option>${open.map(([id, l]) => `<option value="${esc(id)}">${esc(l)}</option>`).join('')}</select>
      ${legacy ? `<div class="legacy"><b>${esc(legacyLabel)}:</b> ${esc(legacy)}</div>` : ''}
    </div>`;
  }

  function riskForm(r, i) {
    const assetChoices = state.assets.map((a, j) => [a.id, assetLabel(a, j)]);
    const flowChoices = state.flows.map((f, j) => [f.id, flowLabel(f, j)]);
    const controlChoices = CONTROLS.map(c => [c.id, `${c.id} · ${c.title}`]);
    const p = `r${i}`;
    const card = document.createElement('div');
    card.className = 'risk-card';
    card.innerHTML = `
      <div class="risk-head"><span class="risk-ref">R-${pad2(i + 1)}</span><span class="spacer"></span><button class="btn danger small remove no-print" type="button">Remove risk R-${pad2(i + 1)}</button></div>
      <div class="risk-grid">
        <div class="field full"><label for="${p}-desc">Risk statement</label><small>Threat, vulnerability, and the ePHI or process affected.</small><textarea id="${p}-desc" data-k="description" placeholder="Phishing could compromise a clinician's email account, exposing ePHI in mailboxes, because the account is protected by a password alone.">${esc(r.description)}</textarea>${r.description.trim() && !(r.threat.trim() && r.vulnerability.trim()) ? '<p class="split-prompt">Split into threat and vulnerability: name the threat source and event and the weakness it would exploit in the two fields below.</p>' : ''}</div>
        <div class="field span2"><label for="${p}-threat">Threat</label><small>The threat source and the event, for example an external attacker sending a phishing message.</small><textarea id="${p}-threat" data-k="threat" placeholder="External attacker (adversarial) sends a phishing message to a clinician">${esc(r.threat)}</textarea></div>
        <div class="field span2"><label for="${p}-vuln">Vulnerability</label><small>The weakness the threat would exploit.</small><textarea id="${p}-vuln" data-k="vulnerability" placeholder="Email accounts protected by a password alone">${esc(r.vulnerability)}</textarea></div>
        <fieldset class="field full cia"><legend>Affects</legend><div class="checks">${CIA.map(([k, label]) => `<label><input type="checkbox" data-cia="${k}" ${r.cia.includes(k) ? 'checked' : ''}> ${esc(label)}</label>`).join('')}</div></fieldset>
        <div class="field span2"><span class="label" id="${p}-al">Affected systems, people, or parties</span>${pickerHtml('assetIds', r.assetIds, assetChoices, state.assets.length ? 'Add an inventory row' : 'No inventory rows yet', `${p}-al`, r.legacyAssets, 'Version 3 text')}</div>
        <div class="field span2"><span class="label" id="${p}-fl">Affected data flows</span>${pickerHtml('flowIds', r.flowIds, flowChoices, state.flows.length ? 'Add a data flow' : 'No data flows yet', `${p}-fl`)}</div>
        <div class="field span2"><span class="label" id="${p}-cl">Related catalog rows</span>${pickerHtml('controlIds', r.controlIds, controlChoices, 'Add a catalog row', `${p}-cl`, r.legacyControls, 'Version 3 text')}</div>
        <div class="field span2"><label for="${p}-ex">Existing measures</label><input class="input" id="${p}-ex" data-k="existing" placeholder="Spam filtering, annual training" value="${esc(r.existing)}"></div>
        <div class="field"><label for="${p}-l">Likelihood</label><select id="${p}-l" data-k="likelihood">${scaleOptions(LIKELIHOOD, r.likelihood)}</select></div>
        <div class="field"><label for="${p}-i">Impact</label><select id="${p}-i" data-k="impact">${scaleOptions(IMPACT, r.impact)}</select></div>
        <div class="field"><label for="${p}-d">Treatment decision</label><select id="${p}-d" data-k="decision">${DECISIONS.map(d => `<option ${r.decision === d ? 'selected' : ''}>${d}</option>`).join('')}</select></div>
        <div class="field"><label for="${p}-s">Status</label><select id="${p}-s" data-k="status">${RISK_STATUSES.map(d => `<option ${r.status === d ? 'selected' : ''}>${d}</option>`).join('')}</select></div>
        <div class="field"><label for="${p}-o">Owner</label><input class="input" id="${p}-o" data-k="owner" placeholder="Name or role" value="${esc(r.owner)}"></div>
        <div class="field"><label for="${p}-t">Target date</label><input class="input" id="${p}-t" data-k="target" type="date" value="${esc(r.target)}"></div>
        <div class="field"><label for="${p}-rl">Residual likelihood</label><select id="${p}-rl" data-k="residualLikelihood">${scaleOptions(LIKELIHOOD, r.residualLikelihood)}</select></div>
        <div class="field"><label for="${p}-ri">Residual impact</label><select id="${p}-ri" data-k="residualImpact">${scaleOptions(IMPACT, r.residualImpact)}</select></div>
        <div class="field full"><label for="${p}-plan">Remediation plan</label><small>Actions, milestones, compensating measures, and how completion will be validated.</small><textarea id="${p}-plan" data-k="treatment" placeholder="Turn on multi-factor authentication for all Microsoft 365 accounts by...; confirm with the tenant report; retrain staff on...">${esc(r.treatment)}</textarea></div>
      </div>`;
    card.querySelectorAll('[data-k]').forEach(el => el.oninput = el.onchange = e => {
      const k = e.target.dataset.k, v = e.target.value;
      r[k] = ['likelihood', 'impact', 'residualLikelihood', 'residualImpact'].includes(k) ? rating(v) : v;
      if (['description', 'threat', 'vulnerability'].includes(k)) {
        const show = r.description.trim() && !(r.threat.trim() && r.vulnerability.trim());
        const prompt = card.querySelector('.split-prompt');
        if (!show && prompt) prompt.remove();
        if (show && !prompt) card.querySelector('[data-k="description"]').insertAdjacentHTML('afterend', '<p class="split-prompt">Split into threat and vulnerability: name the threat source and event and the weakness it would exploit in the two fields below.</p>');
      }
      updateDashboard();
      if (e.type === 'change' || !['description', 'threat', 'vulnerability', 'treatment', 'existing', 'owner'].includes(k)) refreshRiskRow(r);
    });
    card.querySelectorAll('[data-cia]').forEach(el => el.onchange = e => {
      const k = e.target.dataset.cia;
      r.cia = CIA.map(([x]) => x).filter(x => x === k ? e.target.checked : r.cia.includes(x));
      updateDashboard();
    });
    card.querySelectorAll('.picker').forEach(pk => {
      const key = pk.dataset.pick;
      pk.querySelector('select').onchange = e => { if (e.target.value && !r[key].includes(e.target.value)) r[key].push(e.target.value); updateDashboard(); renderRisks(); $('riskRows').querySelector(`.edit-row [data-pick="${key}"] select`)?.focus(); };
      pk.querySelectorAll('.pick-remove').forEach(b => b.onclick = () => { r[key] = r[key].filter(id => id !== b.dataset.id); updateDashboard(); renderRisks(); $('riskRows').querySelector(`.edit-row [data-pick="${key}"] select`)?.focus(); });
    });
    card.querySelector('.remove').onclick = () => {
      state.risks.splice(i, 1);
      openRiskId = null;
      updateDashboard();
      renderRisks();
      $('addRisk').focus();
    };
    return card;
  }

  function renderHeat(S) {
    const residual = heatMode === 'residual';
    const cells = {};
    const rated = S.risks.filter(r => residual ? r.rScore : r.score);
    rated.forEach(r => { const L = residual ? r.rL : r.L, I = residual ? r.rI : r.I; (cells[`${L}-${I}`] = cells[`${L}-${I}`] || []).push(r); });
    const list = rated.map(r => `${r.ref} likelihood ${residual ? r.rL : r.L}, impact ${residual ? r.rI : r.I}`).join('; ');
    const unrated = S.risks.length - rated.length;
    let html = `<div class="heat-fig" role="img" aria-label="${esc(`${residual ? 'Residual' : 'Inherent'} heat map. ${rated.length ? list : 'No rated risks'}.${unrated ? ` ${unrated} not rated.` : ''}`)}"><table class="heat" aria-hidden="true"><tbody>`;
    for (let I = 5; I >= 1; I--) {
      html += `<tr><th class="ax-i">${I}</th>`;
      for (let L = 1; L <= 5; L++) {
        const n = (cells[`${L}-${I}`] || []).length;
        const lvl = riskLevel(L * I).key;
        html += `<td class="hz-${lvl}${n ? ' has' : ''}">${n || ''}</td>`;
      }
      html += '</tr>';
    }
    html += `<tr><th></th>${LIKELIHOOD.map(([n]) => `<th class="ax-l">${n}</th>`).join('')}</tr></tbody></table>
      <p class="heat-cap" aria-hidden="true"><span>Across: likelihood, 1 rare to 5 almost certain. Up: impact, 1 negligible to 5 severe.</span> ${residual ? 'Residual ratings, after the planned treatment.' : 'Inherent ratings, before treatment.'}${unrated ? ` ${plural(unrated, 'risk')} not rated.` : ''}</p></div>`;
    $('heatMap').innerHTML = html;
    $('heatInherent').setAttribute('aria-pressed', String(!residual));
    $('heatResidual').setAttribute('aria-pressed', String(residual));
  }

  function coverageLink(x) {
    if (x.type === 'asset' || x.type === 'flow') return `<a href="#inventory/${esc(x.id)}">${esc(x.ref)} ${esc(x.what)}</a>`;
    if (x.type === 'control') return `<a href="#catalog/${esc(x.id)}">${esc(x.ref)} ${esc(x.what)}</a>`;
    return `<button type="button" class="linklike" data-open-risk="${esc(x.id)}">${esc(x.ref)} ${esc(clip(x.what, 80))}</button>`;
  }
  function renderCoverage(S) {
    const box = $('coverage');
    box.innerHTML = `<h2>Coverage</h2>${Object.entries(S.coverage).map(([k, f]) => `<details class="cov-item ${f.total && f.done < f.total ? 'has-gap' : ''}"><summary><b>${f.done} of ${f.total}</b> <span>${esc(SRAReport.COVERAGE_LABELS[k])}</span></summary>${f.missing.length ? `<ul>${f.missing.map(x => `<li>${coverageLink(x)}</li>`).join('')}</ul>` : '<p class="muted">Nothing missing.</p>'}</details>`).join('')}`;
    box.querySelectorAll('[data-open-risk]').forEach(b => b.onclick = () => { openRiskId = b.dataset.openRisk; riskFilter = 'all'; renderRisks(); $('riskRows').querySelector('.edit-row')?.scrollIntoView({ block: 'nearest' }); });
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
    const svg = SRAMap.toElement(built.tree);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `ePHI flow map of ${plural(built.facts.systems, 'inventory row')} and ${plural(built.facts.flows, 'data flow')}. The list under the map describes every flagged row and flow.`);
    box.appendChild(svg);
    $('mapLegend').innerHTML = SRAMap.legendHtml();
    const f = built.facts;
    const stat = (n, label, flag) => `<div class="${flag && n > 0 ? 'flag' : ''}"><b>${n}</b><span>${esc(label)}</span></div>`;
    $('mapFacts').innerHTML = stat(f.systems, 'systems, people and parties') + stat(f.flows, 'data flows') + stat(f.out, 'reach a vendor or outside party') + stat(f.weak, 'not encrypted or not checked in transit', true) + stat(f.noBaa, 'vendors without a confirmed BAA', true) + stat(f.unclassified, 'rows not yet classified', true);
    const open = [...S.risks].filter(r => r.status !== 'Closed').sort((a, b) => (b.score || 0) - (a.score || 0) || a.ref.localeCompare(b.ref));
    const chip = r => `<span class="score-chip ${r.level ? 'score-' + r.level.key : 'score-na'}">${r.ref}${r.level ? ' · ' + r.level.label : ' · not rated'}</span>`;
    const items = open.map(r => `<li>${chip(r)}<span>${esc(r.description || r.threat || 'No description')}${r.treatment ? `<span class="next"><b>Next:</b> ${esc(r.treatment)}${r.target ? ` By ${esc(r.target)}.` : ''}</span>` : ''}</span></li>`)
      .concat(built.unlinked.map(u => `<li><span class="score-chip none">No linked risk</span><span>${esc(u.ref)} ${esc(u.what)}<span class="next">${esc(u.why)}. Flagged on the map but nothing in the risk register points at it, so the report stays in draft. Add a risk in step 5 and link this ${u.type === 'flow' ? 'flow' : 'row'}, or correct the inventory.</span></span></li>`));
    $('mapAttention').innerHTML = `<h2>What needs attention</h2><p class="help">Tags on the map are risk register references. This list is the key, highest rated first.</p><ul>${items.join('') || '<li><span class="muted">Nothing flagged.</span></li>'}</ul>`;
  }

  /* ---- Overview ---------------------------------------------------------- */
  const CHECK_VIEW = { profile: 'profile', inventory: 'inventory', flows: 'inventory', linked: 'map', reviewed: 'catalog', basis: 'catalog', gapnotes: 'catalog', recs: 'catalog', risksExist: 'risks', risks: 'risks', approval: 'attestation' };
  const SEGMENTS = [['met', 'Met or alternative measure', t => t.met + t.alt], ['partial', 'Partially met', t => t.partial], ['gap', 'Not met', t => t['not-met']], ['na', 'Not applicable or decision documented', t => t.na + t.doc], ['none', 'Not reviewed', t => t.none]];

  function renderOverview(S) {
    const banner = $('readinessBanner');
    banner.className = `readiness ${S.missing.length ? 'is-open' : 'is-ok'}`;
    banner.innerHTML = S.missing.length
      ? `<h2>${plural(S.missing.length, 'completeness check is', 'completeness checks are')} open</h2><p>The report prints with a Draft watermark until they pass.</p><ul>${S.missing.map(c => `<li><a href="#${CHECK_VIEW[c.key] || 'report'}">${esc(c.label)}</a></li>`).join('')}</ul>`
      : `<h2>Every completeness check passes</h2><p>${S.isDraft ? 'Set the report status to Final in <a href="#report">step 7</a> before printing for signature.' : 'The report prints as Final.'} The checks test whether fields are filled in, not whether the analysis is accurate or thorough.</p>`;
    const items = S.controls.flatMap(c => c.evidence);
    const hashed = items.filter(e => e.sha256).length;
    const tile = (label, value, sub, href) => `<a class="tile" href="${href}"><span class="tl">${esc(label)}</span><b>${esc(value)}</b><span class="ts">${esc(sub)}</span></a>`;
    $('tiles').innerHTML = tile('Implementation score', S.score == null ? 'Not scored' : `${S.score}%`, 'A progress measure, not a compliance score', '#report')
      + tile('Catalog gaps', String(S.partial + S.notMet), `${S.partial} partially met, ${S.notMet} not met`, '#catalog')
      + tile('High risks', String(S.high), `${S.medium} medium, ${S.low} low${S.unrated ? `, ${S.unrated} not rated` : ''}`, '#risks')
      + tile('Evidence files', String(S.evidence), S.evidence ? (hashed === S.evidence ? 'SHA-256 recorded for every file' : `SHA-256 recorded for ${hashed} of ${S.evidence}`) : 'None attached yet', '#catalog');
    $('bars').innerHTML = Object.keys(CATEGORIES).map(k => {
      const t = S.byCategory[k];
      const parts = SEGMENTS.map(([cls, label, fn]) => ({ cls, label, n: fn(t) })).filter(p => p.n);
      const aria = `${CATEGORIES[k].label}, ${t.total} rows: ${parts.map(p => `${p.n} ${p.label.toLowerCase()}`).join(', ')}`;
      return `<div class="bar-row"><div class="bar-name">${esc(CATEGORIES[k].short)} <span>${esc(CATEGORIES[k].cite)}</span></div><div class="bar" role="img" aria-label="${esc(aria)}">${parts.map(p => `<span class="seg seg-${p.cls}" style="flex-grow:${p.n}">${p.n / t.total >= 0.08 ? p.n : ''}</span>`).join('')}</div></div>`;
    }).join('');
    $('barLegend').innerHTML = SEGMENTS.map(([cls, label]) => `<span><i class="sw seg-${cls}" aria-hidden="true"></i>${esc(label)}</span>`).join('');
    const open = S.risks.filter(r => r.status !== 'Closed').sort((a, b) => (a.target || '9999').localeCompare(b.target || '9999') || (b.score || 0) - (a.score || 0));
    const nr = state.meta.nextReview;
    $('nextPanel').innerHTML = `<p class="next-date">Next planned review: <b>${nr ? SRAReport.fmtDate(nr) : 'not set'}</b>${nr ? '' : ' <a href="#profile">Set it in step 1</a>'}</p>
      ${open.length ? `<h3>Open risks by target date</h3><ul class="next-list">${open.slice(0, 6).map(r => `<li><span class="nl-ref">${r.ref}</span><span class="nl-what">${esc(clip(r.threat || r.description || 'No description', 90))}</span><span class="nl-when${isLate(r) ? ' late' : ''}">${r.target ? esc(r.target) : 'No target date'}${isLate(r) ? ', past target date' : ''}</span></li>`).join('')}</ul>${open.length > 6 ? `<p class="muted">And ${open.length - 6} more in the <a href="#risks">risk register</a>.</p>` : ''}` : '<p class="muted">No open risks.</p>'}
      <div class="next-actions"><button class="btn small" type="button" data-action="export-csv">Export the remediation plan (CSV)</button><button class="btn small" type="button" data-action="save-protected">Save a protected copy</button></div>
      <p class="help">For the next review, open this file, update what changed, and save it under the new assessment date. The two files stay side by side as the record of each analysis.</p>`;
    $('nextPanel').querySelectorAll('[data-action]').forEach(b => b.onclick = () => runAction(b.dataset.action));
    const top = S.risks.filter(r => r.score).sort((a, b) => b.score - a.score || a.ref.localeCompare(b.ref)).slice(0, 3);
    $('topRisks').innerHTML = top.length ? `<div class="table-scroll"><table class="data-table top-table"><thead><tr><th scope="col">ID</th><th scope="col">Threat or statement</th><th scope="col">Inherent</th><th scope="col">Owner</th><th scope="col">Target</th></tr></thead><tbody>${top.map(r => `<tr><th scope="row">${r.ref}</th><td>${esc(r.threat || r.description || 'No description')}</td><td><span class="pill score-${r.level.key}">${esc(ratingText(r.L, r.I, r.score, r.level))}</span></td><td>${r.owner ? esc(r.owner) : '<span class="muted">Unassigned</span>'}</td><td class="nowrap">${r.target ? esc(r.target) : '<span class="muted">Not set</span>'}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No rated risks yet. Rate likelihood and impact in the <a href="#risks">risk register</a>.</p>';
  }

  /* ---- Rail and header --------------------------------------------------- */
  function railStatus(S) {
    const m = state.meta;
    const profileMissing = ['orgName', 'assessmentDate', 'assessor', 'scope', 'entityType', 'clearinghouse', 'groupHealthPlan'].filter(k => !String(m[k] || '').trim()).length;
    const gaps = S.partial + S.notMet;
    return {
      overview: S.missing.length ? `${plural(S.missing.length, 'check')} open` : (S.isDraft ? 'Checks passed, Draft' : 'Final'),
      profile: profileMissing ? `${plural(profileMissing, 'required field')} open` : 'Complete',
      inventory: `${plural(S.assets.length, 'row')}, ${plural(S.flows.length, 'flow')}${S.facts.unclassified ? `, ${S.facts.unclassified} unclassified` : ''}`,
      map: !S.assets.length ? 'No rows yet' : S.facts.weak ? `${plural(S.facts.weak, 'flow')} not encrypted or not checked` : S.unlinked.length ? `${S.unlinked.length} flagged without a risk` : 'Nothing flagged',
      catalog: `${S.reviewed} of ${S.total}, ${plural(gaps, 'gap')}`,
      risks: S.risks.length ? `${plural(S.risks.length, 'risk')}, ${S.high} high` : 'No risks yet',
      attestation: String(m.executive || '').trim() ? 'Approver named' : 'Approver not named',
      report: S.missing.length ? `${plural(S.missing.length, 'check')} open` : (S.isDraft ? 'Ready, status Draft' : 'Final')
    };
  }

  function renderChrome(S) {
    const words = railStatus(S);
    Object.entries(words).forEach(([k, text]) => {
      const el = document.querySelector(`[data-status="${k}"]`);
      if (el) el.textContent = text;
    });
    const org = String(state.meta.orgName || '').trim();
    $('docOrg').textContent = org || (state.pristine ? 'SaberGuard SRA Workspace' : 'Untitled assessment');
    $('docSub').textContent = state.pristine ? 'HIPAA Security Rule risk analysis' : `HIPAA Security Rule risk analysis · version ${String(state.meta.reportVersion || '1.0').trim() || '1.0'} · ${S.isDraft ? 'Draft' : 'Final'}`;
    showSaveState();
  }

  function savedAgo() {
    const mins = Math.floor((Date.now() - state.lastSavedAt) / 60000);
    return mins < 1 ? 'Saved just now' : mins < 60 ? `Saved ${plural(mins, 'minute')} ago` : `Saved at ${new Date(state.lastSavedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  }
  function showSaveState() {
    const el = $('dirtyStatus');
    const text = state.dirty ? 'Unsaved changes' : state.protectedSave ? `${state.lastSavedAt ? savedAgo() : 'Saved'}, passphrase protected` : state.lastSavedAt ? savedAgo() : (state.savedAt && !state.pristine ? 'No unsaved changes' : '');
    el.textContent = text;
    el.hidden = !text;
    el.classList.toggle('is-dirty', !!state.dirty);
  }
  setInterval(() => { if (!state.dirty && state.lastSavedAt) showSaveState(); }, 30000);

  /* ---- File menu --------------------------------------------------------- */
  const fileBtn = $('fileBtn'), fileMenu = $('fileMenu');
  const menuItems = () => [...fileMenu.querySelectorAll('[role="menuitem"]:not([disabled])')];
  function openMenu(focusLast) {
    fileMenu.hidden = false;
    fileBtn.setAttribute('aria-expanded', 'true');
    const items = menuItems();
    (focusLast ? items[items.length - 1] : items[0])?.focus();
  }
  function closeMenu(returnFocus) {
    if (fileMenu.hidden) return;
    fileMenu.hidden = true;
    fileBtn.setAttribute('aria-expanded', 'false');
    if (returnFocus) fileBtn.focus();
  }
  fileBtn.onclick = () => fileMenu.hidden ? openMenu() : closeMenu();
  fileBtn.onkeydown = e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); openMenu(e.key === 'ArrowUp'); }
  };
  fileMenu.onkeydown = e => {
    const items = menuItems(), i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
    else if (e.key === 'Home') { e.preventDefault(); items[0].focus(); }
    else if (e.key === 'End') { e.preventDefault(); items[items.length - 1].focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); closeMenu(true); }
    else if (e.key === 'Tab') closeMenu(false);
    else if (e.key.length === 1 && /\S/.test(e.key)) {
      const start = i + 1;
      const hit = [...items.slice(start), ...items.slice(0, start)].find(b => b.textContent.trim().toLowerCase().startsWith(e.key.toLowerCase()));
      if (hit) hit.focus();
    }
  };
  fileMenu.onclick = e => { const b = e.target.closest('[data-action]'); if (!b) return; closeMenu(true); runAction(b.dataset.action); };
  document.addEventListener('click', e => { if (!fileMenu.hidden && !e.target.closest('.menu-wrap')) closeMenu(false); });

  function runAction(action) {
    if (action === 'open') $('importFile').click();
    if (action === 'save') saveFile();
    if (action === 'save-protected') saveProtected();
    if (action === 'save-lean') exportAssessment(false);
    if (action === 'export-csv') exportRemediationCsv();
  }

  function exportRemediationCsv() {
    collectMeta();
    const text = SRAReport.remediationCsv(state);
    const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'), url = URL.createObjectURL(blob);
    a.href = url;
    a.download = `${fileSlug()}-remediation-plan-${state.meta.assessmentDate || 'draft'}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 500);
    $('saveStatus').textContent = `Remediation plan exported as CSV with ${plural(state.risks.length, 'risk')}.`;
  }

  /* ---- Metadata, dashboard, completeness checks -------------------------- */
  function collectMeta() { document.querySelectorAll('.meta').forEach(el => state.meta[el.id] = el.value); }
  function hydrateMeta() { document.querySelectorAll('.meta').forEach(el => { el.value = state.meta[el.id] != null ? state.meta[el.id] : ''; }); }

  let frame = 0;
  function updateDashboard(opts = {}) {
    if (!opts.keepClean) { state.dirty = true; state.pristine = false; }
    collectMeta();
    invalidate(view);
    if (opts.now) { cancelAnimationFrame(frame); frame = 0; refresh(); return; }
    if (!frame) frame = requestAnimationFrame(() => { frame = 0; refresh(); });
  }

  function refresh() {
    const S = SRAReport.stats(state);
    renderChrome(S);
    if (view === 'overview') renderOverview(S);
    if (view === 'map') renderMap(S);
    if (view === 'catalog') refreshCatalogList(S);
    if (view === 'risks') { renderRiskFilters(S); renderHeat(S); renderCoverage(S); }
    if (view === 'report') renderReadiness(S);
    refreshLetterheadFields();
    scheduleFingerprint();
  }

  function renderReadiness(S) {
    $('scoreSummary').textContent = S.score == null ? 'Not scored' : S.score + '%';
    $('metSummary').textContent = S.met + S.alt;
    $('gapSummary').textContent = S.partial + S.notMet;
    $('highSummary').textContent = S.high;
    $('readinessList').innerHTML = S.checks.map(c => `<li class="${c.ok ? 'ok' : 'todo'}"><span class="mark">${c.ok ? 'Done' : 'Open'}</span><span>${c.ok ? esc(c.label) : `<a href="#${CHECK_VIEW[c.key] || 'report'}">${esc(c.label)}</a>`}</span></li>`).join('')
      + S.advisory.map(c => `<li class="${c.ok ? 'ok' : 'advisory'}"><span class="mark">${c.ok ? 'Done' : 'Advisory'}</span><span>${esc(c.label)}. Advisory in this version: it does not hold the report in draft.</span></li>`).join('');
    const badge = $('readinessBadge');
    badge.textContent = S.missing.length ? `${S.checks.length - S.missing.length} of ${S.checks.length} checks passed` : (S.isDraft ? 'Checks passed, status Draft' : 'Final');
    badge.classList.toggle('ready', !S.missing.length);
    const notice = $('readinessNotice');
    notice.className = 'notice ' + (S.missing.length ? 'warn' : 'ok');
    notice.innerHTML = S.missing.length
      ? `<strong>Draft:</strong> the report prints with a Draft watermark until the ${S.missing.length} open ${S.missing.length === 1 ? 'check is' : 'checks are'} complete. ${state.meta.reportStatus === 'Final' ? 'The report status is set to Final but will print as Draft until then.' : ''}`
      : `<strong>Completeness checks passed.</strong> ${S.isDraft ? 'The report still prints as Draft until you set the report status to Final below.' : 'The report prints as Final without a watermark.'} These checks test whether fields are filled in, not whether the analysis is accurate or thorough. Review the report before approval.`;
  }

  let fingerprintTimer = null;
  function scheduleFingerprint() {
    clearTimeout(fingerprintTimer);
    fingerprintTimer = setTimeout(() => {
      const el = $('fingerprint');
      if (el && view === 'report') el.textContent = SRAIntegrity.grouped(SRAIntegrity.fingerprint(SRAFormat.serialize(state)));
    }, 250);
  }

  async function hashEvidence() {
    let changed = false;
    for (const c of Object.values(state.controls)) {
      for (const e of (c.evidence || [])) {
        if (!e.data) continue;
        const bytes = SRAIntegrity.dataUrlBytes(e.data);
        if (!bytes) continue;
        const actual = await SRAIntegrity.sha256File(bytes);
        if (e.sha256 && e.sha256 !== actual) { if (!e.mismatch) changed = true; e.mismatch = true; }
        else if (e.sha256 !== actual) { e.sha256 = actual; changed = true; }
      }
    }
    if (changed) { invalidate(); if (view) renderView(view); scheduleFingerprint(); }
    return changed;
  }

  const MAX_LOGO = 512 * 1024;
  function refreshLetterheadFields() {
    const mode = state.meta.letterhead || '';
    document.querySelectorAll('[data-letterhead]').forEach(el => { el.hidden = el.dataset.letterhead !== mode; });
    const custom = mode === 'firm' && state.meta.firmLogo === 'custom';
    const data = SRAReport.logoData(state.meta);
    $('logoRow').hidden = !custom;
    $('logoPreview').hidden = !(custom && data);
    $('logoRemove').hidden = !(custom && data);
    if (custom && data) $('logoPreview').src = data;
    else $('logoPreview').removeAttribute('src');
  }
  async function chooseLogo(file) {
    const out = $('logoStatus');
    if (!SRAReport.LOGO_TYPES.includes(file.type)) { out.textContent = 'Choose a PNG, JPEG, WebP, or SVG image.'; return; }
    if (file.size > MAX_LOGO) { out.textContent = `That image is ${formatBytes(file.size)}. The limit for a letterhead logo is ${formatBytes(MAX_LOGO)}.`; return; }
    state.meta.letterheadLogoData = await toDataUrl(file);
    out.textContent = `${file.name} will print on the letterhead. It is kept in the saved assessment file.`;
    updateDashboard();
    if (reportMode) renderReportView();
  }
  function removeLogo() {
    delete state.meta.letterheadLogoData;
    $('logoStatus').textContent = 'Image removed.';
    updateDashboard();
    if (reportMode) renderReportView();
  }

  function showTheme() {
    $('themeBtn').setAttribute('aria-pressed', String(SRATheme.get() === 'dark'));
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
    $('main').hidden = true;
    $('rail').hidden = true;
    $('reportMain').hidden = false;
    $('previewBtn').textContent = 'Edit assessment';
    window.scrollTo({ top: 0, behavior: 'instant' });
    $('backBtn').focus();
  }
  function hideReport() {
    reportMode = false;
    document.body.classList.remove('report-mode');
    $('main').hidden = false;
    $('rail').hidden = false;
    $('reportMain').hidden = true;
    $('previewBtn').textContent = 'Preview report';
  }
  let savedTitle = document.title;
  const cssString = s => '"' + String(s).replace(/[\\"]/g, '\\$&').replace(/[\n\r\f]+/g, ' ') + '"';
  function writePageStyle() {
    let el = $('printPageStyle');
    if (!el) { el = document.createElement('style'); el.id = 'printPageStyle'; document.head.appendChild(el); }
    const p = SRAReport.pageStrings(state, SRAReport.stats(state));
    const box = 'font-family:"Inter","Segoe UI",system-ui,Arial,sans-serif;font-size:8.25pt;color:#505d72';
    el.textContent = `@page{@top-left{content:${cssString(p.topLeft)};${box};vertical-align:bottom;padding-bottom:4mm}@top-right{content:${cssString(p.topRight)};${box};vertical-align:bottom;padding-bottom:4mm}@bottom-left{content:${cssString(p.bottomLeft)};${box};vertical-align:top;padding-top:4mm}@bottom-right{content:"Page " counter(page) " of " counter(pages);${box};vertical-align:top;padding-top:4mm}}@page :first{@top-left{content:none}@top-right{content:none}@bottom-left{content:none}@bottom-right{content:none}}`;
  }
  function preparePrint() {
    renderReportView();
    writePageStyle();
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
  /* The assessment as the object a file holds, without writing a file. The
     host seam below uses it; so does saving a file. */
  function snapshot(includeEvidence = true) {
    collectMeta();
    state.savedAt = new Date().toISOString();
    return SRAFormat.serialize(state, { includeEvidence });
  }

  const fileSlug = () => (state.meta.orgName || 'organization').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
  const fileName = (includeEvidence, isProtected) => `${fileSlug()}-hipaa-sra-${state.meta.assessmentDate || 'draft'}${includeEvidence ? '' : '-no-evidence'}${isProtected ? '.sra' : ''}.json`;
  const hasEmbedded = () => Object.values(state.controls).some(c => (c.evidence || []).some(e => e.data));

  function download(text, name) {
    const blob = new Blob([text], { type: 'application/json' });
    const a = document.createElement('a'), url = URL.createObjectURL(blob);
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  function afterSave(includeEvidence, how) {
    const embedded = hasEmbedded();
    state.dirty = !includeEvidence && embedded;
    state.protectedSave = how === 'protected';
    state.pristine = false;
    if (!state.dirty) state.lastSavedAt = Date.now();
    showSaveState();
    const when = new Date(state.savedAt).toLocaleString();
    $('saveStatus').textContent = how === 'protected'
      ? `Passphrase-protected file saved ${when}. It opens only with the passphrase, and a lost passphrase cannot be recovered.`
      : includeEvidence
        ? `Assessment file ${how === 'in-place' ? 'saved to the same file' : 'created'} ${when}. Changes made after this are not saved until you save again.`
        : `Assessment file without evidence created ${when}.${embedded ? ' The attached evidence is only in this tab until you save the full file.' : ''}`;
  }

  function exportAssessment(includeEvidence = true) {
    const payload = snapshot(includeEvidence);
    download(JSON.stringify(payload, null, 2), fileName(includeEvidence, false));
    afterSave(includeEvidence, 'download');
  }

  const handles = { plain: null, protected: null };
  const canPick = () => typeof window.showSaveFilePicker === 'function';
  async function writeInPlace(kind, text, name) {
    let handle = handles[kind];
    if (!handle) {
      try {
        handle = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: 'Assessment file', accept: { 'application/json': ['.json'] } }] });
      } catch (err) {
        return err && err.name === 'AbortError' ? 'cancelled' : 'unavailable';
      }
      handles[kind] = handle;
    }
    try {
      const w = await handle.createWritable();
      await w.write(text);
      await w.close();
      return 'written';
    } catch (err) {
      handles[kind] = null;
      return 'unavailable';
    }
  }

  async function saveFile() {
    if (!canPick()) { exportAssessment(true); return; }
    const payload = snapshot(true);
    const result = await writeInPlace('plain', JSON.stringify(payload, null, 2), fileName(true, false));
    if (result === 'cancelled') return;
    if (result === 'unavailable') { exportAssessment(true); return; }
    afterSave(true, 'in-place');
  }

  const protectUnavailableText = 'Passphrase protection needs the browser\'s built-in cryptography, which this browser does not offer to a page opened this way. Open the workspace from https://sra.saberguard.tech or a local web server to use it.';

  async function saveProtected() {
    if (!SRAIntegrity.available()) { $('saveStatus').textContent = protectUnavailableText; return; }
    const passphrase = await askPassphrase('save');
    if (!passphrase) return;
    const payload = snapshot(true);
    const wrapper = await SRAIntegrity.protect(JSON.stringify(payload), passphrase);
    const text = JSON.stringify(wrapper);
    const name = fileName(true, true);
    const result = canPick() ? await writeInPlace('protected', text, name) : 'unavailable';
    if (result === 'cancelled') return;
    if (result === 'unavailable') download(text, name);
    afterSave(true, 'protected');
  }

  let passResolve = null, passCheck = null, passReturn = null;
  function askPassphrase(mode, fileLabel, check) {
    const dlg = $('passDialog');
    const saving = mode === 'save';
    $('passTitle').textContent = saving ? 'Save a passphrase-protected file' : 'Open a passphrase-protected file';
    $('passDesc').textContent = saving
      ? 'The file is encrypted with AES-256-GCM using a key derived from this passphrase. Use at least 12 characters. A lost passphrase cannot be recovered, and nobody, including SaberGuard, can open the file without it.'
      : `Enter the passphrase for ${fileLabel}.`;
    $('passTwoField').hidden = !saving;
    $('passOne').autocomplete = saving ? 'new-password' : 'current-password';
    $('passOk').textContent = saving ? 'Save protected file' : 'Open file';
    $('passOne').value = ''; $('passTwo').value = ''; $('passError').textContent = '';
    passCheck = check || null;
    passReturn = document.activeElement;
    return new Promise(resolve => {
      passResolve = resolve;
      dlg.showModal();
      $('passOne').focus();
    });
  }
  function closePassphrase(value) {
    const dlg = $('passDialog');
    if (dlg.open) dlg.close();
    $('passOne').value = ''; $('passTwo').value = '';
    const r = passResolve; passResolve = null; passCheck = null;
    if (passReturn && document.contains(passReturn)) passReturn.focus();
    passReturn = null;
    if (r) r(value);
  }
  $('passForm').addEventListener('submit', async e => {
    e.preventDefault();
    const one = $('passOne').value, saving = !$('passTwoField').hidden;
    if (saving && one.length < SRAIntegrity.PROTECTED.minPassphrase) { $('passError').textContent = `Use at least ${SRAIntegrity.PROTECTED.minPassphrase} characters.`; $('passOne').focus(); return; }
    if (saving && one !== $('passTwo').value) { $('passError').textContent = 'The two passphrases do not match.'; $('passTwo').focus(); return; }
    if (!one) { $('passError').textContent = 'Enter the passphrase.'; $('passOne').focus(); return; }
    if (passCheck) {
      $('passOk').disabled = true;
      $('passError').textContent = 'Checking the passphrase.';
      const result = await passCheck(one);
      $('passOk').disabled = false;
      if (!result.ok) { $('passError').textContent = result.message; $('passOne').select(); return; }
      closePassphrase(result.value);
      return;
    }
    closePassphrase(one);
  });
  $('passCancel').onclick = () => closePassphrase(null);
  $('passDialog').addEventListener('cancel', e => { e.preventDefault(); closePassphrase(null); });

  async function readAssessmentText(file) {
    const data = JSON.parse(await file.text());
    if (!SRAIntegrity.isProtected(data)) return data;
    try { SRAIntegrity.checkWrapper(data); } catch (err) {
      throw new Error(err.message === 'version' ? 'This protected file was saved by a newer version of the workspace.' : 'This protected file is damaged or not a SaberGuard assessment.');
    }
    if (!SRAIntegrity.available()) throw new Error(protectUnavailableText);
    const opened = await askPassphrase('open', file.name, async passphrase => {
      try {
        return { ok: true, value: JSON.parse(await SRAIntegrity.unprotect(data, passphrase)) };
      } catch (err) {
        return { ok: false, message: err.message === 'passphrase' ? 'That passphrase does not open this file, or the file has been changed since it was saved. Nothing was opened.' : 'The file could not be read. Nothing was opened.' };
      }
    });
    if (!opened) throw new Error('Nothing was opened.');
    return opened;
  }

  function status(text) {
    $('saveStatus').textContent = text;
    $('startStatus').textContent = view === 'start' ? text : '';
  }

  async function importAssessment(file) {
    try {
      const data = await readAssessmentText(file);
      const up = SRAFormat.upgrade(data);
      state.meta = up.meta; state.assets = up.assets; state.flows = up.flows; state.controls = up.controls; state.risks = up.risks; state.interviews = up.interviews; state.savedAt = up.savedAt;
      state.protectedSave = false;
      state.lastSavedAt = null;
      state.pristine = false;
      handles.plain = null; handles.protected = null;
      catFilter = 'all'; catQuery = ''; $('catalogSearch').value = ''; selectedId = CONTROLS[0].id;
      riskFilter = 'all'; openRiskId = null;
      hydrateMeta();
      invalidate();
      $('logoStatus').textContent = '';
      wardOffer = null; renderWardDrafts();
      const note = up.version < FILE_FORMAT.version ? ` This version ${up.version} file was read into format version ${FILE_FORMAT.version}.${up.carried.length ? ` ${plural(up.carried.length, 'answer')} carried over on rows that changed and marked for review.` : ''} Saving writes version ${FILE_FORMAT.version}.` : '';
      state.dirty = false;
      if (view === 'start') navigate('overview');
      else { renderView(view); refresh(); }
      state.dirty = false;
      showSaveState();
      if (reportMode) renderReportView();
      status(`Opened ${file.name}. Changes remain in memory until saved.${note}`);
      if (await hashEvidence()) {
        const bad = Object.values(state.controls).flatMap(c => c.evidence || []).filter(e => e.mismatch).length;
        if (bad) status(`${$('saveStatus').textContent} ${plural(bad, 'evidence file does', 'evidence files do')} not match the SHA-256 recorded when attached.`);
        if (reportMode) renderReportView();
      }
      return true;
    } catch (err) {
      status(err instanceof SyntaxError || !err.message || err.message === 'format' || err.message === 'not an assessment file'
        ? 'Could not open that file. Choose a valid SaberGuard assessment JSON file.'
        : err.message);
      return false;
    }
  }

  function loadSample() {
    const go = () => importAssessment({ name: window.SRA_SAMPLE.name, text: async () => JSON.stringify(window.SRA_SAMPLE.data) });
    if (window.SRA_SAMPLE) return go();
    return new Promise(resolve => {
      const s = document.createElement('script');
      s.src = 'assets/sample.js';
      s.onload = () => resolve(go());
      s.onerror = () => { status('The sample could not be loaded.'); resolve(false); };
      document.head.appendChild(s);
    });
  }

  /* ---- Ward evidence ----------------------------------------------------- */
  /* What the newest Ward file offers to add to the inventory and the risk
     register. Nothing is added until the assessor chooses to. */
  let wardOffer = null;
  function renderWardDrafts() {
    const box = $('wardDrafts');
    const offer = wardOffer;
    if (!offer) { box.hidden = true; box.innerHTML = ''; return; }
    const names = new Set(state.assets.map(a => a.name.trim().toLowerCase()));
    offer.assets = offer.assets.filter(d => !names.has(d.asset.name.trim().toLowerCase()));
    const ids = new Set(state.risks.map(r => r.id));
    offer.risks = offer.risks.filter(d => !ids.has(d.risk.id));
    if (!offer.assets.length && !offer.risks.length) { box.hidden = true; box.innerHTML = ''; return; }
    const part = (title, items, label, btnId, help) => !items.length ? '' : `
      <div class="ward-draft">
        <div class="ward-draft-head"><strong>${esc(title)}</strong><button class="btn small" id="${btnId}" type="button">${esc(label)}</button></div>
        <p class="help">${esc(help)}</p>
        <ul>${items.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
      </div>`;
    box.innerHTML = part(
      `Ward saw ${offer.assets.length} ${offer.assets.length === 1 ? 'service or device' : 'services and devices'} not in the inventory`,
      offer.assets.map(d => d.asset.name),
      `Add ${offer.assets.length} to the inventory`, 'wardAddAssets',
      'Each is added to step 2 with what Ward observed in its notes. The ePHI held and the lifecycle stages are left for you, so the inventory check stays open until you confirm each row or remove it.'
    ) + part(
      `${offer.risks.length} open Ward ${offer.risks.length === 1 ? 'finding is' : 'findings are'} not in the risk register`,
      offer.risks.map(d => `${d.rule_id}${d.severity ? ` (${d.severity})` : ''}: ${d.title}`),
      `Add ${offer.risks.length} draft ${offer.risks.length === 1 ? 'risk' : 'risks'}`, 'wardAddRisks',
      'Each is added to step 5 linked to its catalog row, and to the inventory rows Ward can name. Likelihood, impact, owner, target date, and treatment are left blank for you. Findings rejected in review in Ward are not offered.'
    );
    box.hidden = false;
    const a = $('wardAddAssets');
    if (a) a.onclick = () => {
      const n = offer.assets.length;
      offer.assets.forEach(d => state.assets.push(d.asset));
      offer.assets = [];
      updateDashboard();
      $('wardStatus').textContent = `${n} inventory ${n === 1 ? 'row' : 'rows'} added from Ward. Confirm the ePHI held and the lifecycle stages on each in step 2.`;
      renderWardDrafts();
    };
    const r = $('wardAddRisks');
    if (r) r.onclick = () => {
      const n = offer.risks.length;
      const known = new Set(state.assets.map(x => x.id));
      offer.risks.forEach(d => { d.risk.assetIds = d.risk.assetIds.filter(id => known.has(id)); state.risks.push(d.risk); });
      offer.risks = [];
      updateDashboard();
      $('wardStatus').textContent = `${n} draft ${n === 1 ? 'risk' : 'risks'} added from Ward findings. Rate and assign each in step 5.`;
      renderWardDrafts();
    };
  }

  /* opts.confirmName false skips the name check: a host that fetched the file
     for this assessment's own client already knows it is the right one. */
  async function attachWardEvidence(file, opts = {}) {
    const out = $('wardStatus');
    let ward;
    try {
      ward = SRAWard.read(JSON.parse(await file.text()));
    } catch (err) {
      out.textContent = err instanceof SyntaxError ? 'Could not read that file. Choose the JSON file downloaded from Ward.' : err.message;
      return null;
    }
    collectMeta();
    const plan = SRAWard.plan(state.controls, state.meta, ward);
    if (opts.confirmName !== false && plan.nameMismatch && !window.confirm(`This Ward file is for "${ward.client.name}", but the organization in step 1 is "${state.meta.orgName}". Attach it anyway?`)) {
      out.textContent = 'Nothing attached.';
      return null;
    }
    const used = CONTROLS.reduce((n, x) => n + controlState(x.id).evidence.reduce((m, f) => m + (f.size || 0), 0), 0);
    const result = SRAWard.apply(state.controls, plan, { budget: MAX_TOTAL - used, today: localToday() });
    const changed = result.attached.length > 0;
    updateDashboard({ keepClean: !changed });
    if (view === 'catalog') renderCatalog();
    if (changed) await hashEvidence();
    wardOffer = SRAWard.drafts(state, ward);
    renderWardDrafts();
    const list = ids => ids.join(', ');
    out.textContent = [
      `Ward evidence for ${ward.client.name}, ${SRAWard.describe(ward)}:`,
      changed ? `attached to ${result.attached.length} row${result.attached.length === 1 ? '' : 's'} (${list(result.attached)}).` : 'nothing new attached.',
      result.noted.length ? `Notes filled on rows that had none: ${list(result.noted)}.` : '',
      result.skipped.length ? `Already attached, skipped: ${list(result.skipped)}.` : '',
      result.unchanged.length ? `Unchanged since the Ward evidence already attached, not attached again: ${list(result.unchanged)}.` : '',
      result.overLimit.length ? `Not attached, over the 25 MB evidence limit: ${list(result.overLimit)}.` : '',
      plan.unmatched.length ? `Citations not in this catalog, not attached: ${list(plan.unmatched)}.` : '',
      'No status was changed.'
    ].filter(Boolean).join(' ');
    return { ...result, offered: { assets: wardOffer.assets.length, risks: wardOffer.risks.length } };
  }

  /* ---- Wiring ------------------------------------------------------------ */
  document.querySelectorAll('.meta').forEach(el => {
    const h = () => {
      updateDashboard();
      if (['entityType', 'clearinghouse', 'groupHealthPlan'].includes(el.id)) stale.add('catalog');
      if (reportMode && ['letterhead', 'letterheadSpace', 'firmLogo'].includes(el.id)) renderReportView();
    };
    el.addEventListener('input', h); el.addEventListener('change', h);
  });
  $('filters').onclick = e => {
    const b = e.target.closest('[data-filter]');
    if (!b) return;
    catFilter = b.dataset.filter;
    renderCatalog();
    $('filters').querySelector(`[data-filter="${catFilter}"]`)?.focus();
  };
  let searchTimer = null;
  $('catalogSearch').oninput = e => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { catQuery = e.target.value; renderCatalog(); }, 120); };
  $('riskFilters').onclick = e => {
    const b = e.target.closest('[data-rfilter]');
    if (!b) return;
    riskFilter = b.dataset.rfilter;
    renderRisks();
    $('riskFilters').querySelector(`[data-rfilter="${riskFilter}"]`)?.focus();
  };
  $('heatInherent').onclick = () => { heatMode = 'inherent'; renderHeat(SRAReport.stats(state)); };
  $('heatResidual').onclick = () => { heatMode = 'residual'; renderHeat(SRAReport.stats(state)); };
  $('addAsset').onclick = () => addAsset();
  $('addFlow').onclick = () => addFlow();
  $('addRisk').onclick = () => addRisk();
  $('addInterview').onclick = () => addInterview();
  const pick = $('scenarioPick');
  RISK_SCENARIOS.forEach((t, i) => { const o = document.createElement('option'); o.value = i; o.textContent = t.text.length > 90 ? t.text.slice(0, 88) + '...' : t.text; pick.appendChild(o); });
  pick.onchange = () => { const t = RISK_SCENARIOS[pick.value]; if (t) addRisk({ description: t.text, threat: t.threat, vulnerability: t.vulnerability, cia: t.cia, controlIds: SRAFormat.parseIds(t.controls) }); pick.value = ''; };
  $('csvBtn').onclick = exportRemediationCsv;
  $('exportBtn2').onclick = () => saveFile();
  $('exportNoEvidenceBtn').onclick = () => exportAssessment(false);
  $('saveProtectedBtn').onclick = () => saveProtected();
  if (!SRAIntegrity.available()) { $('saveProtectedBtn').disabled = true; $('menuProtected').disabled = true; $('protectNote').textContent = protectUnavailableText; }
  $('importFile').onchange = e => { if (e.target.files[0]) importAssessment(e.target.files[0]); e.target.value = ''; };
  $('wardBtn').onclick = () => $('wardFile').click();
  $('wardFile').onchange = e => { if (e.target.files[0]) attachWardEvidence(e.target.files[0]); e.target.value = ''; };
  ['printBtn', 'printBtn2', 'printBtn3'].forEach(id => $(id).onclick = printReport);
  $('previewBtn').onclick = () => reportMode ? hideReport() : showReport();
  $('previewBtn2').onclick = showReport;
  $('backBtn').onclick = () => { hideReport(); $('previewBtn').focus(); };
  $('themeBtn').onclick = () => { SRATheme.toggle(); showTheme(); };
  $('logoFile').onchange = e => { if (e.target.files[0]) chooseLogo(e.target.files[0]); e.target.value = ''; };
  $('logoRemove').onclick = removeLogo;
  $('startNew').onclick = () => { state.pristine = false; navigate('profile'); $('orgName').focus(); };
  $('startOpen').onclick = () => $('importFile').click();
  $('startSample').onclick = () => loadSample();
  $('keysClose').onclick = () => $('keysDialog').close();
  $('startChecked').textContent = SRAReport.fmtDate(CATALOG_SOURCE.checked);
  window.addEventListener('hashchange', route);

  window.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 's') { e.preventDefault(); saveFile(); return; }
    if (view !== 'catalog' || reportMode || e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.querySelector('dialog[open]') || !fileMenu.hidden || isTyping(e.target)) return;
    const k = e.key;
    if (k === 'j' || k === 'J') { e.preventDefault(); moveSelection(1); }
    else if (k === 'k' || k === 'K') { e.preventDefault(); moveSelection(-1); }
    else if (/^[1-6]$/.test(k)) { e.preventDefault(); setStatus(selectedId, KEY_STATUS[Number(k) - 1], false); }
    else if (k === '/') { e.preventDefault(); $('catalogSearch').focus(); }
    else if (k === '?') { e.preventDefault(); $('keysDialog').showModal(); }
  });

  window.addEventListener('beforeunload', e => {
    if (state.dirty) { e.preventDefault(); e.returnValue = ''; }
  });

  /* ---- Init -------------------------------------------------------------- */
  $('assessmentDate').value = localToday();
  collectMeta();
  showTheme();
  route();

  /* ---- Host seam ---------------------------------------------------------
     This page keeps nothing and talks to nothing. A host that serves a copy
     of it (SaberGuard's Ward does, behind its own sign-in) can keep the
     assessment for the assessor instead: it reads the work with snapshot(),
     stores it wherever it stores things, and calls markSaved() so the
     unsaved-changes warning clears. Opening is importAssessment() with any
     object that has name and text(). Nothing here runs unless a host calls
     it, so the public page behaves exactly as before. */
  function markSaved(message) {
    state.dirty = false;
    state.lastSavedAt = Date.now();
    showSaveState();
    if (message) $('saveStatus').textContent = String(message);
  }
  function setTheme(theme) { SRATheme.set(theme); showTheme(); }
  const isDirty = () => !!state.dirty;

  /* Exposed for testing and for automation hooks (for example loading a sample file). */
  window.SRA = { state, snapshot, markSaved, isDirty, setTheme, importAssessment, attachWardEvidence, exportAssessment, saveFile, saveProtected, renderReportView, showReport, hideReport, updateDashboard, addAsset, addFlow, addRisk, exportRemediationCsv, addInterview, navigate, loadSample, renderAll() { hydrateMeta(); invalidate(); renderView(view); refresh(); } };
})();

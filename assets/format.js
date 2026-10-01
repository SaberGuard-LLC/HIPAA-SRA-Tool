/* ============================================================================
   SaberGuard SRA Workspace: saved-file format
   SRAFormat.upgrade(data)      -> workspace state from any saved file
   SRAFormat.serialize(state)   -> the object written to a version 4 file
   Pure functions. No DOM. Loaded after catalog.js.

   Version history
   1  responses: { id: 0|1|2 }, notes: { id: text }
   2  not released
   3  meta, assets (name, data, owner, flow, protection), controls, risks with
      free-text assets and controls
   4  entity profile in meta; typed inventory rows; flows; risks link by id;
      verification basis per row; evidence may be saved without data
   ========================================================================== */
const SRAFormat = (function () {
  'use strict';

  const str = v => typeof v === 'string' ? v : (v == null ? '' : String(v));
  const uid = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  const rating = v => { const n = Number(v); return n >= 1 && n <= 5 ? n : ''; };
  const pick = (v, list, fallback) => list.some(([k]) => k === v) ? v : fallback;
  const ids = v => Array.isArray(v) ? v.map(str).filter(Boolean) : [];
  const parseIds = s => str(s).split(/[\s,;]+/).map(x => x.trim().toUpperCase()).filter(Boolean);

  function newAsset(a = {}) {
    return {
      id: str(a.id) || uid(),
      name: str(a.name),
      kind: pick(a.kind, INVENTORY.kind, 'unknown'),
      zone: pick(a.zone, INVENTORY.zone, 'unknown'),
      data: str(a.data),
      lifecycle: Array.isArray(a.lifecycle) ? a.lifecycle.filter(v => INVENTORY.lifecycle.some(([k]) => k === v)) : [],
      owner: str(a.owner),
      accountable: str(a.accountable),
      vendor: str(a.vendor),
      baa: pick(a.baa, INVENTORY.baa, 'unknown'),
      location: pick(a.location, INVENTORY.location, 'unknown'),
      atRest: pick(a.atRest, INVENTORY.yesNo, 'unknown'),
      mfa: pick(a.mfa, INVENTORY.yesNo, 'unknown'),
      count: Math.max(1, parseInt(a.count, 10) || 1),
      flow: str(a.flow),          /* version 3 flow notes, kept as legacy notes */
      protection: str(a.protection)
    };
  }

  function newFlow(f = {}) {
    return {
      id: str(f.id) || uid(),
      from: str(f.from),
      to: str(f.to),
      twoWay: !!f.twoWay,
      data: str(f.data),
      transport: pick(f.transport, INVENTORY.transport, 'unknown'),
      inTransit: pick(f.inTransit, INVENTORY.yesNo, 'unknown'),
      notes: str(f.notes)
    };
  }

  /* New risks start with likelihood and impact unset. Free-text values from
     version 3 are kept as legacy notes beside the id lists. */
  function newRisk(r = {}) {
    return {
      id: str(r.id) || uid(),
      description: str(r.description),
      assetIds: ids(r.assetIds),
      flowIds: ids(r.flowIds),
      controlIds: ids(r.controlIds).map(x => x.toUpperCase()),
      legacyAssets: str(r.legacyAssets),
      legacyControls: str(r.legacyControls),
      existing: str(r.existing),
      likelihood: rating(r.likelihood),
      impact: rating(r.impact),
      decision: DECISIONS.includes(r.decision) ? r.decision : 'Mitigate',
      owner: str(r.owner),
      target: str(r.target),
      treatment: str(r.treatment),
      status: RISK_STATUSES.includes(r.status) ? r.status : 'Open',
      residualLikelihood: rating(r.residualLikelihood),
      residualImpact: rating(r.residualImpact)
    };
  }

  function newControl(c = {}) {
    const out = {
      status: STATUSES[c.status] ? c.status : '',
      notes: str(c.notes),
      recommendation: str(c.recommendation),
      basis: BASIS.some(([k]) => k === c.basis) ? c.basis : '',
      evidence: Array.isArray(c.evidence) ? c.evidence.filter(e => e && typeof e === 'object').map(e => {
        const item = { name: str(e.name), type: str(e.type), size: Number(e.size) || 0 };
        if (typeof e.data === 'string' && e.data) item.data = e.data; else item.omitted = true;
        return item;
      }) : []
    };
    if (c.carried === true) out.carried = true;
    return out;
  }

  const META_DEFAULTS = { reportVersion: '1.0', classification: 'Confidential', reportStatus: 'Draft', entityType: '', clearinghouse: '', groupHealthPlan: '' };

  /* Reads a saved file of any version into workspace state. Nothing in the
     file is dropped: unknown control ids are kept as they are, and version 3
     free text moves to legacy fields. */
  function upgrade(data) {
    if (!data || typeof data !== 'object') throw new Error('not an assessment file');
    const version = data.responses ? 1 : (Number(data.version) || 3);
    if (data.format !== FILE_FORMAT.name && version !== 1) throw new Error('format');
    const meta = { ...META_DEFAULTS, ...((data.meta && typeof data.meta === 'object') ? data.meta : {}) };
    if (!REPORT_STATUSES.includes(meta.reportStatus)) meta.reportStatus = 'Draft';
    if (!['covered-entity', 'business-associate', 'both'].includes(meta.entityType)) meta.entityType = '';
    if (!['yes', 'no'].includes(meta.clearinghouse)) meta.clearinghouse = '';
    if (!['yes', 'no'].includes(meta.groupHealthPlan)) meta.groupHealthPlan = '';
    if (!meta.reportVersion) meta.reportVersion = '1.0';
    if (!meta.classification) meta.classification = 'Confidential';

    const assets = Array.isArray(data.assets) ? data.assets.filter(a => a && typeof a === 'object').map(newAsset) : [];
    const assetIds = new Set(assets.map(a => a.id));
    const flows = Array.isArray(data.flows) ? data.flows.filter(f => f && typeof f === 'object').map(newFlow) : [];

    const controls = {};
    const raw = (data.controls && typeof data.controls === 'object') ? data.controls : {};
    const carried = [];
    if (version === 1) {
      Object.entries(data.responses || {}).forEach(([id, v]) => {
        controls[id] = newControl({ status: v === 2 ? 'met' : v === 1 ? 'partial' : 'not-met', notes: data.notes?.[id] || '' });
      });
    }
    Object.entries(raw).forEach(([id, c]) => {
      if (!c || typeof c !== 'object') return;
      let target = id;
      if (version < 4 && V3_ID_MAP[id]) target = V3_ID_MAP[id];
      const ctl = newControl(c);
      if (version < 4 && ctl.status && V3_REVIEW_IDS.includes(target)) { ctl.carried = true; carried.push(target); }
      /* Never overwrite an answer already present on the target row. */
      if (controls[target] && controls[target].status) {
        controls[`${id} (version ${version}, unmapped)`] = ctl;
      } else {
        controls[target] = ctl;
      }
    });
    CONTROLS.forEach(c => { if (!controls[c.id]) controls[c.id] = newControl(); });

    const risks = Array.isArray(data.risks) ? data.risks.filter(r => r && typeof r === 'object').map(r => {
      if (version < 4) {
        const mapped = parseIds(r.controls).map(x => V3_ID_MAP[x] || x).filter(x => CONTROL_BY_ID[x]);
        return newRisk({ ...r, assetIds: [], flowIds: [], controlIds: mapped, legacyAssets: r.assets, legacyControls: r.controls });
      }
      return newRisk(r);
    }) : [];
    risks.forEach(r => { r.assetIds = r.assetIds.filter(id => assetIds.has(id)); r.flowIds = r.flowIds.filter(id => flows.some(f => f.id === id)); });

    return { version, meta, assets, flows, controls, risks, savedAt: data.savedAt || data.exportedAt || null, carried };
  }

  /* The object written to a file. With includeEvidence false, evidence keeps
     its name, type and size but not the file contents. */
  function serialize(state, options = {}) {
    const includeEvidence = options.includeEvidence !== false;
    const controls = {};
    Object.entries(state.controls || {}).forEach(([id, c]) => {
      const out = { status: c.status || '', notes: c.notes || '', recommendation: c.recommendation || '', basis: c.basis || '',
        evidence: (c.evidence || []).map(e => includeEvidence && e.data ? { name: e.name, type: e.type, size: e.size, data: e.data } : { name: e.name, type: e.type, size: e.size, omitted: true }) };
      if (c.carried) out.carried = true;
      controls[id] = out;
    });
    return {
      format: FILE_FORMAT.name,
      version: FILE_FORMAT.version,
      exportedAt: new Date().toISOString(),
      evidenceIncluded: includeEvidence,
      meta: { ...state.meta },
      assets: (state.assets || []).map(newAsset),
      flows: (state.flows || []).map(newFlow),
      controls,
      risks: (state.risks || []).map(newRisk),
      savedAt: state.savedAt || null
    };
  }

  return { upgrade, serialize, newAsset, newFlow, newRisk, newControl, parseIds };
})();
if (typeof window !== 'undefined') window.SRAFormat = SRAFormat;

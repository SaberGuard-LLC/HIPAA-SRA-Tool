/* ============================================================================
   SaberGuard SRA Workspace: ePHI flow map
   SRAMap.build(state)    -> { tree, model, view, facts, unlinked }
   SRAMap.toString(tree)  -> SVG markup, the same bytes for the same file
   SRAMap.toElement(tree) -> one SVG element (needs a document)
   SRAMap.unlinked(state) -> flagged rows and flows that no risk points at
   Pure functions over the assessment state. Loaded after catalog.js and
   format.js; no other dependencies.

   Drawing rules
   - Three columns: people and devices in the practice; systems that hold
     ePHI, with backups listed inside the system they copy; outside parties.
   - Direct-entry flows are not drawn.
   - A line carries a label only when the flow is not encrypted or not
     checked, or when a risk points at the flow and not at its endpoints.
   - One tag per finding, using the risk register reference.
   - Nothing with a linked risk, a missing or unconfirmed business associate
     agreement, or an encryption or MFA gap is ever left out. A row left
     unclassified by kind or zone is drawn as unclassified.
   ========================================================================== */
const SRAMap = (function () {
  'use strict';

  const L = { W: 710, bandW: 186, nodeW: 170, inset: 8, head: 46, gap: 11, foot: 10 };
  const COLS = [
    { t: 'IN THE PRACTICE', s: 'people and devices' },
    { t: 'SYSTEMS', s: 'where ePHI is kept' },
    { t: 'OUTSIDE PARTIES', s: 'who it is shared with' }
  ];
  const ENC = { yes: 'Encrypted', no: 'Not encrypted', unknown: 'Not checked', 'n/a': 'Not applicable' };
  const pad2 = n => String(n).padStart(2, '0');
  const r1 = x => Math.round(x * 10) / 10;
  const cap = t => t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
  const el = (tag, attrs, ...children) => ({ tag, attrs: attrs || {}, children: children.filter(c => c != null) });

  function wrap(text, max, lines) {
    const words = String(text).split(/\s+/).filter(Boolean);
    const out = [];
    let cur = '';
    words.forEach(w => { if (!cur) cur = w; else if ((cur + ' ' + w).length <= max) cur += ' ' + w; else { out.push(cur); cur = w; } });
    if (cur) out.push(cur);
    if (out.length > lines) { out.length = lines; out[lines - 1] = out[lines - 1].slice(0, max - 1).replace(/\s+$/, '') + '...'; }
    return out.length ? out : [''];
  }

  /* ---- Model: the assessment, normalized ---------------------------------- */
  function model(state) {
    const assets = (state.assets || []).map((a, i) => ({ ...SRAFormat.newAsset(a), index: i }));
    const byId = Object.fromEntries(assets.map(a => [a.id, a]));
    const flows = [];
    (state.flows || []).forEach((f0, i) => {
      const f = SRAFormat.newFlow(f0);
      if (!byId[f.from] || !byId[f.to] || f.from === f.to) return;
      flows.push({ ...f, n: i + 1, ref: `F-${pad2(i + 1)}` });
    });
    const risks = (state.risks || []).map((r0, i) => {
      const r = SRAFormat.newRisk(r0);
      const score = r.likelihood && r.impact ? r.likelihood * r.impact : 0;
      return { ...r, ref: `R-${pad2(i + 1)}`, score, level: score ? riskLevel(score).key : 'none' };
    }).filter(r => r.status !== 'Closed');
    risks.sort((a, b) => b.score - a.score || a.ref.localeCompare(b.ref));
    const meta = state.meta || {};
    return { meta: { orgName: String(meta.orgName || '').trim(), assessmentDate: String(meta.assessmentDate || '').trim() }, assets, byId, flows, risks };
  }

  /* ---- Derived facts ------------------------------------------------------ */
  const risksForAsset = (m, id) => m.risks.filter(r => r.assetIds.includes(id));
  const risksForFlow = (m, id) => m.risks.filter(r => r.flowIds.includes(id));
  const unclassified = a => a.kind === 'unknown' || a.zone === 'unknown';
  const noBaa = a => !!a.vendor && (a.baa === 'no' || a.baa === 'unknown');
  const flagged = a => noBaa(a) || a.atRest === 'no' || a.atRest === 'unknown' || a.mfa === 'no' || a.mfa === 'unknown';
  const weak = f => f.inTransit === 'no' || f.inTransit === 'unknown';
  function leaves(m, f) { const A = m.byId[f.from], B = m.byId[f.to]; return !!(A.vendor || B.vendor || A.zone === 'external' || B.zone === 'external'); }
  function statusLines(a) {
    const out = [];
    const who = a.kind === 'person' ? 'Contractor' : 'Vendor';
    if (unclassified(a)) out.push({ t: 'Unclassified: kind or zone not set', c: 'warn' });
    if (a.vendor) out.push(a.baa === 'yes' ? { t: `${who} · BAA on file`, c: 'ok' } : a.baa === 'no' ? { t: `${who} · no BAA`, c: 'bad' } : a.baa === 'unknown' ? { t: `${who} · BAA not confirmed`, c: 'warn' } : { t: who, c: '' });
    else if (a.zone === 'external') out.push({ t: 'Outside the practice', c: '' });
    else out.push({ t: a.location === 'on-site' ? 'On site' : a.location === 'home-remote' ? 'Off site or remote' : 'In-house', c: '' });
    if (a.atRest === 'no') out.push({ t: 'Not encrypted at rest', c: 'bad' });
    if (a.atRest === 'unknown') out.push({ t: 'At rest: not checked', c: 'warn' });
    if (a.mfa === 'no') out.push({ t: 'No MFA', c: 'bad' });
    if (a.mfa === 'unknown') out.push({ t: 'MFA not checked', c: 'warn' });
    return out;
  }
  function facts(m) {
    return {
      systems: m.assets.length,
      flows: m.flows.length,
      out: m.flows.filter(f => leaves(m, f)).length,
      weak: m.flows.filter(weak).length,
      noBaa: m.assets.filter(noBaa).length,
      unclassified: m.assets.filter(unclassified).length,
      findings: m.risks.length
    };
  }
  /* Flags that no risk points at. The report stays in draft until empty. */
  function unlinkedOf(m) {
    const out = [];
    m.assets.forEach(a => {
      if (!flagged(a) || risksForAsset(m, a.id).length) return;
      out.push({ type: 'asset', id: a.id, ref: `#${a.index + 1}`, what: a.name.trim() || 'Unnamed row', why: statusLines(a).filter(x => x.c === 'bad' || x.c === 'warn').map(x => x.t).join(', ') });
    });
    m.flows.forEach(f => {
      if (!weak(f) || risksForFlow(m, f.id).length) return;
      out.push({ type: 'flow', id: f.id, ref: f.ref, what: `${m.byId[f.from].name.trim() || 'Unnamed row'} to ${m.byId[f.to].name.trim() || 'Unnamed row'}`, why: `${ENC[f.inTransit]} in transit` });
    });
    return out;
  }

  /* ---- Simplify: what gets a box, what gets a line, what is folded -------- */
  function simplify(m) {
    const drawn = m.flows.filter(f => f.transport !== 'direct-entry');
    const entry = m.flows.filter(f => f.transport === 'direct-entry');
    const nest = {};
    m.assets.forEach(a => {
      if (a.zone !== 'backup') return;
      const inbound = drawn.filter(f => f.to === a.id && m.byId[f.from].zone !== 'backup');
      if (inbound.length) nest[a.id] = { parent: inbound[0].from, flow: inbound[0] };
    });
    const rep = id => nest[id] ? nest[id].parent : id;
    const edges = [], absorbed = [];
    drawn.forEach(f => {
      if (nest[f.to] && nest[f.to].flow === f) { absorbed.push(f); return; }
      const a = rep(f.from), b = rep(f.to);
      if (a !== b) edges.push({ f, from: a, to: b });
    });
    const touched = {};
    edges.forEach(e => { touched[e.from] = 1; touched[e.to] = 1; });
    const nodes = [], byId = {}, hidden = [];
    m.assets.forEach(a => {
      if (nest[a.id]) return;
      const onlyEntry = a.kind === 'person' && a.zone === 'people' && !touched[a.id] && entry.some(f => f.from === a.id || f.to === a.id);
      if (onlyEntry && !risksForAsset(m, a.id).length && !flagged(a)) { hidden.push(a); return; }
      const col = a.zone === 'external' ? 2 : (a.zone === 'people' || a.zone === 'devices') ? 0 : 1;
      const n = { a, col, copies: [] };
      nodes.push(n); byId[a.id] = n;
    });
    m.assets.forEach(a => { if (nest[a.id] && byId[nest[a.id].parent]) byId[nest[a.id].parent].copies.push({ a, flow: nest[a.id].flow }); });
    const kept = edges.filter(e => byId[e.from] && byId[e.to]);
    const parentOf = {};
    Object.keys(nest).forEach(id => { parentOf[id] = nest[id].parent; });
    return { nodes, byId, edges: kept, hidden, entry, absorbed, parentOf };
  }

  /* ---- Layout: three fixed columns, rows ordered by barycenter ----------- */
  const bandX = c => c * (L.W - L.bandW) / 2;
  function layout(m, v) {
    v.nodes.forEach(n => {
      const a = n.a;
      n.name = wrap(a.name.trim() + (a.count > 1 ? ` ×${a.count}` : '') || 'Unnamed row', 23, 2);
      n.status = statusLines(a);
      let y = 19 + (n.name.length - 1) * 14;
      n.statusY = y + 14;
      if (n.status.length) y = n.statusY + (n.status.length - 1) * 13;
      n.mainH = y + 10;
      n.h = n.mainH;
      if (n.copies.length) {
        let cy = n.mainH + 20;
        n.copies.forEach(c => {
          c.risks = risksForAsset(m, c.a.id);
          c.name = wrap(c.a.name.trim() || 'Unnamed row', c.risks.length ? 19 : 26, 2);
          c.status = statusLines(c.a);
          c.y = cy;
          c.h = c.name.length * 12 + c.status.length * 12 + 7;
          cy += c.h;
        });
        n.h = cy + 2;
      }
    });
    let cols = [[], [], []];
    v.nodes.forEach(n => cols[n.col].push(n));
    const nb = {}, pos = {};
    cols.forEach(c => c.forEach((n, i) => { nb[n.a.id] = []; pos[n.a.id] = (i + 0.5) / c.length; }));
    v.edges.forEach(e => { nb[e.from].push(e.to); nb[e.to].push(e.from); });
    for (let sweep = 0; sweep < 4; sweep++) {
      (sweep % 2 === 0 ? [0, 1, 2] : [2, 1, 0]).forEach(ci => {
        const keyed = cols[ci].map(n => {
          const o = nb[n.a.id].filter(id => v.byId[id].col !== ci);
          return { n, k: o.length ? o.reduce((t, id) => t + pos[id], 0) / o.length : pos[n.a.id] };
        });
        keyed.sort((p, q) => p.k - q.k || p.n.a.index - q.n.a.index);
        cols[ci] = keyed.map(x => x.n);
        cols[ci].forEach((n, i) => { pos[n.a.id] = (i + 0.5) / cols[ci].length; });
      });
    }
    const tot = cols.map(c => c.reduce((t, n) => t + n.h, 0) + Math.max(0, c.length - 1) * L.gap);
    const Hc = Math.max(120, tot[0], tot[1], tot[2]);
    cols.forEach((c, ci) => {
      const k = c.length, extra = Hc - tot[ci];
      let y = L.head + (k ? extra / (2 * k) : 0);
      const between = L.gap + (k ? extra / k : 0);
      c.forEach(n => { n.x = bandX(ci) + L.inset; n.y = Math.round(y); n.cy = n.y + n.mainH / 2; y += n.h + between; });
    });
    const H = Math.round(L.head + Hc + L.foot);
    const mid = cols[1], gaps = [], edgesY = [L.head - 6];
    mid.forEach(n => { edgesY.push(n.y, n.y + n.h); });
    edgesY.push(H - 4);
    for (let i = 0; i < edgesY.length; i += 2) gaps.push({ a: edgesY[i], b: edgesY[i + 1], mid: (edgesY[i] + edgesY[i + 1]) / 2 });

    const E = v.edges.map(e => {
      const A = v.byId[e.from], B = v.byId[e.to], fwd = A.col <= B.col;
      return { f: e.f, S: fwd ? A : B, T: fwd ? B : A, headT: fwd || e.f.twoWay, headS: !fwd || e.f.twoWay, same: A.col === B.col, wp: null };
    });
    E.forEach(e => {
      if (e.same || e.T.col - e.S.col < 2) return;
      const ideal = (e.S.cy + e.T.cy) / 2;
      let best = gaps[0];
      gaps.forEach(g => { if (Math.abs(g.mid - ideal) < Math.abs(best.mid - ideal)) best = g; });
      e.wp = mid.length ? best.mid : ideal;
    });
    const ports = {};
    const port = (n, side, e, end, other) => { const p = ports[n.a.id] || (ports[n.a.id] = { n, L: [], R: [] }); p[side].push({ e, end, other }); };
    E.forEach(e => {
      if (e.same) { const sd = e.S.col === 2 ? 'L' : 'R'; port(e.S, sd, e, 's', e.T.cy); port(e.T, sd, e, 't', e.S.cy); return; }
      port(e.S, 'R', e, 's', e.wp != null ? e.wp : e.T.cy);
      port(e.T, 'L', e, 't', e.wp != null ? e.wp : e.S.cy);
    });
    Object.keys(ports).forEach(id => ['L', 'R'].forEach(side => {
      const p = ports[id], list = p[side], k = list.length;
      if (!k) return;
      list.sort((a, b) => a.other - b.other || a.e.f.n - b.e.f.n);
      const step = k > 1 ? Math.min(11, (p.n.mainH - 14) / (k - 1)) : 0;
      list.forEach((q, i) => { const y = p.n.cy + (i - (k - 1) / 2) * step; if (q.end === 's') q.e.sy = y; else q.e.ty = y; });
    }));
    const curve = (p, q) => { const dx = (q.x - p.x) * 0.5; return [p, { x: p.x + dx, y: p.y }, { x: q.x - dx, y: q.y }, q]; };
    const cstr = c => `C${r1(c[1].x)},${r1(c[1].y)} ${r1(c[2].x)},${r1(c[2].y)} ${r1(c[3].x)},${r1(c[3].y)}`;
    E.forEach(e => {
      if (e.same) {
        const left = e.S.col === 2, x = left ? e.S.x : e.S.x + L.nodeW, bx = x + (left ? -30 : 30);
        const p = { x, y: e.sy }, q = { x, y: e.ty }, c = [p, { x: bx, y: p.y }, { x: bx, y: q.y }, q];
        e.seg = c; e.d = `M${r1(p.x)},${r1(p.y)}${cstr(c)}`;
        e.tipS = { x: p.x, y: p.y, dir: left ? 1 : -1 }; e.tipT = { x: q.x, y: q.y, dir: left ? 1 : -1 };
        return;
      }
      const p = { x: e.S.x + L.nodeW, y: e.sy }, q = { x: e.T.x, y: e.ty };
      if (e.wp != null) {
        const mx = bandX(1) + L.inset, a1 = { x: mx - 8, y: e.wp }, a2 = { x: mx + L.nodeW + 8, y: e.wp }, c1 = curve(p, a1), c2 = curve(a2, q);
        e.seg = c1; e.d = `M${r1(p.x)},${r1(p.y)}${cstr(c1)}L${r1(a2.x)},${r1(a2.y)}${cstr(c2)}`;
      } else {
        const c = curve(p, q); e.seg = c; e.d = `M${r1(p.x)},${r1(p.y)}${cstr(c)}`;
      }
      e.tipS = { x: p.x, y: p.y, dir: -1 }; e.tipT = { x: q.x, y: q.y, dir: 1 };
    });
    const bez = (c, t) => { const u = 1 - t, a = u * u * u, b = 3 * u * u * t, d = 3 * u * t * t, g = t * t * t; return { x: a * c[0].x + b * c[1].x + d * c[2].x + g * c[3].x, y: a * c[0].y + b * c[1].y + d * c[2].y + g * c[3].y }; };
    const placed = [];
    E.forEach(e => {
      const shown = {};
      risksForAsset(m, e.S.a.id).concat(risksForAsset(m, e.T.a.id)).forEach(r => { shown[r.ref] = 1; });
      const extra = risksForFlow(m, e.f.id).filter(r => !shown[r.ref]).map(r => r.ref);
      const parts = [];
      if (e.f.inTransit === 'no') parts.push('not encrypted');
      if (e.f.inTransit === 'unknown') parts.push('not checked');
      if (extra.length) parts.push(extra.join(' '));
      if (!parts.length) return;
      const pt = bez(e.seg, 0.5), text = parts.join(' · '), w = Math.round(text.length * 4.9 + 12), tries = [0, -17, 17, -34, 34];
      for (let i = 0; i < tries.length; i++) {
        const y = pt.y + tries[i];
        if (placed.every(o => Math.abs(o.x - pt.x) > (o.w + w) / 2 + 2 || Math.abs(o.y - y) > 16)) { pt.y = y; break; }
      }
      e.label = { x: Math.round(pt.x), y: Math.round(pt.y), w, text };
      placed.push({ x: pt.x, y: pt.y, w });
    });
    return { H, cols, E };
  }

  /* ---- Build the SVG tree -------------------------------------------------- */
  function build(state) {
    const m = model(state);
    const v = simplify(m);
    const g = layout(m, v);
    const f = facts(m);
    const W = L.nodeW;
    const encClass = fl => fl.inTransit === 'no' ? ' e-no' : fl.inTransit === 'unknown' ? ' e-unknown' : ' e-ok';
    const tip = t => el('polygon', { class: 'tip', points: `${r1(t.x)},${r1(t.y)} ${r1(t.x - t.dir * 6.5)},${r1(t.y - 3.2)} ${r1(t.x - t.dir * 6.5)},${r1(t.y + 3.2)}` });
    const tag = (r, more, x, y, small) => {
      const t = small ? r.ref : `${r.ref} · ${r.level === 'none' ? 'Not rated' : cap(r.level)}${more ? ` +${more}` : ''}`;
      const w = Math.round(t.length * 5.3 + 12), hgt = small ? 13 : 16;
      return el('g', { class: `tag ${r.level}`, transform: `translate(${r1(x - w)},${r1(y)})` },
        el('rect', { width: w, height: hgt, rx: hgt / 2 }),
        el('text', { x: 6, y: small ? 9.5 : 11.5 }, t));
    };
    const label = `Map of where ePHI lives and moves for ${m.meta.orgName || 'the assessed organization'}. ${v.nodes.length} systems, people and outside parties, ${v.edges.length} connections, ${m.risks.length} findings marked.`;
    const children = [];
    COLS.forEach((c, i) => {
      children.push(el('rect', { class: 'band', x: r1(bandX(i)), y: 0, width: L.bandW, height: g.H, rx: 6 }));
      children.push(el('text', { class: 'col-t', x: r1(bandX(i) + L.bandW / 2), y: 18 }, c.t));
      children.push(el('text', { class: 'col-s', x: r1(bandX(i) + L.bandW / 2), y: 31 }, c.s));
    });
    g.E.forEach(e => {
      children.push(el('g', { class: `edge${encClass(e.f)}`, 'data-flow': e.f.id },
        el('path', { class: 'line', d: e.d }),
        e.headT ? tip(e.tipT) : null,
        e.headS ? tip(e.tipS) : null));
    });
    v.nodes.forEach(n => {
      const a = n.a, rs = risksForAsset(m, a.id), top = rs[0];
      const parts = [el('rect', { class: `box${unclassified(a) ? ' unclassified' : ''}`, width: W, height: r1(n.h), rx: 6 })];
      n.name.forEach((ln, i) => parts.push(el('text', { class: 'name', x: 10, y: 19 + i * 14 }, ln)));
      n.status.forEach((st, i) => parts.push(el('text', { class: `st${st.c ? ' ' + st.c : ''}`, x: 10, y: r1(n.statusY + i * 13) }, st.t)));
      if (n.copies.length) {
        parts.push(el('line', { class: 'div', x1: 0, y1: r1(n.mainH), x2: W, y2: r1(n.mainH) }));
        parts.push(el('text', { class: 'cp-l', x: 10, y: r1(n.mainH + 13) }, 'COPIES KEPT'));
        n.copies.forEach(c => {
          const cg = el('g', { class: 'copy', 'data-asset': c.a.id, transform: `translate(0,${r1(c.y)})` });
          c.name.forEach((ln, i) => cg.children.push(el('text', { class: 'cp-n', x: 10, y: 10 + i * 12 }, ln)));
          c.status.forEach((st, i) => cg.children.push(el('text', { class: `st${st.c ? ' ' + st.c : ''}`, x: 10, y: 10 + c.name.length * 12 + i * 12 }, st.t)));
          if (c.risks.length) cg.children.push(tag(c.risks[0], 0, W - 9, 0, true));
          parts.push(cg);
        });
      }
      if (top) parts.push(tag(top, rs.length - 1, W - 8, -8, false));
      children.push(el('g', { class: `node${top ? ' r-' + top.level : ''}`, transform: `translate(${r1(n.x)},${r1(n.y)})`, 'data-asset': a.id }, ...parts));
    });
    g.E.forEach(e => {
      if (!e.label) return;
      children.push(el('g', { class: `lab${encClass(e.f)}`, 'data-flow': e.f.id, transform: `translate(${e.label.x},${e.label.y})` },
        el('rect', { x: r1(-e.label.w / 2), y: -7.5, width: e.label.w, height: 15, rx: 7.5 }),
        el('text', { y: 3 }, e.label.text)));
    });
    const tree = el('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: `0 0 ${L.W} ${g.H}`, class: 'ephi-map', role: 'img', 'aria-label': label }, ...children);
    return { tree, model: m, view: v, facts: f, unlinked: unlinkedOf(m), height: g.H };
  }

  /* ---- Serialize ----------------------------------------------------------- */
  const escText = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const escAttr = s => escText(s).replace(/"/g, '&quot;');
  function toString(node) {
    const attrs = Object.entries(node.attrs).map(([k, v]) => ` ${k}="${escAttr(v)}"`).join('');
    const inner = node.children.map(c => typeof c === 'string' ? escText(c) : toString(c)).join('');
    return `<${node.tag}${attrs}>${inner}</${node.tag}>`;
  }
  function toElement(node, doc) {
    const d = doc || document;
    const e = d.createElementNS('http://www.w3.org/2000/svg', node.tag);
    Object.entries(node.attrs).forEach(([k, v]) => { if (k !== 'xmlns') e.setAttribute(k, v); });
    node.children.forEach(c => e.appendChild(typeof c === 'string' ? d.createTextNode(c) : toElement(c, d)));
    return e;
  }

  /* Legend shared by the workspace and the report. */
  function legendHtml() {
    const line = cls => `<svg width="30" height="10" aria-hidden="true"><line x1="1" y1="5" x2="29" y2="5" class="${cls}"></line></svg>`;
    return `<span>${line('lg-yes')}Encrypted in transit</span><span>${line('lg-no')}Not encrypted</span><span>${line('lg-unk')}Not checked</span><span><svg width="24" height="12" aria-hidden="true"><rect x="1.5" y="1.5" width="21" height="9" rx="2.5" class="lg-box"></rect></svg>Heavy border and tag: a finding</span><span><svg width="24" height="12" aria-hidden="true"><rect x="1.5" y="1.5" width="21" height="9" rx="2.5" class="lg-unc"></rect></svg>Dashed border: unclassified row</span>`;
  }

  return { build, toString, toElement, legendHtml, facts: state => facts(model(state)), unlinked: state => unlinkedOf(model(state)), ENC, L };
})();
if (typeof window !== 'undefined') window.SRAMap = SRAMap;

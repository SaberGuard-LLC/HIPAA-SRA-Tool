const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", sect: '§', nbsp: ' ', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };
const ITALIC_OPEN = '\u0001';
const ITALIC_CLOSE = '\u0002';
const ROMAN = /^(i|ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii|xiii|xiv|xv)$/;
const LABEL = /^\(([a-zA-Z0-9]{1,5})\)\s*/;
const TYPE_MARK = /\s*\((Required|Addressable)\)/;

export function decode(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

export function normalize(s) {
  return String(s)
    .replace(/[’‘]/g, "'").replace(/[“”]/g, '"')
    .replace(/ /g, ' ').replace(/\s+/g, ' ')
    .replace(/§\s*/g, '§ ')
    .trim();
}

function markItalics(inner) {
  const marked = inner
    .replace(/<(I|E T="03"|em|i)(\s[^>]*)?>/gi, ITALIC_OPEN)
    .replace(/<\/(I|E|em|i)>/gi, ITALIC_CLOSE)
    .replace(/<[^>]+>/g, '');
  return normalize(decode(marked));
}

function plain(s) {
  return normalize(s.replace(/[\u0001\u0002]/g, ''));
}

function levelOf(token) {
  if (/^\d+$/.test(token)) return 2;
  if (/^[A-Z]+$/.test(token)) return 4;
  if (ROMAN.test(token)) return 3;
  return 1;
}

function takeLabels(text) {
  const labels = [];
  let rest = text;
  for (;;) {
    const m = LABEL.exec(rest);
    if (!m) break;
    labels.push(m[1]);
    rest = rest.slice(m[0].length);
  }
  return { labels, rest };
}

function takeHeading(text) {
  const m = /^\u0001([^\u0002]*)\u0002\s*/.exec(text);
  if (!m) return { heading: '', type: null, rest: text, found: false };
  let rest = text.slice(m[0].length);
  let raw = plain(m[1]);
  let type = (TYPE_MARK.exec(raw) || [])[1] || null;
  raw = raw.replace(TYPE_MARK, '');
  const trailing = /^\((Required|Addressable)\)\.?\s*/.exec(rest);
  if (trailing) { type = type || trailing[1]; rest = rest.slice(trailing[0].length); }
  return { heading: raw.replace(/[.:]$/, '').trim(), type, rest, found: true };
}

export function paragraphsOf(sectionXml) {
  const out = [];
  const path = [];
  const re = /<P(?:\s[^>]*)?>([\s\S]*?)<\/P>/gi;
  let m;
  while ((m = re.exec(sectionXml))) {
    let rest = markItalics(m[1]);
    for (;;) {
      const taken = takeLabels(rest);
      if (taken.labels.length) {
        path.length = levelOf(taken.labels[0]) - 1;
        taken.labels.forEach(l => path.push(`(${l})`));
      }
      const head = takeHeading(taken.rest);
      const afterDash = head.rest.replace(/^—\s*/, '');
      const continues = head.found && LABEL.test(afterDash);
      const body = continues ? '' : plain(head.rest);
      const labelText = taken.labels.map(l => `(${l})`).join('');
      out.push({
        path: path.join(''),
        depth: path.length,
        heading: head.heading,
        type: head.type,
        body,
        raw: plain(`${labelText} ${body}`)
      });
      if (!continues) break;
      rest = afterDash;
    }
  }
  out.forEach((p, i) => {
    p.children = [];
    for (let j = i + 1; j < out.length; j++) {
      if (!out[j].path.startsWith(p.path) || out[j].depth <= p.depth) break;
      if (out[j].depth === p.depth + 1) p.children.push(out[j]);
    }
  });
  return out;
}

export function sectionsOf(xml) {
  const sections = {};
  const ecfr = /<DIV8[^>]*\bN="(?:§\s*)?(164\.\d+)"[^>]*>([\s\S]*?)<\/DIV8>/g;
  const govinfo = /<SECTION>\s*<SECTNO>§\s*(164\.\d+)<\/SECTNO>([\s\S]*?)<\/SECTION>/g;
  let m;
  while ((m = ecfr.exec(xml))) sections[m[1]] = m[2];
  while ((m = govinfo.exec(xml))) sections[m[1]] = m[2];
  return sections;
}

export function headingOf(sectionXml) {
  const h = /<HEAD>([\s\S]*?)<\/HEAD>/i.exec(sectionXml) || /<SUBJECT>([\s\S]*?)<\/SUBJECT>/i.exec(sectionXml);
  if (!h) return '';
  return normalize(decode(h[1].replace(/<[^>]+>/g, ''))).replace(/^§\s*164\.\d+\s*/, '').replace(/\.$/, '');
}

export function appendixOf(xml) {
  const m = /<DIV9[^>]*>([\s\S]*?)<\/DIV9>/.exec(xml) || /<APPENDIX>([\s\S]*?)<\/APPENDIX>/.exec(xml);
  return m ? normalize(decode(m[1].replace(/<[^>]+>/g, ' '))) : '';
}

export function sectionText(sectionXml) {
  return normalize(decode(sectionXml.replace(/<[^>]+>/g, ' ')));
}

export function lookup(sections, cite) {
  const sec = cite.slice(0, 7);
  const path = cite.slice(7);
  const paras = paragraphsOf(sections[sec] || '');
  return { sec, paras, para: paras.find(p => p.path === path) };
}

export function parentOf(paras, para) {
  return paras.find(p => p.path && p.path !== para.path && para.path.startsWith(p.path) && p.depth === para.depth - 1);
}

export function typeOf(paras, para) {
  if (para.type) return para.type;
  const parent = parentOf(paras, para);
  return parent ? parent.type : null;
}

export function readings(paras, para) {
  const parent = parentOf(paras, para);
  const leadIn = parent && parent.body ? `${parent.body} ` : '';
  const clauses = para.children.map(c => c.raw).join(' ');
  return {
    own: normalize(para.body),
    withLeadIn: normalize(leadIn + para.body),
    withClauses: normalize(`${para.body} ${clauses}`),
    withBoth: normalize(`${leadIn}${para.body} ${clauses}`)
  };
}

export function citesOf(cite) {
  return cite.split(' and ').map((part, i) => (i ? cite.slice(0, 7) + part : part));
}

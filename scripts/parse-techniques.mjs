#!/usr/bin/env node
/**
 * MD -> JSON technique parser for the Martial Arts Encyclopedia app.
 *
 * Reads every *.md file in data/raw/, extracts individual Technique records
 * (never inventing facts that are not literally present in the source text),
 * and writes structured JSON into data/processed/.
 *
 * Re-run any time a new file is dropped into data/raw/ — no code changes
 * needed for a new martial art (id/name are derived from the filename + H1
 * title; add an entry to MARTIAL_ART_ID_MAP only to get a nicer id/English
 * name, otherwise a fallback slug is used automatically).
 *
 *   node scripts/parse-techniques.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const RAW_DIR = path.join(ROOT, 'data', 'raw');
const OUT_DIR = path.join(ROOT, 'data', 'processed');
const FILE_SUFFIX = '_포지션별_기술_백과사전.md';

const MARTIAL_ART_ID_MAP = {
  bjj: { id: 'bjj', nameEn: 'Brazilian Jiu-Jitsu' },
  레슬링: { id: 'wrestling', nameEn: 'Wrestling' },
  무에타이: { id: 'muay-thai', nameEn: 'Muay Thai' },
  킥복싱: { id: 'kickboxing', nameEn: 'Kickboxing' },
  태권도: { id: 'taekwondo', nameEn: 'Taekwondo' },
  가라테: { id: 'karate', nameEn: 'Karate' },
  복싱: { id: 'boxing', nameEn: 'Boxing' },
  삼보: { id: 'sambo', nameEn: 'Sambo' },
  유도: { id: 'judo', nameEn: 'Judo' },
};

// Top-level sections matching any of these substrings are organisational /
// meta content (tables, flow diagrams, tag blocks, appendices, learning
// order) rather than technique catalogues, so their bullet lists are NOT
// turned into new Technique records (learning-order sections are still used
// later to annotate difficulty; tag blocks are still used to annotate tags).
const META_TITLE_PATTERNS = [
  '상황별 기술 선택 지도',
  '학습 순서',
  '초급자가 우선',
  '중급 이후 확장',
  '데이터베이스용 태그',
  '기술 태그',
  '태그 (확장',
  '부록',
  '마무리',
  '분류 체계',
  '학습 원칙',
  '포지션 트리',
  '전환 지도',
  '핵심 연결',
  '거리 전환 흐름도',
  '기술 흐름도',
  '흐름도',
  '전체 포지션 흐름',
  '핵심 차이 요약',
  '경기 규칙이 전술에 미치는 영향',
  '핵심 공격 지도',
];

const LEARNING_ORDER_TITLE_PATTERNS = ['학습 순서', '초급자가 우선', '중급 이후 확장'];
const TAG_TITLE_PATTERNS = ['태그'];

const PURPOSE_LABEL_PATTERNS = ['언제', '왜 쓰', '상황 설명', '언제/왜'];
const TRANSITION_LABEL_PATTERNS = ['연결', '반응', '전환'];
const COUNTER_LABEL_PATTERNS = ['카운터'];
const DEFENSE_LABEL_PATTERNS = ['방어'];

const DESC_DENYLIST = [
  '상대', '때', '경우', '따라', '위해', '통해', '이용', '무너뜜', '무너뜨',
  '만들', '노림', '위험', '목적', '거리', '회전', '유도의', '대응', '준비',
];

// ---------------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------------

function hasHangul(s) {
  return /[가-힣]/.test(s);
}

// Keep Latin, Hangul, Cyrillic (Sambo) and Thai (Muay Thai) scripts so
// technique names written in those native scripts still normalize to a
// non-empty, matchable key instead of collapsing to "" and being dropped.
function normalizeForMatch(s) {
  return s
    .toLowerCase()
    .replace(/\*\*/g, '')
    .replace(/[^a-z0-9ㄱ-ㅣ가-힣Ѐ-ӿ฀-๿]/g, '');
}

function slugify(s) {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function looksLikeNameGloss(seg) {
  const t = seg.trim();
  if (!t || !hasHangul(t)) return false;
  if (t.length > 20) return false;
  if (DESC_DENYLIST.some((w) => t.includes(w))) return false;
  return true;
}

// Extract a short Korean "name gloss" from a parenthetical, distinguishing
// it from a longer descriptive sentence. Only ever returns text that is
// verbatim-present in the source (never invents a translation).
function extractKoreanGloss(paren) {
  if (!paren) return null;
  const trimmed = paren.trim();
  const parts = trimmed
    .split(/,|-{2,3}/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length <= 1) {
    return looksLikeNameGloss(trimmed) ? trimmed : null;
  }
  for (const p of parts) {
    if (looksLikeNameGloss(p) && p.length <= 14) return p;
  }
  return null;
}

// Reject bullets that are really prose sentences (rules commentary, tactical
// notes, scoring explanations) rather than a technique name + short gloss.
// Applied to the *extracted name*, not the raw bullet, so a real technique
// with a long description after "---" or "(...)" is never penalised for the
// description's length.
function isValidTechniqueName(name) {
  const t = name.trim();
  if (!t) return false;
  if (t.length > 120) return false;
  // Strip stray unmatched "**" (a bold span that started mid-sentence, so
  // our start-anchored bold regex never paired it) before checking how the
  // text ends.
  const tEnd = t.replace(/\*+$/, '').trim();
  if (/[:：]\s*$/.test(tEnd)) return false; // trailing label colon, e.g. "채점 기준(...):"
  // Korean sentence-final verb ending (with or without a trailing period) —
  // only applied above a short-phrase length so real short names aren't hit.
  if (/[가-힣](다|음|함|됨|짐|는다|한다)\.?\s*$/.test(tEnd) && tEnd.length > 15) return false;
  if (/[.!?]\s*$/.test(tEnd) && hasHangul(tEnd) && tEnd.length > 40) return false; // long sentence ending in punctuation
  return true;
}

// Subsection labels that are pure glossary/overview listings (category or
// range *names*, not techniques) observed in the source files — their
// bullets are kept as informational context only, never turned into
// Technique records.
const GLOSSARY_ONLY_LABELS = ['포지션(Position)', '4대 거리'];

function uniq(arr) {
  return [...new Set(arr.filter((x) => x !== null && x !== undefined && x !== ''))];
}

// ---------------------------------------------------------------------------
// Pass 1: line-level preprocessing (merge wrapped heading lines)
// ---------------------------------------------------------------------------

function preprocessLines(rawLines) {
  const lines = [];
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i].replace(/\r$/, '');
    const isHeading = /^#{1,6}\s+/.test(line);
    if (isHeading) {
      let merged = line;
      let j = i + 1;
      // Pandoc hard-wraps long headings onto the next line with no marker.
      while (
        j < rawLines.length &&
        rawLines[j].trim() !== '' &&
        !/^#{1,6}\s+/.test(rawLines[j]) &&
        !/^-\s+/.test(rawLines[j]) &&
        !/^```/.test(rawLines[j]) &&
        !/^>/.test(rawLines[j])
      ) {
        merged += ' ' + rawLines[j].trim();
        j++;
      }
      lines.push(merged);
      i = j - 1;
    } else {
      lines.push(line);
    }
  }
  return lines;
}

// ---------------------------------------------------------------------------
// Pass 2: split into top-level sections
// ---------------------------------------------------------------------------

function parseHeading(line) {
  const m = line.match(/^(#{1,6})\s+(.*)$/);
  if (!m) return null;
  const level = m[1].length;
  let title = m[2].trim();
  // strip a trailing "---"-based horizontal rule artifact glued to text, and
  // collapse repeated whitespace introduced by heading-wrap merging.
  title = title.replace(/\s+/g, ' ').trim();
  // Subsections are written "N.M Title" (no trailing dot after M), while
  // top-level sections are written "N. Title" (dot after N only). Try the
  // more specific sub-pattern first so e.g. "1.1 4대 거리" isn't misread as
  // top-level number "1" with title "1 4대 거리".
  const subMatch = title.match(/^(\d+)\.(\d+)\s+(.*)$/);
  const topMatch = !subMatch && title.match(/^(\d+)\.\s*(.*)$/);
  return {
    level,
    rawTitle: title,
    number: subMatch ? subMatch[1] : topMatch ? topMatch[1] : null,
    subNumber: subMatch ? subMatch[2] : null,
    cleanTitle: subMatch ? subMatch[3].trim() : topMatch ? topMatch[2].trim() : title,
  };
}

function splitTopSections(lines) {
  const headingIdx = [];
  for (let i = 0; i < lines.length; i++) {
    const h = parseHeading(lines[i]);
    if (h) headingIdx.push({ i, h });
  }
  if (headingIdx.length === 0) return [];

  // First heading is the document H1 title; skip it as a "section".
  //
  // Non-numbered headings are almost always nested sub-labels ("### 상황
  // 설명", "## 필수 공격", ...) rather than new top-level sections, and
  // heading *level* (#/##/###) is not a reliable signal here — several
  // files mix levels for their own numbered top sections, and some also use
  // level-2 for what are clearly nested "필수 X" labels under a numbered
  // learning-order section. The only non-numbered headings that are
  // genuinely top-level siblings across the whole corpus are the trailing
  // "부록" (appendix) and "마무리" (closing remarks) sections, so those are
  // matched explicitly instead of relying on level.
  const topBoundaries = [];
  for (let k = 1; k < headingIdx.length; k++) {
    const { i, h } = headingIdx[k];
    const isTopNumbered = h.number !== null && h.subNumber === null;
    const isKnownNonNumberedTop = h.number === null && /^(부록|마무리)/.test(h.cleanTitle);
    if (isTopNumbered || isKnownNonNumberedTop) {
      topBoundaries.push({ lineIdx: i, heading: h });
    }
  }

  const sections = [];
  for (let k = 0; k < topBoundaries.length; k++) {
    const start = topBoundaries[k].lineIdx;
    const end = k + 1 < topBoundaries.length ? topBoundaries[k + 1].lineIdx : lines.length;
    sections.push({
      number: topBoundaries[k].heading.number,
      title: topBoundaries[k].heading.cleanTitle || topBoundaries[k].heading.rawTitle,
      startLine: start + 1,
      endLine: end,
    });
  }
  return sections;
}

function splitSubBlocks(lines, startLine, endLine) {
  const blocks = [];
  let cursor = startLine;
  let currentLabel = '__root__';
  let blockStart = startLine;

  const pushBlock = (end) => {
    if (end > blockStart) {
      blocks.push({ label: currentLabel, startLine: blockStart, endLine: end });
    }
  };

  for (let i = startLine; i < endLine; i++) {
    const h = parseHeading(lines[i]);
    if (h) {
      pushBlock(i);
      currentLabel = h.cleanTitle || h.rawTitle;
      blockStart = i + 1;
    }
  }
  pushBlock(endLine);
  return blocks;
}

// ---------------------------------------------------------------------------
// Pass 3: parse a sub-block's raw lines into bullets / paragraphs / code fences
// ---------------------------------------------------------------------------

function parseBlockContent(lines, startLine, endLine) {
  const bullets = []; // { text, indent, variations: [] }
  const paragraphs = [];
  const codeFences = [];
  let paragraphBuf = [];
  let i = startLine;

  const flushParagraph = () => {
    if (paragraphBuf.length) {
      const text = paragraphBuf.join(' ').replace(/\s+/g, ' ').trim();
      paragraphBuf = [];
      if (!text || /^-{3,}$/.test(text)) return;
      // bjj.md (untouched by the step-1 enhancement pass) still uses an
      // older inline style for some technique lists: "라벨: - A - B - C"
      // wrapped across lines, instead of one "- item" per line. Once the
      // wrapped line is rejoined into a single paragraph above, that's a
      // detectable "label: - item - item - item" shape — split it into the
      // same bullet records a normal list would produce, instead of losing
      // every name inside to the prose bucket.
      const inlineListMatch = text.match(/^([^:：]{2,24}):\s*-\s*(.+)$/);
      if (inlineListMatch) {
        const items = inlineListMatch[2]
          .split(/\s+-\s+/)
          .map((s) => s.trim())
          .filter(Boolean);
        if (items.length >= 2) {
          for (const item of items) bullets.push({ text: item, indent: 0, variations: [] });
          return;
        }
      }
      paragraphs.push(text);
    }
  };

  while (i < endLine) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === '' || /^-{3,}$/.test(trimmed)) {
      flushParagraph();
      i++;
      continue;
    }
    if (/^>/.test(trimmed)) {
      // blockquote disclaimer text - not technique data, skip.
      flushParagraph();
      i++;
      continue;
    }
    if (/^```/.test(trimmed)) {
      flushParagraph();
      const fenceLines = [];
      i++;
      while (i < endLine && !/^```/.test(lines[i].trim())) {
        fenceLines.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      codeFences.push(fenceLines.join('\n'));
      continue;
    }

    const bulletMatch = line.match(/^(\s*)-\s+(.*)$/);
    if (bulletMatch) {
      flushParagraph();
      const indent = bulletMatch[1].length;
      let text = bulletMatch[2].trim();
      i++;
      // Merge wrapped continuation lines (no leading '-', not a heading/fence).
      while (
        i < endLine &&
        lines[i].trim() !== '' &&
        !/^\s*-\s+/.test(lines[i]) &&
        !/^#{1,6}\s+/.test(lines[i]) &&
        !/^```/.test(lines[i].trim())
      ) {
        text += ' ' + lines[i].trim();
        i++;
      }
      // Collect deeper-indented nested bullets as raw variation strings.
      const variations = [];
      while (i < endLine) {
        const nested = lines[i].match(/^(\s*)-\s+(.*)$/);
        if (nested && nested[1].length > indent) {
          let nestedText = nested[2].trim();
          i++;
          while (
            i < endLine &&
            lines[i].trim() !== '' &&
            !/^\s*-\s+/.test(lines[i]) &&
            !/^#{1,6}\s+/.test(lines[i])
          ) {
            nestedText += ' ' + lines[i].trim();
            i++;
          }
          variations.push(nestedText.replace(/\s+/g, ' ').trim());
        } else {
          break;
        }
      }
      bullets.push({ text: text.replace(/\s+/g, ' ').trim(), indent, variations });
      continue;
    }

    // Plain text line -> part of a wrapped paragraph.
    paragraphBuf.push(trimmed);
    i++;
  }
  flushParagraph();
  return { bullets, paragraphs, codeFences };
}

// ---------------------------------------------------------------------------
// Pass 4: turn a bullet's raw text into name / koreanName / description / aliases
// ---------------------------------------------------------------------------

// Extract a trailing *balanced* "(...)" group from the end of a string.
// Applied BEFORE any "---"-description splitting, because several files use
// "---" *inside* the parenthetical itself (e.g. "Name (gloss --- longer
// note)") — splitting on "---" first would break the paren apart.
function splitTrailingParen(s) {
  const m = s.match(/^(.*)\(([^()]*)\)\s*$/);
  if (m && m[1].trim()) return { rest: m[1].trim(), paren: m[2].trim() };
  return { rest: s, paren: null };
}

function parseBulletToFields(rawText) {
  let text = rawText.trim();
  let name;
  let rest = '';

  const boldMatch = text.match(/^\*\*(.+?)\*\*\s*(.*)$/);
  if (boldMatch) {
    name = boldMatch[1].trim();
    rest = boldMatch[2].trim().replace(/^[:：\-]+\s*/, '').trim();
  } else {
    name = text;
  }

  // A trailing parenthetical on the name itself: "Name (native/gloss)"
  const { rest: nameNoParen, paren } = splitTrailingParen(name);
  name = nameNoParen;

  // If there was no bold marker (so no "---" split attempted yet), look for
  // a "---" description separator in what's left, now that the paren (and
  // any "---" hidden inside it) has already been safely removed.
  if (!boldMatch) {
    const dashSplit = name.split(/\s+-{2,3}\s+/);
    if (dashSplit.length > 1) {
      name = dashSplit[0].trim();
      rest = dashSplit.slice(1).join(' --- ').trim();
    }
  }

  let koreanName = null;
  let description = rest || '';

  if (paren) {
    const gloss = extractKoreanGloss(paren);
    if (gloss) koreanName = gloss;
    description = description ? `${paren}; ${description}` : paren;
  }

  // Whole-name-is-Korean case (e.g. Taekwondo bullets): name itself is the koreanName.
  const hangulChars = (name.match(/[가-힣]/g) || []).length;
  if (!koreanName && name.length > 0 && hangulChars / name.replace(/\s/g, '').length > 0.7) {
    koreanName = name;
  }

  // "A / B" compound naming -> keep as single technique, expose both as aliases.
  const aliases = [];
  if (name.includes(' / ')) {
    for (const part of name.split(' / ').map((s) => s.trim()).filter(Boolean)) {
      aliases.push(part);
    }
  }

  // "Label: item1, item2, item3" recap bullets (no bold, no trailing paren,
  // no "---") -> keep the label as the technique name and move the listed
  // items into extraVariations instead of leaving the whole comma-list
  // jammed into `name`.
  const extraVariations = [];
  const colonListMatch = name.match(/^([^:：]{2,40})[:：]\s*(.+,.+)$/);
  if (colonListMatch) {
    const list = colonListMatch[2].split(',').map((s) => s.trim()).filter(Boolean);
    if (list.length >= 2) {
      name = colonListMatch[1].trim();
      extraVariations.push(...list);
    }
  }

  // Bare "A, B, C" recap-list bullets (no label prefix, so the colon-list
  // rule above doesn't apply) -> same treatment as "A / B": keep the
  // verbatim text as `name` (never guess which parts are truly distinct
  // techniques) but expose each part as a searchable alias.
  if (aliases.length === 0 && name.includes(',')) {
    const commaParts = name.split(',').map((s) => s.trim()).filter(Boolean);
    if (commaParts.length >= 2 && commaParts.every((p) => p.length <= 40)) {
      aliases.push(...commaParts);
    }
  }

  return { name, koreanName, description: description.trim(), aliases, extraVariations };
}

// ---------------------------------------------------------------------------
// Main per-file extraction
// ---------------------------------------------------------------------------

function resolveMartialArt(fileBase, firstHeadingTitle) {
  // The Korean display name always comes from the document's own H1 title
  // (e.g. "# 주짓수 기술 백과사전 --- ...") rather than the filename, since
  // some files (bjj_...) use an English filename prefix that isn't the
  // Korean name at all.
  const koMatch = firstHeadingTitle && firstHeadingTitle.match(/^#+\s*(.+?)\s*기술 백과사전/);
  const nameKo = koMatch ? koMatch[1].trim() : fileBase;

  if (MARTIAL_ART_ID_MAP[fileBase]) {
    return { id: MARTIAL_ART_ID_MAP[fileBase].id, nameEn: MARTIAL_ART_ID_MAP[fileBase].nameEn, nameKo };
  }
  // Fallback for any future file not yet in the map: derive id from filename.
  return { id: slugify(fileBase), nameEn: null, nameKo };
}

function extractFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const fileBase = path.basename(filePath).replace(FILE_SUFFIX, '');
  const rawLinesOriginal = raw.split('\n');
  const lines = preprocessLines(rawLinesOriginal);

  const martialArt = resolveMartialArt(fileBase, lines[0]);

  const topSections = splitTopSections(lines);
  const warnings = [];

  const techniqueCandidates = []; // pre-dedup
  const categoryEnrichment = {}; // categoryTitle -> { purposeParagraphs, transitions, counters, defenses }
  const learningBuckets = { beginner: [], intermediate: [], advanced: [] };
  const tagVocabulary = [];
  const arrowChains = []; // [fromNameRaw, toNameRaw]

  for (const section of topSections) {
    const isMeta = META_TITLE_PATTERNS.some((p) => section.title.includes(p));
    const isLearningOrder = LEARNING_ORDER_TITLE_PATTERNS.some((p) => section.title.includes(p));
    const isTagSection = TAG_TITLE_PATTERNS.some((p) => section.title.includes(p));

    const subBlocks = splitSubBlocks(lines, section.startLine, section.endLine);

    // Some files put the level in the top-level section title itself
    // ("38. 초급자가 우선 익힐 기술" / "39. 중급 이후 확장") with generically
    // named sub-blocks ("필수 움직임" etc); others put a "학습 순서" top
    // section with the level only on its sub-block labels ("초급 필수").
    // Support both: sub-block label wins when it names a level, otherwise
    // fall back to the section-title level.
    let sectionLevelBucket = null;
    if (section.title.includes('초급')) sectionLevelBucket = 'beginner';
    else if (section.title.includes('중급')) sectionLevelBucket = 'intermediate';
    else if (section.title.includes('고급') || section.title.includes('시범')) sectionLevelBucket = 'advanced';

    const purposeParagraphs = [];
    const transitions = [];
    const counters = [];
    const defenses = [];

    for (const block of subBlocks) {
      const { bullets, paragraphs, codeFences } = parseBlockContent(lines, block.startLine, block.endLine);

      // scan every bullet/paragraph/code line for arrow chains, regardless of section type
      const allTextLines = [
        ...bullets.map((b) => b.text),
        ...paragraphs,
        ...codeFences.flatMap((c) => c.split('\n')),
      ];
      for (const l of allTextLines) {
        if (l.includes('→')) {
          const parts = l
            .split('→')
            .map((s) =>
              s
                .replace(/^[-*\s]+/, '')
                .replace(/\*\*/g, '')
                // drop a trailing "--- explanation" so only the technique
                // name portion is kept for name-matching (each arrow
                // segment except the first may carry its own description).
                .split(/\s+-{2,3}\s+/)[0]
                .trim()
            )
            .filter(Boolean);
          for (let idx = 0; idx < parts.length - 1; idx++) {
            arrowChains.push([parts[idx], parts[idx + 1]]);
          }
        }
      }

      if (isTagSection) {
        // Tag blocks are written inconsistently across files: some are
        // fenced ``` text ``` blocks, some are plain paragraphs; some put
        // one #Tag per line, others pack many "#A #B #C" on one line.
        // Scan every hashtag token wherever it appears in this section.
        const tagText = [...codeFences, ...paragraphs, ...bullets.map((b) => b.text)].join('\n');
        for (const m of tagText.matchAll(/#([A-Za-z0-9가-힣]+)/g)) {
          tagVocabulary.push(m[1]);
        }
        continue;
      }

      if (isLearningOrder) {
        const labelLower = block.label;
        let bucket = null;
        if (labelLower.includes('초급')) bucket = 'beginner';
        else if (labelLower.includes('중급')) bucket = 'intermediate';
        else if (labelLower.includes('고급') || labelLower.includes('시범')) bucket = 'advanced';
        if (!bucket) bucket = sectionLevelBucket;
        if (bucket) {
          for (const b of bullets) {
            const cleaned = b.text.replace(/\*\*/g, '').split(/\s+-{2,3}\s+/)[0].trim();
            learningBuckets[bucket].push(cleaned);
          }
        }
        continue;
      }

      if (isMeta) continue; // other meta sections (tables/diagrams/appendix/etc.) contribute nothing else

      // Regular technique-category section.
      const labelIsPurpose = PURPOSE_LABEL_PATTERNS.some((p) => block.label.includes(p));
      const labelIsTransition = TRANSITION_LABEL_PATTERNS.some((p) => block.label.includes(p));
      const labelIsCounter = COUNTER_LABEL_PATTERNS.some((p) => block.label.includes(p));
      const labelIsDefense = DEFENSE_LABEL_PATTERNS.some((p) => block.label.includes(p));
      const isRootBlock = block.label === '__root__';

      if (isRootBlock || !(labelIsPurpose || labelIsTransition || labelIsCounter || labelIsDefense)) {
        // paragraphs here (if root, before any bullets) also count as purpose context
        if (paragraphs.length) purposeParagraphs.push(...paragraphs);
        const isGlossaryBlock = GLOSSARY_ONLY_LABELS.some((g) => block.label.includes(g));
        for (const b of bullets) {
          const fields = parseBulletToFields(b.text);
          if (!fields.name) continue;
          if (isGlossaryBlock || !isValidTechniqueName(fields.name)) {
            // Not a technique name (glossary entry or full prose sentence) —
            // keep the sentence as category-level context instead of
            // discarding it or fabricating a fake technique record.
            purposeParagraphs.push(b.text);
            continue;
          }
          const { extraVariations, ...restFields } = fields;
          techniqueCandidates.push({
            martialArtId: martialArt.id,
            category: section.title,
            sourceBlockLabel: block.label,
            sourceFile: path.basename(filePath),
            ...restFields,
            variations: uniq([...b.variations, ...extraVariations]),
          });
        }
      } else {
        if (labelIsPurpose) purposeParagraphs.push(...paragraphs);
        if (labelIsTransition) transitions.push(...bullets.map((b) => b.text), ...paragraphs);
        if (labelIsCounter) counters.push(...bullets.map((b) => b.text), ...paragraphs);
        if (labelIsDefense) defenses.push(...bullets.map((b) => b.text), ...paragraphs);
      }
    }

    if (!isMeta) {
      categoryEnrichment[section.title] = { purposeParagraphs, transitions, counters, defenses };
    }
  }

  if (techniqueCandidates.length === 0) {
    warnings.push(`No technique bullets extracted from ${path.basename(filePath)}`);
  }

  return {
    martialArt,
    techniqueCandidates,
    categoryEnrichment,
    learningBuckets,
    tagVocabulary,
    arrowChains,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Pass 5: dedup candidates into final Technique records (per martial art)
// ---------------------------------------------------------------------------

function dedupCandidates(martialArtId, candidates) {
  const groups = new Map();
  for (const c of candidates) {
    const key = normalizeForMatch(c.name);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }

  const idCounts = new Map();
  const techniques = [];
  for (const [key, group] of groups) {
    const first = group[0];
    let baseId = `${martialArtId}__${slugify(first.name)}`;
    const count = idCounts.get(baseId) || 0;
    idCounts.set(baseId, count + 1);
    const id = count === 0 ? baseId : `${baseId}-${count + 1}`;

    const koreanName = group.map((g) => g.koreanName).find(Boolean) || null;
    const description = group.map((g) => g.description).find((d) => d && d.length > 0) || '';
    const aliases = uniq(group.flatMap((g) => g.aliases));
    const variations = uniq(group.flatMap((g) => g.variations));
    const categories = uniq(group.map((g) => g.category));

    techniques.push({
      id,
      martialArt: martialArtId,
      name: first.name,
      koreanName,
      aliases,
      category: categories[0],
      positions: categories,
      description,
      purpose: null,
      principles: [],
      variations,
      counters: [],
      defenses: [],
      transitions: [],
      relatedTechniques: [],
      relatedMartialArts: [],
      difficulty: null,
      tags: [],
      youtubeSearchQuery: null,
      _matchKey: key,
      _sourceFiles: uniq(group.map((g) => g.sourceFile)),
    });
  }
  return techniques;
}

// ---------------------------------------------------------------------------
// Pass 6: enrichment (purpose/principles, transitions/counters/defenses,
// difficulty, tags) using only text that is present in the source file.
// ---------------------------------------------------------------------------

function enrichTechniques(techniques, extraction) {
  const { categoryEnrichment, learningBuckets, tagVocabulary, arrowChains } = extraction;

  // purpose + principles
  for (const t of techniques) {
    const ctx = categoryEnrichment[t.category];
    if (!ctx) continue;
    if (ctx.purposeParagraphs.length) {
      t.purpose = uniq(ctx.purposeParagraphs).join('\n\n');
      const nameKey = normalizeForMatch(t.name);
      const mentioned = ctx.purposeParagraphs.filter((p) => normalizeForMatch(p).includes(nameKey));
      if (mentioned.length) t.principles = uniq(mentioned);
    }
    if (ctx.transitions.length) t.transitions = uniq(ctx.transitions);
    if (ctx.counters.length) t.counters = uniq(ctx.counters);
    if (ctx.defenses.length) t.defenses = uniq(ctx.defenses);
  }

  // difficulty from learning-order sections (name match against this file's own techniques)
  for (const [level, names] of Object.entries(learningBuckets)) {
    for (const rawName of names) {
      const key = normalizeForMatch(rawName.split(/\s+-{2,3}\s+/)[0]);
      const match = techniques.find((t) => key.includes(t._matchKey) || t._matchKey.includes(key));
      if (match && !match.difficulty) match.difficulty = level;
    }
  }

  // tags from the file's own hashtag vocabulary block
  for (const t of techniques) {
    const nameKey = normalizeForMatch(t.name);
    const matchedTags = tagVocabulary.filter((tag) => {
      const tagKey = normalizeForMatch(tag);
      return tagKey === nameKey || tagKey.includes(nameKey) || nameKey.includes(tagKey);
    });
    t.tags = uniq([
      `martialArt:${t.martialArt}`,
      `category:${slugify(t.category)}`,
      ...matchedTags.map((tag) => `#${tag}`),
    ]);
  }

  // arrow-chain based transitions / relatedTechniques (same martial art)
  const byKey = new Map(techniques.map((t) => [t._matchKey, t]));
  for (const [fromRaw, toRaw] of arrowChains) {
    const fromKey = normalizeForMatch(fromRaw);
    const toKey = normalizeForMatch(toRaw);
    const fromT = byKey.get(fromKey);
    const toT = byKey.get(toKey);
    if (fromT && toT && fromT !== toT) {
      if (!fromT.transitions.includes(toT.name)) fromT.transitions.push(toT.name);
      if (!fromT.relatedTechniques.includes(toT.id)) fromT.relatedTechniques.push(toT.id);
      if (!toT.relatedTechniques.includes(fromT.id)) toT.relatedTechniques.push(fromT.id);
    }
  }

  // relatedTechniques from name-mentions inside principles/transitions/counters/defenses text
  for (const t of techniques) {
    const haystack = [...t.principles, ...t.transitions, ...t.counters, ...t.defenses].join(' \n ');
    const haystackKey = normalizeForMatch(haystack);
    if (!haystackKey) continue;
    for (const other of techniques) {
      if (other === t) continue;
      if (other._matchKey.length < 3) continue;
      if (haystackKey.includes(other._matchKey) && !t.relatedTechniques.includes(other.id)) {
        t.relatedTechniques.push(other.id);
      }
    }
  }

  // youtube search query (generated helper string, not a factual claim)
  for (const t of techniques) {
    t.youtubeSearchQuery = `${t.martialArt} ${t.name} technique`.replace(/\s+/g, ' ').trim();
  }

  for (const t of techniques) {
    t.relatedTechniques = uniq(t.relatedTechniques);
  }
}

function linkRelatedMartialArts(allTechniques) {
  const byKey = new Map();
  for (const t of allTechniques) {
    if (!byKey.has(t._matchKey)) byKey.set(t._matchKey, []);
    byKey.get(t._matchKey).push(t);
  }
  for (const [, group] of byKey) {
    if (group.length < 2) continue;
    const martialArts = uniq(group.map((t) => t.martialArt));
    if (martialArts.length < 2) continue;
    for (const t of group) {
      t.relatedMartialArts = martialArts.filter((m) => m !== t.martialArt);
    }
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const REQUIRED_FIELDS = ['id', 'martialArt', 'name', 'category'];
const ARRAY_FIELDS = [
  'aliases', 'positions', 'principles', 'variations', 'counters', 'defenses',
  'transitions', 'relatedTechniques', 'relatedMartialArts', 'tags',
];

function validateTechnique(t, errors) {
  for (const f of REQUIRED_FIELDS) {
    if (!t[f]) errors.push(`[${t.id || '?'}] missing required field "${f}"`);
  }
  for (const f of ARRAY_FIELDS) {
    if (!Array.isArray(t[f])) errors.push(`[${t.id}] field "${f}" is not an array`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  if (!fs.existsSync(RAW_DIR)) {
    console.error(`raw dir not found: ${RAW_DIR}`);
    process.exit(1);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const files = fs
    .readdirSync(RAW_DIR)
    .filter((f) => f.endsWith('.md'))
    .sort();

  if (files.length === 0) {
    console.error(`No .md files found in ${RAW_DIR}`);
    process.exit(1);
  }

  const perFileStats = [];
  const allTechniquesByArt = {};
  const validationErrors = [];
  const allWarnings = [];

  for (const file of files) {
    const filePath = path.join(RAW_DIR, file);
    const extraction = extractFile(filePath);
    const deduped = dedupCandidates(extraction.martialArt.id, extraction.techniqueCandidates);
    enrichTechniques(deduped, extraction);

    allTechniquesByArt[extraction.martialArt.id] = {
      martialArt: extraction.martialArt,
      techniques: deduped,
    };

    for (const t of deduped) validateTechnique(t, validationErrors);

    allWarnings.push(...extraction.warnings.map((w) => `${file}: ${w}`));

    perFileStats.push({
      file,
      martialArtId: extraction.martialArt.id,
      rawCandidates: extraction.techniqueCandidates.length,
      dedupedTechniques: deduped.length,
      arrowChainsFound: extraction.arrowChains.length,
      tagVocabularySize: extraction.tagVocabulary.length,
      difficultyAssigned: deduped.filter((t) => t.difficulty).length,
      purposeAssigned: deduped.filter((t) => t.purpose).length,
      principlesAssigned: deduped.filter((t) => t.principles.length).length,
      relatedTechniquesAssigned: deduped.filter((t) => t.relatedTechniques.length).length,
    });
  }

  // cross-file relatedMartialArts linking
  const flatAll = Object.values(allTechniquesByArt).flatMap((x) => x.techniques);
  linkRelatedMartialArts(flatAll);

  // strip internal-only fields before writing output
  const stripInternal = (t) => {
    const { _matchKey, _sourceFiles, ...rest } = t;
    return rest;
  };

  let totalTechniques = 0;
  for (const [martialArtId, data] of Object.entries(allTechniquesByArt)) {
    const outPath = path.join(OUT_DIR, `${martialArtId}.json`);
    const cleaned = data.techniques.map(stripInternal);
    fs.writeFileSync(
      outPath,
      JSON.stringify({ martialArt: data.martialArt, count: cleaned.length, techniques: cleaned }, null, 2),
      'utf-8'
    );
    totalTechniques += cleaned.length;
  }

  const allCleaned = flatAll.map(stripInternal);
  fs.writeFileSync(
    path.join(OUT_DIR, '_all.json'),
    JSON.stringify({ count: allCleaned.length, techniques: allCleaned }, null, 2),
    'utf-8'
  );

  const meta = {
    generatedAt: new Date().toISOString(),
    sourceFileCount: files.length,
    totalTechniques,
    perFile: perFileStats,
    warnings: allWarnings,
    validationErrorCount: validationErrors.length,
    validationErrors,
  };
  fs.writeFileSync(path.join(OUT_DIR, '_meta.json'), JSON.stringify(meta, null, 2), 'utf-8');

  console.log(`Parsed ${files.length} files -> ${totalTechniques} techniques total.`);
  console.table(
    perFileStats.map((s) => ({
      file: s.file,
      martialArt: s.martialArtId,
      raw: s.rawCandidates,
      deduped: s.dedupedTechniques,
    }))
  );
  if (validationErrors.length) {
    console.warn(`\n${validationErrors.length} validation errors (see data/processed/_meta.json)`);
  }
  if (allWarnings.length) {
    console.warn(`${allWarnings.length} warnings (see data/processed/_meta.json)`);
  }
}

main();

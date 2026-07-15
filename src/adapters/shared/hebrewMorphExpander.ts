/**
 * Expand the OpenScriptures Hebrew morphology grammar and documented TEHMC
 * extensions used by the pinned STEPBible TAHOT corpus.
 *
 * A single leading `H` applies to every slash-delimited morpheme in a word. Each
 * morpheme is parsed independently because its fields depend on its own part of
 * speech. Unknown, incomplete, or unconsumed fields fail closed: returning a
 * partial expansion would make unsupported grammatical claims.
 *
 * Source: the pinned TAHOT source header in scripts/biblical-language-sources.ts,
 * including its Hebrew morphology mapping (TinyURL.com/HebMorph).
 */

const PARTS: Record<string, string> = {
  A: 'Adjective',
  C: 'Conjunction',
  c: 'Sequential Conjunction',
  D: 'Adverb',
  N: 'Noun',
  P: 'Pronoun',
  R: 'Preposition',
  S: 'Suffix',
  T: 'Particle',
  V: 'Verb',
};

const VERB_STEMS: Record<string, string> = {
  q: 'Qal', N: 'Niphal', p: 'Piel', P: 'Pual',
  h: 'Hiphil', H: 'Hophal', t: 'Hithpael', o: 'Polel',
  O: 'Polal', r: 'Hithpolel', m: 'Poel', M: 'Poal',
  k: 'Palel', K: 'Pulal', Q: 'Qal Passive', l: 'Pilpel',
  L: 'Polpal', f: 'Hithpalpel', D: 'Nithpael', j: 'Pealal',
  i: 'Pilel', u: 'Hothpaal', c: 'Tiphil', v: 'Hishtaphel',
  w: 'Nithpalel', y: 'Nithpoel', z: 'Hithpoel',
};

const VERB_FORMS: Record<string, string> = {
  p: 'Perfect', q: 'Sequential Perfect', i: 'Imperfect',
  w: 'Sequential Imperfect', h: 'Cohortative', j: 'Jussive',
  v: 'Imperative', r: 'Participle Active', s: 'Participle Passive',
  a: 'Infinitive Absolute', c: 'Infinitive Construct', u: 'Conjunctive Imperfect',
};

const ADJECTIVE_TYPE: Record<string, string> = {
  a: 'Adjective', c: 'Cardinal Number', g: 'Gentilic', o: 'Ordinal Number',
};
const NOUN_TYPE: Record<string, string> = { c: 'Common', g: 'Gentilic', t: 'Title' };
const PROPER_NAME_TYPE: Record<string, string> = {
  m: 'Masculine', f: 'Feminine', l: 'Location', t: 'Title',
};
const PRONOUN_TYPE: Record<string, string> = {
  d: 'Demonstrative', f: 'Indefinite', i: 'Interrogative', p: 'Personal', r: 'Relative',
};
const PREPOSITION_TYPE: Record<string, string> = { d: 'Definite Article' };
const SUFFIX_TYPE: Record<string, string> = {
  d: 'Directional He', h: 'Paragogic He', n: 'Paragogic Nun', p: 'Pronominal',
};
const PARTICLE_TYPE: Record<string, string> = {
  a: 'Affirmation', c: 'Condition or Consequence', d: 'Definite Article', e: 'Exhortation', i: 'Interrogative',
  j: 'Interjection', m: 'Demonstrative', n: 'Negative', o: 'Direct Object Marker', r: 'Relative',
};

const PERSON: Record<string, string> = { '1': '1st', '2': '2nd', '3': '3rd' };
const GENDER: Record<string, string> = { m: 'Masculine', f: 'Feminine', c: 'Common', b: 'Both' };
const NUMBER: Record<string, string> = { s: 'Singular', p: 'Plural', d: 'Dual' };
const STATE: Record<string, string> = { a: 'Absolute', c: 'Construct', d: 'Determined' };

export function expandHebrewMorphCode(code: string): string | undefined {
  if (!code.startsWith('H') || code.length < 2) return undefined;

  const segments = code.slice(1).split('/');
  if (segments.some(segment => segment.length === 0 || segment.startsWith('H'))) return undefined;

  const expanded = segments.map(expandSegment);
  if (expanded.some(segment => segment === undefined)) return undefined;
  return expanded.join(' / ');
}

function expandSegment(segment: string): string | undefined {
  const partCode = segment[0];
  const part = PARTS[partCode];
  if (!part) return undefined;

  const details = segment.slice(1);
  let fields: string[] | undefined;
  switch (partCode) {
    case 'A':
      fields = parseNominal(details, ADJECTIVE_TYPE);
      break;
    case 'N':
      fields = parseNoun(details);
      break;
    case 'P':
      fields = parsePronoun(details);
      break;
    case 'R':
      fields = details === '' ? [] : parseSingle(details, PREPOSITION_TYPE);
      break;
    case 'S':
      fields = parseSuffix(details);
      break;
    case 'T':
      fields = parseSingle(details, PARTICLE_TYPE);
      break;
    case 'V':
      fields = parseVerb(details);
      break;
    case 'C':
    case 'c':
    case 'D':
      fields = details === '' ? [] : undefined;
      break;
  }

  return fields ? [part, ...fields].join(' ') : undefined;
}

function parseNoun(details: string): string[] | undefined {
  if (details.length === 2 && details[0] === 'p') {
    const properType = PROPER_NAME_TYPE[details[1]];
    return properType ? ['Proper Name', properType] : undefined;
  }
  return parseNominal(details, NOUN_TYPE);
}

function parseNominal(details: string, types: Record<string, string>): string[] | undefined {
  if (details.length < 1 || details.length > 4) return undefined;
  const fields = [types[details[0]]];
  if (details.length >= 2) fields.push(GENDER[details[1]]);
  if (details.length >= 3) fields.push(NUMBER[details[2]]);
  if (details.length >= 4) fields.push(STATE[details[3]]);
  return complete(fields);
}

function parsePronoun(details: string): string[] | undefined {
  if (details.length < 1 || details.length > 4) return undefined;
  const fields = [PRONOUN_TYPE[details[0]]];
  if (details.length >= 2) fields.push(PERSON[details[1]]);
  if (details.length >= 3) fields.push(GENDER[details[2]]);
  if (details.length >= 4) fields.push(NUMBER[details[3]]);
  return complete(fields);
}

function parseSuffix(details: string): string[] | undefined {
  const type = SUFFIX_TYPE[details[0]];
  if (!type) return undefined;
  if (details[0] !== 'p') return details.length === 1 ? [type] : undefined;
  if (details.length !== 4) return undefined;
  return complete([type, PERSON[details[1]], GENDER[details[2]], NUMBER[details[3]]]);
}

function parseVerb(details: string): string[] | undefined {
  if (details.length < 3) return undefined;
  const stem = VERB_STEMS[details[0]];
  const formCode = details[1];
  const form = VERB_FORMS[formCode];
  if (!stem || !form) return undefined;

  if (formCode === 'r' || formCode === 's') {
    if (details.length !== 5) return undefined;
    return complete([stem, form, GENDER[details[2]], NUMBER[details[3]], STATE[details[4]]]);
  }
  if (formCode === 'a' || formCode === 'c') {
    if (details.length === 3) return complete([stem, form, STATE[details[2]]]);
    if (formCode === 'a') return undefined;
  }
  if (details.length !== 5) return undefined;
  const finiteForm = formCode === 'c' ? 'Cohortative' : form;
  return complete([stem, finiteForm, PERSON[details[2]], GENDER[details[3]], NUMBER[details[4]]]);
}

function parseSingle(details: string, values: Record<string, string>): string[] | undefined {
  return details.length === 1 && values[details] ? [values[details]] : undefined;
}

function complete(fields: Array<string | undefined>): string[] | undefined {
  return fields.every((field): field is string => field !== undefined) ? fields : undefined;
}

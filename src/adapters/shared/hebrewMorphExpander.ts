/**
 * Parse Hebrew TAHOT morphology codes programmatically.
 *
 * Extracted from MorphologyRepository for sharing between
 * Node.js (better-sqlite3) and Workers (D1) implementations.
 *
 * Format: H[partOfSpeech][details...] where details vary by part of speech.
 * Verb: HV[stem][form][person][gender][number]
 * Noun/Adj/etc: H[part][type][gender][number][state]
 */

const PARTS: Record<string, string> = {
  V: 'Verb', N: 'Noun', A: 'Adjective', P: 'Pronoun',
  R: 'Preposition', C: 'Conjunction', D: 'Adverb', T: 'Particle',
  S: 'Suffix', I: 'Interjection',
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
  w: 'Sequential Imperfect', v: 'Imperative', a: 'Participle Active',
  s: 'Participle Passive', r: 'Infinitive Construct', o: 'Infinitive Absolute',
  h: 'Cohortative', j: 'Jussive',
};

const PERSON: Record<string, string> = { '1': '1st', '2': '2nd', '3': '3rd' };
const GENDER: Record<string, string> = { m: 'Masculine', f: 'Feminine', c: 'Common', b: 'Both' };
const NUMBER: Record<string, string> = { s: 'Singular', p: 'Plural', d: 'Dual' };
const STATE: Record<string, string> = { a: 'Absolute', c: 'Construct', d: 'Determined' };
const NOUN_TYPE: Record<string, string> = { c: 'Common', p: 'Proper' };

export function expandHebrewMorphCode(code: string): string | undefined {
  if (code.length < 2) return undefined;

  const part = PARTS[code[1]];
  if (!part) return undefined;

  const parts: string[] = [part];
  const rest = code.substring(2);

  if (code[1] === 'V') {
    // Verb: stem, form, person, gender, number
    let i = 0;
    if (i < rest.length && VERB_STEMS[rest[i]]) parts.push(VERB_STEMS[rest[i++]]);
    if (i < rest.length && VERB_FORMS[rest[i]]) parts.push(VERB_FORMS[rest[i++]]);
    if (i < rest.length && PERSON[rest[i]]) parts.push(PERSON[rest[i++]]);
    if (i < rest.length && GENDER[rest[i]]) parts.push(GENDER[rest[i++]]);
    if (i < rest.length && NUMBER[rest[i]]) parts.push(NUMBER[rest[i++]]);
  } else {
    // Non-verb: type, gender, number, state
    let i = 0;
    if (i < rest.length && NOUN_TYPE[rest[i]]) { parts.push(NOUN_TYPE[rest[i++]]); }
    if (i < rest.length && GENDER[rest[i]]) parts.push(GENDER[rest[i++]]);
    if (i < rest.length && NUMBER[rest[i]]) parts.push(NUMBER[rest[i++]]);
    if (i < rest.length && STATE[rest[i]]) parts.push(STATE[rest[i++]]);
  }

  return parts.length > 1 ? parts.join(' ') : undefined;
}

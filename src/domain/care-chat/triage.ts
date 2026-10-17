// Pure triage and library matching for patient care-team questions. No React, no SDK, no
// transport: the same rules run in the browser, in tests and inside the drafting prompt.

import type { EndorsedAnswer } from '../entities/endorsedAnswer';
import type { PatientQuestionRedFlag } from '../entities/patientQuestion';

export interface TriageResult {
  readonly redFlag: PatientQuestionRedFlag;
  readonly reason?: string;
}

const URGENT_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  [/chest pain|pressure in (my|the) chest/i, 'Chest pain reported'],
  [/short(ness)? of breath|can'?t breathe|cannot breathe|trouble breathing/i, 'Breathing difficulty reported'],
  [/fever|temperature of|101|102|103|104|chills/i, 'Possible fever during treatment'],
  [/bleed|blood in/i, 'Bleeding reported'],
  [/faint|passed out|pass out|collapse/i, 'Fainting or collapse reported'],
  [/confus|disoriented|can'?t think straight/i, 'Confusion reported'],
  [/seizure|convuls/i, 'Seizure reported'],
  [/unable to keep|can'?t keep (anything|fluids|food) down|vomiting for/i, 'Unable to keep fluids down'],
  [/suicid|end my life|hurt myself/i, 'Self-harm language'],
];

const PRIORITY_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  [/ibuprofen|advil|aspirin|naproxen|aleve/i, 'Asks about NSAIDs during treatment'],
  [/missed (a|my) dose|forgot (to take|my pill)|double dose/i, 'Missed or doubled medication dose'],
  [/rash|hives|swelling|swollen/i, 'New rash or swelling'],
  [/diarrh|constipat/i, 'Bowel changes during treatment'],
  [/dizz|lightheaded/i, 'Dizziness reported'],
  [/numb|tingl/i, 'Possible neuropathy'],
  [/port|picc|catheter/i, 'Vascular access question'],
];

/** Red-flag triage of the raw question text. URGENT beats PRIORITY beats ROUTINE; the first
 *  matching rule names the reason the care team sees. */
export function triageQuestion(questionText: string): TriageResult {
  const text = questionText.trim();
  for (const [pattern, reason] of URGENT_RULES) {
    if (pattern.test(text)) return { redFlag: 'URGENT', reason };
  }
  for (const [pattern, reason] of PRIORITY_RULES) {
    if (pattern.test(text)) return { redFlag: 'PRIORITY', reason };
  }
  return { redFlag: 'ROUTINE' };
}

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'of', 'to', 'in', 'on', 'at', 'for', 'with', 'about',
  'is', 'are', 'am', 'was', 'were', 'be', 'been', 'do', 'does', 'did', 'can', 'could', 'should',
  'would', 'will', 'i', 'my', 'me', 'we', 'you', 'your', 'it', 'its', 'this', 'that', 'what', 'when',
  'how', 'why', 'have', 'has', 'had', 'get', 'got', 'take', 'ok', 'okay', 'any', 'some', 'still',
  'after', 'before', 'during', 'from', 'than', 'then', 'there', 'here', 'very', 'really', 'just',
]);

export function keywordsOf(text: string): readonly string[] {
  const seen = new Set<string>();
  for (const raw of text.toLowerCase().split(/[^a-z0-9']+/)) {
    const word = raw.replace(/'s$/, '').replace(/s$/, '');
    if (word.length < 3 || STOP_WORDS.has(word) || STOP_WORDS.has(raw)) continue;
    seen.add(word);
  }
  return [...seen];
}

export interface LibraryMatch {
  readonly answer: EndorsedAnswer;
  readonly score: number;
}

/** Loose stem match: equal words, or one is a prefix of the other once both are 4+ letters
 *  ("chemo" ~ "chemotherapy", "nauseou" ~ "nausea"). */
function sameStem(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 4 || b.length < 4) return false;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return long.startsWith(short) || (short.length >= 5 && long.startsWith(short.slice(0, 5)));
}

function hasStem(words: readonly string[], word: string): boolean {
  return words.some((w) => sameStem(w, word));
}

/** The endorsed library answer that best covers the question, or `null` when nothing overlaps
 *  enough to reuse. Topic words weigh more than words in the answer body. */
export function matchEndorsedAnswer(
  questionText: string,
  library: readonly EndorsedAnswer[],
  minScore = 2,
): LibraryMatch | null {
  const words = keywordsOf(questionText);
  if (words.length === 0) return null;
  let best: LibraryMatch | null = null;
  for (const answer of library) {
    const topicWords = keywordsOf(answer.topic);
    const bodyWords = keywordsOf(answer.answerText);
    let score = 0;
    for (const w of words) {
      if (hasStem(topicWords, w)) score += 2;
      else if (hasStem(bodyWords, w)) score += 1;
    }
    if (score >= minScore && (best === null || score > best.score)) best = { answer, score };
  }
  return best;
}

/** A short library topic for a question that is being promoted to the endorsed library. */
export function topicFromQuestion(questionText: string, maxWords = 6): string {
  const words = keywordsOf(questionText).slice(0, maxWords);
  if (words.length === 0) return questionText.trim().slice(0, 60);
  const topic = words.join(' ');
  return topic.charAt(0).toUpperCase() + topic.slice(1);
}

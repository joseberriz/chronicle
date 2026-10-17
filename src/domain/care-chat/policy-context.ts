// Pure helpers that turn the organization's policy pack and endorsed library into the context a
// drafter (LLM or rule-based) works from. Text only — no transport, no React.

import type { EndorsedAnswer } from '../entities/endorsedAnswer';
import type { PolicyPack } from '../entities/policyPack';
import type { TriageResult } from './triage';

/** The pack that governs this patient's organization: the first whose `institution` matches one
 *  of the hints (care team / site names), else the first pack by name. `null` without packs. */
export function selectPolicyPack(
  packs: readonly PolicyPack[],
  institutionHints: readonly (string | undefined)[] = [],
): PolicyPack | null {
  if (packs.length === 0) return null;
  const norm = (s: string): string => s.trim().toLowerCase();
  const hints = institutionHints.filter((h): h is string => typeof h === 'string' && h.trim() !== '').map(norm);
  for (const hint of hints) {
    const exact = packs.find((p) => norm(p.institution) === hint);
    if (exact !== undefined) return exact;
  }
  for (const hint of hints) {
    const partial = packs.find((p) => norm(p.institution).includes(hint) || hint.includes(norm(p.institution)));
    if (partial !== undefined) return partial;
  }
  return [...packs].sort((a, b) => a.packName.localeCompare(b.packName))[0] ?? null;
}

/** Guardrails every draft obeys, regardless of the pack. The pack narrows; it never loosens these. */
export const BASE_ANSWER_RULES: readonly string[] = [
  'You draft replies for a cancer care team to review; the patient never sees your text until a clinician endorses it.',
  'Never diagnose, never change a medication or dose, never contradict the treating team.',
  'Write in plain, warm, second-person language at an 8th-grade reading level. Three short paragraphs at most.',
  'If the question describes an urgent symptom, the first sentence tells the patient to call the triage line now (or emergency services for trouble breathing, chest pain, heavy bleeding or confusion).',
  'Prefer wording from an endorsed library answer when one covers the question; adapt it to the question instead of inventing new guidance.',
  'End with: "This reply was reviewed by your care team. It is not a substitute for an appointment."',
];

export function describePolicyPack(pack: PolicyPack | null): string {
  if (pack === null) return 'No organization policy pack is configured. Apply the base rules only.';
  const lines = [
    `Policy pack: ${pack.packName}`,
    `Institution: ${pack.institution}`,
  ];
  if (pack.description !== undefined && pack.description.trim() !== '') lines.push(`Policy: ${pack.description.trim()}`);
  if (pack.suppressionThreshold !== undefined) {
    lines.push(`Aggregate suppression threshold: ${pack.suppressionThreshold} (never quote counts or statistics about other patients below this).`);
  }
  return lines.join('\n');
}

export function describeLibrary(library: readonly EndorsedAnswer[], max = 12): string {
  if (library.length === 0) return 'The endorsed answer library is empty.';
  return library
    .slice(0, max)
    .map((e) => `- [${e.id}] ${e.topic}: ${e.answerText}`)
    .join('\n');
}

/** The whole system prompt for a draft: rules, pack, triage and library. */
export function buildPolicyContext(input: {
  readonly pack: PolicyPack | null;
  readonly library: readonly EndorsedAnswer[];
  readonly triage: TriageResult;
}): string {
  return [
    'RULES',
    ...BASE_ANSWER_RULES.map((r) => `- ${r}`),
    '',
    'ORGANIZATION POLICY',
    describePolicyPack(input.pack),
    '',
    'TRIAGE',
    `Red flag: ${input.triage.redFlag}${input.triage.reason !== undefined ? ` — ${input.triage.reason}` : ''}`,
    '',
    'ENDORSED LIBRARY (reuse when it fits; cite the id you reused)',
    describeLibrary(input.library),
  ].join('\n');
}

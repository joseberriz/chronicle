// Rule-based drafter: reuses the best endorsed library answer, or writes a conservative
// acknowledgement under the policy pack. Works with no network and no key, and is the fallback
// when the LLM is unreachable, so the review queue never goes empty because a vendor is down.

import type { AnswerDraft, AnswerDrafter, AnswerDraftRequest } from '../../domain/ports/answerDrafter.port';
import type { RepoResult } from '../../domain/shared';
import { matchEndorsedAnswer } from '../../domain/care-chat/triage';

export const RULE_BASED_DRAFTER = 'rule-based';

const URGENT_OPENER =
  "Please call your care team's triage line now. If you have trouble breathing, chest pain, heavy bleeding or new confusion, call emergency services.";

const CLOSING = 'This reply was reviewed by your care team. It is not a substitute for an appointment.';

export function composeRuleBasedBody(request: AnswerDraftRequest): AnswerDraft {
  const match = matchEndorsedAnswer(request.question.questionText, request.library);
  const urgent = request.triage.redFlag === 'URGENT';
  const institution = request.policyPack?.institution ?? 'your care team';
  if (match !== null) {
    const parts = [urgent ? URGENT_OPENER : null, match.answer.answerText.trim(), CLOSING].filter(
      (p): p is string => p !== null,
    );
    return {
      body: parts.join('\n\n'),
      source: 'ENDORSED_LIBRARY',
      matchedAnswerId: match.answer.id,
      drafter: RULE_BASED_DRAFTER,
    };
  }
  const parts = [
    urgent ? URGENT_OPENER : null,
    `Thank you for writing to ${institution}. A member of your care team is reading your question and will reply here with guidance that fits your treatment plan.`,
    urgent
      ? null
      : 'In the meantime, keep taking your medicines as prescribed and note when the symptom started and anything that makes it better or worse, so the team can help you faster.',
    CLOSING,
  ].filter((p): p is string => p !== null);
  return { body: parts.join('\n\n'), source: 'AI_DRAFT', drafter: RULE_BASED_DRAFTER };
}

export class LibraryAnswerDrafter implements AnswerDrafter {
  draft(request: AnswerDraftRequest): Promise<RepoResult<AnswerDraft>> {
    return Promise.resolve({ ok: true, data: composeRuleBasedBody(request) });
  }
}

// Use cases of the clinician review: endorse a draft as-is or with edits, reject it, and promote
// an endorsed reply into the reusable library. The backend has no `reviewerEdits` column, so an
// edited reply is saved INTO `body` — what the patient reads is exactly what the clinician signed.

import type { EndorsedAnswer } from '../../domain/entities/endorsedAnswer';
import type { PatientChatAnswer, PatientChatAnswerId } from '../../domain/entities/patientChatAnswer';
import type { PatientQuestion } from '../../domain/entities/patientQuestion';
import type { EndorsedAnswerRepository } from '../../domain/ports/endorsedAnswer.repository';
import type { PatientChatAnswerRepository } from '../../domain/ports/patientChatAnswer.repository';
import type { RepoResult } from '../../domain/shared';
import { topicFromQuestion } from '../../domain/care-chat/triage';

export interface EndorseAnswerInput {
  readonly answerId: PatientChatAnswerId;
  /** The clinician signing the reply; omitted when the session has no clinician record. */
  readonly reviewerId?: string;
  /** The clinician's modified text. Omitted = endorse the draft unchanged. */
  readonly body?: string;
  readonly now?: () => string;
}

export async function endorseAnswer(
  answers: PatientChatAnswerRepository,
  input: EndorseAnswerInput,
): Promise<RepoResult<PatientChatAnswer>> {
  const body = input.body?.trim();
  if (body !== undefined && body === '') {
    return { ok: false, error: { kind: 'unsupported', message: 'an endorsed reply cannot be empty' } };
  }
  const now = (input.now ?? (() => new Date().toISOString()))();
  return answers.update(input.answerId, {
    status: 'ENDORSED',
    reviewedAt: now,
    ...(input.reviewerId !== undefined ? { reviewedById: input.reviewerId } : {}),
    ...(body !== undefined ? { body } : {}),
  });
}

export function saveAnswerEdits(
  answers: PatientChatAnswerRepository,
  answerId: PatientChatAnswerId,
  body: string,
): Promise<RepoResult<PatientChatAnswer>> {
  const trimmed = body.trim();
  if (trimmed === '') {
    return Promise.resolve({ ok: false, error: { kind: 'unsupported', message: 'a reply cannot be empty' } });
  }
  return answers.update(answerId, { body: trimmed });
}

/** Rejecting removes the draft: the question stays with the care team, unanswered, and the
 *  patient never sees the rejected text. */
export function rejectAnswer(
  answers: PatientChatAnswerRepository,
  answerId: PatientChatAnswerId,
): Promise<RepoResult<void>> {
  return answers.delete(answerId);
}

export interface PromoteAnswerInput {
  readonly answer: PatientChatAnswer;
  readonly question: PatientQuestion | undefined;
  readonly reviewerId: string | undefined;
  readonly now?: () => string;
}

export async function promoteAnswerToLibrary(
  deps: { readonly answers: PatientChatAnswerRepository; readonly library: EndorsedAnswerRepository },
  input: PromoteAnswerInput,
): Promise<RepoResult<EndorsedAnswer>> {
  if (input.answer.status !== 'ENDORSED') {
    return { ok: false, error: { kind: 'unsupported', message: 'only an endorsed reply can be promoted' } };
  }
  if (input.reviewerId === undefined) {
    return {
      ok: false,
      error: { kind: 'unidentified', message: 'no clinician record for this session', detail: 'unavailable:sesion-no-identificada' },
    };
  }
  const now = (input.now ?? (() => new Date().toISOString()))();
  const created = await deps.library.create({
    topic: topicFromQuestion(input.question?.questionText ?? input.answer.body),
    answerText: input.answer.body,
    endorsedById: input.reviewerId,
    endorsedAt: now,
  });
  if (!created.ok) return created;
  const flagged = await deps.answers.update(input.answer.id, { promotedToLibrary: true });
  if (!flagged.ok) return flagged;
  return created;
}

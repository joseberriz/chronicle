// Use case: a patient asks the care team a question. The question is triaged and stored, the
// organization's policy pack and the endorsed library are gathered, a drafter proposes a reply,
// and the reply is stored AWAITING_CLINICIAN_REVIEW. Nothing here is patient-visible until a
// clinician endorses it (see review-answer.ts).

import type { PatientChatAnswer } from '../../domain/entities/patientChatAnswer';
import type { PatientQuestion } from '../../domain/entities/patientQuestion';
import type { PolicyPack } from '../../domain/entities/policyPack';
import type { EndorsedAnswer } from '../../domain/entities/endorsedAnswer';
import type { AnswerDrafter } from '../../domain/ports/answerDrafter.port';
import type { EndorsedAnswerRepository } from '../../domain/ports/endorsedAnswer.repository';
import type { OrgUnitRepository } from '../../domain/ports/orgUnit.repository';
import type { PatientChatAnswerRepository } from '../../domain/ports/patientChatAnswer.repository';
import type { PatientQuestionRepository } from '../../domain/ports/patientQuestion.repository';
import type { PolicyPackRepository } from '../../domain/ports/policyPack.repository';
import type { RepoError, RepoResult } from '../../domain/shared';
import { selectPolicyPack } from '../../domain/care-chat/policy-context';
import { triageQuestion } from '../../domain/care-chat/triage';

export interface SubmitPatientQuestionDeps {
  readonly questions: PatientQuestionRepository;
  readonly answers: PatientChatAnswerRepository;
  readonly policyPacks: PolicyPackRepository;
  readonly library: EndorsedAnswerRepository;
  readonly orgUnits?: OrgUnitRepository;
  readonly drafter: AnswerDrafter;
  readonly now?: () => string;
}

export interface SubmitPatientQuestionInput {
  readonly patientId: string;
  readonly questionText: string;
  /** The patient's care team / site, used to pick the organization's policy pack. */
  readonly careTeamId?: string;
  readonly institutionHints?: readonly (string | undefined)[];
}

export interface SubmitPatientQuestionResult {
  readonly question: PatientQuestion;
  /** The stored draft, or `null` when drafting or storing it failed (`draftError` says why).
   *  The question is kept either way so the care team still sees it. */
  readonly answer: PatientChatAnswer | null;
  readonly draftError: RepoError | null;
  readonly policyPack: PolicyPack | null;
}

async function loadPolicyContext(
  deps: SubmitPatientQuestionDeps,
  input: SubmitPatientQuestionInput,
): Promise<{ pack: PolicyPack | null; library: readonly EndorsedAnswer[] }> {
  const hints: (string | undefined)[] = [...(input.institutionHints ?? [])];
  if (deps.orgUnits !== undefined && input.careTeamId !== undefined && input.careTeamId !== '') {
    const unit = await deps.orgUnits.byId(input.careTeamId).catch(() => null);
    if (unit !== null && unit.ok && unit.data !== null) {
      hints.push(unit.data.name);
      if (unit.data.parentId !== undefined && unit.data.parentId !== '') {
        const parent = await deps.orgUnits.byId(unit.data.parentId).catch(() => null);
        if (parent !== null && parent.ok && parent.data !== null) hints.push(parent.data.name);
      }
    }
  }
  const [packsResult, libraryResult] = await Promise.all([
    deps.policyPacks.listAll().catch(() => null),
    deps.library.listAll().catch(() => null),
  ]);
  const packs = packsResult !== null && packsResult.ok ? packsResult.data.items : [];
  const library = libraryResult !== null && libraryResult.ok ? libraryResult.data.items : [];
  return { pack: selectPolicyPack(packs, hints), library };
}

export async function submitPatientQuestion(
  deps: SubmitPatientQuestionDeps,
  input: SubmitPatientQuestionInput,
): Promise<RepoResult<SubmitPatientQuestionResult>> {
  const questionText = input.questionText.trim();
  if (questionText === '') {
    return { ok: false, error: { kind: 'unsupported', message: 'questionText is required' } };
  }
  const now = (deps.now ?? (() => new Date().toISOString()))();
  const triage = triageQuestion(questionText);
  const created = await deps.questions.create({
    questionText,
    patientId: input.patientId,
    redFlag: triage.redFlag,
    ...(triage.reason !== undefined ? { redFlagReason: triage.reason } : {}),
    navigatorAlerted: triage.redFlag === 'URGENT',
    askedAt: now,
    createdAt: now,
  });
  if (!created.ok) return created;
  const question = created.data;

  const { pack, library } = await loadPolicyContext(deps, input);
  const drafted = await deps.drafter
    .draft({ question, policyPack: pack, library, triage })
    .catch((cause: unknown): RepoResult<never> => ({
      ok: false,
      error: { kind: 'unknown', message: 'drafter threw outside the RepoResult contract', detail: String(cause) },
    }));
  if (!drafted.ok) {
    return { ok: true, data: { question, answer: null, draftError: drafted.error, policyPack: pack } };
  }
  const stored = await deps.answers.create({
    body: drafted.data.body,
    questionId: question.id,
    aiDrafted: drafted.data.source,
    status: 'AWAITING_CLINICIAN_REVIEW',
    promotedToLibrary: false,
    createdAt: now,
  });
  if (!stored.ok) {
    return { ok: true, data: { question, answer: null, draftError: stored.error, policyPack: pack } };
  }
  let finalQuestion = question;
  if (drafted.data.matchedAnswerId !== undefined) {
    const linked = await deps.questions.update(question.id, { matchedAnswerId: drafted.data.matchedAnswerId }).catch(() => null);
    if (linked !== null && linked.ok) finalQuestion = linked.data;
  }
  return { ok: true, data: { question: finalQuestion, answer: stored.data, draftError: null, policyPack: pack } };
}

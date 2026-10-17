// Port for drafting a care-team reply to a patient question. The domain names the contract; an
// LLM adapter or a rule-based adapter in infrastructure fulfils it. PURE: types only.

import type { EndorsedAnswer } from '../entities/endorsedAnswer';
import type { PatientChatAnswerAiDrafted } from '../entities/patientChatAnswer';
import type { PatientQuestion } from '../entities/patientQuestion';
import type { PolicyPack } from '../entities/policyPack';
import type { RepoResult } from '../shared';
import type { TriageResult } from '../care-chat/triage';

export interface AnswerDraftRequest {
  readonly question: PatientQuestion;
  readonly policyPack: PolicyPack | null;
  readonly library: readonly EndorsedAnswer[];
  readonly triage: TriageResult;
}

export interface AnswerDraft {
  /** The proposed reply body. It is NOT patient-visible until a clinician endorses it. */
  readonly body: string;
  /** How the body came to be: generated, or an endorsed library answer reused verbatim. */
  readonly source: Exclude<PatientChatAnswerAiDrafted, 'MANUAL'>;
  /** The endorsed library answer the draft reused or was grounded on, if any. */
  readonly matchedAnswerId?: string;
  /** Which drafter produced it (model name or `rule-based`), for the audit trail. */
  readonly drafter: string;
}

export interface AnswerDrafter {
  draft(request: AnswerDraftRequest): Promise<RepoResult<AnswerDraft>>;
}

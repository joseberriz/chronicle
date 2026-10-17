// Composes the drafter the app runs with: an LLM when `VITE_LLM_API_URL` is configured, with
// the rule-based drafter behind it so a vendor outage still yields a reviewable draft.

import type { AnswerDraft, AnswerDrafter, AnswerDraftRequest } from '../../domain/ports/answerDrafter.port';
import type { RepoResult } from '../../domain/shared';
import { LibraryAnswerDrafter } from './library-answer-drafter';
import { OpenAiAnswerDrafter } from './openai-answer-drafter';

export { LibraryAnswerDrafter } from './library-answer-drafter';
export { OpenAiAnswerDrafter } from './openai-answer-drafter';

export interface AnswerDrafterEnv {
  readonly apiUrl?: string;
  readonly apiKey?: string;
  readonly model?: string;
}

export const DEFAULT_LLM_MODEL = 'gpt-4o-mini';

export class FallbackAnswerDrafter implements AnswerDrafter {
  constructor(
    private readonly primary: AnswerDrafter,
    private readonly fallback: AnswerDrafter,
    private readonly onFallback: (error: RepoResult<never>) => void = () => undefined,
  ) {}

  async draft(request: AnswerDraftRequest): Promise<RepoResult<AnswerDraft>> {
    const first = await this.primary.draft(request);
    if (first.ok) return first;
    this.onFallback(first);
    return this.fallback.draft(request);
  }
}

export function createAnswerDrafter(env: AnswerDrafterEnv): AnswerDrafter {
  const library = new LibraryAnswerDrafter();
  const apiUrl = env.apiUrl?.trim() ?? '';
  if (apiUrl === '') return library;
  const llm = new OpenAiAnswerDrafter({ apiUrl, apiKey: env.apiKey, model: env.model?.trim() || DEFAULT_LLM_MODEL });
  return new FallbackAnswerDrafter(llm, library, (failed) => {
    console.warn('[care-chat] LLM draft failed; using the rule-based draft instead:', failed.error.kind, failed.error.message);
  });
}

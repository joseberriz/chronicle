// LLM drafter over an OpenAI-compatible `chat/completions` endpoint (OpenAI, Azure OpenAI,
// Ollama, vLLM, a proxy…). The policy pack, triage and endorsed library travel in the system
// prompt; the model answers in JSON so the draft can cite the library answer it reused.

import type { AnswerDraft, AnswerDrafter, AnswerDraftRequest } from '../../domain/ports/answerDrafter.port';
import type { RepoError, RepoResult } from '../../domain/shared';
import { buildPolicyContext } from '../../domain/care-chat/policy-context';

export interface OpenAiAnswerDrafterOptions {
  /** Full URL of the chat-completions endpoint, e.g. `https://api.openai.com/v1/chat/completions`. */
  readonly apiUrl: string;
  /** Bearer token. Optional: a proxy that injects the key server-side needs none here. */
  readonly apiKey?: string;
  readonly model: string;
  readonly fetchFn?: typeof fetch;
  readonly timeoutMs?: number;
}

interface ChatCompletionResponse {
  choices?: ReadonlyArray<{ message?: { content?: string | null } }>;
}

interface DraftPayload {
  answer: string;
  matchedAnswerId?: string;
}

function fail(kind: RepoError['kind'], message: string, detail?: string): RepoResult<never> {
  return { ok: false, error: { kind, message, ...(detail !== undefined ? { detail } : {}) } };
}

function parseDraftPayload(content: string): DraftPayload | null {
  const trimmed = content.trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const answer = (parsed as { answer?: unknown }).answer;
    if (typeof answer !== 'string' || answer.trim() === '') return null;
    const matched = (parsed as { matchedAnswerId?: unknown }).matchedAnswerId;
    return {
      answer: answer.trim(),
      ...(typeof matched === 'string' && matched.trim() !== '' ? { matchedAnswerId: matched.trim() } : {}),
    };
  } catch {
    return trimmed === '' ? null : { answer: trimmed };
  }
}

export function buildDraftMessages(request: AnswerDraftRequest): ReadonlyArray<{ role: 'system' | 'user'; content: string }> {
  return [
    {
      role: 'system',
      content:
        buildPolicyContext({ pack: request.policyPack, library: request.library, triage: request.triage }) +
        '\n\nRespond with a single JSON object: {"answer": string, "matchedAnswerId": string | null}. ' +
        '`matchedAnswerId` is the id of the endorsed library answer you reused or adapted, or null.',
    },
    { role: 'user', content: `Patient question:\n${request.question.questionText.trim()}` },
  ];
}

export class OpenAiAnswerDrafter implements AnswerDrafter {
  constructor(private readonly options: OpenAiAnswerDrafterOptions) {}

  async draft(request: AnswerDraftRequest): Promise<RepoResult<AnswerDraft>> {
    const fetchFn = this.options.fetchFn ?? globalThis.fetch;
    if (typeof fetchFn !== 'function') return fail('unsupported', 'fetch is not available in this runtime');
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller === null ? null : setTimeout(() => controller.abort(), this.options.timeoutMs ?? 30_000);
    try {
      const response = await fetchFn(this.options.apiUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.options.apiKey !== undefined && this.options.apiKey !== '' ? { authorization: `Bearer ${this.options.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: this.options.model,
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages: buildDraftMessages(request),
        }),
        ...(controller !== null ? { signal: controller.signal } : {}),
      });
      if (!response.ok) {
        const kind: RepoError['kind'] =
          response.status === 401 || response.status === 403 ? 'unauthorized'
          : response.status === 429 ? 'rate-limited'
          : response.status >= 500 ? 'server'
          : 'transport';
        return fail(kind, `LLM endpoint answered HTTP ${response.status}`, await response.text().catch(() => undefined));
      }
      const json = (await response.json()) as ChatCompletionResponse;
      const content = json.choices?.[0]?.message?.content ?? null;
      if (content === null) return fail('transport', 'LLM response carried no message content');
      const payload = parseDraftPayload(content);
      if (payload === null) return fail('transport', 'LLM response was not a usable draft', content.slice(0, 200));
      const matched = payload.matchedAnswerId !== undefined ? request.library.find((e) => e.id === payload.matchedAnswerId) : undefined;
      return {
        ok: true,
        data: {
          body: payload.answer,
          source: 'AI_DRAFT',
          ...(matched !== undefined ? { matchedAnswerId: matched.id } : {}),
          drafter: this.options.model,
        },
      };
    } catch (cause) {
      const aborted = typeof cause === 'object' && cause !== null && (cause as { name?: string }).name === 'AbortError';
      return fail(aborted ? 'transport' : 'network', aborted ? 'LLM request timed out' : 'LLM request failed before a response', String(cause));
    } finally {
      if (timer !== null) clearTimeout(timer);
    }
  }
}

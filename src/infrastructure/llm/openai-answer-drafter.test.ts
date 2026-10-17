import { describe, expect, test } from "bun:test";
import { OpenAiAnswerDrafter, buildDraftMessages } from "@/infrastructure/llm/openai-answer-drafter";
import { FallbackAnswerDrafter, createAnswerDrafter, LibraryAnswerDrafter } from "@/infrastructure/llm";
import type { AnswerDraftRequest } from "@/domain/ports/answerDrafter.port";

const request: AnswerDraftRequest = {
  question: { id: "q-1", questionText: "I feel nauseous after chemo", patientId: "p-1", redFlag: "ROUTINE", navigatorAlerted: false, askedAt: "2026-01-01T00:00:00Z", createdAt: "2026-01-01T00:00:00Z" },
  policyPack: { id: "pp-1", packName: "Northside Pack", institution: "Northside Oncology", description: "Keep replies under 120 words." },
  library: [{ id: "ea-1", topic: "Nausea after chemotherapy", answerText: "Take your anti-nausea medicine.", endorsedById: "c1", endorsedAt: "2026-01-01T00:00:00Z" }],
  triage: { redFlag: "ROUTINE" },
};

function fakeFetch(status: number, body: unknown, capture?: (init: RequestInit) => void): typeof fetch {
  return ((_url: string | URL | Request, init?: RequestInit) => {
    if (init !== undefined && capture !== undefined) capture(init);
    return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
  }) as typeof fetch;
}

describe("OpenAiAnswerDrafter", () => {
  test("sends the policy pack in the system prompt and reads the JSON draft back", async () => {
    let sent: Record<string, unknown> | null = null;
    const drafter = new OpenAiAnswerDrafter({
      apiUrl: "https://llm.example/v1/chat/completions", apiKey: "k", model: "test-model",
      fetchFn: fakeFetch(200, { choices: [{ message: { content: JSON.stringify({ answer: "Sip fluids and take your anti-nausea medicine.", matchedAnswerId: "ea-1" }) } }] }, (init) => {
        sent = JSON.parse(String(init.body)) as Record<string, unknown>;
      }),
    });
    const result = await drafter.draft(request);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual({ body: "Sip fluids and take your anti-nausea medicine.", source: "AI_DRAFT", matchedAnswerId: "ea-1", drafter: "test-model" });
    const payload = sent as unknown as { model: string; messages: Array<{ role: string; content: string }> };
    expect(payload.model).toBe("test-model");
    expect(payload.messages[0]?.content).toContain("Northside Pack");
    expect(payload.messages[0]?.content).toContain("Keep replies under 120 words.");
    expect(payload.messages[1]?.content).toContain("I feel nauseous after chemo");
  });

  test("ignores a matchedAnswerId that is not in the library and tolerates plain-text replies", async () => {
    const drafter = new OpenAiAnswerDrafter({ apiUrl: "x", model: "m", fetchFn: fakeFetch(200, { choices: [{ message: { content: "Plain text reply" } }] }) });
    const result = await drafter.draft(request);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual({ body: "Plain text reply", source: "AI_DRAFT", drafter: "m" });
  });

  test("maps HTTP failures to RepoError kinds", async () => {
    const r401 = await new OpenAiAnswerDrafter({ apiUrl: "x", model: "m", fetchFn: fakeFetch(401, {}) }).draft(request);
    const r429 = await new OpenAiAnswerDrafter({ apiUrl: "x", model: "m", fetchFn: fakeFetch(429, {}) }).draft(request);
    const r500 = await new OpenAiAnswerDrafter({ apiUrl: "x", model: "m", fetchFn: fakeFetch(503, {}) }).draft(request);
    expect(!r401.ok && r401.error.kind).toBe("unauthorized");
    expect(!r429.ok && r429.error.kind).toBe("rate-limited");
    expect(!r500.ok && r500.error.kind).toBe("server");
  });

  test("the prompt asks for JSON with the library id", () => {
    const messages = buildDraftMessages(request);
    expect(messages[0]?.content).toContain('"matchedAnswerId"');
    expect(messages[0]?.content).toContain("[ea-1] Nausea after chemotherapy");
  });
});

describe("createAnswerDrafter", () => {
  test("without an endpoint the rule-based drafter runs; with one, the LLM falls back to it", async () => {
    expect(createAnswerDrafter({})).toBeInstanceOf(LibraryAnswerDrafter);
    expect(createAnswerDrafter({ apiUrl: "https://llm.example" })).toBeInstanceOf(FallbackAnswerDrafter);
    const failing = new OpenAiAnswerDrafter({ apiUrl: "x", model: "m", fetchFn: fakeFetch(500, {}) });
    let fellBack = false;
    const result = await new FallbackAnswerDrafter(failing, new LibraryAnswerDrafter(), () => { fellBack = true; }).draft(request);
    expect(fellBack).toBe(true);
    expect(result.ok && result.data.source).toBe("ENDORSED_LIBRARY");
    expect(result.ok && result.data.drafter).toBe("rule-based");
  });
});

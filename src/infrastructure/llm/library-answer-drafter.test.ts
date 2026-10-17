import { describe, expect, test } from "bun:test";
import { LibraryAnswerDrafter } from "@/infrastructure/llm/library-answer-drafter";
import type { AnswerDraftRequest } from "@/domain/ports/answerDrafter.port";

const base: AnswerDraftRequest = {
  question: { id: "q-1", questionText: "Bad nausea after chemotherapy and a fever of 102", patientId: "p-1", redFlag: "URGENT", navigatorAlerted: true, askedAt: "2026-01-01T00:00:00Z", createdAt: "2026-01-01T00:00:00Z" },
  policyPack: { id: "pp-1", packName: "Northside Pack", institution: "Northside Oncology" },
  library: [{ id: "ea-1", topic: "Nausea after chemotherapy", answerText: "Take your anti-nausea medicine as prescribed.", endorsedById: "c1", endorsedAt: "2026-01-01T00:00:00Z" }],
  triage: { redFlag: "URGENT", reason: "Possible fever during treatment" },
};

describe("LibraryAnswerDrafter", () => {
  test("reuses the matching library answer and leads with the urgent instruction", async () => {
    const result = await new LibraryAnswerDrafter().draft(base);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.source).toBe("ENDORSED_LIBRARY");
    expect(result.data.matchedAnswerId).toBe("ea-1");
    expect(result.data.body.startsWith("Please call your care team's triage line now.")).toBe(true);
    expect(result.data.body).toContain("anti-nausea medicine");
    expect(result.data.body).toContain("reviewed by your care team");
  });

  test("without a match it writes a conservative acknowledgement naming the institution", async () => {
    const result = await new LibraryAnswerDrafter().draft({
      ...base,
      question: { ...base.question, questionText: "Can my daughter come to the appointment?" },
      triage: { redFlag: "ROUTINE" },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.source).toBe("AI_DRAFT");
    expect(result.data.matchedAnswerId).toBeUndefined();
    expect(result.data.body).toContain("Northside Oncology");
    expect(result.data.body).not.toContain("triage line now");
  });
});

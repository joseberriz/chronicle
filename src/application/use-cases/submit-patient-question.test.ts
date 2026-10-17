import { describe, expect, test } from "bun:test";
import { submitPatientQuestion } from "@/application/use-cases/submit-patient-question";
import { endorseAnswer, promoteAnswerToLibrary, rejectAnswer } from "@/application/use-cases/review-answer";
import type { AnswerDrafter } from "@/domain/ports/answerDrafter.port";
import type { PatientChatAnswer } from "@/domain/entities/patientChatAnswer";
import type { PatientQuestion } from "@/domain/entities/patientQuestion";
import type { EndorsedAnswer } from "@/domain/entities/endorsedAnswer";
import type { PatientChatAnswerRepository } from "@/domain/ports/patientChatAnswer.repository";
import type { PatientQuestionRepository } from "@/domain/ports/patientQuestion.repository";
import type { PolicyPackRepository } from "@/domain/ports/policyPack.repository";
import type { EndorsedAnswerRepository } from "@/domain/ports/endorsedAnswer.repository";

const NOW = "2026-01-02T03:04:05.000Z";

/** A drafter that reuses the first library answer, the way the rule-based adapter does. */
const libraryDrafter: AnswerDrafter = {
  draft: (req) => {
    const hit = req.library[0];
    const opener = req.triage.redFlag === "URGENT" ? "Call the triage line now. " : "";
    return Promise.resolve(
      hit === undefined
        ? { ok: true, data: { body: `${opener}The care team will reply soon.`, source: "AI_DRAFT", drafter: "fake" } }
        : { ok: true, data: { body: opener + hit.answerText, source: "ENDORSED_LIBRARY", matchedAnswerId: hit.id, drafter: "fake" } },
    );
  },
};

function fakeStore() {
  const questions: PatientQuestion[] = [];
  const answers: PatientChatAnswer[] = [];
  const library: EndorsedAnswer[] = [
    { id: "ea-1", topic: "Nausea after chemotherapy", answerText: "Take your anti-nausea medicine as prescribed.", endorsedById: "c1", endorsedAt: NOW },
  ];
  const page = <T,>(items: T[]) => ({ ok: true as const, data: { items, total: items.length, hasMore: false } });
  const notImpl = () => Promise.reject(new Error("not used"));
  const questionsRepo: PatientQuestionRepository = {
    list: () => Promise.resolve(page(questions)),
    listAll: () => Promise.resolve(page(questions)),
    byId: (id) => Promise.resolve({ ok: true, data: questions.find((q) => q.id === id) ?? null }),
    create: (input) => {
      const q: PatientQuestion = {
        id: `q-${questions.length + 1}`, questionText: input.questionText ?? "", patientId: input.patientId ?? "",
        redFlag: input.redFlag ?? "ROUTINE", redFlagReason: input.redFlagReason, matchedAnswerId: input.matchedAnswerId,
        navigatorAlerted: input.navigatorAlerted ?? false, askedAt: input.askedAt ?? NOW, createdAt: input.createdAt ?? NOW,
      };
      questions.push(q);
      return Promise.resolve({ ok: true, data: q });
    },
    update: (id, patch) => {
      const q = questions.find((x) => x.id === id)!;
      Object.assign(q, patch);
      return Promise.resolve({ ok: true, data: q });
    },
    delete: notImpl,
  };
  const answersRepo: PatientChatAnswerRepository = {
    list: () => Promise.resolve(page(answers)),
    listAll: () => Promise.resolve(page(answers)),
    byId: (id) => Promise.resolve({ ok: true, data: answers.find((a) => a.id === id) ?? null }),
    create: (input) => {
      const a: PatientChatAnswer = {
        id: `a-${answers.length + 1}`, body: input.body ?? "", questionId: input.questionId ?? "", aiDrafted: input.aiDrafted ?? "MANUAL",
        status: input.status ?? "AWAITING_CLINICIAN_REVIEW", promotedToLibrary: input.promotedToLibrary ?? false, createdAt: input.createdAt ?? NOW,
      };
      answers.push(a);
      return Promise.resolve({ ok: true, data: a });
    },
    update: (id, patch) => {
      const a = answers.find((x) => x.id === id)!;
      Object.assign(a, patch);
      return Promise.resolve({ ok: true, data: a });
    },
    delete: (id) => {
      const i = answers.findIndex((x) => x.id === id);
      if (i >= 0) answers.splice(i, 1);
      return Promise.resolve({ ok: true, data: undefined });
    },
  };
  const policyPacksRepo: PolicyPackRepository = {
    list: () => Promise.resolve(page([{ id: "pp-1", packName: "Northside Pack", institution: "Northside Oncology", description: "Be brief." }])),
    listAll: () => Promise.resolve(page([{ id: "pp-1", packName: "Northside Pack", institution: "Northside Oncology", description: "Be brief." }])),
    byId: notImpl, create: notImpl, update: notImpl, delete: notImpl,
  };
  const libraryRepo: EndorsedAnswerRepository = {
    list: () => Promise.resolve(page(library)),
    listAll: () => Promise.resolve(page(library)),
    byId: notImpl,
    create: (input) => {
      const e: EndorsedAnswer = { id: `ea-${library.length + 1}`, topic: input.topic ?? "", answerText: input.answerText ?? "", endorsedById: input.endorsedById ?? "", endorsedAt: input.endorsedAt ?? NOW };
      library.push(e);
      return Promise.resolve({ ok: true, data: e });
    },
    update: notImpl, delete: notImpl,
  };
  return { questions, answers, library, questionsRepo, answersRepo, policyPacksRepo, libraryRepo };
}

describe("submitPatientQuestion", () => {
  test("stores the triaged question and a draft awaiting clinician review, grounded on the pack", async () => {
    const s = fakeStore();
    const seen: string[] = [];
    const drafter: AnswerDrafter = {
      draft: (req) => {
        seen.push(req.policyPack?.packName ?? "none", String(req.library.length), req.triage.redFlag);
        return Promise.resolve({ ok: true, data: { body: "Drafted reply", source: "AI_DRAFT", matchedAnswerId: "ea-1", drafter: "test-model" } });
      },
    };
    const result = await submitPatientQuestion(
      { questions: s.questionsRepo, answers: s.answersRepo, policyPacks: s.policyPacksRepo, library: s.libraryRepo, drafter, now: () => NOW },
      { patientId: "p-1", questionText: "I feel nauseous after chemo, can I take ibuprofen?", institutionHints: ["Northside Oncology"] },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(seen).toEqual(["Northside Pack", "1", "PRIORITY"]);
    expect(result.data.question.redFlag).toBe("PRIORITY");
    expect(result.data.question.matchedAnswerId).toBe("ea-1");
    expect(result.data.answer).toMatchObject({ body: "Drafted reply", aiDrafted: "AI_DRAFT", status: "AWAITING_CLINICIAN_REVIEW", questionId: "q-1" });
    expect(result.data.draftError).toBeNull();
  });

  test("keeps the question when the drafter fails and reports why", async () => {
    const s = fakeStore();
    const drafter: AnswerDrafter = { draft: () => Promise.resolve({ ok: false, error: { kind: "network", message: "down" } }) };
    const result = await submitPatientQuestion(
      { questions: s.questionsRepo, answers: s.answersRepo, policyPacks: s.policyPacksRepo, library: s.libraryRepo, drafter },
      { patientId: "p-1", questionText: "What time is my infusion?" },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(s.questions).toHaveLength(1);
    expect(result.data.answer).toBeNull();
    expect(result.data.draftError?.kind).toBe("network");
  });

  test("urgent questions alert the navigator; a library reuse is stored as ENDORSED_LIBRARY and linked", async () => {
    const s = fakeStore();
    const result = await submitPatientQuestion(
      { questions: s.questionsRepo, answers: s.answersRepo, policyPacks: s.policyPacksRepo, library: s.libraryRepo, drafter: libraryDrafter },
      { patientId: "p-1", questionText: "Bad nausea after chemotherapy and a fever of 102" },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.question).toMatchObject({ redFlag: "URGENT", navigatorAlerted: true, matchedAnswerId: "ea-1" });
    expect(result.data.answer?.aiDrafted).toBe("ENDORSED_LIBRARY");
    expect(result.data.answer?.body).toContain("Call the triage line now");
    expect(result.data.answer?.body).toContain("anti-nausea medicine");
  });

  test("rejects a blank question without writing", async () => {
    const s = fakeStore();
    const result = await submitPatientQuestion(
      { questions: s.questionsRepo, answers: s.answersRepo, policyPacks: s.policyPacksRepo, library: s.libraryRepo, drafter: libraryDrafter },
      { patientId: "p-1", questionText: "   " },
    );
    expect(result.ok).toBe(false);
    expect(s.questions).toHaveLength(0);
  });
});

describe("clinician review", () => {
  test("endorse with edits replaces the body and stamps the reviewer; promote adds a library row", async () => {
    const s = fakeStore();
    await s.answersRepo.create({ body: "draft", questionId: "q-1", aiDrafted: "AI_DRAFT", status: "AWAITING_CLINICIAN_REVIEW", promotedToLibrary: false, createdAt: NOW });
    await s.questionsRepo.create({ questionText: "Can I swim with my port?", patientId: "p-1", redFlag: "ROUTINE", navigatorAlerted: false, askedAt: NOW, createdAt: NOW });
    const endorsed = await endorseAnswer(s.answersRepo, { answerId: "a-1", reviewerId: "c-9", body: "  Edited reply ", now: () => NOW });
    expect(endorsed.ok).toBe(true);
    expect(s.answers[0]).toMatchObject({ body: "Edited reply", status: "ENDORSED", reviewedById: "c-9", reviewedAt: NOW });

    const promoted = await promoteAnswerToLibrary({ answers: s.answersRepo, library: s.libraryRepo }, { answer: s.answers[0]!, question: s.questions[0], reviewerId: "c-9", now: () => NOW });
    expect(promoted.ok).toBe(true);
    expect(s.library.at(-1)).toMatchObject({ topic: "Swim port", answerText: "Edited reply", endorsedById: "c-9" });
    expect(s.answers[0]?.promotedToLibrary).toBe(true);
  });

  test("endorse unchanged keeps the draft body; empty edits are refused; reject deletes", async () => {
    const s = fakeStore();
    await s.answersRepo.create({ body: "draft", questionId: "q-1", aiDrafted: "AI_DRAFT", status: "AWAITING_CLINICIAN_REVIEW", promotedToLibrary: false, createdAt: NOW });
    expect((await endorseAnswer(s.answersRepo, { answerId: "a-1", body: "   " })).ok).toBe(false);
    const ok = await endorseAnswer(s.answersRepo, { answerId: "a-1" });
    expect(ok.ok).toBe(true);
    expect(s.answers[0]).toMatchObject({ body: "draft", status: "ENDORSED" });
    expect(s.answers[0]?.reviewedById).toBeUndefined();
    await rejectAnswer(s.answersRepo, "a-1");
    expect(s.answers).toHaveLength(0);
  });

  test("promotion needs an endorsed reply and an identified clinician", async () => {
    const s = fakeStore();
    await s.answersRepo.create({ body: "draft", questionId: "q-1", aiDrafted: "AI_DRAFT", status: "AWAITING_CLINICIAN_REVIEW", promotedToLibrary: false, createdAt: NOW });
    const pending = await promoteAnswerToLibrary({ answers: s.answersRepo, library: s.libraryRepo }, { answer: s.answers[0]!, question: undefined, reviewerId: "c-1" });
    expect(pending.ok).toBe(false);
    await endorseAnswer(s.answersRepo, { answerId: "a-1" });
    const anonymous = await promoteAnswerToLibrary({ answers: s.answersRepo, library: s.libraryRepo }, { answer: s.answers[0]!, question: undefined, reviewerId: undefined });
    expect(anonymous.ok).toBe(false);
    if (!anonymous.ok) expect(anonymous.error.kind).toBe("unidentified");
  });
});

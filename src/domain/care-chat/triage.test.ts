import { describe, expect, test } from "bun:test";
import { matchEndorsedAnswer, topicFromQuestion, triageQuestion } from "@/domain/care-chat/triage";
import { buildPolicyContext, selectPolicyPack } from "@/domain/care-chat/policy-context";
import type { EndorsedAnswer } from "@/domain/entities/endorsedAnswer";
import type { PolicyPack } from "@/domain/entities/policyPack";

const library: EndorsedAnswer[] = [
  { id: "ea-1", topic: "Nausea after chemotherapy", answerText: "Take your anti-nausea medicine as prescribed and sip clear fluids.", endorsedById: "c1", endorsedAt: "2025-01-01T00:00:00Z" },
  { id: "ea-2", topic: "Fever during treatment", answerText: "A temperature of 100.4°F or higher needs a call to the triage line right away.", endorsedById: "c1", endorsedAt: "2025-01-01T00:00:00Z" },
  { id: "ea-3", topic: "Caring for your port", answerText: "Keep the dressing dry for 24 hours after a flush.", endorsedById: "c1", endorsedAt: "2025-01-01T00:00:00Z" },
];

const packs: PolicyPack[] = [
  { id: "pp-1", packName: "Riverbend Survivorship Pack", institution: "Riverbend Health", description: "Survivorship replies cite the care plan." },
  { id: "pp-2", packName: "Northside Oncology Governance Pack", institution: "Northside Oncology", suppressionThreshold: 11 },
];

describe("triageQuestion", () => {
  test("urgent symptoms are URGENT with a reason", () => {
    expect(triageQuestion("I have chest pain and feel faint")).toEqual({ redFlag: "URGENT", reason: "Chest pain reported" });
    expect(triageQuestion("Running a fever of 101 tonight").redFlag).toBe("URGENT");
  });
  test("medication and side-effect questions are PRIORITY", () => {
    expect(triageQuestion("Can I take ibuprofen for my headache?")).toEqual({ redFlag: "PRIORITY", reason: "Asks about NSAIDs during treatment" });
  });
  test("everything else is ROUTINE without a reason", () => {
    expect(triageQuestion("What should I eat the day before my infusion?")).toEqual({ redFlag: "ROUTINE" });
  });
});

describe("matchEndorsedAnswer", () => {
  test("picks the library answer whose topic overlaps the question", () => {
    expect(matchEndorsedAnswer("I feel nauseous after my chemotherapy session", library)?.answer.id).toBe("ea-1");
    expect(matchEndorsedAnswer("How do I care for my port dressing?", library)?.answer.id).toBe("ea-3");
  });
  test("returns null when nothing overlaps enough", () => {
    expect(matchEndorsedAnswer("Can my daughter come to the appointment?", library)).toBeNull();
    expect(matchEndorsedAnswer("", library)).toBeNull();
  });
});

describe("selectPolicyPack", () => {
  test("matches the institution hint, else falls back to the first pack by name", () => {
    expect(selectPolicyPack(packs, ["Northside Oncology"])?.id).toBe("pp-2");
    expect(selectPolicyPack(packs, ["northside"])?.id).toBe("pp-2");
    expect(selectPolicyPack(packs, ["Nowhere Clinic"])?.id).toBe("pp-2");
    expect(selectPolicyPack(packs, [undefined])?.id).toBe("pp-2");
    expect(selectPolicyPack([], ["x"])).toBeNull();
  });
});

describe("buildPolicyContext", () => {
  test("carries the pack, the triage and the library ids into the prompt", () => {
    const text = buildPolicyContext({ pack: packs[1]!, library, triage: { redFlag: "URGENT", reason: "Chest pain reported" } });
    expect(text).toContain("Northside Oncology Governance Pack");
    expect(text).toContain("suppression threshold: 11");
    expect(text).toContain("Red flag: URGENT — Chest pain reported");
    expect(text).toContain("[ea-2] Fever during treatment");
    expect(buildPolicyContext({ pack: null, library: [], triage: { redFlag: "ROUTINE" } })).toContain("No organization policy pack");
  });
});

describe("topicFromQuestion", () => {
  test("keeps a handful of meaningful words", () => {
    expect(topicFromQuestion("Is it safe to take ibuprofen while on chemotherapy?")).toBe("Safe ibuprofen while chemotherapy");
  });
});

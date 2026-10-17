// Port for admin-configurable triage rules (keyword -> triage level). Pure domain: no React, no SDK.

import type { RepoResult } from '../shared';

export type TriageRuleLevel = 'ROUTINE' | 'PRIORITY' | 'URGENT';

export interface TriageRule {
  readonly id: string;
  readonly keyword: string;
  readonly level: TriageRuleLevel;
  readonly alertNavigator: boolean;
  readonly active: boolean;
  readonly guidance: string | null;
}

export type NewTriageRule = Omit<TriageRule, 'id'>;
export type UpdateTriageRule = Partial<NewTriageRule>;

export interface TriageRuleRepository {
  listAll(): Promise<RepoResult<TriageRule[]>>;
  create(input: NewTriageRule): Promise<RepoResult<TriageRule>>;
  update(id: string, patch: UpdateTriageRule): Promise<RepoResult<TriageRule>>;
  delete(id: string): Promise<RepoResult<void>>;
}

/** Highest-severity active rule whose keyword appears in the text, or null (ROUTINE). */
export function triageText(
  text: string,
  rules: readonly TriageRule[],
): { level: TriageRuleLevel; alertNavigator: boolean; matched: TriageRule | null } {
  const lower = text.toLowerCase();
  const rank: Record<TriageRuleLevel, number> = { ROUTINE: 0, PRIORITY: 1, URGENT: 2 };
  let best: TriageRule | null = null;
  for (const r of rules) {
    if (!r.active || r.keyword.trim() === '') continue;
    if (!lower.includes(r.keyword.toLowerCase())) continue;
    if (best === null || rank[r.level] > rank[best.level]) best = r;
  }
  return {
    level: best === null ? 'ROUTINE' : best.level,
    alertNavigator: best !== null && best.alertNavigator,
    matched: best,
  };
}

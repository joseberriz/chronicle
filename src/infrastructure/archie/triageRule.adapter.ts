// Archie adapter for TriageRule. The only place that knows the GraphQL shape of the triage_rule table.

import type { IGraphQLModule } from '@archie/js-sdk';
import type { RepoResult } from '../../domain/shared';
import type {
  NewTriageRule,
  TriageRule,
  TriageRuleLevel,
  TriageRuleRepository,
  UpdateTriageRule,
} from '../../domain/ports/triageRule.repository';
import { fromGraphQL, missingData } from './transport';

const FIELDS = 'id keyword level alertNavigator active guidance';

const LIST = `query TriageRuleList($first: Int, $orderBy: TriageRuleOrderBy) {
  triageRule(first: $first, orderBy: $orderBy) { items { ${FIELDS} } }
}`;
const CREATE = `mutation TriageRuleCreate($input: TriageRuleCreateInput!) {
  createTriageRule(input: $input) { ${FIELDS} }
}`;
const UPDATE = `mutation TriageRuleUpdate($id: String, $input: TriageRuleUpdateInput!) {
  updateTriageRule(id: $id, input: $input) { ${FIELDS} }
}`;
const DELETE = `mutation TriageRuleDelete($id: String) { deleteTriageRule(id: $id) }`;

interface Row {
  id: string;
  keyword: string | null;
  level: string | null;
  alertNavigator: boolean | null;
  active: boolean | null;
  guidance: string | null;
}

function levelOf(v: string | null): TriageRuleLevel {
  return v === 'URGENT' || v === 'PRIORITY' ? v : 'ROUTINE';
}

function toRule(r: Row): TriageRule {
  return {
    id: r.id,
    keyword: r.keyword ?? '',
    level: levelOf(r.level),
    alertNavigator: r.alertNavigator === true,
    active: r.active !== false,
    guidance: r.guidance ?? null,
  };
}

export class ArchieTriageRuleRepository implements TriageRuleRepository {
  constructor(private readonly gql: IGraphQLModule) {}

  async listAll(): Promise<RepoResult<TriageRule[]>> {
    const res = await this.gql.query<{ triageRule: { items: Row[] } | null }>(LIST, {
      first: 500,
      orderBy: { keyword: 'ASC' },
    });
    if (res.error !== null) return { ok: false, error: fromGraphQL(res.error) };
    if (res.data === null || res.data.triageRule === null) return missingData('TriageRule', 'list');
    return { ok: true, data: res.data.triageRule.items.map(toRule) };
  }

  async create(input: NewTriageRule): Promise<RepoResult<TriageRule>> {
    const res = await this.gql.mutate<{ createTriageRule: Row | null }>(CREATE, { input });
    if (res.error !== null) return { ok: false, error: fromGraphQL(res.error) };
    const row = res.data === null ? null : res.data.createTriageRule;
    if (row === null) return missingData('TriageRule', 'create');
    return { ok: true, data: toRule(row) };
  }

  async update(id: string, patch: UpdateTriageRule): Promise<RepoResult<TriageRule>> {
    const res = await this.gql.mutate<{ updateTriageRule: Row | null }>(UPDATE, { id, input: patch });
    if (res.error !== null) return { ok: false, error: fromGraphQL(res.error) };
    const row = res.data === null ? null : res.data.updateTriageRule;
    if (row === null) return missingData('TriageRule', 'update');
    return { ok: true, data: toRule(row) };
  }

  async delete(id: string): Promise<RepoResult<void>> {
    const res = await this.gql.mutate<{ deleteTriageRule: boolean | null }>(DELETE, { id });
    if (res.error !== null) return { ok: false, error: fromGraphQL(res.error) };
    return { ok: true, data: undefined };
  }
}

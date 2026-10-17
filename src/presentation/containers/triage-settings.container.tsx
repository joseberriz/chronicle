// Container of the admin page `triage-settings`: loads the triage rules and wires add / edit / delete.

import * as React from 'react';
import type { TriageRule } from '../../domain/ports/triageRule.repository';
import { useRepositories } from '../app-context';
import { ScreenError, ScreenLoading } from '../screen-state';
import type { RepoError } from '../../domain/shared';
import { TriageSettingsView, type TriageRuleRow } from '../views/triage-settings.view';

const RANK: Record<TriageRule['level'], number> = { URGENT: 0, PRIORITY: 1, ROUTINE: 2 };

export default function TriageSettingsRoute(): React.ReactElement {
  const repositories = useRepositories();
  const [rules, setRules] = React.useState<readonly TriageRule[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<RepoError | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [token, setToken] = React.useState(0);

  React.useEffect(() => {
    let live = true;
    void repositories.triageRule.listAll().then((r) => {
      if (!live) return;
      if (r.ok === false) setError(r.error);
      else {
        setError(null);
        setRules(r.data);
      }
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, [repositories, token]);

  const run = React.useCallback(
    async (op: () => Promise<{ ok: boolean }>, done: string): Promise<void> => {
      setBusy(true);
      const res = await op();
      setBusy(false);
      setMessage(res.ok ? done : 'The change could not be saved. Try again.');
      setToken((n) => n + 1);
    },
    [],
  );

  const rows: TriageRuleRow[] = [...rules]
    .sort((a, b) => RANK[a.level] - RANK[b.level] || a.keyword.localeCompare(b.keyword))
    .map((r) => ({
      id: r.id,
      keyword: r.keyword,
      level: r.level,
      alertNavigator: r.alertNavigator,
      active: r.active,
      guidance: r.guidance ?? '',
    }));

  return (
    <>
      {loading ? (
        <ScreenLoading />
      ) : error !== null ? (
        <ScreenError error={error} onRetry={() => setToken((n) => n + 1)} />
      ) : (
        <TriageSettingsView
          rules={rows}
          busy={busy}
          message={message}
          onAdd={(input) =>
            void run(
              () =>
                repositories.triageRule.create({
                  keyword: input.keyword,
                  level: input.level,
                  alertNavigator: input.alertNavigator,
                  active: true,
                  guidance: input.guidance === '' ? null : input.guidance,
                }),
              'Rule added.',
            )
          }
          onToggleActive={(id, active) =>
            void run(() => repositories.triageRule.update(id, { active }), active ? 'Rule turned on.' : 'Rule turned off.')
          }
          onToggleAlert={(id, alertNavigator) =>
            void run(() => repositories.triageRule.update(id, { alertNavigator }), 'Navigator alert updated.')
          }
          onChangeLevel={(id, level) =>
            void run(() => repositories.triageRule.update(id, { level }), 'Level updated.')
          }
          onDelete={(id) => void run(() => repositories.triageRule.delete(id), 'Rule deleted.')}
        />
      )}
    </>
  );
}

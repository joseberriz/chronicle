import * as React from 'react';
import { Trash2 } from 'lucide-react';
import { PageHead } from '@/components/page-head';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export type TriageLevelOption = 'ROUTINE' | 'PRIORITY' | 'URGENT';

export interface TriageRuleRow {
  readonly id: string;
  readonly keyword: string;
  readonly level: TriageLevelOption;
  readonly alertNavigator: boolean;
  readonly active: boolean;
  readonly guidance: string;
}

export interface TriageSettingsViewProps {
  readonly rules: readonly TriageRuleRow[];
  readonly busy: boolean;
  readonly message: string | null;
  readonly onAdd: (input: {
    keyword: string;
    level: TriageLevelOption;
    alertNavigator: boolean;
    guidance: string;
  }) => void;
  readonly onToggleActive: (id: string, active: boolean) => void;
  readonly onToggleAlert: (id: string, alertNavigator: boolean) => void;
  readonly onChangeLevel: (id: string, level: TriageLevelOption) => void;
  readonly onDelete: (id: string) => void;
}

const LEVELS: readonly TriageLevelOption[] = ['URGENT', 'PRIORITY', 'ROUTINE'];
const LEVEL_LABEL: Record<TriageLevelOption, string> = {
  URGENT: 'Urgent',
  PRIORITY: 'Priority',
  ROUTINE: 'Routine',
};

const selectClass =
  'h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground';

export function TriageSettingsView(props: TriageSettingsViewProps): React.ReactElement {
  const [keyword, setKeyword] = React.useState('');
  const [level, setLevel] = React.useState<TriageLevelOption>('URGENT');
  const [alert, setAlert] = React.useState(true);
  const [guidance, setGuidance] = React.useState('');

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <PageHead
        title="Triage Settings"
        description="Keyword rules that set the triage level of every question a patient sends to the care team. The most severe matching active rule wins; no match means Routine."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add a rule</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-3 md:grid-cols-[1fr_140px_auto_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              if (keyword.trim() === '') return;
              props.onAdd({ keyword: keyword.trim(), level, alertNavigator: alert, guidance: guidance.trim() });
              setKeyword('');
              setGuidance('');
            }}
          >
            <Input
              aria-label="Keyword or phrase"
              placeholder="Keyword or phrase, e.g. chest pain"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
            <select
              aria-label="Triage level"
              className={selectClass}
              value={level}
              onChange={(e) => {
                const v = LEVELS.find((l) => l === e.target.value);
                if (v !== undefined) setLevel(v);
              }}
            >
              {LEVELS.map((l) => (
                <option key={l} value={l}>
                  {LEVEL_LABEL[l]}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <Switch checked={alert} onCheckedChange={setAlert} aria-label="Alert navigator" />
              Alert navigator
            </label>
            <Button type="submit" disabled={props.busy || keyword.trim() === ''}>
              Add rule
            </Button>
            <Input
              className="md:col-span-4"
              aria-label="Guidance shown to the patient"
              placeholder="Optional safety guidance shown to the patient"
              value={guidance}
              onChange={(e) => setGuidance(e.target.value)}
            />
          </form>
          {props.message !== null && (
            <p role="status" className="mt-3 text-sm text-muted-foreground">
              {props.message}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Rules ({props.rules.length})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {props.rules.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No rules yet. Until you add one, Care Chat uses its built-in red-flag keywords.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Keyword</th>
                  <th className="py-2 pr-3 font-medium">Level</th>
                  <th className="py-2 pr-3 font-medium">Alert navigator</th>
                  <th className="py-2 pr-3 font-medium">Active</th>
                  <th className="py-2 pr-3 font-medium">Guidance</th>
                  <th className="py-2 font-medium">
                    <span className="sr-only">Delete</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {props.rules.map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-0">
                    <td className="py-2 pr-3 font-medium text-foreground">{r.keyword}</td>
                    <td className="py-2 pr-3">
                      <select
                        aria-label={'Level for ' + r.keyword}
                        className={selectClass}
                        value={r.level}
                        disabled={props.busy}
                        onChange={(e) => {
                          const v = LEVELS.find((l) => l === e.target.value);
                          if (v !== undefined) props.onChangeLevel(r.id, v);
                        }}
                      >
                        {LEVELS.map((l) => (
                          <option key={l} value={l}>
                            {LEVEL_LABEL[l]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 pr-3">
                      <Switch
                        checked={r.alertNavigator}
                        disabled={props.busy}
                        onCheckedChange={(v) => props.onToggleAlert(r.id, v)}
                        aria-label={'Alert navigator for ' + r.keyword}
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <Switch
                        checked={r.active}
                        disabled={props.busy}
                        onCheckedChange={(v) => props.onToggleActive(r.id, v)}
                        aria-label={'Active ' + r.keyword}
                      />
                    </td>
                    <td className="py-2 pr-3 text-muted-foreground">{r.guidance === '' ? '—' : r.guidance}</td>
                    <td className="py-2 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={props.busy}
                        aria-label={'Delete ' + r.keyword}
                        onClick={() => props.onDelete(r.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

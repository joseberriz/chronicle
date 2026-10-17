// CONTAINER of the screen `my-treatment`. Resolves its ports by DI, owns load/error
// state, derives the timeline, running dose totals and adherence, wires the dose-log
// write and hands the VIEW a ready `MyTreatmentScreenViewModel`.

import * as React from 'react';
import { routes, useAppNavigate } from '@/presentation/navigation';
import type { RepoError } from '../../domain/shared';
import type { TreatmentPlan } from '../../domain/entities/treatmentPlan';
import type { TreatmentAdministration } from '../../domain/entities/treatmentAdministration';
import type { OralDoseLog } from '../../domain/entities/oralDoseLog';
import type { DataNotice } from '../../application/view-models/notices';
import {
  type CumulativeDoseItem,
  type LogDoseInput,
  type MyTreatmentScreenViewModel,
  type OralDoseItem,
  type TreatmentPlanOption,
  type TreatmentTimelineItem,
} from '../../application/view-models/my-treatment.vm';
import { useRepositories } from '../app-context';
import { MyTreatmentView } from '../views/my-treatment.view';
import { ScreenError, ScreenLoading } from '../screen-state';

type RouteBuilder = (params?: Readonly<Record<string, string | number | undefined>>) => string;
const routeBuilders: Readonly<Record<string, RouteBuilder>> = routes;
function href(slug: string, params?: Readonly<Record<string, string | number | undefined>>): string {
  const build = routeBuilders[slug];
  return build === undefined ? '/' + slug : build(params);
}

export type MyTreatmentScreenView = (props: MyTreatmentScreenViewModel) => React.ReactElement;

export interface MyTreatmentScreenContainerProps {
  readonly view: MyTreatmentScreenView;
}

function doseLabel(dose: number, unit: string | undefined): string {
  return unit === undefined || unit === '' ? String(dose) : String(dose) + ' ' + unit;
}

export function MyTreatmentScreenContainer(props: MyTreatmentScreenContainerProps): React.ReactElement {
  const View = props.view;
  const repositories = useRepositories();
  const navigate = useAppNavigate();

  const [plans, setPlans] = React.useState<readonly TreatmentPlan[]>([]);
  const [administrations, setAdministrations] = React.useState<readonly TreatmentAdministration[]>([]);
  const [doseLogs, setDoseLogs] = React.useState<readonly OralDoseLog[]>([]);
  const [notice, setNotice] = React.useState<DataNotice | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<RepoError | null>(null);
  const [writeError, setWriteError] = React.useState<RepoError | null>(null);
  const [reloadToken, setReloadToken] = React.useState(0);
  const [hasPatient, setHasPatient] = React.useState(false);
  const hasLoadedRef = React.useRef(false);

  const reload = React.useCallback((): void => {
    setReloadToken((n) => n + 1);
  }, []);

  // Until a login is linked to a patient record the screen works on the first patient on
  // file (demo scope), exactly like Care Chat.
  React.useEffect(() => {
    let live = true;
    if (!hasLoadedRef.current) setLoading(true);
    setLoadError(null);
    void (async () => {
      const patients = await repositories.patient.list({ first: 1 });
      if (!live) return;
      if (patients.ok === false) {
        setLoadError(patients.error);
        setLoading(false);
        return;
      }
      if (patients.data.items.length === 0) {
        setHasPatient(false);
        setNotice({ code: 'sesion-no-identificada' });
        setLoading(false);
        return;
      }
      const patientId = patients.data.items[0].id;
      setHasPatient(true);
      const [planRes, adminRes, doseRes] = await Promise.all([
        repositories.treatmentPlan.listAll({ filter: { patientId } }),
        repositories.treatmentAdministration.listAll(),
        repositories.oralDoseLog.listAll(),
      ]);
      if (!live) return;
      if (planRes.ok === false) {
        setLoadError(planRes.error);
        setLoading(false);
        return;
      }
      if (adminRes.ok === false) {
        setLoadError(adminRes.error);
        setLoading(false);
        return;
      }
      if (doseRes.ok === false) {
        setLoadError(doseRes.error);
        setLoading(false);
        return;
      }
      const mine = new Set(planRes.data.items.map((p) => p.id));
      setPlans(planRes.data.items);
      setAdministrations(adminRes.data.items.filter((a) => mine.has(a.planId)));
      setDoseLogs(doseRes.data.items.filter((d) => mine.has(d.planId)));
      const unreadable = (planRes.data.unreadable ?? 0) + (adminRes.data.unreadable ?? 0) + (doseRes.data.unreadable ?? 0);
      setNotice(unreadable > 0 ? { code: 'filas-ilegibles' } : null);
      hasLoadedRef.current = true;
      setLoading(false);
    })().catch((cause: unknown) => {
      console.error('[archie] my-treatment load failed:', cause);
      if (!live) return;
      setLoadError({
        kind: 'transport',
        message: 'The treatment data could not be loaded.',
        detail: 'promesa rechazada fuera del contrato `RepoResult`',
      });
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, [repositories, reloadToken]);

  const derived = React.useMemo(() => {
    const regimenOf = new Map<string, string>();
    for (const p of plans) regimenOf.set(p.id, p.regimen);

    const timeline: TreatmentTimelineItem[] = [...administrations]
      .sort((a, b) => b.administeredAt.localeCompare(a.administeredAt))
      .map((a) => ({
        id: a.id,
        agent: a.agent,
        regimen: regimenOf.get(a.planId) ?? '',
        administeredAt: a.administeredAt,
        doseLabel: doseLabel(a.dose, a.doseUnit),
      }));

    const totals = new Map<string, { agent: string; unit: string; total: number; administrations: number }>();
    for (const a of administrations) {
      const unit = a.doseUnit ?? '';
      const key = a.agent + '|' + unit;
      const row = totals.get(key) ?? { agent: a.agent, unit, total: 0, administrations: 0 };
      row.total += a.dose;
      row.administrations += 1;
      totals.set(key, row);
    }
    const cumulative: CumulativeDoseItem[] = [...totals.values()].sort((x, y) => x.agent.localeCompare(y.agent));

    const doses: OralDoseItem[] = [...doseLogs]
      .sort((a, b) => b.loggedAt.localeCompare(a.loggedAt))
      .map((d) => ({
        id: d.id,
        medication: d.medication,
        loggedAt: d.loggedAt,
        doseLabel: doseLabel(d.dose, d.doseUnit),
        taken: d.taken,
      }));

    const takenCount = doseLogs.filter((d) => d.taken === 'TAKEN').length;
    const loggedCount = doseLogs.length;
    const today = new Date().toDateString();
    const loggedToday = doseLogs.some((d) => new Date(d.loggedAt).toDateString() === today);
    const planOptions: TreatmentPlanOption[] = plans.map((p) => ({ id: p.id, regimen: p.regimen, status: p.status }));
    return {
      timeline,
      cumulative,
      doses,
      takenCount,
      loggedCount,
      loggedToday,
      adherencePercent: loggedCount === 0 ? null : Math.round((takenCount / loggedCount) * 100),
      planOptions,
    };
  }, [plans, administrations, doseLogs]);

  const onLogDose = React.useCallback(
    (input: LogDoseInput): Promise<boolean> => {
      setWriteError(null);
      return repositories.oralDoseLog
        .create({
          planId: input.planId,
          medication: input.medication,
          dose: input.dose,
          doseUnit: input.doseUnit,
          taken: input.taken,
          loggedAt: new Date().toISOString(),
        })
        .then((result): boolean => {
          if (result.ok === false) {
            setWriteError(result.error);
            return false;
          }
          reload();
          return true;
        })
        .catch((cause: unknown): boolean => {
          console.error('[archie] dose log write failed:', cause);
          setWriteError({
            kind: 'transport',
            message: 'The dose could not be saved.',
            detail: 'promesa rechazada fuera del contrato `RepoResult`',
          });
          return false;
        });
    },
    [repositories, reload],
  );

  const canLog = hasPatient && derived.planOptions.length > 0;
  const vm: MyTreatmentScreenViewModel = {
    plans: derived.planOptions,
    timeline: derived.timeline,
    cumulative: derived.cumulative,
    doses: derived.doses,
    adherencePercent: derived.adherencePercent,
    takenCount: derived.takenCount,
    loggedCount: derived.loggedCount,
    loggedToday: derived.loggedToday,
    notice,
    loading,
    error: loadError ?? writeError,
    onLogDose,
    availability: {
      onLogDose: canLog
        ? { available: true, reason: 'escritura-no-disponible' }
        : { available: false, reason: hasPatient ? 'escritura-no-disponible' : 'sesion-no-identificada' },
    },
    navigate,
    href,
  };

  return (
    <>
      {loading ? (
        <ScreenLoading />
      ) : loadError !== null ? (
        <ScreenError error={loadError} onRetry={reload} />
      ) : (
        <View {...vm} />
      )}
    </>
  );
}

// THE ROUTE MODULE. `routes.config.tsx` lazy-imports this file and needs a prop-less default export.
export default function MyTreatmentScreenRoute(): React.ReactElement {
  return <MyTreatmentScreenContainer view={MyTreatmentView} />;
}

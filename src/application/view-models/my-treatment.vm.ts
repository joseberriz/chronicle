// ViewModel of the `my-treatment` screen. The ONLY contract between its container
// (queries the ports, derives timeline / totals / adherence) and its view (only paints).

import type { RepoError } from '../../domain/shared';
import type { DataNotice } from './notices';

/** One administered dose on the treatment timeline, newest first. */
export interface TreatmentTimelineItem {
  readonly id: string;
  readonly agent: string;
  readonly regimen: string;
  readonly administeredAt: string;
  /** Dose with its unit, ready to paint ("25 mg/m2" style text comes from the data). */
  readonly doseLabel: string;
}

/** Running total of one dose-limited agent across the whole history. */
export interface CumulativeDoseItem {
  readonly agent: string;
  readonly unit: string;
  readonly total: number;
  readonly administrations: number;
}

/** One oral dose entry, newest first. */
export interface OralDoseItem {
  readonly id: string;
  readonly medication: string;
  readonly loggedAt: string;
  readonly doseLabel: string;
  readonly taken: 'TAKEN' | 'MISSED' | 'SKIPPED';
}

/** A treatment plan a dose can be logged against. */
export interface TreatmentPlanOption {
  readonly id: string;
  readonly regimen: string;
  readonly status: 'ACTIVE' | 'COMPLETED' | 'DRAFT';
}

/** What the "log a dose" form collects. */
export interface LogDoseInput {
  readonly planId: string;
  readonly medication: string;
  readonly dose: number;
  readonly doseUnit: string;
  readonly taken: 'TAKEN' | 'MISSED' | 'SKIPPED';
}

export type MyTreatmentScreenViewModelAvailability = {
  readonly onLogDose: { readonly available: boolean; readonly reason: 'escritura-no-disponible' | 'sesion-no-identificada' };
};

export interface MyTreatmentScreenViewModel {
  readonly plans: readonly TreatmentPlanOption[];
  readonly timeline: readonly TreatmentTimelineItem[];
  readonly cumulative: readonly CumulativeDoseItem[];
  readonly doses: readonly OralDoseItem[];
  /** Share of logged oral doses marked taken, 0-100, or `null` when nothing is logged. */
  readonly adherencePercent: number | null;
  readonly takenCount: number;
  readonly loggedCount: number;
  /** `true` when at least one oral dose was logged today. */
  readonly loggedToday: boolean;
  /** Why the lists are empty without being a transport error, or `null`. */
  readonly notice: DataNotice | null;
  readonly loading: boolean;
  readonly error: RepoError | null;
  /** Logs one oral dose. Resolves `true` when it was saved. */
  readonly onLogDose: (input: LogDoseInput) => Promise<boolean>;
  readonly availability: MyTreatmentScreenViewModelAvailability;
  readonly navigate: (path: string) => void;
  readonly href: (slug: string, params?: Readonly<Record<string, string | number | undefined>>) => string;
}

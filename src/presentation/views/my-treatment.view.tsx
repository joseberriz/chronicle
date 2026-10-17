import type * as React from "react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pill, FileText } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { MyTreatmentScreenViewModel } from "@/application/view-models/my-treatment.vm";
import { formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";
import { EmptyState } from "@/presentation/components/domain/empty-state";

type DoseStatus = "TAKEN" | "MISSED" | "SKIPPED";

interface DoseFormValues {
  medication: string;
  dose: string;
  doseUnit: string;
  planId: string;
  taken: DoseStatus;
}

const SELECT_CLASS =
  "h-9 w-full rounded-control border border-border-strong bg-background px-3 type-body text-foreground";

export function MyTreatmentView(props: MyTreatmentScreenViewModel): React.ReactElement {
  const { t } = useTranslation();
  const [saved, setSaved] = useState(false);

  const schema = useMemo(
    () =>
      z.object({
        medication: z.string().trim().min(2, t("my-treatment.form-medication-error")),
        dose: z.string().refine((v) => Number(v) > 0, t("my-treatment.form-dose-error")),
        doseUnit: z.string().min(1),
        planId: z.string().min(1),
        taken: z.enum(["TAKEN", "MISSED", "SKIPPED"]),
      }),
    [t],
  );

  const firstPlanId = props.plans.length > 0 ? props.plans[0].id : "";
  const form = useForm<DoseFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { medication: "", dose: "", doseUnit: "mg", planId: firstPlanId, taken: "TAKEN" },
    mode: "onTouched",
  });

  const statusLabel = (s: DoseStatus): string =>
    s === "TAKEN"
      ? t("my-treatment.status-taken")
      : s === "MISSED"
        ? t("my-treatment.status-missed")
        : t("my-treatment.status-skipped");

  const statusClass = (s: DoseStatus): string =>
    s === "TAKEN"
      ? "bg-status-ok-bg text-status-ok-ink"
      : s === "MISSED"
        ? "bg-status-danger-bg text-status-danger-ink"
        : "bg-status-pending-bg text-status-pending-ink";

  const unavailableReason =
    props.availability.onLogDose.reason === "sesion-no-identificada"
      ? t("_reason.sesion-no-identificada")
      : t("_reason.escritura-no-disponible");

  return (
    <div className="grid w-full min-w-0 gap-(--section-gap) py-(--section-gap)">
      <header className="flex flex-col gap-1">
        <h1 className="type-page-title">{t("my-treatment.title")}</h1>
        <p className="type-body text-text-muted">{t("my-treatment.subtitle")}</p>
      </header>

      {props.notice !== null && props.notice.code === "filas-ilegibles" && (
        <p role="status" className="type-caption text-text-muted">
          {t("my-treatment.notice-unreadable")}
        </p>
      )}

      <div className="grid min-w-0 gap-(--section-gap) lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <div className="flex min-w-0 flex-col gap-(--section-gap)">
          <section className="flex flex-col gap-3" aria-labelledby="mt-timeline">
            <h2 id="mt-timeline" className="type-section-title">
              {t("my-treatment.timeline-title")}
            </h2>
            {props.timeline.length === 0 ? (
              <EmptyState title={t("my-treatment.timeline-empty")} />
            ) : (
              <ol className="flex flex-col gap-2">
                {props.timeline.map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-baseline justify-between gap-2 rounded-control border border-border-strong p-3"
                  >
                    <div className="flex flex-col">
                      <span className="type-row-title">{item.agent}</span>
                      {item.regimen !== "" && <span className="type-caption text-text-muted">{item.regimen}</span>}
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="type-body">{item.doseLabel}</span>
                      <span className="type-meta text-text-muted">{formatDate(item.administeredAt)}</span>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="flex flex-col gap-3" aria-labelledby="mt-cumulative">
            <h2 id="mt-cumulative" className="type-section-title">
              {t("my-treatment.cumulative-title")}
            </h2>
            {props.cumulative.length === 0 ? (
              <EmptyState title={t("my-treatment.cumulative-empty")} />
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {props.cumulative.map((row) => (
                  <li key={row.agent + row.unit} className="flex flex-col gap-1 rounded-control border border-border-strong p-3">
                    <span className="type-row-title">{row.agent}</span>
                    <span className="type-page-title">{String(row.total) + (row.unit === "" ? "" : " " + row.unit)}</span>
                    <span className="type-meta text-text-muted">
                      {t("my-treatment.cumulative-count", { n: row.administrations })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="flex min-w-0 flex-col gap-(--section-gap)">
          <section className="flex flex-col gap-3" aria-labelledby="mt-oral">
            <h2 id="mt-oral" className="type-section-title flex items-center gap-2">
              <Pill className="size-4" aria-hidden="true" />
              {t("my-treatment.oral-title")}
            </h2>
            <p className="type-body text-text-muted" role="status">
              {props.loggedToday ? t("my-treatment.today-done") : t("my-treatment.today-pending")}
            </p>
            {props.adherencePercent !== null && (
              <p className="type-row-title">
                {t("my-treatment.adherence", {
                  taken: props.takenCount,
                  logged: props.loggedCount,
                  percent: props.adherencePercent,
                })}
              </p>
            )}

            <form
              className="flex flex-col gap-3 rounded-control border border-border-strong p-4"
              onSubmit={form.handleSubmit(async (values) => {
                setSaved(false);
                const ok = await props.onLogDose({
                  planId: values.planId,
                  medication: values.medication.trim(),
                  dose: Number(values.dose),
                  doseUnit: values.doseUnit,
                  taken: values.taken,
                });
                if (ok) {
                  setSaved(true);
                  form.reset({ ...values, medication: "", dose: "" });
                }
              })}
            >
              <Field>
                <FieldLabel htmlFor="mt-medication">{t("my-treatment.form-medication")}</FieldLabel>
                <Input id="mt-medication" {...form.register("medication")} />
                <FieldError>{form.formState.errors.medication?.message}</FieldError>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field>
                  <FieldLabel htmlFor="mt-dose">{t("my-treatment.form-dose")}</FieldLabel>
                  <Input id="mt-dose" inputMode="decimal" {...form.register("dose")} />
                  <FieldError>{form.formState.errors.dose?.message}</FieldError>
                </Field>
                <Field>
                  <FieldLabel htmlFor="mt-unit">{t("my-treatment.form-unit")}</FieldLabel>
                  <select id="mt-unit" className={SELECT_CLASS} {...form.register("doseUnit")}>
                    <option value="mg">mg</option>
                    <option value="mcg">mcg</option>
                    <option value="g">g</option>
                    <option value="mL">mL</option>
                    <option value="units">units</option>
                  </select>
                </Field>
              </div>
              <Field>
                <FieldLabel htmlFor="mt-plan">{t("my-treatment.form-plan")}</FieldLabel>
                <select id="mt-plan" className={SELECT_CLASS} {...form.register("planId")}>
                  {props.plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.regimen}
                    </option>
                  ))}
                </select>
              </Field>
              <Field>
                <FieldLabel htmlFor="mt-status">{t("my-treatment.form-status")}</FieldLabel>
                <select id="mt-status" className={SELECT_CLASS} {...form.register("taken")}>
                  <option value="TAKEN">{statusLabel("TAKEN")}</option>
                  <option value="MISSED">{statusLabel("MISSED")}</option>
                  <option value="SKIPPED">{statusLabel("SKIPPED")}</option>
                </select>
              </Field>
              <Button type="submit" disabled={!props.availability.onLogDose.available || form.formState.isSubmitting}>
                {t("my-treatment.form-submit")}
              </Button>
              {!props.availability.onLogDose.available && (
                <p className="type-caption text-text-muted">{unavailableReason}</p>
              )}
              {saved && (
                <p role="status" className="type-caption text-text-muted">
                  {t("my-treatment.saved")}
                </p>
              )}
            </form>

            {props.doses.length === 0 ? (
              <EmptyState title={t("my-treatment.oral-empty")} />
            ) : (
              <ul className="flex flex-col gap-2">
                {props.doses.map((d) => (
                  <li
                    key={d.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-border-strong p-3"
                  >
                    <div className="flex flex-col">
                      <span className="type-row-title">{d.medication}</span>
                      <span className="type-meta text-text-muted">
                        {d.doseLabel + " - " + formatDate(d.loggedAt)}
                      </span>
                    </div>
                    <span className={"type-meta rounded-control px-2 py-1 " + statusClass(d.taken)}>
                      {statusLabel(d.taken)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <Button type="button" variant="outline" onClick={() => props.navigate(props.href("my-documents"))}>
            <FileText className="size-4" aria-hidden="true" />
            {t("my-treatment.documents-cta")}
          </Button>
        </aside>
      </div>
    </div>
  );
}

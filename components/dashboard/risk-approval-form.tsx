"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { GhostBtn, PrimaryBtn } from "@/components/dashboard/buttons";
import type { PositionApproval, PositionRow } from "@/lib/risk-engine";
import { saveApprovalAction } from "@/app/(dashboard)/risk/actions";

export type AnalystOption = { id: string; name: string };

const INPUT = "w-full border border-line bg-surface px-2 py-[5px] text-[13px] text-ink";

/**
 * The §3.4 Risk Manager entry form.
 *
 * "These fields are not available from any feed. The dashboard requires a
 * simple entry form for the Risk Manager, and the values must be stored with
 * the position and shown on Tab 1."
 *
 * Every field here carries the IPS clause that put it on the form, because the
 * point of the form is that these are the things the IPS requires be recorded
 * at approval — not a general notes box.
 */
export function ApprovalForm({
  row,
  analysts,
  sectors,
  onClose,
}: {
  row: PositionRow | null;
  analysts: AnalystOption[];
  sectors: string[];
  onClose: () => void;
}) {
  const approval: PositionApproval | null = row?.position.approval ?? null;
  const [symbol, setSymbol] = useState(row?.position.symbol ?? "");
  const isAlternatives = (row?.position.team ?? approval?.team) === "alternatives";
  const isOption = row?.position.assetClass === "Option";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[rgba(23,24,26,0.35)] p-6">
      <div className="panel w-full max-w-2xl">
        <div className="flex items-center justify-between border-b border-line-2 bg-paper-3 px-3 py-2">
          <div className="flex items-baseline gap-2">
            <span className="caps text-[11px]">IPS I.a · IV.c step 5</span>
            <span className="panel-title">
              {approval ? `Approval — ${symbol}` : "Record a position approval"}
            </span>
          </div>
          <button type="button" onClick={onClose} className="text-ink-3 hover:text-ink" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form action={saveApprovalAction} className="flex flex-col gap-3 p-3">
          <p className="text-[12.5px] text-ink-3">
            The IPS requires the Risk Manager to approve sizing before any trade is placed and to record the
            approval and any conditions. This record also exports as a row for the Google Drive transaction log.
          </p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Ticker / instrument" hint="As the broker reports it.">
              <input
                name="symbol"
                required
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                readOnly={!!row}
                className={INPUT}
              />
            </Field>

            <Field label="Team" hint="IPS II.a, II.b — every position belongs to exactly one.">
              <select name="team" defaultValue={approval?.team ?? (row?.position.team ?? "")} className={INPUT}>
                <option value="">Use asset class</option>
                <option value="equities">Equities</option>
                <option value="alternatives">Alternatives</option>
              </select>
            </Field>

            <Field label="Sector" hint="IPS VI coverage sectors. Overrides the GICS mapping.">
              <select name="sector" defaultValue={approval?.sector ?? ""} className={INPUT}>
                <option value="">Use the GICS mapping</option>
                {sectors.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Approved size (% of NAV)" hint="IPS I.a, IV.c step 5.">
              <input
                name="approvedSizePct"
                type="number"
                step="0.01"
                min="0"
                defaultValue={approval?.approved_size_pct ?? ""}
                className={INPUT}
              />
            </Field>

            <Field label="Approval date">
              <input
                name="approvalDate"
                type="date"
                defaultValue={approval?.approval_date ?? new Date().toISOString().slice(0, 10)}
                className={INPUT}
              />
            </Field>

            <Field label="Assigned analyst" hint="IPS IV.c step 6 — monitored daily by an analyst in the sector group.">
              <select name="analystId" defaultValue={approval?.analyst_id ?? ""} className={INPUT}>
                <option value="">Unassigned</option>
                {analysts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Thesis price target" hint="IPS V.a — at or above target routes to Committee gain review.">
              <input
                name="priceTarget"
                type="number"
                step="0.01"
                min="0"
                defaultValue={approval?.price_target ?? ""}
                className={INPUT}
              />
            </Field>

            <Field
              label="Defined-risk max loss ($)"
              hint={
                isAlternatives
                  ? "IPS II.b — Alternatives defined-risk positions carry an explicit maximum."
                  : "Alternatives only."
              }
            >
              <input
                name="definedRiskMaxLoss"
                type="number"
                step="1"
                min="0"
                defaultValue={approval?.defined_risk_max_loss ?? ""}
                className={INPUT}
              />
            </Field>

            <Field label="Stop order reference" hint="IPS III.d — the broker order reference for the resting GTC stop.">
              <input name="stopOrderRef" defaultValue={approval?.stop_order_ref ?? ""} className={INPUT} />
            </Field>

            <div className="flex flex-col justify-end gap-1.5 pb-1">
              <Check name="stopOrderConfirmed" defaultChecked={approval?.stop_order_confirmed ?? false}>
                Resting stop order confirmed at approval
              </Check>
              {isOption && (
                <>
                  <Check name="thesisDriven" defaultChecked={approval?.thesis_driven ?? false}>
                    Long-premium option is thesis-driven [IPS III.b]
                  </Check>
                  <Check name="shortExpiryApproved" defaultChecked={approval?.short_expiry_approved ?? false}>
                    Approved despite expiring inside the window [IPS III.b]
                  </Check>
                </>
              )}
              <Check name="gainUnrelatedToThesis" defaultChecked={approval?.gain_unrelated_to_thesis ?? false}>
                Gain unrelated to the thesis — route to gain review [IPS V.a]
              </Check>
            </div>
          </div>

          <Field label="Monitoring conditions" hint="IPS I.a — conditions attached to the approval, kept visible.">
            <textarea
              name="monitoringConditions"
              rows={2}
              defaultValue={approval?.monitoring_conditions ?? ""}
              className={INPUT}
            />
          </Field>

          <Field label="Rationale" hint="Gov. IV.a — every transaction record carries a rationale.">
            <textarea name="notes" rows={2} defaultValue={approval?.notes ?? ""} className={INPUT} />
          </Field>

          <div className="flex items-center justify-end gap-2 border-t border-line pt-3">
            {approval && (
              <button
                type="submit"
                name="close"
                value="1"
                className="text-[13px] text-neg underline"
                title="Closes the approval record without deleting it"
              >
                Close this approval
              </button>
            )}
            <GhostBtn onClick={onClose}>Cancel</GhostBtn>
            <PrimaryBtn type="submit">Save approval</PrimaryBtn>
          </div>
        </form>
      </div>

    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="caps text-[11px] text-ink-3">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-ink-3">{hint}</span>}
    </label>
  );
}

function Check({
  name,
  defaultChecked,
  children,
}: {
  name: string;
  defaultChecked: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex items-start gap-1.5 text-[12.5px] text-ink-2">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-[3px]" />
      <span>{children}</span>
    </label>
  );
}

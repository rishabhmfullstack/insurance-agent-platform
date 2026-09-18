// The workflow timeline on the application screen. "Shared on WhatsApp" is a
// logged EVENT from communications, not a status (D-11) — the timeline renders
// it from the log.

export type TimelineStep = {
  label: string;
  detail?: string;
  state: "done" | "current" | "pending";
};

export function StatusTimeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <ol className="flex flex-wrap items-start gap-x-2 gap-y-3">
      {steps.map((step, i) => (
        <li key={step.label} className="flex items-start gap-2">
          {i > 0 && <span className="mt-2 h-px w-6 bg-slate-300" aria-hidden />}
          <div className="flex flex-col items-center text-center">
            <span
              className={
                step.state === "done"
                  ? "flex h-5 w-5 items-center justify-center rounded-full bg-green-600 text-[10px] font-bold text-white"
                  : step.state === "current"
                    ? "flex h-5 w-5 items-center justify-center rounded-full border-2 border-blue-600 bg-white"
                    : "flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 bg-white"
              }
            >
              {step.state === "done" ? "✓" : ""}
            </span>
            <span
              className={`mt-1 max-w-[7rem] text-xs ${
                step.state === "pending" ? "text-slate-400" : "text-slate-900"
              }`}
            >
              {step.label}
            </span>
            {step.detail && (
              <span className="text-[10px] text-slate-400">{step.detail}</span>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

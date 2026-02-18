import type { ReactNode } from "react";

type FormSectionProps = {
  title: string;
  helper?: string;
  children: ReactNode;
};

export function FormSection({ title, helper, children }: FormSectionProps) {
  return (
    <section className="space-y-2">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {helper ? <p className="text-xs text-muted-foreground">{helper}</p> : null}
      </div>
      {children}
    </section>
  );
}

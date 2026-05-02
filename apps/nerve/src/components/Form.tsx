import { cn } from "@/lib/cn";

const inputBase =
  "mt-1 w-full bg-bg-panel border border-border focus:border-accent " +
  "text-fg font-mono text-xs px-2.5 py-1.5 outline-none";

export function Field({
  label,
  hint,
  className,
  children,
  required,
}: {
  label: string;
  hint?: string;
  className?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="h-section">
        {label}
        {required && <span className="text-status-rejected ml-1">*</span>}
      </span>
      {children}
      {hint && <span className="block font-mono text-2xs text-fg-dim mt-1">{hint}</span>}
    </label>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(inputBase, props.className)} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(inputBase, "min-h-[6rem] font-mono leading-relaxed", props.className)}
    />
  );
}

export function Select(
  props: React.SelectHTMLAttributes<HTMLSelectElement> & { children: React.ReactNode },
) {
  return (
    <select
      {...props}
      className={cn(inputBase, "appearance-none cursor-pointer", props.className)}
    >
      {props.children}
    </select>
  );
}

export function Checkbox({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer select-none">
      <input
        type="checkbox"
        {...props}
        className={cn(
          "h-3.5 w-3.5 bg-bg-panel border-border accent-accent",
          props.className,
        )}
      />
      <span className="font-mono text-xs text-fg">{label}</span>
    </label>
  );
}

export function SubmitButton({
  children,
  pending,
  variant = "primary",
}: {
  children: React.ReactNode;
  pending?: boolean;
  variant?: "primary" | "ghost" | "danger";
}) {
  const variants = {
    primary: "bg-fg text-bg hover:bg-fg-muted",
    ghost: "border border-border hover:border-border-strong text-fg",
    danger: "border border-status-rejected/40 text-status-rejected hover:bg-status-rejected/10",
  };
  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        "font-sans text-sm font-medium px-3 py-1.5 transition-colors disabled:opacity-50",
        variants[variant],
      )}
    >
      {pending ? "..." : children}
    </button>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div className="border border-status-rejected/40 bg-status-rejected/5 px-3 py-2 font-mono text-xs text-status-rejected">
      {message}
    </div>
  );
}

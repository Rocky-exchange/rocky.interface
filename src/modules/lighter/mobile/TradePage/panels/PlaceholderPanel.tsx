export function PlaceholderPanel({ label }: { label: string }) {
  return (
    <div
      style={{ color: "var(--ltr-text-secondary, #B4B4B6)", fontSize: 14 }}
      className="flex h-full items-center justify-center"
    >
      {label} (TODO)
    </div>
  );
}

export type Props = {
  size: number;
  address: string;
  ensName?: string;
};

export function Avatar({ size, address, ensName }: Props) {
  void ensName;
  const label = address.replace(/^0x/, "").slice(0, 2).toUpperCase() || "--";

  return (
    <span
      aria-hidden="true"
      style={{
        alignItems: "center",
        background: "linear-gradient(135deg, #1f8f7a, #2858a8)",
        borderRadius: "50%",
        color: "#fff",
        display: "inline-flex",
        fontSize: `${Math.max(10, Math.round(size * 0.38))}px`,
        fontWeight: 700,
        height: `${size}px`,
        justifyContent: "center",
        lineHeight: 1,
        width: `${size}px`,
      }}
    >
      {label}
    </span>
  );
}

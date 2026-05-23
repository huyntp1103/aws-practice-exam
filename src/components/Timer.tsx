import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

function format(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

interface Props {
  endsAt: number;
  onExpire: () => void;
}

export function Timer({ endsAt, onExpire }: Props) {
  const [remaining, setRemaining] = useState(() => endsAt - Date.now());

  useEffect(() => {
    const id = setInterval(() => {
      const left = endsAt - Date.now();
      setRemaining(left);
      if (left <= 0) {
        clearInterval(id);
        onExpire();
      }
    }, 500);
    return () => clearInterval(id);
  }, [endsAt, onExpire]);

  const urgent = remaining > 0 && remaining <= 5 * 60_000;
  const expired = remaining <= 0;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-sm tabular-nums",
        urgent && "border-warning text-warning",
        expired && "border-destructive text-destructive"
      )}
    >
      <Clock className="h-3.5 w-3.5" />
      {format(remaining)}
    </div>
  );
}

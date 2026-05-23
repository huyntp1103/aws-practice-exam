import { cn } from "@/lib/utils";
import type { SessionState } from "@/lib/types";

interface Props {
  state: SessionState;
  onJump: (index: number) => void;
}

export function JumperGrid({ state, onJump }: Props) {
  return (
    <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-6 md:grid-cols-5 lg:grid-cols-6">
      {state.config.questionNumbers.map((qNum, idx) => {
        const answered = (state.answers[qNum]?.length ?? 0) > 0;
        const flagged = !!state.flagged[qNum];
        const current = idx === state.currentIndex;
        return (
          <button
            key={qNum}
            onClick={() => onJump(idx)}
            aria-label={`Go to question ${idx + 1}`}
            className={cn(
              "relative h-9 rounded-md border text-xs font-medium transition-colors",
              "hover:bg-accent hover:text-accent-foreground",
              answered && "bg-primary/15 border-primary/40",
              current && "ring-2 ring-ring ring-offset-1 ring-offset-background"
            )}
          >
            {idx + 1}
            {flagged && (
              <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-warning" />
            )}
          </button>
        );
      })}
    </div>
  );
}

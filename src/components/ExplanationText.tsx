import { cn } from "@/lib/utils";

type Block =
  | { type: "heading"; text: string }
  | { type: "bullets"; items: string[] }
  | { type: "paragraph"; text: string };

// Our generated explanations use a consistent plain-text convention: short
// mostly-uppercase lines are section headers (CORE CONCEPT, CORRECT ANSWER:
// D — ..., etc.), "- " lines are bullets, everything else is prose. This
// heuristic (rather than a fixed label list) also tolerates the occasional
// reworded header (e.g. reverse/"NOT" questions).
function isHeadingLine(line: string): boolean {
  if (line.startsWith("-")) return false;
  // Headers like "CORRECT ANSWER: D — <long restatement>" can run long once
  // the answer text is appended, so judge caps-ratio/length on the label
  // portion before the colon, not the whole line.
  const headPart = line.includes(":") ? line.split(":")[0] : line;
  const letters = headPart.replace(/[^A-Za-z]/g, "");
  if (letters.length < 3) return false;
  const upper = (letters.match(/[A-Z]/g) ?? []).length;
  return upper / letters.length > 0.6 && headPart.length < 60;
}

function parseExplanation(text: string): Block[] {
  const blocks: Block[] = [];
  let bulletBuf: string[] = [];
  let paraBuf: string[] = [];

  const flushBullets = () => {
    if (bulletBuf.length) {
      blocks.push({ type: "bullets", items: bulletBuf });
      bulletBuf = [];
    }
  };
  const flushPara = () => {
    if (paraBuf.length) {
      blocks.push({ type: "paragraph", text: paraBuf.join(" ") });
      paraBuf = [];
    }
  };

  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) {
      flushBullets();
      flushPara();
      continue;
    }
    if (line.startsWith("- ")) {
      flushPara();
      bulletBuf.push(line.slice(2).trim());
    } else if (isHeadingLine(line)) {
      flushBullets();
      flushPara();
      blocks.push({ type: "heading", text: line });
    } else {
      flushBullets();
      paraBuf.push(line);
    }
  }
  flushBullets();
  flushPara();
  return blocks;
}

export function ExplanationText({
  text,
  mode,
  className,
}: {
  text: string;
  mode: "formatted" | "plain";
  className?: string;
}) {
  if (mode === "plain") {
    return <div className={cn("whitespace-pre-wrap", className)}>{text}</div>;
  }

  const blocks = parseExplanation(text);
  return (
    <div className={cn("space-y-1.5", className)}>
      {blocks.map((b, i) => {
        if (b.type === "heading") {
          const isAnswer = b.text.toUpperCase().startsWith("CORRECT ANSWER");
          return (
            <div
              key={i}
              className={cn(
                "mt-3 first:mt-0 text-xs font-bold tracking-wide",
                isAnswer ? "text-sm text-primary" : "text-muted-foreground",
              )}
            >
              {b.text}
            </div>
          );
        }
        if (b.type === "bullets") {
          return (
            <ul key={i} className="list-disc space-y-1 pl-4">
              {b.items.map((item, j) => (
                <li key={j}>{item}</li>
              ))}
            </ul>
          );
        }
        return <p key={i}>{b.text}</p>;
      })}
    </div>
  );
}

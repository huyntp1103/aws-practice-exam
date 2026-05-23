import { useEffect, useState, type FormEvent } from "react";
import { Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import awsLogo from "@/assets/aws-logo.png";

const STORAGE_KEY = "aws-study:unlocked";
const HASH = (import.meta.env.VITE_PASSWORD_HASH as string | undefined)?.toLowerCase();

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function readUnlocked(): boolean {
  if (!HASH) return true; // no hash configured → open access (dev convenience)
  try {
    return localStorage.getItem(STORAGE_KEY) === HASH;
  } catch {
    return false;
  }
}

export function PasswordGate({ children }: { children: React.ReactNode }) {
  const [unlocked, setUnlocked] = useState<boolean>(readUnlocked);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Surface a clear dev signal when the hash isn't set in production.
  useEffect(() => {
    if (!HASH && import.meta.env.PROD) {
      console.warn("[PasswordGate] VITE_PASSWORD_HASH is unset — site is open.");
    }
  }, []);

  if (unlocked) return <>{children}</>;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!HASH) return;
    setBusy(true);
    setError(null);
    try {
      const hex = (await sha256Hex(pw)).toLowerCase();
      if (hex === HASH) {
        try {
          localStorage.setItem(STORAGE_KEY, HASH);
        } catch {
          // localStorage may be disabled — still unlock for this tab
        }
        setUnlocked(true);
      } else {
        setError("Incorrect password.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="container max-w-sm pt-24">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <img src={awsLogo} alt="AWS" className="h-12 w-auto" />
          <div className="text-sm text-muted-foreground">AWS Exam Practice</div>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Lock className="h-5 w-5" /> Locked
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="pw">Password</Label>
                <Input
                  id="pw"
                  type="password"
                  autoComplete="current-password"
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                  autoFocus
                  required
                />
              </div>
              {error && <div className="text-sm text-destructive">{error}</div>}
              <Button type="submit" disabled={busy || !pw} className="w-full">
                {busy ? "Checking…" : "Unlock"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

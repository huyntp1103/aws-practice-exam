import { BrowserRouter, NavLink, Route, Routes, Link } from "react-router-dom";
import { PasswordGate } from "@/components/PasswordGate";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Home } from "@/pages/Home";
import { Session } from "@/pages/Session";
import { Results } from "@/pages/Results";
import { History } from "@/pages/History";
import { Settings } from "@/pages/Settings";
import { cn } from "@/lib/utils";
import awsLogo from "@/assets/aws-logo.png";

export default function App() {
  return (
    <ThemeProvider>
      <PasswordGate>
      <BrowserRouter>
        <div className="min-h-screen bg-background text-foreground">
          <header className="border-b">
            <div className="container flex h-14 items-center justify-between gap-4">
              <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
                <img
                  src={awsLogo}
                  alt=""
                  className="h-7 w-auto"
                  width={28}
                  height={28}
                />
                <span>AWS Exam Practice</span>
              </Link>
              <nav className="flex items-center gap-1 text-sm">
                <NavItem to="/">Home</NavItem>
                <NavItem to="/history">History</NavItem>
                <NavItem to="/settings">Settings</NavItem>
                <ThemeToggle />
              </nav>
            </div>
          </header>
          <main>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/history" element={<History />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/session/:examCode" element={<Session />} />
              <Route path="/results/:examCode/:attemptId" element={<Results />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
      </PasswordGate>
    </ThemeProvider>
  );
}

function NavItem({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        cn(
          "rounded-md px-3 py-1.5 hover:bg-accent hover:text-accent-foreground",
          isActive && "bg-accent text-accent-foreground"
        )
      }
    >
      {children}
    </NavLink>
  );
}

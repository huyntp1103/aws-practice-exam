import { BrowserRouter, NavLink, Route, Routes, Link } from "react-router-dom";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Home } from "@/pages/Home";
import { Session } from "@/pages/Session";
import { Results } from "@/pages/Results";
import { History } from "@/pages/History";
import { cn } from "@/lib/utils";

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <div className="min-h-screen bg-background text-foreground">
          <header className="border-b">
            <div className="container flex h-14 items-center justify-between gap-4">
              <Link to="/" className="font-semibold tracking-tight">
                AWS Exam Practice
              </Link>
              <nav className="flex items-center gap-1 text-sm">
                <NavItem to="/">Home</NavItem>
                <NavItem to="/history">History</NavItem>
                <ThemeToggle />
              </nav>
            </div>
          </header>
          <main>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/history" element={<History />} />
              <Route path="/session/:examCode" element={<Session />} />
              <Route path="/results/:examCode/:attemptId" element={<Results />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
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

import Link from "next/link";
import {
  ArrowLeft,
  Home,
  Clock,
  Star,
  Files,
  FileText,
  Table2,
  Presentation,
  Leaf,
  ChevronRight,
  ShieldCheck,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { ToolPictogram } from "./pictogram";
export function ToolsShell({
  children,
  title,
  cloudData = false,
}: {
  children: React.ReactNode;
  title?: string;
  cloudData?: boolean;
}) {
  return (
    <div className="office">
      <aside className="sidebar">
        <Link href="/" className="brand" aria-label="Syrka Workspace">
          <Brand />
        </Link>
        <Button className="new-button" asChild>
          <Link href="/">
            <ArrowLeft size={17} />
            Your workspace
          </Link>
        </Button>
        <nav>
          {[
            { name: "Home", Icon: Home },
            { name: "Recent", Icon: Clock },
            { name: "Starred", Icon: Star },
            { name: "All files", Icon: Files },
          ].map(({ name, Icon }) => (
            <Link
              href={
                name === "Home" ? "/" : `/?section=${encodeURIComponent(name)}`
              }
              className="nav"
              key={name}
            >
              <Icon size={18} />
              {name}
            </Link>
          ))}
        </nav>
        <div className="nav-label">YOUR APPS</div>
        {[
          { name: "Write", Icon: FileText, color: "#4775cc" },
          { name: "Tables", Icon: Table2, color: "#36816a" },
          { name: "Present", Icon: Presentation, color: "#cf764c" },
        ].map(({ name, Icon, color }) => (
          <Link
            href={`/?app=${({ Write: "doc", Tables: "sheet", Present: "slides" } as Record<string, string>)[name]}`}
            key={name}
            className="nav"
          >
            <Icon size={18} color={color} />
            {name}
          </Link>
        ))}
        <Link href="/tools" className="nav active" aria-current="page">
          <span style={{ color: "#8b78a0" }}>
            <ToolPictogram name="tools" size={18} />
          </span>
          Tools
          <span className="nav-dot" />
        </Link>
        <div className="sidebar-bottom">
          <div className="workspace-note">
            <Leaf size={22} />
            <strong>A little help goes a long way.</strong>
            <p>
              Useful tools.
              <br />
              More possibility.
            </p>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span className="breadcrumb">
            Workspace
            <ChevronRight size={14} />
            <Link href="/tools">Tools</Link>
            {title && (
              <>
                <ChevronRight size={14} />
                <strong>{title}</strong>
              </>
            )}
          </span>
          <span className="tools-privacy">
            <ShieldCheck size={15} />
            Private by design
          </span>
        </header>
        <main className="dashboard tools-dashboard">
          {children}
          <footer>
            <span className="footer-logo">
              <Brand compact />
            </span>
            <span>A calmer place to create.</span>
            <span>
              {cloudData
                ? "Cloud sessions use private account storage."
                : "Your files stay on your device."}
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}

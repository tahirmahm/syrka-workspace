"use client";
import { useState } from "react";
import Link from "next/link";
import { Search, ArrowUpRight } from "lucide-react";
import { tools, knowledgeTools } from "@/lib/tools/registry";
import { ToolPictogram } from "./pictogram";
export default function Catalogue() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All tools");
  const shown = [...tools, ...knowledgeTools].filter(
    (t) =>
      (category === "All tools" || category === t.category) &&
      `${t.name} ${t.description}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <div className="page-heading">
        <div className="eyebrow">A LITTLE HELP. A LOT MORE POSSIBILITY.</div>
        <h1>Tools for everyday work.</h1>
        <p>Simple, free utilities. No unnecessary steps.</p>
      </div>
      <label className="tools-search">
        <Search size={20} />
        <input
          aria-label="Search tools"
          placeholder="Find a tool…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <div
        className="file-filters tool-categories"
        aria-label="Tool categories"
      >
        {["All tools", "PDF", "Images", "Everyday", "Meetings"].map((c) => (
          <button
            key={c}
            aria-pressed={c === category}
            className={c === category ? "selected" : ""}
            onClick={() => setCategory(c)}
          >
            {c}
          </button>
        ))}
      </div>
      <div className="tools-grid">
        {shown.map((tool) => (
          <Link
            href={`/tools/${tool.slug}`}
            className={`tool-card category-${tool.category.toLowerCase()}`}
            key={tool.slug}
          >
            <div className="tool-card-top">
              <span className="tool-icon">
                <ToolPictogram name={tool.slug} size={28} />
              </span>
              <ArrowUpRight size={18} />
            </div>
            <small>{tool.category}</small>
            <h2>{tool.name}</h2>
            <p>{tool.description}</p>
          </Link>
        ))}
      </div>
      {!shown.length && (
        <div className="empty">
          <h2>No tools found</h2>
          <p>Try a different search or category.</p>
        </div>
      )}
      <p className="tools-local-note">
        PDF, image and everyday utilities run locally without an account.
        Notes use private account-based records; AI
        requires configured services and consent.
      </p>
    </>
  );
}

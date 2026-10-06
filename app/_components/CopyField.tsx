"use client";

import { useState } from "react";

/** Valeur à copier (URL MCP, lien d'invitation…). */
export default function CopyField({ value, compact }: { value: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={compact ? "url-box compact" : "url-box"}>
      <code>{value}</code>
      <button
        type="button"
        className={compact ? "btn ghost" : "btn primary"}
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? "Copié ✓" : "Copier"}
      </button>
    </div>
  );
}

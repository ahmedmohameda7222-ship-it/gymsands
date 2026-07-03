"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function TagInput({
  id,
  label,
  value,
  onChange,
  placeholder,
  helperText
}: {
  id: string;
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  helperText?: string;
}) {
  const [draft, setDraft] = useState("");

  function add(raw = draft) {
    const additions = raw.split(",").map((item) => item.trim()).filter(Boolean);
    if (!additions.length) return;
    onChange(Array.from(new Set([...value, ...additions])));
    setDraft("");
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="rounded-[14px] border border-input bg-card p-2 focus-within:ring-2 focus-within:ring-ring">
        {value.length ? (
          <div className="mb-2 flex flex-wrap gap-2">
            {value.map((item) => (
              <span key={item} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary/10 py-1 pl-3 pr-1 text-sm font-semibold text-primary">
                {item}
                <button type="button" onClick={() => onChange(value.filter((entry) => entry !== item))} aria-label={`Remove ${item}`} title={`Remove ${item}`} className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-xs hover:bg-primary/10"><X className="h-4 w-4" /><span>Remove</span></button>
              </span>
            ))}
          </div>
        ) : null}
        <div className="flex gap-2">
          <Input
            id={id}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== ",") return;
              event.preventDefault();
              add();
            }}
            onBlur={() => add()}
            placeholder={placeholder}
            className="h-11 min-h-11 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
          />
          <Button type="button" variant="outline" className="shrink-0" onMouseDown={(event) => event.preventDefault()} onClick={() => add()} aria-label={`Add ${label.toLowerCase()}`}><Plus className="h-4 w-4" /> Add</Button>
        </div>
      </div>
      {helperText ? <p className="text-xs text-muted-foreground">{helperText}</p> : null}
    </div>
  );
}

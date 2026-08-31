import { Check, ChevronDown, Search } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

export interface ComboboxOption {
  value: string;
  label: string;
  description?: string;
  color?: string;
  group?: string;
  groupColor?: string;
  groupIcon?: string;
  /** Search-only text (e.g. dungeon codes like "DT" for Desert Temple). */
  keywords?: string;
}

export interface ComboboxProps {
  options: ComboboxOption[];
  value?: string | undefined;
  onChange?: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  className?: string;
  disabled?: boolean;
  error?: boolean;
  errorMessage?: string | undefined;
}

/*
  Searchable dropdown with collapsible groups and per-option colors.
  Ported from AbyssFishLog, restyled to the DQR-Calc token scale.
*/

export function Combobox({
  options,
  value,
  onChange,
  placeholder = "Select...",
  searchPlaceholder = "Search...",
  className,
  disabled = false,
  error = false,
  errorMessage,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [collapsedGroups, setCollapsedGroups] = React.useState<Set<string>>(new Set());
  const containerRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const selected = options.find((opt) => opt.value === value);

  const filtered = React.useMemo(() => {
    if (!search) return options;
    const lower = search.toLowerCase();
    return options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(lower) ||
        opt.description?.toLowerCase().includes(lower) ||
        opt.group?.toLowerCase().includes(lower) ||
        opt.keywords?.toLowerCase().includes(lower),
    );
  }, [options, search]);

  const toggleGroup = (group: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  const visible = React.useMemo(() => {
    if (search) return filtered;
    return filtered.filter((opt) => !opt.group || !collapsedGroups.has(opt.group));
  }, [filtered, search, collapsedGroups]);

  const openRef = React.useRef(open);
  openRef.current = open;

  React.useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (!openRef.current) return;
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  React.useEffect(() => {
    if (open) {
      const timer = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [open]);

  const handleSelect = (optionValue: string) => {
    onChange?.(optionValue);
    setOpen(false);
    setSearch("");
  };

  const [highlightIndex, setHighlightIndex] = React.useState(0);

  React.useEffect(() => {
    setHighlightIndex(0);
  }, [visible]);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (!open) {
      if (event.key === "Enter" || event.key === "ArrowDown" || event.key === " ") {
        event.preventDefault();
        setOpen(true);
      }
      return;
    }

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setHighlightIndex((prev) => (prev < visible.length - 1 ? prev + 1 : 0));
        break;
      case "ArrowUp":
        event.preventDefault();
        setHighlightIndex((prev) => (prev > 0 ? prev - 1 : visible.length - 1));
        break;
      case "Enter":
        event.preventDefault();
        if (visible[highlightIndex]) handleSelect(visible[highlightIndex].value);
        break;
      case "Escape":
        event.preventDefault();
        setOpen(false);
        setSearch("");
        break;
    }
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        disabled={disabled}
        onClick={() => setOpen(!open)}
        onKeyDown={handleKeyDown}
        type="button"
        className={cn(
          "flex h-10 w-full items-center justify-between rounded-sm border border-border bg-transparent px-3 py-2 text-sm shadow-none transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
          "disabled:cursor-not-allowed disabled:opacity-50",
          error && "border-destructive/70 focus-visible:ring-destructive/50",
          open && "border-border/40",
          !selected && "text-muted-foreground",
        )}
      >
        <span
          className="truncate"
          style={selected?.color ? { color: selected.color } : undefined}
        >
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          aria-hidden
          className={cn("h-4 w-4 opacity-50 transition-transform", open && "rotate-180")}
        />
      </button>

      {error && errorMessage && <p className="mt-1 text-xs text-destructive">{errorMessage}</p>}

      {open && (
        <div className="absolute z-50 mt-1 w-full animate-in fade-in-0 zoom-in-95 rounded-sm border border-border bg-surface-lowest text-popover-foreground shadow-lg">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Search aria-hidden className="h-4 w-4 text-muted-foreground" />
            <input
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={searchPlaceholder}
              ref={inputRef}
              type="text"
              value={search}
              className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>

          <div className="max-h-[228px] overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                No results found
              </div>
            ) : (
              (() => {
                let visibleIndex = 0;
                let prevGroup: string | undefined;
                return filtered.map((option) => {
                  const showGroupHeader = option.group && option.group !== prevGroup;
                  if (showGroupHeader) prevGroup = option.group;
                  const collapsed = !search && option.group && collapsedGroups.has(option.group);
                  const currentIndex = collapsed ? -1 : visibleIndex++;
                  return (
                    <React.Fragment key={`${option.group ?? ""}-${option.value}`}>
                      {showGroupHeader && (
                        <button
                          onClick={() => option.group && toggleGroup(option.group)}
                          type="button"
                          className={cn(
                            "flex w-full cursor-pointer items-center justify-between rounded-sm px-2 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent/50",
                            filtered.indexOf(option) > 0 && "mt-1 border-t border-border pt-2",
                          )}
                          style={option.groupColor ? { color: option.groupColor } : undefined}
                        >
                          <span className="flex items-center gap-1.5">
                            {option.groupIcon && (
                              <img
                                alt=""
                                aria-hidden
                                className="h-5 w-5 rounded-full object-cover"
                                src={option.groupIcon}
                              />
                            )}
                            {option.group}
                          </span>
                          <ChevronDown
                            aria-hidden
                            className={cn("h-3 w-3 transition-transform", collapsed && "-rotate-90")}
                          />
                        </button>
                      )}
                      {!collapsed && (
                        <button
                          onClick={() => handleSelect(option.value)}
                          onMouseEnter={() => setHighlightIndex(currentIndex)}
                          type="button"
                          className={cn(
                            "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none transition-colors",
                            currentIndex === highlightIndex && "bg-accent text-accent-foreground",
                            option.value === value && "font-medium",
                          )}
                        >
                          <div className="flex flex-col items-start">
                            <span style={option.color ? { color: option.color } : undefined}>
                              {option.label}
                            </span>
                            {option.description && (
                              <span className="text-xs text-muted-foreground">{option.description}</span>
                            )}
                          </div>
                          {option.value === value && (
                            <span className="absolute right-2 flex h-3.5 w-3.5 items-center justify-center">
                              <Check aria-hidden className="h-4 w-4" />
                            </span>
                          )}
                        </button>
                      )}
                    </React.Fragment>
                  );
                });
              })()
            )}
          </div>
        </div>
      )}
    </div>
  );
}

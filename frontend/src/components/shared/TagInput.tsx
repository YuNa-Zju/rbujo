import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Hash, Plus, X } from "lucide-react";

interface TagInputProps {
  tags: string[];
  draft: string;
  suggestions: string[];
  highlightedIndex: number;
  placeholder: string;
  onDraftChange: (value: string) => void;
  onFocusChange: (focused: boolean) => void;
  onHighlightChange: (index: number) => void;
  onAddTag: (value: string) => void;
  onRemoveTag: (tag: string) => void;
  containerClassName?: string;
  inputClassName?: string;
  chipClassName?: string;
  suggestionClassName?: string;
  selectedSuggestionClassName?: string;
  iconClassName?: string;
  addButtonClassName?: string;
  addButtonContent?: ReactNode;
  addButtonLabel?: string;
  showAddButton?: boolean;
}

export default function TagInput({
  tags,
  draft,
  suggestions,
  highlightedIndex,
  placeholder,
  onDraftChange,
  onFocusChange,
  onHighlightChange,
  onAddTag,
  onRemoveTag,
  containerClassName = "relative rounded-2xl border border-base-200/70 bg-base-200/25 px-3 py-2",
  inputClassName = "min-w-28 flex-1 bg-transparent text-sm outline-none placeholder:text-base-content/30",
  chipClassName = "inline-flex items-center gap-1 rounded-full border border-primary/10 bg-primary/10 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/15",
  suggestionClassName = "text-base-content/75 hover:bg-base-200/70",
  selectedSuggestionClassName = "bg-primary/10 text-primary",
  iconClassName = "text-primary/70",
  addButtonClassName = "btn btn-ghost btn-xs btn-circle text-base-content/45 hover:text-primary hover:bg-primary/10",
  addButtonContent,
  addButtonLabel = "添加标签",
  showAddButton = true,
}: TagInputProps) {
  const listboxId = useId();
  const optionPrefix = `${listboxId}-option`;
  const inputRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    const selected = optionRefs.current[highlightedIndex];
    selected?.scrollIntoView({ block: "nearest" });
  }, [highlightedIndex]);

  const commitTag = (value: string) => {
    onAddTag(value);
    onHighlightChange(-1);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" && suggestions.length > 0) {
      e.preventDefault();
      onHighlightChange(
        highlightedIndex < 0 ? 0 : (highlightedIndex + 1) % suggestions.length,
      );
      return;
    }

    if (e.key === "ArrowUp" && suggestions.length > 0) {
      e.preventDefault();
      onHighlightChange(
        highlightedIndex < 0
          ? suggestions.length - 1
          : (highlightedIndex - 1 + suggestions.length) % suggestions.length,
      );
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      commitTag(
        highlightedIndex >= 0 ? suggestions[highlightedIndex] : draft,
      );
      return;
    }

    if (e.key === "," || e.key === "，") {
      e.preventDefault();
      commitTag(draft);
      return;
    }

    if (e.key === "Backspace" && !draft && tags.length > 0) {
      onRemoveTag(tags[tags.length - 1]);
    }
  };

  const handleAddButtonClick = () => {
    if (draft.trim()) {
      commitTag(draft);
      return;
    }
    inputRef.current?.focus();
  };

  const activeDescendant =
    highlightedIndex >= 0 ? `${optionPrefix}-${highlightedIndex}` : undefined;

  return (
    <div className={containerClassName}>
      <div className="flex flex-wrap items-center gap-2">
        {showAddButton && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleAddButtonClick}
            className={addButtonClassName}
            aria-label={addButtonLabel}
            title={addButtonLabel}
          >
            {addButtonContent || (
              draft.trim() ? (
                <Plus size={14} strokeWidth={2.5} />
              ) : (
                <Hash size={14} strokeWidth={2.5} />
              )
            )}
          </button>
        )}

        {tags.map((tag) => (
          <button
            key={tag}
            type="button"
            onClick={() => onRemoveTag(tag)}
            className={chipClassName}
          >
            {tag}
            <X size={11} strokeWidth={2.5} />
          </button>
        ))}

        <input
          ref={inputRef}
          className={inputClassName}
          value={draft}
          onChange={(e) => {
            onDraftChange(e.target.value);
            onHighlightChange(-1);
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => onFocusChange(true)}
          onBlur={() => {
            commitTag(draft);
            onFocusChange(false);
          }}
          placeholder={placeholder}
          role="combobox"
          aria-expanded={suggestions.length > 0}
          aria-controls={listboxId}
          aria-activedescendant={activeDescendant}
        />
      </div>

      {suggestions.length > 0 && (
        <div
          id={listboxId}
          className="absolute left-3 right-3 top-full z-40 mt-2 max-h-44 overflow-y-auto rounded-xl border border-base-200 bg-base-100/95 p-1 shadow-xl backdrop-blur-md"
          role="listbox"
        >
          {suggestions.map((tag, index) => {
            const selected = index === highlightedIndex;
            return (
              <button
                key={tag}
                id={`${optionPrefix}-${index}`}
                ref={(element) => {
                  optionRefs.current[index] = element;
                }}
                type="button"
                role="option"
                aria-selected={selected}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => onHighlightChange(index)}
                onClick={() => commitTag(tag)}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
                  selected ? selectedSuggestionClassName : suggestionClassName
                }`}
              >
                <Hash size={13} className={iconClassName} />
                <span className="truncate">{tag}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

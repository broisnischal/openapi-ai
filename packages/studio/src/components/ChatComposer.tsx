import { cn } from '#/lib/utils';
import { AnimatePresence, LazyMotion, domMax, m } from 'motion/react';
import { forwardRef, useState } from 'react';
import {
  ArrowUp,
  Sparkles,
  X,
  Search,
  FileCode,
  Terminal,
  ShieldAlert,
  FlaskConical,
  Code2,
  KeyRound,
  Bug,
  ChevronDown,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { AIInputContext, AIInputDropdown } from '#/components/ui/ai-input';

export interface ChatTool {
  icon: LucideIcon;
  label: string;
  prompt?: string;
  group?: string;
}

const API_TOOLS: ChatTool[] = [
  { icon: Search,       label: 'Search endpoints',    prompt: 'Search endpoints for ',               group: 'Explore'  },
  { icon: FileCode,     label: 'Get schema',           prompt: 'Show me the schema for ',             group: 'Explore'  },
  { icon: Terminal,     label: 'Execute request',      prompt: 'Execute a request to ',               group: 'Explore'  },
  { icon: Code2,        label: 'Generate code',        prompt: 'Generate a code example for ',        group: 'Generate' },
  { icon: KeyRound,     label: 'Find auth',            prompt: 'How do I authenticate to ',           group: 'Explore'  },
  { icon: FlaskConical, label: 'Test endpoint',        prompt: 'Test and validate the endpoint ',     group: 'Testing'  },
  { icon: ShieldAlert,  label: 'Security check',       prompt: 'Check for security issues in ',       group: 'Security' },
  { icon: Bug,          label: 'Debug request',        prompt: 'Help me debug a failing request to ', group: 'Testing'  },
];

interface ChatComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  loading?: boolean;
  placeholder?: string;
  tools?: ChatTool[];
  className?: string;
}

export const ChatComposer = forwardRef<HTMLTextAreaElement, ChatComposerProps>(
  function ChatComposer({
    value,
    onChange,
    onSubmit,
    loading = false,
    placeholder = 'Ask about your API…',
    tools = API_TOOLS,
    className,
  }, ref) {
    const [activeDropdown, setActiveDropdown] = useState<'plus' | 'tools' | 'model' | null>(null);
    const [selectedTool, setSelectedTool] = useState<ChatTool | null>(null);

    const hasText = value.trim().length > 0;
    const canSend = hasText && !loading;

    const resize = (el: HTMLTextAreaElement) => {
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (canSend) onSubmit();
      }
    };

    const selectTool = (tool: ChatTool) => {
      setSelectedTool(tool);
      setActiveDropdown(null);
      if (tool.prompt && !value.trim()) {
        onChange(tool.prompt);
        requestAnimationFrame(() => {
          const el = typeof ref === 'object' ? ref?.current : null;
          if (!el) return;
          el.focus();
          el.setSelectionRange(tool.prompt!.length, tool.prompt!.length);
          resize(el);
        });
      }
    };

    return (
      <LazyMotion features={domMax}>
        <AIInputContext.Provider value={{ activeDropdown, setActiveDropdown }}>
          <div className={cn('w-full', className)}>
            <div className="relative rounded-2xl border border-[var(--border)] bg-[var(--card)]">
              {/* Textarea */}
              <div className="px-3 pt-2.5 pb-9">
                <textarea
                  ref={ref}
                  value={value}
                  onChange={(e) => { onChange(e.target.value); resize(e.target); }}
                  onKeyDown={handleKeyDown}
                  disabled={loading}
                  placeholder={loading ? 'Thinking…' : placeholder}
                  rows={1}
                  autoFocus
                  className="w-full min-h-[22px] max-h-[160px] resize-none bg-transparent text-[13px] leading-relaxed text-[var(--foreground)] outline-none placeholder:text-[var(--placeholder-foreground)] disabled:opacity-60"
                  onInput={(e) => resize(e.currentTarget)}
                />
              </div>

              {/* Bottom bar */}
              <div className="absolute inset-x-2.5 bottom-2 flex items-center justify-between gap-2">
                {/* Left: tool selector */}
                <div className="relative flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setActiveDropdown(activeDropdown === 'tools' ? null : 'tools')}
                    className={cn(
                      'flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium transition-colors border',
                      activeDropdown === 'tools'
                        ? 'bg-[var(--elevated)] text-[var(--foreground)] border-[var(--border-strong)]'
                        : 'bg-transparent text-[var(--muted-foreground)] border-[var(--border)] hover:bg-[var(--elevated)] hover:text-[var(--foreground)]',
                    )}
                  >
                    {selectedTool ? (
                      <>
                        <selectedTool.icon className="size-3" />
                        <span>{selectedTool.label}</span>
                        <ChevronDown className={cn('size-3 transition-transform', activeDropdown === 'tools' && 'rotate-180')} />
                        <span
                          role="button"
                          tabIndex={-1}
                          onClick={(e) => { e.stopPropagation(); setSelectedTool(null); setActiveDropdown(null); }}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); setSelectedTool(null); setActiveDropdown(null); } }}
                          className="ml-0.5 rounded-full hover:text-[var(--foreground)] cursor-pointer"
                        >
                          <X className="size-2.5" />
                        </span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="size-3" />
                        <span>Tools</span>
                        <ChevronDown className={cn('size-3 transition-transform', activeDropdown === 'tools' && 'rotate-180')} />
                      </>
                    )}
                  </button>

                  <AIInputDropdown
                    isOpen={activeDropdown === 'tools'}
                    onClose={() => setActiveDropdown(null)}
                    items={tools}
                    className="bottom-full left-0 mb-2 w-52"
                    renderItem={(item) => (
                      <button
                        type="button"
                        onClick={() => selectTool(item)}
                        className={cn(
                          'group flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[var(--foreground-secondary)] transition-colors hover:bg-[var(--elevated)]',
                          selectedTool?.label === item.label && 'bg-[var(--elevated)]',
                        )}
                      >
                        <item.icon className="size-3.5 text-[var(--muted-foreground)] transition-colors group-hover:text-[var(--foreground)]" />
                        <span className="text-xs font-medium">{item.label}</span>
                      </button>
                    )}
                  />
                </div>

                {/* Right: send button */}
                <div className="flex items-center gap-1.5">
                  <AnimatePresence mode="wait" initial={false}>
                    {hasText ? (
                      <m.div
                        key="active"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        transition={{ duration: 0.12 }}
                        className="flex items-center gap-1"
                      >
                        <button
                          type="button"
                          onClick={() => onChange('')}
                          className="p-1.5 text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
                          title="Clear"
                        >
                          <X className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={onSubmit}
                          disabled={!canSend}
                          className="rounded-full bg-[var(--primary)] p-1.5 text-[var(--primary-foreground)] transition-opacity hover:opacity-90 disabled:opacity-40"
                          title="Send (Enter)"
                        >
                          {loading ? (
                            <span className="spinner size-3.5" />
                          ) : (
                            <ArrowUp className="size-3.5" />
                          )}
                        </button>
                      </m.div>
                    ) : (
                      <m.button
                        key="idle"
                        type="button"
                        disabled
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        transition={{ duration: 0.12 }}
                        className="rounded-full bg-[var(--subtle)] p-1.5 text-[var(--muted-foreground)] opacity-50"
                      >
                        <ArrowUp className="size-3.5" />
                      </m.button>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>

            <p className="mt-1.5 text-center text-[10px] text-[var(--placeholder-foreground)] select-none">
              Enter to send · Shift+Enter for newline
            </p>
          </div>
        </AIInputContext.Provider>
      </LazyMotion>
    );
  }
);

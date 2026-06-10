import { createFileRoute } from '@tanstack/react-router';
import React, { useState, useRef, useEffect } from 'react';
import { CLI_BASE_URL, authHeaders } from '../lib/api';
import {
  Bot, User, Sparkles, Trash2, ChevronDown, ChevronRight,
  Zap, Globe, Search, FileCode, Terminal, Check, X,
  Plus, MessageSquare, Clock, Wrench, Shield, KeyRound, UserCheck,
  AlertTriangle, Wifi,
} from 'lucide-react';
import { Markdown } from '../components/Markdown';
import { ChatComposer } from '../components/ChatComposer';
import { cn } from '#/lib/utils';
import { Button } from '#/components/ui/button';
import { dbPut, dbGetAll, dbDel } from '../lib/storage';

export const Route = createFileRoute('/ai')({ component: AiPage });

// ─── Types ────────────────────────────────────────────────────────────────────

interface ToolCall { tool: string; input: Record<string, unknown>; output: string; isError: boolean; }
interface LiveToolCall { tool: string; input: Record<string, unknown>; output?: string; isError?: boolean; done: boolean; }
interface Message { id: string; role: 'user' | 'assistant'; content: string; toolCalls?: ToolCall[]; }
interface StoredChat { id: string; title: string; messages: Message[]; createdAt: number; updatedAt: number; }

// ─── Tool metadata ────────────────────────────────────────────────────────────

const TOOL_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  search_endpoints:    { label: 'Search Endpoints',  icon: <Search className="size-3" />,    color: 'var(--muted-foreground)' },
  get_endpoint_schema: { label: 'Get Schema',        icon: <FileCode className="size-3" />,  color: 'var(--muted-foreground)' },
  execute_api_request: { label: 'Execute Request',   icon: <Terminal className="size-3" />,  color: 'var(--muted-foreground)' },
  fetch_url:           { label: 'Fetch URL',         icon: <Globe className="size-3" />,    color: 'var(--muted-foreground)' },
  dns_lookup:          { label: 'DNS Lookup',        icon: <Wifi className="size-3" />,     color: 'var(--muted-foreground)' },
  get_recent_logs:     { label: 'Recent Logs',       icon: <Clock className="size-3" />,    color: 'var(--muted-foreground)' },
  run_security_check:  { label: 'Security Check',    icon: <AlertTriangle className="size-3" />, color: 'var(--muted-foreground)' },
  list_auth_profiles:  { label: 'List Auth Profiles', icon: <Shield className="size-3" />,  color: 'var(--muted-foreground)' },
  set_active_auth:     { label: 'Switch Auth',       icon: <UserCheck className="size-3" />, color: 'var(--muted-foreground)' },
  save_auth_token:     { label: 'Save Auth Token',   icon: <KeyRound className="size-3" />, color: 'var(--muted-foreground)' },
};

// ─── IDB helpers ──────────────────────────────────────────────────────────────

async function saveChat(chat: StoredChat) { return dbPut('chats', chat); }
async function getAllChats(): Promise<StoredChat[]> {
  try { return await dbGetAll<StoredChat>('chats'); } catch { return []; }
}
async function removeChat(id: string) { return dbDel('chats', id); }

function newId(suffix = '') {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + suffix;
}

function chatTitle(msgs: Message[]): string {
  const first = msgs.find(m => m.role === 'user');
  if (!first) return 'New Chat';
  return first.content.slice(0, 55) + (first.content.length > 55 ? '…' : '');
}

// ─── Tool input preview ───────────────────────────────────────────────────────

function inputPreview(tc: { tool: string; input: Record<string, unknown> }): React.ReactNode {
  if (tc.tool === 'fetch_url' && tc.input.url)
    return <span className="font-mono text-[10px] opacity-70">{String(tc.input.url).slice(0, 48)}</span>;
  if (tc.tool === 'search_endpoints' && tc.input.query)
    return <span className="opacity-70">&ldquo;{String(tc.input.query)}&rdquo;</span>;
  if ((tc.tool === 'execute_api_request' || tc.tool === 'get_endpoint_schema') && tc.input.operationId)
    return <span className="font-mono text-[10px] opacity-70">{String(tc.input.operationId)}</span>;
  if (tc.tool === 'set_active_auth' && tc.input.name)
    return <span className="opacity-70">{String(tc.input.name)}</span>;
  if (tc.tool === 'save_auth_token' && tc.input.name)
    return <span className="opacity-70">{String(tc.input.name)}</span>;
  if (tc.tool === 'dns_lookup' && tc.input.hostname)
    return <span className="font-mono text-[10px] opacity-70">{String(tc.input.hostname)}</span>;
  return null;
}

// ─── ToolCallsSummary ─────────────────────────────────────────────────────────

function ToolCallsSummary({ toolCalls }: { toolCalls: ToolCall[] }) {
  const [expanded, setExpanded] = useState(false);
  const [openSet, setOpenSet] = useState<Set<number>>(new Set());

  if (!toolCalls.length) return null;

  const toggle = (i: number) => setOpenSet(prev => {
    const next = new Set(prev);
    next.has(i) ? next.delete(i) : next.add(i);
    return next;
  });

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setExpanded(p => !p)}
        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-[var(--muted-foreground)] transition-colors hover:bg-[var(--elevated)] hover:text-[var(--foreground-secondary)]"
      >
        <Wrench className="size-3 shrink-0" />
        <span>{toolCalls.length} tool{toolCalls.length > 1 ? 's' : ''} used</span>
        {expanded
          ? <ChevronDown className="size-3 shrink-0" />
          : <ChevronRight className="size-3 shrink-0" />}
      </button>

      {expanded && (
        <div className="mt-1.5 flex flex-col gap-1 pl-1">
          {toolCalls.map((tc, i) => {
            const meta = TOOL_META[tc.tool] ?? { label: tc.tool, icon: <Zap className="size-3" />, color: '#8b5cf6' };
            const isOpen = openSet.has(i);
            return (
              <div key={i} className={cn(
                'overflow-hidden rounded-lg border',
                tc.isError ? 'border-[rgba(239,68,68,0.25)] bg-[rgba(239,68,68,0.03)]' : 'border-[var(--border)] bg-[var(--card)]',
              )}>
                <button
                  type="button"
                  onClick={() => toggle(i)}
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left"
                >
                  <span className="flex size-[18px] shrink-0 items-center justify-center rounded" style={{ background: `${meta.color}20`, color: meta.color }}>
                    {meta.icon}
                  </span>
                  <span className="flex-1 text-[11.5px] font-medium text-[var(--foreground)]">
                    {meta.label}
                    <span className="ml-1.5 font-normal">{inputPreview(tc)}</span>
                  </span>
                  {tc.isError && <span className="text-[10px] text-[var(--destructive)]">error</span>}
                  {isOpen
                    ? <ChevronDown className="size-3 text-[var(--muted-foreground)]" />
                    : <ChevronRight className="size-3 text-[var(--muted-foreground)]" />}
                </button>
                {isOpen && (
                  <div className="space-y-2 border-t border-[var(--border)] px-2.5 py-2">
                    {Object.keys(tc.input).length > 0 && (
                      <div>
                        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">Input</div>
                        <pre className="m-0 max-h-44 overflow-auto rounded-md bg-[color-mix(in_srgb,var(--foreground)_5%,transparent)] p-2 font-mono text-[11px] leading-relaxed">{JSON.stringify(tc.input, null, 2)}</pre>
                      </div>
                    )}
                    <div>
                      <div className={cn('mb-1 text-[10px] font-semibold uppercase tracking-wider', tc.isError ? 'text-[var(--destructive)]' : 'text-[var(--muted-foreground)]')}>
                        {tc.isError ? 'Error' : 'Output'}
                      </div>
                      <pre className={cn('m-0 max-h-60 overflow-auto rounded-md bg-[color-mix(in_srgb,var(--foreground)_5%,transparent)] p-2 font-mono text-[11px] leading-relaxed', tc.isError ? 'text-[var(--destructive)]' : 'text-[var(--foreground)]')}>
                        {tc.output}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── MessageBubble ────────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user';
  return (
    <div className={cn('group flex items-start gap-3', isUser && 'flex-row-reverse')}>
      {/* Avatar */}
      <div className={cn(
        'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full',
        isUser
          ? 'bg-[var(--foreground)]'
          : 'border border-[var(--border)] bg-[color-mix(in_srgb,var(--foreground)_7%,transparent)]',
      )}>
        {isUser
          ? <User className="size-3.5 text-[var(--background)]" />
          : <Bot className="size-3.5 text-[var(--muted-foreground)]" />}
      </div>

      {/* Content */}
      <div className={cn('min-w-0', isUser ? 'max-w-[76%]' : 'flex-1')}>
        {isUser ? (
          <div className="rounded-2xl rounded-tr-sm bg-[var(--foreground)] px-4 py-2.5 text-[13.5px] leading-relaxed text-[var(--background)]">
            {msg.content}
          </div>
        ) : (
          <div className="pt-0.5">
            <Markdown content={msg.content} />
            {msg.toolCalls && msg.toolCalls.length > 0 && (
              <ToolCallsSummary toolCalls={msg.toolCalls} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── LoadingBubble ────────────────────────────────────────────────────────────

type LoadingPhase = 'thinking' | 'executing' | 'streaming' | null;

function LoadingBubble({
  liveToolCalls, streamingContent, phase, infoMsg,
}: { liveToolCalls: LiveToolCall[]; streamingContent: string; phase: LoadingPhase; infoMsg?: string }) {
  const activeTool = liveToolCalls.find(tc => !tc.done);

  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[color-mix(in_srgb,var(--foreground)_7%,transparent)]">
        <Bot className="size-3.5 text-[var(--muted-foreground)]" />
      </div>
      <div className="flex-1 min-w-0 pt-0.5">
        {/* Completed + active tool calls */}
        {liveToolCalls.length > 0 && (
          <div className="mb-2 flex flex-col gap-1">
            {liveToolCalls.map((tc, i) => {
              const meta = TOOL_META[tc.tool] ?? { label: tc.tool, icon: <Zap className="size-3" />, color: '#8b5cf6' };
              return (
                <div key={i} className={cn(
                  'flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2.5 py-1.5 text-[11.5px] transition-all duration-200',
                  tc.done ? 'opacity-45' : 'opacity-100',
                )}>
                  <span className="flex size-[18px] shrink-0 items-center justify-center rounded" style={{ background: `${meta.color}20`, color: meta.color }}>
                    {meta.icon}
                  </span>
                  <span className="flex-1 font-medium text-[var(--foreground)]">
                    {meta.label}
                    <span className="ml-1.5 font-normal text-[var(--muted-foreground)]">{inputPreview(tc)}</span>
                  </span>
                  <span className="ml-auto shrink-0">
                    {tc.done
                      ? (tc.isError ? <X className="size-3 text-[var(--destructive)]" /> : <Check className="size-3 text-[var(--success)]" />)
                      : <span className="spinner size-3" />}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Streaming text */}
        {streamingContent ? (
          <div>
            <Markdown content={streamingContent} />
            <span className="streaming-cursor" />
          </div>
        ) : phase === 'thinking' ? (
          <div className="flex items-center gap-2 text-[12px] text-[var(--muted-foreground)]">
            <span className="spinner size-3" />
            <span>Thinking…</span>
          </div>
        ) : phase === 'executing' && !activeTool ? (
          <div className="flex items-center gap-2 text-[12px] text-[var(--muted-foreground)]">
            <span className="spinner size-3" />
            <span>Processing…</span>
          </div>
        ) : infoMsg ? (
          <div className="flex items-center gap-2 text-[12px] text-[var(--muted-foreground)]">
            <span className="spinner size-3" />
            <span>{infoMsg}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ─── HistoryPanel ─────────────────────────────────────────────────────────────

function HistoryPanel({
  chats, activeChatId, onSelect, onDelete, onClose,
}: {
  chats: StoredChat[];
  activeChatId: string | null;
  onSelect: (chat: StoredChat) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const sorted = [...chats].sort((a, b) => b.updatedAt - a.updatedAt);
  return (
    <div className="absolute right-0 top-full z-50 mt-1.5 w-72 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--popover)] shadow-xl">
      <div className="border-b border-[var(--border)] px-3 py-2 text-[10.5px] font-semibold uppercase tracking-widest text-[var(--muted-foreground)]">
        Chat History
      </div>
      {sorted.length === 0 ? (
        <div className="px-3 py-8 text-center text-[12px] text-[var(--muted-foreground)]">No saved chats yet</div>
      ) : (
        <div className="max-h-80 overflow-auto py-1">
          {sorted.map(chat => (
            <div
              key={chat.id}
              className={cn(
                'group flex cursor-pointer items-start gap-2.5 px-3 py-2.5 transition-colors hover:bg-[var(--elevated)]',
                activeChatId === chat.id && 'bg-[var(--elevated)]',
              )}
              onClick={() => { onSelect(chat); onClose(); }}
            >
              <MessageSquare className="mt-0.5 size-3.5 shrink-0 text-[var(--muted-foreground)]" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px] text-[var(--foreground)]">{chat.title}</div>
                <div className="mt-0.5 text-[10.5px] text-[var(--muted-foreground)]">
                  {chat.messages.length} messages · {new Date(chat.updatedAt).toLocaleDateString()}
                </div>
              </div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onDelete(chat.id); }}
                className="mt-0.5 shrink-0 rounded p-0.5 text-[var(--muted-foreground)] opacity-0 transition-opacity hover:text-[var(--destructive)] group-hover:opacity-100"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Starter prompts ──────────────────────────────────────────────────────────

const STARTERS = [
  { label: 'Show all GET endpoints', icon: <Search className="size-3.5" /> },
  { label: 'How do I authenticate?', icon: <FileCode className="size-3.5" /> },
  { label: 'Test the health check endpoint', icon: <Terminal className="size-3.5" /> },
  { label: 'Check for security issues', icon: <Sparkles className="size-3.5" /> },
  { label: 'Generate a code example', icon: <FileCode className="size-3.5" /> },
  { label: 'Find the create user endpoint', icon: <Search className="size-3.5" /> },
];

// ─── AiPage ───────────────────────────────────────────────────────────────────

function AiPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatId, setChatId] = useState<string | null>(null);
  const [chatList, setChatList] = useState<StoredChat[]>([]);
  const [streamingContent, setStreamingContent] = useState('');
  const [liveToolCalls, setLiveToolCalls] = useState<LiveToolCall[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState<LoadingPhase>(null);
  const [infoMsg, setInfoMsg] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { getAllChats().then(setChatList).catch(() => {}); }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, liveToolCalls.length, streamingContent]);

  // Focus composer when '/' is pressed globally (and no other input is focused)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/') return;
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || (e.target as HTMLElement)?.isContentEditable) return;
      e.preventDefault();
      composerRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!historyOpen) return;
    const handler = (e: MouseEvent) => {
      if (!historyRef.current?.contains(e.target as Node)) setHistoryOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [historyOpen]);

  const startNewChat = () => {
    setMessages([]); setChatId(null);
    setStreamingContent(''); setLiveToolCalls([]); setInput('');
  };

  const loadChat = (chat: StoredChat) => {
    setMessages(chat.messages); setChatId(chat.id);
    setStreamingContent(''); setLiveToolCalls([]);
  };

  const deleteChatEntry = async (id: string) => {
    await removeChat(id).catch(() => {});
    setChatList(prev => prev.filter(c => c.id !== id));
    if (chatId === id) startNewChat();
  };

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const activeChatId = chatId ?? newId();
    if (!chatId) setChatId(activeChatId);

    const next: Message[] = [...messages, { id: newId('u'), role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setLoading(true);
    setLoadingPhase('thinking');
    setLiveToolCalls([]);
    setStreamingContent('');

    try {
      const res = await fetch(`${CLI_BASE_URL}/api/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ messages: next.map(m => ({ role: m.role, content: m.content })) }),
      });

      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => `HTTP ${res.status}`);
        throw new Error(errText);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop() ?? '';

        for (const part of parts) {
          for (const line of part.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            try {
              const ev = JSON.parse(line.slice(6)) as { type: string; [k: string]: unknown };
              if (ev.type === 'info') {
                setInfoMsg(ev.message as string);
              } else if (ev.type === 'text_delta') {
                setInfoMsg('');
                setStreamingContent(prev => prev + (ev.text as string));
                setLoadingPhase('streaming');
              } else if (ev.type === 'tool_start') {
                setInfoMsg('');
                setLoadingPhase('executing');
                setLiveToolCalls(prev => [...prev, {
                  tool: ev.tool as string,
                  input: (ev.input ?? {}) as Record<string, unknown>,
                  done: false,
                }]);
              } else if (ev.type === 'tool_done') {
                setLiveToolCalls(prev => {
                  const updated = [...prev];
                  const ri = [...updated].reverse().findIndex(tc => tc.tool === ev.tool && !tc.done);
                  if (ri !== -1) {
                    const idx = updated.length - 1 - ri;
                    updated[idx] = { ...updated[idx], output: ev.output as string, isError: ev.isError as boolean, done: true };
                  }
                  return updated;
                });
              } else if (ev.type === 'done') {
                setInfoMsg('');
                const finalMsg: Message = {
                  id: newId('a'),
                  role: 'assistant',
                  content: ev.content as string,
                  toolCalls: ev.toolCalls as ToolCall[],
                };
                const finalMsgs = [...next, finalMsg];
                setMessages(finalMsgs);
                setStreamingContent('');
                setLiveToolCalls([]);
                const chat: StoredChat = {
                  id: activeChatId,
                  title: chatTitle(finalMsgs),
                  messages: finalMsgs,
                  createdAt: Date.now(),
                  updatedAt: Date.now(),
                };
                await saveChat(chat);
                setChatList(prev => [chat, ...prev.filter(c => c.id !== activeChatId)]);
              } else if (ev.type === 'error') {
                setInfoMsg('');
                setMessages([...next, { id: newId('e'), role: 'assistant', content: `**Error:** ${ev.message as string}` }]);
                setStreamingContent('');
                setLiveToolCalls([]);
              }
            } catch { /* skip malformed */ }
          }
        }
      }
    } catch (e) {
      setMessages(prev => [...prev, { id: newId('f'), role: 'assistant', content: `**Failed to reach AI:** ${String(e)}` }]);
      setStreamingContent('');
      setLiveToolCalls([]);
    } finally {
      setLoading(false);
      setLoadingPhase(null);
      setInfoMsg('');
    }
  };

  const hasMessages = messages.length > 0 || loading;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--background)]">
      {/* Header */}
      <header className="flex shrink-0 items-center gap-2.5 border-b border-[var(--border)] px-4 py-2.5">
        <div className="flex size-[26px] items-center justify-center rounded-lg border border-[var(--border)] bg-[color-mix(in_srgb,var(--foreground)_8%,transparent)]">
          <Sparkles className="size-3 text-[var(--foreground)]" />
        </div>
        <div>
          <div className="text-[12.5px] font-bold leading-tight">AI Assistant</div>
          <div className="text-[10px] text-[var(--muted-foreground)]">Searches · executes · generates</div>
        </div>

        <div className="ml-auto flex items-center gap-1">
          {/* History */}
          <div className="relative" ref={historyRef}>
            <Button variant="ghost" size="icon-sm" onClick={() => setHistoryOpen(p => !p)} title="Chat history">
              <Clock className="size-3.5" />
            </Button>
            {historyOpen && (
              <HistoryPanel
                chats={chatList}
                activeChatId={chatId}
                onSelect={loadChat}
                onDelete={deleteChatEntry}
                onClose={() => setHistoryOpen(false)}
              />
            )}
          </div>
          {/* New chat */}
          <Button variant="ghost" size="icon-sm" onClick={startNewChat} title="New chat">
            <Plus className="size-3.5" />
          </Button>
          {/* Clear current */}
          {hasMessages && !loading && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => { setMessages([]); setChatId(null); setLiveToolCalls([]); setStreamingContent(''); }}
              title="Clear chat"
            >
              <Trash2 className="size-3.5" />
            </Button>
          )}
        </div>
      </header>

      {/* Messages */}
      <div className="hide-scrollbar flex flex-1 flex-col gap-5 overflow-auto px-5 py-5">
        {!hasMessages ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--foreground)_6%,transparent)]">
              <Sparkles className="size-6 text-[var(--foreground)]" />
            </div>
            <div>
              <div className="mb-1.5 text-[15px] font-semibold text-[var(--foreground)]">Ask anything about your API</div>
              <div className="mx-auto max-w-[340px] text-[12.5px] leading-relaxed text-[var(--muted-foreground)]">
                Search endpoints, run live requests, check security, generate code, and more.
              </div>
            </div>
            <div className="mt-1 flex flex-wrap justify-center gap-2">
              {STARTERS.map(s => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => setInput(s.label)}
                  className="flex cursor-pointer items-center gap-1.5 rounded-full border border-[var(--border)] bg-[color-mix(in_srgb,var(--foreground)_4%,transparent)] px-3.5 py-1.5 text-[11.5px] text-[var(--foreground)] transition-colors hover:border-[var(--border-hover)] hover:bg-[var(--elevated)]"
                >
                  {s.icon}
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map(m => <MessageBubble key={m.id} msg={m} />)
        )}
        {loading && (
          <LoadingBubble
            liveToolCalls={liveToolCalls}
            streamingContent={streamingContent}
            phase={loadingPhase}
            infoMsg={infoMsg}
          />
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <footer className="shrink-0 border-t border-[var(--border)] bg-[var(--background)] px-4 py-3">
        <ChatComposer ref={composerRef} value={input} onChange={setInput} onSubmit={send} loading={loading} />
      </footer>
    </div>
  );
}

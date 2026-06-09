import { createFileRoute } from '@tanstack/react-router';
import React, { useState, useRef, useEffect } from 'react';
import { CLI_BASE_URL } from '../lib/api';
import {
  Send, Bot, User, Sparkles, Trash2, ChevronDown, ChevronRight,
  Zap, Globe, Search, FileCode, Terminal, Check, X,
} from 'lucide-react';
import { Markdown } from '../components/Markdown';

export const Route = createFileRoute('/ai')({ component: AiPage });

interface ToolCall { tool: string; input: Record<string, unknown>; output: string; isError: boolean; }
interface LiveToolCall { tool: string; input: Record<string, unknown>; output?: string; isError?: boolean; done: boolean; }
interface Message { role: 'user' | 'assistant'; content: string; toolCalls?: ToolCall[]; }

const TOOL_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  search_endpoints:    { label: 'Search Endpoints', icon: <Search size={11} />,   color: '#6366f1' },
  get_endpoint_schema: { label: 'Get Schema',        icon: <FileCode size={11} />, color: '#0ea5e9' },
  execute_api_request: { label: 'Execute Request',   icon: <Terminal size={11} />, color: '#10b981' },
  fetch_url:           { label: 'Fetch URL',          icon: <Globe size={11} />,   color: '#f59e0b' },
};

function inputPreview(tc: { tool: string; input: Record<string, unknown> }) {
  if (tc.tool === 'fetch_url' && tc.input.url)
    return <span style={{ fontFamily: 'GeistMono, monospace', fontSize: 10.5 }}>{String(tc.input.url).slice(0, 60)}</span>;
  if (tc.tool === 'search_endpoints' && tc.input.query)
    return <>&ldquo;{String(tc.input.query)}&rdquo;</>;
  if (tc.tool === 'execute_api_request' && tc.input.operationId)
    return <span style={{ fontFamily: 'GeistMono, monospace', fontSize: 10.5 }}>{String(tc.input.operationId)}</span>;
  return null;
}

function ToolCallBlock({ tc }: { tc: ToolCall }) {
  const [open, setOpen] = useState(false);
  const meta = TOOL_META[tc.tool] ?? { label: tc.tool, icon: <Zap size={11} />, color: '#8b5cf6' };
  const inputStr = Object.keys(tc.input).length > 0 ? JSON.stringify(tc.input, null, 2) : null;

  return (
    <div style={{
      border: `1px solid ${tc.isError ? '#ef444430' : 'var(--border)'}`,
      borderRadius: 7, overflow: 'hidden', marginBottom: 6,
      background: tc.isError ? 'rgba(239,68,68,0.04)' : 'var(--background)',
    }}>
      <button
        onClick={() => setOpen(p => !p)}
        style={{ display: 'flex', alignItems: 'center', gap: 7, width: '100%', padding: '6px 10px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--foreground)' }}
      >
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: 4, background: `${meta.color}22`, color: meta.color }}>
          {meta.icon}
        </span>
        <span style={{ fontSize: 11.5, fontWeight: 500, flex: 1, textAlign: 'left', color: 'var(--foreground)' }}>
          {meta.label}
          <span style={{ color: 'var(--muted-foreground)', fontWeight: 400, marginLeft: 6 }}>{inputPreview(tc)}</span>
        </span>
        {tc.isError && <span style={{ fontSize: 10, color: '#ef4444', background: '#ef444422', padding: '1px 6px', borderRadius: 10 }}>error</span>}
        {open ? <ChevronDown size={11} style={{ color: 'var(--muted-foreground)', flexShrink: 0 }} /> : <ChevronRight size={11} style={{ color: 'var(--muted-foreground)', flexShrink: 0 }} />}
      </button>
      {open && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {inputStr && (
            <div>
              <div style={{ fontSize: 10, color: 'var(--muted-foreground)', marginBottom: 4, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Input</div>
              <pre style={{ margin: 0, padding: '6px 10px', background: 'color-mix(in srgb, var(--foreground) 5%, transparent)', borderRadius: 5, fontSize: 11.5, fontFamily: 'GeistMono, monospace', overflowX: 'auto', lineHeight: 1.5 }}>{inputStr}</pre>
            </div>
          )}
          <div>
            <div style={{ fontSize: 10, color: tc.isError ? '#ef4444' : 'var(--muted-foreground)', marginBottom: 4, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {tc.isError ? 'Error' : 'Output'}
            </div>
            <pre style={{ margin: 0, padding: '6px 10px', background: 'color-mix(in srgb, var(--foreground) 5%, transparent)', borderRadius: 5, fontSize: 11.5, fontFamily: 'GeistMono, monospace', overflowX: 'auto', lineHeight: 1.5, maxHeight: 300, overflow: 'auto', color: tc.isError ? '#ef4444' : 'var(--foreground)' }}>{tc.output}</pre>
          </div>
        </div>
      )}
    </div>
  );
}

function LiveToolCallBlock({ tc }: { tc: LiveToolCall }) {
  const meta = TOOL_META[tc.tool] ?? { label: tc.tool, icon: <Zap size={11} />, color: '#8b5cf6' };
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 7,
      border: '1px solid var(--border)', borderRadius: 7,
      padding: '6px 10px', marginBottom: 6,
      background: 'var(--background)',
      opacity: tc.done ? 0.75 : 1,
      transition: 'opacity 0.2s',
    }}>
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: 4, background: `${meta.color}22`, color: meta.color, flexShrink: 0 }}>
        {meta.icon}
      </span>
      <span style={{ fontSize: 11.5, fontWeight: 500, flex: 1, color: 'var(--foreground)' }}>
        {meta.label}
        <span style={{ color: 'var(--muted-foreground)', fontWeight: 400, marginLeft: 6 }}>{inputPreview(tc)}</span>
      </span>
      {tc.done ? (
        tc.isError
          ? <X size={12} style={{ color: '#ef4444', flexShrink: 0 }} />
          : <Check size={12} style={{ color: '#22c55e', flexShrink: 0 }} />
      ) : (
        <span className="spinner" style={{ width: 11, height: 11, flexShrink: 0 }} />
      )}
    </div>
  );
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user';
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <div style={{
        width: 28, height: 28, borderRadius: isUser ? 8 : 7, flexShrink: 0,
        background: isUser ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : 'color-mix(in srgb, var(--foreground) 8%, transparent)',
        border: isUser ? 'none' : '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 2,
      }}>
        {isUser ? <User size={13} color="#fff" /> : <Bot size={13} style={{ color: 'var(--muted-foreground)' }} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {!isUser && msg.toolCalls && msg.toolCalls.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            {msg.toolCalls.map((tc, i) => <ToolCallBlock key={i} tc={tc} />)}
          </div>
        )}
        {msg.content && (
          <div style={{
            background: isUser ? 'color-mix(in srgb, var(--foreground) 6%, transparent)' : 'transparent',
            border: isUser ? '1px solid var(--border)' : 'none',
            borderRadius: 10, padding: isUser ? '9px 13px' : 0,
          }}>
            {isUser
              ? <div style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--foreground)', whiteSpace: 'pre-wrap' }}>{msg.content}</div>
              : <Markdown content={msg.content} />
            }
          </div>
        )}
      </div>
    </div>
  );
}

function LoadingBubble({ liveToolCalls }: { liveToolCalls: LiveToolCall[] }) {
  const allDone = liveToolCalls.length > 0 && liveToolCalls.every(tc => tc.done);
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <div style={{
        width: 28, height: 28, borderRadius: 7, flexShrink: 0,
        background: 'color-mix(in srgb, var(--foreground) 8%, transparent)',
        border: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 2,
      }}>
        <Bot size={13} style={{ color: 'var(--muted-foreground)' }} />
      </div>
      <div style={{ flex: 1, minWidth: 0, paddingTop: 4 }}>
        {liveToolCalls.length > 0 && (
          <div style={{ marginBottom: allDone ? 8 : 0 }}>
            {liveToolCalls.map((tc, i) => <LiveToolCallBlock key={i} tc={tc} />)}
          </div>
        )}
        {(liveToolCalls.length === 0 || allDone) && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: 'color-mix(in srgb, var(--foreground) 5%, transparent)',
            border: '1px solid var(--border)',
            borderRadius: 10, padding: '8px 14px',
          }}>
            {[0, 1, 2].map(d => (
              <span key={d} style={{
                width: 5, height: 5, borderRadius: '50%',
                background: 'var(--muted-foreground)',
                animation: `pulse 1.2s ease-in-out ${d * 0.2}s infinite`,
                display: 'inline-block',
              }} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const STARTERS = [
  'Show me all GET endpoints',
  'How do I authenticate?',
  'Find the create user endpoint',
  'Test the health check endpoint',
];

function AiPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [liveToolCalls, setLiveToolCalls] = useState<LiveToolCall[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading, liveToolCalls]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const next: Message[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setLoading(true);
    setLiveToolCalls([]);

    try {
      const res = await fetch(`${CLI_BASE_URL}/api/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
              if (ev.type === 'tool_start') {
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
                setMessages([...next, {
                  role: 'assistant',
                  content: ev.content as string,
                  toolCalls: ev.toolCalls as ToolCall[],
                }]);
                setLiveToolCalls([]);
              } else if (ev.type === 'error') {
                setMessages([...next, { role: 'assistant', content: `**Error:** ${ev.message as string}` }]);
                setLiveToolCalls([]);
              }
            } catch { /* skip malformed */ }
          }
        }
      }
    } catch (e) {
      setMessages([...next, { role: 'assistant', content: `**Failed to reach AI:** ${String(e)}` }]);
      setLiveToolCalls([]);
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--background)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--background)', flexShrink: 0 }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Sparkles size={14} color="#fff" />
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>AI Assistant</div>
          <div style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>Searches endpoints · executes requests · browses docs</div>
        </div>
        {messages.length > 0 && (
          <button className="btn btn-ghost btn-sm btn-icon" style={{ marginLeft: 'auto' }} onClick={() => { setMessages([]); setLiveToolCalls([]); }} title="Clear chat">
            <Trash2 size={13} />
          </button>
        )}
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflow: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {messages.length === 0 && !loading ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, textAlign: 'center' }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Sparkles size={22} color="#fff" />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--foreground)', marginBottom: 4 }}>Ask anything about your API</div>
              <div style={{ fontSize: 12.5, color: 'var(--muted-foreground)', maxWidth: 380, lineHeight: 1.6 }}>
                I can search endpoints, explain schemas, generate example requests, and execute live API calls.
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: 4 }}>
              {STARTERS.map(s => (
                <button key={s} onClick={() => { setInput(s); inputRef.current?.focus(); }} style={{ background: 'color-mix(in srgb, var(--foreground) 5%, transparent)', border: '1px solid var(--border)', borderRadius: 20, padding: '5px 13px', fontSize: 12, color: 'var(--foreground)', cursor: 'pointer', fontFamily: 'inherit' }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => <MessageBubble key={i} msg={m} />)
        )}
        {loading && <LoadingBubble liveToolCalls={liveToolCalls} />}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', background: 'var(--background)', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', background: 'color-mix(in srgb, var(--foreground) 5%, transparent)', border: '1px solid var(--border)', borderRadius: 10, padding: '6px 6px 6px 12px' }}>
          <textarea
            ref={inputRef}
            rows={1}
            placeholder="Ask about your API…"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            style={{ flex: 1, resize: 'none', height: 'auto', minHeight: 28, maxHeight: 120, lineHeight: 1.5, fontSize: 13, background: 'none', border: 'none', outline: 'none', color: 'var(--foreground)', fontFamily: 'inherit', padding: 0 }}
          />
          <button className="btn btn-primary btn-icon" onClick={send} disabled={!input.trim() || loading} style={{ flexShrink: 0, width: 32, height: 32 }} title="Send (Enter)">
            {loading ? <span className="spinner" style={{ width: 12, height: 12 }} /> : <Send size={13} />}
          </button>
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--muted-foreground)', marginTop: 5 }}>
          Enter to send · Shift+Enter for newline · Configure provider in Settings
        </div>
      </div>
    </div>
  );
}

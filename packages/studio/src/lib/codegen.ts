// ── "Copy as code" generators ────────────────────────────────────────────────
// Works from the fully-resolved request (env vars substituted, auth applied).

export interface CodeRequest {
  method: string;
  url: string;
  headers: [string, string][];
  /** Text body (json / raw / urlencoded form). */
  body?: string;
  /** Multipart fields — files are referenced by filename only. */
  multipart?: { name: string; kind: 'text' | 'file'; value?: string; filename?: string }[];
  /** Whole-body file upload. */
  binaryFilename?: string;
}

export interface CodeTarget {
  id: string;
  label: string;
  lang: string; // shiki language
  generate: (r: CodeRequest) => string;
}

const sq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`; // shell single-quote
const js = (s: string) => JSON.stringify(s);

function jsonOrString(body: string, indent: string): string {
  try { return JSON.stringify(JSON.parse(body), null, 2).split('\n').join('\n' + indent); }
  catch { return js(body); }
}

// ── cURL ─────────────────────────────────────────────────────────────────────
function genCurl(r: CodeRequest): string {
  const lines = [`curl -X ${r.method} ${sq(r.url)}`];
  for (const [k, v] of r.headers) lines.push(`  -H ${sq(`${k}: ${v}`)}`);
  if (r.multipart?.length) {
    for (const p of r.multipart) {
      lines.push(p.kind === 'file' ? `  -F ${sq(`${p.name}=@${p.filename ?? 'file'}`)}` : `  -F ${sq(`${p.name}=${p.value ?? ''}`)}`);
    }
  } else if (r.binaryFilename) {
    lines.push(`  --data-binary @${sq(r.binaryFilename)}`);
  } else if (r.body) {
    lines.push(`  -d ${sq(r.body)}`);
  }
  return lines.join(' \\\n');
}

// ── HTTPie ───────────────────────────────────────────────────────────────────
function genHttpie(r: CodeRequest): string {
  const parts = [`http ${r.method} ${sq(r.url)}`];
  for (const [k, v] of r.headers) parts.push(`  ${sq(`${k}:${v}`)}`);
  if (r.multipart?.length) {
    parts[0] = `http --form ${r.method} ${sq(r.url)}`;
    for (const p of r.multipart) parts.push(p.kind === 'file' ? `  ${p.name}@${p.filename ?? 'file'}` : `  ${p.name}=${sq(p.value ?? '')}`);
  } else if (r.body) {
    return parts.join(' \\\n') + ` \\\n  --raw ${sq(r.body)}`;
  }
  return parts.join(' \\\n');
}

// ── JavaScript fetch ─────────────────────────────────────────────────────────
function genFetch(r: CodeRequest): string {
  const opts: string[] = [`method: ${js(r.method)}`];
  if (r.headers.length) {
    opts.push(`headers: {\n${r.headers.map(([k, v]) => `    ${js(k)}: ${js(v)},`).join('\n')}\n  }`);
  }
  if (r.multipart?.length) {
    const fd = [
      'const form = new FormData();',
      ...r.multipart.map(p => p.kind === 'file'
        ? `form.append(${js(p.name)}, fileInput.files[0]); // ${p.filename ?? 'file'}`
        : `form.append(${js(p.name)}, ${js(p.value ?? '')});`),
      '',
    ];
    opts.push('body: form');
    return `${fd.join('\n')}const res = await fetch(${js(r.url)}, {\n  ${opts.join(',\n  ')},\n});\nconst data = await res.json();`;
  }
  if (r.binaryFilename) opts.push(`body: fileInput.files[0] // ${r.binaryFilename}`);
  else if (r.body) opts.push(`body: ${js(r.body)}`);
  return `const res = await fetch(${js(r.url)}, {\n  ${opts.join(',\n  ')},\n});\nconst data = await res.json();`;
}

// ── Axios ────────────────────────────────────────────────────────────────────
function genAxios(r: CodeRequest): string {
  const lines = [`import axios from 'axios';`, ''];
  if (r.multipart?.length) {
    lines.push('const form = new FormData();');
    for (const p of r.multipart) {
      lines.push(p.kind === 'file'
        ? `form.append(${js(p.name)}, fileInput.files[0]); // ${p.filename ?? 'file'}`
        : `form.append(${js(p.name)}, ${js(p.value ?? '')});`);
    }
    lines.push('');
  }
  lines.push(`const { data } = await axios({`);
  lines.push(`  method: ${js(r.method.toLowerCase())},`);
  lines.push(`  url: ${js(r.url)},`);
  if (r.headers.length) {
    lines.push(`  headers: {`);
    for (const [k, v] of r.headers) lines.push(`    ${js(k)}: ${js(v)},`);
    lines.push(`  },`);
  }
  if (r.multipart?.length) lines.push(`  data: form,`);
  else if (r.binaryFilename) lines.push(`  data: fileInput.files[0], // ${r.binaryFilename}`);
  else if (r.body) {
    const isJson = r.headers.some(([k, v]) => k.toLowerCase() === 'content-type' && v.includes('json'));
    lines.push(isJson ? `  data: ${jsonOrString(r.body, '  ')},` : `  data: ${js(r.body)},`);
  }
  lines.push(`});`);
  return lines.join('\n');
}

// ── Python requests ──────────────────────────────────────────────────────────
const py = (s: string) => JSON.stringify(s); // close enough for double-quoted python strings

function genPython(r: CodeRequest): string {
  const lines = ['import requests', ''];
  if (r.headers.length) {
    lines.push('headers = {');
    for (const [k, v] of r.headers) lines.push(`    ${py(k)}: ${py(v)},`);
    lines.push('}', '');
  }
  const args = [`${py(r.url)}`];
  if (r.headers.length) args.push('headers=headers');
  if (r.multipart?.length) {
    const files = r.multipart.filter(p => p.kind === 'file');
    const fields = r.multipart.filter(p => p.kind === 'text');
    if (files.length) {
      lines.push('files = {');
      for (const p of files) lines.push(`    ${py(p.name)}: open(${py(p.filename ?? 'file')}, "rb"),`);
      lines.push('}', '');
      args.push('files=files');
    }
    if (fields.length) {
      lines.push('data = {');
      for (const p of fields) lines.push(`    ${py(p.name)}: ${py(p.value ?? '')},`);
      lines.push('}', '');
      args.push('data=data');
    }
  } else if (r.binaryFilename) {
    args.push(`data=open(${py(r.binaryFilename)}, "rb")`);
  } else if (r.body) {
    const isJson = r.headers.some(([k, v]) => k.toLowerCase() === 'content-type' && v.includes('json'));
    if (isJson) {
      try {
        lines.push(`payload = ${JSON.stringify(JSON.parse(r.body), null, 4).replace(/\btrue\b/g, 'True').replace(/\bfalse\b/g, 'False').replace(/\bnull\b/g, 'None')}`, '');
        args.push('json=payload');
      } catch {
        args.push(`data=${py(r.body)}`);
      }
    } else {
      args.push(`data=${py(r.body)}`);
    }
  }
  lines.push(`response = requests.${r.method.toLowerCase()}(${args.join(', ')})`);
  lines.push('print(response.status_code, response.json())');
  return lines.join('\n');
}

// ── Go net/http ──────────────────────────────────────────────────────────────
function genGo(r: CodeRequest): string {
  const bodyDecl = r.body
    ? `\tbody := strings.NewReader(${js(r.body)})\n`
    : '';
  const bodyArg = r.body ? 'body' : 'nil';
  const imports = ['"fmt"', '"io"', '"net/http"'];
  if (r.body) imports.splice(2, 0, '"strings"');
  return `package main

import (
\t${imports.join('\n\t')}
)

func main() {
${bodyDecl}\treq, err := http.NewRequest(${js(r.method)}, ${js(r.url)}, ${bodyArg})
\tif err != nil {
\t\tpanic(err)
\t}
${r.headers.map(([k, v]) => `\treq.Header.Set(${js(k)}, ${js(v)})`).join('\n')}${r.headers.length ? '\n' : ''}
\tres, err := http.DefaultClient.Do(req)
\tif err != nil {
\t\tpanic(err)
\t}
\tdefer res.Body.Close()

\tdata, _ := io.ReadAll(res.Body)
\tfmt.Println(res.StatusCode, string(data))
}`;
}

// ── PHP ──────────────────────────────────────────────────────────────────────
function genPhp(r: CodeRequest): string {
  return `<?php
$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, ${js(r.url)});
curl_setopt($ch, CURLOPT_CUSTOMREQUEST, ${js(r.method)});
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
${r.headers.map(([k, v]) => `    ${js(`${k}: ${v}`)},`).join('\n')}
]);
${r.body ? `curl_setopt($ch, CURLOPT_POSTFIELDS, ${js(r.body)});\n` : ''}$response = curl_exec($ch);
curl_close($ch);
echo $response;`;
}

export const CODE_TARGETS: CodeTarget[] = [
  { id: 'curl', label: 'cURL', lang: 'bash', generate: genCurl },
  { id: 'fetch', label: 'JS fetch', lang: 'javascript', generate: genFetch },
  { id: 'axios', label: 'Axios', lang: 'javascript', generate: genAxios },
  { id: 'python', label: 'Python', lang: 'text', generate: genPython },
  { id: 'go', label: 'Go', lang: 'text', generate: genGo },
  { id: 'httpie', label: 'HTTPie', lang: 'bash', generate: genHttpie },
  { id: 'php', label: 'PHP', lang: 'text', generate: genPhp },
];

export interface AuthorizeHtmlParams {
  clientId: string;
  redirectUri: string;
  responseType: string;
  state: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  scope: string;
  csrfToken?: string;
  clientName?: string;
  error?: string;
}

export function escapeAttr(str: string): string {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function renderAuthorizeHtml(params: AuthorizeHtmlParams): string {
  const clientLabel = escapeAttr(params.clientName || (params.clientId ? params.clientId.slice(0, 18) + '...' : 'AI Client'));
  const errorHtml = params.error
    ? `<div class="error-msg">${escapeAttr(params.error)}</div>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Authorize MCP — Mnema</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0f172a;
      --card-bg: #1e293b;
      --border: #334155;
      --primary: #0d9488;
      --primary-hover: #0f766e;
      --text: #f8fafc;
      --text-muted: #94a3b8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Figtree', sans-serif; }
    body {
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 1.5rem;
      width: 100%;
      max-width: 440px;
      padding: 2.5rem;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.4);
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      background: rgba(13, 148, 136, 0.15);
      color: #2dd4bf;
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
      margin-bottom: 1.25rem;
      border: 1px solid rgba(45, 212, 191, 0.2);
    }
    h1 { font-size: 1.35rem; font-weight: 700; margin-bottom: 0.5rem; }
    p { font-size: 0.875rem; color: var(--text-muted); line-height: 1.5; margin-bottom: 1.5rem; }
    .client-box {
      background: rgba(15, 23, 42, 0.6);
      border: 1px solid var(--border);
      border-radius: 0.85rem;
      padding: 0.85rem 1rem;
      margin-bottom: 1.5rem;
      font-size: 0.825rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .client-box span { color: #e2e8f0; font-weight: 600; }
    label { display: block; font-size: 0.775rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); margin-bottom: 0.5rem; }
    input[type="password"] {
      width: 100%;
      padding: 0.75rem 1rem;
      background: #0f172a;
      border: 1px solid var(--border);
      border-radius: 0.75rem;
      color: #fff;
      font-size: 0.95rem;
      outline: none;
      transition: border-color 0.2s;
      margin-bottom: 1.5rem;
    }
    input[type="password"]:focus {
      border-color: var(--primary);
      box-shadow: 0 0 0 2px rgba(13, 148, 136, 0.2);
    }
    button {
      width: 100%;
      padding: 0.85rem;
      background: var(--primary);
      color: #fff;
      border: none;
      border-radius: 0.75rem;
      font-size: 0.95rem;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
    }
    button:hover { background: var(--primary-hover); }
    .error-msg {
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: #f87171;
      padding: 0.75rem 1rem;
      border-radius: 0.75rem;
      font-size: 0.825rem;
      margin-bottom: 1.25rem;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
      Mnema OAuth 2.1
    </div>
    <h1>Connect AI Assistant</h1>
    <p>Grant permission to access your private highlights, articles, and semantic library.</p>
    
    <div class="client-box">
      <span>Application</span>
      <code>${clientLabel}</code>
    </div>

    ${errorHtml}

    <form method="POST" action="/authorize">
      <input type="hidden" name="csrf_token" value="${escapeAttr(params.csrfToken || '')}" />
      <input type="hidden" name="client_id" value="${escapeAttr(params.clientId)}" />
      <input type="hidden" name="redirect_uri" value="${escapeAttr(params.redirectUri)}" />
      <input type="hidden" name="response_type" value="${escapeAttr(params.responseType || 'code')}" />
      <input type="hidden" name="state" value="${escapeAttr(params.state)}" />
      <input type="hidden" name="code_challenge" value="${escapeAttr(params.codeChallenge)}" />
      <input type="hidden" name="code_challenge_method" value="${escapeAttr(params.codeChallengeMethod || 'S256')}" />
      <input type="hidden" name="scope" value="${escapeAttr(params.scope || 'mcp')}" />

      <label for="pin">Secret PIN / Passphrase</label>
      <input type="password" id="pin" name="pin" placeholder="Enter your Mnema access PIN" autofocus required />

      <button type="submit">Authorize Connection</button>
    </form>
  </div>
</body>
</html>`;
}

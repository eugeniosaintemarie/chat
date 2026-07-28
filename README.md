<div align="center">
  <img src="static/favicon.png" alt="chat" width="180" height="180">
  <h1>chat</h1>
  <p><em>Open-source, self-hostable T3 Chat built on SvelteKit + Convex.</em></p>

  <p>
    <img src="https://img.shields.io/badge/SvelteKit-FF3E00?style=for-the-badge&logo=svelte&logoColor=white" alt="SvelteKit">
    <img src="https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript">
    <img src="https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white" alt="Tailwind">
    <img src="https://img.shields.io/badge/Convex-FF6B6B?style=for-the-badge&logo=convex&logoColor=white" alt="Convex">
    <img src="https://img.shields.io/badge/Better_Auth-000000?style=for-the-badge&logo=shield&logoColor=white" alt="Better Auth">
  </p>
</div>

---

## ℹ️ About

**chat** is an open-source alternative/clone of [T3 Chat](https://t3.chat/), originally built for [Theo's cloneathon](https://x.com/theo/status/1931515264497254402).

This version is wired to the **[OpenCode Go](https://opencode.ai) model gateway** (an OpenAI-compatible endpoint) plus the **OpenRouter** catalog, and ships with a curated set of frontier **reasoning models**. It is fully self-hostable: bring your own Convex instance, GitHub OAuth app, and model-gateway key.

> While it is a clone, the feature set is not identical to T3 Chat — this is a finished, personal portfolio build with a focused, polished feature set.

## ✨ Features

### 🤖 AI & Models
- **Two model sources** — the curated OpenCode Go gateway (including a free `zen` tier) and the full OpenRouter catalog, aggregated at runtime
- **Live pricing tiers** — the model picker shows a `$` / `$$` / `$$$` cost badge (computed from live `models.dev` pricing) and an 👁 vision indicator next to each model name, so you can pick by price and capability at a glance
- **Live reasoning display** — watch the model "think" as it streams (`reasoning_content` / `reasoning`)
- **Adjustable reasoning effort** — pick high / medium / low reasoning depth per chat
- **Real-time token streaming** with server-side persistence so chats survive reloads

### 💬 Chat Experience
- **Auto-generated conversation titles** (named from the first message)
- **Cursor-like rules** (`@rule` mentions) for consistent assistant behavior — attach rules automatically or on demand
- **Full-text search** across your chat history (command-palette style search modal)
- **Public sharing** — generate a shareable, read-only link for any conversation (`/share/[id]`)

### 🧩 Rich Content
- **Multimodal image uploads** — the attach button adapts to the selected model:
  - 📎 when the model is text-only
  - 📎`|`🖼️ when the model supports vision (clip + image in one control)
- **Markdown rendering** with syntax highlighting (Shiki) and sanitization
- **Citations / annotations** (URL citations) rendered inline under assistant messages
- **Enhance prompt** to polish rough prompts before sending

### ⚙️ Productivity & UI
- **Light / dark theme** with system preference detection (mode-watcher)
- **Branded app icon & favicon** (PNG favicon + Apple touch icon) served from `static/`
- **GitHub OAuth login** — sign in with your GitHub account to sync conversations
- **Persistent sessions** — sessions last 1 year and auto-renew every 24 hours; invalidated on new deploys (when `BETTER_AUTH_SECRET` changes) or manual cache clear

## 🛠️ Tech Stack

<table>
<tr>
<td>

**Frontend**
- 🔥 SvelteKit + TypeScript
- 🎨 Tailwind CSS + tailwind-variants
- 🍨 Melt UI / Bits UI components
- 🌗 mode-watcher (theme)

</td>
<td>

**Backend & Infra**
- 🔧 Convex (database + serverless functions)
- 🔐 Better Auth (GitHub OAuth) via `@better-auth-kit/convex`
- 🤖 OpenCode Go gateway + OpenRouter (OpenAI-compatible)
- 🗂 Model catalog sourced from [models.dev](https://models.dev)
- ▲ Deployed on Vercel (`@sveltejs/adapter-vercel`)

</td>
</tr>
</table>

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- pnpm
- A [Convex](https://www.convex.dev/) account
- An [OpenCode Go](https://opencode.ai) API key (or any OpenAI-compatible key)
- A GitHub OAuth app (for login)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/eugeniosaintemarie/chat.git
   cd chat
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   # Fill in the values — see the table below
   ```

4. **Start Convex and the dev server** (Convex writes `PUBLIC_CONVEX_URL` into `.env.local`)
   ```bash
   pnpm dev
   ```
   This runs `convex dev` and `vite dev` together.

5. **Open the app**
   ```
   http://localhost:5173
   ```

### Environment Variables

| Variable | Required | Description |
| --- | --- | --- |
| `OPENCODE_API_KEY` | ✅ | OpenCode Go (or OpenAI-compatible) gateway key, used server-side. Falls back to `OPENROUTER_FREE_KEY` if unset. |
| `OPENROUTER_FREE_KEY` | ⬜ | Optional OpenRouter free-tier key used as a fallback when `OPENCODE_API_KEY` is unset. |
| `BETTER_AUTH_SECRET` | ✅ | Secret used to sign Better Auth sessions. Generate a long random string. |
| `GITHUB_CLIENT_ID` | ✅ | GitHub OAuth app client id. |
| `GITHUB_CLIENT_SECRET` | ✅ | GitHub OAuth app client secret. |
| `BETTER_AUTH_URL` | ⬜ | Public base URL of the deployment (e.g. `https://your-app.vercel.app`). Falls back to `http://localhost:5173` when unset. |
| `PUBLIC_CONVEX_URL` | ⚙️ | Set automatically by `convex dev` into `.env.local`. |

> 🔒 All secrets above live in environment variables / Vercel project settings — **none are committed to the repository**.

## 🤝 Contributing

Contributions are welcome!

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Inspired by [T3 Chat](https://t3.chat/)
- Originally created by [Thomas G. Lopes](https://github.com/tglide) and [Aidan Blesar](https://github.com/ieedan)
- Built with [SvelteKit](https://kit.svelte.dev/), [Convex](https://convex.dev/), and [Better Auth](https://better-auth.com/)
- Models served via [OpenCode](https://opencode.ai/) and [OpenRouter](https://openrouter.ai/)

---

<div align="center">
  <p>Made with ❤️ — a personal project / portfolio piece.</p>
</div>

---
name: multica-mcp
description: Activates when the agent should route coding work through the Multica MCP server instead of doing everything locally. Covers agent selection (Claude, Codex, Gemini, OpenCode Go including Kimi K2.6, DeepSeek V4, Qwen, MiniMax), sprint planning, backlog triage, parallel task breakdown, audit croise, and SwarmReview invocation for PR reviews.
---

# Overview

Use this skill when the right move is to orchestrate work through Multica rather than doing all implementation in the current session.

Treat Multica as a delegation plane:

- choose the right agent
- create a well-scoped issue
- split large work into child issues when needed
- follow progress
- push corrective context
- verify the delivered result

Assume the Multica MCP server is already installed. If the tools are unavailable, stop and say so clearly.
Prefer MCP tool calls over raw shell `multica` commands whenever the MCP server is available.

# When to Use

Trigger this skill when one or more of these signals are present:

- the user asks to delegate, assign, triage, parallelize, or supervise work
- the request is larger than one focused coding session
- the work naturally splits into multiple independent tracks
- the user wants a backlog, sprint plan, sub-issues, or task routing
- the work needs a different model profile than the current agent
- the task is mostly bulk analysis, audit, review, or repository scanning
- the user asks which agent should handle a task
- the user wants to push more context to an agent already running in Multica
- the user wants to know which billed model really ran
- the user mentions GLM, Z.ai, OpenCode Go, opencode, or long-horizon tasks suitable for budget tiers
- the user asks for a PR review that should use SwarmReview

Do not trigger this skill for trivial one-shot work that is faster to complete locally than to delegate.

# Regles de base

1. Utilise Multica au maximum. Avant de demander a Arthur une info technique sur son infra, cree une issue pour qu'un agent la collecte. Arthur n'intervient que pour les decisions strategiques et les validations.
2. Toujours inclure un hard cap `tool_calls` dans chaque brief (15-60 selon complexite) pour eviter les rabbit holes.
3. Routing par nature de tache: utiliser les sections Agents disponibles, Routing Matrix et Tool call caps ci-dessous.
4. Env vars du daemon: documenter explicitement dans l'issue toute variable requise avant de deleguer.
5. Protocole PQR pour audits qualite: creer deux diagnostics independants, puis une issue de fix qui lit les deux verdicts.
6. Limitations connues du wrapper: `cwd` reste un hint dans la description, les short IDs ne marchent pas comme `parent_issue_id`, et les commentaires CLI ne reveillent pas toujours le daemon.

# Agents disponibles

| Agent | Specialite |
|-------|-----------|
| `claude-haiku` | Taches atomiques, rapide, formatage |
| `claude-sonnet` | Dev quotidien, features, bugfixes (default) |
| `claude-opus` | Architecture, diagnostics, arbitrage |
| `opus-latest` | Visual QA (3.75MP), audits visuels, screenshots |
| `codex-quick` | Probes read-only, rapide, fan-out |
| `codex-standard` | Dev quotidien Codex, default PQR Critic |
| `codex-high` | Audits, code review, taches critiques, PQR Critic renforce |
| `codex-deep` | Debug profond, cross-check architecture, deep research |
| `gemini-flash` | Scan massif, 1M+ context, bulk synthesis |
| `gemini-pro` | Analyses archi profondes, 2M context |
| `gemini-3-1-pro` | UI/frontend, raisonnement superieur |
| `opencode-glm-5-1` | Long-horizon, overnight, budget, 8h+ |
| `opencode-kimi-k2-6` | Thinking mode natif, 262k context, analyse performance, judgment complexe |
| `opencode-deepseek-v4-flash` | 1M context, thinking mode, 13B active, iterations rapides volume |
| `opencode-deepseek-v4-pro` | 49B active, SWE-bench 80%, meta-review alternative a Opus |
| `opencode-qwen3-6-plus` | Text-heavy, conventions, documentation, compliance checks |
| `opencode-minimax-m2-7` | Generaliste solide, release analysis, format Anthropic API |
| `opencode-qwen3-5-plus` | 50k req/mois, volume brainstorming |
| `opencode-mimo-v2-5` | Alternative volume a qwen3.5-plus |
| `opencode-glm-5` | Alternative a GLM 5.1, quota plus large |

Note: les agents `opencode-*` listes ci-dessus necessitent le setup Multica de KOR-735 pour etre fonctionnels.

# Tool call caps par agent

Toujours inclure un hard cap dans les instructions de l'issue pour eviter les boucles:

| Agent | Hard cap recommande |
|-------|-------------------|
| `claude-haiku` | 20 |
| `codex-quick` | 15 |
| `claude-sonnet`, `codex-standard` | 50 |
| `claude-opus`, `codex-high`, `gemini-flash` | 60 |
| `codex-deep`, `gemini-pro`, `gemini-3-1-pro` | 80 |
| `opencode-glm-5-1` | 200 |
| `opencode-kimi-k2-6`, `opencode-deepseek-v4-flash` | 60 |
| `opencode-deepseek-v4-pro` | 80 |
| `opencode-qwen3-6-plus`, `opencode-minimax-m2-7` | 60 |
| `opencode-qwen3-5-plus`, `opencode-mimo-v2-5` | 40 |
| `opencode-glm-5` | 60 |

Si bloque > 10 minutes sur un probleme, poster un commentaire et passer a autre chose.

# Core Workflow

## 1. Check readiness

Start with the current Multica state before making routing decisions:

1. Call `multica_list_agents`
2. Call `multica_list_projects` if project placement matters
3. Match by current agent names, never by hardcoded IDs

Do not start with raw shell `multica agent list` or `multica project list` if the MCP tools are available.

If the user already named an agent, still confirm that the name exists in `multica_list_agents`.

## 2. Decide whether to delegate

Delegate when at least one of these is true:

- the work is parallelizable
- the work benefits from a different provider or context window
- the user mainly needs coordination rather than direct hands-on edits
- the current conversation would lose momentum if it tried to absorb all the work inline

Keep work local when:

- the next step is tiny and unblockable
- the answer is mostly explanation, not execution
- the task is urgent and the very next action depends on a result you can produce faster yourself

## 3. Choose the agent

Use the routing rules below as defaults. **Consider context, not just task type**: a task that resumes after a crash with partial work already done may be shorter than a task from scratch, so a cheaper agent may suffice. Conversely, a complex system investigation with architectural choices must never start on haiku (insufficient reasoning window).

- `claude-haiku`: tiny fixes, renames, formatting, quick grep-style research, simple scripts
- `claude-sonnet`: default feature work, normal bugfixes, standard refactors, investigation tasks with choices to make
- `claude-opus`: architecture, high-risk review, complex refactors, deep design tradeoffs
- `opus-latest`: audits visuels, QA sur screenshots (context visuel 3.75MP), diagnostics d'interface
- `codex-quick`: rapid parallel probes, quick verifications, cheap Codex execution
- `codex-standard`: everyday Codex work, default Critic for PQR protocol
- `codex-high`: reinforced Critic for PQR, precise security audits on isolated modules, lightweight architecture reviews (between standard and deep)
- `codex-deep`: hard debugging, cross-checking architecture or failure analysis
- `gemini-flash`: very large codebase or document scans, bulk synthesis, huge-context pass
- `gemini-pro`: deep large-context architectural analysis, only when quota looks healthy
- `gemini-3-1-pro`: taches UI/frontend avec raisonnement superieur, quand la qualite visuelle est critique
- `opencode-glm-5-1`: long-horizon tasks (8h+), budget tier via Z.ai Coding Plan. Route here for overnight or weekend heavy batch work when quota allows.
- `opencode-kimi-k2-6`: performance analysis avec thinking mode natif, judgment complexe, 262k context
- `opencode-deepseek-v4-flash`: long context 1M tokens, iterations rapides volume, open-weights MIT
- `opencode-deepseek-v4-pro`: meta-review alternative a Opus, 49B active, SWE-bench 80%
- `opencode-qwen3-6-plus`: compliance, conventions, AGENTS.md, documentation et text-heavy reading
- `opencode-minimax-m2-7`: release analysis, holistic PR review, format Anthropic API
- `opencode-qwen3-5-plus`: brainstorming volume et iterations abondantes
- `opencode-mimo-v2-5`: alternative volume a qwen3.5-plus
- `opencode-glm-5`: alternative a GLM 5.1 avec quota plus large

When the choice is not obvious, use the Routing Matrix below and prefer the cheapest agent that can reliably finish the task.

## 4. Creer des issues safe (sans pickup accidentel)

Le daemon pickup les issues en status `todo` avec assignee. Pour eviter qu'une issue soit lancee trop tot:

```
TOUJOURS creer les issues backlog comme suit:
1. Creer l'issue SANS assignee (arrive en todo)
2. Passer en backlog: multica issue update <ID> --status backlog
3. PUIS ajouter l'assignee: multica issue update <ID> --assignee <agent>
Le daemon ne pickup que les issues en todo avec assignee.
Backlog + assignee = safe.
```

Via MCP: creer sans assignee, puis `multica_update_issue` pour le status, puis pour l'assignee.

## 5. Write the issue so it works on the first run

Always include:

- a precise title with the expected outcome
- enough description for the agent to act without guessing
- repo or product context
- explicit success criteria
- constraints, non-goals, and output format
- the working directory if it matters
- the hard cap tool_calls

If you have a repository path, pass `cwd` to `multica_create_issue`. Multica injects it into the description, so the delegated agent must still `cd` manually.

**Never include a step that asks the agent to restart, stop, or otherwise manipulate the Multica daemon.** The agent runs inside the daemon and would kill its own parent process.

Use the issue templates embedded in this file instead of improvising vague prompts.

### Distinguer Claude Code vs Claude Desktop dans les briefs

Les configs sont differentes et les capacites aussi:
- Claude Code: ~/.claude.json (MCP servers), ~/.claude/settings.json (hooks), skills
- Claude Desktop: ~/Library/Application Support/Claude/claude_desktop_config.json (MCP servers uniquement)
- Codex: ~/.codex/config.toml (MCP servers)

Quand une issue touche a des MCP servers ou des configs, TOUJOURS specifier quelle platform. L'erreur classique: installer un MCP dans Claude Desktop config et croire que Claude Code le voit (ou l'inverse).

## 6. Split large work

Split when the request contains separable deliverables, different risk levels, or clearly different specialties.

Use this pattern:

1. Create a parent orchestration issue for planning or synthesis
2. Create child issues with `parent_issue_id` (UUID complet, PAS le short ID KOR-XXX)
3. Assign each child to the cheapest agent that can reliably do the job
4. Reserve expensive agents for the narrow slice that truly needs them

Typical split signals:

- frontend vs backend vs tests
- implementation vs audit
- bulk scan vs targeted fix
- architecture recommendation vs execution

### Sub-issues

Multica supporte les sub-issues via `parent_issue_id`. Usages:

- Steer un agent en cours de route (sub-issue = nouvelle instruction injectee)
- Decomposer une tache complexe en sous-taches
- Chainer des etapes sequentielles sous un parent

```bash
multica issue create --title "..." --parent-issue-id <UUID-complet>
# ATTENTION: le short ID (KOR-XXX) ne marche PAS pour parent-issue-id
```

### Grouper par domaine de fichiers, pas par etape logique

Chaque issue Multica ouvre une nouvelle session Claude Code avec ~33-54K tokens d'overhead au boot (system prompt, tools, skills, MCP servers). Pour minimiser cet overhead:

- Grouper les taches qui touchent les MEMES fichiers dans une seule issue avec des follow-up comments
- Separer les taches qui touchent des fichiers DIFFERENTS en issues paralleles

Exemple a eviter: Issue 1 = "installer les outils", Issue 2 = "mettre a jour le meme config"
Mieux: Une seule issue "installer les outils + mettre a jour le config" avec un follow-up comment

Exemple correct de split: Issue A = "fix API routes" (backend), Issue B = "fix UI components" (frontend)
Ces deux issues touchent des fichiers differents et peuvent tourner en parallele.

## 7. Sequentialisation obligatoire

**Ne JAMAIS lancer des issues en parallele qui touchent aux memes fichiers.**

Exemples a eviter: plusieurs fixes CSS sur `style.css`, plusieurs modifs JS sur `app.js`.

Toujours sequentialiser: soit une seule issue avec tous les fixes, soit des issues chainees avec dependances explicites.

### Auto-chainage sequentiel

Quand un agent fait partie d'une chaine d'issues sequentielles (ex: MOIK-03 -> MOIK-04 -> ... -> MOIK-13), il doit executer ces 3 etapes dans l'ordre a la fin de son travail :

1. **Passer sa propre issue en `in_review`** via `update_issue(status="in_review")`
2. **Passer l'issue suivante en `todo`** via `update_issue(status="todo")`
3. **Poster un commentaire de demarrage sur l'issue suivante en @mentionnant l'agent assignee** :
   "[@AgentName](mention://agent/<uuid>) L'issue precedente [XXX] est terminee. Tu peux demarrer. git pull pour recuperer les changements."

**IMPORTANT -- MCP obligatoire** : utiliser `multica_add_comment` (MCP), jamais `multica issue comment add` (CLI) pour poster le commentaire de chainage. Les commentaires via CLI sont tagges `authorType == "agent"` et ignores par le daemon. Les commentaires via MCP sont reconnus comme "owner" et triggent le pickup.

**Bug daemon** : meme avec MCP, le daemon peut ignorer le commentaire si `authorType == "agent"`. Le @mention de l'agent assignee est le workaround : `enqueueMentionedAgentTasks` n'a pas cette restriction et fire pour tous les auteurs. Sans le @mention, le pickup n'est pas garanti. Fix upstream en attente (KOR-309, branch `fix/on-comment-trigger-for-agents`).

### Routing minimum pour les chaines sequentielles

**`claude-sonnet` est le minimum requis pour une issue dans une chaine auto-chainee.**

- Pas de `claude-haiku` : haiku n'a pas assez de raisonnement pour executer le protocole de chainage (trouver l'issue suivante, faire les 3 appels MCP dans le bon ordre, lookup UUID de l'agent).
- Pas de `codex-quick` : meme raison.
- `claude-sonnet`, `codex-standard`, ou superieur uniquement.

### Creation safe d'issues sequentielles

Pour creer une chaine d'issues sans qu'elles soient pickup accidentellement :

1. Creer toutes les issues SANS assignee (arrive en `todo` par defaut)
2. Passer chaque issue en `backlog`
3. Ajouter l'assignee sur chaque issue
4. Ne passer en `todo` QUE la premiere issue de la chaine
5. Poster un commentaire de demarrage sur la premiere issue

Via MCP : creer sans assignee, `multica_update_issue` pour backlog, puis pour l'assignee, puis passer la premiere en todo avec un commentaire.

### Template auto-chainage pour les briefs d'issues chainees

Ajouter cette section a la fin du brief de chaque issue chainee (sauf la derniere) :

```
## Auto-chainage

Quand tu as termine tout le travail :
1. Passer CETTE issue en `in_review` via update_issue
2. Chercher l'issue "[NEXT_ISSUE_TITLE]" dans le projet [PROJECT], status backlog
3. La passer en `todo` via update_issue
4. Poster un commentaire sur cette issue : "L'issue precedente [CURRENT_ISSUE_TAG] est terminee. Tu peux demarrer. git pull pour recuperer les changements."
```

Pour la derniere issue de la chaine :

```
## Fin de chaine

Quand tu as termine tout le travail :
1. Passer CETTE issue en `in_review` via update_issue
2. Poster un commentaire : "Sequence [PREFIX-XX] a [PREFIX-YY] terminee. Pret pour la review globale."
```

## 8. Pattern dual reviewer

Pour les bugs complexes ou les audits qualite:

1. Issue diagnostique A (ex: `claude-opus`): read-only, poste verdict structure
2. Issue diagnostique B (ex: `codex-deep`): read-only, meme tache independamment
3. Issue fix (ex: `codex-standard`): lit les 2 diagnostiques, synthetise, implemente

L'issue 3 doit etre en backlog jusqu'a ce que 1 et 2 soient done. L'independance des 2 diagnostiques est intentionnelle -- ne pas les laisser se lire mutuellement avant de conclure.

## 9. Follow up actively

Use `multica_get_issue` to inspect:

- status
- comments
- latest task state
- work directory
- output summary

Use `multica_add_comment` when:

- the agent misunderstood scope
- the repo path was ignored
- the task needs extra acceptance criteria
- the agent is blocked on a product or architecture decision

Push short, corrective comments. Do not resend the whole original brief unless the original brief was bad.

**Posting a comment on a running or blocked issue typically re-wakes the agent.** No need to manually toggle status in most cases.

Prefer `multica_add_comment` over a shell `multica issue comment add` call when the MCP tool is available.

## 10. Reviewer automatique

Le reviewer automatique Multica passe les issues de `in_review` a `done` toutes les heures.

Les issues "disparaissent" du board sans action manuelle. Pour eviter ce comportement (quand tu veux une vraie review humaine):
- utiliser le pattern audit croise (2 agents review + promotion manuelle par Arthur)
- ou retirer l'assignee et mettre `blocked` avec un commentaire explicite

## 11. Verify the result

Do not stop at `done`.

Check:

- did the comments or output summary match the requested deliverable?
- did the agent honor the cwd?
- was the chosen agent still the right one in hindsight?
- if model identity matters, call `multica_get_runtime_usage`

Never trust an agent self-report as the source of truth for billed model usage. Use `multica_get_runtime_usage`.

# Routing Matrix

Use this quick matrix first, then open the detailed reference if needed.

| Situation | Default agent | Notes |
| --- | --- | --- |
| Rename, formatting, simple file edits | `claude-haiku` | Fastest and cheapest default |
| Standard feature or bugfix | `claude-sonnet` | Default for most implementation |
| Architecture, risky review, deep redesign | `claude-opus` | Keep parallelism low |
| Audit visuel sur screenshots/UI | `opus-latest` | Visuel 3.75MP, QA interface |
| Fast Codex probe or verification | `codex-quick` | Prefer over `codex-standard` for cheap probing |
| Standard Codex implementation | `codex-standard` | Default PQR Critic, everyday Codex work |
| Reinforced PQR Critic, precise audits | `codex-high` | Between standard and deep; prefer over deep for circumscribed scope |
| Hard debugging or deep cross-check | `codex-deep` | Good counterpart to Opus; multi-file complex debugging |
| Huge repository scan or document synthesis | `gemini-flash` | Best bulk analysis default |
| Deep huge-context architecture | `gemini-pro` | Use only if quota is likely available |
| UI/frontend avec raisonnement superieur | `gemini-3-1-pro` | Quand qualite visuelle est critique |
| Long-horizon batch work, budget tier, overnight/weekend | `opencode-glm-5-1` | GLM 5.1 via Z.ai Coding Plan. See providers.md for quota rules. |
| Code analysis avec thinking mode natif | `opencode-kimi-k2-6` | 3450 req/5h boost |
| Long context (1M tokens) | `opencode-deepseek-v4-flash` | 7450 req/5h, open-weights MIT |
| Meta-review alternative a Opus | `opencode-deepseek-v4-pro` | Opus-level a $3.48/1M output, 80% SWE-bench |
| Compliance / conventions / AGENTS.md | `opencode-qwen3-6-plus` | Text-heavy reading |
| Release / holistic PR review | `opencode-minimax-m2-7` | Format Anthropic API |
| Brainstorming volume (10k+ req/5h) | `opencode-qwen3-5-plus` | Le plus abundant |
| Long-horizon batch (8h+) | `opencode-glm-5-1` | GLM via Z.ai, inchange |

# Providers

## OpenCode Go integration

**Env var**: `OPENCODE_GO_API_KEY`
**Endpoint**: `https://opencode.ai/zen/go/v1/chat/completions` (ou `/v1/messages` pour MiniMax)
**Format**: OpenAI-compatible (sauf MiniMax: Anthropic)
**Subscription**: $10/mois ($5 first month), couvre tous les modeles curated
**Usage limits**: $12/5h, $30/semaine, $60/mois (en valeur dollar, pas en requests)
**Thinking mode**: natif, ne PAS desactiver via flags
**Zero retention**: providers suivent zero-retention policy

Route vers les opencode-* agents pour:

- Performance analysis avec thinking (Kimi K2.6)
- Large context (V4-Flash)
- Meta-review alternative Claude Opus (V4-Pro)
- Compliance et docs (Qwen3.6)
- Release holistic (MiniMax)
- Volume iterations (Qwen3.5, MiMo)

## Z.ai / GLM integration

Utiliser `opencode-glm-5-1` pour les taches longues, batch overnight, migrations et audits volumineux quand le budget compte plus que la latence. Verifier les quotas avant les gros runs, surtout pendant les heures de pointe.

# Token Optimization

## Outils actifs (automatiques, aucune action par issue)

- **alexgreensh/token-optimizer**: 20 hooks dans settings.json. Cache les lectures de fichiers, archive les gros resultats, checkpoint avant auto-compact. Gain mesure: -53% sur multi-file nav, -52% sur feature implementation. Fonctionne UNIQUEMENT dans Claude Code (pas Codex, pas Claude Desktop).
- **RTK (mcp-rtk)**: Proxy qui compresse les reponses JSON des MCP servers. Wraps figma-console dans Claude Code et Claude Desktop. Gain attendu: ~40% sur les appels Figma a gros payload.

## Outils opt-in (activables par issue)

- **Caveman Claude**: Reduit les output tokens de ~26%. Activer en ajoutant `TOKEN_PROFILE: compressed` au debut de la description d'issue. JAMAIS sur claude-opus, codex-deep, gemini-pro, opus-latest. Reserve aux taches bulk, scan, extraction.
- **claude-token-efficient**: Reduction de verbosite plus legere. Activer via `/claude-token-efficient`.

## Regles de routing token

| Agent tier | Optimisation auto | Caveman autorise |
|---|---|---|
| claude-haiku, codex-quick | token-optimizer (si Claude Code) | Oui |
| claude-sonnet, codex-standard | token-optimizer | Oui (scan/bulk uniquement) |
| claude-opus, codex-deep, codex-high | token-optimizer | NON, jamais |
| gemini-flash, gemini-pro, gemini-3-1-pro | Aucune (Gemini, pas Claude Code) | Non applicable |
| opencode-glm-5-1 | Aucune | Non applicable |

## Monitoring

Autopilot hebdomadaire TOKEN-MONITOR (codex-quick) verifie les savings et l'etat des hooks.

# Codex Code Review

Codex Code Review poste sur 3 endpoints distincts:

1. **Reviews body**: verdict global (APPROVE / REQUEST_CHANGES)
2. **Inline comments**: commentaires ligne par ligne sur le diff
3. **Issue comments**: commentaires generaux

Fetch via:

```bash
gh api repos/Korkyzer/{REPO}/pulls/{PR}/reviews \
  --jq '.[] | select(.user.login | test("chatgpt|codex"; "i"))'

gh api repos/Korkyzer/{REPO}/pulls/{PR}/comments \
  --jq '.[] | select(.user.login | test("chatgpt|codex"; "i"))'
```

**Force-push ne declenche PAS de re-review automatique.** Si tu veux un nouveau review Codex apres une correction, fermer et rouvrir la PR ou creer une nouvelle review request manuellement.

# Skills design disponibles

26 skills design installees globalement. Commandes cles pour les agents frontend:

| Commande | Usage |
|----------|-------|
| `/polish` | Review et cleanup UI avant livraison |
| `/audit` | Audit complet typo/couleurs/spacing/layout/a11y |
| `/impeccable` | Flow complet shape-then-build |
| `/overdrive` | Interactions extraordinaires (max 2-3 par site) |
| `/typeset` | Systeme typographique |
| `/shape` | Composition et formes |
| `/layout` | Structure et grilles |
| `/clarify` | Simplification visuelle |
| `/colorize` | Palette et couleurs |
| `/bolder` | Impact visuel renforce |
| `/delight` | Micro-interactions |
| `/adapt` | Responsive/adaptatif |
| `/optimize` | Performance percue |
| `/design-taste-frontend` | Evaluation premium vs AI-generated |
| `/full-output-enforcement` | Forcer 100% du code sans paresse |

# Autopilots actifs

| Autopilot | Agent | Frequence | Description |
|---|---|---|---|
| PR Reviewer Moiko | codex-standard | ~3h | Review des PRs Moiko |
| CI + Screenshots Moiko | codex-standard | ~2h | CI + visual QA |
| Board Hygiene | codex-standard | ~1h | Nettoyage board in_review -> done |
| TOKEN-MONITOR | codex-quick | Hebdo (cron manuel) | Verifie RTK gain, hooks, MCP servers |

Pour trigger manuellement un autopilot: `multica autopilot trigger <UUID>`

# SwarmReview

SwarmReview est un outil multi-agent de code review pour PRs GitHub, inspire de Cloudflare's internal reviewer. Il tourne comme un binaire standalone sur le Mac d'Arthur, pas via Multica agents.

## Architecture

- Repo: `Korkyzer/swarmreview` (private)
- Local: `~/Users/korky/Code/swarmreview/`
- Stack: TypeScript + Bun runtime
- Provider: OpenCode Go (via `OPENCODE_GO_API_KEY`)

## Specialists

- **security**: Codex CLI (gpt-5.5-medium)
- **quality**: Codex CLI (gpt-5.5-low)
- **performance**: OpenCode Go Kimi K2.6 (thinking mode active)
- **coordinator**: Claude CLI (claude-sonnet-4-6) pour judge pass

## Invocation

```bash
cd ~/Users/korky/Code/swarmreview
./bin/swarmreview <pr-url>

# Exemple:
./bin/swarmreview https://github.com/Korkyzer/cvthequecfi/pull/95
```

Le pipeline:

1. Fetch le diff via `gh pr diff`
2. Assess risk tier (trivial/lite/full)
3. Spawn 3 specialists en parallele (2 Codex CLI subprocess + 1 OpenCode Go API call)
4. Coordinator judge pass avec severity calibration + scale-dependent filtering
5. Post final review via `gh pr review` sur le PR GitHub

## Capacites

- Severity calibration (security path traversal = critical par defaut)
- Scale-dependent findings (prefixe `[SCALE:HIGH]` pour patterns reels mais impact nul a scale actuel)
- Cloudflare rubric pour approval decision (approved / approved_with_comments / minor_issues / significant_concerns)
- Pipeline Notes automatique si un specialist fail (visibilite partial runs)

## Cout

~$10/mois fixe (OpenCode Go sub) + quota Codex CLI Arthur (deja existant)
Par review: ~4-8 minutes, tokens Kimi ~6-10k output

## Quand declencher via Multica

Si une issue Multica demande un review de PR:

```
Creer une issue avec template:
[SWRM-REVIEW] Review PR <url>
Assignee: codex-standard
Task: Run swarmreview binary locally:
  cd ~/Users/korky/Code/swarmreview
  ./bin/swarmreview <pr-url>
Collect the output and post as comment.
```

Mais le plus souvent, Arthur l'invoque directement depuis son terminal, pas via Multica.

## Out of scope (NE PAS faire)

- Ne PAS creer d'agents Multica `swarmreview-*`. Pas d'orchestration via Multica, juste CLI standalone.
- Ne PAS utiliser Requesty (migration vers OpenCode Go effectuee).
- Ne PAS desactiver le thinking mode de Kimi K2.6 (regression).

# Anti-patterns

Avoid these mistakes:

- Do not hardcode agent IDs or project IDs
- Do not trust self-reported model names from agents
- Do not assign `claude-opus` to a wide batch by default
- Do not forget that `cwd` is only a description hint
- Do not write one-line issue descriptions for complex work
- Do not assume Multica provides persistent memory between runs
- Do not silently fall back to raw shell `multica` commands when the MCP tools are working
- Do not delegate destructive or broad filesystem work without explicit user consent
- Do not switch assignee on a `done` or `cancelled` issue without checking status semantics
- Ne PAS utiliser Requesty (migration OpenCode Go shipped le 24/04/26)
- Ne PAS creer d'agents Multica specifiques a SwarmReview (c'est un binaire standalone)
- Ne PAS desactiver thinking mode sur Kimi K2.6 ou DeepSeek V4 (regression qualite)
- **Do not ask an agent to restart, stop, or stop-and-start the Multica daemon. The agent runs inside the daemon and will kill its own parent.**
- **Do not put issues in `blocked` while waiting for human input. Prefer `in_progress` with a comment. Blocked issues can have re-pickup glitches.**
- Do not route GLM 5.1 during peak hours without checking quota multipliers
- **Ne jamais lancer en parallele des issues qui touchent aux memes fichiers. Toujours sequentialiser.**
- **Ne jamais utiliser le short ID (KOR-XXX) comme `parent_issue_id`. Toujours utiliser le UUID complet.**
- **Ne jamais assigner `claude-haiku` ou `codex-quick` a une issue dans une chaine sequentielle.** Minimum : `claude-sonnet` ou `codex-standard`.
- **Utiliser `multica_add_comment` (MCP) pour les commentaires de chainage.** Jamais `multica issue comment add` (CLI) : les commentaires CLI sont ignores par le daemon comme triggers de pickup.
- Si 2 agents partagent un prefixe de nom (ex: `claude-opus` et `claude-opus-4-7`), la CLI refuse l'assignation. Renommer l'ambigu (ex: `claude-opus-4-7` -> `opus-latest`).
- **Ne jamais creer une issue sequentielle en status `todo` avec assignee.** Utiliser le pattern backlog (section 4). Toujours backlog + assignee pour les issues dependantes, ne passer en `todo` que la premiere.
- **Toujours inclure un backup + rollback pour les modifications de config systeme.** Les issues qui touchent a ~/.claude/, claude_desktop_config.json, ou ~/.codex/config.toml doivent: (a) backup avant modif, (b) inclure ROLLBACK.md avec commandes de restauration. Pattern de backup slim: exclure projects/, telemetry/, debug/, session-env/, cache/ (~40MB au lieu de 1.5GB).
- **Toujours dry-run les commandes destructives avant execution.** Toute commande qui modifie une config, installe un hook, ou wrappe un MCP doit etre lancee en --dry-run d'abord si l'option existe.

# Safety Notes

Delegated Multica agents run with highly permissive execution settings. Treat them as trusted coding agents with broad local access, not as sandboxed workers.

Be stricter before delegating when the task involves:

- destructive shell commands
- secret handling
- credential files
- unrelated directories under `HOME`
- production-impacting scripts
- any operation targeting the Multica daemon itself

# Out of Scope

This skill is not for:

- answering simple factual questions locally
- replacing final human review
- pretending Multica has cross-run memory
- forcing delegation when a direct local fix is clearly faster
- identifying model usage from agent prose instead of billing logs

# Working Rules

Follow this operating sequence whenever you delegate:

1. Inspect agents and projects
2. Route to the cheapest reliable agent
3. Write a concrete issue with acceptance criteria and hard cap tool_calls
4. Split only when the split is meaningful -- sequentialiser si les issues touchent les memes fichiers
5. Monitor the issue before assuming success
6. Correct with comments instead of rewriting from scratch
7. Verify final output and billed model when relevant

If there is ambiguity, prefer a short planning or triage issue first rather than a badly scoped execution issue.

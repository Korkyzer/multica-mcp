# Multica MCP — Advanced Usage Guide

This guide documents patterns and best practices for orchestrating Multica through the MCP server, from an LLM chat (Claude Desktop, Codex Desktop, Claude Code, or any MCP-capable client).

It is the companion document to the [README](README.md). Start there for installation; come here when you want to get the most out of MCP-driven delegation.

Agent names in this document (`claude-sonnet`, `codex-standard`, `gemini-pro`, etc.) are examples. The actual names in your workspace are whatever you configured. Use `multica_list_agents` to discover them.

## Contents

1. [When to use the MCP](#1-when-to-use-the-mcp)
2. [Core workflow](#2-core-workflow)
3. [Writing issues that run on the first try](#3-writing-issues-that-run-on-the-first-try)
4. [Splitting large work](#4-splitting-large-work)
5. [Sequencing chains of issues](#5-sequencing-chains-of-issues)
6. [Dual reviewer pattern (PQR)](#6-dual-reviewer-pattern-pqr)
7. [Follow-up and correction](#7-follow-up-and-correction)
8. [Verification](#8-verification)
9. [Routing matrix](#9-routing-matrix)
10. [Tool-call caps](#10-tool-call-caps)
11. [Token optimization](#11-token-optimization)
12. [Known limitations](#12-known-limitations)
13. [Anti-patterns](#13-anti-patterns)
14. [Issue templates](#14-issue-templates)
15. [Safety notes](#15-safety-notes)

---

## 1. When to use the MCP

Trigger an MCP-driven Multica flow when one or more of these signals are present:

- The user wants to delegate, assign, triage, parallelize, or supervise work
- The request is larger than one focused coding session
- The work naturally splits into multiple independent tracks
- The user wants a backlog, sprint plan, sub-issues, or task routing
- The work needs a different model profile than the current chat
- The task is mostly bulk analysis, audit, review, or repository scanning
- The user asks which agent should handle a task
- The user wants to push more context to an agent already running in Multica
- The user wants to know which billed model actually ran

Do not trigger for trivial one-shot work that is faster to do locally than to delegate.

## 2. Core workflow

**CRITICAL: Issue creation is a 2-phase flow.** Phase 1 (staging): create WITHOUT an assignee, move to `backlog`, add the assignee. The issue is now READY but NOT LAUNCHED. Phase 2 (activation): move it to `todo` via `multica_update_issue`. The daemon picks up ONLY `todo` + assignee. If you skip phase 2, the issue stays in backlog indefinitely and nothing happens.

### 2.1 Check readiness

1. Call `multica_list_agents`
2. Call `multica_list_projects` if project placement matters
3. Match by current agent names, never by hardcoded IDs

If the user already named an agent, still confirm it exists in `multica_list_agents`.

### 2.2 Safe issue creation

The Multica daemon picks up issues whose status is `todo` **and** that have an assignee. Use `backlog` + assignee only as a staging state:

```
ALWAYS create issues like this:

PHASE 1 - STAGING (issue ready but not launched):
1. Create the issue WITHOUT an assignee (arrives in `todo`)
2. Move it to `backlog`: update_issue(status="backlog")
3. THEN add the assignee: update_issue(assignee="<agent>")
=> The issue is now `backlog` + assignee. The daemon IGNORES it.

PHASE 2 - ACTIVATION (launches the issue):
4. Move it to `todo`: update_issue(status="todo")
=> The daemon picks it up IMMEDIATELY.

If the issue should wait (dependency, human validation), DO NOT do step 4.
Arthur or the previous agent in the chain can do step 4 when it is time.
```

Via MCP, the full issue-creation cycle is 4 calls, not 3:
1. `multica_create_issue` WITHOUT `assignee`
2. `multica_update_issue` for status `backlog`
3. `multica_update_issue` for assignee `<agent>`
4. `multica_update_issue` for status `todo` (THIS STEP LAUNCHES THE ISSUE. Without it, nothing happens.)

For issues you want to keep in reserve (launch later, wait for a dependency), stop at step 3. Arthur or another agent can do step 4 when the time is right.

### 2.3 Decide whether to delegate

Delegate when at least one is true:

- The work is parallelizable
- The work benefits from a different provider or context window
- The user mainly needs coordination rather than direct hands-on edits
- The current conversation would lose momentum if it tried to absorb all the work inline

Keep work local when:

- The next step is tiny and unblockable
- The answer is mostly explanation, not execution
- The task is urgent and the very next action depends on a result you can produce faster yourself

### 2.4 Pick the agent

Use the [routing matrix](#9-routing-matrix) as the default. **Consider context, not just task type.** A task resuming after a crash with partial work may be short enough for a cheaper agent; a fresh architectural investigation should never start on a fast/cheap agent — the reasoning window is insufficient.

## 3. Writing issues that run on the first try

Always include:

- A precise title with the expected outcome
- Enough description for the agent to act without guessing
- Repo or product context
- Explicit success criteria
- Constraints, non-goals, and output format
- The working directory if it matters (`cwd` parameter — it is injected as a markdown hint; the agent must still `cd` manually)
- A hard cap on `tool_calls` (see [caps table](#10-tool-call-caps))

**Never include a step that asks the agent to restart, stop, or otherwise manipulate the Multica daemon.** The agent runs inside the daemon and would kill its own parent process.

Use the [issue templates](#14-issue-templates) rather than improvising vague prompts.

### Disambiguate Claude Code vs Claude Desktop vs Codex in briefs

The configuration files and capabilities differ:

- Claude Code: `~/.claude.json` (MCP servers), `~/.claude/settings.json` (hooks), skills
- Claude Desktop: `~/Library/Application Support/Claude/claude_desktop_config.json` (MCP servers only)
- Codex CLI / Codex Desktop: `~/.codex/config.toml` (MCP servers; Codex Desktop reuses the CLI config)

When an issue touches MCP servers or client configs, always specify which platform. The classic mistake is installing an MCP entry in the Claude Desktop config and expecting Claude Code to see it (or vice versa).

## 4. Splitting large work

Split when the request contains separable deliverables, different risk levels, or clearly different specialties.

Pattern:

1. Create a parent orchestration issue for planning or synthesis
2. Create child issues with `parent_issue_id` — **use the full UUID, not the short ID**
3. Assign each child to the cheapest agent that can reliably do the job
4. Reserve expensive agents for the narrow slice that truly needs them

Typical split signals: frontend vs backend vs tests; implementation vs audit; bulk scan vs targeted fix; architecture recommendation vs execution.

### Group by file domain, not by logical step

Each Multica issue opens a fresh agent session with significant boot overhead (system prompt, tools, skills, MCP servers). To minimize that overhead:

- **Group** tasks that touch the SAME files into one issue, using follow-up comments for steps
- **Split** tasks that touch DIFFERENT files into parallel issues

Bad split: Issue 1 "install the tools", Issue 2 "update the same config".
Better: one issue "install the tools + update the config" with a follow-up comment.

Good split: Issue A "fix API routes" (backend), Issue B "fix UI components" (frontend) — different files, can run in parallel.

## 5. Sequencing chains of issues

**Never run parallel issues that touch the same files.** Examples to avoid: multiple CSS fixes on `style.css`, multiple JS edits on `app.js`.

Either fold them into one issue, or chain them with explicit dependencies.

### Auto-chaining pattern

When an agent is part of a sequential chain, it must run these three steps at the end of its work, in order:

1. Move its own issue to `in_review` via `multica_update_issue`
2. Move the next issue to `todo` via `multica_update_issue`
3. Post a starter comment on the next issue, **@mentioning the assignee agent**:
   > "[@AgentName](mention://agent/<uuid>) The previous issue [TAG] is done. You can start. `git pull` to get the changes."

**Use `multica_add_comment` (MCP), never the shell `multica issue comment add`.** Comments posted via the CLI are tagged `authorType == "agent"` and ignored by the daemon as pickup triggers. MCP comments are recognized as owner-authored and do trigger pickup.

**Daemon caveat:** even with MCP, the daemon may ignore a comment if `authorType == "agent"`. The **@mention of the assignee agent is the workaround**: the mention path fires for all authors. Without the @mention, pickup is not guaranteed.

### Minimum routing for chained issues

**Chained issues require at least a mid-tier agent.** Small/fast agents (haiku-tier, quick-tier) do not have the reasoning bandwidth to reliably execute the chaining protocol (find the next issue, make the three MCP calls in the right order, look up the assignee UUID). Use a default-tier agent or better.

### Safe creation of a sequential chain

1. Create all issues WITHOUT an assignee (they land in `todo` by default)
2. Move each to `backlog`
3. Add the assignee on each
4. Move ONLY the first issue to `todo`
5. Post a starter comment on the first issue

### Auto-chain template (chained-issue briefs)

Append this section to every chained issue except the last:

```
## Auto-chain

When your work is complete:
1. Move THIS issue to `in_review` via update_issue
2. Find the issue "[NEXT_ISSUE_TITLE]" in project [PROJECT], status `backlog`
3. Move it to `todo` via update_issue
4. Post a comment: "[@AgentName](mention://agent/<uuid>) The previous issue [CURRENT_TAG] is done. You can start. `git pull` to get the changes."
```

For the last issue in the chain:

```
## End of chain

When your work is complete:
1. Move THIS issue to `in_review` via update_issue
2. Post a comment: "Sequence [PREFIX-XX] through [PREFIX-YY] is complete. Ready for global review."
```

## 6. Dual reviewer pattern (PQR)

For hard bugs or quality audits:

1. **Diagnostic issue A** (e.g., a deep-reasoning agent): read-only, posts a structured verdict
2. **Diagnostic issue B** (e.g., a deep-debugging Codex agent): read-only, same task, independently
3. **Fix issue** (e.g., a standard implementation agent): reads both diagnostics, synthesizes, implements

Issue 3 stays in `backlog` until 1 and 2 are `done`. The independence of the two diagnostics is the whole point — do not let them read each other before concluding.

## 7. Follow-up and correction

Use `multica_get_issue` to inspect status, comments, latest task state, working directory, and output summary.

Use `multica_add_comment` when:

- The agent misunderstood the scope
- The repo path was ignored
- The task needs extra acceptance criteria
- The agent is blocked on a product or architecture decision

Push short, corrective comments. Do not resend the whole original brief unless the original brief was bad.

**Posting a comment on a running or blocked issue typically re-wakes the agent.** You rarely need to toggle status by hand.

Prefer `multica_add_comment` over the shell equivalent whenever the MCP tool is available.

### Auto-reviewer behaviour

Multica has an automatic reviewer that moves `in_review` issues to `done` on a schedule. Issues may "disappear" from the board without human action. To avoid this when you want a real human review:

- Use the dual-reviewer pattern above and promote to `done` manually
- Or drop the assignee and set `blocked` with an explicit comment

## 8. Verification

Do not stop at `done`. Check:

- Did the comments or output summary match the requested deliverable?
- Did the agent honor `cwd`?
- Was the chosen agent still the right one in hindsight?
- If model identity matters, call `multica_get_runtime_usage`

**Never trust an agent's self-report as the source of truth for billed model usage.** Use `multica_get_runtime_usage`.

## 9. Routing matrix

Agent names are configurable. These are generic tiers — map them onto your workspace using `multica_list_agents`.

| Situation | Tier |
| --- | --- |
| Renames, formatting, simple file edits | fast/cheap |
| Standard feature or bugfix | default implementation |
| Architecture, risky review, deep redesign | deep-reasoning |
| Visual/UI audit on screenshots | vision-capable |
| Fast Codex probe or verification | Codex fast |
| Standard Codex implementation | Codex default |
| Reinforced audit on a circumscribed module | Codex high |
| Hard debugging, deep cross-check | Codex deep |
| Huge repo scan, document synthesis | Gemini large-context |
| Deep large-context architecture | Gemini pro |
| UI/frontend with higher reasoning | Gemini top-tier |
| Long-horizon overnight / weekend batch | budget/GLM tier |

## 10. Tool-call caps

Always include a hard cap on `tool_calls` in the issue brief to prevent rabbit holes.

| Tier | Recommended hard cap |
| --- | --- |
| Fast/cheap (haiku-style, Codex quick) | 15–20 |
| Default implementation (Sonnet-style, Codex standard) | 50 |
| Deep-reasoning (Opus-style, Codex high, Gemini large-context) | 60 |
| Deep-debug / pro-tier (Codex deep, Gemini pro/top) | 80 |
| Long-horizon / budget tier | 200 |

If an agent is blocked for more than ~10 minutes on a single problem, post a comment and move on.

## 11. Token optimization

- Caching proxies and token-optimizer hooks (where available on the host) should be left on across most tiers.
- Aggressive output compression ("caveman" modes and similar) is fine on bulk scan / extraction work on fast tiers, **but never on deep-reasoning tiers** — the loss of nuance defeats the reason you chose that tier.
- For MCP servers that return big JSON payloads, consider a compression/proxy layer. Measured savings vary by workload.

## 12. Known limitations

- `cwd` is not a native flag of the underlying `multica issue create` — the MCP injects it into the description. The agent still has to `cd` manually.
- Short IDs (e.g., `ABC-123`) do not work for `parent_issue_id`. Use the full UUID.
- If two agents share a name prefix (e.g., `claude-opus` and `claude-opus-4-7`), the CLI refuses assignment. Rename the more specific one.
- The automatic reviewer promotes `in_review` → `done` on a schedule. See [§7](#7-follow-up-and-correction) for how to avoid surprise promotions.
- Multica has no persistent memory across runs. Context lives in the issue description and comments.
- Comments posted through the shell CLI are tagged as agent-authored and are not picked up as triggers by the daemon. Use `multica_add_comment` (MCP) for anything that should re-wake an agent.

## 13. Anti-patterns

Avoid these:

- Hardcoding agent IDs or project IDs
- Trusting self-reported model names from agents
- Defaulting a deep-reasoning agent for a wide batch
- Forgetting that `cwd` is only a hint, not a native flag
- One-line issue descriptions for complex work
- Assuming Multica provides persistent memory between runs
- Silently falling back to shell `multica` when the MCP tools are working
- Delegating destructive or broad filesystem work without explicit user consent
- Switching the assignee on a `done` or `cancelled` issue without checking status semantics
- **Asking an agent to restart, stop, or stop-and-start the Multica daemon** — the agent runs inside the daemon and will kill its own parent
- Parking issues in `blocked` while waiting for human input (prefer `in_progress` with a comment — `blocked` can have re-pickup glitches)
- Running parallel issues that touch the same files — sequentialize instead
- Using a short ID as `parent_issue_id` — always use the full UUID
- Assigning a fast/cheap agent to a chained issue — the chaining protocol needs reasoning bandwidth
- Posting chaining comments through the shell CLI instead of `multica_add_comment`
- **Never forget step 4 (move to `todo`) after the `backlog` + assignee staging state.** Without this step, the issue stays in backlog indefinitely and the daemon never picks it up. If the issue should launch immediately, all 4 calls must happen back-to-back. If it should wait, document in a comment why it remains in backlog.
- Creating a chained issue as `todo` + assignee before its predecessor is done — use the staging and activation pattern in [§2.2](#22-safe-issue-creation)
- Modifying host configs (Claude Code / Claude Desktop / Codex) without a backup + rollback path included in the issue

## 14. Issue templates

### Standard implementation

```
# Title
<one-line expected outcome>

# Context
<repo path, product context, links to adjacent work>

# Task
<clear, ordered list of what to do>

# Success criteria
- <explicit, verifiable>
- <explicit, verifiable>

# Constraints
- hard cap: tool_calls = <N>
- <style, version, or library constraints>

# Out of scope
- <things that are tempting but not part of this issue>

# Output format
<what the final comment should contain>
```

### Read-only diagnostic (for PQR)

```
# Title
Diagnostic: <symptom>

# Task
Read-only investigation. Do not modify files.

1. Reproduce <symptom>
2. Trace through <relevant modules>
3. Propose a root cause with evidence (file:line references)
4. Propose 1–3 fixes with tradeoffs

# Output
Structured verdict comment:
- Root cause:
- Evidence:
- Options:
- Recommended:
```

### Chained issue

Standard template + the auto-chain section from [§5](#5-sequencing-chains-of-issues).

## 15. Safety notes

Delegated Multica agents run with permissive execution settings. Treat them as trusted coding agents with broad local access, not as sandboxed workers.

Tighten review before delegating when the task involves:

- Destructive shell commands
- Secret handling
- Credential files
- Unrelated directories under `$HOME`
- Production-impacting scripts
- Any operation targeting the Multica daemon itself

When in doubt, prefer a short planning or triage issue first rather than a badly scoped execution issue.

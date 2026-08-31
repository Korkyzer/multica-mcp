import { TtlCache } from "./cache.js";
import { closestMatch } from "./fuzzy.js";
import { runMulticaJson } from "./multica-cli.js";
import type { Agent, Squad } from "./types.js";

const squadsCache = new TtlCache<Squad[]>(5 * 60 * 1000);

export async function getSquadsCached(): Promise<Squad[]> {
  const cached = squadsCache.get("all");
  if (cached) return cached;

  const fresh = (await runMulticaJson<Squad[]>(["squad", "list"])) ?? [];
  squadsCache.set("all", fresh);
  return fresh;
}

export function invalidateSquadsCache(): void {
  squadsCache.invalidate();
}

export async function resolveSquadByName(
  name: string,
): Promise<Squad | undefined> {
  const squads = await getSquadsCached();
  const normalized = name.trim().toLowerCase();
  return squads.find(
    (squad) => !squad.archived_at && squad.name.trim().toLowerCase() === normalized,
  );
}

export async function buildUnknownSquadMessage(name: string): Promise<string> {
  const squads = await getSquadsCached();
  const names = squads.filter((squad) => !squad.archived_at).map((squad) => squad.name);
  const suggestion = closestMatch(name, names);
  const suggestionText = suggestion ? ` Did you mean "${suggestion}"?` : "";
  const available = names.length > 0 ? names.join(", ") : "(none)";
  return `Squad "${name}" not found.${suggestionText} Available squads: ${available}`;
}

/**
 * An issue's assignee_id can point at an agent or a squad. mapAgentIdToName
 * only checks agents, so squad-assigned issues would otherwise render as a
 * raw UUID in every issue read tool.
 */
export function mapAssigneeIdToName(
  agents: Agent[],
  squads: Squad[],
  id: string | null | undefined,
  type?: string | null,
): string | null {
  if (!id) return null;
  if (type === "squad") {
    return squads.find((squad) => squad.id === id)?.name ?? id;
  }
  const agent = agents.find((candidate) => candidate.id === id);
  if (agent) return agent.name;
  const squad = squads.find((candidate) => candidate.id === id);
  if (squad) return squad.name;
  return id;
}

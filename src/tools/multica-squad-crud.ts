import { z } from "zod";
import {
  buildUnknownAssigneeMessage,
  resolveAgentByName,
} from "../lib/agents.js";
import {
  buildSquadCreateArgs,
  buildSquadUpdateArgs,
} from "../lib/cli-arg-builders.js";
import { runMulticaJson } from "../lib/multica-cli.js";
import {
  getSquadsCached,
  invalidateSquadsCache,
} from "../lib/squads.js";
import type { ListResult, Squad, SquadMember } from "../lib/types.js";

export const multicaListSquadsSchema = z.object({});

type SquadSummary = {
  id: string;
  name: string;
  description: string | null;
  leader_id: string;
  member_count: number;
  archived: boolean;
};

export async function multicaListSquads(): Promise<ListResult<SquadSummary>> {
  const squads = await getSquadsCached();

  const items = squads.map((squad) => ({
    id: squad.id,
    name: squad.name,
    description: squad.description ?? null,
    leader_id: squad.leader_id,
    member_count: squad.member_count ?? 0,
    archived: Boolean(squad.archived_at),
  }));

  if (items.length === 0) {
    return {
      items: [],
      state: "empty",
      message: "No squads in this workspace. Create one with multica_squad_create.",
    };
  }

  return { items, state: "loaded" };
}

export const multicaGetSquadSchema = z.object({
  squad_id: z.string().min(1),
});

export type MulticaGetSquadInput = z.infer<typeof multicaGetSquadSchema>;

export async function multicaGetSquad(input: MulticaGetSquadInput) {
  const [squad, members] = await Promise.all([
    runMulticaJson<Squad>(["squad", "get", input.squad_id]),
    runMulticaJson<SquadMember[]>(["squad", "member", "list", input.squad_id]),
  ]);

  return {
    id: squad.id,
    name: squad.name,
    description: squad.description ?? null,
    instructions: squad.instructions ?? null,
    leader_id: squad.leader_id,
    archived: Boolean(squad.archived_at),
    members: members ?? [],
  };
}

export const multicaCreateSquadSchema = z.object({
  name: z.string().min(1).max(120),
  leader: z.string().min(1),
  description: z.string().optional(),
});

export type MulticaCreateSquadInput = z.infer<typeof multicaCreateSquadSchema>;

export async function multicaCreateSquad(input: MulticaCreateSquadInput) {
  const leader = await resolveAgentByName(input.leader);
  if (!leader) {
    throw new Error(await buildUnknownAssigneeMessage(input.leader));
  }

  const squad = await runMulticaJson<Squad>(
    buildSquadCreateArgs({
      name: input.name,
      leader_id: leader.id,
      description: input.description,
    }),
  );
  invalidateSquadsCache();

  return {
    id: squad.id,
    name: squad.name,
    leader_id: squad.leader_id,
    leader: leader.name,
  };
}

export const multicaUpdateSquadSchema = z.object({
  squad_id: z.string().min(1),
  name: z.string().optional(),
  description: z.string().optional(),
  instructions: z.string().optional(),
  leader: z.string().optional(),
  avatar_url: z.string().optional(),
});

export type MulticaUpdateSquadInput = z.infer<typeof multicaUpdateSquadSchema>;

export async function multicaUpdateSquad(input: MulticaUpdateSquadInput) {
  let leaderId: string | undefined;
  if (input.leader !== undefined) {
    const leader = await resolveAgentByName(input.leader);
    if (!leader) {
      throw new Error(await buildUnknownAssigneeMessage(input.leader));
    }
    leaderId = leader.id;
  }

  const squad = await runMulticaJson<Squad>(
    buildSquadUpdateArgs({
      squad_id: input.squad_id,
      name: input.name,
      description: input.description,
      instructions: input.instructions,
      leader_id: leaderId,
      avatar_url: input.avatar_url,
    }),
  );
  invalidateSquadsCache();

  return {
    id: squad.id,
    name: squad.name,
    leader_id: squad.leader_id,
    updated_at: squad.updated_at ?? null,
  };
}

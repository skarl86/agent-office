import { create } from "zustand";
import { getAdapter, waitForAdapter } from "@/gateway/adapter-provider";
import type { SkillInfo, SkillInstallResult } from "@/gateway/adapter-types";

export type SkillSourceFilter = "all" | "built-in" | "marketplace";

interface SkillsStoreState {
  skills: SkillInfo[];
  isLoading: boolean;
  error: string | null;

  sourceFilter: SkillSourceFilter;
  selectedSkill: SkillInfo | null;
  detailDialogOpen: boolean;
  installing: Set<string>;

  fetchSkills: () => Promise<void>;
  setSourceFilter: (filter: SkillSourceFilter) => void;
  openDetail: (skill: SkillInfo) => void;
  closeDetail: () => void;
  toggleSkill: (skillKey: string, enabled: boolean) => Promise<void>;
  installSkill: (name: string, installId: string) => Promise<SkillInstallResult>;
}

function compareSkillPriority(a: SkillInfo, b: SkillInfo): number {
  if (a.enabled && !b.enabled) return -1;
  if (!a.enabled && b.enabled) return 1;
  if (a.isCore && !b.isCore) return -1;
  if (!a.isCore && b.isCore) return 1;
  return a.name.localeCompare(b.name);
}

export function filterInstalledSkills(
  skills: SkillInfo[],
  query: string,
  sourceFilter: SkillSourceFilter,
): SkillInfo[] {
  const normalizedQuery = query.trim().toLowerCase();

  return skills
    .filter((skill) => skill.isBundled || skill.eligible)
    .filter((skill) => {
      if (!normalizedQuery) return true;
      return [skill.name, skill.description, skill.slug, skill.source]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    })
    .filter((skill) => {
      if (sourceFilter === "built-in") return Boolean(skill.isBundled);
      if (sourceFilter === "marketplace") return !skill.isBundled;
      return true;
    })
    .sort(compareSkillPriority);
}

export const useSkillsStore = create<SkillsStoreState>((set, get) => ({
  skills: [],
  isLoading: false,
  error: null,

  sourceFilter: "all",
  selectedSkill: null,
  detailDialogOpen: false,
  installing: new Set<string>(),

  fetchSkills: async () => {
    set({ isLoading: true, error: null });
    try {
      await waitForAdapter();
      const raw = await getAdapter().skillsStatus();
      const skills = Array.isArray(raw) ? raw : [];
      set({ skills, isLoading: false });
    } catch (err) {
      set({ error: String(err), isLoading: false });
    }
  },

  setSourceFilter: (filter) => set({ sourceFilter: filter }),

  openDetail: (skill) => set({ selectedSkill: skill, detailDialogOpen: true }),
  closeDetail: () => set({ selectedSkill: null, detailDialogOpen: false }),

  toggleSkill: async (skillKey, enabled) => {
    try {
      const result = await getAdapter().skillsUpdate(skillKey, { enabled });
      if (result.ok) {
        set((s) => ({
          skills: s.skills.map((sk) => (sk.id === skillKey ? { ...sk, enabled } : sk)),
        }));
      }
    } catch (err) {
      set({ error: String(err) });
    }
  },

  installSkill: async (name, installId) => {
    const installing = new Set(get().installing);
    installing.add(name);
    set({ installing });

    try {
      const result = await getAdapter().skillsInstall(name, installId);
      if (result.ok) {
        await get().fetchSkills();
      }
      return result;
    } catch (err) {
      return { ok: false, message: String(err) };
    } finally {
      const updated = new Set(get().installing);
      updated.delete(name);
      set({ installing: updated });
    }
  },
}));

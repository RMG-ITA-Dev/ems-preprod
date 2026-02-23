import { format, parseISO } from "date-fns";
import type { TimerEntry } from "@/hooks/useTimerEntries";

// ─── Types ───────────────────────────────────────────────────────

export interface ExportGroup {
  key: string; // "engId|actId|date"
  engagementId: string;
  engagementCode: string;
  engagementName: string;
  activityId: string;
  activityCode: string;
  dateWorked: string; // yyyy-MM-dd
  entries: TimerEntry[];
  totalMinutes: number;
}

export interface SplitConflict {
  key: string;
  engagementCode: string;
  activityCode: string;
  dateWorked: string;
  selectedEntries: TimerEntry[];
  selectedMinutes: number;
  unselectedEntries: TimerEntry[];
  unselectedMinutes: number;
}

export type ConflictPolicy =
  | "include_all_matching"
  | "exclude_conflicting_groups"
  | "cancel";

export interface ConsolidationPreview {
  mergedGroups: {
    key: string;
    engagementCode: string;
    activityCode: string;
    dateWorked: string;
    entryCount: number;
    totalMinutes: number;
  }[];
  resultingRowCount: number;
  totalEntries: number;
  totalHours: number;
}

export interface PreflightAnalysis {
  groups: Map<string, ExportGroup>;
  conflicts: SplitConflict[];
  hasConsolidation: boolean;
  hasConflicts: boolean;
  preview: ConsolidationPreview;
  eligibleIds: Set<string>;
  selectedIdsSnapshot: Set<string>;
}

// ─── Helpers ─────────────────────────────────────────────────────

function sortKey(g: ExportGroup): string {
  // Deterministic: dateWorked asc, engagementCode asc (fallback id), activityCode asc (fallback id)
  const ec = g.engagementCode || g.engagementId;
  const ac = g.activityCode || g.activityId;
  return `${g.dateWorked}|${ec}|${ac}`;
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  const arrA = Array.from(a).sort();
  const arrB = Array.from(b).sort();
  for (let i = 0; i < arrA.length; i++) {
    if (arrA[i] !== arrB[i]) return false;
  }
  return true;
}

// ─── Core Functions ──────────────────────────────────────────────

/**
 * Groups eligible entries by (date, engagement_id, activity_id).
 * Returns Map in deterministic insertion order: dateWorked asc, engagementCode asc, activityCode asc.
 * Only includes entries with ended_at != null and is_imported == false.
 */
export function buildExportGroups(entries: TimerEntry[]): Map<string, ExportGroup> {
  const eligible = entries.filter((e) => e.ended_at != null && !e.is_imported);

  const tempMap = new Map<string, ExportGroup>();

  for (const entry of eligible) {
    const dateWorked = format(parseISO(entry.started_at), "yyyy-MM-dd");
    const key = `${entry.engagement_id}|${entry.activity_id}|${dateWorked}`;

    const existing = tempMap.get(key);
    if (existing) {
      existing.entries.push(entry);
      existing.totalMinutes += entry.duration_minutes || 0;
    } else {
      tempMap.set(key, {
        key,
        engagementId: entry.engagement_id,
        engagementCode: entry.engagement?.engagement_code || "",
        engagementName: entry.engagement?.engagement_name || "",
        activityId: entry.activity_id,
        activityCode: entry.activity?.activity_code || "",
        dateWorked,
        entries: [entry],
        totalMinutes: entry.duration_minutes || 0,
      });
    }
  }

  // Sort deterministically and rebuild Map
  const sorted = Array.from(tempMap.values()).sort((a, b) =>
    sortKey(a).localeCompare(sortKey(b))
  );

  const result = new Map<string, ExportGroup>();
  for (const g of sorted) {
    result.set(g.key, g);
  }
  return result;
}

/**
 * Detects split-group conflicts: groups where some entries are selected and some are not.
 * Returns conflicts in deterministic order matching buildExportGroups ordering.
 */
export function detectSplitSelectionConflicts(
  groups: Map<string, ExportGroup>,
  selectedIds: Set<string>
): SplitConflict[] {
  const conflicts: SplitConflict[] = [];

  for (const group of groups.values()) {
    if (group.entries.length < 2) continue;

    const selected = group.entries.filter((e) => selectedIds.has(e.timer_id));
    const unselected = group.entries.filter((e) => !selectedIds.has(e.timer_id));

    if (selected.length > 0 && unselected.length > 0) {
      conflicts.push({
        key: group.key,
        engagementCode: group.engagementCode,
        activityCode: group.activityCode,
        dateWorked: group.dateWorked,
        selectedEntries: selected,
        selectedMinutes: selected.reduce((s, e) => s + (e.duration_minutes || 0), 0),
        unselectedEntries: unselected,
        unselectedMinutes: unselected.reduce((s, e) => s + (e.duration_minutes || 0), 0),
      });
    }
  }

  return conflicts;
}

/**
 * Resolves the final set of entries to export based on the chosen conflict policy.
 */
export function resolveFinalExportSet(
  allEligible: TimerEntry[],
  selectedIds: Set<string>,
  conflicts: SplitConflict[],
  policy: ConflictPolicy
): TimerEntry[] {
  if (policy === "cancel") return [];

  const conflictKeys = new Set(conflicts.map((c) => c.key));

  if (policy === "include_all_matching") {
    // Start with selected entries, then add all entries from conflict groups
    const resultIds = new Set(selectedIds);
    for (const conflict of conflicts) {
      for (const entry of conflict.unselectedEntries) {
        resultIds.add(entry.timer_id);
      }
    }
    return allEligible.filter((e) => resultIds.has(e.timer_id));
  }

  if (policy === "exclude_conflicting_groups") {
    // Get all timer_ids that belong to conflicted groups
    const conflictedEntryIds = new Set<string>();
    for (const conflict of conflicts) {
      for (const e of conflict.selectedEntries) conflictedEntryIds.add(e.timer_id);
      for (const e of conflict.unselectedEntries) conflictedEntryIds.add(e.timer_id);
    }
    // Return selected entries minus any that belong to conflicted groups
    return allEligible.filter(
      (e) => selectedIds.has(e.timer_id) && !conflictedEntryIds.has(e.timer_id)
    );
  }

  return [];
}

/**
 * Builds a consolidation preview for the given groups filtered by finalIds.
 */
export function buildConsolidationPreview(
  groups: Map<string, ExportGroup>,
  finalIds: Set<string>
): ConsolidationPreview {
  const mergedGroups: ConsolidationPreview["mergedGroups"] = [];
  let totalEntries = 0;
  let totalMinutes = 0;

  for (const group of groups.values()) {
    const matching = group.entries.filter((e) => finalIds.has(e.timer_id));
    if (matching.length === 0) continue;

    const groupMinutes = matching.reduce((s, e) => s + (e.duration_minutes || 0), 0);
    totalEntries += matching.length;
    totalMinutes += groupMinutes;

    if (matching.length >= 2) {
      mergedGroups.push({
        key: group.key,
        engagementCode: group.engagementCode,
        activityCode: group.activityCode,
        dateWorked: group.dateWorked,
        entryCount: matching.length,
        totalMinutes: groupMinutes,
      });
    }
  }

  return {
    mergedGroups,
    resultingRowCount: Array.from(groups.values()).filter(
      (g) => g.entries.some((e) => finalIds.has(e.timer_id))
    ).length,
    totalEntries,
    totalHours: Math.round((totalMinutes / 60) * 10) / 10,
  };
}

/**
 * Compares two PreflightAnalysis results for equality using normalized sorted arrays.
 * Used for stale-preflight detection.
 */
export function analysisEquals(
  a: PreflightAnalysis,
  b: PreflightAnalysis
): boolean {
  // 1. Compare eligibleIds
  if (!setsEqual(a.eligibleIds, b.eligibleIds)) return false;

  // 2. Compare selectedIdsSnapshot
  if (!setsEqual(a.selectedIdsSnapshot, b.selectedIdsSnapshot)) return false;

  // 3. Compare conflict key sets
  const aConflictKeys = a.conflicts.map((c) => c.key).sort();
  const bConflictKeys = b.conflicts.map((c) => c.key).sort();
  if (aConflictKeys.length !== bConflictKeys.length) return false;
  for (let i = 0; i < aConflictKeys.length; i++) {
    if (aConflictKeys[i] !== bConflictKeys[i]) return false;
  }

  // 4. Compare per-conflict-group membership (sorted timer_ids)
  const aConflictMap = new Map(a.conflicts.map((c) => [c.key, c]));
  const bConflictMap = new Map(b.conflicts.map((c) => [c.key, c]));
  for (const key of aConflictKeys) {
    const ac = aConflictMap.get(key)!;
    const bc = bConflictMap.get(key)!;
    const aIds = [
      ...ac.selectedEntries.map((e) => e.timer_id),
      ...ac.unselectedEntries.map((e) => e.timer_id),
    ].sort();
    const bIds = [
      ...bc.selectedEntries.map((e) => e.timer_id),
      ...bc.unselectedEntries.map((e) => e.timer_id),
    ].sort();
    if (aIds.length !== bIds.length) return false;
    for (let i = 0; i < aIds.length; i++) {
      if (aIds[i] !== bIds[i]) return false;
    }
  }

  return true;
}

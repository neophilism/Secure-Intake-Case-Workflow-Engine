import type { CasePriority } from "@/modules/cases/lifecycle";
import { normalizeCaseTag } from "@/modules/cases/tags";
import type { TransitionAction } from "./definition";

export interface TransitionCaseState {
  priority: CasePriority;
  disposition: string | null;
  openedAt: Date | null;
  resolvedAt: Date | null;
  closedAt: Date | null;
  tags: readonly string[];
}

export interface AppliedTransitionActions {
  casePatch: {
    priority: CasePriority;
    disposition: string | null;
    openedAt: Date | null;
    resolvedAt: Date | null;
    closedAt: Date | null;
  };
  tags: string[];
}

export function applyTransitionActions(
  current: TransitionCaseState,
  actions: readonly TransitionAction[],
  now: Date,
): AppliedTransitionActions {
  let priority = current.priority;
  let disposition = current.disposition;
  let openedAt = current.openedAt;
  let resolvedAt = current.resolvedAt;
  let closedAt = current.closedAt;
  const tags = new Set(current.tags);

  for (const action of actions) {
    switch (action.type) {
      case "mark_open":
        openedAt ??= now;
        resolvedAt = null;
        closedAt = null;
        break;
      case "mark_resolved":
        resolvedAt = now;
        closedAt = null;
        break;
      case "mark_closed":
        closedAt = now;
        break;
      case "set_priority":
        priority = action.value;
        break;
      case "set_disposition":
        disposition = action.value.trim();
        break;
      case "clear_disposition":
        disposition = null;
        break;
      case "add_tag": {
        const tag = normalizeCaseTag(action.value);
        if (tag) tags.add(tag);
        break;
      }
      case "remove_tag": {
        const tag = normalizeCaseTag(action.value);
        if (tag) tags.delete(tag);
        break;
      }
    }
  }

  return {
    casePatch: {
      priority,
      disposition,
      openedAt,
      resolvedAt,
      closedAt,
    },
    tags: [...tags].sort(),
  };
}

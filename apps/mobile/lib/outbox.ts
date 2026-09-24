import AsyncStorage from "@react-native-async-storage/async-storage";
import type { DeficiencyCategory } from "@maintenancebuddy/shared";

const OUTBOX_KEY = "maintenancebuddy_outbox";

export interface OutboxItem {
  id: string;
  type:
    | "update_unit_visit"
    | "update_suite_unit_visits"
    | "upload_photo"
    | "create_deficiency"
    | "replace_deficiencies"
    | "complete_unit_visit"
    | "add_suite"
    | "add_hvac_unit";
  payload: Record<string, unknown>;
  createdAt: string;
}

type OutboxListener = (count: number) => void;

const listeners = new Set<OutboxListener>();

function notifyListeners(count: number) {
  for (const listener of listeners) {
    listener(count);
  }
}

export function subscribeOutboxCount(listener: OutboxListener): () => void {
  listeners.add(listener);
  void getOutboxCount().then(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function getOutbox(): Promise<OutboxItem[]> {
  const raw = await AsyncStorage.getItem(OUTBOX_KEY);
  return raw ? JSON.parse(raw) : [];
}

export async function getOutboxCount(): Promise<number> {
  const outbox = await getOutbox();
  return outbox.length;
}

async function saveOutbox(outbox: OutboxItem[]) {
  await AsyncStorage.setItem(OUTBOX_KEY, JSON.stringify(outbox));
  notifyListeners(outbox.length);
}

export async function addToOutbox(item: Omit<OutboxItem, "id" | "createdAt">) {
  const outbox = await getOutbox();
  outbox.push({
    ...item,
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    createdAt: new Date().toISOString(),
  });
  await saveOutbox(outbox);
}

export async function removeFromOutbox(id: string) {
  const outbox = await getOutbox();
  await saveOutbox(outbox.filter((i) => i.id !== id));
}

export async function clearOutbox() {
  await saveOutbox([]);
}

export type OutboxHandlers = {
  updateUnitVisit: (payload: Record<string, unknown>) => Promise<void>;
  updateSuiteUnitVisits: (payload: Record<string, unknown>) => Promise<void>;
  uploadPhoto: (payload: Record<string, unknown>) => Promise<void>;
  createDeficiency: (payload: Record<string, unknown>) => Promise<void>;
  replaceDeficiencies: (payload: Record<string, unknown>) => Promise<void>;
  completeUnitVisit: (payload: Record<string, unknown>) => Promise<void>;
  addSuite: (payload: Record<string, unknown>) => Promise<void>;
  addHvacUnit: (payload: Record<string, unknown>) => Promise<void>;
};

export type OutboxSatisfiedCheck = (item: OutboxItem) => Promise<boolean>;
export type OutboxAbandonCheck = (item: OutboxItem, error: unknown) => Promise<boolean>;

export async function processOutbox(
  handlers: OutboxHandlers,
  isSatisfied?: OutboxSatisfiedCheck,
  shouldAbandon?: OutboxAbandonCheck
): Promise<{
  processed: number;
  remaining: number;
  error: string | null;
}> {
  const outbox = await getOutbox();
  let processed = 0;
  let error: string | null = null;

  for (const item of outbox) {
    try {
      if (isSatisfied && (await isSatisfied(item))) {
        await removeFromOutbox(item.id);
        processed += 1;
        continue;
      }

      switch (item.type) {
        case "update_unit_visit":
          await handlers.updateUnitVisit(item.payload);
          break;
        case "update_suite_unit_visits":
          await handlers.updateSuiteUnitVisits(item.payload);
          break;
        case "upload_photo":
          await handlers.uploadPhoto(item.payload);
          break;
        case "create_deficiency":
          await handlers.createDeficiency(item.payload);
          break;
        case "replace_deficiencies":
          await handlers.replaceDeficiencies(item.payload);
          break;
        case "complete_unit_visit":
          await handlers.completeUnitVisit(item.payload);
          break;
        case "add_suite":
          await handlers.addSuite(item.payload);
          break;
        case "add_hvac_unit":
          await handlers.addHvacUnit(item.payload);
          break;
        default:
          throw new Error(`Unknown outbox item type: ${(item as OutboxItem).type}`);
      }
      await removeFromOutbox(item.id);
      processed += 1;
    } catch (err) {
      if (isSatisfied) {
        try {
          if (await isSatisfied(item)) {
            await removeFromOutbox(item.id);
            processed += 1;
            continue;
          }
        } catch {
          // fall through
        }
      }
      if (shouldAbandon) {
        try {
          if (await shouldAbandon(item, err)) {
            await removeFromOutbox(item.id);
            processed += 1;
            continue;
          }
        } catch {
          // fall through
        }
      }
      error = err instanceof Error ? err.message : "Sync failed";
      break;
    }
  }

  const remaining = await getOutboxCount();
  notifyListeners(remaining);

  return { processed, remaining, error };
}

export function getDeficienciesFromAnswers(answers: {
  cleaned?: boolean;
  filter_changed?: boolean;
  operating_normally?: boolean;
  reasons?: Partial<Record<"cleaned" | "filter_changed" | "operating_normally", string>>;
}): { category: DeficiencyCategory; description: string }[] {
  const deficiencies: { category: DeficiencyCategory; description: string }[] = [];
  if (answers.cleaned === false) {
    deficiencies.push({
      category: "not_cleaned",
      description: answers.reasons?.cleaned?.trim() || "Unit not cleaned",
    });
  }
  if (answers.filter_changed === false) {
    deficiencies.push({
      category: "filter_not_changed",
      description: answers.reasons?.filter_changed?.trim() || "Filter not changed",
    });
  }
  if (answers.operating_normally === false) {
    deficiencies.push({
      category: "not_operating",
      description: answers.reasons?.operating_normally?.trim() || "Unit not operating normally",
    });
  }
  return deficiencies;
}

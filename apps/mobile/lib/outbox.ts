import AsyncStorage from "@react-native-async-storage/async-storage";
import type { DeficiencyCategory } from "@maintenancebuddy/shared";

const OUTBOX_KEY = "maintenancebuddy_outbox";

export interface OutboxItem {
  id: string;
  type:
    | "update_unit_visit"
    | "update_suite_visit"
    | "upload_photo"
    | "create_deficiency"
    | "add_suite"
    | "add_hvac_unit";
  payload: Record<string, unknown>;
  createdAt: string;
}

export async function getOutbox(): Promise<OutboxItem[]> {
  const raw = await AsyncStorage.getItem(OUTBOX_KEY);
  return raw ? JSON.parse(raw) : [];
}

export async function addToOutbox(item: Omit<OutboxItem, "id" | "createdAt">) {
  const outbox = await getOutbox();
  outbox.push({
    ...item,
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    createdAt: new Date().toISOString(),
  });
  await AsyncStorage.setItem(OUTBOX_KEY, JSON.stringify(outbox));
}

export async function removeFromOutbox(id: string) {
  const outbox = await getOutbox();
  await AsyncStorage.setItem(OUTBOX_KEY, JSON.stringify(outbox.filter((i) => i.id !== id)));
}

export async function processOutbox(
  handlers: {
    updateUnitVisit: (payload: Record<string, unknown>) => Promise<void>;
    updateSuiteVisit: (payload: Record<string, unknown>) => Promise<void>;
    uploadPhoto: (payload: Record<string, unknown>) => Promise<void>;
    createDeficiency: (payload: Record<string, unknown>) => Promise<void>;
    addSuite: (payload: Record<string, unknown>) => Promise<void>;
    addHvacUnit: (payload: Record<string, unknown>) => Promise<void>;
  }
) {
  const outbox = await getOutbox();
  for (const item of outbox) {
    try {
      if (item.type === "update_unit_visit") await handlers.updateUnitVisit(item.payload);
      if (item.type === "update_suite_visit") await handlers.updateSuiteVisit(item.payload);
      if (item.type === "upload_photo") await handlers.uploadPhoto(item.payload);
      if (item.type === "create_deficiency") await handlers.createDeficiency(item.payload);
      if (item.type === "add_suite") await handlers.addSuite(item.payload);
      if (item.type === "add_hvac_unit") await handlers.addHvacUnit(item.payload);
      await removeFromOutbox(item.id);
    } catch {
      break;
    }
  }
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

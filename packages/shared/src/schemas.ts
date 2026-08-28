import { z } from "zod";

export const buildingSchema = z.object({
  name: z.string().min(1, "Name is required"),
  address: z.string().min(1, "Address is required"),
  city: z.string().min(1, "City is required"),
  notes: z.string().optional(),
});

export const buildingContactSchema = z.object({
  name: z.string().min(1, "Name is required"),
  role: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
});

export const suiteSchema = z.object({
  suite_number: z.string().min(1, "Suite number is required"),
  floor: z.string().optional(),
  filter_size: z.string().optional(),
  filter_quantity: z.coerce.number().int().min(0).default(1),
  hvac_location_notes: z.string().optional(),
});

export const maintenanceSchema = z.object({
  building_id: z.string().uuid(),
  start_date: z.string().min(1),
  end_date: z.string().min(1),
  notes: z.string().optional(),
  technician_ids: z.array(z.string().uuid()).min(1, "Assign at least one technician"),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const wizardStepSchema = z.object({
  cleaned: z.boolean().optional(),
  filter_changed: z.boolean().optional(),
  operating_normally: z.boolean().optional(),
  notes: z.string().optional(),
});

export type BuildingInput = z.infer<typeof buildingSchema>;
export type BuildingContactInput = z.infer<typeof buildingContactSchema>;
export type SuiteInput = z.infer<typeof suiteSchema>;
export type MaintenanceInput = z.infer<typeof maintenanceSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type WizardStepInput = z.infer<typeof wizardStepSchema>;

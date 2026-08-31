import { z } from "zod";

export const buildingSchema = z.object({
  name: z.string().min(1, "Building name is required"),
  street_number: z.string().min(1, "Street number is required"),
  street: z.string().min(1, "Street is required"),
  city: z.string().min(1, "City is required"),
  postal_code: z.string().min(1, "Postal code is required"),
});

export const buildingContactSchema = z.object({
  name: z.string().min(1, "Name is required"),
  role: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
});

function inchField(message: string) {
  return z.coerce
    .number()
    .positive(message)
    .refine((n) => Math.abs(n * 10 - Math.round(n * 10)) < 1e-9, "Use at most 1 decimal place")
    .transform((n) => Math.round(n * 10) / 10);
}

export const filterSizeSchema = z.object({
  length_in: inchField("Length is required"),
  width_in: inchField("Width is required"),
  thickness_in: inchField("Thickness is required"),
});

export const suiteSchema = z.object({
  suite_number: z.string().min(1, "Suite number is required"),
  floor: z.string().optional(),
  filter_size: z.string().optional(),
  filter_quantity: z.coerce.number().int().min(0).default(1),
  hvac_location_notes: z.string().optional(),
});

export const suiteCreateSchema = z.object({
  suite_number: z.string().min(1, "Suite number is required"),
  floor: z.string().optional(),
  filter_size: z.string().min(1, "Filter size is required"),
});

export const suiteUnitDraftSchema = z.object({
  name: z.string().min(1, "Unit name is required"),
  filter_size: z.string().min(1, "Filter size is required"),
  location_notes: z.string().optional(),
});

export const technicianAddSuiteSchema = suiteCreateSchema;

export const hvacUnitSchema = z.object({
  name: z.string().min(1, "Unit name is required"),
  location_notes: z.string().optional(),
  filter_size: z.string().optional(),
  sort_order: z.coerce.number().int().min(0).optional(),
});

export const technicianAddHvacUnitSchema = hvacUnitSchema;

export const maintenanceSchema = z.object({
  building_id: z.string().uuid(),
  start_date: z.string().min(1),
  end_date: z.string().min(1),
  notes: z.string().optional(),
  technician_ids: z.array(z.string().uuid()).min(1, "Assign at least one technician"),
});

export const maintenanceUpdateSchema = z
  .object({
    start_date: z.string().min(1),
    end_date: z.string().min(1),
    notes: z.string().optional(),
    status: z.enum(["scheduled", "in_progress", "completed", "cancelled"]),
    technician_ids: z.array(z.string().uuid()).min(1, "Assign at least one technician"),
  })
  .refine((data) => data.end_date >= data.start_date, {
    message: "End date must be on or after start date",
    path: ["end_date"],
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
export type FilterSizeInput = z.infer<typeof filterSizeSchema>;
export type SuiteInput = z.infer<typeof suiteSchema>;
export type SuiteCreateInput = z.infer<typeof suiteCreateSchema>;
export type SuiteUnitDraftInput = z.infer<typeof suiteUnitDraftSchema>;
export type TechnicianAddSuiteInput = z.infer<typeof technicianAddSuiteSchema>;
export type HvacUnitInput = z.infer<typeof hvacUnitSchema>;
export type TechnicianAddHvacUnitInput = z.infer<typeof technicianAddHvacUnitSchema>;
export type MaintenanceInput = z.infer<typeof maintenanceSchema>;
export type MaintenanceUpdateInput = z.infer<typeof maintenanceUpdateSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type WizardStepInput = z.infer<typeof wizardStepSchema>;

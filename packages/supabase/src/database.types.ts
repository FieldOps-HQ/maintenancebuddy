export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string;
          role: "admin" | "technician";
          created_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name: string;
          role?: "admin" | "technician";
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string;
          role?: "admin" | "technician";
          created_at?: string;
        };
        Relationships: [];
      };
      buildings: {
        Row: {
          id: string;
          name: string;
          street_number: string;
          street: string;
          city: string;
          postal_code: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          street_number: string;
          street: string;
          city: string;
          postal_code: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          street_number?: string;
          street?: string;
          city?: string;
          postal_code?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      building_contacts: {
        Row: {
          id: string;
          building_id: string;
          name: string;
          role: string | null;
          phone: string | null;
          email: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          building_id: string;
          name: string;
          role?: string | null;
          phone?: string | null;
          email?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          building_id?: string;
          name?: string;
          role?: string | null;
          phone?: string | null;
          email?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "building_contacts_building_id_fkey";
            columns: ["building_id"];
            isOneToOne: false;
            referencedRelation: "buildings";
            referencedColumns: ["id"];
          },
        ];
      };
      filter_sizes: {
        Row: {
          id: string;
          length_in: number;
          width_in: number;
          thickness_in: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          length_in: number;
          width_in: number;
          thickness_in: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          length_in?: number;
          width_in?: number;
          thickness_in?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      suites: {
        Row: {
          id: string;
          building_id: string;
          suite_number: string;
          floor: string | null;
          filter_size: string | null;
          filter_quantity: number;
          hvac_location_notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          building_id: string;
          suite_number: string;
          floor?: string | null;
          filter_size?: string | null;
          filter_quantity?: number;
          hvac_location_notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          building_id?: string;
          suite_number?: string;
          floor?: string | null;
          filter_size?: string | null;
          filter_quantity?: number;
          hvac_location_notes?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "suites_building_id_fkey";
            columns: ["building_id"];
            isOneToOne: false;
            referencedRelation: "buildings";
            referencedColumns: ["id"];
          },
        ];
      };
      hvac_units: {
        Row: {
          id: string;
          suite_id: string;
          name: string;
          location_notes: string | null;
          filter_size: string | null;
          filter_quantity: number;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          suite_id: string;
          name: string;
          location_notes?: string | null;
          filter_size?: string | null;
          filter_quantity?: number;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          suite_id?: string;
          name?: string;
          location_notes?: string | null;
          filter_size?: string | null;
          filter_quantity?: number;
          sort_order?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "hvac_units_suite_id_fkey";
            columns: ["suite_id"];
            isOneToOne: false;
            referencedRelation: "suites";
            referencedColumns: ["id"];
          },
        ];
      };
      maintenances: {
        Row: {
          id: string;
          building_id: string;
          start_date: string;
          end_date: string;
          status: "scheduled" | "in_progress" | "completed" | "cancelled";
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          building_id: string;
          start_date: string;
          end_date: string;
          status?: "scheduled" | "in_progress" | "completed" | "cancelled";
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          building_id?: string;
          start_date?: string;
          end_date?: string;
          status?: "scheduled" | "in_progress" | "completed" | "cancelled";
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "maintenances_building_id_fkey";
            columns: ["building_id"];
            isOneToOne: false;
            referencedRelation: "buildings";
            referencedColumns: ["id"];
          },
        ];
      };
      maintenance_assignments: {
        Row: {
          id: string;
          maintenance_id: string;
          technician_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          maintenance_id: string;
          technician_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          maintenance_id?: string;
          technician_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "maintenance_assignments_maintenance_id_fkey";
            columns: ["maintenance_id"];
            isOneToOne: false;
            referencedRelation: "maintenances";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "maintenance_assignments_technician_id_fkey";
            columns: ["technician_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      suite_visits: {
        Row: {
          id: string;
          maintenance_id: string;
          suite_id: string;
          status: "pending" | "completed" | "blocked_unit" | "no_access" | "skipped" | "in_progress";
          visited_at: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          maintenance_id: string;
          suite_id: string;
          status?: "pending" | "completed" | "blocked_unit" | "no_access" | "skipped" | "in_progress";
          visited_at?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          maintenance_id?: string;
          suite_id?: string;
          status?: "pending" | "completed" | "blocked_unit" | "no_access" | "skipped" | "in_progress";
          visited_at?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "suite_visits_maintenance_id_fkey";
            columns: ["maintenance_id"];
            isOneToOne: false;
            referencedRelation: "maintenances";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "suite_visits_suite_id_fkey";
            columns: ["suite_id"];
            isOneToOne: false;
            referencedRelation: "suites";
            referencedColumns: ["id"];
          },
        ];
      };
      hvac_unit_visits: {
        Row: {
          id: string;
          suite_visit_id: string;
          hvac_unit_id: string;
          status: "pending" | "completed" | "blocked_unit" | "no_access" | "skipped" | "in_progress";
          cleaned: boolean | null;
          filter_changed: boolean | null;
          operating_normally: boolean | null;
          visited_at: string | null;
          visited_by: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          suite_visit_id: string;
          hvac_unit_id: string;
          status?: "pending" | "completed" | "blocked_unit" | "no_access" | "skipped" | "in_progress";
          cleaned?: boolean | null;
          filter_changed?: boolean | null;
          operating_normally?: boolean | null;
          visited_at?: string | null;
          visited_by?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          suite_visit_id?: string;
          hvac_unit_id?: string;
          status?: "pending" | "completed" | "blocked_unit" | "no_access" | "skipped" | "in_progress";
          cleaned?: boolean | null;
          filter_changed?: boolean | null;
          operating_normally?: boolean | null;
          visited_at?: string | null;
          visited_by?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "hvac_unit_visits_suite_visit_id_fkey";
            columns: ["suite_visit_id"];
            isOneToOne: false;
            referencedRelation: "suite_visits";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "hvac_unit_visits_hvac_unit_id_fkey";
            columns: ["hvac_unit_id"];
            isOneToOne: false;
            referencedRelation: "hvac_units";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "hvac_unit_visits_visited_by_fkey";
            columns: ["visited_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      deficiencies: {
        Row: {
          id: string;
          hvac_unit_visit_id: string;
          category: "not_cleaned" | "filter_not_changed" | "not_operating" | "other";
          description: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          hvac_unit_visit_id: string;
          category: "not_cleaned" | "filter_not_changed" | "not_operating" | "other";
          description: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          hvac_unit_visit_id?: string;
          category?: "not_cleaned" | "filter_not_changed" | "not_operating" | "other";
          description?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "deficiencies_hvac_unit_visit_id_fkey";
            columns: ["hvac_unit_visit_id"];
            isOneToOne: false;
            referencedRelation: "hvac_unit_visits";
            referencedColumns: ["id"];
          },
        ];
      };
      visit_photos: {
        Row: {
          id: string;
          hvac_unit_visit_id: string;
          storage_path: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          hvac_unit_visit_id: string;
          storage_path: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          hvac_unit_visit_id?: string;
          storage_path?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "visit_photos_hvac_unit_visit_id_fkey";
            columns: ["hvac_unit_visit_id"];
            isOneToOne: false;
            referencedRelation: "hvac_unit_visits";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      maintenance_filter_summary: {
        Row: {
          maintenance_id: string;
          filter_size: string;
          total_quantity: number;
        };
        Relationships: [];
      };
    };
    Functions: {
      is_admin: { Args: Record<string, never>; Returns: boolean };
      is_assigned_technician: { Args: { p_maintenance_id: string }; Returns: boolean };
    };
    Enums: {
      user_role: "admin" | "technician";
      maintenance_status: "scheduled" | "in_progress" | "completed" | "cancelled";
      suite_visit_status: "pending" | "completed" | "blocked_unit" | "no_access" | "skipped" | "in_progress";
      deficiency_category: "not_cleaned" | "filter_not_changed" | "not_operating" | "other";
    };
    CompositeTypes: Record<string, never>;
  };
};

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      activity_codes: {
        Row: {
          activity_code: string
          activity_id: string
          created_at: string | null
          description: string
          is_active: boolean | null
        }
        Insert: {
          activity_code: string
          activity_id?: string
          created_at?: string | null
          description: string
          is_active?: boolean | null
        }
        Update: {
          activity_code?: string
          activity_id?: string
          created_at?: string | null
          description?: string
          is_active?: boolean | null
        }
        Relationships: []
      }
      categories: {
        Row: {
          can_approve_timesheets: boolean | null
          can_approve_wo: boolean | null
          category_id: string
          category_name: string
          created_at: string | null
          display_order: number | null
          rate_high_bob: number
          rate_high_usd: number
          rate_low_bob: number
          rate_low_usd: number
          updated_at: string | null
        }
        Insert: {
          can_approve_timesheets?: boolean | null
          can_approve_wo?: boolean | null
          category_id?: string
          category_name: string
          created_at?: string | null
          display_order?: number | null
          rate_high_bob?: number
          rate_high_usd?: number
          rate_low_bob?: number
          rate_low_usd?: number
          updated_at?: string | null
        }
        Update: {
          can_approve_timesheets?: boolean | null
          can_approve_wo?: boolean | null
          category_id?: string
          category_name?: string
          created_at?: string | null
          display_order?: number | null
          rate_high_bob?: number
          rate_high_usd?: number
          rate_low_bob?: number
          rate_low_usd?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      clients: {
        Row: {
          address: string | null
          client_id: string
          client_legal_name: string
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string | null
          industry_id: string | null
          is_active: boolean | null
          unique_tax_id: string
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          client_id?: string
          client_legal_name: string
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string | null
          industry_id?: string | null
          is_active?: boolean | null
          unique_tax_id: string
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          client_id?: string
          client_legal_name?: string
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string | null
          industry_id?: string | null
          is_active?: boolean | null
          unique_tax_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_industry_id_fkey"
            columns: ["industry_id"]
            isOneToOne: false
            referencedRelation: "industries"
            referencedColumns: ["industry_id"]
          },
        ]
      }
      engagements: {
        Row: {
          client_id: string
          created_at: string | null
          end_date: string | null
          engagement_code: string | null
          engagement_id: string
          engagement_name: string
          manager_id: string | null
          partner_id: string | null
          start_date: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          client_id: string
          created_at?: string | null
          end_date?: string | null
          engagement_code?: string | null
          engagement_id?: string
          engagement_name: string
          manager_id?: string | null
          partner_id?: string | null
          start_date?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string | null
          end_date?: string | null
          engagement_code?: string | null
          engagement_id?: string
          engagement_name?: string
          manager_id?: string | null
          partner_id?: string | null
          start_date?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "engagements_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "engagements_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "engagements_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["staff_id"]
          },
        ]
      }
      expense_logs: {
        Row: {
          amount: number
          created_at: string | null
          currency: string | null
          date_incurred: string
          description: string | null
          engagement_id: string
          expense_log_id: string
          expense_type_id: string
          receipt_url: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          currency?: string | null
          date_incurred: string
          description?: string | null
          engagement_id: string
          expense_log_id?: string
          expense_type_id: string
          receipt_url?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          currency?: string | null
          date_incurred?: string
          description?: string | null
          engagement_id?: string
          expense_log_id?: string
          expense_type_id?: string
          receipt_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expense_logs_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "engagements"
            referencedColumns: ["engagement_id"]
          },
          {
            foreignKeyName: "expense_logs_expense_type_id_fkey"
            columns: ["expense_type_id"]
            isOneToOne: false
            referencedRelation: "expense_types"
            referencedColumns: ["expense_type_id"]
          },
        ]
      }
      expense_types: {
        Row: {
          created_at: string | null
          default_unit_cost: number | null
          expense_name: string
          expense_type_id: string
        }
        Insert: {
          created_at?: string | null
          default_unit_cost?: number | null
          expense_name: string
          expense_type_id?: string
        }
        Update: {
          created_at?: string | null
          default_unit_cost?: number | null
          expense_name?: string
          expense_type_id?: string
        }
        Relationships: []
      }
      global_settings: {
        Row: {
          created_at: string | null
          description: string | null
          setting_key: string
          setting_value: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          setting_key: string
          setting_value: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          setting_key?: string
          setting_value?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      industries: {
        Row: {
          created_at: string | null
          fiscal_year_end: string
          industry_id: string
          industry_name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          fiscal_year_end: string
          industry_id?: string
          industry_name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          fiscal_year_end?: string
          industry_id?: string
          industry_name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      staff: {
        Row: {
          aud_reg_number: string | null
          auth_user_id: string | null
          category_id: string | null
          city: string | null
          created_at: string | null
          email: string | null
          first_name: string
          id_number: string | null
          initials: string | null
          is_active: boolean | null
          last_name: string
          short_name: string | null
          staff_id: string
          supervisor_id: string | null
          updated_at: string | null
        }
        Insert: {
          aud_reg_number?: string | null
          auth_user_id?: string | null
          category_id?: string | null
          city?: string | null
          created_at?: string | null
          email?: string | null
          first_name: string
          id_number?: string | null
          initials?: string | null
          is_active?: boolean | null
          last_name: string
          short_name?: string | null
          staff_id?: string
          supervisor_id?: string | null
          updated_at?: string | null
        }
        Update: {
          aud_reg_number?: string | null
          auth_user_id?: string | null
          category_id?: string | null
          city?: string | null
          created_at?: string | null
          email?: string | null
          first_name?: string
          id_number?: string | null
          initials?: string | null
          is_active?: boolean | null
          last_name?: string
          short_name?: string | null
          staff_id?: string
          supervisor_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "staff_supervisor_id_fkey"
            columns: ["supervisor_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["staff_id"]
          },
        ]
      }
      time_entries: {
        Row: {
          activity_id: string
          created_at: string | null
          date_worked: string
          description: string | null
          engagement_id: string
          hours_logged: number
          is_forecast: boolean | null
          period_id: string | null
          staff_id: string
          time_id: string
          updated_at: string | null
        }
        Insert: {
          activity_id: string
          created_at?: string | null
          date_worked: string
          description?: string | null
          engagement_id: string
          hours_logged: number
          is_forecast?: boolean | null
          period_id?: string | null
          staff_id: string
          time_id?: string
          updated_at?: string | null
        }
        Update: {
          activity_id?: string
          created_at?: string | null
          date_worked?: string
          description?: string | null
          engagement_id?: string
          hours_logged?: number
          is_forecast?: boolean | null
          period_id?: string | null
          staff_id?: string
          time_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activity_codes"
            referencedColumns: ["activity_id"]
          },
          {
            foreignKeyName: "time_entries_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "engagements"
            referencedColumns: ["engagement_id"]
          },
          {
            foreignKeyName: "time_entries_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "timesheet_periods"
            referencedColumns: ["period_id"]
          },
          {
            foreignKeyName: "time_entries_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["staff_id"]
          },
        ]
      }
      timesheet_periods: {
        Row: {
          created_at: string | null
          deadline: string | null
          is_period_locked: boolean | null
          period_id: string
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          staff_id: string
          status: string
          submitted_at: string | null
          total_hours: number | null
          updated_at: string | null
          week_number: number
          week_start_date: string
          year: number
        }
        Insert: {
          created_at?: string | null
          deadline?: string | null
          is_period_locked?: boolean | null
          period_id?: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          staff_id: string
          status?: string
          submitted_at?: string | null
          total_hours?: number | null
          updated_at?: string | null
          week_number: number
          week_start_date: string
          year: number
        }
        Update: {
          created_at?: string | null
          deadline?: string | null
          is_period_locked?: boolean | null
          period_id?: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          staff_id?: string
          status?: string
          submitted_at?: string | null
          total_hours?: number | null
          updated_at?: string | null
          week_number?: number
          week_start_date?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "timesheet_periods_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "timesheet_periods_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["staff_id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      wo_budget_lines: {
        Row: {
          budgeted_hours: number
          category_id: string
          created_at: string | null
          standard_rate: number
          wo_id: string
          wo_line_id: string
        }
        Insert: {
          budgeted_hours?: number
          category_id: string
          created_at?: string | null
          standard_rate: number
          wo_id: string
          wo_line_id?: string
        }
        Update: {
          budgeted_hours?: number
          category_id?: string
          created_at?: string | null
          standard_rate?: number
          wo_id?: string
          wo_line_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wo_budget_lines_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "wo_budget_lines_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "work_order_summary"
            referencedColumns: ["wo_id"]
          },
          {
            foreignKeyName: "wo_budget_lines_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["wo_id"]
          },
        ]
      }
      wo_expense_budget: {
        Row: {
          budgeted_amount: number
          created_at: string | null
          expense_type_id: string
          wo_exp_id: string
          wo_id: string
        }
        Insert: {
          budgeted_amount?: number
          created_at?: string | null
          expense_type_id: string
          wo_exp_id?: string
          wo_id: string
        }
        Update: {
          budgeted_amount?: number
          created_at?: string | null
          expense_type_id?: string
          wo_exp_id?: string
          wo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wo_expense_budget_expense_type_id_fkey"
            columns: ["expense_type_id"]
            isOneToOne: false
            referencedRelation: "expense_types"
            referencedColumns: ["expense_type_id"]
          },
          {
            foreignKeyName: "wo_expense_budget_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "work_order_summary"
            referencedColumns: ["wo_id"]
          },
          {
            foreignKeyName: "wo_expense_budget_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["wo_id"]
          },
        ]
      }
      work_orders: {
        Row: {
          adjustment_amount: number | null
          approval_status: string | null
          approved_at: string | null
          approved_by: string | null
          created_at: string | null
          currency: string
          engagement_id: string
          notes: string | null
          season_mode: string
          tax_rate: number | null
          updated_at: string | null
          wo_id: string
        }
        Insert: {
          adjustment_amount?: number | null
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          currency: string
          engagement_id: string
          notes?: string | null
          season_mode: string
          tax_rate?: number | null
          updated_at?: string | null
          wo_id?: string
        }
        Update: {
          adjustment_amount?: number | null
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          currency?: string
          engagement_id?: string
          notes?: string | null
          season_mode?: string
          tax_rate?: number | null
          updated_at?: string | null
          wo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_orders_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "work_orders_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: true
            referencedRelation: "engagements"
            referencedColumns: ["engagement_id"]
          },
        ]
      }
    }
    Views: {
      work_order_summary: {
        Row: {
          adjustment_amount: number | null
          approval_status: string | null
          approved_at: string | null
          approved_by: string | null
          created_at: string | null
          currency: string | null
          engagement_id: string | null
          fee_with_tax_gross_up: number | null
          notes: string | null
          realization_percent: number | null
          season_mode: string | null
          tax_rate: number | null
          total_standard_fee: number | null
          updated_at: string | null
          wo_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_orders_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "work_orders_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: true
            referencedRelation: "engagements"
            referencedColumns: ["engagement_id"]
          },
        ]
      }
    }
    Functions: {
      can_approve_timesheet: {
        Args: { p_approver_auth_id: string; p_period_id: string }
        Returns: boolean
      }
      get_timesheet_approvers: {
        Args: { p_staff_id: string; p_week_start: string }
        Returns: {
          approver_staff_id: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_auto_approved_category: {
        Args: { p_staff_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "staff" | "viewer"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "staff", "viewer"],
    },
  },
} as const

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
          default_category_id: string | null
          description: string
          is_active: boolean | null
        }
        Insert: {
          activity_code: string
          activity_id?: string
          created_at?: string | null
          default_category_id?: string | null
          description: string
          is_active?: boolean | null
        }
        Update: {
          activity_code?: string
          activity_id?: string
          created_at?: string | null
          default_category_id?: string | null
          description?: string
          is_active?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_codes_default_category_id_fkey"
            columns: ["default_category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["category_id"]
          },
        ]
      }
      activity_worksheet_cells: {
        Row: {
          activity_id: string
          budget_hours: number
          category_id: string
          created_at: string
          id: string
          updated_at: string
          worksheet_id: string
        }
        Insert: {
          activity_id: string
          budget_hours?: number
          category_id: string
          created_at?: string
          id?: string
          updated_at?: string
          worksheet_id: string
        }
        Update: {
          activity_id?: string
          budget_hours?: number
          category_id?: string
          created_at?: string
          id?: string
          updated_at?: string
          worksheet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_worksheet_cells_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activity_codes"
            referencedColumns: ["activity_id"]
          },
          {
            foreignKeyName: "activity_worksheet_cells_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "activity_worksheet_cells_worksheet_id_fkey"
            columns: ["worksheet_id"]
            isOneToOne: false
            referencedRelation: "activity_worksheets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_worksheet_cells_worksheet_id_fkey"
            columns: ["worksheet_id"]
            isOneToOne: false
            referencedRelation: "vw_wo_budget_hours_by_category_activity"
            referencedColumns: ["worksheet_id"]
          },
        ]
      }
      activity_worksheets: {
        Row: {
          created_at: string
          created_by_staff_id: string | null
          engagement_id: string
          id: string
          notes: string | null
          status: string
          updated_at: string
          version: number
          wo_id: string | null
        }
        Insert: {
          created_at?: string
          created_by_staff_id?: string | null
          engagement_id: string
          id?: string
          notes?: string | null
          status?: string
          updated_at?: string
          version?: number
          wo_id?: string | null
        }
        Update: {
          created_at?: string
          created_by_staff_id?: string | null
          engagement_id?: string
          id?: string
          notes?: string | null
          status?: string
          updated_at?: string
          version?: number
          wo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_worksheets_created_by_staff_id_fkey"
            columns: ["created_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "activity_worksheets_created_by_staff_id_fkey"
            columns: ["created_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "activity_worksheets_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "engagements"
            referencedColumns: ["engagement_id"]
          },
          {
            foreignKeyName: "activity_worksheets_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "vw_wo_budget_hours_by_category"
            referencedColumns: ["wo_id"]
          },
          {
            foreignKeyName: "activity_worksheets_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "vw_wo_budget_hours_by_category_activity"
            referencedColumns: ["wo_id"]
          },
          {
            foreignKeyName: "activity_worksheets_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "work_order_summary"
            referencedColumns: ["wo_id"]
          },
          {
            foreignKeyName: "activity_worksheets_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["wo_id"]
          },
        ]
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
          activity_required: boolean
          client_id: string
          created_at: string | null
          end_date: string | null
          engagement_code: string | null
          engagement_id: string
          engagement_name: string
          is_internal: boolean
          manager_id: string | null
          partner_id: string | null
          start_date: string | null
          status: string | null
          updated_at: string | null
          work_order_required: boolean
        }
        Insert: {
          activity_required?: boolean
          client_id: string
          created_at?: string | null
          end_date?: string | null
          engagement_code?: string | null
          engagement_id?: string
          engagement_name: string
          is_internal?: boolean
          manager_id?: string | null
          partner_id?: string | null
          start_date?: string | null
          status?: string | null
          updated_at?: string | null
          work_order_required?: boolean
        }
        Update: {
          activity_required?: boolean
          client_id?: string
          created_at?: string | null
          end_date?: string | null
          engagement_code?: string | null
          engagement_id?: string
          engagement_name?: string
          is_internal?: boolean
          manager_id?: string | null
          partner_id?: string | null
          start_date?: string | null
          status?: string | null
          updated_at?: string | null
          work_order_required?: boolean
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
            foreignKeyName: "engagements_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_directory"
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
            foreignKeyName: "engagements_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "engagements_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "engagements_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["staff_id"]
          },
        ]
      }
      expense_logs: {
        Row: {
          amount: number
          created_at: string | null
          created_by_staff_id: string | null
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
          created_by_staff_id?: string | null
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
          created_by_staff_id?: string | null
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
            foreignKeyName: "expense_logs_created_by_staff_id_fkey"
            columns: ["created_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "expense_logs_created_by_staff_id_fkey"
            columns: ["created_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["staff_id"]
          },
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
      holidays: {
        Row: {
          created_at: string | null
          created_by: string
          holiday_date: string
          holiday_id: string
          holiday_name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by: string
          holiday_date: string
          holiday_id?: string
          holiday_name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string
          holiday_date?: string
          holiday_id?: string
          holiday_name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "holidays_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "holidays_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["staff_id"]
          },
        ]
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
          deleted_at: string | null
          email: string | null
          first_name: string
          hire_date: string | null
          id_number: string | null
          initials: string | null
          is_active: boolean | null
          last_name: string
          short_name: string | null
          staff_id: string
          updated_at: string | null
          weekly_capacity_hours: number
        }
        Insert: {
          aud_reg_number?: string | null
          auth_user_id?: string | null
          category_id?: string | null
          city?: string | null
          created_at?: string | null
          deleted_at?: string | null
          email?: string | null
          first_name: string
          hire_date?: string | null
          id_number?: string | null
          initials?: string | null
          is_active?: boolean | null
          last_name: string
          short_name?: string | null
          staff_id?: string
          updated_at?: string | null
          weekly_capacity_hours?: number
        }
        Update: {
          aud_reg_number?: string | null
          auth_user_id?: string | null
          category_id?: string | null
          city?: string | null
          created_at?: string | null
          deleted_at?: string | null
          email?: string | null
          first_name?: string
          hire_date?: string | null
          id_number?: string | null
          initials?: string | null
          is_active?: boolean | null
          last_name?: string
          short_name?: string | null
          staff_id?: string
          updated_at?: string | null
          weekly_capacity_hours?: number
        }
        Relationships: [
          {
            foreignKeyName: "staff_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["category_id"]
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
          {
            foreignKeyName: "time_entries_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["staff_id"]
          },
        ]
      }
      timer_entries: {
        Row: {
          activity_id: string
          created_at: string
          description: string | null
          duration_minutes: number | null
          ended_at: string | null
          engagement_id: string
          imported_to_time_id: string | null
          is_imported: boolean
          staff_id: string
          started_at: string
          timer_id: string
        }
        Insert: {
          activity_id: string
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          ended_at?: string | null
          engagement_id: string
          imported_to_time_id?: string | null
          is_imported?: boolean
          staff_id: string
          started_at: string
          timer_id?: string
        }
        Update: {
          activity_id?: string
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          ended_at?: string | null
          engagement_id?: string
          imported_to_time_id?: string | null
          is_imported?: boolean
          staff_id?: string
          started_at?: string
          timer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "timer_entries_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activity_codes"
            referencedColumns: ["activity_id"]
          },
          {
            foreignKeyName: "timer_entries_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "engagements"
            referencedColumns: ["engagement_id"]
          },
          {
            foreignKeyName: "timer_entries_imported_to_time_id_fkey"
            columns: ["imported_to_time_id"]
            isOneToOne: false
            referencedRelation: "time_entries"
            referencedColumns: ["time_id"]
          },
          {
            foreignKeyName: "timer_entries_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "timer_entries_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["staff_id"]
          },
        ]
      }
      timesheet_line_approvals: {
        Row: {
          approval_id: string
          approved_at: string | null
          approved_by: string | null
          created_at: string | null
          engagement_id: string
          period_id: string
          review_notes: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          approval_id?: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          engagement_id: string
          period_id: string
          review_notes?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          approval_id?: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          engagement_id?: string
          period_id?: string
          review_notes?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "timesheet_line_approvals_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "timesheet_line_approvals_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "timesheet_line_approvals_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "engagements"
            referencedColumns: ["engagement_id"]
          },
          {
            foreignKeyName: "timesheet_line_approvals_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "timesheet_periods"
            referencedColumns: ["period_id"]
          },
        ]
      }
      timesheet_periods: {
        Row: {
          created_at: string | null
          deadline: string | null
          is_period_locked: boolean | null
          period_id: string
          staff_id: string
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
          staff_id: string
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
          staff_id?: string
          submitted_at?: string | null
          total_hours?: number | null
          updated_at?: string | null
          week_number?: number
          week_start_date?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "timesheet_periods_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "timesheet_periods_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_directory"
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
            referencedRelation: "vw_wo_budget_hours_by_category"
            referencedColumns: ["wo_id"]
          },
          {
            foreignKeyName: "wo_budget_lines_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "vw_wo_budget_hours_by_category_activity"
            referencedColumns: ["wo_id"]
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
            referencedRelation: "vw_wo_budget_hours_by_category"
            referencedColumns: ["wo_id"]
          },
          {
            foreignKeyName: "wo_expense_budget_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "vw_wo_budget_hours_by_category_activity"
            referencedColumns: ["wo_id"]
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
          ceac_completed_at: string | null
          ceac_notes: string | null
          created_at: string | null
          currency: string
          engagement_id: string
          notes: string | null
          san_completed_at: string | null
          san_notes: string | null
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
          ceac_completed_at?: string | null
          ceac_notes?: string | null
          created_at?: string | null
          currency: string
          engagement_id: string
          notes?: string | null
          san_completed_at?: string | null
          san_notes?: string | null
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
          ceac_completed_at?: string | null
          ceac_notes?: string | null
          created_at?: string | null
          currency?: string
          engagement_id?: string
          notes?: string | null
          san_completed_at?: string | null
          san_notes?: string | null
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
            foreignKeyName: "work_orders_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "staff_directory"
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
      clients_directory: {
        Row: {
          address: string | null
          client_id: string | null
          client_legal_name: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string | null
          industry_id: string | null
          is_active: boolean | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          client_id?: string | null
          client_legal_name?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string | null
          industry_id?: string | null
          is_active?: boolean | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          client_id?: string | null
          client_legal_name?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string | null
          industry_id?: string | null
          is_active?: boolean | null
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
      staff_directory: {
        Row: {
          category_id: string | null
          city: string | null
          created_at: string | null
          first_name: string | null
          initials: string | null
          is_active: boolean | null
          last_name: string | null
          short_name: string | null
          staff_id: string | null
          updated_at: string | null
        }
        Insert: {
          category_id?: string | null
          city?: string | null
          created_at?: string | null
          first_name?: string | null
          initials?: string | null
          is_active?: boolean | null
          last_name?: string | null
          short_name?: string | null
          staff_id?: string | null
          updated_at?: string | null
        }
        Update: {
          category_id?: string | null
          city?: string | null
          created_at?: string | null
          first_name?: string | null
          initials?: string | null
          is_active?: boolean | null
          last_name?: string | null
          short_name?: string | null
          staff_id?: string | null
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
        ]
      }
      vw_actual_hours_by_category_activity: {
        Row: {
          activity_code: string | null
          activity_description: string | null
          activity_id: string | null
          actual_hours: number | null
          category_display_order: number | null
          category_id: string | null
          category_name: string | null
          engagement_id: string | null
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
        ]
      }
      vw_budget_vs_actual_hours_by_category_activity: {
        Row: {
          activity_code: string | null
          activity_description: string | null
          activity_id: string | null
          actual_hours: number | null
          budget_hours: number | null
          category_display_order: number | null
          category_id: string | null
          category_name: string | null
          engagement_id: string | null
          variance_hours: number | null
          wo_id: string | null
        }
        Relationships: []
      }
      vw_wo_budget_hours_by_category: {
        Row: {
          category_display_order: number | null
          category_id: string | null
          category_name: string | null
          engagement_id: string | null
          total_budget_hours: number | null
          wo_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_worksheet_cells_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["category_id"]
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
      vw_wo_budget_hours_by_category_activity: {
        Row: {
          activity_code: string | null
          activity_description: string | null
          activity_id: string | null
          budget_hours: number | null
          category_display_order: number | null
          category_id: string | null
          category_name: string | null
          engagement_id: string | null
          wo_id: string | null
          worksheet_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_worksheet_cells_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activity_codes"
            referencedColumns: ["activity_id"]
          },
          {
            foreignKeyName: "activity_worksheet_cells_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["category_id"]
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
            foreignKeyName: "work_orders_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "staff_directory"
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
      assign_user_role_atomic: { Args: { p_user_id: string }; Returns: Json }
      can_approve_timesheet: {
        Args: { p_approver_auth_id: string; p_period_id: string }
        Returns: boolean
      }
      can_approve_timesheet_line: {
        Args: {
          p_approver_auth_id: string
          p_engagement_id: string
          p_period_id: string
        }
        Returns: boolean
      }
      finalize_all_stale_timers: { Args: never; Returns: number }
      finalize_my_stale_timers: { Args: never; Returns: number }
      get_all_user_roles: {
        Args: never
        Returns: {
          created_at: string
          email: string
          role: Database["public"]["Enums"]["app_role"]
          role_id: string
          staff_name: string
          user_id: string
        }[]
      }
      get_approvable_pairs: {
        Args: { p_engagement_ids: string[]; p_period_ids: string[] }
        Returns: {
          engagement_id: string
          period_id: string
        }[]
      }
      get_line_approver: {
        Args: { p_engagement_id: string; p_staff_id: string }
        Returns: string
      }
      get_my_staff_id: { Args: never; Returns: string }
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
      is_admin: { Args: never; Returns: boolean }
      is_auto_approved_category: {
        Args: { p_staff_id: string }
        Returns: boolean
      }
      is_engagement_team_member: {
        Args: { p_engagement_id: string }
        Returns: boolean
      }
      start_timer_entry: {
        Args: {
          p_activity_id: string
          p_description?: string
          p_engagement_id: string
        }
        Returns: string
      }
      stop_timer_entry: {
        Args: { p_ended_at?: string; p_timer_id: string }
        Returns: {
          duration_minutes: number
          timer_id: string
        }[]
      }
      sync_worksheet_to_wo_budget: {
        Args: { p_wo_id: string; p_worksheet_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "staff"
        | "viewer"
        | "partner"
        | "director"
        | "manager"
        | "senior"
        | "semisenior"
        | "sqr"
        | "specialist_it"
        | "specialist_tax"
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
      app_role: [
        "admin",
        "staff",
        "viewer",
        "partner",
        "director",
        "manager",
        "senior",
        "semisenior",
        "sqr",
        "specialist_it",
        "specialist_tax",
      ],
    },
  },
} as const

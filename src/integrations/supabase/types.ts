export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
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
          entity_type: string
          is_active: boolean | null
          is_system: boolean
          practica_id: string | null
        }
        Insert: {
          activity_code: string
          activity_id?: string
          created_at?: string | null
          default_category_id?: string | null
          description: string
          entity_type?: string
          is_active?: boolean | null
          is_system?: boolean
          practica_id?: string | null
        }
        Update: {
          activity_code?: string
          activity_id?: string
          created_at?: string | null
          default_category_id?: string | null
          description?: string
          entity_type?: string
          is_active?: boolean | null
          is_system?: boolean
          practica_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_codes_default_category_id_fkey"
            columns: ["default_category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "activity_codes_practica_id_fkey"
            columns: ["practica_id"]
            isOneToOne: false
            referencedRelation: "practicas"
            referencedColumns: ["practica_id"]
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
            referencedRelation: "fund_request_selectable_work_orders"
            referencedColumns: ["manager_staff_id"]
          },
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
            foreignKeyName: "activity_worksheets_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "fund_request_selectable_work_orders"
            referencedColumns: ["engagement_id"]
          },
          {
            foreignKeyName: "activity_worksheets_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "fund_request_selectable_work_orders"
            referencedColumns: ["wo_id"]
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
      auth_login_attempts: {
        Row: {
          attempts_count: number
          email_normalized: string
          last_attempt_at: string
          locked_until: string | null
        }
        Insert: {
          attempts_count?: number
          email_normalized: string
          last_attempt_at?: string
          locked_until?: string | null
        }
        Update: {
          attempts_count?: number
          email_normalized?: string
          last_attempt_at?: string
          locked_until?: string | null
        }
        Relationships: []
      }
      authorization_permissions: {
        Row: {
          action_key: string
          created_at: string
          description: string | null
          display_order: number
          is_sensitive: boolean
          label_key: string
          module_key: string
          permission_key: string
          updated_at: string
        }
        Insert: {
          action_key: string
          created_at?: string
          description?: string | null
          display_order?: number
          is_sensitive?: boolean
          label_key: string
          module_key: string
          permission_key: string
          updated_at?: string
        }
        Update: {
          action_key?: string
          created_at?: string
          description?: string | null
          display_order?: number
          is_sensitive?: boolean
          label_key?: string
          module_key?: string
          permission_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      authorization_role_permissions: {
        Row: {
          created_at: string
          permission_key: string
          role_key: string
          scope_key: string
        }
        Insert: {
          created_at?: string
          permission_key: string
          role_key: string
          scope_key?: string
        }
        Update: {
          created_at?: string
          permission_key?: string
          role_key?: string
          scope_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "authorization_role_permissions_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "authorization_permissions"
            referencedColumns: ["permission_key"]
          },
          {
            foreignKeyName: "authorization_role_permissions_role_key_fkey"
            columns: ["role_key"]
            isOneToOne: false
            referencedRelation: "authorization_roles"
            referencedColumns: ["role_key"]
          },
        ]
      }
      authorization_roles: {
        Row: {
          created_at: string
          description: string | null
          display_order: number
          is_active: boolean
          is_system: boolean
          label_key: string
          legacy_app_role: Database["public"]["Enums"]["app_role"] | null
          role_key: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number
          is_active?: boolean
          is_system?: boolean
          label_key: string
          legacy_app_role?: Database["public"]["Enums"]["app_role"] | null
          role_key: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number
          is_active?: boolean
          is_system?: boolean
          label_key?: string
          legacy_app_role?: Database["public"]["Enums"]["app_role"] | null
          role_key?: string
          updated_at?: string
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
          default_app_role: Database["public"]["Enums"]["app_role"] | null
          display_order: number | null
          practica_id: string
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
          default_app_role?: Database["public"]["Enums"]["app_role"] | null
          display_order?: number | null
          practica_id: string
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
          default_app_role?: Database["public"]["Enums"]["app_role"] | null
          display_order?: number | null
          practica_id?: string
          rate_high_bob?: number
          rate_high_usd?: number
          rate_low_bob?: number
          rate_low_usd?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "categories_practica_id_fkey"
            columns: ["practica_id"]
            isOneToOne: false
            referencedRelation: "practicas"
            referencedColumns: ["practica_id"]
          },
        ]
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
          created_by_staff_id: string | null
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
          created_by_staff_id?: string | null
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
          created_by_staff_id?: string | null
          industry_id?: string | null
          is_active?: boolean | null
          unique_tax_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_created_by_staff_id_fkey"
            columns: ["created_by_staff_id"]
            isOneToOne: false
            referencedRelation: "fund_request_selectable_work_orders"
            referencedColumns: ["manager_staff_id"]
          },
          {
            foreignKeyName: "clients_created_by_staff_id_fkey"
            columns: ["created_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "clients_created_by_staff_id_fkey"
            columns: ["created_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "clients_industry_id_fkey"
            columns: ["industry_id"]
            isOneToOne: false
            referencedRelation: "industries"
            referencedColumns: ["industry_id"]
          },
        ]
      }
      engagement_assignments: {
        Row: {
          allocation_percent: number
          assignment_id: string
          category_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          end_date: string
          engagement_id: string
          hours_per_week: number
          notes: string | null
          requirement_id: string | null
          staff_id: string
          start_date: string
          status: string
          updated_at: string
        }
        Insert: {
          allocation_percent?: number
          assignment_id?: string
          category_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          end_date: string
          engagement_id: string
          hours_per_week?: number
          notes?: string | null
          requirement_id?: string | null
          staff_id: string
          start_date: string
          status?: string
          updated_at?: string
        }
        Update: {
          allocation_percent?: number
          assignment_id?: string
          category_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          end_date?: string
          engagement_id?: string
          hours_per_week?: number
          notes?: string | null
          requirement_id?: string | null
          staff_id?: string
          start_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "engagement_assignments_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "engagement_assignments_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "engagements"
            referencedColumns: ["engagement_id"]
          },
          {
            foreignKeyName: "engagement_assignments_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "fund_request_selectable_work_orders"
            referencedColumns: ["engagement_id"]
          },
          {
            foreignKeyName: "engagement_assignments_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "fund_request_selectable_work_orders"
            referencedColumns: ["manager_staff_id"]
          },
          {
            foreignKeyName: "engagement_assignments_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "engagement_assignments_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["staff_id"]
          },
        ]
      }
      engagements: {
        Row: {
          activity_required: boolean
          anio_fiscal: number | null
          anio_fiscal_override: boolean
          approval_required: boolean
          client_id: string
          contract_file_path: string | null
          created_at: string | null
          created_by_staff_id: string | null
          encargado_id: string | null
          end_date: string | null
          engagement_code: string | null
          engagement_id: string
          engagement_name: string
          engagement_state_override: number | null
          fecha_cierre: string
          funcion: number | null
          is_internal: boolean
          manager_id: string | null
          oficina: number | null
          partner_id: string | null
          practica: number | null
          society_id: string | null
          specialist_it_id: string | null
          specialist_tax_id: string | null
          sqr_id: string | null
          start_date: string | null
          status: string | null
          taxonomy_id: string | null
          updated_at: string | null
          work_order_required: boolean
        }
        Insert: {
          activity_required?: boolean
          anio_fiscal?: number | null
          anio_fiscal_override?: boolean
          approval_required?: boolean
          client_id: string
          contract_file_path?: string | null
          created_at?: string | null
          created_by_staff_id?: string | null
          encargado_id?: string | null
          end_date?: string | null
          engagement_code?: string | null
          engagement_id?: string
          engagement_name: string
          engagement_state_override?: number | null
          fecha_cierre: string
          funcion?: number | null
          is_internal?: boolean
          manager_id?: string | null
          oficina?: number | null
          partner_id?: string | null
          practica?: number | null
          society_id?: string | null
          specialist_it_id?: string | null
          specialist_tax_id?: string | null
          sqr_id?: string | null
          start_date?: string | null
          status?: string | null
          taxonomy_id?: string | null
          updated_at?: string | null
          work_order_required?: boolean
        }
        Update: {
          activity_required?: boolean
          anio_fiscal?: number | null
          anio_fiscal_override?: boolean
          approval_required?: boolean
          client_id?: string
          contract_file_path?: string | null
          created_at?: string | null
          created_by_staff_id?: string | null
          encargado_id?: string | null
          end_date?: string | null
          engagement_code?: string | null
          engagement_id?: string
          engagement_name?: string
          engagement_state_override?: number | null
          fecha_cierre?: string
          funcion?: number | null
          is_internal?: boolean
          manager_id?: string | null
          oficina?: number | null
          partner_id?: string | null
          practica?: number | null
          society_id?: string | null
          specialist_it_id?: string | null
          specialist_tax_id?: string | null
          sqr_id?: string | null
          start_date?: string | null
          status?: string | null
          taxonomy_id?: string | null
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
            foreignKeyName: "engagements_created_by_staff_id_fkey"
            columns: ["created_by_staff_id"]
            isOneToOne: false
            referencedRelation: "fund_request_selectable_work_orders"
            referencedColumns: ["manager_staff_id"]
          },
          {
            foreignKeyName: "engagements_created_by_staff_id_fkey"
            columns: ["created_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "engagements_created_by_staff_id_fkey"
            columns: ["created_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "engagements_encargado_id_fkey"
            columns: ["encargado_id"]
            isOneToOne: false
            referencedRelation: "fund_request_selectable_work_orders"
            referencedColumns: ["manager_staff_id"]
          },
          {
            foreignKeyName: "engagements_encargado_id_fkey"
            columns: ["encargado_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "engagements_encargado_id_fkey"
            columns: ["encargado_id"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "engagements_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "fund_request_selectable_work_orders"
            referencedColumns: ["manager_staff_id"]
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
            referencedRelation: "fund_request_selectable_work_orders"
            referencedColumns: ["manager_staff_id"]
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
          {
            foreignKeyName: "engagements_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "society"
            referencedColumns: ["society_id"]
          },
          {
            foreignKeyName: "engagements_specialist_it_id_fkey"
            columns: ["specialist_it_id"]
            isOneToOne: false
            referencedRelation: "fund_request_selectable_work_orders"
            referencedColumns: ["manager_staff_id"]
          },
          {
            foreignKeyName: "engagements_specialist_it_id_fkey"
            columns: ["specialist_it_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "engagements_specialist_it_id_fkey"
            columns: ["specialist_it_id"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "engagements_specialist_tax_id_fkey"
            columns: ["specialist_tax_id"]
            isOneToOne: false
            referencedRelation: "fund_request_selectable_work_orders"
            referencedColumns: ["manager_staff_id"]
          },
          {
            foreignKeyName: "engagements_specialist_tax_id_fkey"
            columns: ["specialist_tax_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "engagements_specialist_tax_id_fkey"
            columns: ["specialist_tax_id"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "engagements_sqr_id_fkey"
            columns: ["sqr_id"]
            isOneToOne: false
            referencedRelation: "fund_request_selectable_work_orders"
            referencedColumns: ["manager_staff_id"]
          },
          {
            foreignKeyName: "engagements_sqr_id_fkey"
            columns: ["sqr_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "engagements_sqr_id_fkey"
            columns: ["sqr_id"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "engagements_taxonomy_id_fkey"
            columns: ["taxonomy_id"]
            isOneToOne: false
            referencedRelation: "servicios"
            referencedColumns: ["taxonomy_id"]
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
      fund_request_expenses: {
        Row: {
          amount: number
          attachment_url: string | null
          created_at: string
          currency: string
          days: number | null
          description: string | null
          document_number: string | null
          expense_date: string
          expense_date_end: string | null
          expense_type_id: string | null
          fre_id: string
          fund_request_id: string
          has_invoice_observation: boolean
          invoice_observation_notes: string | null
          iva_penalty_amount: number
          manager_decided_at: string | null
          manager_notes: string | null
          rejection_reason: string | null
          returned_by_assistant: boolean
          reviewed_at: string | null
          reviewed_by_staff_id: string | null
          status: Database["public"]["Enums"]["fund_request_expense_status"]
          submitted_at: string | null
          supplier_name: string | null
          supplier_tax_id: string | null
          updated_at: string
          wo_id: string
        }
        Insert: {
          amount: number
          attachment_url?: string | null
          created_at?: string
          currency: string
          days?: number | null
          description?: string | null
          document_number?: string | null
          expense_date: string
          expense_date_end?: string | null
          expense_type_id?: string | null
          fre_id?: string
          fund_request_id: string
          has_invoice_observation?: boolean
          invoice_observation_notes?: string | null
          iva_penalty_amount?: number
          manager_decided_at?: string | null
          manager_notes?: string | null
          rejection_reason?: string | null
          returned_by_assistant?: boolean
          reviewed_at?: string | null
          reviewed_by_staff_id?: string | null
          status?: Database["public"]["Enums"]["fund_request_expense_status"]
          submitted_at?: string | null
          supplier_name?: string | null
          supplier_tax_id?: string | null
          updated_at?: string
          wo_id: string
        }
        Update: {
          amount?: number
          attachment_url?: string | null
          created_at?: string
          currency?: string
          days?: number | null
          description?: string | null
          document_number?: string | null
          expense_date?: string
          expense_date_end?: string | null
          expense_type_id?: string | null
          fre_id?: string
          fund_request_id?: string
          has_invoice_observation?: boolean
          invoice_observation_notes?: string | null
          iva_penalty_amount?: number
          manager_decided_at?: string | null
          manager_notes?: string | null
          rejection_reason?: string | null
          returned_by_assistant?: boolean
          reviewed_at?: string | null
          reviewed_by_staff_id?: string | null
          status?: Database["public"]["Enums"]["fund_request_expense_status"]
          submitted_at?: string | null
          supplier_name?: string | null
          supplier_tax_id?: string | null
          updated_at?: string
          wo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fund_request_expenses_expense_type_id_fkey"
            columns: ["expense_type_id"]
            isOneToOne: false
            referencedRelation: "expense_types"
            referencedColumns: ["expense_type_id"]
          },
          {
            foreignKeyName: "fund_request_expenses_fund_request_id_fkey"
            columns: ["fund_request_id"]
            isOneToOne: false
            referencedRelation: "fund_requests"
            referencedColumns: ["fund_request_id"]
          },
          {
            foreignKeyName: "fund_request_expenses_reviewed_by_staff_id_fkey"
            columns: ["reviewed_by_staff_id"]
            isOneToOne: false
            referencedRelation: "fund_request_selectable_work_orders"
            referencedColumns: ["manager_staff_id"]
          },
          {
            foreignKeyName: "fund_request_expenses_reviewed_by_staff_id_fkey"
            columns: ["reviewed_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "fund_request_expenses_reviewed_by_staff_id_fkey"
            columns: ["reviewed_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "fund_request_expenses_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "fund_request_selectable_work_orders"
            referencedColumns: ["wo_id"]
          },
          {
            foreignKeyName: "fund_request_expenses_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "vw_wo_budget_hours_by_category"
            referencedColumns: ["wo_id"]
          },
          {
            foreignKeyName: "fund_request_expenses_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "vw_wo_budget_hours_by_category_activity"
            referencedColumns: ["wo_id"]
          },
          {
            foreignKeyName: "fund_request_expenses_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "work_order_summary"
            referencedColumns: ["wo_id"]
          },
          {
            foreignKeyName: "fund_request_expenses_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["wo_id"]
          },
        ]
      }
      fund_request_work_orders: {
        Row: {
          allocated_amount: number
          approval_status: Database["public"]["Enums"]["fr_wo_approval_status"]
          created_at: string
          fr_wo_id: string
          fund_request_id: string
          manager_decided_at: string | null
          manager_notes: string | null
          manager_staff_id: string | null
          rejection_reason: string | null
          wo_id: string
        }
        Insert: {
          allocated_amount: number
          approval_status?: Database["public"]["Enums"]["fr_wo_approval_status"]
          created_at?: string
          fr_wo_id?: string
          fund_request_id: string
          manager_decided_at?: string | null
          manager_notes?: string | null
          manager_staff_id?: string | null
          rejection_reason?: string | null
          wo_id: string
        }
        Update: {
          allocated_amount?: number
          approval_status?: Database["public"]["Enums"]["fr_wo_approval_status"]
          created_at?: string
          fr_wo_id?: string
          fund_request_id?: string
          manager_decided_at?: string | null
          manager_notes?: string | null
          manager_staff_id?: string | null
          rejection_reason?: string | null
          wo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fund_request_work_orders_fund_request_id_fkey"
            columns: ["fund_request_id"]
            isOneToOne: false
            referencedRelation: "fund_requests"
            referencedColumns: ["fund_request_id"]
          },
          {
            foreignKeyName: "fund_request_work_orders_manager_staff_id_fkey"
            columns: ["manager_staff_id"]
            isOneToOne: false
            referencedRelation: "fund_request_selectable_work_orders"
            referencedColumns: ["manager_staff_id"]
          },
          {
            foreignKeyName: "fund_request_work_orders_manager_staff_id_fkey"
            columns: ["manager_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "fund_request_work_orders_manager_staff_id_fkey"
            columns: ["manager_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "fund_request_work_orders_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "fund_request_selectable_work_orders"
            referencedColumns: ["wo_id"]
          },
          {
            foreignKeyName: "fund_request_work_orders_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "vw_wo_budget_hours_by_category"
            referencedColumns: ["wo_id"]
          },
          {
            foreignKeyName: "fund_request_work_orders_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "vw_wo_budget_hours_by_category_activity"
            referencedColumns: ["wo_id"]
          },
          {
            foreignKeyName: "fund_request_work_orders_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "work_order_summary"
            referencedColumns: ["wo_id"]
          },
          {
            foreignKeyName: "fund_request_work_orders_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["wo_id"]
          },
        ]
      }
      fund_requests: {
        Row: {
          accounting_notes: string | null
          approver_manager_staff_id: string | null
          closed_at: string | null
          created_at: string
          currency: string
          disbursed_at: string | null
          disbursed_by_staff_id: string | null
          due_back_date: string | null
          fund_request_id: string
          manager_decided_at: string | null
          manager_notes: string | null
          purpose: string | null
          rejection_reason: string | null
          request_number: string | null
          requester_staff_id: string
          settled_at: string | null
          settled_by_staff_id: string | null
          settlement_amount: number | null
          settlement_balance: number | null
          settlement_iva_total: number | null
          settlement_notes: string | null
          settlement_resolution: string | null
          settlement_total_spent: number | null
          status: Database["public"]["Enums"]["fund_request_status"]
          submitted_at: string | null
          total_disbursed_amount: number
          total_requested_amount: number
          updated_at: string
        }
        Insert: {
          accounting_notes?: string | null
          approver_manager_staff_id?: string | null
          closed_at?: string | null
          created_at?: string
          currency: string
          disbursed_at?: string | null
          disbursed_by_staff_id?: string | null
          due_back_date?: string | null
          fund_request_id?: string
          manager_decided_at?: string | null
          manager_notes?: string | null
          purpose?: string | null
          rejection_reason?: string | null
          request_number?: string | null
          requester_staff_id: string
          settled_at?: string | null
          settled_by_staff_id?: string | null
          settlement_amount?: number | null
          settlement_balance?: number | null
          settlement_iva_total?: number | null
          settlement_notes?: string | null
          settlement_resolution?: string | null
          settlement_total_spent?: number | null
          status?: Database["public"]["Enums"]["fund_request_status"]
          submitted_at?: string | null
          total_disbursed_amount?: number
          total_requested_amount: number
          updated_at?: string
        }
        Update: {
          accounting_notes?: string | null
          approver_manager_staff_id?: string | null
          closed_at?: string | null
          created_at?: string
          currency?: string
          disbursed_at?: string | null
          disbursed_by_staff_id?: string | null
          due_back_date?: string | null
          fund_request_id?: string
          manager_decided_at?: string | null
          manager_notes?: string | null
          purpose?: string | null
          rejection_reason?: string | null
          request_number?: string | null
          requester_staff_id?: string
          settled_at?: string | null
          settled_by_staff_id?: string | null
          settlement_amount?: number | null
          settlement_balance?: number | null
          settlement_iva_total?: number | null
          settlement_notes?: string | null
          settlement_resolution?: string | null
          settlement_total_spent?: number | null
          status?: Database["public"]["Enums"]["fund_request_status"]
          submitted_at?: string | null
          total_disbursed_amount?: number
          total_requested_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fund_requests_approver_manager_staff_id_fkey"
            columns: ["approver_manager_staff_id"]
            isOneToOne: false
            referencedRelation: "fund_request_selectable_work_orders"
            referencedColumns: ["manager_staff_id"]
          },
          {
            foreignKeyName: "fund_requests_approver_manager_staff_id_fkey"
            columns: ["approver_manager_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "fund_requests_approver_manager_staff_id_fkey"
            columns: ["approver_manager_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "fund_requests_disbursed_by_staff_id_fkey"
            columns: ["disbursed_by_staff_id"]
            isOneToOne: false
            referencedRelation: "fund_request_selectable_work_orders"
            referencedColumns: ["manager_staff_id"]
          },
          {
            foreignKeyName: "fund_requests_disbursed_by_staff_id_fkey"
            columns: ["disbursed_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "fund_requests_disbursed_by_staff_id_fkey"
            columns: ["disbursed_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "fund_requests_requester_staff_id_fkey"
            columns: ["requester_staff_id"]
            isOneToOne: false
            referencedRelation: "fund_request_selectable_work_orders"
            referencedColumns: ["manager_staff_id"]
          },
          {
            foreignKeyName: "fund_requests_requester_staff_id_fkey"
            columns: ["requester_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "fund_requests_requester_staff_id_fkey"
            columns: ["requester_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "fund_requests_settled_by_staff_id_fkey"
            columns: ["settled_by_staff_id"]
            isOneToOne: false
            referencedRelation: "fund_request_selectable_work_orders"
            referencedColumns: ["manager_staff_id"]
          },
          {
            foreignKeyName: "fund_requests_settled_by_staff_id_fkey"
            columns: ["settled_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "fund_requests_settled_by_staff_id_fkey"
            columns: ["settled_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["staff_id"]
          },
        ]
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
          oficina: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by: string
          holiday_date: string
          holiday_id?: string
          holiday_name: string
          oficina?: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string
          holiday_date?: string
          holiday_id?: string
          holiday_name?: string
          oficina?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "holidays_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "fund_request_selectable_work_orders"
            referencedColumns: ["manager_staff_id"]
          },
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
      migration_run_log: {
        Row: {
          backup_table_name: string
          created_at: string
          executed_by: string | null
          id: string
          migration_key: string
        }
        Insert: {
          backup_table_name: string
          created_at?: string
          executed_by?: string | null
          id?: string
          migration_key: string
        }
        Update: {
          backup_table_name?: string
          created_at?: string
          executed_by?: string | null
          id?: string
          migration_key?: string
        }
        Relationships: []
      }
      parametro: {
        Row: {
          created_at: string | null
          date_begin: string
          date_end: string
          descripcion: string | null
          id: string
          nombre: string
          periodo: number
          tipo: string | null
          valor: number
        }
        Insert: {
          created_at?: string | null
          date_begin: string
          date_end: string
          descripcion?: string | null
          id?: string
          nombre: string
          periodo: number
          tipo?: string | null
          valor?: number
        }
        Update: {
          created_at?: string | null
          date_begin?: string
          date_end?: string
          descripcion?: string | null
          id?: string
          nombre?: string
          periodo?: number
          tipo?: string | null
          valor?: number
        }
        Relationships: []
      }
      practicas: {
        Row: {
          abbreviation: string | null
          allows_rates_activities: boolean
          code: number
          created_at: string
          is_active: boolean
          name: string
          practica_id: string
        }
        Insert: {
          abbreviation?: string | null
          allows_rates_activities?: boolean
          code: number
          created_at?: string
          is_active?: boolean
          name: string
          practica_id?: string
        }
        Update: {
          abbreviation?: string | null
          allows_rates_activities?: boolean
          code?: number
          created_at?: string
          is_active?: boolean
          name?: string
          practica_id?: string
        }
        Relationships: []
      }
      servicios: {
        Row: {
          code: string
          created_at: string
          is_active: boolean
          name: string
          practica_id: string | null
          taxonomy_id: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          is_active?: boolean
          name: string
          practica_id?: string | null
          taxonomy_id?: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          is_active?: boolean
          name?: string
          practica_id?: string | null
          taxonomy_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "servicios_practica_id_fkey"
            columns: ["practica_id"]
            isOneToOne: false
            referencedRelation: "practicas"
            referencedColumns: ["practica_id"]
          },
        ]
      }
      skills: {
        Row: {
          category: string
          created_at: string | null
          is_active: boolean | null
          name: string
          skill_id: string
          updated_at: string | null
        }
        Insert: {
          category: string
          created_at?: string | null
          is_active?: boolean | null
          name: string
          skill_id?: string
          updated_at?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          is_active?: boolean | null
          name?: string
          skill_id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      society: {
        Row: {
          created_at: string
          is_active: boolean
          name: string
          society_id: string
        }
        Insert: {
          created_at?: string
          is_active?: boolean
          name: string
          society_id?: string
        }
        Update: {
          created_at?: string
          is_active?: boolean
          name?: string
          society_id?: string
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
          is_blocked: boolean
          is_schedulable: boolean
          last_name: string
          practica_id: string
          short_name: string | null
          society_id: string
          staff_id: string
          target_utilization_percent: number
          termination_date: string | null
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
          is_blocked?: boolean
          is_schedulable?: boolean
          last_name: string
          practica_id: string
          short_name?: string | null
          society_id: string
          staff_id?: string
          target_utilization_percent?: number
          termination_date?: string | null
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
          is_blocked?: boolean
          is_schedulable?: boolean
          last_name?: string
          practica_id?: string
          short_name?: string | null
          society_id?: string
          staff_id?: string
          target_utilization_percent?: number
          termination_date?: string | null
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
          {
            foreignKeyName: "staff_practica_category_fk"
            columns: ["practica_id", "category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["practica_id", "category_id"]
          },
          {
            foreignKeyName: "staff_practica_id_fkey"
            columns: ["practica_id"]
            isOneToOne: false
            referencedRelation: "practicas"
            referencedColumns: ["practica_id"]
          },
          {
            foreignKeyName: "staff_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "society"
            referencedColumns: ["society_id"]
          },
        ]
      }
      staff_alert_seen: {
        Row: {
          alert_type: string
          entity_id: string
          id: string
          seen_at: string
          staff_id: string
        }
        Insert: {
          alert_type: string
          entity_id: string
          id?: string
          seen_at?: string
          staff_id: string
        }
        Update: {
          alert_type?: string
          entity_id?: string
          id?: string
          seen_at?: string
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_alert_seen_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "fund_request_selectable_work_orders"
            referencedColumns: ["manager_staff_id"]
          },
          {
            foreignKeyName: "staff_alert_seen_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "staff_alert_seen_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["staff_id"]
          },
        ]
      }
      staff_skills: {
        Row: {
          created_at: string | null
          last_evaluated_date: string | null
          proficiency_level: string
          skill_id: string
          staff_id: string
          staff_skill_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          last_evaluated_date?: string | null
          proficiency_level: string
          skill_id: string
          staff_id: string
          staff_skill_id?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          last_evaluated_date?: string | null
          proficiency_level?: string
          skill_id?: string
          staff_id?: string
          staff_skill_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_skills_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["skill_id"]
          },
          {
            foreignKeyName: "staff_skills_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "fund_request_selectable_work_orders"
            referencedColumns: ["manager_staff_id"]
          },
          {
            foreignKeyName: "staff_skills_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "staff_skills_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_directory"
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
            foreignKeyName: "time_entries_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "fund_request_selectable_work_orders"
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
            referencedRelation: "fund_request_selectable_work_orders"
            referencedColumns: ["manager_staff_id"]
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
          has_explicit_times: boolean
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
          has_explicit_times?: boolean
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
          has_explicit_times?: boolean
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
            foreignKeyName: "timer_entries_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "fund_request_selectable_work_orders"
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
            referencedRelation: "fund_request_selectable_work_orders"
            referencedColumns: ["manager_staff_id"]
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
          activity_id: string
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
          activity_id: string
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
          activity_id?: string
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
            foreignKeyName: "timesheet_line_approvals_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activity_codes"
            referencedColumns: ["activity_id"]
          },
          {
            foreignKeyName: "timesheet_line_approvals_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "fund_request_selectable_work_orders"
            referencedColumns: ["manager_staff_id"]
          },
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
            foreignKeyName: "timesheet_line_approvals_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "fund_request_selectable_work_orders"
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
            referencedRelation: "fund_request_selectable_work_orders"
            referencedColumns: ["manager_staff_id"]
          },
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
      user_lifecycle_audit_log: {
        Row: {
          action: string
          actor_user_id: string
          created_at: string
          id: string
          metadata: Json | null
          new_role: Database["public"]["Enums"]["app_role"] | null
          new_role_key: string | null
          old_role: Database["public"]["Enums"]["app_role"] | null
          old_role_key: string | null
          reason: string | null
          target_user_id: string
        }
        Insert: {
          action: string
          actor_user_id: string
          created_at?: string
          id?: string
          metadata?: Json | null
          new_role?: Database["public"]["Enums"]["app_role"] | null
          new_role_key?: string | null
          old_role?: Database["public"]["Enums"]["app_role"] | null
          old_role_key?: string | null
          reason?: string | null
          target_user_id: string
        }
        Update: {
          action?: string
          actor_user_id?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          new_role?: Database["public"]["Enums"]["app_role"] | null
          new_role_key?: string | null
          old_role?: Database["public"]["Enums"]["app_role"] | null
          old_role_key?: string | null
          reason?: string | null
          target_user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          role_key: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          role_key?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          role_key?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_role_key_fkey"
            columns: ["role_key"]
            isOneToOne: false
            referencedRelation: "authorization_roles"
            referencedColumns: ["role_key"]
          },
        ]
      }
      user_roles_backup_0220_56_20260224: {
        Row: {
          created_at: string | null
          id: string | null
          role: Database["public"]["Enums"]["app_role"] | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          role?: Database["public"]["Enums"]["app_role"] | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string | null
          role?: Database["public"]["Enums"]["app_role"] | null
          user_id?: string | null
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
            referencedRelation: "fund_request_selectable_work_orders"
            referencedColumns: ["wo_id"]
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
            referencedRelation: "fund_request_selectable_work_orders"
            referencedColumns: ["wo_id"]
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
      wo_payment_installments: {
        Row: {
          agreed_invoice_date: string | null
          agreed_payment_date: string | null
          amount: number | null
          collection_invoice_date: string | null
          collection_payment_date: string | null
          created_at: string | null
          installment_id: string
          installment_number: number
          payment_date_actual: string | null
          percentage: number
          plan_id: string
          status: string
          updated_at: string | null
          wo_id: string
        }
        Insert: {
          agreed_invoice_date?: string | null
          agreed_payment_date?: string | null
          amount?: number | null
          collection_invoice_date?: string | null
          collection_payment_date?: string | null
          created_at?: string | null
          installment_id?: string
          installment_number: number
          payment_date_actual?: string | null
          percentage?: number
          plan_id: string
          status?: string
          updated_at?: string | null
          wo_id: string
        }
        Update: {
          agreed_invoice_date?: string | null
          agreed_payment_date?: string | null
          amount?: number | null
          collection_invoice_date?: string | null
          collection_payment_date?: string | null
          created_at?: string | null
          installment_id?: string
          installment_number?: number
          payment_date_actual?: string | null
          percentage?: number
          plan_id?: string
          status?: string
          updated_at?: string | null
          wo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wo_payment_installments_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "wo_payment_plan"
            referencedColumns: ["plan_id"]
          },
          {
            foreignKeyName: "wo_payment_installments_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "fund_request_selectable_work_orders"
            referencedColumns: ["wo_id"]
          },
          {
            foreignKeyName: "wo_payment_installments_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "vw_wo_budget_hours_by_category"
            referencedColumns: ["wo_id"]
          },
          {
            foreignKeyName: "wo_payment_installments_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "vw_wo_budget_hours_by_category_activity"
            referencedColumns: ["wo_id"]
          },
          {
            foreignKeyName: "wo_payment_installments_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "work_order_summary"
            referencedColumns: ["wo_id"]
          },
          {
            foreignKeyName: "wo_payment_installments_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["wo_id"]
          },
        ]
      }
      wo_payment_plan: {
        Row: {
          created_at: string | null
          exchange_rate: number | null
          payment_days: number
          plan_id: string
          updated_at: string | null
          wo_id: string
        }
        Insert: {
          created_at?: string | null
          exchange_rate?: number | null
          payment_days?: number
          plan_id?: string
          updated_at?: string | null
          wo_id: string
        }
        Update: {
          created_at?: string | null
          exchange_rate?: number | null
          payment_days?: number
          plan_id?: string
          updated_at?: string | null
          wo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wo_payment_plan_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: true
            referencedRelation: "fund_request_selectable_work_orders"
            referencedColumns: ["wo_id"]
          },
          {
            foreignKeyName: "wo_payment_plan_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: true
            referencedRelation: "vw_wo_budget_hours_by_category"
            referencedColumns: ["wo_id"]
          },
          {
            foreignKeyName: "wo_payment_plan_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: true
            referencedRelation: "vw_wo_budget_hours_by_category_activity"
            referencedColumns: ["wo_id"]
          },
          {
            foreignKeyName: "wo_payment_plan_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: true
            referencedRelation: "work_order_summary"
            referencedColumns: ["wo_id"]
          },
          {
            foreignKeyName: "wo_payment_plan_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: true
            referencedRelation: "work_orders"
            referencedColumns: ["wo_id"]
          },
        ]
      }
      wo_staffing_requirement_skills: {
        Row: {
          created_at: string
          id: string
          min_proficiency_level: string
          requirement_id: string
          skill_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          min_proficiency_level: string
          requirement_id: string
          skill_id: string
        }
        Update: {
          created_at?: string
          id?: string
          min_proficiency_level?: string
          requirement_id?: string
          skill_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wo_staffing_requirement_skills_requirement_id_fkey"
            columns: ["requirement_id"]
            isOneToOne: false
            referencedRelation: "wo_staffing_requirements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wo_staffing_requirement_skills_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["skill_id"]
          },
        ]
      }
      wo_staffing_requirements: {
        Row: {
          category_id: string
          created_at: string
          id: string
          staff_count: number
          updated_at: string
          wo_id: string
        }
        Insert: {
          category_id: string
          created_at?: string
          id?: string
          staff_count: number
          updated_at?: string
          wo_id: string
        }
        Update: {
          category_id?: string
          created_at?: string
          id?: string
          staff_count?: number
          updated_at?: string
          wo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wo_staffing_requirements_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "wo_staffing_requirements_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "fund_request_selectable_work_orders"
            referencedColumns: ["wo_id"]
          },
          {
            foreignKeyName: "wo_staffing_requirements_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "vw_wo_budget_hours_by_category"
            referencedColumns: ["wo_id"]
          },
          {
            foreignKeyName: "wo_staffing_requirements_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "vw_wo_budget_hours_by_category_activity"
            referencedColumns: ["wo_id"]
          },
          {
            foreignKeyName: "wo_staffing_requirements_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "work_order_summary"
            referencedColumns: ["wo_id"]
          },
          {
            foreignKeyName: "wo_staffing_requirements_wo_id_fkey"
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
          ceac_number: string | null
          created_at: string | null
          currency: string
          emergency_deadline_at: string | null
          emergency_justification: string | null
          emergency_partner_at: string | null
          emergency_partner_by: string | null
          emergency_review_at: string | null
          emergency_review_by: string | null
          engagement_id: string
          notes: string | null
          risk_approved_at: string | null
          risk_approved_by: string | null
          risk_level: string | null
          risk_notes: string | null
          risk_status: string | null
          san_approval_id: string | null
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
          ceac_number?: string | null
          created_at?: string | null
          currency: string
          emergency_deadline_at?: string | null
          emergency_justification?: string | null
          emergency_partner_at?: string | null
          emergency_partner_by?: string | null
          emergency_review_at?: string | null
          emergency_review_by?: string | null
          engagement_id: string
          notes?: string | null
          risk_approved_at?: string | null
          risk_approved_by?: string | null
          risk_level?: string | null
          risk_notes?: string | null
          risk_status?: string | null
          san_approval_id?: string | null
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
          ceac_number?: string | null
          created_at?: string | null
          currency?: string
          emergency_deadline_at?: string | null
          emergency_justification?: string | null
          emergency_partner_at?: string | null
          emergency_partner_by?: string | null
          emergency_review_at?: string | null
          emergency_review_by?: string | null
          engagement_id?: string
          notes?: string | null
          risk_approved_at?: string | null
          risk_approved_by?: string | null
          risk_level?: string | null
          risk_notes?: string | null
          risk_status?: string | null
          san_approval_id?: string | null
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
            referencedRelation: "fund_request_selectable_work_orders"
            referencedColumns: ["manager_staff_id"]
          },
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
            foreignKeyName: "work_orders_emergency_partner_by_fkey"
            columns: ["emergency_partner_by"]
            isOneToOne: false
            referencedRelation: "fund_request_selectable_work_orders"
            referencedColumns: ["manager_staff_id"]
          },
          {
            foreignKeyName: "work_orders_emergency_partner_by_fkey"
            columns: ["emergency_partner_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "work_orders_emergency_partner_by_fkey"
            columns: ["emergency_partner_by"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "work_orders_emergency_review_by_fkey"
            columns: ["emergency_review_by"]
            isOneToOne: false
            referencedRelation: "fund_request_selectable_work_orders"
            referencedColumns: ["manager_staff_id"]
          },
          {
            foreignKeyName: "work_orders_emergency_review_by_fkey"
            columns: ["emergency_review_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "work_orders_emergency_review_by_fkey"
            columns: ["emergency_review_by"]
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
          {
            foreignKeyName: "work_orders_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: true
            referencedRelation: "fund_request_selectable_work_orders"
            referencedColumns: ["engagement_id"]
          },
          {
            foreignKeyName: "work_orders_risk_approved_by_fkey"
            columns: ["risk_approved_by"]
            isOneToOne: false
            referencedRelation: "fund_request_selectable_work_orders"
            referencedColumns: ["manager_staff_id"]
          },
          {
            foreignKeyName: "work_orders_risk_approved_by_fkey"
            columns: ["risk_approved_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "work_orders_risk_approved_by_fkey"
            columns: ["risk_approved_by"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["staff_id"]
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
      engagement_wo_state: {
        Row: {
          approval_status: string | null
          approved_at: string | null
          engagement_id: string | null
          risk_status: string | null
        }
        Insert: {
          approval_status?: string | null
          approved_at?: string | null
          engagement_id?: string | null
          risk_status?: string | null
        }
        Update: {
          approval_status?: string | null
          approved_at?: string | null
          engagement_id?: string | null
          risk_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_orders_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: true
            referencedRelation: "engagements"
            referencedColumns: ["engagement_id"]
          },
          {
            foreignKeyName: "work_orders_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: true
            referencedRelation: "fund_request_selectable_work_orders"
            referencedColumns: ["engagement_id"]
          },
        ]
      }
      fund_request_selectable_work_orders: {
        Row: {
          approval_status: string | null
          currency: string | null
          engagement_code: string | null
          engagement_id: string | null
          engagement_name: string | null
          manager_first_name: string | null
          manager_id: string | null
          manager_last_name: string | null
          manager_short_name: string | null
          manager_staff_id: string | null
          wo_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "engagements_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "fund_request_selectable_work_orders"
            referencedColumns: ["manager_staff_id"]
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
          {
            foreignKeyName: "time_entries_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "fund_request_selectable_work_orders"
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
      vw_staffing_alerts: {
        Row: {
          alert_type: string | null
          category_name: string | null
          description: string | null
          detected_at: string | null
          end_date: string | null
          engagement_code: string | null
          engagement_id: string | null
          engagement_name: string | null
          entity_id: string | null
          priority_level: string | null
          required_count: number | null
          staff_id: string | null
          staff_name: string | null
          start_date: string | null
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
          {
            foreignKeyName: "work_orders_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: true
            referencedRelation: "fund_request_selectable_work_orders"
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
          {
            foreignKeyName: "work_orders_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: true
            referencedRelation: "fund_request_selectable_work_orders"
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
            referencedRelation: "fund_request_selectable_work_orders"
            referencedColumns: ["manager_staff_id"]
          },
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
          {
            foreignKeyName: "work_orders_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: true
            referencedRelation: "fund_request_selectable_work_orders"
            referencedColumns: ["engagement_id"]
          },
        ]
      }
    }
    Functions: {
      admin_set_user_role: {
        Args: {
          p_new_role: Database["public"]["Enums"]["app_role"]
          p_reason?: string
          p_target_user_id: string
        }
        Returns: Json
      }
      admin_set_user_role_key: {
        Args: {
          p_new_role_key: string
          p_reason?: string
          p_target_user_id: string
        }
        Returns: Json
      }
      admin_unblock_account: { Args: { p_staff_id: string }; Returns: Json }
      assign_user_role_atomic: { Args: { p_user_id: string }; Returns: Json }
      batch_upsert_worksheet_cells: {
        Args: { p_cells: Json; p_worksheet_id: string }
        Returns: undefined
      }
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
      can_approve_wo_risk: {
        Args: { p_engagement_id: string }
        Returns: boolean
      }
      can_read_engagement_assignments: {
        Args: { p_engagement_id: string }
        Returns: boolean
      }
      check_login_allowed: { Args: { p_email: string }; Returns: Json }
      check_pending_hours_before_termination: {
        Args: { p_staff_id: string; p_termination_date: string }
        Returns: Json
      }
      copy_categories_between_practices: {
        Args: {
          p_replace?: boolean
          p_source_practice_id: string
          p_target_practice_id: string
        }
        Returns: number
      }
      create_category_for_practice: {
        Args: {
          p_can_approve_timesheets?: boolean
          p_can_approve_wo?: boolean
          p_category_name: string
          p_default_app_role?: Database["public"]["Enums"]["app_role"]
          p_display_order?: number
          p_practice_id: string
          p_rate_high_bob?: number
          p_rate_high_usd?: number
          p_rate_low_bob?: number
          p_rate_low_usd?: number
        }
        Returns: {
          can_approve_timesheets: boolean | null
          can_approve_wo: boolean | null
          category_id: string
          category_name: string
          created_at: string | null
          default_app_role: Database["public"]["Enums"]["app_role"] | null
          display_order: number | null
          practica_id: string
          rate_high_bob: number
          rate_high_usd: number
          rate_low_bob: number
          rate_low_usd: number
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "categories"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_engagement_with_code: {
        Args: {
          p_activity_required: boolean
          p_anio_fiscal: number
          p_anio_fiscal_override: boolean
          p_approval_required: boolean
          p_client_id: string
          p_contract_file_path?: string
          p_encargado_id?: string
          p_end_date: string
          p_engagement_name: string
          p_fecha_cierre: string
          p_funcion: number
          p_is_internal: boolean
          p_manager_id: string
          p_oficina: number
          p_partner_id: string
          p_practica: number
          p_society_id: string
          p_specialist_it_id?: string
          p_specialist_tax_id?: string
          p_sqr_id?: string
          p_start_date: string
          p_status: string
          p_taxonomy_id?: string
          p_work_order_required: boolean
        }
        Returns: {
          activity_required: boolean
          anio_fiscal: number | null
          anio_fiscal_override: boolean
          approval_required: boolean
          client_id: string
          contract_file_path: string | null
          created_at: string | null
          created_by_staff_id: string | null
          encargado_id: string | null
          end_date: string | null
          engagement_code: string | null
          engagement_id: string
          engagement_name: string
          engagement_state_override: number | null
          fecha_cierre: string
          funcion: number | null
          is_internal: boolean
          manager_id: string | null
          oficina: number | null
          partner_id: string | null
          practica: number | null
          society_id: string | null
          specialist_it_id: string | null
          specialist_tax_id: string | null
          sqr_id: string | null
          start_date: string | null
          status: string | null
          taxonomy_id: string | null
          updated_at: string | null
          work_order_required: boolean
        }
        SetofOptions: {
          from: "*"
          to: "engagements"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_practice_activity: {
        Args: {
          p_description: string
          p_entity_type?: string
          p_practice_id: string
        }
        Returns: {
          activity_code: string
          activity_id: string
          created_at: string | null
          default_category_id: string | null
          description: string
          entity_type: string
          is_active: boolean | null
          is_system: boolean
          practica_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "activity_codes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      current_role_key: { Args: never; Returns: string }
      deactivate_practice_activity: {
        Args: { p_activity_id: string }
        Returns: undefined
      }
      delete_category_for_practice: {
        Args: { p_category_id: string }
        Returns: undefined
      }
      engagement_accepts_assignment_writes: {
        Args: { p_engagement_id: string }
        Returns: boolean
      }
      engagement_allows_hours_or_requests: {
        Args: { p_engagement_id: string }
        Returns: boolean
      }
      engagement_in_my_fund_request: {
        Args: { p_engagement_id: string }
        Returns: boolean
      }
      engagement_is_approved_state: {
        Args: {
          p_engagement_id: string
          p_override: number
          p_wo_required: boolean
        }
        Returns: boolean
      }
      finalize_all_stale_timers: { Args: never; Returns: number }
      finalize_due_engagements: { Args: never; Returns: number }
      finalize_my_stale_timers: { Args: never; Returns: number }
      fr_is_ot_manager: { Args: { p_fr_id: string }; Returns: boolean }
      fr_is_requester: { Args: { p_fr_id: string }; Returns: boolean }
      fr_is_submitted: { Args: { p_fr_id: string }; Returns: boolean }
      fund_request_save_edit: {
        Args: { p_allocations: Json; p_fields: Json; p_fund_request_id: string }
        Returns: undefined
      }
      fund_request_submit: {
        Args: { p_fund_request_id: string }
        Returns: undefined
      }
      get_all_user_roles: {
        Args: never
        Returns: {
          created_at: string
          email: string
          role: Database["public"]["Enums"]["app_role"]
          role_id: string
          role_key: string
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
      get_engagement_team_candidates: {
        Args: never
        Returns: {
          candidate_group: string
          display_name: string
          practica_id: string
          staff_id: string
        }[]
      }
      get_line_approver: {
        Args: { p_engagement_id: string; p_staff_id: string }
        Returns: string
      }
      get_my_authorization_context: { Args: never; Returns: Json }
      get_my_pending_hours: { Args: { p_staff_id: string }; Returns: Json }
      get_my_staff_id: { Args: never; Returns: string }
      get_staff_assignment_segments: {
        Args: { p_staff_id: string; p_week_end: string; p_week_start: string }
        Returns: {
          end_date: string
          engagement_id: string
          start_date: string
        }[]
      }
      get_staff_full: { Args: never; Returns: Json }
      get_timesheet_approvers: {
        Args: { p_staff_id: string; p_week_start: string }
        Returns: {
          approver_staff_id: string
        }[]
      }
      get_week_statuses: {
        Args: { p_end_date: string; p_staff_id: string; p_start_date: string }
        Returns: Json
      }
      has_assignment_on_engagement: {
        Args: { p_engagement_id: string }
        Returns: boolean
      }
      has_firmwide_assignment_visibility: { Args: never; Returns: boolean }
      has_permission: { Args: { p_permission_key: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_assigned_to_client: { Args: { p_client_id: string }; Returns: boolean }
      is_assigned_to_engagement: {
        Args: { p_engagement_id: string }
        Returns: boolean
      }
      is_auto_approved_category: {
        Args: { p_staff_id: string }
        Returns: boolean
      }
      is_engagement_responsible: {
        Args: { p_engagement_id: string }
        Returns: boolean
      }
      is_engagement_team_member: {
        Args: { p_engagement_id: string }
        Returns: boolean
      }
      move_category: {
        Args: { p_category_id: string; p_new_position: number }
        Returns: undefined
      }
      permission_scope: { Args: { p_permission_key: string }; Returns: string }
      reactivate_practice_activity: {
        Args: { p_activity_id: string }
        Returns: {
          activity_code: string
          activity_id: string
          created_at: string | null
          default_category_id: string | null
          description: string
          entity_type: string
          is_active: boolean | null
          is_system: boolean
          practica_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "activity_codes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_failed_login: { Args: { p_email: string }; Returns: Json }
      reorder_practice_activity: {
        Args: { p_activity_id: string; p_new_position: number }
        Returns: undefined
      }
      reset_login_attempts: { Args: { p_email: string }; Returns: undefined }
      resolve_wo_engagement_id: { Args: { p_wo_id: string }; Returns: string }
      resolve_wo_req_skill_engagement_id: {
        Args: { p_requirement_id: string }
        Returns: string
      }
      save_engagement_assignments: {
        Args: {
          p_deleted_ids: string[]
          p_engagement_id: string
          p_upserts: Json
        }
        Returns: Json
      }
      save_wo_staffing: {
        Args: { p_requirements: Json; p_wo_id: string }
        Returns: Json
      }
      staff_id_number_conflict: {
        Args: { p_exclude_staff_id?: string; p_id_number: string }
        Returns: Json
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
      submit_timesheet_safe: {
        Args: {
          p_activity_ids: string[]
          p_engagement_ids: string[]
          p_is_auto_approved: boolean
          p_period_id: string
          p_staff_id: string
        }
        Returns: Json
      }
      sync_worksheet_to_wo_budget: {
        Args: { p_wo_id: string; p_worksheet_id: string }
        Returns: undefined
      }
      unsubmit_timesheet_safe: {
        Args: { p_period_id: string }
        Returns: undefined
      }
      update_category_for_practice: {
        Args: {
          p_can_approve_timesheets: boolean
          p_can_approve_wo: boolean
          p_category_id: string
          p_category_name: string
          p_default_app_role: Database["public"]["Enums"]["app_role"]
          p_display_order: number
          p_rate_high_bob: number
          p_rate_high_usd: number
          p_rate_low_bob: number
          p_rate_low_usd: number
        }
        Returns: {
          can_approve_timesheets: boolean | null
          can_approve_wo: boolean | null
          category_id: string
          category_name: string
          created_at: string | null
          default_app_role: Database["public"]["Enums"]["app_role"] | null
          display_order: number | null
          practica_id: string
          rate_high_bob: number
          rate_high_usd: number
          rate_low_bob: number
          rate_low_usd: number
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "categories"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_timesheet_minmax_settings: {
        Args: {
          p_daily_max: number
          p_daily_min: number
          p_weekly_max: number
          p_weekly_min: number
          p_work_days?: number
        }
        Returns: Json
      }
      wo_in_my_fund_request: { Args: { p_wo_id: string }; Returns: boolean }
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
      fr_wo_approval_status:
        | "pendiente"
        | "aprobado"
        | "observado"
        | "rechazado"
      fund_request_expense_status:
        | "borrador"
        | "pendiente_aprobacion"
        | "aprobado_gerente"
        | "observado"
        | "rechazado"
        | "revisado_asistente"
      fund_request_status:
        | "borrador"
        | "pendiente_aprobacion"
        | "aprobado_gerente"
        | "observado"
        | "rechazado"
        | "fondos_entregados"
        | "en_liquidacion"
        | "cerrado"
        | "cancelado"
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
  graphql_public: {
    Enums: {},
  },
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
      fr_wo_approval_status: [
        "pendiente",
        "aprobado",
        "observado",
        "rechazado",
      ],
      fund_request_expense_status: [
        "borrador",
        "pendiente_aprobacion",
        "aprobado_gerente",
        "observado",
        "rechazado",
        "revisado_asistente",
      ],
      fund_request_status: [
        "borrador",
        "pendiente_aprobacion",
        "aprobado_gerente",
        "observado",
        "rechazado",
        "fondos_entregados",
        "en_liquidacion",
        "cerrado",
        "cancelado",
      ],
    },
  },
} as const

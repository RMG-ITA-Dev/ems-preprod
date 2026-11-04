export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
      auth_email_throttle: {
        Row: {
          email_normalized: string
          last_sent_at: string | null
          sent_count: number
          window_start: string
        }
        Insert: {
          email_normalized: string
          last_sent_at?: string | null
          sent_count?: number
          window_start?: string
        }
        Update: {
          email_normalized?: string
          last_sent_at?: string | null
          sent_count?: number
          window_start?: string
        }
        Relationships: []
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
          default_role_key: string | null
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
          default_role_key?: string | null
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
          default_role_key?: string | null
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
            foreignKeyName: "categories_default_role_key_fkey"
            columns: ["default_role_key"]
            isOneToOne: false
            referencedRelation: "authorization_roles"
            referencedColumns: ["role_key"]
          },
          {
            foreignKeyName: "categories_practica_id_fkey"
            columns: ["practica_id"]
            isOneToOne: false
            referencedRelation: "practicas"
            referencedColumns: ["practica_id"]
          },
        ]
      }
      client_contacts: {
        Row: {
          client_id: string
          contact_id: string
          contact_type: string
          created_at: string
          email: string | null
          full_name: string
          is_active: boolean
          phone: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          contact_id?: string
          contact_type: string
          created_at?: string
          email?: string | null
          full_name: string
          is_active?: boolean
          phone?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          contact_id?: string
          contact_type?: string
          created_at?: string
          email?: string | null
          full_name?: string
          is_active?: boolean
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "client_contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_directory"
            referencedColumns: ["client_id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          billing_tax_treatment: string | null
          client_id: string
          client_legal_name: string
          client_origin: string | null
          client_type: string | null
          created_at: string | null
          created_by_staff_id: string | null
          industry_id: string | null
          is_active: boolean | null
          operating_name: string | null
          parent_client_id: string | null
          parent_relationship: string | null
          tax_id: string
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          billing_tax_treatment?: string | null
          client_id?: string
          client_legal_name: string
          client_origin?: string | null
          client_type?: string | null
          created_at?: string | null
          created_by_staff_id?: string | null
          industry_id?: string | null
          is_active?: boolean | null
          operating_name?: string | null
          parent_client_id?: string | null
          parent_relationship?: string | null
          tax_id: string
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          billing_tax_treatment?: string | null
          client_id?: string
          client_legal_name?: string
          client_origin?: string | null
          client_type?: string | null
          created_at?: string | null
          created_by_staff_id?: string | null
          industry_id?: string | null
          is_active?: boolean | null
          operating_name?: string | null
          parent_client_id?: string | null
          parent_relationship?: string | null
          tax_id?: string
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
          {
            foreignKeyName: "clients_parent_client_id_fkey"
            columns: ["parent_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "clients_parent_client_id_fkey"
            columns: ["parent_client_id"]
            isOneToOne: false
            referencedRelation: "clients_directory"
            referencedColumns: ["client_id"]
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
          society_id: string
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
          society_id: string
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
          society_id?: string
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
      exchange_rate_history: {
        Row: {
          actualizado_en: string
          canal: string
          compra: number
          created_at: string
          estado: string
          fecha_publicacion: string | null
          fecha_vigencia: string
          fetched_at: string
          fuente: string
          id: string
          moneda: string
          regimen: string | null
          venta: number
          version_metodologia: string | null
        }
        Insert: {
          actualizado_en: string
          canal: string
          compra: number
          created_at?: string
          estado: string
          fecha_publicacion?: string | null
          fecha_vigencia: string
          fetched_at?: string
          fuente: string
          id?: string
          moneda?: string
          regimen?: string | null
          venta: number
          version_metodologia?: string | null
        }
        Update: {
          actualizado_en?: string
          canal?: string
          compra?: number
          created_at?: string
          estado?: string
          fecha_publicacion?: string | null
          fecha_vigencia?: string
          fetched_at?: string
          fuente?: string
          id?: string
          moneda?: string
          regimen?: string | null
          venta?: number
          version_metodologia?: string | null
        }
        Relationships: []
      }
      expense_types: {
        Row: {
          created_at: string | null
          default_unit_cost: number | null
          expense_name: string
          expense_type_id: string
          is_active: boolean
        }
        Insert: {
          created_at?: string | null
          default_unit_cost?: number | null
          expense_name: string
          expense_type_id?: string
          is_active?: boolean
        }
        Update: {
          created_at?: string | null
          default_unit_cost?: number | null
          expense_name?: string
          expense_type_id?: string
          is_active?: boolean
        }
        Relationships: []
      }
      fund_request_events: {
        Row: {
          action: string
          actor_staff_id: string | null
          amount: number | null
          created_at: string
          entity: string
          event_id: string
          fr_wo_id: string | null
          fre_id: string | null
          from_status: string | null
          fund_request_id: string
          notes: string | null
          seq: number
          to_status: string | null
          wo_id: string | null
        }
        Insert: {
          action: string
          actor_staff_id?: string | null
          amount?: number | null
          created_at?: string
          entity: string
          event_id?: string
          fr_wo_id?: string | null
          fre_id?: string | null
          from_status?: string | null
          fund_request_id: string
          notes?: string | null
          seq?: never
          to_status?: string | null
          wo_id?: string | null
        }
        Update: {
          action?: string
          actor_staff_id?: string | null
          amount?: number | null
          created_at?: string
          entity?: string
          event_id?: string
          fr_wo_id?: string | null
          fre_id?: string | null
          from_status?: string | null
          fund_request_id?: string
          notes?: string | null
          seq?: never
          to_status?: string | null
          wo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fund_request_events_actor_staff_id_fkey"
            columns: ["actor_staff_id"]
            isOneToOne: false
            referencedRelation: "fund_request_selectable_work_orders"
            referencedColumns: ["manager_staff_id"]
          },
          {
            foreignKeyName: "fund_request_events_actor_staff_id_fkey"
            columns: ["actor_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "fund_request_events_actor_staff_id_fkey"
            columns: ["actor_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "fund_request_events_fr_wo_id_fkey"
            columns: ["fr_wo_id"]
            isOneToOne: false
            referencedRelation: "fund_request_work_orders"
            referencedColumns: ["fr_wo_id"]
          },
          {
            foreignKeyName: "fund_request_events_fre_id_fkey"
            columns: ["fre_id"]
            isOneToOne: false
            referencedRelation: "fund_request_expenses"
            referencedColumns: ["fre_id"]
          },
          {
            foreignKeyName: "fund_request_events_fund_request_id_fkey"
            columns: ["fund_request_id"]
            isOneToOne: false
            referencedRelation: "fund_requests"
            referencedColumns: ["fund_request_id"]
          },
        ]
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
          manager_auto_approved: boolean
          manager_decided_at: string | null
          manager_notes: string | null
          rejection_reason: string | null
          returned_by_assistant: boolean
          review_auto_approved: boolean
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
          manager_auto_approved?: boolean
          manager_decided_at?: string | null
          manager_notes?: string | null
          rejection_reason?: string | null
          returned_by_assistant?: boolean
          review_auto_approved?: boolean
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
          manager_auto_approved?: boolean
          manager_decided_at?: string | null
          manager_notes?: string | null
          rejection_reason?: string | null
          returned_by_assistant?: boolean
          review_auto_approved?: boolean
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
          cancelled_at: string | null
          cancelled_by_staff_id: string | null
          cancelled_from_status:
            | Database["public"]["Enums"]["fund_request_status"]
            | null
          closed_at: string | null
          closed_by_staff_id: string | null
          created_at: string
          currency: string
          disbursed_at: string | null
          disbursed_by_staff_id: string | null
          expense_period_month: string
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
          settlement_confirmation_notes: string | null
          settlement_confirmed_at: string | null
          settlement_confirmed_by_staff_id: string | null
          settlement_iva_total: number | null
          settlement_notes: string | null
          settlement_reference: string | null
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
          cancelled_at?: string | null
          cancelled_by_staff_id?: string | null
          cancelled_from_status?:
            | Database["public"]["Enums"]["fund_request_status"]
            | null
          closed_at?: string | null
          closed_by_staff_id?: string | null
          created_at?: string
          currency: string
          disbursed_at?: string | null
          disbursed_by_staff_id?: string | null
          expense_period_month?: string
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
          settlement_confirmation_notes?: string | null
          settlement_confirmed_at?: string | null
          settlement_confirmed_by_staff_id?: string | null
          settlement_iva_total?: number | null
          settlement_notes?: string | null
          settlement_reference?: string | null
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
          cancelled_at?: string | null
          cancelled_by_staff_id?: string | null
          cancelled_from_status?:
            | Database["public"]["Enums"]["fund_request_status"]
            | null
          closed_at?: string | null
          closed_by_staff_id?: string | null
          created_at?: string
          currency?: string
          disbursed_at?: string | null
          disbursed_by_staff_id?: string | null
          expense_period_month?: string
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
          settlement_confirmation_notes?: string | null
          settlement_confirmed_at?: string | null
          settlement_confirmed_by_staff_id?: string | null
          settlement_iva_total?: number | null
          settlement_notes?: string | null
          settlement_reference?: string | null
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
            foreignKeyName: "fund_requests_cancelled_by_staff_id_fkey"
            columns: ["cancelled_by_staff_id"]
            isOneToOne: false
            referencedRelation: "fund_request_selectable_work_orders"
            referencedColumns: ["manager_staff_id"]
          },
          {
            foreignKeyName: "fund_requests_cancelled_by_staff_id_fkey"
            columns: ["cancelled_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "fund_requests_cancelled_by_staff_id_fkey"
            columns: ["cancelled_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "fund_requests_closed_by_staff_id_fkey"
            columns: ["closed_by_staff_id"]
            isOneToOne: false
            referencedRelation: "fund_request_selectable_work_orders"
            referencedColumns: ["manager_staff_id"]
          },
          {
            foreignKeyName: "fund_requests_closed_by_staff_id_fkey"
            columns: ["closed_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "fund_requests_closed_by_staff_id_fkey"
            columns: ["closed_by_staff_id"]
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
          {
            foreignKeyName: "fund_requests_settlement_confirmed_by_staff_id_fkey"
            columns: ["settlement_confirmed_by_staff_id"]
            isOneToOne: false
            referencedRelation: "fund_request_selectable_work_orders"
            referencedColumns: ["manager_staff_id"]
          },
          {
            foreignKeyName: "fund_requests_settlement_confirmed_by_staff_id_fkey"
            columns: ["settlement_confirmed_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "fund_requests_settlement_confirmed_by_staff_id_fkey"
            columns: ["settlement_confirmed_by_staff_id"]
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
          status: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          fiscal_year_end: string
          industry_id?: string
          industry_name: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          fiscal_year_end?: string
          industry_id?: string
          industry_name?: string
          status?: string
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
      notification_emails: {
        Row: {
          attempts: number
          claimed_at: string | null
          created_at: string
          dedupe_key: string
          email_id: string
          entity_id: string | null
          last_error: string | null
          notification_id: string | null
          payload: Json
          recipient_staff_id: string
          sent_at: string | null
          status: string
          to_email: string
          to_name: string | null
          type_key: string
        }
        Insert: {
          attempts?: number
          claimed_at?: string | null
          created_at?: string
          dedupe_key: string
          email_id?: string
          entity_id?: string | null
          last_error?: string | null
          notification_id?: string | null
          payload?: Json
          recipient_staff_id: string
          sent_at?: string | null
          status?: string
          to_email: string
          to_name?: string | null
          type_key: string
        }
        Update: {
          attempts?: number
          claimed_at?: string | null
          created_at?: string
          dedupe_key?: string
          email_id?: string
          entity_id?: string | null
          last_error?: string | null
          notification_id?: string | null
          payload?: Json
          recipient_staff_id?: string
          sent_at?: string | null
          status?: string
          to_email?: string
          to_name?: string | null
          type_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_emails_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["notification_id"]
          },
          {
            foreignKeyName: "notification_emails_recipient_staff_id_fkey"
            columns: ["recipient_staff_id"]
            isOneToOne: false
            referencedRelation: "fund_request_selectable_work_orders"
            referencedColumns: ["manager_staff_id"]
          },
          {
            foreignKeyName: "notification_emails_recipient_staff_id_fkey"
            columns: ["recipient_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "notification_emails_recipient_staff_id_fkey"
            columns: ["recipient_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "notification_emails_type_key_fkey"
            columns: ["type_key"]
            isOneToOne: false
            referencedRelation: "notification_types"
            referencedColumns: ["type_key"]
          },
        ]
      }
      notification_role_types: {
        Row: {
          created_at: string
          role_key: string
          scope_key: string
          type_key: string
        }
        Insert: {
          created_at?: string
          role_key: string
          scope_key: string
          type_key: string
        }
        Update: {
          created_at?: string
          role_key?: string
          scope_key?: string
          type_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_role_types_role_key_fkey"
            columns: ["role_key"]
            isOneToOne: false
            referencedRelation: "authorization_roles"
            referencedColumns: ["role_key"]
          },
          {
            foreignKeyName: "notification_role_types_type_key_fkey"
            columns: ["type_key"]
            isOneToOne: false
            referencedRelation: "notification_types"
            referencedColumns: ["type_key"]
          },
        ]
      }
      notification_types: {
        Row: {
          created_at: string
          delivery: string
          display_order: number
          email_enabled: boolean
          is_active: boolean
          label_key: string
          module_key: string
          type_key: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          delivery: string
          display_order?: number
          email_enabled?: boolean
          is_active?: boolean
          label_key: string
          module_key: string
          type_key: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          delivery?: string
          display_order?: number
          email_enabled?: boolean
          is_active?: boolean
          label_key?: string
          module_key?: string
          type_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          dismissed_at: string | null
          entity_id: string | null
          notification_id: string
          payload: Json
          read_at: string | null
          recipient_staff_id: string
          type_key: string
        }
        Insert: {
          created_at?: string
          dismissed_at?: string | null
          entity_id?: string | null
          notification_id?: string
          payload?: Json
          read_at?: string | null
          recipient_staff_id: string
          type_key: string
        }
        Update: {
          created_at?: string
          dismissed_at?: string | null
          entity_id?: string | null
          notification_id?: string
          payload?: Json
          read_at?: string | null
          recipient_staff_id?: string
          type_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_recipient_staff_id_fkey"
            columns: ["recipient_staff_id"]
            isOneToOne: false
            referencedRelation: "fund_request_selectable_work_orders"
            referencedColumns: ["manager_staff_id"]
          },
          {
            foreignKeyName: "notifications_recipient_staff_id_fkey"
            columns: ["recipient_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "notifications_recipient_staff_id_fkey"
            columns: ["recipient_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "notifications_type_key_fkey"
            columns: ["type_key"]
            isOneToOne: false
            referencedRelation: "notification_types"
            referencedColumns: ["type_key"]
          },
        ]
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
      portfolio_events: {
        Row: {
          actor_user_id: string | null
          created_at: string
          engagement_id: string
          event_id: string
          event_type: string
          occurred_at: string
          previous_staff_id: string | null
          subject_staff_id: string | null
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          engagement_id: string
          event_id?: string
          event_type: string
          occurred_at?: string
          previous_staff_id?: string | null
          subject_staff_id?: string | null
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          engagement_id?: string
          event_id?: string
          event_type?: string
          occurred_at?: string
          previous_staff_id?: string | null
          subject_staff_id?: string | null
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
          etl_split_index: number
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
          etl_split_index?: number
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
          etl_split_index?: number
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
      timesheet_reversal_requests: {
        Row: {
          created_at: string
          engagement_id: string | null
          is_direct: boolean
          period_id: string
          reason: string
          request_id: string
          requested_at: string
          requested_by: string
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          scope: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          engagement_id?: string | null
          is_direct?: boolean
          period_id: string
          reason: string
          request_id?: string
          requested_at?: string
          requested_by: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          scope: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          engagement_id?: string | null
          is_direct?: boolean
          period_id?: string
          reason?: string
          request_id?: string
          requested_at?: string
          requested_by?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          scope?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "timesheet_reversal_requests_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "engagements"
            referencedColumns: ["engagement_id"]
          },
          {
            foreignKeyName: "timesheet_reversal_requests_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "fund_request_selectable_work_orders"
            referencedColumns: ["engagement_id"]
          },
          {
            foreignKeyName: "timesheet_reversal_requests_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "timesheet_periods"
            referencedColumns: ["period_id"]
          },
          {
            foreignKeyName: "timesheet_reversal_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "fund_request_selectable_work_orders"
            referencedColumns: ["manager_staff_id"]
          },
          {
            foreignKeyName: "timesheet_reversal_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "timesheet_reversal_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "timesheet_reversal_requests_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "fund_request_selectable_work_orders"
            referencedColumns: ["manager_staff_id"]
          },
          {
            foreignKeyName: "timesheet_reversal_requests_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "timesheet_reversal_requests_resolved_by_fkey"
            columns: ["resolved_by"]
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
          deletion_email: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          role_key: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          deletion_email?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          role_key?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          deletion_email?: string | null
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
      wo_installment_adjustments: {
        Row: {
          adjustment_id: string
          adjustment_type: string
          amount: number
          created_at: string
          created_by_staff_id: string | null
          currency: string
          deleted_at: string | null
          deleted_by_staff_id: string | null
          installment_id: string
          reason: string
          wo_id: string
        }
        Insert: {
          adjustment_id?: string
          adjustment_type: string
          amount: number
          created_at?: string
          created_by_staff_id?: string | null
          currency: string
          deleted_at?: string | null
          deleted_by_staff_id?: string | null
          installment_id: string
          reason: string
          wo_id: string
        }
        Update: {
          adjustment_id?: string
          adjustment_type?: string
          amount?: number
          created_at?: string
          created_by_staff_id?: string | null
          currency?: string
          deleted_at?: string | null
          deleted_by_staff_id?: string | null
          installment_id?: string
          reason?: string
          wo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wo_installment_adjustments_created_by_fkey"
            columns: ["created_by_staff_id"]
            isOneToOne: false
            referencedRelation: "fund_request_selectable_work_orders"
            referencedColumns: ["manager_staff_id"]
          },
          {
            foreignKeyName: "wo_installment_adjustments_created_by_fkey"
            columns: ["created_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "wo_installment_adjustments_created_by_fkey"
            columns: ["created_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "wo_installment_adjustments_deleted_by_fkey"
            columns: ["deleted_by_staff_id"]
            isOneToOne: false
            referencedRelation: "fund_request_selectable_work_orders"
            referencedColumns: ["manager_staff_id"]
          },
          {
            foreignKeyName: "wo_installment_adjustments_deleted_by_fkey"
            columns: ["deleted_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "wo_installment_adjustments_deleted_by_fkey"
            columns: ["deleted_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "wo_installment_adjustments_installment_id_fkey"
            columns: ["installment_id"]
            isOneToOne: false
            referencedRelation: "wo_payment_installments"
            referencedColumns: ["installment_id"]
          },
          {
            foreignKeyName: "wo_installment_adjustments_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "fund_request_selectable_work_orders"
            referencedColumns: ["wo_id"]
          },
          {
            foreignKeyName: "wo_installment_adjustments_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "vw_wo_budget_hours_by_category"
            referencedColumns: ["wo_id"]
          },
          {
            foreignKeyName: "wo_installment_adjustments_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "vw_wo_budget_hours_by_category_activity"
            referencedColumns: ["wo_id"]
          },
          {
            foreignKeyName: "wo_installment_adjustments_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "work_order_summary"
            referencedColumns: ["wo_id"]
          },
          {
            foreignKeyName: "wo_installment_adjustments_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["wo_id"]
          },
        ]
      }
      wo_installment_events: {
        Row: {
          action: string
          actor_staff_id: string | null
          amount: number | null
          created_at: string
          currency: string | null
          event_id: string
          from_status: string | null
          installment_id: string
          new_date: string | null
          old_date: string | null
          reason: string | null
          seq: number
          to_status: string | null
          wo_id: string
        }
        Insert: {
          action: string
          actor_staff_id?: string | null
          amount?: number | null
          created_at?: string
          currency?: string | null
          event_id?: string
          from_status?: string | null
          installment_id: string
          new_date?: string | null
          old_date?: string | null
          reason?: string | null
          seq?: never
          to_status?: string | null
          wo_id: string
        }
        Update: {
          action?: string
          actor_staff_id?: string | null
          amount?: number | null
          created_at?: string
          currency?: string | null
          event_id?: string
          from_status?: string | null
          installment_id?: string
          new_date?: string | null
          old_date?: string | null
          reason?: string | null
          seq?: never
          to_status?: string | null
          wo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wo_installment_events_actor_staff_id_fkey"
            columns: ["actor_staff_id"]
            isOneToOne: false
            referencedRelation: "fund_request_selectable_work_orders"
            referencedColumns: ["manager_staff_id"]
          },
          {
            foreignKeyName: "wo_installment_events_actor_staff_id_fkey"
            columns: ["actor_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "wo_installment_events_actor_staff_id_fkey"
            columns: ["actor_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "wo_installment_events_installment_id_fkey"
            columns: ["installment_id"]
            isOneToOne: false
            referencedRelation: "wo_payment_installments"
            referencedColumns: ["installment_id"]
          },
          {
            foreignKeyName: "wo_installment_events_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "fund_request_selectable_work_orders"
            referencedColumns: ["wo_id"]
          },
          {
            foreignKeyName: "wo_installment_events_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "vw_wo_budget_hours_by_category"
            referencedColumns: ["wo_id"]
          },
          {
            foreignKeyName: "wo_installment_events_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "vw_wo_budget_hours_by_category_activity"
            referencedColumns: ["wo_id"]
          },
          {
            foreignKeyName: "wo_installment_events_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "work_order_summary"
            referencedColumns: ["wo_id"]
          },
          {
            foreignKeyName: "wo_installment_events_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["wo_id"]
          },
        ]
      }
      wo_installment_expenses: {
        Row: {
          amount: number
          created_at: string
          fre_id: string
          installment_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          fre_id: string
          installment_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          fre_id?: string
          installment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wo_installment_expenses_fre_id_fkey"
            columns: ["fre_id"]
            isOneToOne: true
            referencedRelation: "fund_request_expenses"
            referencedColumns: ["fre_id"]
          },
          {
            foreignKeyName: "wo_installment_expenses_installment_id_fkey"
            columns: ["installment_id"]
            isOneToOne: false
            referencedRelation: "wo_payment_installments"
            referencedColumns: ["installment_id"]
          },
        ]
      }
      wo_installment_note_versions: {
        Row: {
          body: string
          created_at: string
          edited_by_staff_id: string | null
          note_id: string
          seq: number
          version_id: string
        }
        Insert: {
          body: string
          created_at?: string
          edited_by_staff_id?: string | null
          note_id: string
          seq?: never
          version_id?: string
        }
        Update: {
          body?: string
          created_at?: string
          edited_by_staff_id?: string | null
          note_id?: string
          seq?: never
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wo_installment_note_versions_edited_by_staff_id_fkey"
            columns: ["edited_by_staff_id"]
            isOneToOne: false
            referencedRelation: "fund_request_selectable_work_orders"
            referencedColumns: ["manager_staff_id"]
          },
          {
            foreignKeyName: "wo_installment_note_versions_edited_by_staff_id_fkey"
            columns: ["edited_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "wo_installment_note_versions_edited_by_staff_id_fkey"
            columns: ["edited_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "wo_installment_note_versions_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "wo_installment_notes"
            referencedColumns: ["note_id"]
          },
        ]
      }
      wo_installment_notes: {
        Row: {
          author_role: string | null
          author_staff_id: string | null
          body: string
          created_at: string
          deleted_at: string | null
          installment_id: string | null
          note_id: string
          updated_at: string
          wo_id: string
        }
        Insert: {
          author_role?: string | null
          author_staff_id?: string | null
          body: string
          created_at?: string
          deleted_at?: string | null
          installment_id?: string | null
          note_id?: string
          updated_at?: string
          wo_id: string
        }
        Update: {
          author_role?: string | null
          author_staff_id?: string | null
          body?: string
          created_at?: string
          deleted_at?: string | null
          installment_id?: string | null
          note_id?: string
          updated_at?: string
          wo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wo_installment_notes_author_staff_id_fkey"
            columns: ["author_staff_id"]
            isOneToOne: false
            referencedRelation: "fund_request_selectable_work_orders"
            referencedColumns: ["manager_staff_id"]
          },
          {
            foreignKeyName: "wo_installment_notes_author_staff_id_fkey"
            columns: ["author_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "wo_installment_notes_author_staff_id_fkey"
            columns: ["author_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "wo_installment_notes_installment_id_fkey"
            columns: ["installment_id"]
            isOneToOne: false
            referencedRelation: "wo_payment_installments"
            referencedColumns: ["installment_id"]
          },
          {
            foreignKeyName: "wo_installment_notes_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "fund_request_selectable_work_orders"
            referencedColumns: ["wo_id"]
          },
          {
            foreignKeyName: "wo_installment_notes_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "vw_wo_budget_hours_by_category"
            referencedColumns: ["wo_id"]
          },
          {
            foreignKeyName: "wo_installment_notes_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "vw_wo_budget_hours_by_category_activity"
            referencedColumns: ["wo_id"]
          },
          {
            foreignKeyName: "wo_installment_notes_wo_id_fkey"
            columns: ["wo_id"]
            isOneToOne: false
            referencedRelation: "work_order_summary"
            referencedColumns: ["wo_id"]
          },
          {
            foreignKeyName: "wo_installment_notes_wo_id_fkey"
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
          confirmation_status: string
          confirmed_at: string | null
          confirmed_by: string | null
          confirmed_for_date: string | null
          created_at: string | null
          currency: string | null
          current_invoice_date: string | null
          current_payment_date: string | null
          installment_id: string
          installment_number: number
          installment_type: string
          invoice_exchange_rate: number | null
          invoice_exchange_rate_date: string | null
          net_amount: number | null
          payment_date_actual: string | null
          payment_exchange_rate: number | null
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
          confirmation_status?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          confirmed_for_date?: string | null
          created_at?: string | null
          currency?: string | null
          current_invoice_date?: string | null
          current_payment_date?: string | null
          installment_id?: string
          installment_number: number
          installment_type?: string
          invoice_exchange_rate?: number | null
          invoice_exchange_rate_date?: string | null
          net_amount?: number | null
          payment_date_actual?: string | null
          payment_exchange_rate?: number | null
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
          confirmation_status?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          confirmed_for_date?: string | null
          created_at?: string | null
          currency?: string | null
          current_invoice_date?: string | null
          current_payment_date?: string | null
          installment_id?: string
          installment_number?: number
          installment_type?: string
          invoice_exchange_rate?: number | null
          invoice_exchange_rate_date?: string | null
          net_amount?: number | null
          payment_date_actual?: string | null
          payment_exchange_rate?: number | null
          percentage?: number
          plan_id?: string
          status?: string
          updated_at?: string | null
          wo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wo_payment_installments_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "fund_request_selectable_work_orders"
            referencedColumns: ["manager_staff_id"]
          },
          {
            foreignKeyName: "wo_payment_installments_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "wo_payment_installments_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["staff_id"]
          },
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
          exchange_rate: number
          exchange_rate_mode: string
          payment_days: number
          plan_id: string
          updated_at: string | null
          wo_id: string
        }
        Insert: {
          created_at?: string | null
          exchange_rate?: number
          exchange_rate_mode?: string
          payment_days?: number
          plan_id?: string
          updated_at?: string | null
          wo_id: string
        }
        Update: {
          created_at?: string | null
          exchange_rate?: number
          exchange_rate_mode?: string
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
          client_id: string | null
          client_legal_name: string | null
          is_active: boolean | null
        }
        Insert: {
          client_id?: string | null
          client_legal_name?: string | null
          is_active?: boolean | null
        }
        Update: {
          client_id?: string | null
          client_legal_name?: string | null
          is_active?: boolean | null
        }
        Relationships: []
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
          seen_at: string | null
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
      add_installment_adjustment: {
        Args: {
          p_amount: number
          p_installment_id: string
          p_reason: string
          p_type: string
        }
        Returns: {
          adjustment_id: string
          adjustment_type: string
          amount: number
          created_at: string
          created_by_staff_id: string | null
          currency: string
          deleted_at: string | null
          deleted_by_staff_id: string | null
          installment_id: string
          reason: string
          wo_id: string
        }
        SetofOptions: {
          from: "*"
          to: "wo_installment_adjustments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      add_installment_note: {
        Args: { p_body: string; p_installment_id: string; p_wo_id: string }
        Returns: {
          author_role: string | null
          author_staff_id: string | null
          body: string
          created_at: string
          deleted_at: string | null
          installment_id: string | null
          note_id: string
          updated_at: string
          wo_id: string
        }
        SetofOptions: {
          from: "*"
          to: "wo_installment_notes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
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
      begin_notification_email_attempt: {
        Args: { p_email_id: string }
        Returns: number
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
      can_read_engagement_dashboard: {
        Args: { p_engagement_id: string }
        Returns: boolean
      }
      check_login_allowed: { Args: { p_email: string }; Returns: Json }
      check_pending_hours_before_termination: {
        Args: { p_staff_id: string; p_termination_date: string }
        Returns: Json
      }
      claim_auth_email_slot: {
        Args: {
          p_email: string
          p_max_global?: number
          p_max_por_hora?: number
          p_min_segundos?: number
        }
        Returns: boolean
      }
      claim_notification_emails: {
        Args: { p_limit?: number }
        Returns: {
          attempts: number
          email_id: string
          entity_id: string
          payload: Json
          to_email: string
          to_name: string
          type_key: string
        }[]
      }
      clear_account_deletion_mark: {
        Args: { p_user_id: string }
        Returns: Json
      }
      client_contacts_visible: {
        Args: { p_client_id: string }
        Returns: boolean
      }
      client_has_required_contacts: {
        Args: { p_client_id: string }
        Returns: boolean
      }
      collect_installment: {
        Args: {
          p_expected_status: string
          p_installment_id: string
          p_payment_date?: string
          p_payment_exchange_rate?: number
        }
        Returns: {
          agreed_invoice_date: string | null
          agreed_payment_date: string | null
          amount: number | null
          collection_invoice_date: string | null
          collection_payment_date: string | null
          confirmation_status: string
          confirmed_at: string | null
          confirmed_by: string | null
          confirmed_for_date: string | null
          created_at: string | null
          currency: string | null
          current_invoice_date: string | null
          current_payment_date: string | null
          installment_id: string
          installment_number: number
          installment_type: string
          invoice_exchange_rate: number | null
          invoice_exchange_rate_date: string | null
          net_amount: number | null
          payment_date_actual: string | null
          payment_exchange_rate: number | null
          percentage: number
          plan_id: string
          status: string
          updated_at: string | null
          wo_id: string
        }
        SetofOptions: {
          from: "*"
          to: "wo_payment_installments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      collections_filter_options: { Args: never; Returns: Json }
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
          p_default_role_key?: string
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
          default_role_key: string | null
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
          society_id: string
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
      create_expense_reimbursement_row: {
        Args: { p_payment_due_date?: string; p_wo_id: string }
        Returns: {
          agreed_invoice_date: string | null
          agreed_payment_date: string | null
          amount: number | null
          collection_invoice_date: string | null
          collection_payment_date: string | null
          confirmation_status: string
          confirmed_at: string | null
          confirmed_by: string | null
          confirmed_for_date: string | null
          created_at: string | null
          currency: string | null
          current_invoice_date: string | null
          current_payment_date: string | null
          installment_id: string
          installment_number: number
          installment_type: string
          invoice_exchange_rate: number | null
          invoice_exchange_rate_date: string | null
          net_amount: number | null
          payment_date_actual: string | null
          payment_exchange_rate: number | null
          percentage: number
          plan_id: string
          status: string
          updated_at: string | null
          wo_id: string
        }
        SetofOptions: {
          from: "*"
          to: "wo_payment_installments"
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
      delete_installment_adjustment: {
        Args: { p_adjustment_id: string }
        Returns: {
          adjustment_id: string
          adjustment_type: string
          amount: number
          created_at: string
          created_by_staff_id: string | null
          currency: string
          deleted_at: string | null
          deleted_by_staff_id: string | null
          installment_id: string
          reason: string
          wo_id: string
        }
        SetofOptions: {
          from: "*"
          to: "wo_installment_adjustments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      delete_installment_note: {
        Args: { p_note_id: string }
        Returns: {
          author_role: string | null
          author_staff_id: string | null
          body: string
          created_at: string
          deleted_at: string | null
          installment_id: string | null
          note_id: string
          updated_at: string
          wo_id: string
        }
        SetofOptions: {
          from: "*"
          to: "wo_installment_notes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      dismiss_notifications: { Args: { p_ids: string[] }; Returns: number }
      edit_installment_note: {
        Args: { p_body: string; p_note_id: string }
        Returns: {
          author_role: string | null
          author_staff_id: string | null
          body: string
          created_at: string
          deleted_at: string | null
          installment_id: string | null
          note_id: string
          updated_at: string
          wo_id: string
        }
        SetofOptions: {
          from: "*"
          to: "wo_installment_notes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      effective_engagement_state: {
        Args: {
          p_approval_status: string
          p_approved_at: string
          p_override: number
          p_risk_status: string
          p_wo_id: string
          p_wo_required: boolean
        }
        Returns: number
      }
      engagement_accepts_assignment_writes: {
        Args: { p_engagement_id: string }
        Returns: boolean
      }
      engagement_allows_hours_or_requests: {
        Args: { p_engagement_id: string }
        Returns: boolean
      }
      engagement_approval_bucket: {
        Args: { p_staff_id: string; p_status: string }
        Returns: Json
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
      engagement_overview: {
        Args: { p_end: string; p_engagement_id: string; p_start: string }
        Returns: Json
      }
      exchange_rate_on: { Args: { p_date: string }; Returns: number }
      execute_timesheet_reversal: {
        Args: {
          p_engagement_id?: string
          p_period_id: string
          p_reason?: string
          p_request_id?: string
          p_scope: string
        }
        Returns: string
      }
      finalize_all_stale_timers: { Args: never; Returns: number }
      finalize_due_engagements: { Args: never; Returns: number }
      finalize_my_stale_timers: { Args: never; Returns: number }
      fr_accounting_sees: {
        Args: {
          p_cancelled_from: Database["public"]["Enums"]["fund_request_status"]
          p_status: Database["public"]["Enums"]["fund_request_status"]
        }
        Returns: boolean
      }
      fr_is_ot_manager: { Args: { p_fr_id: string }; Returns: boolean }
      fr_is_requester: { Args: { p_fr_id: string }; Returns: boolean }
      fr_is_submitted: { Args: { p_fr_id: string }; Returns: boolean }
      fund_expense_in_process: {
        Args: { p_period_month: string; p_status: string }
        Returns: boolean
      }
      fund_request_cancel: {
        Args: { p_fund_request_id: string; p_reason: string }
        Returns: undefined
      }
      fund_request_confirm_settlement: {
        Args: {
          p_fund_request_id: string
          p_notes?: string
          p_reference?: string
        }
        Returns: undefined
      }
      fund_request_deadline: { Args: { p_month: string }; Returns: string }
      fund_request_disburse: {
        Args: {
          p_amount: number
          p_fund_request_id: string
          p_new_month?: string
          p_notes?: string
        }
        Returns: undefined
      }
      fund_request_expense_review: {
        Args: { p_decision: string; p_fre_id: string; p_notes?: string }
        Returns: undefined
      }
      fund_request_month_is_selectable: {
        Args: { p_month: string }
        Returns: boolean
      }
      fund_request_review_deadline: {
        Args: { p_month: string }
        Returns: string
      }
      fund_request_run_deadlines: { Args: { p_today?: string }; Returns: Json }
      fund_request_save_edit: {
        Args: { p_allocations: Json; p_fields: Json; p_fund_request_id: string }
        Returns: undefined
      }
      fund_request_settle: {
        Args: {
          p_amount: number
          p_fund_request_id: string
          p_notes?: string
          p_resolution: string
        }
        Returns: undefined
      }
      fund_request_submit: {
        Args: { p_fund_request_id: string }
        Returns: undefined
      }
      fund_today: { Args: never; Returns: string }
      fund_work_order_expense_detail: {
        Args: { p_wo_id: string }
        Returns: Json
      }
      fund_work_order_expense_summary: {
        Args: never
        Returns: {
          assigned: number
          budget: number
          client_name: string
          engagement_code: string
          engagement_name: string
          expense_count: number
          in_process: number
          request_count: number
          spent: number
          wo_id: string
        }[]
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
      get_my_notification_aggregates: { Args: never; Returns: Json }
      get_my_notifications: { Args: { p_limit?: number }; Returns: Json }
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
      get_wo_client_contacts: {
        Args: { p_wo_id: string }
        Returns: {
          client_id: string
          contact_id: string
          contact_type: string
          created_at: string
          email: string | null
          full_name: string
          is_active: boolean
          phone: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "client_contacts"
          isOneToOne: false
          isSetofReturn: true
        }
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
      installment_adjustments_total: {
        Args: { p_currency: string; p_installment_id: string }
        Returns: number
      }
      installment_calendar_state: {
        Args: {
          p_invoice_date: string
          p_payment_due_date: string
          p_status: string
          p_today: string
          p_window_days?: number
        }
        Returns: string
      }
      invoice_installment: {
        Args: {
          p_expected_status: string
          p_installment_id: string
          p_invoice_date?: string
          p_invoice_exchange_rate?: number
          p_invoice_exchange_rate_date?: string
          p_payment_due_date: string
        }
        Returns: {
          agreed_invoice_date: string | null
          agreed_payment_date: string | null
          amount: number | null
          collection_invoice_date: string | null
          collection_payment_date: string | null
          confirmation_status: string
          confirmed_at: string | null
          confirmed_by: string | null
          confirmed_for_date: string | null
          created_at: string | null
          currency: string | null
          current_invoice_date: string | null
          current_payment_date: string | null
          installment_id: string
          installment_number: number
          installment_type: string
          invoice_exchange_rate: number | null
          invoice_exchange_rate_date: string | null
          net_amount: number | null
          payment_date_actual: string | null
          payment_exchange_rate: number | null
          percentage: number
          plan_id: string
          status: string
          updated_at: string | null
          wo_id: string
        }
        SetofOptions: {
          from: "*"
          to: "wo_payment_installments"
          isOneToOne: true
          isSetofReturn: false
        }
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
      is_collections_role: { Args: never; Returns: boolean }
      is_engagement_responsible: {
        Args: { p_engagement_id: string }
        Returns: boolean
      }
      is_engagement_team_member: {
        Args: { p_engagement_id: string }
        Returns: boolean
      }
      is_firm_hours_reader: { Args: never; Returns: boolean }
      latest_exchange_rate: { Args: never; Returns: number }
      list_administrative_engagements: { Args: never; Returns: Json }
      list_administrative_internal_clients: { Args: never; Returns: Json }
      list_collections_installments: {
        Args: {
          p_client_id?: string
          p_currency?: string
          p_date_from?: string
          p_date_to?: string
          p_include_expense_rows?: boolean
          p_limit?: number
          p_manager_id?: string
          p_offset?: number
          p_order?: string
          p_practica?: number
          p_search?: string
          p_society_id?: string
          p_tab?: string
        }
        Returns: Json
      }
      list_dashboard_engagements: { Args: never; Returns: Json }
      list_loggable_engagements: {
        Args: never
        Returns: {
          activity_required: boolean
          client_id: string
          client_legal_name: string
          end_date: string
          engagement_code: string
          engagement_id: string
          engagement_name: string
          engagement_state_override: number
          funcion: number
          is_internal: boolean
          practica: number
          start_date: string
          work_order_required: boolean
        }[]
      }
      list_my_assignments: {
        Args: { p_date_from: string; p_date_to: string; p_toggle: string }
        Returns: {
          allocation_percent: number
          assignment_id: string
          category_id: string
          category_name: string
          client_id: string
          client_legal_name: string
          deleted_at: string
          end_date: string
          engagement_code: string
          engagement_id: string
          engagement_name: string
          hours_per_week: number
          notes: string
          start_date: string
          status: string
        }[]
      }
      list_own_engagement_labels: {
        Args: { p_engagement_ids: string[] }
        Returns: {
          end_date: string
          engagement_code: string
          engagement_id: string
          engagement_name: string
          start_date: string
        }[]
      }
      list_own_timer_engagement_labels: {
        Args: { p_engagement_ids: string[] }
        Returns: {
          engagement_code: string
          engagement_id: string
          engagement_name: string
        }[]
      }
      list_portfolio_engagements: { Args: never; Returns: Json }
      mark_notification_email_result: {
        Args: { p_email_id: string; p_error?: string; p_ok: boolean }
        Returns: boolean
      }
      mark_notifications_read: { Args: { p_ids: string[] }; Returns: number }
      move_category: {
        Args: { p_category_id: string; p_new_position: number }
        Returns: undefined
      }
      my_approvable_period_ids: { Args: never; Returns: string[] }
      my_assigned_client_ids: { Args: never; Returns: string[] }
      my_assigned_engagement_ids: { Args: never; Returns: string[] }
      my_assigned_wo_ids: { Args: never; Returns: string[] }
      my_assignment_engagement_ids: { Args: never; Returns: string[] }
      my_fund_request_engagement_ids: { Args: never; Returns: string[] }
      my_fund_request_wo_ids: { Args: never; Returns: string[] }
      my_line_approval_mode: { Args: never; Returns: string }
      my_managed_visible_plan_ids: { Args: never; Returns: string[] }
      my_managed_visible_wo_ids: { Args: never; Returns: string[] }
      my_responsible_engagement_ids: { Args: never; Returns: string[] }
      my_responsible_period_ids: { Args: never; Returns: string[] }
      my_sqr_visible_engagement_ids: { Args: never; Returns: string[] }
      my_staffed_engagement_ids: { Args: never; Returns: string[] }
      my_team_engagement_ids: { Args: never; Returns: string[] }
      my_team_plan_ids: { Args: never; Returns: string[] }
      my_team_wo_ids: { Args: never; Returns: string[] }
      my_visible_engagement_ids: { Args: never; Returns: string[] }
      notif_agg_approval_training_pending: { Args: never; Returns: Json }
      notif_agg_fund_closure_pending: { Args: never; Returns: Json }
      notif_agg_fund_disbursement_pending: { Args: never; Returns: Json }
      notif_agg_fund_expense_review_pending: { Args: never; Returns: Json }
      notif_agg_fund_settlement_pending: { Args: never; Returns: Json }
      notif_agg_scheduler_coverage_gap: {
        Args: { p_scope: string; p_staff_id: string }
        Returns: Json
      }
      notif_agg_timesheet_overdue: { Args: { p_weeks: Json }; Returns: Json }
      notif_agg_timesheet_pending_approval: {
        Args: { p_from: string; p_staff_id: string }
        Returns: Json
      }
      notif_agg_timesheet_reverted: { Args: { p_weeks: Json }; Returns: Json }
      notif_agg_wo_installment_due_this_week: { Args: never; Returns: Json }
      notif_agg_wo_installment_overdue: {
        Args: { p_scope: string; p_staff_id: string }
        Returns: Json
      }
      notif_client_assigned: {
        Args: { p_client_id: string }
        Returns: {
          staff_id: string
        }[]
      }
      notif_contador: {
        Args: { p_clave: string; p_payload: Json }
        Returns: number
      }
      notif_emit_approval_reminder_weekly: { Args: never; Returns: number }
      notif_emit_fund_auto_approval: {
        Args: {
          p_count: number
          p_fund_request_id: string
          p_managers: string[]
          p_type_key: string
        }
        Returns: undefined
      }
      notif_emit_fund_deadline_reminders: {
        Args: { p_today?: string }
        Returns: number
      }
      notif_emit_fund_expired: {
        Args: { p_count: number; p_fund_request_id: string }
        Returns: undefined
      }
      notif_emit_fund_reminder_weekly: { Args: never; Returns: number }
      notif_emit_timesheet_reminder_daily: { Args: never; Returns: number }
      notif_emit_wo_installment_reminder_weekly: {
        Args: never
        Returns: number
      }
      notif_engagement_daily_scheduled: { Args: never; Returns: number }
      notif_engagement_managers: {
        Args: { p_engagement_id: string }
        Returns: {
          staff_id: string
        }[]
      }
      notif_engagement_owners: {
        Args: { p_engagement_id: string }
        Returns: {
          staff_id: string
        }[]
      }
      notif_engagement_partners: {
        Args: { p_engagement_id: string }
        Returns: {
          staff_id: string
        }[]
      }
      notif_engagement_staffed: {
        Args: { p_engagement_id: string }
        Returns: {
          staff_id: string
        }[]
      }
      notif_fund_request_managers: {
        Args: { p_fund_request_id: string }
        Returns: {
          staff_id: string
        }[]
      }
      notif_fund_sent_today: {
        Args: { p_entity_id: string; p_staff_id: string; p_type_key: string }
        Returns: boolean
      }
      notif_installment_adjustment: {
        Args: {
          p_evento: string
          p_row: Database["public"]["Tables"]["wo_installment_adjustments"]["Row"]
        }
        Returns: number
      }
      notif_installment_expense_row: {
        Args: {
          p_evento: string
          p_row: Database["public"]["Tables"]["wo_payment_installments"]["Row"]
        }
        Returns: number
      }
      notif_installment_note_added: {
        Args: {
          p_note: Database["public"]["Tables"]["wo_installment_notes"]["Row"]
        }
        Returns: number
      }
      notif_installment_rescheduled: {
        Args: {
          p_old_date: string
          p_reason: string
          p_row: Database["public"]["Tables"]["wo_payment_installments"]["Row"]
        }
        Returns: number
      }
      notif_origen_cambio_rol: { Args: never; Returns: string }
      notif_permiso_de_ruta: {
        Args: { p_module_key: string; p_payload: Json; p_type_key: string }
        Returns: string
      }
      notif_role_tiene: {
        Args: { p_role_key: string; p_type_key: string }
        Returns: boolean
      }
      notif_scope_of: {
        Args: { p_staff_id: string; p_type_key: string }
        Returns: string
      }
      notif_staff_by_practice: {
        Args: { p_practica_id: string; p_role_keys: string[] }
        Returns: {
          staff_id: string
        }[]
      }
      notif_staff_by_roles: {
        Args: { p_role_keys: string[] }
        Returns: {
          staff_id: string
        }[]
      }
      notif_timesheet_period_leads: {
        Args: { p_period_id: string }
        Returns: {
          staff_id: string
        }[]
      }
      notif_timesheet_window_start: { Args: never; Returns: string }
      notif_wo_daily_scheduled: { Args: never; Returns: number }
      notify_staff: {
        Args: {
          p_entity_id?: string
          p_payload?: Json
          p_recipient_staff_id: string
          p_type_key: string
        }
        Returns: string
      }
      partner_overview: {
        Args: {
          p_client_id?: string
          p_end: string
          p_fiscal_year?: number
          p_industry_id?: string
          p_manager_id?: string
          p_society_id?: string
          p_start: string
        }
        Returns: Json
      }
      partner_overview_engagements: {
        Args: {
          p_client_id?: string
          p_end: string
          p_fiscal_year?: number
          p_industry_id?: string
          p_limit?: number
          p_manager_id?: string
          p_offset?: number
          p_over_budget_only?: boolean
          p_society_id?: string
          p_sort_key?: string
          p_start: string
        }
        Returns: Json
      }
      permission_scope: { Args: { p_permission_key: string }; Returns: string }
      personal_overview: {
        Args: { p_history_end: string; p_history_start: string }
        Returns: Json
      }
      portfolio_overview: {
        Args: {
          p_client_id?: string
          p_end: string
          p_fiscal_year: number
          p_fy_end: string
          p_fy_start: string
          p_practica_id?: string
          p_start: string
        }
        Returns: Json
      }
      prepare_account_deletion: { Args: { p_user_id: string }; Returns: Json }
      purge_old_auth_email_throttle: { Args: never; Returns: number }
      purge_old_notification_emails: { Args: never; Returns: number }
      purge_old_notifications: { Args: never; Returns: number }
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
      record_installment_confirmation: {
        Args: {
          p_confirmed: boolean
          p_expected_invoice_date?: string
          p_installment_id: string
          p_new_invoice_date?: string
          p_new_payment_due_date?: string
          p_note?: string
        }
        Returns: {
          agreed_invoice_date: string | null
          agreed_payment_date: string | null
          amount: number | null
          collection_invoice_date: string | null
          collection_payment_date: string | null
          confirmation_status: string
          confirmed_at: string | null
          confirmed_by: string | null
          confirmed_for_date: string | null
          created_at: string | null
          currency: string | null
          current_invoice_date: string | null
          current_payment_date: string | null
          installment_id: string
          installment_number: number
          installment_type: string
          invoice_exchange_rate: number | null
          invoice_exchange_rate_date: string | null
          net_amount: number | null
          payment_date_actual: string | null
          payment_exchange_rate: number | null
          percentage: number
          plan_id: string
          status: string
          updated_at: string | null
          wo_id: string
        }
        SetofOptions: {
          from: "*"
          to: "wo_payment_installments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reject_timesheet_reversal: {
        Args: { p_notes: string; p_request_id: string }
        Returns: undefined
      }
      release_auth_email_slot: { Args: { p_email: string }; Returns: boolean }
      reorder_practice_activity: {
        Args: { p_activity_id: string; p_new_position: number }
        Returns: undefined
      }
      request_timesheet_reversal: {
        Args: {
          p_engagement_id: string
          p_period_id: string
          p_reason: string
          p_scope: string
        }
        Returns: string
      }
      reschedule_installment: {
        Args: {
          p_expected_invoice_date?: string
          p_installment_id: string
          p_new_invoice_date: string
          p_new_payment_due_date: string
          p_reason: string
        }
        Returns: {
          agreed_invoice_date: string | null
          agreed_payment_date: string | null
          amount: number | null
          collection_invoice_date: string | null
          collection_payment_date: string | null
          confirmation_status: string
          confirmed_at: string | null
          confirmed_by: string | null
          confirmed_for_date: string | null
          created_at: string | null
          currency: string | null
          current_invoice_date: string | null
          current_payment_date: string | null
          installment_id: string
          installment_number: number
          installment_type: string
          invoice_exchange_rate: number | null
          invoice_exchange_rate_date: string | null
          net_amount: number | null
          payment_date_actual: string | null
          payment_exchange_rate: number | null
          percentage: number
          plan_id: string
          status: string
          updated_at: string | null
          wo_id: string
        }
        SetofOptions: {
          from: "*"
          to: "wo_payment_installments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reset_login_attempts: { Args: { p_email: string }; Returns: undefined }
      resolve_wo_engagement_id: { Args: { p_wo_id: string }; Returns: string }
      resolve_wo_req_skill_engagement_id: {
        Args: { p_requirement_id: string }
        Returns: string
      }
      rollback_unconfirmed_signup: {
        Args: { p_user_id: string }
        Returns: Json
      }
      save_client_contacts: {
        Args: { p_client_id: string; p_contacts: Json }
        Returns: {
          client_id: string
          contact_id: string
          contact_type: string
          created_at: string
          email: string | null
          full_name: string
          is_active: boolean
          phone: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "client_contacts"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      save_client_with_contacts: {
        Args: {
          p_client: Json
          p_client_id: string
          p_contacts: Json
          p_is_new: boolean
        }
        Returns: undefined
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
      seed_initial_holidays: { Args: { p_created_by: string }; Returns: number }
      set_expense_reimbursement_amount: {
        Args: { p_amount: number; p_installment_id: string }
        Returns: {
          agreed_invoice_date: string | null
          agreed_payment_date: string | null
          amount: number | null
          collection_invoice_date: string | null
          collection_payment_date: string | null
          confirmation_status: string
          confirmed_at: string | null
          confirmed_by: string | null
          confirmed_for_date: string | null
          created_at: string | null
          currency: string | null
          current_invoice_date: string | null
          current_payment_date: string | null
          installment_id: string
          installment_number: number
          installment_type: string
          invoice_exchange_rate: number | null
          invoice_exchange_rate_date: string | null
          net_amount: number | null
          payment_date_actual: string | null
          payment_exchange_rate: number | null
          percentage: number
          plan_id: string
          status: string
          updated_at: string | null
          wo_id: string
        }
        SetofOptions: {
          from: "*"
          to: "wo_payment_installments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_installment_overdue: {
        Args: {
          p_expected_status: string
          p_installment_id: string
          p_overdue: boolean
        }
        Returns: {
          agreed_invoice_date: string | null
          agreed_payment_date: string | null
          amount: number | null
          collection_invoice_date: string | null
          collection_payment_date: string | null
          confirmation_status: string
          confirmed_at: string | null
          confirmed_by: string | null
          confirmed_for_date: string | null
          created_at: string | null
          currency: string | null
          current_invoice_date: string | null
          current_payment_date: string | null
          installment_id: string
          installment_number: number
          installment_type: string
          invoice_exchange_rate: number | null
          invoice_exchange_rate_date: string | null
          net_amount: number | null
          payment_date_actual: string | null
          payment_exchange_rate: number | null
          percentage: number
          plan_id: string
          status: string
          updated_at: string | null
          wo_id: string
        }
        SetofOptions: {
          from: "*"
          to: "wo_payment_installments"
          isOneToOne: true
          isSetofReturn: false
        }
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
      suggest_exchange_difference: {
        Args: { p_installment_id: string }
        Returns: number
      }
      sync_user_role_from_category: {
        Args: {
          p_expected_role_key: string
          p_reason?: string
          p_staff_id: string
        }
        Returns: Json
      }
      sync_wo_payment_installments: {
        Args: { p_installments: Json; p_plan_id: string; p_wo_id: string }
        Returns: {
          agreed_invoice_date: string | null
          agreed_payment_date: string | null
          amount: number | null
          collection_invoice_date: string | null
          collection_payment_date: string | null
          confirmation_status: string
          confirmed_at: string | null
          confirmed_by: string | null
          confirmed_for_date: string | null
          created_at: string | null
          currency: string | null
          current_invoice_date: string | null
          current_payment_date: string | null
          installment_id: string
          installment_number: number
          installment_type: string
          invoice_exchange_rate: number | null
          invoice_exchange_rate_date: string | null
          net_amount: number | null
          payment_date_actual: string | null
          payment_exchange_rate: number | null
          percentage: number
          plan_id: string
          status: string
          updated_at: string | null
          wo_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "wo_payment_installments"
          isOneToOne: false
          isSetofReturn: true
        }
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
          p_default_role_key: string
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
          default_role_key: string | null
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
      wo_billable_expenses: {
        Args: { p_wo_id: string }
        Returns: {
          amount: number
          fre_id: string
        }[]
      }
      wo_in_my_fund_request: { Args: { p_wo_id: string }; Returns: boolean }
      wo_installment_assert_actionable: {
        Args: { p_expected_status: string; p_installment_id: string }
        Returns: {
          agreed_invoice_date: string | null
          agreed_payment_date: string | null
          amount: number | null
          collection_invoice_date: string | null
          collection_payment_date: string | null
          confirmation_status: string
          confirmed_at: string | null
          confirmed_by: string | null
          confirmed_for_date: string | null
          created_at: string | null
          currency: string | null
          current_invoice_date: string | null
          current_payment_date: string | null
          installment_id: string
          installment_number: number
          installment_type: string
          invoice_exchange_rate: number | null
          invoice_exchange_rate_date: string | null
          net_amount: number | null
          payment_date_actual: string | null
          payment_exchange_rate: number | null
          percentage: number
          plan_id: string
          status: string
          updated_at: string | null
          wo_id: string
        }
        SetofOptions: {
          from: "*"
          to: "wo_payment_installments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      wo_installment_assert_manager: {
        Args: { p_installment_id: string }
        Returns: {
          agreed_invoice_date: string | null
          agreed_payment_date: string | null
          amount: number | null
          collection_invoice_date: string | null
          collection_payment_date: string | null
          confirmation_status: string
          confirmed_at: string | null
          confirmed_by: string | null
          confirmed_for_date: string | null
          created_at: string | null
          currency: string | null
          current_invoice_date: string | null
          current_payment_date: string | null
          installment_id: string
          installment_number: number
          installment_type: string
          invoice_exchange_rate: number | null
          invoice_exchange_rate_date: string | null
          net_amount: number | null
          payment_date_actual: string | null
          payment_exchange_rate: number | null
          percentage: number
          plan_id: string
          status: string
          updated_at: string | null
          wo_id: string
        }
        SetofOptions: {
          from: "*"
          to: "wo_payment_installments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      wo_installment_calendar_state: {
        Args: {
          p_agreed_invoice_date: string
          p_agreed_payment_date: string
          p_collection_payment_date: string
          p_current_invoice_date: string
          p_status: string
          p_today?: string
          p_window_days?: number
        }
        Returns: string
      }
      wo_note_wo_id: { Args: { p_note_id: string }; Returns: string }
      wo_notes_participant: { Args: { p_wo_id: string }; Returns: boolean }
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
        | "vencido"
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
        "vencido",
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

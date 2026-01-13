# EMS 2.0 Entity Relationship Diagram

Database schema for the Engagement Management System.

**Last Updated:** 2026-01-13

---

```mermaid
erDiagram
    %% ═══════════════════════════════════════════════════════════════
    %% CORE REFERENCE TABLES
    %% ═══════════════════════════════════════════════════════════════
    
    categories {
        uuid category_id PK
        varchar category_name
        numeric rate_high_bob
        numeric rate_low_bob
        numeric rate_high_usd
        numeric rate_low_usd
        integer display_order
        boolean can_approve_wo
        boolean can_approve_timesheets
    }
    
    industries {
        uuid industry_id PK
        varchar industry_name
        varchar fiscal_year_end
    }
    
    activity_codes {
        uuid activity_id PK
        varchar activity_code
        varchar description
        uuid default_category_id FK
        boolean is_active
    }
    
    expense_types {
        uuid expense_type_id PK
        varchar expense_name
        numeric default_unit_cost
    }
    
    global_settings {
        varchar setting_key PK
        varchar setting_value
        text description
    }

    %% ═══════════════════════════════════════════════════════════════
    %% USER & STAFF MANAGEMENT
    %% ═══════════════════════════════════════════════════════════════
    
    user_roles {
        uuid id PK
        uuid user_id FK
        app_role role
    }
    
    staff {
        uuid staff_id PK
        uuid auth_user_id FK
        uuid category_id FK
        varchar first_name
        varchar last_name
        varchar email
        varchar short_name
        varchar initials
        varchar city
        varchar id_number
        varchar aud_reg_number
        boolean is_active
    }
    
    staff_capacity {
        uuid id PK
        uuid staff_id FK
        numeric weekly_capacity_hours
        date effective_from
        date effective_to
    }

    %% ═══════════════════════════════════════════════════════════════
    %% CLIENT & ENGAGEMENT
    %% ═══════════════════════════════════════════════════════════════
    
    clients {
        uuid client_id PK
        uuid industry_id FK
        varchar client_legal_name
        varchar unique_tax_id
        varchar contact_name
        varchar contact_email
        varchar contact_phone
        text address
        boolean is_active
    }
    
    engagements {
        uuid engagement_id PK
        uuid client_id FK
        uuid partner_id FK
        uuid manager_id FK
        varchar engagement_name
        varchar engagement_code
        varchar status
        date start_date
        date end_date
    }

    %% ═══════════════════════════════════════════════════════════════
    %% WORK ORDER & BUDGET
    %% ═══════════════════════════════════════════════════════════════
    
    work_orders {
        uuid wo_id PK
        uuid engagement_id FK
        varchar currency
        varchar season_mode
        numeric tax_rate
        numeric adjustment_amount
        varchar approval_status
        uuid approved_by FK
        timestamp approved_at
        text notes
    }
    
    wo_budget_lines {
        uuid wo_line_id PK
        uuid wo_id FK
        uuid category_id FK
        numeric budgeted_hours
        numeric standard_rate
    }
    
    wo_expense_budget {
        uuid wo_exp_id PK
        uuid wo_id FK
        uuid expense_type_id FK
        numeric budgeted_amount
    }

    %% ═══════════════════════════════════════════════════════════════
    %% ACTIVITY WORKSHEETS
    %% ═══════════════════════════════════════════════════════════════
    
    activity_worksheets {
        uuid id PK
        uuid engagement_id FK
        uuid wo_id FK
        uuid created_by_staff_id FK
        integer version
        varchar status
        text notes
    }
    
    activity_worksheet_cells {
        uuid id PK
        uuid worksheet_id FK
        uuid category_id FK
        uuid activity_id FK
        numeric budget_hours
    }

    %% ═══════════════════════════════════════════════════════════════
    %% TIME TRACKING
    %% ═══════════════════════════════════════════════════════════════
    
    timesheet_periods {
        uuid period_id PK
        uuid staff_id FK
        date week_start_date
        integer week_number
        integer year
        date deadline
        numeric total_hours
        boolean is_period_locked
        timestamp submitted_at
    }
    
    time_entries {
        uuid time_id PK
        uuid staff_id FK
        uuid engagement_id FK
        uuid activity_id FK
        uuid period_id FK
        date date_worked
        numeric hours_logged
        text description
        boolean is_forecast
    }
    
    timesheet_line_approvals {
        uuid approval_id PK
        uuid period_id FK
        uuid engagement_id FK
        uuid approved_by FK
        varchar status
        text review_notes
        timestamp approved_at
    }
    
    timer_entries {
        uuid timer_id PK
        uuid staff_id FK
        uuid engagement_id FK
        uuid activity_id FK
        timestamp started_at
        timestamp ended_at
        integer duration_minutes
        text description
        boolean is_imported
        uuid imported_to_time_id FK
    }

    %% ═══════════════════════════════════════════════════════════════
    %% EXPENSES
    %% ═══════════════════════════════════════════════════════════════
    
    expense_logs {
        uuid expense_log_id PK
        uuid engagement_id FK
        uuid expense_type_id FK
        date date_incurred
        numeric amount
        varchar currency
        text description
        text receipt_url
    }

    %% ═══════════════════════════════════════════════════════════════
    %% RELATIONSHIPS
    %% ═══════════════════════════════════════════════════════════════
    
    %% Staff relationships
    categories ||--o{ staff : "categorizes"
    categories ||--o{ activity_codes : "default for"
    staff ||--o{ staff_capacity : "has capacity"
    staff ||--o{ time_entries : "logs"
    staff ||--o{ timesheet_periods : "owns"
    staff ||--o{ timer_entries : "tracks"
    
    %% Client & Engagement relationships
    industries ||--o{ clients : "classifies"
    clients ||--o{ engagements : "has"
    staff ||--o{ engagements : "partner of"
    staff ||--o{ engagements : "manager of"
    
    %% Work Order relationships (1:1 with Engagement)
    engagements ||--|| work_orders : "has one"
    work_orders ||--o{ wo_budget_lines : "contains"
    work_orders ||--o{ wo_expense_budget : "budgets"
    categories ||--o{ wo_budget_lines : "rates for"
    expense_types ||--o{ wo_expense_budget : "types"
    staff ||--o{ work_orders : "approves"
    
    %% Worksheet relationships
    engagements ||--o{ activity_worksheets : "planned via"
    work_orders ||--o{ activity_worksheets : "linked to"
    staff ||--o{ activity_worksheets : "created by"
    activity_worksheets ||--o{ activity_worksheet_cells : "contains"
    categories ||--o{ activity_worksheet_cells : "for category"
    activity_codes ||--o{ activity_worksheet_cells : "uses activity"
    
    %% Time entry relationships
    staff ||--o{ timesheet_periods : "submits"
    timesheet_periods ||--o{ time_entries : "contains"
    timesheet_periods ||--o{ timesheet_line_approvals : "requires"
    engagements ||--o{ time_entries : "receives"
    engagements ||--o{ timesheet_line_approvals : "approves for"
    activity_codes ||--o{ time_entries : "categorized by"
    staff ||--o{ timesheet_line_approvals : "approved by"
    
    %% Timer relationships
    engagements ||--o{ timer_entries : "tracked for"
    activity_codes ||--o{ timer_entries : "uses"
    time_entries ||--o{ timer_entries : "imported to"
    
    %% Expense relationships
    engagements ||--o{ expense_logs : "incurs"
    expense_types ||--o{ expense_logs : "typed as"
```

---

## Computed Views

| View | Purpose |
|------|---------|
| `clients_directory` | Public client info (excludes sensitive data) |
| `staff_directory` | Public staff info (excludes auth/PII) |
| `work_order_summary` | Aggregated WO with calculated fees |
| `vw_wo_budget_hours_by_category` | Budget hours rolled up by category |
| `vw_wo_budget_hours_by_category_activity` | Budget hours by category + activity |
| `vw_actual_hours_by_category_activity` | Actual logged hours by category + activity |
| `vw_budget_vs_actual_hours_by_category_activity` | Variance analysis view |

---

## Key Business Rules

1. **1:1 Engagement ↔ Work Order** — Each engagement has exactly one work order
2. **Rate Locking** — WO budget lines snapshot rates at creation time
3. **Fiscal Year** — Runs Oct 1 → Sep 30 (configured in `fiscalCalculations.ts`)
4. **VAT/IVA** — Always 13% (`tax_rate` default)
5. **Timesheet Approval** — Line-level approval per engagement per period

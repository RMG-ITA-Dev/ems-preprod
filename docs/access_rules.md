# EMS 2.0 Access Control Philosophy

> **Implementation Command**: "Implement the Access Rules with access_rules.md"

---

## Table of Contents

1. [Philosophy Overview](#philosophy-overview)
2. [Backend Rules (RLS)](#backend-rules-rls---the-security-gate)
3. [Frontend Rules (RBAC)](#frontend-rules-rbac---the-user-experience-gate)
4. [The Golden Rule](#the-golden-rule)
5. [Role Hierarchy & Synchronization](#role-hierarchy--synchronization)
6. [Backend Access Matrix (RLS)](#backend-access-matrix-rls)
7. [Frontend Access Matrix (RBAC)](#frontend-access-matrix-rbac)
8. [Security Functions Reference](#security-functions-reference)
9. [Implementation Checklist](#implementation-checklist)

---

## Philosophy Overview

EMS 2.0 uses a **dual-layer access control** model:

```
┌─────────────────────────────────────────────────────────────┐
│                      USER REQUEST                           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  FRONTEND (RBAC)                                            │
│  "What should the user SEE?"                                │
│  ─────────────────────────────────────────                  │
│  • Hides irrelevant UI elements                             │
│  • Optimizes user experience                                │
│  • Guides users to appropriate features                     │
│  • CAN BE BYPASSED (browser dev tools, API calls)           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  BACKEND (RLS)                                              │
│  "What CAN the user DO?"                                    │
│  ─────────────────────────────────────────                  │
│  • Enforces data ownership                                  │
│  • Protects sensitive information                           │
│  • CANNOT BE BYPASSED                                       │
│  • Last line of defense                                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      DATABASE                               │
└─────────────────────────────────────────────────────────────┘
```

---

## Backend Rules (RLS) - The "Security Gate"

### Philosophy

> **RLS is the last line of defense.** It ensures data cannot be accessed even if the frontend is completely bypassed. Every policy must assume the attacker has full control of the client.

### What MUST be in RLS

| Rule Type | Reason | Example |
|-----------|--------|---------|
| **Data Ownership** | Prevent users from accessing other users' private data | User can only see their own `time_entries` |
| **Data Integrity** | Prevent unauthorized modifications | Only engagement team can modify `work_orders` |
| **Sensitive Data Protection** | Protect confidential information | Only leadership can see billing rates |
| **Business-Critical Operations** | Prevent unauthorized approvals/deletions | Only authorized approvers can approve timesheets |
| **Audit Trail Protection** | Prevent tampering with historical records | Cannot delete approved time entries |

### What does NOT belong in RLS

| Rule Type | Reason | Where It Belongs |
|-----------|--------|------------------|
| UI/UX decisions | Not a security concern | Frontend RBAC |
| Which tabs to show | Not a security concern | Frontend RBAC |
| Button visibility | Not a security concern | Frontend RBAC |
| Dashboard personalization | Not a security concern | Frontend RBAC |
| Feature flags | Not a security concern | Frontend RBAC |

### RLS Design Principles

1. **Default Deny**: If no policy matches, deny access
2. **Minimal Privilege**: Grant only what's necessary
3. **Use Security Definer Functions**: Prevent RLS recursion
4. **Avoid Complex Joins**: Keep policies performant
5. **Single Source of Truth**: All role checks use `user_roles.role`

---

## Frontend Rules (RBAC) - The "User Experience Gate"

### Philosophy

> **Frontend RBAC provides user experience optimization.** It guides users to appropriate features and hides irrelevant options. It is NOT a security mechanism—it's a usability mechanism.

### What MUST be in Frontend RBAC

| Rule Type | Reason | Example |
|-----------|--------|---------|
| **Navigation Visibility** | Show only relevant sections | Hide "Settings" tab from non-admins |
| **Dashboard Tabs** | Role-appropriate views | Partners see firm-wide, staff see personal |
| **Button/Action Visibility** | Hide actions user cannot perform | Hide "Approve" button from non-approvers |
| **Form Field Visibility** | Show/hide fields based on role | Hide billing rates from junior staff |
| **Feature Gating** | Enable/disable features per role | Disable bulk operations for viewers |

### What does NOT belong in Frontend RBAC

| Rule Type | Reason | Where It Belongs |
|-----------|--------|------------------|
| Security enforcement | Can be bypassed | Backend RLS |
| Data filtering | Can be bypassed | Backend RLS |
| Access denial | Can be bypassed | Backend RLS |
| Sensitive data hiding | Can be bypassed | Backend RLS |

### Frontend RBAC Design Principles

1. **Assume Good Faith**: Users generally follow the UI
2. **Graceful Degradation**: If role unknown, show minimal UI
3. **Consistent Experience**: Same role = same UI everywhere
4. **Performance First**: Role checks should be cached
5. **Single Source of Truth**: Use `useUserRole()` hook everywhere

---

## The Golden Rule

```
┌────────────────────────────────────────────────────────────┐
│                                                            │
│   Frontend assumes GOOD FAITH                              │
│   "I'll show you what you should see"                      │
│                                                            │
│   Backend assumes BAD FAITH                                │
│   "I'll only give you what you're allowed to have"         │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

**Practical implications:**

| Scenario | Frontend Behavior | Backend Behavior |
|----------|-------------------|------------------|
| User requests data they shouldn't see | Button was hidden, so they shouldn't ask | RLS blocks the query, returns empty |
| User tries to modify forbidden data | Button was disabled | RLS blocks the mutation, returns error |
| User bypasses frontend | N/A (bypassed) | RLS still enforces all rules |
| User's role changes mid-session | UI updates on next load | Immediate enforcement |

---

## Role Hierarchy & Synchronization

### Single Source of Truth

```
┌─────────────────────────────────────────────────────────────┐
│  staff.category_id  ──────► TRIGGER ──────►  user_roles.role │
│  (Business Logic)          (Auto-Sync)      (Access Control) │
└─────────────────────────────────────────────────────────────┘
```

**`user_roles.role` is the ONLY source of truth for access control.**

The `staff.category_id` is for business logic (rates, billing, org chart). It is automatically synchronized to `user_roles.role` via database trigger.

### Role Mapping

| staff.category_name | display_order | user_roles.role | Access Level |
|---------------------|---------------|-----------------|--------------|
| Socio | 1 | `partner` | Leadership |
| Director | 2 | `director` | Leadership |
| Gerente | 3 | `manager` | Management |
| Senior | 4 | `senior` | Staff |
| Semi-Senior | 5 | `semisenior` | Staff |
| Asistente | 6 | `staff` | Staff |
| *(System Admin)* | 0 | `admin` | Full Access |
| *(Read-Only)* | 99 | `viewer` | Read Only |

### Role Capabilities Summary

| Role | Dashboard Tabs | Can Manage Clients | Can Manage Engagements | Can Approve Timesheets | Can Access Settings |
|------|----------------|--------------------|-----------------------|------------------------|---------------------|
| `admin` | All | ✅ | ✅ | ✅ | ✅ |
| `partner` | All | ✅ | ✅ (as partner) | ✅ (as approver) | ❌ |
| `director` | All | ✅ | ✅ (as partner) | ✅ (as approver) | ❌ |
| `manager` | Cartera, Encargo, Personal | ❌ | ✅ (as manager) | ✅ (as approver) | ❌ |
| `senior` | Encargo, Personal | ❌ | ❌ | ❌ | ❌ |
| `semisenior` | Encargo, Personal | ❌ | ❌ | ❌ | ❌ |
| `staff` | Encargo, Personal | ❌ | ❌ | ❌ | ❌ |
| `viewer` | Personal | ❌ | ❌ | ❌ | ❌ |

---

## Backend Access Matrix (RLS)

### Legend

- ✅ = Full access (CRUD)
- R = Read only
- R(own) = Read own records only
- RU(own) = Read/Update own records
- CRUD(own) = Full access to own records only
- CRUD(team) = Full access where user is partner/manager of engagement
- R(team) = Read where user is partner/manager of engagement
- (approver) = Access based on approval authority
- ❌ = No access

### Reference Data Tables (Low Sensitivity)

| Table | admin | partner | director | manager | senior | semisenior | staff | viewer |
|-------|-------|---------|----------|---------|--------|------------|-------|--------|
| `categories` | ✅ | R | R | R | R | R | R | R |
| `industries` | ✅ | R | R | R | R | R | R | R |
| `activity_codes` | ✅ | R | R | R | R | R | R | R |
| `expense_types` | ✅ | R | R | R | R | R | R | R |
| `global_settings` | ✅ | R | R | R | R | R | R | R |

**Rationale**: Reference data is needed by all users for lookups. Only admin can modify.

### User & Role Tables (High Sensitivity)

| Table | admin | partner | director | manager | senior | semisenior | staff | viewer |
|-------|-------|---------|----------|---------|--------|------------|-------|--------|
| `user_roles` | ✅ | R(own) | R(own) | R(own) | R(own) | R(own) | R(own) | R(own) |
| `staff` | ✅ | RU(own) | RU(own) | RU(own) | RU(own) | RU(own) | RU(own) | R |
| `staff_capacity` | ✅ | RU(own) | RU(own) | RU(own) | RU(own) | RU(own) | RU(own) | R(own) |

**Rationale**: Users can view/update their own profile. Admin manages all. User roles are protected.

### Client & Engagement Tables (Medium Sensitivity)

| Table | admin | partner | director | manager | senior | semisenior | staff | viewer |
|-------|-------|---------|----------|---------|--------|------------|-------|--------|
| `clients` | ✅ | ✅ | ✅ | R | R | R | R | R |
| `engagements` | ✅ | ✅ | ✅ | RU(team) | R | R | R | R |

**Rationale**: Leadership can manage clients/engagements. Managers can update engagements they're assigned to. Staff can read for time entry purposes.

### Work Order Tables (High Sensitivity - Contains Rates)

| Table | admin | partner | director | manager | senior | semisenior | staff | viewer |
|-------|-------|---------|----------|---------|--------|------------|-------|--------|
| `work_orders` | ✅ | CRUD(team) | CRUD(team) | CRUD(team) | R(team) | R(team) | R(team) | ❌ |
| `wo_budget_lines` | ✅ | CRUD(team) | CRUD(team) | CRUD(team) | R(team) | R(team) | R(team) | ❌ |
| `wo_expense_budget` | ✅ | CRUD(team) | CRUD(team) | CRUD(team) | R(team) | R(team) | R(team) | ❌ |
| `activity_worksheets` | ✅ | CRUD(team) | CRUD(team) | CRUD(team) | R(team) | R(team) | R(team) | ❌ |
| `activity_worksheet_cells` | ✅ | CRUD(team) | CRUD(team) | CRUD(team) | R(team) | R(team) | R(team) | ❌ |

**Rationale**: Work orders contain billing rates (sensitive). Only engagement team can manage. Staff can read for reference. Viewers have no access.

### Time Tracking Tables (Personal + Team Access)

| Table | admin | partner | director | manager | senior | semisenior | staff | viewer |
|-------|-------|---------|----------|---------|--------|------------|-------|--------|
| `time_entries` | ✅ | CRUD(own)+R(team) | CRUD(own)+R(team) | CRUD(own)+R(team) | CRUD(own) | CRUD(own) | CRUD(own) | ❌ |
| `timer_entries` | ✅ | CRUD(own) | CRUD(own) | CRUD(own) | CRUD(own) | CRUD(own) | CRUD(own) | ❌ |
| `timesheet_periods` | ✅ | CRU(own) | CRU(own) | CRU(own) | CRU(own) | CRU(own) | CRU(own) | ❌ |

**Rationale**: Everyone manages their own time. Leadership/managers can view team time for approval. No deletion of periods (audit trail).

### Approval Tables (Approval Authority)

| Table | admin | partner | director | manager | senior | semisenior | staff | viewer |
|-------|-------|---------|----------|---------|--------|------------|-------|--------|
| `timesheet_line_approvals` | ✅ | CRUD(approver) | CRUD(approver) | CRUD(approver) | R(own) | R(own) | R(own) | ❌ |

**Rationale**: Uses `can_approve_timesheet_line()` function to determine who can approve each line. Staff can see approval status of their own lines.

### Expense Tables (Team Access)

| Table | admin | partner | director | manager | senior | semisenior | staff | viewer |
|-------|-------|---------|----------|---------|--------|------------|-------|--------|
| `expense_logs` | ✅ | CRUD(team) | CRUD(team) | CRUD(team) | CR(team) | CR(team) | CR(team) | ❌ |

**Rationale**: Leadership manages expenses. Staff can create/read expenses for engagements they work on.

---

## Frontend Access Matrix (RBAC)

### Navigation & Sidebar

| Feature | admin | partner | director | manager | senior | semisenior | staff | viewer |
|---------|-------|---------|----------|---------|--------|------------|-------|--------|
| Dashboard | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Timesheet | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Timer/Tracker | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Approvals | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Clients | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Engagements | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Work Orders | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Staff | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Expenses | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Settings | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

### Dashboard Tabs

| Tab | admin | partner | director | manager | senior | semisenior | staff | viewer |
|-----|-------|---------|----------|---------|--------|------------|-------|--------|
| Práctica (Firm-wide) | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Cartera (Portfolio) | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Encargo (Engagement) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Personal | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

### Action Buttons

| Action | admin | partner | director | manager | senior | semisenior | staff | viewer |
|--------|-------|---------|----------|---------|--------|------------|-------|--------|
| Create Client | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Edit Client | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Delete Client | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Create Engagement | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Edit Engagement (own) | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Create Work Order | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Approve Work Order | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Approve Timesheet | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Manage User Roles | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Global Settings | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

### Field Visibility

| Field/Data | admin | partner | director | manager | senior | semisenior | staff | viewer |
|------------|-------|---------|----------|---------|--------|------------|-------|--------|
| Billing Rates | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Staff Rates | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Fee Calculations | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Realization % | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Other Staff Time | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Engagement Budget | ✅ | ✅ | ✅ | ✅ | R | R | R | ❌ |

---

## Security Functions Reference

### Existing Functions (No Changes Needed)

| Function | Purpose | Used In |
|----------|---------|---------|
| `is_admin()` | Check if current user is admin | RLS policies |
| `has_role(user_id, role)` | Check if user has specific role | RLS policies |
| `get_my_staff_id()` | Get current user's staff_id | RLS policies |
| `is_engagement_team_member(engagement_id)` | Check if user is partner/manager | RLS policies |
| `can_approve_timesheet(approver_auth_id, period_id)` | Check timesheet approval authority | RLS policies |
| `can_approve_timesheet_line(approver_auth_id, period_id, engagement_id)` | Check line approval authority | RLS policies |
| `get_line_approver(staff_id, engagement_id)` | Get expected approver for line | Approval logic |
| `is_auto_approved_category(staff_id)` | Check if staff auto-approves | Approval logic |

### Functions to Create

| Function | Purpose | SQL |
|----------|---------|-----|
| `is_leadership()` | Check if user is partner or director | See below |
| `is_management()` | Check if user is partner, director, or manager | See below |
| `can_view_rates()` | Check if user can view billing rates | See below |

```sql
-- is_leadership(): Returns true if user is partner or director
CREATE OR REPLACE FUNCTION is_leadership()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
      AND role IN ('admin', 'partner', 'director')
  )
$$;

-- is_management(): Returns true if user is partner, director, or manager
CREATE OR REPLACE FUNCTION is_management()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
      AND role IN ('admin', 'partner', 'director', 'manager')
  )
$$;

-- can_view_rates(): Returns true if user can view billing rates
CREATE OR REPLACE FUNCTION can_view_rates()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
      AND role IN ('admin', 'partner', 'director', 'manager')
  )
$$;
```

### Synchronization Trigger

```sql
-- Add default_app_role column to categories
ALTER TABLE categories ADD COLUMN IF NOT EXISTS default_app_role text;

-- Set mappings
UPDATE categories SET default_app_role = 'partner' WHERE category_name = 'Socio';
UPDATE categories SET default_app_role = 'director' WHERE category_name = 'Director';
UPDATE categories SET default_app_role = 'manager' WHERE category_name = 'Gerente';
UPDATE categories SET default_app_role = 'senior' WHERE category_name = 'Senior';
UPDATE categories SET default_app_role = 'semisenior' WHERE category_name = 'Semi-Senior';
UPDATE categories SET default_app_role = 'staff' WHERE category_name = 'Asistente';

-- Create sync function
CREATE OR REPLACE FUNCTION sync_user_role_from_staff_category()
RETURNS TRIGGER AS $$
DECLARE
  v_default_role public.app_role;
BEGIN
  -- Get the default role for this category
  SELECT default_app_role::public.app_role INTO v_default_role
  FROM categories
  WHERE category_id = NEW.category_id;
  
  -- If staff has an auth_user_id and category has a default role, sync
  IF NEW.auth_user_id IS NOT NULL AND v_default_role IS NOT NULL THEN
    -- Check if user already has admin role (don't override admin)
    IF NOT EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = NEW.auth_user_id AND role = 'admin'
    ) THEN
      INSERT INTO user_roles (user_id, role)
      VALUES (NEW.auth_user_id, v_default_role)
      ON CONFLICT (user_id) 
      DO UPDATE SET role = v_default_role
      WHERE user_roles.role != 'admin'; -- Never override admin
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger
DROP TRIGGER IF EXISTS trg_sync_user_role ON staff;
CREATE TRIGGER trg_sync_user_role
AFTER INSERT OR UPDATE OF category_id, auth_user_id
ON staff
FOR EACH ROW
EXECUTE FUNCTION sync_user_role_from_staff_category();
```

---

## Implementation Checklist

### Phase 1: Backend Preparation

- [ ] Add `default_app_role` column to `categories` table
- [ ] Populate `default_app_role` values for all categories
- [ ] Create `sync_user_role_from_staff_category()` function
- [ ] Create `trg_sync_user_role` trigger on `staff` table
- [ ] Run one-time sync to align existing user roles with staff categories
- [ ] Create `is_leadership()` function
- [ ] Create `is_management()` function
- [ ] Create `can_view_rates()` function

### Phase 2: Frontend Refactoring

- [ ] Refactor `useDashboardAccess` to use `useUserRole` as single source
- [ ] Create `useAccessControl` hook that combines role checks
- [ ] Update all components to use centralized access control
- [ ] Add role-based field visibility to sensitive data displays
- [ ] Update navigation to use role-based visibility

### Phase 3: RLS Implementation

- [ ] Re-enable RLS on all tables
- [ ] Drop existing "beta" policies (if any)
- [ ] Create policies for reference data tables (categories, industries, etc.)
- [ ] Create policies for user/role tables
- [ ] Create policies for client/engagement tables
- [ ] Create policies for work order tables
- [ ] Create policies for time tracking tables
- [ ] Create policies for approval tables
- [ ] Create policies for expense tables

### Phase 4: Testing

- [ ] Test admin role: full access to all tables
- [ ] Test partner role: leadership access, engagement team access
- [ ] Test director role: same as partner
- [ ] Test manager role: management access, own engagements only
- [ ] Test senior role: staff access, own data only
- [ ] Test semisenior role: same as senior
- [ ] Test staff role: same as senior
- [ ] Test viewer role: read-only access
- [ ] Test role synchronization trigger
- [ ] Test edge cases (no category, no auth_user_id, etc.)

### Phase 5: Documentation

- [ ] Update README with access control overview
- [ ] Document security functions in code comments
- [ ] Create troubleshooting guide for access issues

---

## Appendix: Sample RLS Policies

### Example: clients table

```sql
-- Enable RLS
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

-- Policy: All authenticated users can read clients
CREATE POLICY "Authenticated can read clients"
ON clients FOR SELECT
TO authenticated
USING (true);

-- Policy: Leadership can manage clients
CREATE POLICY "Leadership can insert clients"
ON clients FOR INSERT
TO authenticated
WITH CHECK (is_leadership());

CREATE POLICY "Leadership can update clients"
ON clients FOR UPDATE
TO authenticated
USING (is_leadership())
WITH CHECK (is_leadership());

-- Policy: Only admin can delete clients
CREATE POLICY "Admin can delete clients"
ON clients FOR DELETE
TO authenticated
USING (is_admin());
```

### Example: time_entries table

```sql
-- Enable RLS
ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;

-- Policy: Users can manage their own time entries
CREATE POLICY "Users can manage own time entries"
ON time_entries FOR ALL
TO authenticated
USING (staff_id = get_my_staff_id())
WITH CHECK (staff_id = get_my_staff_id());

-- Policy: Leadership can read team time entries
CREATE POLICY "Leadership can read team time entries"
ON time_entries FOR SELECT
TO authenticated
USING (
  is_leadership() 
  AND is_engagement_team_member(engagement_id)
);

-- Policy: Admin can manage all time entries
CREATE POLICY "Admin full access to time entries"
ON time_entries FOR ALL
TO authenticated
USING (is_admin())
WITH CHECK (is_admin());
```

---

*Document Version: 1.0*
*Last Updated: 2026-01-18*
*Status: Approved for Implementation*

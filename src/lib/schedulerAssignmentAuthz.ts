/**
 * D5 write-authorization matrix for engagement assignments — the client
 * mirror of the RLS write policies (`ea_team_insert` / `ea_team_update` /
 * `ea_team_delete` in
 * `supabase/migrations/20260717233000_engagement_assignments_d5_rls.sql`).
 *
 * The server rule for a write is:
 *
 *   is_admin()
 *   OR ( is_engagement_team_member(engagement)         -- structural lead
 *        AND can_read_engagement_assignments(engagement) )
 *
 * where the D5 read matrix (can_read_...) is:
 *
 *   firmwide (admin / partner / director)
 *   OR ( manager role AND structural lead )
 *   OR ( senior role AND holds a non-deleted assignment on the engagement )
 *
 * Composing the two, a NON-admin can write iff they are a structural
 * lead (engagement manager_id / partner_id) AND their app_role admits a
 * read of that engagement:
 *
 *   - partner / director : always read (firmwide) → may write when lead
 *   - manager            : reads its led engagements → may write when lead
 *   - senior             : reads only engagements it is assigned to →
 *                          may write when lead AND has an own assignment
 *
 * The senior-with-assignment case is the documented In-Charge Senior
 * workflow (docs/scheduler-objective.md, "Who does what in the UI"). The
 * assignment precondition is also the anti-escalation property: a
 * structural-lead senior with no assignment cannot write (they could
 * otherwise self-assign and self-grant visibility — the PR #222 finding).
 *
 * This is a client convenience mirror only; PostgREST + RLS remain the
 * real boundary. Kept pure and shared so StaffAssignmentsCard and
 * SchedulerL2 can never drift from each other or from the server rule.
 */
export interface AssignmentWriteAuthzInput {
  isAdmin: boolean;
  isPartner: boolean;
  isDirector: boolean;
  isManager: boolean;
  isSenior: boolean;
  /** caller's staff_id equals the engagement's manager_id or partner_id */
  isStructuralLead: boolean;
  /** caller holds a non-deleted assignment on this engagement */
  hasOwnAssignment: boolean;
}

export function canWriteEngagementAssignments(
  a: AssignmentWriteAuthzInput
): boolean {
  if (a.isAdmin) return true;
  if (!a.isStructuralLead) return false;
  return (
    a.isPartner ||
    a.isDirector ||
    a.isManager ||
    (a.isSenior && a.hasOwnAssignment)
  );
}

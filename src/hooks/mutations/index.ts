// Industries
export { useCreateIndustry, useUpdateIndustry, useDeleteIndustry } from "./useIndustryMutations";

// Categories
export { useCreateCategory, useUpdateCategory, useDeleteCategory } from "./useCategoryMutations";

// Activity Codes
export { useCreateActivityCode, useUpdateActivityCode, useDeleteActivityCode } from "./useActivityCodeMutations";

// Expense Types
export { useCreateExpenseType, useUpdateExpenseType, useDeleteExpenseType } from "./useExpenseTypeMutations";

// Staff
export { useCreateStaff, useUpdateStaff, useDeleteStaff } from "./useStaffMutations";

// Clients
export { useCreateClient, useUpdateClient, useDeleteClient } from "./useClientMutations";

// Engagements
export { useCreateEngagement, useUpdateEngagement, useDeleteEngagement } from "./useEngagementMutations";

// Global Settings
export { useUpdateGlobalSetting } from "./useSettingsMutations";

// Work Orders
export {
  useCreateWorkOrder,
  useUpdateWorkOrder,
  useSubmitWorkOrder,
  useApproveWorkOrder,
  useApproveRisk,
  useApproveEmergencyReview,
  useApproveEmergencyPartner,
  useRejectRisk,
  useRevertSocioApproval,
  useRevertRiskApproval,
  useCompleteRiskAssessment,
  useRejectWorkOrder,
  useUnsubmitWorkOrder,
} from "./useWorkOrderMutations";

// Budget Lines
export { useCreateBudgetLine, useUpdateBudgetLine, useDeleteBudgetLine } from "./useBudgetLineMutations";

// Expense Budget
export { useCreateExpenseBudget, useUpdateExpenseBudget, useDeleteExpenseBudget } from "./useExpenseBudgetMutations";

// Admin mutations
export { useUpdateTimeEntry } from "./useAdminMutations";

// Holidays
export { useCreateHoliday, useUpdateHoliday, useDeleteHoliday, useReplicateHolidaysToNextYear } from "./useHolidayMutations";

// Skills
export { useCreateSkill, useUpdateSkill, useDeleteSkill } from "./useSkillMutations";

// Staff Competencies
export { useCreateStaffCompetency, useUpdateStaffCompetency, useDeleteStaffCompetency } from "./useStaffCompetencyMutations";

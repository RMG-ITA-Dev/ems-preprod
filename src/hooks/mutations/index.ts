// Industries
export { useCreateIndustry, useUpdateIndustry, useDeleteIndustry } from "./useIndustryMutations";

// Categories
export { useCreateCategory, useUpdateCategory, useDeleteCategory, useMoveCategory, useCopyCategories } from "./useCategoryMutations";

// Activity Codes
export { useCreateActivityCode, useUpdateActivityCode, useDeleteActivityCode, useDeactivateServiceActivity, useReactivateServiceActivity, useReorderServiceActivity } from "./useActivityCodeMutations";

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
export { useCreateHoliday, useUpdateHoliday, useDeleteHoliday, useGenerateNationalHolidays } from "./useHolidayMutations";

// Skills
export { useCreateSkill, useUpdateSkill, useDeleteSkill } from "./useSkillMutations";

// Staff Competencies
export { useCreateStaffCompetency, useUpdateStaffCompetency, useDeleteStaffCompetency } from "./useStaffCompetencyMutations";

// Work Order Payment Plan
export {
  useUpsertPaymentPlan,
  useBatchUpsertInstallments,
  useUpdateInstallmentStatus,
  useUpdateCollectionDate,
  useDeletePaymentPlan,
  useDeleteInstallment,
} from "./useWorkOrderPaymentPlanMutations";

// Services
export { useCreateService, useUpdateService } from "./useServiceMutations";

// Taxonomies
export { useCreateTaxonomy, useUpdateTaxonomy } from "./useTaxonomyMutations";

// Work Order Staffing Requirements (Fase 4 — thin wrapper de save_wo_staffing)
export { useSaveWorkOrderStaffing } from "./useWorkOrderStaffingMutations";

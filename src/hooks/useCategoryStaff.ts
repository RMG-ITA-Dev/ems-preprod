import { useMemo } from "react";
import { useStaff, useCategories } from "@/hooks/useEmsData";

export function useCategoryStaff() {
  const { data: staff, isLoading: isLoadingStaff } = useStaff();
  const { data: categories, isLoading: isLoadingCategories } = useCategories();

  // Check if Leadership tier categories exist (display_order <= 2: Socio, Director)
  const hasLeadershipCategory = useMemo(() => {
    if (!categories) return false;
    return categories.some((c) => c.display_order != null && c.display_order <= 2);
  }, [categories]);

  // Check if Management tier categories exist (display_order 3-4: Gerente, Senior)
  const hasManagementCategory = useMemo(() => {
    if (!categories) return false;
    return categories.some(
      (c) => c.display_order != null && c.display_order >= 3 && c.display_order <= 4
    );
  }, [categories]);

  // Filter staff by Leadership tier (display_order <= 2: Socio, Director)
  const leadershipStaff = useMemo(() => {
    if (!staff) return [];
    return staff.filter((s) => {
      const displayOrder = s.category?.display_order;
      return displayOrder != null && displayOrder <= 2;
    });
  }, [staff]);

  // Filter staff by Management tier (display_order 3-4: Gerente, Senior)
  const managementStaff = useMemo(() => {
    if (!staff) return [];
    return staff.filter((s) => {
      const displayOrder = s.category?.display_order;
      return displayOrder != null && displayOrder >= 3 && displayOrder <= 4;
    });
  }, [staff]);

  // Leadership options for dropdowns (Partner/Director)
  const leadershipOptions = useMemo(() => {
    return leadershipStaff.map((s) => ({
      value: s.staff_id,
      label: `${s.first_name} ${s.last_name}`,
    }));
  }, [leadershipStaff]);

  // Management options for dropdowns (Manager/Supervisor) - management tier only
  const managementOptions = useMemo(() => {
    if (!staff) return [];
    return staff
      .filter((s) => {
        const displayOrder = s.category?.display_order;
        // Include management tier only (3-4): Gerente, Senior
        return displayOrder != null && displayOrder >= 3 && displayOrder <= 4;
      })
      .map((s) => ({
        value: s.staff_id,
        label: `${s.first_name} ${s.last_name}`,
      }));
  }, [staff]);

  // All active staff (no category filter) — for Personal Responsable dropdowns
  const allActiveStaff = useMemo(() => {
    if (!staff) return [];
    return staff.map((s) => ({
      value: s.staff_id,
      label: `${s.first_name} ${s.last_name}`,
    }));
  }, [staff]);

  // Legacy aliases for backwards compatibility
  const partners = leadershipStaff;
  const managers = managementStaff;
  const partnerOptions = leadershipOptions;
  const managerOptions = managementOptions;
  const hasPartnerCategory = hasLeadershipCategory;
  const hasManagerCategory = hasManagementCategory;

  return {
    // New semantic names
    leadershipStaff,
    managementStaff,
    leadershipOptions,
    managementOptions,
    hasLeadershipCategory,
    hasManagementCategory,
    // Legacy aliases
    partners,
    managers,
    partnerOptions,
    managerOptions,
    hasPartnerCategory,
    hasManagerCategory,
    allActiveStaff,
    isLoading: isLoadingStaff || isLoadingCategories,
  };
}

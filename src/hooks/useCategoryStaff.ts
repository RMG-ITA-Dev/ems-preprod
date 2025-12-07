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

  // Management options for dropdowns (Manager/Supervisor) - includes both management tier AND leadership tier
  const managementOptions = useMemo(() => {
    if (!staff) return [];
    return staff
      .filter((s) => {
        const displayOrder = s.category?.display_order;
        // Include management tier (3-4) and leadership tier (1-2)
        return displayOrder != null && displayOrder <= 4;
      })
      .map((s) => ({
        value: s.staff_id,
        label: `${s.first_name} ${s.last_name}`,
      }));
  }, [staff]);

  // Supervisor options for staff form (display_order 1-4: can supervise junior staff)
  const supervisorOptions = useMemo(() => {
    if (!staff) return [];
    return staff
      .filter((s) => {
        const displayOrder = s.category?.display_order;
        // Include Socio (1), Director (2), Gerente (3), Senior (4)
        return displayOrder != null && displayOrder <= 4;
      })
      .map((s) => ({
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
    supervisorOptions,
    hasLeadershipCategory,
    hasManagementCategory,
    // Legacy aliases
    partners,
    managers,
    partnerOptions,
    managerOptions,
    hasPartnerCategory,
    hasManagerCategory,
    isLoading: isLoadingStaff || isLoadingCategories,
  };
}
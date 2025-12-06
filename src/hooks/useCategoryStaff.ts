import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useStaff, useCategories } from "@/hooks/useEmsData";

export function useCategoryStaff() {
  const { t, i18n } = useTranslation();
  const { data: staff, isLoading: isLoadingStaff } = useStaff();
  const { data: categories, isLoading: isLoadingCategories } = useCategories();

  // Get category names from both locales for matching
  const partnerNames = useMemo(() => {
    return ["partner", "socio"].map((n) => n.toLowerCase());
  }, []);

  const managerNames = useMemo(() => {
    return ["manager", "gerente"].map((n) => n.toLowerCase());
  }, []);

  // Check if Partner and Manager categories exist in the database
  const hasPartnerCategory = useMemo(() => {
    if (!categories) return false;
    return categories.some((c) => 
      partnerNames.includes(c.category_name.toLowerCase())
    );
  }, [categories, partnerNames]);

  const hasManagerCategory = useMemo(() => {
    if (!categories) return false;
    return categories.some((c) => 
      managerNames.includes(c.category_name.toLowerCase())
    );
  }, [categories, managerNames]);

  // Filter staff by Partner category (supports both EN/ES names)
  const partners = useMemo(() => {
    if (!staff) return [];
    return staff.filter((s) => {
      const categoryName = s.category?.category_name?.toLowerCase() || "";
      return partnerNames.includes(categoryName);
    });
  }, [staff, partnerNames]);

  // Filter staff by Manager category (supports both EN/ES names)
  const managers = useMemo(() => {
    if (!staff) return [];
    return staff.filter((s) => {
      const categoryName = s.category?.category_name?.toLowerCase() || "";
      return managerNames.includes(categoryName);
    });
  }, [staff, managerNames]);

  // Partner options for dropdowns
  const partnerOptions = useMemo(() => {
    return partners.map((s) => ({
      value: s.staff_id,
      label: `${s.first_name} ${s.last_name}`,
    }));
  }, [partners]);

  // Manager options for dropdowns (includes both managers and partners)
  const managerOptions = useMemo(() => {
    if (!staff) return [];
    return staff
      .filter((s) => {
        const categoryName = s.category?.category_name?.toLowerCase() || "";
        return managerNames.includes(categoryName) || partnerNames.includes(categoryName);
      })
      .map((s) => ({
        value: s.staff_id,
        label: `${s.first_name} ${s.last_name}`,
      }));
  }, [staff, managerNames, partnerNames]);

  return {
    partners,
    managers,
    partnerOptions,
    managerOptions,
    hasPartnerCategory,
    hasManagerCategory,
    isLoading: isLoadingStaff || isLoadingCategories,
  };
}

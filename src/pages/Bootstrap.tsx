import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { StaffForm } from "@/components/forms/StaffForm";
import { toast } from "sonner";
import { Shield } from "lucide-react";

const Bootstrap = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleSaveSuccess = () => {
    toast.success(t("bootstrap.complete"));
    navigate("/");
  };

  // Pre-fill a minimal staff-like object with admin's email
  const prefill = {
    email: user?.email || "",
  } as any;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-2xl">
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
            <Shield className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground text-center">
            {t("bootstrap.title")}
          </h1>
          <p className="text-muted-foreground text-center max-w-md">
            {t("bootstrap.description")}
          </p>
        </div>

        <StaffForm
          onSaveSuccess={handleSaveSuccess}
          onCancel={() => {/* No cancel on bootstrap — must complete */}}
        />
      </div>
    </div>
  );
};

export default Bootstrap;

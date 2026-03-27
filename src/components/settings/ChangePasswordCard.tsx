import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Loader2, KeyRound } from "lucide-react";
import { z } from "zod";

const passwordSchema = z.string()
  .min(8, { message: "Password must be at least 8 characters" })
  .max(100, { message: "Password must be less than 100 characters" });

export function ChangePasswordCard() {
  const { t } = useTranslation();
  const { user, signIn, updatePassword } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user?.email) {
      toast.error(t("auth.noEmailFound"));
      return;
    }

    setLoading(true);

    try {
      // Validate new password
      passwordSchema.parse(newPassword);

      // Check passwords match
      if (newPassword !== confirmPassword) {
        toast.error(t("auth.passwordsDoNotMatch"));
        return;
      }

      // Verify current password by attempting to sign in
      const { error: signInError } = await signIn(user.email, currentPassword);
      if (signInError) {
        toast.error(t("auth.incorrectCurrentPassword"));
        return;
      }

      // Update to new password
      const { error: updateError } = await updatePassword(newPassword);
      if (updateError) {
        toast.error(updateError.message);
      } else {
        toast.success(t("auth.passwordChanged"));
        // Clear form
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }
    } catch (err) {
      if (err instanceof z.ZodError) {
        toast.error(err.errors[0].message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-5 w-5" />
          {t("auth.changePassword")}
        </CardTitle>
        <CardDescription>{t("auth.changePasswordDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
          <div className="space-y-2">
            <Label htmlFor="currentPassword">{t("auth.currentPassword")}</Label>
            <Input
              id="currentPassword"
              type="password"
              placeholder="••••••••"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="newPassword">{t("auth.newPassword")}</Label>
            <Input
              id="newPassword"
              type="password"
              placeholder="••••••••"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
            />
            <p className="text-xs text-muted-foreground">{t("auth.passwordRequirements")}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmNewPassword">{t("auth.confirmPassword")}</Label>
            <Input
              id="confirmNewPassword"
              type="password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>

          <Button type="submit" disabled={loading} className="w-full sm:w-auto min-h-[44px] sm:min-h-0">
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                {t("common.saving")}
              </>
            ) : (
              t("auth.changePassword")
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

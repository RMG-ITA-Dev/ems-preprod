import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Loader2, Mail, CheckCircle } from "lucide-react";
import { z } from "zod";

interface ForgotPasswordDialogProps {
  children: React.ReactNode;
}

export function ForgotPasswordDialog({ children }: ForgotPasswordDialogProps) {
  const { t } = useTranslation();
  const { resetPasswordForEmail, checkUserExists } = useAuth();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  // BUG #6: Move schema inside component to use translated messages
  const emailSchema = z.string()
    .trim()
    .email({ message: t("errors.invalidEmail") })
    .max(255, { message: t("errors.emailTooLong") });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setLoading(true);
    setEmailError(null);

    try {
      // Validate email format
      emailSchema.parse(email);

      // Only @ruizmier.com emails allowed
      const isRuizmierEmail = email.toLowerCase().endsWith('@ruizmier.com');
      if (!isRuizmierEmail) {
        setEmailError(t("errors.onlyRuizmierEmail") || "Solo se permiten correos @ruizmier.com");
        return;
      }

      // Verify user exists in the system
      const { exists, error: checkError } = await checkUserExists(email);

      if (checkError) {
        setEmailError(t("errors.checkUserError") || "Error verificando usuario");
        return;
      }

      if (!exists) {
        setEmailError(t("errors.userNotFound") || "Usuario no encontrado en el sistema");
        return;
      }

      const { error } = await resetPasswordForEmail(email);

      if (error) {
        console.error("Reset password error:", error);
      }

      // Show success message
      setSent(true);
    } catch (err) {
      if (err instanceof z.ZodError) {
        setEmailError(err.errors[0].message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      // Reset state when closing
      setEmail("");
      setSent(false);
      setEmailError(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("auth.forgotPassword")}</DialogTitle>
          <DialogDescription>
            {sent ? t("auth.resetEmailSent") : t("auth.forgotPasswordDescription")}
          </DialogDescription>
        </DialogHeader>

        {sent ? (
          <div className="flex flex-col items-center py-6 space-y-4">
            <div className="h-12 w-12 rounded-full bg-success/10 flex items-center justify-center">
              <CheckCircle className="h-6 w-6 text-success" />
            </div>
            <p className="text-center text-muted-foreground text-sm">
              {t("auth.checkYourEmail")}
            </p>
            <Button onClick={() => handleOpenChange(false)} variant="cancel">
              {t("common.close")}
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="resetEmail">{t("auth.email")}</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="resetEmail"
                  type="email"
                  placeholder={t("auth.emailPlaceholder")}
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setEmailError(null);
                  }}
                  required
                  className={`pl-10 ${emailError ? "border-destructive" : ""}`}
                />
              </div>
              {/* BUG #6: Show inline error message */}
              {emailError && (
                <p className="text-sm text-destructive">{emailError}</p>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="cancel"
                onClick={() => handleOpenChange(false)}
                className="flex-1"
              >
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={loading} className="flex-1">
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  t("auth.sendResetLink")
                )}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

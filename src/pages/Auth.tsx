import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { useGlobalSettings } from "@/hooks/useEmsData";
import { toast } from "sonner";
import { Briefcase, TrendingUp, Users, Shield, Loader2, Mail, Eye, EyeOff } from "lucide-react";
import { z } from "zod";
import { ForgotPasswordDialog } from "@/components/auth/ForgotPasswordDialog";

// Fase 7 (plan v2 §C): schema `message`s are i18n KEYS, not prose — the single
// catch block below (handleSubmit) resolves whichever key survives via
// t(key, { domain: allowedDomain }). Passing `domain` unconditionally is
// inert for keys that don't interpolate it.
const emailSchema = z.string().trim().email({ message: "validation.emailInvalid" }).max(255, { message: "auth.validation.emailMax" });
// Sign-in: allow existing users with 6-char passwords
const signinPasswordSchema = z.string().min(6, { message: "auth.validation.passwordMinSignin" }).max(100, { message: "auth.validation.passwordMax" });
// Sign-up: enforce stronger passwords for new accounts
const signupPasswordSchema = z.string().min(8, { message: "auth.validation.passwordMinSignup" }).max(100, { message: "auth.validation.passwordMax" });
const nameSchema = z.string().trim().min(1, { message: "form.required" }).max(100, { message: "auth.validation.nameMax" });

// Company email validation function - domain loaded from settings
const createCompanyEmailSchema = (allowedDomain: string) => z.string()
  .trim()
  .email({ message: "validation.emailInvalid" })
  .max(255, { message: "auth.validation.emailMax" })
  .refine(
    (email) => !allowedDomain || email.toLowerCase().endsWith(`@${allowedDomain.toLowerCase()}`),
    { message: allowedDomain ? "auth.validation.emailDomainOnly" : "auth.invalidDomain" }
  );

const Auth = () => {
  const { t } = useTranslation();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [sentToEmail, setSentToEmail] = useState("");
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const { data: settings } = useGlobalSettings();

  // Get allowed domain from settings
  const allowedDomain = settings?.find(s => s.setting_key === 'ALLOWED_EMAIL_DOMAIN')?.setting_value || '';


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Validate inputs - use company domain schema for signup, regular for signin
      const validatedEmail = mode === "signup" 
        ? createCompanyEmailSchema(allowedDomain).parse(email)
        : emailSchema.parse(email);
      const validatedPassword = mode === "signup" 
        ? signupPasswordSchema.parse(password)
        : signinPasswordSchema.parse(password);

      if (mode === "signup") {
        const validatedFirstName = nameSchema.parse(firstName);
        const validatedLastName = nameSchema.parse(lastName);
        
        const { error, emailConfirmationRequired } = await signUp(validatedEmail, validatedPassword, validatedFirstName, validatedLastName);
        if (error) {
          if (error.message.includes("already registered")) {
            toast.error(t("messages.emailAlreadyRegistered"));
          } else if (error.message.includes("restricted to @")) {
            toast.error(t("auth.invalidDomain"));
          } else {
            toast.error(error.message);
          }
        } else if (emailConfirmationRequired) {
          setSentToEmail(validatedEmail);
          setEmailSent(true);
        } else {
          toast.success(t("messages.accountCreated"));
          navigate("/");
        }
      } else {
        const { error } = await signIn(validatedEmail, validatedPassword);
        if (error) {
          if (error.message === 'ACCOUNT_INACTIVE') {
            toast.error(t('messages.accountInactive'));
          } else if (error.message === 'NO_STAFF_RECORD') {
            toast.error(t('messages.noStaffRecord'));
          } else if (error.message.startsWith('ACCOUNT_LOCKED:')) {
            const seconds = parseInt(error.message.slice('ACCOUNT_LOCKED:'.length), 10) || 0;
            const minutes = Math.max(1, Math.ceil(seconds / 60));
            toast.error(t('messages.accountLocked', { minutes }));
          } else if (error.message.startsWith('INVALID_CREDENTIALS:')) {
            const remaining = parseInt(error.message.split(':')[1], 10) || 0;
            toast.warning(t('messages.invalidCredentialsWithAttempts', { remaining }));
          } else if (error.message.includes("Invalid login credentials")) {
            toast.warning(t("messages.invalidCredentials"));
          } else {
            toast.error(error.message);
          }
        } else {
          toast.success(t("messages.welcomeBack"));
          navigate("/");
        }
      }
    } catch (err) {
      if (err instanceof z.ZodError) {
        toast.error(t(err.errors[0].message, { domain: allowedDomain }));
      }
    } finally {
      setLoading(false);
    }
  };


  const features = [
    {
      icon: Briefcase,
      title: t("auth.features.engagementManagement"),
      description: t("auth.features.engagementDesc"),
    },
    {
      icon: TrendingUp,
      title: t("auth.features.multiCurrency"),
      description: t("auth.features.multiCurrencyDesc"),
    },
    {
      icon: Users,
      title: t("auth.features.staffTracking"),
      description: t("auth.features.staffTrackingDesc"),
    },
    {
      icon: Shield,
      title: t("auth.features.roleBasedAccess"),
      description: t("auth.features.roleBasedAccessDesc"),
    },
  ];

  return (
    <div className="min-h-screen flex">
      {/* Left Panel - Features */}
      <div className="hidden lg:flex lg:w-1/2 bg-primary p-12 flex-col justify-between">
        <div>
          <div className="mb-16">
            {/* Brand name — identical across Auth.tsx, AppHeader.tsx, NotFound.tsx,
                ResetPassword.tsx and index.html. Deliberately not i18n. */}
            <h1 className="text-2xl font-bold text-primary-foreground">RuizmierGroup - EMS 2.0</h1>
            {/* "EMS" IS the English acronym the product is named after — translating
                it would rename the product, so EN and ES share the same value. */}
            <p className="text-primary-foreground/70 text-sm">{t("auth.brandTagline")}</p>
          </div>

          <div className="space-y-8">
            {features.map((feature, index) => (
              <div key={index} className="flex gap-4">
                <div className="h-10 w-10 rounded-lg bg-primary-foreground/10 backdrop-blur flex items-center justify-center flex-shrink-0">
                  <feature.icon className="h-5 w-5 text-primary-foreground" />
                </div>
                <div>
                  <h3 className="font-semibold text-primary-foreground mb-1">{feature.title}</h3>
                  <p className="text-primary-foreground/70 text-sm leading-relaxed">{feature.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-primary-foreground/50 text-sm">
          {t("auth.trustedBy")}
        </p>
      </div>

      {/* Right Panel - Auth Form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-background">
          <div className="w-full max-w-md">
          {emailSent ? (
            <div className="bg-card rounded-2xl border border-border shadow-xl p-8 text-center">
              <div className="mx-auto h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-6">
                <Mail className="h-8 w-8 text-primary" />
              </div>
              <h2 className="text-2xl font-bold text-foreground mb-2">
                {t("auth.verifyYourEmail")}
              </h2>
              <p className="text-muted-foreground mb-6">
                {t("auth.confirmationSent", { email: sentToEmail })}
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setEmailSent(false);
                  setMode("signin");
                }}
              >
                {t("auth.backToSignIn")}
              </Button>
            </div>
          ) : (
          <div className="bg-card rounded-2xl border border-border shadow-xl p-8">
            {/* Slider Toggle */}
            <div className="flex bg-muted rounded-full p-1 mb-8">
              <button
                onClick={() => setMode("signin")}
                className={`flex-1 py-2.5 px-4 rounded-full text-sm font-medium transition-all ${
                  mode === "signin"
                    ? "bg-accent text-accent-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t("auth.signIn")}
              </button>
              <button
                onClick={() => setMode("signup")}
                className={`flex-1 py-2.5 px-4 rounded-full text-sm font-medium transition-all ${
                  mode === "signup"
                    ? "bg-accent text-accent-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t("auth.signUp")}
              </button>
            </div>

            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-foreground">
                {mode === "signin" ? t("auth.welcomeBack") : t("auth.createAccount")}
              </h2>
              <p className="text-muted-foreground mt-1">
                {mode === "signin"
                  ? t("auth.enterCredentials")
                  : t("auth.fillDetails")}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "signup" && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">{t("auth.firstName")}</Label>
                    <Input
                      id="firstName"
                      type="text"
                      placeholder={t("auth.firstNamePlaceholder")}
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">{t("auth.lastName")}</Label>
                    <Input
                      id="lastName"
                      type="text"
                      placeholder={t("auth.lastNamePlaceholder")}
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      required
                    />
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">{t("auth.email")}</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder={mode === "signup" && allowedDomain ? t("auth.emailPlaceholderWithDomain", { domain: allowedDomain }) : t("auth.emailPlaceholder")}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                {mode === "signup" && allowedDomain && (
                  <p className="text-xs text-muted-foreground">
                    {t("auth.emailHelperWithDomain", { domain: allowedDomain })}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">{t("auth.password")}</Label>
                  {mode === "signin" && (
                    <ForgotPasswordDialog allowedDomain={allowedDomain}>
                      <button
                        type="button"
                        className="text-xs text-primary hover:underline"
                      >
                        {t("auth.forgotPassword")}
                      </button>
                    </ForgotPasswordDialog>
                  )}
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    // Glyph, not language — deliberately not i18n.
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                    aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : mode === "signin" ? (
                  t("auth.signIn")
                ) : (
                  t("auth.createAccount")
                )}
              </Button>
            </form>


            <p className="text-center text-sm text-muted-foreground mt-6">
              {mode === "signin" ? (
                <>
                  {t("auth.dontHaveAccount")}{" "}
                  <button
                    onClick={() => setMode("signup")}
                    className="text-primary hover:underline font-medium"
                  >
                    {t("auth.signUp")}
                  </button>
                </>
              ) : (
                <>
                  {t("auth.alreadyHaveAccount")}{" "}
                  <button
                    onClick={() => setMode("signin")}
                    className="text-primary hover:underline font-medium"
                  >
                    {t("auth.signIn")}
                  </button>
                </>
              )}
            </p>
          </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Auth;

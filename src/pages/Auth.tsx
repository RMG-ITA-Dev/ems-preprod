import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { useGlobalSettings } from "@/hooks/useEmsData";
import { toast } from "sonner";
import { Briefcase, TrendingUp, Users, Shield, Loader2 } from "lucide-react";
import { z } from "zod";

const emailSchema = z.string().trim().email({ message: "Invalid email address" }).max(255, { message: "Email must be less than 255 characters" });
// Sign-in: allow existing users with 6-char passwords
const signinPasswordSchema = z.string().min(6, { message: "Password must be at least 6 characters" }).max(100, { message: "Password must be less than 100 characters" });
// Sign-up: enforce stronger passwords for new accounts
const signupPasswordSchema = z.string().min(8, { message: "Password must be at least 8 characters" }).max(100, { message: "Password must be less than 100 characters" });
const nameSchema = z.string().trim().min(1, { message: "Required" }).max(100, { message: "Must be less than 100 characters" });

// Company email validation function - domain loaded from settings
const createCompanyEmailSchema = (allowedDomain: string) => z.string()
  .trim()
  .email({ message: "Invalid email address" })
  .max(255, { message: "Email must be less than 255 characters" })
  .refine(
    (email) => !allowedDomain || email.toLowerCase().endsWith(`@${allowedDomain.toLowerCase()}`),
    { message: `Solo se permiten correos @${allowedDomain}` }
  );

const Auth = () => {
  const { t } = useTranslation();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [loading, setLoading] = useState(false);
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const { data: settings } = useGlobalSettings();

  // Get allowed domain from settings
  const allowedDomain = settings?.find(s => s.setting_key === 'ALLOWED_EMAIL_DOMAIN')?.setting_value || '';

  // Show demo button only in dev mode or Lovable preview URLs
  const isDev = import.meta.env.DEV;
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
  const isLovablePreview = hostname.includes('lovable.app') || hostname.includes('preview');
  const showDemoButton = isDev || isLovablePreview;

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
        
        const { error } = await signUp(validatedEmail, validatedPassword, validatedFirstName, validatedLastName);
        if (error) {
          if (error.message.includes("already registered")) {
            toast.error(t("messages.emailAlreadyRegistered"));
          } else if (error.message.includes("restricted to @")) {
            toast.error(t("auth.invalidDomain"));
          } else {
            toast.error(error.message);
          }
        } else {
          toast.success(t("messages.accountCreated"));
          navigate("/");
        }
      } else {
        const { error } = await signIn(validatedEmail, validatedPassword);
        if (error) {
          if (error.message.includes("Invalid login credentials")) {
            toast.error(t("messages.invalidCredentials"));
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
        toast.error(err.errors[0].message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleQuickAdminLogin = async () => {
    setLoading(true);
    const adminEmail = "admin@ems.demo";
    const adminPassword = "admin123";
    
    // Try to sign in first
    const { error: signInError } = await signIn(adminEmail, adminPassword);
    
    if (signInError) {
      // If sign in fails, create the account
      const { error: signUpError } = await signUp(adminEmail, adminPassword, "Admin", "User");
      if (signUpError && !signUpError.message.includes("already registered")) {
        toast.error("Failed to create demo account: " + signUpError.message);
        setLoading(false);
        return;
      }
      // Try signing in again after signup
      const { error: retryError } = await signIn(adminEmail, adminPassword);
      if (retryError) {
        toast.error("Failed to sign in: " + retryError.message);
        setLoading(false);
        return;
      }
    }
    
    toast.success(t("messages.welcomeAdmin"));
    navigate("/");
    setLoading(false);
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
            <h1 className="text-2xl font-bold text-primary-foreground">EMS 2.0</h1>
            <p className="text-primary-foreground/70 text-sm">Engagement Management System</p>
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
                      placeholder="John"
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
                      placeholder="Doe"
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
                  placeholder={mode === "signup" && allowedDomain ? `tu.nombre@${allowedDomain}` : "tu.correo@ejemplo.com"}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                {mode === "signup" && allowedDomain && (
                  <p className="text-xs text-muted-foreground">
                    {t("auth.emailHelper").replace("@ruizmier.com", `@${allowedDomain}`)}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">{t("auth.password")}</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
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

            {showDemoButton && (
              <>
                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-border" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">{t("common.or")}</span>
                  </div>
                </div>

                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleQuickAdminLogin}
                  disabled={loading}
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Shield className="h-4 w-4 mr-2" />
                  )}
                  {t("auth.quickAdminLogin")}
                </Button>
                <p className="text-xs text-center text-muted-foreground mt-2">
                  {t("auth.demoDescription")}
                </p>
              </>
            )}

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
        </div>
      </div>
    </div>
  );
};

export default Auth;

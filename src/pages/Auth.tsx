import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Briefcase, TrendingUp, Users, Shield, Loader2 } from "lucide-react";
import { z } from "zod";

const emailSchema = z.string().trim().email({ message: "Invalid email address" }).max(255);
const passwordSchema = z.string().min(6, { message: "Password must be at least 6 characters" });
const nameSchema = z.string().trim().min(1, { message: "Name is required" }).max(100);

const Auth = () => {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [loading, setLoading] = useState(false);
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Validate inputs
      const validatedEmail = emailSchema.parse(email);
      const validatedPassword = passwordSchema.parse(password);

      if (mode === "signup") {
        const validatedFirstName = nameSchema.parse(firstName);
        const validatedLastName = nameSchema.parse(lastName);
        
        const { error } = await signUp(validatedEmail, validatedPassword, validatedFirstName, validatedLastName);
        if (error) {
          if (error.message.includes("already registered")) {
            toast.error("This email is already registered. Please sign in instead.");
          } else {
            toast.error(error.message);
          }
        } else {
          toast.success("Account created successfully!");
          navigate("/");
        }
      } else {
        const { error } = await signIn(validatedEmail, validatedPassword);
        if (error) {
          if (error.message.includes("Invalid login credentials")) {
            toast.error("Invalid email or password. Please try again.");
          } else {
            toast.error(error.message);
          }
        } else {
          toast.success("Welcome back!");
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
    
    toast.success("Welcome, Admin!");
    navigate("/");
    setLoading(false);
  };

  const features = [
    {
      icon: Briefcase,
      title: "Engagement Management",
      description: "Track client engagements, work orders, and project budgets with precision.",
    },
    {
      icon: TrendingUp,
      title: "Multi-Currency Support",
      description: "Handle BOB and USD transactions with automatic rate calculations.",
    },
    {
      icon: Users,
      title: "Staff & Time Tracking",
      description: "Log hours, manage staff categories, and monitor utilization rates.",
    },
    {
      icon: Shield,
      title: "Role-Based Access",
      description: "Secure RBAC system with Admin, Staff, and Viewer permissions.",
    },
  ];

  return (
    <div className="min-h-screen flex">
      {/* Left Panel - Features */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-accent via-accent/90 to-primary p-12 flex-col justify-between">
        <div>
          <div className="flex items-center gap-3 mb-16">
            <div className="h-12 w-12 rounded-xl bg-white/10 backdrop-blur flex items-center justify-center">
              <Briefcase className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">EMS 2.0</h1>
              <p className="text-white/70 text-sm">Engagement Management System</p>
            </div>
          </div>

          <div className="space-y-8">
            {features.map((feature, index) => (
              <div key={index} className="flex gap-4">
                <div className="h-10 w-10 rounded-lg bg-white/10 backdrop-blur flex items-center justify-center flex-shrink-0">
                  <feature.icon className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-white mb-1">{feature.title}</h3>
                  <p className="text-white/70 text-sm leading-relaxed">{feature.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-white/50 text-sm">
          Trusted by audit & consulting professionals in Bolivia
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
                Sign In
              </button>
              <button
                onClick={() => setMode("signup")}
                className={`flex-1 py-2.5 px-4 rounded-full text-sm font-medium transition-all ${
                  mode === "signup"
                    ? "bg-accent text-accent-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Sign Up
              </button>
            </div>

            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-foreground">
                {mode === "signin" ? "Welcome Back" : "Create Account"}
              </h2>
              <p className="text-muted-foreground mt-1">
                {mode === "signin"
                  ? "Enter your credentials to access your account"
                  : "Fill in your details to get started"}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "signup" && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name</Label>
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
                    <Label htmlFor="lastName">Last Name</Label>
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
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
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
                className="w-full bg-accent hover:bg-accent/90 text-accent-foreground"
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : mode === "signin" ? (
                  "Sign In"
                ) : (
                  "Create Account"
                )}
              </Button>
            </form>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">Or</span>
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
              Quick Admin Login (Demo)
            </Button>
            <p className="text-xs text-center text-muted-foreground mt-2">
              For testing purposes - creates/logs into demo admin account
            </p>

            <p className="text-center text-sm text-muted-foreground mt-6">
              {mode === "signin" ? (
                <>
                  Don't have an account?{" "}
                  <button
                    onClick={() => setMode("signup")}
                    className="text-accent hover:underline font-medium"
                  >
                    Sign up
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{" "}
                  <button
                    onClick={() => setMode("signin")}
                    className="text-accent hover:underline font-medium"
                  >
                    Sign in
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

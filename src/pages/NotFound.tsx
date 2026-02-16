import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { logger } from "@/lib/logger";
import { useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/layout/AppLayout";

const NotFoundContent = () => {
  const { t } = useTranslation();

  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold">404</h1>
        <p className="mb-4 text-xl text-muted-foreground">{t("notFound.title")}</p>
        <a href="/" className="text-primary underline hover:text-primary/90">
          {t("notFound.returnHome")}
        </a>
      </div>
    </div>
  );
};

const NotFound = () => {
  const location = useLocation();
  const { user, loading } = useAuth();

  useEffect(() => {
    logger.warn("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  if (loading) {
    return null;
  }

  // Authenticated users get full AppLayout with header
  if (user) {
    return (
      <AppLayout title="404">
        <NotFoundContent />
      </AppLayout>
    );
  }

  // Unauthenticated users get standalone page with brand
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted">
      <h1
        className="mb-8 font-bold text-primary text-2xl"
        style={{ fontFamily: '"IBM Plex Sans", system-ui, sans-serif' }}
      >
        RuizmierGroup - EMS 2.0
      </h1>
      <NotFoundContent />
    </div>
  );
};

export default NotFound;

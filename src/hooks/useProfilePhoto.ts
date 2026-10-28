import { useEffect, useState } from "react";
import { PROFILE_PHOTO_EVENT, readProfilePhoto } from "@/lib/profilePhoto";

// Foto de Microsoft de la cuenta actual, o null para mostrar las iniciales. Se actualiza cuando
// useAuth la guarda (llega unos instantes después del ingreso) o la borra al cerrar sesión.
export function useProfilePhoto(userId: string | null | undefined): string | null {
  const [photo, setPhoto] = useState(() => readProfilePhoto(userId));

  useEffect(() => {
    const refresh = () => setPhoto(readProfilePhoto(userId));
    refresh();
    window.addEventListener(PROFILE_PHOTO_EVENT, refresh);
    return () => window.removeEventListener(PROFILE_PHOTO_EVENT, refresh);
  }, [userId]);

  return photo;
}

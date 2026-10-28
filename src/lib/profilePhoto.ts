// Foto de perfil de Microsoft para el avatar del navbar (docs/plan-entra-id-consolidado.md,
// Entrega 3). Solo la propia persona, solo en su navegador: no pasa por Storage ni por la base.
//
// - Se pide a Graph con el `provider_token` que Supabase entrega al volver de Microsoft (permiso
//   delegado `User.Read`). Ese token no se guarda en ningún lado nuestro.
// - Se guarda como data URL en localStorage, con la clave atada al id de la cuenta, y se borra al
//   cerrar sesión. Cualquier falla (sin foto, Graph caído, localStorage bloqueado) deja las
//   iniciales; nunca bloquea el ingreso.

const KEY_PREFIX = "ems.profilePhoto.";
// Avisa a los avatares montados que la foto cambió (se guardó o se borró).
export const PROFILE_PHOTO_EVENT = "ems:profile-photo";
// 64x64 es lo más chico que sirve Graph y alcanza para un círculo de 36-40 px. Pesa pocos KB.
const GRAPH_PHOTO_URL = "https://graph.microsoft.com/v1.0/me/photos/64x64/$value";
// Tope de seguridad para no llenar localStorage si Graph devolviera algo inesperado.
const MAX_BYTES = 100 * 1024;

const keyFor = (userId: string) => `${KEY_PREFIX}${userId}`;

function notify() {
  window.dispatchEvent(new Event(PROFILE_PHOTO_EVENT));
}

export function readProfilePhoto(userId: string | null | undefined): string | null {
  if (!userId) return null;
  try {
    return localStorage.getItem(keyFor(userId));
  } catch {
    return null;
  }
}

export function clearProfilePhotos() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key?.startsWith(KEY_PREFIX)) localStorage.removeItem(key);
    }
  } catch {
    // localStorage bloqueado: no hay nada guardado que borrar.
  }
  notify();
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Pide la foto a Graph y la guarda para `userId`. Devuelve lo que quedó guardado (o null).
 * 404 = la persona no tiene foto en Microsoft: se borra la anterior para no mostrar una vieja.
 * Cualquier otro error conserva lo que hubiera.
 */
export async function cacheMicrosoftPhoto(userId: string, providerToken: string): Promise<string | null> {
  try {
    const response = await fetch(GRAPH_PHOTO_URL, {
      headers: { Authorization: `Bearer ${providerToken}` },
    });
    if (response.status === 404) {
      try {
        localStorage.removeItem(keyFor(userId));
      } catch {
        // sin localStorage no hay foto vieja que borrar
      }
      notify();
      return null;
    }
    if (!response.ok) {
      console.warn("[profilePhoto] Graph respondió", response.status);
      return readProfilePhoto(userId);
    }
    const blob = await response.blob();
    if (!blob.type.startsWith("image/") || blob.size > MAX_BYTES) {
      console.warn("[profilePhoto] respuesta descartada:", blob.type, blob.size);
      return readProfilePhoto(userId);
    }
    const dataUrl = await blobToDataUrl(blob);
    localStorage.setItem(keyFor(userId), dataUrl);
    notify();
    return dataUrl;
  } catch (error) {
    console.warn("[profilePhoto] no se pudo obtener la foto:", error);
    return null;
  }
}

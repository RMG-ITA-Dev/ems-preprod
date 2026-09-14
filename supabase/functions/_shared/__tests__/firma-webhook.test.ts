import { describe, it, expect } from "vitest";
import {
  FirmaWebhookError,
  TOLERANCIA_SEGUNDOS,
  normalizarSecreto,
  verificarFirmaWebhook,
} from "../firma-webhook.ts";

const SECRETO_BASE64 = btoa("secreto-de-prueba-del-hook");
const SECRETO = `v1,whsec_${SECRETO_BASE64}`;
const CUERPO = JSON.stringify({ user: { email: "persona@ruizmier.com" } });
const ID = "msg_2x9";
const AHORA = 1_757_500_000;

/** Firma como lo hace Supabase, para no probar la verificacion contra si misma. */
async function firmar(cuerpo: string, id = ID, timestamp = AHORA): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    normalizarSecreto(SECRETO),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const firma = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${id}.${timestamp}.${cuerpo}`),
  );
  return btoa(String.fromCharCode(...new Uint8Array(firma)));
}

function headers(valores: Record<string, string>): Headers {
  return new Headers(valores);
}

describe("verificarFirmaWebhook", () => {
  it("acepta una firma valida", async () => {
    const firma = await firmar(CUERPO);
    await expect(
      verificarFirmaWebhook({
        secreto: SECRETO,
        cuerpo: CUERPO,
        headers: headers({
          "webhook-id": ID,
          "webhook-timestamp": String(AHORA),
          "webhook-signature": `v1,${firma}`,
        }),
        ahoraSegundos: AHORA,
      }),
    ).resolves.toBeUndefined();
  });

  it("rechaza si el cuerpo cambio despues de firmado", async () => {
    const firma = await firmar(CUERPO);
    await expect(
      verificarFirmaWebhook({
        secreto: SECRETO,
        cuerpo: JSON.stringify({ user: { email: "otro@ruizmier.com" } }),
        headers: headers({
          "webhook-id": ID,
          "webhook-timestamp": String(AHORA),
          "webhook-signature": `v1,${firma}`,
        }),
        ahoraSegundos: AHORA,
      }),
    ).rejects.toThrow(/no coincide/);
  });

  it("rechaza una firma hecha con otro secreto", async () => {
    await expect(
      verificarFirmaWebhook({
        secreto: `v1,whsec_${btoa("otro-secreto")}`,
        cuerpo: CUERPO,
        headers: headers({
          "webhook-id": ID,
          "webhook-timestamp": String(AHORA),
          "webhook-signature": `v1,${await firmar(CUERPO)}`,
        }),
        ahoraSegundos: AHORA,
      }),
    ).rejects.toThrow(FirmaWebhookError);
  });

  it("rechaza un reenvio viejo aunque la firma sea valida", async () => {
    // La firma sola no distingue una peticion capturada hace una hora de una recien llegada.
    const viejo = AHORA - TOLERANCIA_SEGUNDOS - 1;
    const firma = await firmar(CUERPO, ID, viejo);
    await expect(
      verificarFirmaWebhook({
        secreto: SECRETO,
        cuerpo: CUERPO,
        headers: headers({
          "webhook-id": ID,
          "webhook-timestamp": String(viejo),
          "webhook-signature": `v1,${firma}`,
        }),
        ahoraSegundos: AHORA,
      }),
    ).rejects.toThrow(/ventana/);
  });

  it("acepta cuando una de varias firmas coincide (rotacion de secreto)", async () => {
    // Durante una rotacion el header llega con la firma vieja y la nueva separadas por espacio.
    const firma = await firmar(CUERPO);
    await expect(
      verificarFirmaWebhook({
        secreto: SECRETO,
        cuerpo: CUERPO,
        headers: headers({
          "webhook-id": ID,
          "webhook-timestamp": String(AHORA),
          "webhook-signature": `v1,${btoa("firma-vieja")} v1,${firma}`,
        }),
        ahoraSegundos: AHORA,
      }),
    ).resolves.toBeUndefined();
  });

  it("falta un header y no se verifica nada", async () => {
    await expect(
      verificarFirmaWebhook({
        secreto: SECRETO,
        cuerpo: CUERPO,
        headers: headers({ "webhook-id": ID, "webhook-timestamp": String(AHORA) }),
        ahoraSegundos: AHORA,
      }),
    ).rejects.toThrow(/Faltan headers/);
  });

  it("un timestamp no numerico se rechaza", async () => {
    await expect(
      verificarFirmaWebhook({
        secreto: SECRETO,
        cuerpo: CUERPO,
        headers: headers({
          "webhook-id": ID,
          "webhook-timestamp": "ayer",
          "webhook-signature": `v1,${await firmar(CUERPO)}`,
        }),
        ahoraSegundos: AHORA,
      }),
    ).rejects.toThrow(/no es un número/);
  });

  it("una firma sin el prefijo v1 no cuenta", async () => {
    await expect(
      verificarFirmaWebhook({
        secreto: SECRETO,
        cuerpo: CUERPO,
        headers: headers({
          "webhook-id": ID,
          "webhook-timestamp": String(AHORA),
          "webhook-signature": await firmar(CUERPO),
        }),
        ahoraSegundos: AHORA,
      }),
    ).rejects.toThrow(/ninguna firma v1/);
  });
});

describe("normalizarSecreto", () => {
  it("acepta las tres formas en que se copia del dashboard", () => {
    const esperado = normalizarSecreto(SECRETO_BASE64);
    expect(normalizarSecreto(`whsec_${SECRETO_BASE64}`)).toEqual(esperado);
    expect(normalizarSecreto(`v1,whsec_${SECRETO_BASE64}`)).toEqual(esperado);
  });

  it("un secreto vacio es un error de configuracion, no una firma invalida", () => {
    expect(() => normalizarSecreto("   ")).toThrow(FirmaWebhookError);
  });
});

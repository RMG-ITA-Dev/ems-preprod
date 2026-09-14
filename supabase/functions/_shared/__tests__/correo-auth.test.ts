import { describe, it, expect, vi } from "vitest";
import {
  generarYEnviarCorreoAuth,
  UsuarioInexistente,
  type ClienteAdmin,
  type EnviarCorreoFn,
} from "../correo-auth.ts";

const SUPABASE_URL = "https://proyecto.supabase.co";
const REDIRECT = "http://localhost:8080/reset-password?reason=admin_unlock";

/** Cliente falso: devuelve el token que se le indique, o el error que se le indique. */
function adminFalso(respuesta: {
  hashedToken?: string | null;
  error?: { message: string };
}): ClienteAdmin & { llamadas: unknown[] } {
  const llamadas: unknown[] = [];
  return {
    llamadas,
    auth: {
      admin: {
        generateLink: vi.fn(async (parametros) => {
          llamadas.push(parametros);
          if (respuesta.error) return { data: null, error: respuesta.error };
          return {
            data: { properties: { hashed_token: respuesta.hashedToken ?? undefined } },
            error: null,
          };
        }),
      },
    },
  };
}

const enviarFalso = (): EnviarCorreoFn & { enviados: unknown[] } => {
  const enviados: unknown[] = [];
  const fn = vi.fn(async (input: unknown) => {
    enviados.push(input);
    return { estado: "simulado" as const, redirigido: true };
  });
  return Object.assign(fn, { enviados }) as EnviarCorreoFn & { enviados: unknown[] };
};

describe("generarYEnviarCorreoAuth", () => {
  it("pide el enlace a GoTrue y manda el correo por el transporte inyectado", async () => {
    const admin = adminFalso({ hashedToken: "pkce_abc123" });
    const enviar = enviarFalso();

    const resultado = await generarYEnviarCorreoAuth({
      admin,
      enviar,
      tipo: "recovery",
      email: "persona@ruizmier.com",
      redirectTo: REDIRECT,
      supabaseUrl: SUPABASE_URL,
    });

    expect(admin.llamadas).toEqual([
      { type: "recovery", email: "persona@ruizmier.com", options: { redirectTo: REDIRECT } },
    ]);
    expect(resultado).toEqual({ estado: "simulado", redirigido: true });

    const enviado = enviar.enviados[0] as { destinatarios: string[]; asunto: string; cuerpoTexto: string };
    expect(enviado.destinatarios).toEqual(["persona@ruizmier.com"]);
    // `reason=admin_unlock` en el destino cambia la copia, igual que en el hook.
    expect(enviado.asunto).toBe("Su cuenta de EMS fue desbloqueada");
    expect(enviado.cuerpoTexto).toContain("token=pkce_abc123");
  });

  it("el alta pasa la contrasena y la metadata, que generateLink exige", async () => {
    const admin = adminFalso({ hashedToken: "pkce_signup" });

    await generarYEnviarCorreoAuth({
      admin,
      enviar: enviarFalso(),
      tipo: "signup",
      email: "nueva@ruizmier.com",
      redirectTo: "http://localhost:8080/",
      supabaseUrl: SUPABASE_URL,
      password: "una-contrasena",
      metadata: { first_name: "Ana", last_name: "Perez" },
    });

    expect(admin.llamadas[0]).toEqual({
      type: "signup",
      email: "nueva@ruizmier.com",
      password: "una-contrasena",
      options: {
        redirectTo: "http://localhost:8080/",
        data: { first_name: "Ana", last_name: "Perez" },
      },
    });
  });

  it("un correo sin cuenta se distingue del resto de los errores", async () => {
    // Quien llama necesita poder responder igual exista o no la cuenta, sin confundirlo
    // con una caida de verdad.
    const admin = adminFalso({ error: { message: "User not found" } });

    await expect(
      generarYEnviarCorreoAuth({
        admin,
        enviar: enviarFalso(),
        tipo: "recovery",
        email: "fantasma@ruizmier.com",
        redirectTo: REDIRECT,
        supabaseUrl: SUPABASE_URL,
      }),
    ).rejects.toThrow(UsuarioInexistente);
  });

  it("cualquier otro error de GoTrue sube con su mensaje", async () => {
    const admin = adminFalso({ error: { message: "redirect_to is not allowed" } });

    await expect(
      generarYEnviarCorreoAuth({
        admin,
        enviar: enviarFalso(),
        tipo: "recovery",
        email: "persona@ruizmier.com",
        redirectTo: "https://sitio-no-permitido.example/x",
        supabaseUrl: SUPABASE_URL,
      }),
    ).rejects.toThrow(/redirect_to is not allowed/);
  });

  it("sin hashed_token no se manda nada", async () => {
    // Un enlace sin token es un correo inutil: mejor fallar que mandarlo.
    const admin = adminFalso({ hashedToken: null });
    const enviar = enviarFalso();

    await expect(
      generarYEnviarCorreoAuth({
        admin,
        enviar,
        tipo: "recovery",
        email: "persona@ruizmier.com",
        redirectTo: REDIRECT,
        supabaseUrl: SUPABASE_URL,
      }),
    ).rejects.toThrow(/hashed_token/);

    expect(enviar.enviados).toHaveLength(0);
  });

  it("propaga el estado del envio, que es como se sabe si salio de verdad", async () => {
    const admin = adminFalso({ hashedToken: "pkce_abc123" });
    const enviar = vi.fn(async () => ({ estado: "enviado" as const, redirigido: false }));

    const resultado = await generarYEnviarCorreoAuth({
      admin,
      enviar,
      tipo: "recovery",
      email: "persona@ruizmier.com",
      redirectTo: REDIRECT,
      supabaseUrl: SUPABASE_URL,
    });

    expect(resultado).toEqual({ estado: "enviado", redirigido: false });
  });
});

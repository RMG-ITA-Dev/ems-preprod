import { describe, it, expect, vi } from "vitest";
import {
  devolverCupoDeCorreo,
  FalloDeEnvio,
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
  /** Lo que GoTrue devuelve en `data.user` al crear la cuenta de un `signup`. */
  usuarioId?: string | null;
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
            data: {
              properties: { hashed_token: respuesta.hashedToken ?? undefined },
              user: respuesta.usuarioId ? { id: respuesta.usuarioId } : null,
            },
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

  /**
   * Las dos fases no significan lo mismo en un `signup`: `generateLink` CREA LA CUENTA y recién
   * después se manda el mensaje. Si falla lo primero no quedó nada; si falla lo segundo quedó una
   * cuenta sin confirmar y sin correo, y `register-user` tiene que poder deshacerla — su
   * reintento no puede, porque a partir de ahí GoTrue responde "ya registrado".
   */
  describe("cuando el envio falla despues de generar el enlace", () => {
    it("lanza FalloDeEnvio con el id de la cuenta recien creada", async () => {
      const admin = adminFalso({ hashedToken: "pkce_abc123", usuarioId: "u-123" });
      const enviar = vi.fn(async () => {
        throw new Error("Graph 503");
      });

      const fallo = await generarYEnviarCorreoAuth({
        admin,
        enviar,
        tipo: "signup",
        email: "persona@ruizmier.com",
        redirectTo: REDIRECT,
        supabaseUrl: SUPABASE_URL,
        password: "unaClaveLarga",
      }).catch((e) => e);

      expect(fallo).toBeInstanceOf(FalloDeEnvio);
      expect(fallo.usuarioId).toBe("u-123");
      // El motivo original no se pierde: es lo que se registra en los logs.
      expect(fallo.message).toBe("Graph 503");
      expect((fallo as FalloDeEnvio).causa).toBeInstanceOf(Error);
    });

    it("un fallo de GENERACION no es FalloDeEnvio: no hay cuenta que deshacer", async () => {
      const admin = adminFalso({ error: { message: "email_exists" } });
      const enviar = enviarFalso();

      const fallo = await generarYEnviarCorreoAuth({
        admin,
        enviar,
        tipo: "signup",
        email: "persona@ruizmier.com",
        redirectTo: REDIRECT,
        supabaseUrl: SUPABASE_URL,
        password: "unaClaveLarga",
      }).catch((e) => e);

      expect(fallo).toBeInstanceOf(Error);
      expect(fallo).not.toBeInstanceOf(FalloDeEnvio);
      expect(enviar.enviados).toHaveLength(0);
    });

    it("en recovery no hay usuarioId: la cuenta ya existia y no se deshace nada", async () => {
      const admin = adminFalso({ hashedToken: "pkce_abc123" });
      const enviar = vi.fn(async () => {
        throw new Error("Graph 503");
      });

      const fallo = await generarYEnviarCorreoAuth({
        admin,
        enviar,
        tipo: "recovery",
        email: "persona@ruizmier.com",
        redirectTo: REDIRECT,
        supabaseUrl: SUPABASE_URL,
      }).catch((e) => e);

      expect(fallo).toBeInstanceOf(FalloDeEnvio);
      expect(fallo.usuarioId).toBeNull();
    });

    it("un envio exitoso no lanza nada", async () => {
      const admin = adminFalso({ hashedToken: "pkce_abc123", usuarioId: "u-123" });
      const enviar = enviarFalso();

      await expect(
        generarYEnviarCorreoAuth({
          admin,
          enviar,
          tipo: "signup",
          email: "persona@ruizmier.com",
          redirectTo: REDIRECT,
          supabaseUrl: SUPABASE_URL,
          password: "unaClaveLarga",
        }),
      ).resolves.toEqual({ estado: "simulado", redirigido: true });
      expect(enviar.enviados).toHaveLength(1);
    });
  });

  describe("devolverCupoDeCorreo", () => {
    it("llama a la RPC con el correo normalizado por la base", async () => {
      const rpc = vi.fn(async () => ({ error: null }));

      await devolverCupoDeCorreo({ rpc }, "persona@ruizmier.com", "register-user");

      expect(rpc).toHaveBeenCalledWith("release_auth_email_slot", {
        p_email: "persona@ruizmier.com",
      });
    });

    it("no lanza si la RPC falla: corre dentro de un camino de error y no puede taparlo", async () => {
      const rpc = vi.fn(async () => ({ error: { message: "connection reset" } }));
      const consola = vi.spyOn(console, "error").mockImplementation(() => {});

      await expect(
        devolverCupoDeCorreo({ rpc }, "persona@ruizmier.com", "register-user"),
      ).resolves.toBeUndefined();
      expect(consola).toHaveBeenCalled();

      consola.mockRestore();
    });
  });
});

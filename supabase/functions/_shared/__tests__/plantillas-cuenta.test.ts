import { describe, it, expect } from "vitest";
import {
  construirEnlaceVerificacion,
  esDesbloqueoAdministrativo,
  renderizarCorreoAuth,
  renderizarCorreoCuentaExistente,
  TipoCorreoNoSoportado,
  type DatosCorreoAuth,
} from "../plantillas/cuenta.ts";

const BASE: DatosCorreoAuth = {
  tipo: "recovery",
  tokenHash: "hash-de-token",
  redirectTo: "https://ems.example.com/reset-password",
  siteUrl: "https://ems.example.com",
  supabaseUrl: "https://proyecto.supabase.co",
  email: "persona@ruizmier.com",
  nombre: "Neil",
};

const datos = (parche: Partial<DatosCorreoAuth> = {}): DatosCorreoAuth => ({ ...BASE, ...parche });

describe("construirEnlaceVerificacion", () => {
  it("apunta a /auth/v1/verify del proyecto, no a la app", () => {
    // La app no puede validar el token_hash: el enlace tiene que pasar por GoTrue primero.
    const enlace = construirEnlaceVerificacion(datos());
    expect(enlace.startsWith("https://proyecto.supabase.co/auth/v1/verify?")).toBe(true);
    expect(enlace).toContain("token=hash-de-token");
    expect(enlace).toContain("type=recovery");
  });

  it("codifica el destino, que viene con query propia", () => {
    // `?reason=admin_unlock` sin codificar partiria la URL de verify en dos.
    const enlace = construirEnlaceVerificacion(
      datos({ redirectTo: "https://ems.example.com/reset-password?reason=admin_unlock" }),
    );
    expect(enlace).toContain(
      "redirect_to=https%3A%2F%2Fems.example.com%2Freset-password%3Freason%3Dadmin_unlock",
    );
  });

  it("cae al site_url cuando GoTrue no manda redirect_to", () => {
    const enlace = construirEnlaceVerificacion(datos({ redirectTo: "" }));
    expect(enlace).toContain("redirect_to=https%3A%2F%2Fems.example.com");
  });

  it("no duplica la barra si la URL del proyecto viene con una al final", () => {
    const enlace = construirEnlaceVerificacion(
      datos({ supabaseUrl: "https://proyecto.supabase.co/" }),
    );
    expect(enlace).not.toContain(".co//auth");
  });
});

describe("renderizarCorreoAuth", () => {
  it("el alta pide confirmar la cuenta", () => {
    const correo = renderizarCorreoAuth(datos({ tipo: "signup" }));
    expect(correo.asunto).toBe("Confirme su cuenta");
    expect(correo.cuerpoTexto).toContain("Estimado/a Neil:");
    expect(correo.cuerpoHtml).toContain("type=signup");
  });

  it("la recuperacion habla de contrasena nueva", () => {
    const correo = renderizarCorreoAuth(datos());
    expect(correo.asunto).toBe("Restablezca su contraseña");
    expect(correo.cuerpoTexto).toContain("Definir contraseña:");
  });

  it("el desbloqueo administrativo tiene copia propia, no la de 'olvide mi contrasena'", () => {
    // Mismo tipo `recovery` para GoTrue, pero el usuario no pidio nada: lo desbloqueo un admin.
    const entrada = datos({
      redirectTo: "https://ems.example.com/reset-password?reason=admin_unlock",
    });
    expect(esDesbloqueoAdministrativo(entrada)).toBe(true);

    const correo = renderizarCorreoAuth(entrada);
    expect(correo.asunto).toBe("Su cuenta fue desbloqueada");
    expect(correo.cuerpoTexto).toContain("Seguridad TI");
  });

  it("sin nombre en el metadata saluda igual", () => {
    const correo = renderizarCorreoAuth(datos({ nombre: null }));
    expect(correo.cuerpoTexto.startsWith("Estimado/a:")).toBe(true);
  });

  it("escapa el nombre: el metadata lo escribe el usuario al registrarse", () => {
    const correo = renderizarCorreoAuth(datos({ nombre: '<script>alert(1)</script>' }));
    expect(correo.cuerpoHtml).not.toContain("<script>");
    expect(correo.cuerpoHtml).toContain("&lt;script&gt;");
  });

  it("el enlace aparece tambien como texto plano, para el cliente que no pinta el boton", () => {
    const correo = renderizarCorreoAuth(datos());
    const enlace = construirEnlaceVerificacion(datos());
    expect(correo.cuerpoTexto).toContain(enlace);
  });

  it("un tipo sin plantilla falla ruidoso en vez de mandar un correo vacio", () => {
    expect(() => renderizarCorreoAuth(datos({ tipo: "reauthentication" }))).toThrow(
      TipoCorreoNoSoportado,
    );
  });

  it("sin token_hash no hay correo", () => {
    expect(() => renderizarCorreoAuth(datos({ tokenHash: "" }))).toThrow(/token_hash/);
  });

  it("los cinco tipos soportados rinden asunto y cuerpo", () => {
    for (const tipo of ["signup", "recovery", "invite", "magiclink", "email_change"]) {
      const correo = renderizarCorreoAuth(datos({ tipo }));
      expect(correo.asunto.length).toBeGreaterThan(0);
      expect(correo.cuerpoTexto).toContain("https://proyecto.supabase.co/auth/v1/verify");
      expect(correo.cuerpoHtml).toContain("<a href=");
    }
  });
});

describe("renderizarCorreoCuentaExistente", () => {
  it("avisa por correo lo que la respuesta del registro no puede decir", () => {
    // El formulario responde igual exista o no la cuenta, para no servir de detector de
    // usuarios. El aviso viaja por correo, que solo lee el dueno de la casilla.
    const correo = renderizarCorreoCuentaExistente({
      urlApp: "http://localhost:8080/auth",
      nombre: "Neil",
    });

    expect(correo.asunto).toBe("Ya existe una cuenta con este correo");
    expect(correo.cuerpoTexto).toContain("Estimado/a Neil:");
    expect(correo.cuerpoTexto).toContain("http://localhost:8080/auth");
    expect(correo.cuerpoHtml).toContain("http://localhost:8080/auth");
  });

  it("no habla de vencimiento: no lleva token", () => {
    const correo = renderizarCorreoCuentaExistente({ urlApp: "http://localhost:8080/auth" });

    expect(correo.cuerpoTexto).not.toContain("vence");
    expect(correo.cuerpoHtml).not.toContain("vence");
    expect(correo.cuerpoTexto).not.toContain("/auth/v1/verify");
  });
});

/**
 * El correo institucional sale con la paleta de la firma, no con la que venga a mano.
 *
 * Antes usaba la Blue Grey de Tailwind y un `#0f4c81` que quería ser el navy de la marca y estaba
 * corrido dos por ciento: los colores del mensaje no eran los de Ruizmier. En correo no hay
 * tokens —Outlook no resuelve `var()` y los clientes descartan las clases—, así que esto es lo
 * único que ata el HTML a `docs/skills/design-system.md`.
 */
describe("paleta de la marca", () => {
  const html = renderizarCorreoAuth(datos()).cuerpoHtml;

  it("usa los hex del design system", () => {
    expect(html).toContain("#f7f9fc"); // background
    expect(html).toContain("#0f3c73"); // brand-navy: texto y botón
    expect(html).toContain("#5a6370"); // brand-gray: texto secundario
    expect(html).toContain("#c9d4e9"); // border
  });

  it("no quedó nada de la paleta anterior", () => {
    for (const viejo of ["#0f4c81", "#1f2933", "#52606d", "#f4f5f7", "#e4e7eb", "#7b8794"]) {
      expect(html, viejo).not.toContain(viejo);
    }
  });

  it("el botón va en navy, que es el que pasa AA sobre blanco", () => {
    // Blanco sobre `brand-teal` da 4.29:1, por debajo del 4.5:1 de AA para texto normal; sobre
    // navy da 10.97:1. Y no va en `brand-purple` porque en la app ese color significa
    // Agregar/Guardar (regla 1 de AGENTS.md) y este botón navega.
    expect(html).toMatch(/background:#0f3c73;color:#ffffff;/);
    expect(html).not.toContain("#008795"); // brand-teal
    expect(html).not.toContain("#7c3aed"); // brand-purple
  });
});

/**
 * Los logos viajan DENTRO del mensaje, no por URL.
 *
 * Outlook bloquea las imágenes remotas por defecto: con `<img src="https://...">` el encabezado
 * sale como un recuadro vacío hasta que el lector hace clic en "Descargar imagenes". Lo que
 * sostiene esa decisión son dos mitades que tienen que viajar juntas —el `cid:` del HTML y el
 * adjunto con ese mismo `contentId`—, y nada en el tipo obliga a que coincidan: si una se mueve
 * sin la otra, el correo sale con el ícono de imagen rota y los tests de arriba no se enteran.
 */
describe("logos incrustados", () => {
  const correo = renderizarCorreoAuth(datos());

  it("el HTML referencia los dos logos por cid, no por URL", () => {
    expect(correo.cuerpoHtml).toContain('src="cid:logo-ems"');
    expect(correo.cuerpoHtml).toContain('src="cid:logo-ruizmier"');
    expect(correo.cuerpoHtml).not.toMatch(/<img[^>]+src="https?:/);
  });

  it("cada cid del HTML tiene su adjunto", () => {
    const citados = [...correo.cuerpoHtml.matchAll(/src="cid:([^"]+)"/g)].map((m) => m[1]);
    const adjuntados = correo.adjuntos.map((a) => a.contentId);
    expect(adjuntados.sort()).toEqual(citados.sort());
  });

  it("los adjuntos son PNG con bytes reales y nombre con extensión", () => {
    expect(correo.adjuntos).toHaveLength(2);
    for (const adjunto of correo.adjuntos) {
      expect(adjunto.tipoContenido).toBe("image/png");
      expect(adjunto.nombre).toMatch(/\.png$/);
      expect(adjunto.contenido.byteLength).toBeGreaterThan(1000);
      // Firma PNG: \x89 P N G. Atrapa un base64 cortado o mal decodificado, que de otro modo
      // sólo se vería abriendo el correo.
      expect([...adjunto.contenido.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    }
  });

  it("el `<img>` fija width y height, que es lo que Outlook necesita", () => {
    // El archivo mide el doble del tamaño de presentación, por pantallas HiDPI. Sin los
    // atributos Outlook lo pinta a tamaño original y el encabezado sale al doble.
    expect(correo.cuerpoHtml).toMatch(/<img src="cid:logo-ems"[^>]*width="120"[^>]*height="90"/);
  });

  it("el cuerpo de texto plano no menciona los logos", () => {
    // Quien lee la versión de texto no tiene imágenes: nombrarlas sería ruido.
    expect(correo.cuerpoTexto).not.toContain("cid:");
    expect(correo.cuerpoTexto).not.toContain("logo");
  });
});

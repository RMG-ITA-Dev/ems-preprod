import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  cacheMicrosoftPhoto,
  clearProfilePhotos,
  PROFILE_PHOTO_EVENT,
  readProfilePhoto,
} from "../profilePhoto";

const KEY = "ems.profilePhoto.u1";

function mockFetch(response: { status: number; body?: Blob }) {
  const fetchMock = vi.fn().mockResolvedValue({
    status: response.status,
    ok: response.status >= 200 && response.status < 300,
    blob: () => Promise.resolve(response.body ?? new Blob()),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const jpeg = () => new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: "image/jpeg" });

describe("profilePhoto", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("guarda la foto de Graph como data URL y avisa a los avatares", async () => {
    const fetchMock = mockFetch({ status: 200, body: jpeg() });
    const listener = vi.fn();
    window.addEventListener(PROFILE_PHOTO_EVENT, listener);

    const result = await cacheMicrosoftPhoto("u1", "graph-token");

    window.removeEventListener(PROFILE_PHOTO_EVENT, listener);
    expect(fetchMock).toHaveBeenCalledWith("https://graph.microsoft.com/v1.0/me/photos/64x64/$value", {
      headers: { Authorization: "Bearer graph-token" },
    });
    expect(result).toMatch(/^data:image\/jpeg;base64,/);
    expect(readProfilePhoto("u1")).toBe(result);
    expect(listener).toHaveBeenCalled();
  });

  it("404 (sin foto en Microsoft) borra la foto anterior", async () => {
    localStorage.setItem(KEY, "data:image/jpeg;base64,viejo");
    mockFetch({ status: 404 });

    expect(await cacheMicrosoftPhoto("u1", "t")).toBeNull();
    expect(readProfilePhoto("u1")).toBeNull();
  });

  it("otro error de Graph conserva la foto anterior", async () => {
    localStorage.setItem(KEY, "data:image/jpeg;base64,viejo");
    mockFetch({ status: 429 });

    expect(await cacheMicrosoftPhoto("u1", "t")).toBe("data:image/jpeg;base64,viejo");
    expect(readProfilePhoto("u1")).toBe("data:image/jpeg;base64,viejo");
  });

  it("descarta lo que no es imagen", async () => {
    mockFetch({ status: 200, body: new Blob(["<html>"], { type: "text/html" }) });

    expect(await cacheMicrosoftPhoto("u1", "t")).toBeNull();
    expect(readProfilePhoto("u1")).toBeNull();
  });

  it("si la red falla no lanza", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    await expect(cacheMicrosoftPhoto("u1", "t")).resolves.toBeNull();
  });

  it("clearProfilePhotos borra solo las fotos, no el resto de localStorage", () => {
    localStorage.setItem(KEY, "foto");
    localStorage.setItem("ems.profilePhoto.u2", "foto2");
    localStorage.setItem("sb-ref-auth-token", "sesion");

    clearProfilePhotos();

    expect(readProfilePhoto("u1")).toBeNull();
    expect(readProfilePhoto("u2")).toBeNull();
    expect(localStorage.getItem("sb-ref-auth-token")).toBe("sesion");
  });

  it("sin usuario no hay foto", () => {
    expect(readProfilePhoto(null)).toBeNull();
    expect(readProfilePhoto(undefined)).toBeNull();
  });
});

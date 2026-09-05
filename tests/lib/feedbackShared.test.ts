import { describe, expect, it } from "vitest";
import {
  DESCRIPTION_MAX,
  TITLE_MAX,
  isFeedbackStatus,
  isFeedbackType,
  isValidEmail,
  sanitizePagePath,
  sniffImageType,
  validateFeedbackFields,
} from "@/lib/feedbackShared";

describe("isFeedbackType / isFeedbackStatus", () => {
  it("acepta los valores del enum y rechaza cualquier otra cosa", () => {
    for (const t of ["bug", "suggestion", "question", "other"]) {
      expect(isFeedbackType(t)).toBe(true);
    }
    expect(isFeedbackType("spam")).toBe(false);
    expect(isFeedbackType(null)).toBe(false);
    expect(isFeedbackType(123)).toBe(false);

    for (const s of ["new", "reviewing", "planned", "resolved", "discarded"]) {
      expect(isFeedbackStatus(s)).toBe(true);
    }
    expect(isFeedbackStatus("en-el-limbo")).toBe(false);
  });
});

describe("isValidEmail", () => {
  it("acepta emails con forma razonable", () => {
    expect(isValidEmail("a@b.com")).toBe(true);
    expect(isValidEmail("nombre.apellido@dominio.com.ar")).toBe(true);
  });

  it("rechaza lo que claramente no es un email", () => {
    expect(isValidEmail("no-es-un-email")).toBe(false);
    expect(isValidEmail("@sin-usuario.com")).toBe(false);
    expect(isValidEmail("sin-arroba.com")).toBe(false);
    expect(isValidEmail("con espacio@x.com")).toBe(false);
  });

  it("rechaza un email absurdamente largo", () => {
    expect(isValidEmail(`${"a".repeat(250)}@x.com`)).toBe(false);
  });
});

describe("sanitizePagePath", () => {
  it("se queda sólo con el pathname, sin query ni hash", () => {
    expect(sanitizePagePath("https://fivi.app/g/abc/gastos?token=secreto")).toBe(
      "/g/abc/gastos",
    );
    expect(sanitizePagePath("/ajustes#seccion")).toBe("/ajustes");
  });

  it("null/vacío da null", () => {
    expect(sanitizePagePath(null)).toBeNull();
    expect(sanitizePagePath(undefined)).toBeNull();
    expect(sanitizePagePath("")).toBeNull();
  });

  it("corta a un largo razonable", () => {
    const long = "/" + "a".repeat(500);
    expect(sanitizePagePath(long)!.length).toBeLessThanOrEqual(200);
  });
});

describe("sniffImageType — falla cerrado ante cualquier duda", () => {
  it("reconoce PNG, JPEG y WEBP por sus magic bytes", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    expect(sniffImageType(png)).toBe("image/png");

    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(sniffImageType(jpeg)).toBe("image/jpeg");

    const webp = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
    ]);
    expect(sniffImageType(webp)).toBe("image/webp");
  });

  it("un archivo con Content-Type falsificado no engaña al sniff", () => {
    // Texto plano disfrazado de imagen: el navegador podría declarar
    // "image/png" en el <input>, pero los bytes no mienten.
    const fakePng = new TextEncoder().encode("no soy una imagen de verdad");
    expect(sniffImageType(fakePng)).toBeNull();
  });

  it("bytes insuficientes o formato desconocido -> null", () => {
    expect(sniffImageType(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(sniffImageType(new Uint8Array(20).fill(0))).toBeNull();
  });
});

describe("validateFeedbackFields", () => {
  const base = { type: "bug", title: "Algo", description: "Pasó esto" };

  it("no hay errores con campos válidos", () => {
    expect(validateFeedbackFields(base)).toEqual([]);
  });

  it("tipo inválido, título y descripción vacíos: un error por campo", () => {
    const errs = validateFeedbackFields({ type: "spam", title: "  ", description: "" });
    const fields = errs.map((e) => e.field).sort();
    expect(fields).toEqual(["description", "title", "type"]);
  });

  it("título y descripción demasiado largos", () => {
    const errs = validateFeedbackFields({
      type: "bug",
      title: "x".repeat(TITLE_MAX + 1),
      description: "y".repeat(DESCRIPTION_MAX + 1),
    });
    expect(errs.some((e) => e.field === "title")).toBe(true);
    expect(errs.some((e) => e.field === "description")).toBe(true);
  });

  it("email opcional: ausente no es error, presente e inválido sí", () => {
    expect(validateFeedbackFields(base)).toEqual([]);
    expect(
      validateFeedbackFields({ ...base, contactEmail: "no-es-un-email" }),
    ).toEqual([{ field: "contactEmail", message: expect.any(String) }]);
    expect(
      validateFeedbackFields({ ...base, contactEmail: "si@valido.com" }),
    ).toEqual([]);
  });

  it("campos de bug opcionales: sólo error si superan el largo", () => {
    expect(
      validateFeedbackFields({ ...base, stepsToReproduce: "corto" }),
    ).toEqual([]);
    expect(
      validateFeedbackFields({ ...base, expectedBehavior: "z".repeat(2001) }),
    ).toEqual([{ field: "expectedBehavior", message: expect.any(String) }]);
  });
});

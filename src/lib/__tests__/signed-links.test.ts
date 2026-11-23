import { test } from "node:test";
import assert from "node:assert/strict";
import { signedPath, verifySignedLink } from "../signed-links";

// El secreto se lee al firmar (no al importar), así que basta con fijarlo aquí.
process.env.LINK_SIGNING_SECRET = "test-secret-de-al-menos-32-caracteres-123456";

const ID = "a199ae40-0e26-4fa8-9fb5-f80f938c62a8";
const OTHER = "b299ae40-0e26-4fa8-9fb5-f80f938c62a8";
const parse = (path: string) => {
  const u = new URL(path, "https://x.test");
  return { id: u.pathname.split("/").pop()!, e: u.searchParams.get("e")!, t: u.searchParams.get("t")! };
};

test("enlace firmado válido se acepta", () => {
  const { id, e, t } = parse(signedPath("recibo", ID));
  assert.equal(verifySignedLink("recibo", id, e, t), "ok");
});

test("no sirve para otro documento, otro tipo ni con vencimiento alterado", () => {
  const { e, t } = parse(signedPath("recibo", ID));
  assert.equal(verifySignedLink("recibo", OTHER, e, t), "invalid");
  assert.equal(verifySignedLink("estado", ID, e, t), "invalid");
  assert.equal(verifySignedLink("recibo", ID, String(Number(e) + 86_400), t), "invalid");
});

test("firma manipulada o ausente se rechaza", () => {
  const { e, t } = parse(signedPath("estado", ID));
  const flipped = (t[0] === "A" ? "B" : "A") + t.slice(1);
  assert.equal(verifySignedLink("estado", ID, e, flipped), "invalid");
  assert.equal(verifySignedLink("estado", ID, e, undefined), "invalid");
  assert.equal(verifySignedLink("estado", ID, "abc", t), "invalid");
  assert.equal(verifySignedLink("estado", "../../etc", e, t), "invalid");
});

test("enlace vencido se reporta como vencido", () => {
  const hace200dias = Date.now() - 200 * 86_400_000;
  const { e, t } = parse(signedPath("recibo", ID, hace200dias)); // vigencia 180 días
  assert.equal(verifySignedLink("recibo", ID, e, t), "expired");
});

test("el estado de cuenta vence antes que el recibo", () => {
  const hace60dias = Date.now() - 60 * 86_400_000;
  const est = parse(signedPath("estado", ID, hace60dias)); // vigencia 30 días
  const rec = parse(signedPath("recibo", ID, hace60dias)); // vigencia 180 días
  assert.equal(verifySignedLink("estado", ID, est.e, est.t), "expired");
  assert.equal(verifySignedLink("recibo", ID, rec.e, rec.t), "ok");
});

test("sin secreto propio no se firma nada (no reutiliza claves de Supabase)", () => {
  const saved = process.env.LINK_SIGNING_SECRET;
  delete process.env.LINK_SIGNING_SECRET;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "x".repeat(64);
  try { assert.throws(() => signedPath("recibo", ID), /LINK_SIGNING_SECRET/); }
  finally { process.env.LINK_SIGNING_SECRET = saved; delete process.env.SUPABASE_SERVICE_ROLE_KEY; }
});

test("rechaza usar la clave anon pública como secreto", () => {
  const saved = process.env.LINK_SIGNING_SECRET;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "clave-anon-publica-de-mas-de-32-caracteres-xyz";
  process.env.LINK_SIGNING_SECRET = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  try { assert.throws(() => signedPath("recibo", ID), /anon/); }
  finally { process.env.LINK_SIGNING_SECRET = saved; delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; }
});

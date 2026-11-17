import "server-only";
import crypto from "node:crypto";
import { adminClient } from "@/lib/supabase/admin";

/**
 * Notificaciones push (Web Push, RFC 8291 + VAPID RFC 8292) sin dependencias.
 * Llaves en Vercel: NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY y VAPID_SUBJECT (mailto:…).
 * Se generan una vez con: node scripts/generar-vapid.mjs
 */

export type Aviso = { titulo: string; cuerpo: string; url: string; tag?: string };
type Suscripcion = { endpoint: string; p256dh: string; auth: string };

const b64u = (b: Buffer) => b.toString("base64url");
const deB64u = (s: string) => Buffer.from(s, "base64url");
const hmac = (key: Buffer, data: Buffer) => crypto.createHmac("sha256", key).update(data).digest();

export function pushConfigurado() {
  return !!(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

/** Firma VAPID (JWT ES256) para el servicio push del navegador. */
export function encabezadoVapid(endpoint: string, publica: string, privada: string, sujeto: string) {
  const pub = deB64u(publica);
  const d = deB64u(privada);
  const d32 = d.length >= 32 ? d.subarray(d.length - 32) : Buffer.concat([Buffer.alloc(32 - d.length), d]);
  const key = crypto.createPrivateKey({
    key: { kty: "EC", crv: "P-256", d: b64u(d32), x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) },
    format: "jwk",
  });
  const head = b64u(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64u(Buffer.from(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: sujeto })));
  const firma = crypto.sign("sha256", Buffer.from(`${head}.${claims}`), { key, dsaEncoding: "ieee-p1363" });
  return `vapid t=${head}.${claims}.${b64u(firma)}, k=${publica}`;
}

/** Cifra el mensaje para una suscripción (aes128gcm, un solo registro). */
export function cifrar(texto: string, sub: { p256dh: string; auth: string }) {
  const uaPublic = deB64u(sub.p256dh);
  const authSecret = deB64u(sub.auth);
  const ecdh = crypto.createECDH("prime256v1");
  const asPublic = ecdh.generateKeys();
  const secreto = ecdh.computeSecret(uaPublic);
  const salt = crypto.randomBytes(16);

  const prkKey = hmac(authSecret, secreto);
  const ikm = hmac(prkKey, Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic, Buffer.from([1])]));
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from("Content-Encoding: aes128gcm\0\x01")).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from("Content-Encoding: nonce\0\x01")).subarray(0, 12);

  const cipher = crypto.createCipheriv("aes-128-gcm", cek, nonce);
  const cuerpo = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(texto, "utf8"), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, cuerpo]);
}

/** Envía a una suscripción: "ok", "muerta" (ya no existe, hay que borrarla) o "error". */
async function enviarUno(sub: Suscripcion, aviso: Aviso): Promise<"ok" | "muerta" | "error"> {
  const publica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;
  const privada = process.env.VAPID_PRIVATE_KEY!;
  const sujeto = process.env.VAPID_SUBJECT || "mailto:mantenimiento@pasteko.com";
  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      Authorization: encabezadoVapid(sub.endpoint, publica, privada, sujeto),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "86400",
      Urgency: "high",
    },
    body: new Uint8Array(cifrar(JSON.stringify(aviso), sub)),
    signal: AbortSignal.timeout(8000),
  });
  if (res.status === 404 || res.status === 410) return "muerta";
  if (!res.ok) {
    console.error("push", new URL(sub.endpoint).host, res.status, await res.text().catch(() => ""));
    return "error";
  }
  return "ok";
}

/** Avisa a los usuarios indicados (o a todos los administradores). Nunca lanza error. */
export async function avisar(aviso: Aviso, usuarios?: string[]) {
  if (!pushConfigurado()) return 0;
  try {
    const db = adminClient();
    let ids: string[] = usuarios ?? [];
    if (!usuarios) {
      const { data } = await db.from("perfiles").select("id").eq("rol", "admin").eq("activo", true);
      ids = (data ?? []).map((p) => p.id as string);
    }
    if (!ids.length) return 0;
    const { data: subs } = await db.from("push_suscripciones").select("endpoint, p256dh, auth").in("usuario_id", ids);
    const lista = (subs ?? []) as Suscripcion[];
    const res = await Promise.allSettled(lista.map((s) => enviarUno(s, aviso)));
    const valor = (i: number) => (res[i].status === "fulfilled" ? (res[i] as PromiseFulfilledResult<string>).value : "error");
    res.forEach((r, i) => { if (r.status === "rejected") console.error("push", new URL(lista[i].endpoint).host, r.reason); });
    const muertas = lista.filter((_, i) => valor(i) === "muerta");
    if (muertas.length) await db.from("push_suscripciones").delete().in("endpoint", muertas.map((m) => m.endpoint));
    return lista.filter((_, i) => valor(i) === "ok").length;
  } catch (e) {
    console.error("avisar", e);
    return 0;
  }
}

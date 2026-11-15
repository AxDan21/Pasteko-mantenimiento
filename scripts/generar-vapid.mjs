// Genera las llaves para las notificaciones push. Ejecuta una sola vez:
//   node scripts/generar-vapid.mjs
// y copia las 3 líneas a Vercel → Settings → Environment Variables (y a .env.local).
import crypto from "node:crypto";

const ecdh = crypto.createECDH("prime256v1");
ecdh.generateKeys();
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${ecdh.getPublicKey().toString("base64url")}`);
console.log(`VAPID_PRIVATE_KEY=${ecdh.getPrivateKey().toString("base64url")}`);
console.log(`VAPID_SUBJECT=mailto:tu-correo@pasteko.com`);

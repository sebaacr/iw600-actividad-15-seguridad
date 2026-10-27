# Desafío D – HTTPS y sesiones persistentes para un despliegue real

El laboratorio funciona en `http://localhost` con sesiones en memoria. Este documento resume qué
cambiaría para publicar la aplicación de forma segura.

## 1. HTTPS

**Por qué:** con HTTP, la cookie `iw.sid`, las contraseñas y los códigos TOTP viajan en texto plano. Cualquiera
en la misma red (Wi-Fi pública, proxy) puede leerlos o modificarlos. HTTPS (TLS) cifra el tráfico y
autentica el servidor mediante un certificado.

**Cómo se implementa normalmente:**

- Poner la API y el frontend detrás de un **proxy inverso** (Nginx, Caddy o el balanceador del proveedor
  de nube) que termina TLS. Node sigue escuchando en HTTP solo dentro de la red privada.
- Obtener certificados gratuitos con **Let's Encrypt** (Caddy y muchos proveedores lo hacen automáticamente)
  y renovarlos de forma automática.
- Redirigir todo HTTP a HTTPS y enviar la cabecera **HSTS** (`Strict-Transport-Security`) para que el
  navegador no vuelva a usar HTTP.

**Cambios en el código:**

```js
// Express detrás de un proxy: confiar en la cabecera X-Forwarded-Proto
app.set('trust proxy', 1)

app.use(session({
  // ...
  proxy: true,
  cookie: {
    httpOnly: true,
    secure: true,        // la cookie solo viaja por HTTPS
    sameSite: 'lax',
    maxAge: 3600000
  }
}))
```

- `NODE_ENV=production` ya activa `secure: true` en este proyecto.
- `FRONTEND_URL` debe ser el dominio real con `https://`, y la URL base del frontend también.
- Se recomienda agregar cabeceras de seguridad con **helmet** (CSP, HSTS, `X-Content-Type-Options`, etc.).
- Con `trust proxy` configurado, `express-rate-limit` usa la IP real del cliente y no la del proxy.

## 2. Almacenamiento persistente de sesiones

**Problema del MemoryStore:** la documentación de express-session advierte que no está pensado para
producción: pierde memoria con el tiempo, borra todas las sesiones al reiniciar o desplegar y no funciona
con más de una instancia de la API (cada proceso tendría sesiones distintas).

**Alternativas:**

| Almacén | Paquete | Ventajas | Consideraciones |
|---------|---------|----------|-----------------|
| MySQL (ya se usa) | `express-mysql-session` | No agrega infraestructura; las sesiones sobreviven a reinicios | Más lento que Redis; limpiar sesiones vencidas |
| Redis | `connect-redis` + `redis` | Muy rápido, expiración automática (TTL), ideal con varias instancias | Un servicio más que mantener y proteger con contraseña/TLS |

Ejemplo con MySQL reutilizando la misma base:

```js
const MySQLStore = require('express-mysql-session')(session)
const store = new MySQLStore({ clearExpired: true, checkExpirationInterval: 900000 }, pool)

app.use(session({ name: 'iw.sid', secret: process.env.SESSION_SECRET, store, /* ... */ }))
```

**Ventajas adicionales de un almacén persistente:**

- Permite **revocar sesiones**: por ejemplo, cerrar todas las sesiones de un usuario cuando restablece su
  contraseña (hoy, con MemoryStore, una sesión abierta antes del cambio sigue activa hasta vencer).
- Permite expiración absoluta además de la por inactividad, y auditar sesiones activas.

## 3. Otros cambios necesarios antes de producción

- **Correo real** para verificación y recuperación (SMTP o un servicio transaccional), sin imprimir
  enlaces en consola ni en logs.
- **Gestión de secretos:** `SESSION_SECRET`, contraseña de MySQL y claves en el gestor de secretos del
  proveedor, no en archivos; rotarlos si se filtran.
- **Cifrar el secreto TOTP** en la base de datos y ofrecer códigos de respaldo.
- **Usuario de MySQL con permisos mínimos** (solo `SELECT`, `INSERT`, `UPDATE`, `DELETE` sobre
  `iw_seguridad`), nunca `root`.
- **Logs y monitoreo** de intentos fallidos y respuestas 429, sin registrar contraseñas ni tokens.
- **Revisión de dependencias** (`npm audit`) y respaldos de la base de datos.

## Fuentes consultadas

- Documentación de express-session (advertencia sobre MemoryStore y opciones `cookie.secure` y `proxy`).
- Guía "Production Best Practices: Security" de Express.
- OWASP Session Management Cheat Sheet y OWASP Transport Layer Security Cheat Sheet.
- Documentación de Let's Encrypt.

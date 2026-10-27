# Desafío C – Matriz de riesgos

Proyecto: Gestión segura de servicios (Actividad 15, IW600).

**Escala:** Probabilidad (P) e Impacto (I) de 1 (bajo) a 3 (alto). Riesgo = P × I:
1–2 bajo, 3–4 medio, 6–9 alto. El riesgo residual es el que queda después del control.

| # | Amenaza | Activo | Control implementado | Evidencia | Riesgo inicial | Riesgo residual |
|---|---------|--------|----------------------|-----------|----------------|-----------------|
| R1 | Robo del identificador de sesión con JavaScript (XSS) | Sesión del usuario | Cookie `iw.sid` con `HttpOnly`; nada se guarda en `localStorage` | P7, P8: `document.cookie` y `localStorage` vacíos | Alto (3×3=9) | Medio (2×2=4): un XSS aún podría hacer peticiones desde la página |
| R2 | Acceso a datos sin iniciar sesión | Listado de servicios | Middleware `auth` en cada endpoint privado | P1: `GET /api/servicios` → 401 | Alto (3×2=6) | Bajo (1×2=2) |
| R3 | Escalada de privilegios (usuario normal usa funciones de admin) | Datos de servicios | Middleware `admin` que lee el rol desde la sesión del servidor; sin endpoint para asignar roles | P5, A1: `POST`, `PUT`, `DELETE` → 403 | Alto (3×3=9) | Bajo (1×3=3) mientras cada endpoint nuevo use `admin` |
| R4 | Fuerza bruta o relleno de credenciales | Cuentas de usuario | Rate limit de 5 intentos fallidos cada 15 min; bcrypt costo 12 | P3: sexto intento → 429 | Alto (3×3=9) | Medio (2×2=4): un ataque distribuido desde muchas IP no se detiene |
| R5 | Contraseña filtrada o adivinada | Cuentas de usuario | Segundo factor TOTP opcional | P4: sin código → 401 | Alto (2×3=6) | Medio (2×2=4) si el usuario no activa 2FA; phishing en tiempo real sigue posible |
| R6 | Filtración de la base de datos | Contraseñas y tokens | Contraseñas con bcrypt; tokens de verificación y recuperación como hash SHA-256 | P10, B2 | Alto (2×3=6) | Medio (2×2=4): el secreto TOTP queda en texto plano |
| R7 | Solicitudes falsificadas desde otro sitio (CSRF) | Acciones con sesión | `SameSite=Lax` + cabecera `x-csrf-token` por sesión; CORS limitado a `FRONTEND_URL` | P6: sin token → 403 | Medio (2×2=4) | Bajo (1×2=2) |
| R8 | Inyección SQL | Base de datos completa | Consultas parametrizadas (`pool.execute` con `?`); validación de tipos | P9: el nombre con SQL se guarda como texto | Alto (2×3=6) | Bajo (1×3=3) |
| R9 | Registro con correos ajenos o falsos | Identidad de usuarios | Verificación por enlace de un solo uso (30 min) antes del login | P2: login sin verificar → 403 | Medio (2×2=4) | Bajo (1×2=2); en laboratorio el enlace sale por consola |
| R10 | Toma de cuenta por recuperación de contraseña | Cuentas de usuario | Token aleatorio de un solo uso, hash en BD, 15 min, rate limit, respuesta que no revela si el correo existe | B1–B7 | Alto (2×3=6) | Medio (2×2=4): depende de la seguridad del correo del usuario |
| R11 | Fijación de sesión | Sesión del usuario | `req.session.regenerate()` al iniciar sesión | Revisión de código del login | Medio (2×2=4) | Bajo (1×2=2) |
| R12 | Intercepción del tráfico (sin cifrado) | Cookie y credenciales en tránsito | Ninguno en laboratorio (HTTP local); `Secure` se activa con `NODE_ENV=production` | P7: cookie sin `Secure` | Alto (2×3=6) | **Alto (2×3=6) en laboratorio**; requiere HTTPS (ver Desafío D) |
| R13 | Pérdida de sesiones o fuga de memoria | Disponibilidad | Ninguno: `MemoryStore` de desarrollo | Al reiniciar la API todas las sesiones se pierden | Medio (2×2=4) | Medio (2×2=4); requiere almacén persistente (ver Desafío D) |
| R14 | Publicación de secretos en GitHub | Base de datos y firma de sesiones | `.env` en `.gitignore`; solo se versiona `.env.example` | `git status` no muestra `.env` | Alto (2×3=6) | Bajo (1×3=3); si se filtra, rotar contraseña y `SESSION_SECRET` |

## Riesgos residuales prioritarios

1. **R12 – Sin HTTPS:** es el riesgo más alto que queda. En producción es obligatorio HTTPS y cookie `Secure`.
2. **R13 – MemoryStore:** no escala, pierde sesiones al reiniciar y no permite cerrar todas las sesiones de un usuario.
3. **R6 – Secreto TOTP en texto plano:** debería cifrarse con una clave guardada fuera de la base de datos.
4. **R4 y R5 – Ataques distribuidos y phishing:** se reducen con límites por cuenta además de por IP y con
   llaves de acceso (passkeys/WebAuthn), resistentes a phishing.

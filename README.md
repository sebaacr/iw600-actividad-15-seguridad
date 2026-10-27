# Gestión segura de servicios – Actividad 15 (IW600)

**Estudiante:** Sebastian Concha
**Asignatura:** Ingeniería Web IW600 – Seguridad de la información

## Propósito

Aplicación de gestión de servicios tecnológicos protegida frente a riesgos frecuentes:
robo de tokens desde `localStorage`, autorización solo en el navegador, intentos repetidos de
login, ausencia de verificación de correo y falta de segundo factor. La seguridad se comprueba con
pruebas directas sobre el backend (`npm run pruebas`), no solo observando la interfaz.

## Tecnologías

| Capa | Tecnologías |
|------|-------------|
| Frontend | Vue 3, Vite, Fetch (`credentials: 'include'`) |
| Backend | Node.js, Express, express-session, express-rate-limit, bcryptjs, speakeasy (TOTP), qrcode, dotenv |
| Base de datos | MySQL 8 (mysql2 con consultas parametrizadas) |

## Requisitos

- Node.js 22 o superior y npm
- MySQL Server 8 en funcionamiento (y MySQL Workbench o la consola `mysql`)
- Una app autenticadora TOTP (Google Authenticator, Microsoft Authenticator, Aegis, etc.)

## Instalación

```bash
git clone URL_DEL_REPOSITORIO
cd iw600-actividad-15-seguridad
cd backend && npm install
cd ../frontend && npm install
```

## Base de datos

Ejecutar el script completo en MySQL Workbench o en la consola:

```bash
mysql -u root -p < database/01_esquema.sql
mysql -u root -p < database/02_recuperacion.sql
```

`01_esquema.sql` crea la base `iw_seguridad` con las tablas `usuarios` y `servicios` y dos servicios
de ejemplo. `02_recuperacion.sql` agrega las columnas del token de recuperación (Desafío B).

## Variables de entorno

Copiar `backend/.env.example` como `backend/.env` y completar los valores propios.
**`.env` está en `.gitignore` y nunca se sube a GitHub.**

| Variable | Uso |
|----------|-----|
| `PORT` | Puerto de la API (3000) |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Conexión a MySQL |
| `SESSION_SECRET` | Secreto para firmar la cookie de sesión (valor aleatorio largo) |
| `FRONTEND_URL` | Origen permitido por CORS (`http://localhost:5173`) |
| `NODE_ENV` | `development` en laboratorio; en `production` la cookie se marca `Secure` |

Para generar un `SESSION_SECRET` aleatorio:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Ejecución (dos terminales)

**Terminal 1 – Backend:**

```bash
cd backend
npm run dev
```

Debe mostrar `API http://localhost:3000`.

**Terminal 2 – Frontend:**

```bash
cd frontend
npm run dev
```

Abrir http://localhost:5173

## Rutas REST

| Método | Ruta | Protección | Descripción |
|--------|------|------------|-------------|
| GET | `/api/auth/me` | — | Usuario de la sesión actual o `null` |
| GET | `/api/auth/csrf` | Sesión | Token CSRF de la sesión |
| POST | `/api/auth/registro` | Validación | Crea la cuenta (bcrypt) e imprime el enlace de verificación |
| POST | `/api/auth/verificar` | Token de un solo uso | Marca el correo como verificado |
| POST | `/api/auth/login` | Rate limit (5 fallos / 15 min) | Inicia sesión; pide código TOTP si está activo |
| POST | `/api/auth/recuperar` | Rate limit (5 / 15 min) | Genera el enlace de recuperación (Desafío B) |
| POST | `/api/auth/restablecer` | Token de un solo uso (15 min) | Cambia la contraseña (Desafío B) |
| POST | `/api/auth/logout` | Sesión + CSRF | Destruye la sesión |
| POST | `/api/auth/2fa/preparar` | Sesión + CSRF | Genera el QR del segundo factor |
| POST | `/api/auth/2fa/activar` | Sesión + CSRF | Activa TOTP si el código es válido |
| GET | `/api/servicios` | Sesión | Lista los servicios |
| POST | `/api/servicios` | Sesión + CSRF + admin | Crea un servicio |
| PUT | `/api/servicios/:id` | Sesión + CSRF + admin | Edita un servicio (Desafío A) |
| DELETE | `/api/servicios/:id` | Sesión + CSRF + admin | Elimina un servicio |

Respuestas de seguridad: **401** sin sesión o credenciales inválidas, **403** sin permiso, correo no
verificado o CSRF inválido, **429** demasiados intentos de login.

## Registro y verificación de correo

1. Escribir nombre, correo y una contraseña de **12 caracteres o más** y pulsar **Registrarme**.
2. En la terminal del backend aparece `ENLACE SOLO LABORATORIO: http://localhost:5173/verificar?token=...`
   (en el laboratorio no se envía un email real).
3. Abrir ese enlace en el navegador: aparece **Correo verificado**.
4. Iniciar sesión con correo y contraseña.

En la base de datos solo se guarda el **hash SHA-256 del token**, con vencimiento de 30 minutos.

### Cuenta administradora (solo laboratorio)

No existe un endpoint para asignar el rol admin (sería una vulnerabilidad crítica). El rol se asigna
por SQL sobre una cuenta creada para el laboratorio:

```sql
UPDATE usuarios SET rol='admin' WHERE email='admin.lab@ejemplo.test';
```

## Activación del segundo factor (TOTP)

1. Con la sesión iniciada, pulsar **Generar QR**.
2. Escanear el QR con la app autenticadora.
3. Escribir el código de 6 dígitos y pulsar **Activar 2FA**.
4. Cerrar sesión. Desde ahora el login exige correo, contraseña **y** el código de la app.

## Pruebas de seguridad

Las pruebas se ejecutan contra el backend con un script que levanta su propia instancia de la API
(puerto 3100), crea cuentas de prueba `@ejemplo.test` y revisa los códigos HTTP y la base de datos:

```bash
cd backend
npm run pruebas
```

| Prueba | Procedimiento | Esperado | Obtenido |
|--------|---------------|----------|----------|
| P1 | `GET /api/servicios` sin sesión | 401 sin datos | 401 ✔ |
| P2 | Registrar y hacer login sin abrir el enlace | 403 | 403 ✔ |
| P3 | 6 contraseñas incorrectas seguidas | 401 ×5 y luego 429 | 401, 401, 401, 401, 401, 429 ✔ |
| P4 | TOTP activo: login sin código y luego con código válido | 401 y luego 200 | 401 → 200 ✔ |
| P5 | Usuario normal: `POST` y `DELETE /api/servicios` | 403 | 403 ✔ |
| P6 | Sesión de admin válida, `POST` sin `x-csrf-token` | 403 | 403 ✔ (con token: 201) |
| P7 | Atributos de la cookie de sesión | `iw.sid` HttpOnly; Secure solo con HTTPS | `HttpOnly; SameSite=Lax` ✔ |
| P8 | `localStorage`, `sessionStorage` y `document.cookie` en el navegador | Sin token de sesión | Vacíos ✔ |
| P9 | Registrar nombre `O'Brien'); DROP TABLE usuarios; --` | No altera la consulta | Se guarda como texto literal ✔ |
| P10 | Revisar `password_hash` en MySQL | Solo hash | `$2b$12$…` (bcrypt, costo 12) ✔ |

Pruebas adicionales del script: login correcto (200), validación de servicio inválido (400),
eliminación por admin (200), activación de 2FA con código incorrecto (400) y registro con
contraseña corta (400).

### Desafío A – Edición de servicios

| Prueba | Procedimiento | Esperado | Obtenido |
|--------|---------------|----------|----------|
| A1 | Usuario normal: `PUT /api/servicios/:id` | 403 | 403 ✔ |
| A2 | Admin: `PUT` con datos válidos | 200 | 200 ✔ |
| A3 | Admin: `PUT` con datos inválidos | 400 | 400 ✔ |
| A4 | Admin: `PUT` de un id inexistente | 404 | 404 ✔ |

### Desafío B – Recuperación de contraseña

| Prueba | Procedimiento | Esperado | Obtenido |
|--------|---------------|----------|----------|
| B1 | Solicitar recuperación con un correo inexistente y con uno registrado | Misma respuesta 200 | Igual ✔ |
| B2 | Revisar `token_recuperacion_hash` en MySQL | Hash, no el token | SHA-256 ✔ |
| B3 | Restablecer con contraseña de 5 caracteres | 400 | 400 ✔ |
| B4 | Restablecer con el token válido | 200 | 200 ✔ |
| B5 | Reutilizar el mismo token | 400 | 400 ✔ |
| B6 | Login con la clave anterior y con la nueva | 401 y 200 | 401 y 200 ✔ |
| B7 | Usar un token vencido (más de 15 minutos) | 400 | 400 ✔ |

Resultado total del script: **30/30 correctas**.

> En P4 un script no puede escanear el QR, así que registra un secreto TOTP conocido en la base de
> datos para generar el código como lo haría la app autenticadora. El flujo con QR se prueba
> manualmente desde la interfaz.

## Trabajo autónomo

### Desafío A – Editar servicios

`PUT /api/servicios/:id` usa los mismos middlewares que crear y eliminar (`auth`, `admin` y CSRF) y
la misma función `servicioValido()` que `POST`, de modo que la validación no se duplica. El id se
valida con `/^d+$/` y la consulta es parametrizada. En Vue, el botón **Editar** (visible solo para
admin, pero protegido en el servidor) carga el servicio en el mismo formulario, que cambia a
**Actualizar** y permite **Cancelar**.

### Desafío B – Recuperación de contraseña

1. En la pantalla de ingreso se escribe el correo y se pulsa **Olvidé mi contraseña**.
2. `POST /api/auth/recuperar` genera 32 bytes aleatorios (`crypto.randomBytes`), guarda solo su
   hash SHA-256 con vencimiento de **15 minutos** e imprime el enlace
   `http://localhost:5173/restablecer?token=...` en la consola del backend.
3. Al abrir el enlace, Vue guarda el token en memoria, lo quita de la URL y muestra el formulario
   **Restablecer contraseña**.
4. `POST /api/auth/restablecer` exige 12+ caracteres, guarda el nuevo hash bcrypt y **borra el token**
   en la misma consulta, por lo que es de un solo uso.

Decisiones de seguridad: la respuesta es la misma exista o no el correo (no revela qué cuentas
existen), la ruta tiene su propio rate limit y en la base nunca queda el token original.

### Ajuste al rate limit del login

Al probar el Desafío B, la API respondió **429** a un usuario con la contraseña correcta: el límite de
la guía contaba *todos* los intentos, incluidos los exitosos, así que 5 ingresos correctos en 15
minutos bloqueaban a una persona legítima. Se agregó `skipSuccessfulRequests: true`: ahora solo
cuentan los intentos fallidos, que es lo que describe la prueba P3, y P3 sigue respondiendo 429 al
sexto intento incorrecto.

## Interpretación de los controles

| Control | Qué protege | Qué NO garantiza |
|---------|-------------|------------------|
| HttpOnly | Dificulta leer la cookie con JavaScript | No elimina XSS ni CSRF |
| SameSite + token CSRF | Reduce solicitudes no autorizadas entre sitios | No sustituye validación de origen y HTTPS |
| Rate limit | Dificulta intentos automatizados | No evita ataques distribuidos por sí solo |
| bcrypt | Protege contraseñas almacenadas | No reemplaza contraseñas fuertes |
| TOTP | Añade un factor de posesión | Puede ser vulnerable a phishing en tiempo real |
| Roles en backend | Restringe operaciones sensibles | Requiere revisión de cada endpoint |

## Error encontrado y solución

Al recargar la página `/verificar?token=...` con la sesión ya iniciada aparecía **"CSRF inválido"**.
El código de la guía verificaba el token en `onMounted` *antes* de recuperar la sesión, por lo que
enviaba un `POST` sin la cabecera `x-csrf-token` y el backend lo rechazaba (justamente el control
de la prueba P6). Se corrigió recuperando primero la sesión y el token CSRF, y luego verificando;
además se elimina el token de la URL con `history.replaceState` para que no quede en el historial
ni se reenvíe al recargar.

## Preguntas de retroalimentación

- **¿Por qué una contraseña nunca debe guardarse directamente en MySQL?** Si la base se filtra,
  todas las contraseñas quedarían expuestas (y muchas personas las reutilizan). Con bcrypt solo se
  guarda un hash lento y con sal, que no se puede revertir.
- **¿Por qué el navegador no debe decidir quién es administrador?** Todo lo que corre en el
  navegador puede modificarse (DevTools, peticiones directas con curl). Ocultar un botón no impide
  llamar al endpoint; por eso `admin()` revisa el rol guardado en la sesión del servidor (P5).
- **¿Qué ocurre si alguien conoce la contraseña pero no tiene el segundo factor?** El login responde
  401 "Código de segundo factor inválido" y no se crea sesión (P4).
- **Autenticación vs. autorización en este proyecto:**
  1. `POST /api/auth/login` *autentica*: comprueba quién es la persona (contraseña + TOTP).
     `POST /api/servicios` *autoriza*: aunque la persona esté autenticada, solo un admin puede crear.
  2. Sin sesión, `GET /api/servicios` responde **401** (no se sabe quién es); con sesión de usuario
     normal, `DELETE /api/servicios/1` responde **403** (se sabe quién es, pero no tiene permiso).

## Limitaciones del laboratorio

- La verificación de correo se simula con un enlace impreso en la consola; no se envían emails.
- `express-session` usa **MemoryStore**: las sesiones se pierden al reiniciar el servidor y no es apto
  para producción.
- Se trabaja en HTTP local: la cookie no lleva `Secure` (se activa con `NODE_ENV=production`).
- El secreto TOTP se guarda en texto plano en la base de datos.
- El rate limit se guarda en memoria y se aplica por IP.

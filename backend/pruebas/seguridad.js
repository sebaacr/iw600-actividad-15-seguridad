// Pruebas de seguridad P1–P10 contra el backend (no contra la interfaz).
// Requiere MySQL con el esquema cargado y backend/.env configurado.
// Uso: npm run pruebas   (levanta su propia instancia de la API en el puerto 3100)
require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env'), quiet: true })
const { spawn } = require('node:child_process')
const path = require('node:path')
const mysql = require('mysql2/promise')
const speakeasy = require('speakeasy')

const PUERTO = 3100
const API = `http://localhost:${PUERTO}/api`
const resultados = []

function registrar(id, descripcion, esperado, obtenido, ok) {
  resultados.push({ id, descripcion, esperado, obtenido, ok })
  console.log(`${ok ? 'OK  ' : 'FALLA'} ${id} ${descripcion} -> esperado ${esperado}, obtenido ${obtenido}`)
}

// Inicia una instancia nueva de la API y guarda lo que imprime (enlaces de laboratorio)
function iniciarApi() {
  return new Promise((resolve, reject) => {
    const proceso = spawn(process.execPath, ['server.js'], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, PORT: String(PUERTO) }
    })
    proceso.salida = ''
    proceso.stdout.on('data', d => {
      proceso.salida += d
      if (String(d).includes('API http')) resolve(proceso)
    })
    proceso.stderr.on('data', d => { proceso.salida += d })
    proceso.on('exit', c => reject(new Error('La API terminó con código ' + c + '\n' + proceso.salida)))
  })
}

function detenerApi(proceso) {
  return new Promise(resolve => { proceso.removeAllListeners('exit'); proceso.on('exit', resolve); proceso.kill() })
}

// Cliente HTTP mínimo que conserva la cookie de sesión como lo haría el navegador
function cliente() {
  let cookie = ''
  let csrf = ''
  return {
    get cookieCruda() { return cookie },
    usarCsrf(valor) { csrf = valor },
    async pedir(ruta, metodo = 'GET', datos, { conCsrf = true } = {}) {
      const headers = { 'Content-Type': 'application/json' }
      if (cookie) headers.Cookie = cookie.split(';')[0]
      if (conCsrf && csrf) headers['x-csrf-token'] = csrf
      const res = await fetch(API + ruta, {
        method: metodo, headers, ...(datos ? { body: JSON.stringify(datos) } : {})
      })
      const nueva = res.headers.get('set-cookie')
      if (nueva) cookie = nueva
      return { status: res.status, cuerpo: await res.json().catch(() => ({})), setCookie: nueva }
    }
  }
}

function ultimoEnlace(proceso, tipo) {
  const enlaces = [...proceso.salida.matchAll(new RegExp(`/${tipo}\\?token=([a-f0-9]{64})`, 'g'))]
  return enlaces.at(-1)?.[1]
}

async function main() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME
  })
  const sufijo = Date.now()
  const password = 'ClaveDeLaboratorio-2026'
  const correoUsuario = `usuario.${sufijo}@ejemplo.test`
  const correoAdmin = `admin.lab.${sufijo}@ejemplo.test`

  let api = await iniciarApi()
  try {
    // P1: acceso anónimo
    const anonimo = cliente()
    let r = await anonimo.pedir('/servicios')
    registrar('P1', 'GET /api/servicios sin sesión', 401, r.status, r.status === 401 && !Array.isArray(r.cuerpo))

    // P2: login sin verificar el correo
    const usuario = cliente()
    r = await usuario.pedir('/auth/registro', 'POST', { nombre: 'Usuario Lab', email: correoUsuario, password })
    if (r.status !== 201) throw new Error('No se pudo registrar el usuario de prueba: ' + JSON.stringify(r.cuerpo))
    r = await usuario.pedir('/auth/login', 'POST', { email: correoUsuario, password })
    registrar('P2', 'Login sin verificar correo', 403, r.status, r.status === 403)

    // Verificación con el enlace impreso en la consola
    r = await usuario.pedir('/auth/verificar', 'POST', { token: ultimoEnlace(api, 'verificar') })
    registrar('P2b', 'Verificar con el enlace de la consola', 200, r.status, r.status === 200)

    // Login correcto y cookie de sesión (P7)
    r = await usuario.pedir('/auth/login', 'POST', { email: correoUsuario, password })
    usuario.usarCsrf(r.cuerpo.csrf)
    const cookie = r.setCookie || ''
    const cookieOk = /iw\.sid=/.test(cookie) && /HttpOnly/i.test(cookie) && /SameSite=Lax/i.test(cookie) && !/Secure/i.test(cookie)
    registrar('P7', 'Cookie iw.sid HttpOnly, SameSite=Lax (sin Secure en HTTP local)', 'HttpOnly', cookie.split(';').slice(1).map(s => s.trim()).join('; '), cookieOk)
    registrar('P8', 'La respuesta de login no entrega un token de sesión', 'sin token', Object.keys(r.cuerpo).join(','), !('token' in r.cuerpo) && !('sid' in r.cuerpo))

    r = await usuario.pedir('/servicios')
    registrar('P1b', 'GET /api/servicios con sesión', 200, r.status, r.status === 200 && Array.isArray(r.cuerpo))

    // P5: usuario normal intenta crear un servicio
    r = await usuario.pedir('/servicios', 'POST', { nombre: 'Intento', descripcion: 'Sin permisos', precio: 1 })
    registrar('P5', 'Usuario normal: POST /api/servicios', 403, r.status, r.status === 403)
    r = await usuario.pedir('/servicios/1', 'DELETE')
    registrar('P5b', 'Usuario normal: DELETE /api/servicios/1', 403, r.status, r.status === 403)

    // Cuenta administradora de laboratorio (rol asignado por SQL, como indica la guía)
    const admin = cliente()
    await admin.pedir('/auth/registro', 'POST', { nombre: 'Admin Lab', email: correoAdmin, password })
    await admin.pedir('/auth/verificar', 'POST', { token: ultimoEnlace(api, 'verificar') })
    await pool.execute("UPDATE usuarios SET rol = 'admin' WHERE email = ?", [correoAdmin])
    r = await admin.pedir('/auth/login', 'POST', { email: correoAdmin, password })
    admin.usarCsrf(r.cuerpo.csrf)

    // P6: petición con sesión válida pero sin x-csrf-token
    r = await admin.pedir('/servicios', 'POST', { nombre: 'Sin CSRF', descripcion: 'No debe crearse', precio: 1 }, { conCsrf: false })
    registrar('P6', 'Admin: POST sin x-csrf-token', 403, r.status, r.status === 403)
    r = await admin.pedir('/servicios', 'POST', { nombre: 'Servicio de prueba', descripcion: 'Creado por las pruebas', precio: 1000 })
    registrar('P6b', 'Admin: POST con x-csrf-token', 201, r.status, r.status === 201)
    const idCreado = r.cuerpo.id
    r = await admin.pedir('/servicios', 'POST', { nombre: 'X', descripcion: 'corta', precio: -5 })
    registrar('VAL', 'Admin: POST con datos inválidos', 400, r.status, r.status === 400)
    // Desafío A: edición con PUT
    r = await usuario.pedir(`/servicios/${idCreado}`, 'PUT', { nombre: 'Editado', descripcion: 'Sin permisos', precio: 1 })
    registrar('A1', 'Usuario normal: PUT /api/servicios/:id', 403, r.status, r.status === 403)
    r = await admin.pedir(`/servicios/${idCreado}`, 'PUT', { nombre: 'Servicio editado', descripcion: 'Editado por las pruebas', precio: 2000 })
    registrar('A2', 'Admin: PUT con datos válidos', 200, r.status, r.status === 200)
    r = await admin.pedir(`/servicios/${idCreado}`, 'PUT', { nombre: 'X', descripcion: '', precio: 'abc' })
    registrar('A3', 'Admin: PUT con datos inválidos', 400, r.status, r.status === 400)
    r = await admin.pedir('/servicios/999999', 'PUT', { nombre: 'No existe', descripcion: 'Servicio inexistente', precio: 1 })
    registrar('A4', 'Admin: PUT de un id inexistente', 404, r.status, r.status === 404)
    r = await admin.pedir(`/servicios/${idCreado}`, 'DELETE')
    registrar('DEL', 'Admin: DELETE del servicio creado', 200, r.status, r.status === 200)

    // P4: segundo factor
    r = await usuario.pedir('/auth/2fa/preparar', 'POST')
    const qrOk = r.status === 200 && String(r.cuerpo.qr).startsWith('data:image/png')
    r = await usuario.pedir('/auth/2fa/activar', 'POST', { codigo: '000000' })
    registrar('P4a', 'Activar 2FA con código incorrecto', 400, r.status, qrOk && r.status === 400)
    // Un script no puede escanear el QR: se registra un secreto conocido en la BD
    // para simular la app autenticadora y probar el login con segundo factor
    const secreto = speakeasy.generateSecret().base32
    await pool.execute('UPDATE usuarios SET totp_secreto = ?, totp_habilitado = 1 WHERE email = ?', [secreto, correoUsuario])
    await usuario.pedir('/auth/logout', 'POST')
    const conTotp = cliente()
    r = await conTotp.pedir('/auth/login', 'POST', { email: correoUsuario, password })
    registrar('P4', 'Login con TOTP activo y sin código', 401, r.status, r.status === 401)
    const codigo = speakeasy.totp({ secret: secreto, encoding: 'base32' })
    r = await conTotp.pedir('/auth/login', 'POST', { email: correoUsuario, password, codigo })
    registrar('P4b', 'Login con TOTP activo y código válido', 200, r.status, r.status === 200)

    // P9: inyección SQL en el nombre
    const nombreMalicioso = "O'Brien'); DROP TABLE usuarios; --"
    const correoSql = `sql.${sufijo}@ejemplo.test`
    r = await cliente().pedir('/auth/registro', 'POST', { nombre: nombreMalicioso, email: correoSql, password })
    const [filasSql] = await pool.execute('SELECT nombre FROM usuarios WHERE email = ?', [correoSql])
    registrar('P9', 'Registro con comillas y SQL en el nombre', 'texto literal', filasSql[0]?.nombre, r.status === 201 && filasSql[0]?.nombre === nombreMalicioso)

    // P10: la contraseña solo se guarda como hash bcrypt
    const [filasHash] = await pool.execute('SELECT password_hash FROM usuarios WHERE email = ?', [correoUsuario])
    const hash = filasHash[0].password_hash
    registrar('P10', 'Contraseña almacenada', 'hash bcrypt', hash.slice(0, 7) + '…', hash !== password && /^\$2[aby]\$12\$/.test(hash))

    // Registro con contraseña corta
    r = await cliente().pedir('/auth/registro', 'POST', { nombre: 'Corta', email: `corta.${sufijo}@ejemplo.test`, password: 'abc' })
    registrar('VAL2', 'Registro con contraseña de 3 caracteres', 400, r.status, r.status === 400)

    // P3: límite de intentos en una instancia nueva de la API
    await detenerApi(api)
    api = await iniciarApi()
    const atacante = cliente()
    const estados = []
    for (let i = 0; i < 6; i++)
      estados.push((await atacante.pedir('/auth/login', 'POST', { email: correoUsuario, password: 'incorrecta-' + i })).status)
    registrar('P3', '6 contraseñas incorrectas seguidas', '401 x5 y luego 429', estados.join(','), estados.slice(0, 5).every(s => s === 401) && estados[5] === 429)
  } finally {
    await detenerApi(api)
    await pool.end()
  }

  const fallas = resultados.filter(r => !r.ok).length
  console.log(`\n${resultados.length - fallas}/${resultados.length} pruebas correctas`)
  process.exitCode = fallas ? 1 : 0
}

main().catch(e => { console.error(e); process.exitCode = 1 })

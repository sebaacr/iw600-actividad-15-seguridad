require('dotenv').config({ quiet: true })
const express = require('express')
const cors = require('cors')
const session = require('express-session')
const { rateLimit } = require('express-rate-limit')
const bcrypt = require('bcryptjs')
const mysql = require('mysql2/promise')
const crypto = require('node:crypto')

const app = express()
const pool = mysql.createPool({
  host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true, connectionLimit: 5
})

const origin = process.env.FRONTEND_URL
app.use(cors({ origin, credentials: true }))
app.use(express.json({ limit: '20kb' }))
// Sesión en cookie HttpOnly: el navegador la envía, pero JavaScript no puede leerla
app.use(session({
  name: 'iw.sid', secret: process.env.SESSION_SECRET,
  resave: false, saveUninitialized: false,
  cookie: {
    httpOnly: true, sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production', maxAge: 3600000
  }
}))

const loginLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5, standardHeaders: 'draft-8', legacyHeaders: false,
  message: { error: 'Demasiados intentos. Intente más tarde.' }
})

function auth(req, res, next) {
  if (!req.session.usuario) return res.status(401).json({ error: 'Inicie sesión' })
  next()
}

function csrf(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next()
  if (!req.session.usuario) return next() // auth comprueba sesión en rutas privadas
  if (!req.session.csrf || req.get('x-csrf-token') !== req.session.csrf)
    return res.status(403).json({ error: 'CSRF inválido' })
  next()
}

const sha256 = (texto) => crypto.createHash('sha256').update(texto).digest('hex')

app.use('/api', csrf)

app.get('/api/auth/csrf', auth, (req, res) => res.json({ token: req.session.csrf }))

app.get('/api/auth/me', (req, res) => res.json({ usuario: req.session.usuario || null }))

app.post('/api/auth/registro', async (req, res) => {
  try {
    const { nombre, email, password } = req.body
    if (typeof nombre !== 'string' || nombre.trim().length < 2 ||
        typeof email !== 'string' || !/^\S+@\S+\.\S+$/.test(email) ||
        typeof password !== 'string' || password.length < 12)
      return res.status(400).json({ error: 'Datos inválidos; contraseña mínima 12 caracteres' })
    const hash = await bcrypt.hash(password, 12)
    // Se guarda solo el hash del token; el token original viaja en el enlace
    const token = crypto.randomBytes(32).toString('hex')
    await pool.execute(`INSERT INTO usuarios
      (nombre, email, password_hash, token_verificacion_hash, token_verificacion_expira)
      VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 30 MINUTE))`,
      [nombre.trim(), email.toLowerCase().trim(), hash, sha256(token)])
    console.log('ENLACE SOLO LABORATORIO:',
      'http://localhost:5173/verificar?token=' + token)
    res.status(201).json({ mensaje: 'Cuenta creada. Revise la consola del backend.' })
  } catch (e) {
    res.status(e.code === 'ER_DUP_ENTRY' ? 409 : 500).json({ error: 'No se pudo registrar' })
  }
})

app.post('/api/auth/verificar', async (req, res) => {
  const token = String(req.body.token || '')
  if (!/^[a-f0-9]{64}$/.test(token)) return res.status(400).json({ error: 'Token inválido' })
  const [r] = await pool.execute(`UPDATE usuarios SET email_verificado = 1,
    token_verificacion_hash = NULL, token_verificacion_expira = NULL
    WHERE token_verificacion_hash = ? AND token_verificacion_expira > NOW()`, [sha256(token)])
  res.status(r.affectedRows ? 200 : 400)
    .json({ mensaje: r.affectedRows ? 'Correo verificado' : 'Enlace inválido o vencido' })
})

app.post('/api/auth/login', loginLimit, async (req, res) => {
  const email = String(req.body.email || '').toLowerCase().trim()
  const password = String(req.body.password || '')
  const [rows] = await pool.execute('SELECT * FROM usuarios WHERE email = ?', [email])
  const u = rows[0]
  const ok = u && await bcrypt.compare(password, u.password_hash)
  if (!ok) return res.status(401).json({ error: 'Credenciales inválidas' })
  if (!u.email_verificado) return res.status(403).json({ error: 'Verifique su correo' })
  // Nueva sesión tras el login para evitar fijación de sesión
  req.session.regenerate(err => {
    if (err) return res.status(500).json({ error: 'Error de sesión' })
    req.session.usuario = { id: u.id, nombre: u.nombre, rol: u.rol }
    req.session.csrf = crypto.randomBytes(24).toString('hex')
    res.json({ usuario: req.session.usuario, csrf: req.session.csrf })
  })
})

app.post('/api/auth/logout', auth, (req, res) => {
  req.session.destroy(() => res.clearCookie('iw.sid').json({ mensaje: 'Sesión cerrada' }))
})

app.get('/api/servicios', auth, async (req, res) => {
  const [rows] = await pool.execute('SELECT * FROM servicios ORDER BY id DESC')
  res.json(rows)
})

app.use((err, req, res, next) => {
  console.error(err.message)
  res.status(500).json({ error: 'Error interno' })
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`API http://localhost:${PORT}`))

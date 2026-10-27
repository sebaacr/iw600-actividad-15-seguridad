<script setup>
import { ref, onMounted } from 'vue'

const base = 'http://localhost:3000/api'
const usuario = ref(null), csrf = ref(''), mensaje = ref('')
const nombre = ref(''), email = ref(''), password = ref(''), codigo = ref('')
const qr = ref(''), servicios = ref([])
const servicio = ref({ nombre: '', descripcion: '', precio: 0 })

// credentials: 'include' envía la cookie de sesión sin que JavaScript pueda leerla
async function api(ruta, metodo = 'GET', datos = null) {
  const res = await fetch(base + ruta, {
    method: metodo, credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(csrf.value ? { 'x-csrf-token': csrf.value } : {}) },
    ...(datos ? { body: JSON.stringify(datos) } : {})
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw Error(json.error || json.mensaje || 'Error HTTP ' + res.status)
  return json
}

async function accion(fn) {
  try { mensaje.value = ''; await fn() } catch (e) { mensaje.value = e.message }
}

async function registro() {
  const r = await api('/auth/registro', 'POST', { nombre: nombre.value, email: email.value, password: password.value })
  mensaje.value = r.mensaje
}

async function verificar() {
  const token = new URLSearchParams(location.search).get('token')
  if (!token) { mensaje.value = 'Abra el enlace de la consola del backend'; return }
  const r = await api('/auth/verificar', 'POST', { token })
  mensaje.value = r.mensaje
}

async function login() {
  const r = await api('/auth/login', 'POST', {
    email: email.value, password: password.value, codigo: codigo.value })
  usuario.value = r.usuario; csrf.value = r.csrf
  password.value = ''; codigo.value = ''
  await listar()
}

async function listar() { servicios.value = await api('/servicios') }

async function preparar2fa() { qr.value = (await api('/auth/2fa/preparar', 'POST')).qr }

async function activar2fa() {
  const r = await api('/auth/2fa/activar', 'POST', { codigo: codigo.value })
  mensaje.value = r.mensaje; qr.value = ''; codigo.value = ''
}

async function crear() {
  await api('/servicios', 'POST', servicio.value)
  servicio.value = { nombre: '', descripcion: '', precio: 0 }
  mensaje.value = 'Servicio creado'
  await listar()
}

async function eliminar(id) {
  if (!confirm('¿Eliminar este servicio?')) return
  await api('/servicios/' + id, 'DELETE')
  mensaje.value = 'Servicio eliminado'
  await listar()
}

async function salir() {
  await api('/auth/logout', 'POST')
  usuario.value = null; csrf.value = ''; servicios.value = []; qr.value = ''
}

onMounted(async () => {
  // La sesión puede recuperarse después de recargar la página.
  // Se recupera primero para tener el token CSRF antes de cualquier POST.
  try {
    const r = await api('/auth/me'); usuario.value = r.usuario
    if (usuario.value) { csrf.value = (await api('/auth/csrf')).token; await listar() }
  } catch (e) { mensaje.value = 'No se pudo recuperar la sesión' }
  const token = new URLSearchParams(location.search).get('token')
  if (token) {
    await accion(verificar)
    // Se quita el token de la URL para que no quede en el historial ni se reenvíe al recargar
    history.replaceState(null, '', '/')
  }
})
</script>

<template>
  <main class="contenedor">
    <h1>Gestión segura de servicios · IW600</h1>
    <p>Registro, autenticación, segundo factor y permisos en servidor.</p>
    <p role="status" class="mensaje" v-if="mensaje">{{ mensaje }}</p>
    <section v-if="!usuario" class="panel">
      <h2>Registro / ingreso</h2>
      <input v-model="nombre" placeholder="Nombre (registro)" autocomplete="name" />
      <input v-model="email" type="email" placeholder="Correo" autocomplete="email" />
      <input v-model="password" type="password" placeholder="Contraseña (12+ caracteres)" autocomplete="current-password" />
      <input v-model="codigo" inputmode="numeric" placeholder="Código 2FA (si está activo)" autocomplete="one-time-code" />
      <button @click="accion(registro)">Registrarme</button>
      <button @click="accion(login)">Iniciar sesión</button>
      <button @click="accion(verificar)">Verificar enlace de la URL</button>
    </section>
    <section v-else class="panel">
      <h2>Bienvenido, {{ usuario.nombre }} ({{ usuario.rol }})</h2>
      <button @click="accion(salir)">Cerrar sesión</button>
      <h3>Configurar segundo factor</h3>
      <button @click="accion(preparar2fa)">Generar QR</button>
      <img v-if="qr" :src="qr" alt="QR para configurar autenticador" class="qr" />
      <input v-model="codigo" inputmode="numeric" placeholder="Código de 6 dígitos" autocomplete="one-time-code" />
      <button @click="accion(activar2fa)">Activar 2FA</button>
    </section>
    <section v-if="usuario" class="panel">
      <h3>Servicios disponibles</h3>
      <ul>
        <li v-for="s in servicios" :key="s.id">
          {{ s.nombre }} · ${{ Number(s.precio).toLocaleString('es-CL') }}
          <button v-if="usuario.rol === 'admin'" class="peligro" @click="accion(() => eliminar(s.id))">Eliminar</button>
        </li>
      </ul>
      <div v-if="usuario.rol === 'admin'">
        <h3>Nuevo servicio (solo administrador)</h3>
        <input v-model="servicio.nombre" placeholder="Nombre" />
        <input v-model="servicio.descripcion" placeholder="Descripción" />
        <input v-model.number="servicio.precio" type="number" min="0" placeholder="Precio" />
        <button @click="accion(crear)">Guardar</button>
      </div>
    </section>
  </main>
</template>

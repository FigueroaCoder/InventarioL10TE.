// js/auth-global.js
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAX-WKQe_AvWQzNswGC1QIMRzz3RTMZB2o",
  authDomain: "almacen-web-2026.firebaseapp.com",
  projectId: "almacen-web-2026",
  storageBucket: "almacen-web-2026.firebasestorage.app",
  messagingSenderId: "777489188342",
  appId: "1:777489188342:web:992bdeeeaa8bd89409f3d7",
  measurementId: "G-EX9YG2K41P"
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ÚNICO ADMIN DEL SISTEMA (fijo, no depende de Firestore)
const ADMIN_EMAIL = "roberto.figueroa@gdl.fii-na.com";

function esAdminPorCorreo(email){
  return String(email || "").trim().toLowerCase() === ADMIN_EMAIL;
}

// CONTROL DE SESIÓN SIN FLICKER
onAuthStateChanged(auth, async (user) => {

  // SIN SESIÓN
  if (!user) {
    window.location.replace("login.html");
    return;
  }

  // GLOBAL
  window.currentUser = user;

  // MOSTRAR USUARIO
  const span = document.getElementById("usuarioActivo");
  if (span) {
    span.innerText = "Usuario: " + user.email;
  }

  try {

    // OBTENER ROL DIRECTO (RÁPIDO) — solo se usa para mostrarlo en usuarios.html,
    // el permiso real de admin SIEMPRE depende únicamente del correo fijo de arriba.
    const userRef = doc(db, "usuarios", user.email);
    const userSnap = await getDoc(userRef);

    let rolGuardado = "user";

    if (userSnap.exists()) {
      rolGuardado = userSnap.data().role || "user";
    }

    window.rolGuardado = rolGuardado;

    // ÚNICA FUENTE DE VERDAD PARA PERMISOS DE ADMIN
    const esAdmin = esAdminPorCorreo(user.email);
    window.currentRole = esAdmin ? "admin" : "user";
    window.isAdmin = esAdmin;

    // CONTROL DEL MENÚ ADMIN (SIN PARPADEO)
    const menu = document.getElementById("adminMenu");

    if (menu) {
      // SOLO mostrar si es admin (roberto.figueroa@gdl.fii-na.com)
      if (esAdmin) {
        menu.style.display = "block";
      }
      // NO hacer nada si no es admin (ya está oculto por CSS)
    }

    // BLOQUEAR ACCESO DIRECTO A /usuarios
    if (!esAdmin && window.location.pathname.includes("usuarios.html")) {
      window.location.replace("index.html");
    }

  } catch (e) {
    console.error("Error obteniendo rol:", e);
    // Ante error de Firestore, jamás otorgar admin salvo que sea el correo fijo
    const esAdmin = esAdminPorCorreo(user.email);
    window.currentRole = esAdmin ? "admin" : "user";
    window.isAdmin = esAdmin;
  }

});

// LOGOUT GLOBAL
window.logout = function () {
  signOut(auth)
    .then(() => {
      window.location.replace("login.html");
    })
    .catch((e) => {
      console.error("Error al cerrar sesión:", e);
      alert("Error al cerrar sesión");
    });
};

/* =====================================================
   CIERRE DE SESIÓN AUTOMÁTICO POR INACTIVIDAD (20 minutos)
   -----------------------------------------------------
   Cualquier interacción (mouse, teclado, toque, scroll) reinicia
   el contador. Si no hay actividad durante 20 minutos seguidos,
   se cierra la sesión automáticamente por seguridad.
   ===================================================== */

const TIEMPO_INACTIVIDAD_MS = 20 * 60 * 1000; // 20 minutos
let ultimaActividad = Date.now();

["mousemove", "mousedown", "keydown", "scroll", "touchstart", "click"].forEach(evento => {
  document.addEventListener(evento, () => { ultimaActividad = Date.now(); }, { passive: true });
});

setInterval(() => {
  if (!window.currentUser) return;
  if (Date.now() - ultimaActividad >= TIEMPO_INACTIVIDAD_MS) {
    alert("Tu sesión se cerró automáticamente por 20 minutos de inactividad.");
    window.logout();
  }
}, 30000);

/* =====================================================
   DETERRENTES BÁSICOS CONTRA VER EL CÓDIGO FUENTE
   -----------------------------------------------------
   IMPORTANTE — límite real: esto NO puede impedir de forma absoluta
   que alguien vea el código de una página web ni proteger la base
   de datos por sí solo; cualquier navegador puede abrir sus
   herramientas de desarrollo desde su propio menú. Esto solo
   desalienta el acceso casual (clic derecho, F12, Ctrl+U, etc.).
   La protección real de los datos depende de las Reglas de
   Seguridad de Firestore configuradas en la consola de Firebase.
   No se bloquea la selección de texto: copiar/pegar sigue
   funcionando con normalidad.
   ===================================================== */

document.addEventListener("contextmenu", (e) => e.preventDefault());

document.addEventListener("keydown", (e) => {
  const tecla = e.key ? e.key.toLowerCase() : "";

  // F12
  if (e.key === "F12") { e.preventDefault(); return; }

  // Ctrl/Cmd + Shift + I / J / C  (herramientas de desarrollo / inspector)
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && ["i","j","c"].includes(tecla)) {
    e.preventDefault(); return;
  }

  // Ctrl/Cmd + U (ver código fuente)
  if ((e.ctrlKey || e.metaKey) && tecla === "u") { e.preventDefault(); return; }

  // Ctrl/Cmd + S (guardar página)
  if ((e.ctrlKey || e.metaKey) && tecla === "s") { e.preventDefault(); return; }
});
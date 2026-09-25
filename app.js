import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-app.js";
import {
  getFirestore, collection, addDoc, getDocs, getDoc, setDoc, updateDoc, deleteDoc, doc, query, where
} from "https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js";

/* =====================
CONFIG
===================== */

const firebaseConfig = {
  apiKey: "AIzaSyAX-WKQe_AvWQzNswGC1QIMRzz3RTMZB2o",
  authDomain: "almacen-web-2026.firebaseapp.com",
  projectId: "almacen-web-2026",
  storageBucket: "almacen-web-2026.firebasestorage.app",
  messagingSenderId: "777489188342",
  appId: "1:777489188342:web:992bdeeeaa8bd89409f3d7"
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db = getFirestore(app);

/* =====================
CATEGORÍAS DE MATERIAL
===================== */

window.CATEGORIAS_MATERIAL = [
  "Consumible indirecto",
  "Material en SAP",
  "Material recibido de Taiwán sin registro en SAP",
  "Material en validación de Scrap",
  "Material en validación de envío a Tool Crib"
];

/* =====================
UTIL
===================== */

function getUser(){
  return window.currentUser?.email || "DESCONOCIDO";
}

/* Único admin del sistema: roberto.figueroa@gdl.fii-na.com (definido en auth-global.js).
   Cualquier otro usuario, sin importar lo que diga Firestore, es "user" común. */
function isAdmin(){
  return window.currentRole === "admin";
}

/* expuesto para el visor 3D (rack3d.js) */
window.isAdminUser = function(){
  return window.currentRole === "admin";
};

function bloquearSiNoAdmin(mensaje){
  if(!isAdmin()){
    alert(mensaje || "Solo el administrador (roberto.figueroa@gdl.fii-na.com) puede realizar esta acción.");
    return true;
  }
  return false;
}

function pad2(n){
  return String(n).padStart(2,"0");
}

function normCaja(c){
  c = String(c ?? "").trim();
  if(!c) return "";
  if(/^\d+$/.test(c)) return pad2(c);
  return c.toUpperCase().replace(/[\/\\]/g,"-");
}

function buildUbicacion(rack, nivel, slot, caja){
  return `${rack}-${pad2(nivel)}-${pad2(slot)}-${normCaja(caja)}`;
}

/* varias cajas pueden vivir dentro del mismo slot */
function cajasDeSlot(rack, nivel, slot){
  return cacheCajas.filter(c =>
    c.rack === rack &&
    Number(c.nivel) === Number(nivel) &&
    Number(c.slot) === Number(slot)
  );
}

/* =====================
CACHE
===================== */

let cacheCajas = [];        // todas las cajas (con su arreglo de componentes)
let historialCache = [];
let cacheRacks = [];

/* =====================
CARGA DE CAJAS (CORE)
===================== */

async function loadCajas(force){
  if(!force && cacheCajas.length > 0) return cacheCajas;

  const snapshot = await getDocs(collection(db,"cajas"));
  cacheCajas = snapshot.docs.map(d => ({
    idDoc: d.id,
    ...d.data()
  }));

  return cacheCajas;
}

/* devuelve todas las filas planas: una por componente dentro de cada caja */
function filasPlanas(){
  const filas = [];
  cacheCajas.forEach(c => {
    (c.componentes || []).forEach(comp => {
      filas.push({
        ubicacion: c.ubicacion,
        rack: c.rack,
        nivel: c.nivel,
        slot: c.slot,
        nombre: comp.nombre,
        pn: comp.pn,
        cantidad: comp.cantidad,
        responsable: comp.responsable,
        comentarios: comp.comentarios
      });
    });
  });
  return filas;
}

/* =====================
REGISTRAR ENTRADA
===================== */

window.registerEntry = async function(){

  const rack = document.getElementById("rackSelect")?.value;
  const nivel = document.getElementById("nivelSelect")?.value;
  const slot = document.getElementById("slotSelect")?.value;
  const ubicacion = document.getElementById("cajaSelect")?.value;

  let nombre = document.getElementById("nombre").value.trim();
  let pn = document.getElementById("pn").value.trim() || "NO APLICA";
  let cantidad = parseInt(document.getElementById("cantidad").value);
  let comentarios = document.getElementById("comentarios").value || "NO APLICA";
  let categoria = document.getElementById("categoria")?.value || "";
  let espacio = parseFloat(document.getElementById("espacio")?.value);
  if(isNaN(espacio)) espacio = 0;

  if(!rack || !nivel || !slot || !ubicacion){
    alert("Selecciona rack, nivel, slot y caja");
    return;
  }

  if(!nombre || isNaN(cantidad) || cantidad <= 0){
    alert("Datos inválidos");
    return;
  }

  try{

    const cajaRef = doc(db,"cajas",ubicacion);
    const cajaSnap = await getDoc(cajaRef);

    if(!cajaSnap.exists()){
      alert("Esa caja ya no existe. Créala de nuevo en Racks y Cajas.");
      return;
    }

    let componentes = cajaSnap.data().componentes || [];

    const idx = componentes.findIndex(c => c.nombre.toLowerCase() === nombre.toLowerCase());

    if(idx >= 0){
      componentes[idx].cantidad = (componentes[idx].cantidad || 0) + cantidad;
      componentes[idx].pn = pn || componentes[idx].pn;
      componentes[idx].comentarios = comentarios;
      componentes[idx].responsable = getUser();
      componentes[idx].espacio = (componentes[idx].espacio || 0) + espacio;
      if(categoria) componentes[idx].categoria = categoria;
    } else {
      componentes.push({
        nombre, pn, cantidad, comentarios,
        responsable: getUser(),
        categoria: categoria || "",
        espacio
      });
    }

    await updateDoc(cajaRef, { componentes });

    // 🔥 HISTORIAL
    await addDoc(collection(db,"historial"),{
      fecha: new Date().toLocaleString(),
      accion: "ENTRADA",
      ubicacion,
      nombre,
      cantidad,
      responsable: getUser(),
      comentarios
    });

    alert("Entrada registrada en caja " + ubicacion);

    await loadCajas(true);
    if(typeof window.showStock === "function") await window.showStock(true);

    if(typeof window.resetCampos === "function") window.resetCampos();

  }catch(e){
    console.error(e);
    alert("Error en entrada");
  }

};

/* =====================
INVENTARIO (STOCK)
===================== */

let cargandoStock = false;

window.showStock = async function(force){

  if(cargandoStock) return;
  cargandoStock = true;

  const tabla = document.getElementById("tabla");
  if(!tabla){
    cargandoStock = false;
    return;
  }

  tabla.innerHTML = "";

  try{

    await loadCajas(force);
    const filas = filasPlanas();

    let html = "";

    filas.forEach(p=>{
      const accionesTd = isAdmin()
        ? `<button class="btn-danger" title="Eliminar material" onclick="eliminarMaterial('${p.ubicacion}','${(p.nombre||"").replace(/'/g,"\\'")}')">🗑 Eliminar</button>`
        : `<span style="color:var(--ink-soft);">—</span>`;

      html += `
<tr>
<td>${p.ubicacion || ""}</td>
<td>${p.nombre || ""}</td>
<td>${p.pn || ""}</td>
<td>${p.cantidad || 0}</td>
<td>${p.responsable || ""}</td>
<td>${p.comentarios || ""}</td>
<td>${accionesTd}</td>
</tr>`;
    });

    tabla.innerHTML = html || `<tr><td colspan="7" style="color:var(--ink-soft);">Sin existencias registradas</td></tr>`;

  }catch(e){
    console.error("Error cargando inventario:", e);
  }

  cargandoStock = false;
};

/* =====================
BUSCADOR INVENTARIO (por caja o componente)
===================== */

window.liveSearch = function(){

  const input = document.getElementById("valor").value.toLowerCase();
  const filas = document.querySelectorAll("#tabla tr");

  filas.forEach(fila => {
    const texto = fila.innerText.toLowerCase();
    fila.style.display = texto.includes(input) ? "" : "none";
  });

};

/* =====================
SALIDA
===================== */

window.registrarSalida = async function(){

  const ubicacion = document.getElementById("ubicacionSalida").value.trim();
  const nombre = document.getElementById("nombreSalida").value.trim();
  let cantidad = parseInt(document.getElementById("cantidadSalida").value);
  let comentarios = document.getElementById("comentariosSalida").value || "NO APLICA";

  if(!ubicacion || !nombre){
    alert("Busca y selecciona un componente/caja primero");
    return;
  }

  if(isNaN(cantidad) || cantidad <= 0){
    alert("Cantidad inválida");
    return;
  }

  try{

    const cajaRef = doc(db,"cajas",ubicacion);
    const cajaSnap = await getDoc(cajaRef);

    if(!cajaSnap.exists()){
      alert("La caja no existe");
      return;
    }

    let data = cajaSnap.data();
    let componentes = data.componentes || [];

    const idx = componentes.findIndex(c => c.nombre.toLowerCase() === nombre.toLowerCase());

    if(idx < 0){
      alert("Ese componente no está en esa caja");
      return;
    }

    if(componentes[idx].cantidad < cantidad){
      alert("Sin stock suficiente. Disponible: " + componentes[idx].cantidad);
      return;
    }

    componentes[idx].cantidad -= cantidad;

    if(componentes[idx].cantidad <= 0){
      componentes.splice(idx,1);
    }

    await updateDoc(cajaRef, { componentes });

    await addDoc(collection(db,"historial"),{
      fecha: new Date().toLocaleString(),
      accion: "SALIDA",
      ubicacion,
      nombre,
      cantidad,
      responsable: getUser(),
      comentarios
    });

    alert("Salida registrada");

    await loadCajas(true);
    if(typeof window.resetSalidaForm === "function") window.resetSalidaForm();

  }catch(e){
    console.error(e);
    alert("Error en salida");
  }

};

/* =====================
BUSCADOR SALIDA — por número de caja o por componente
===================== */

window.suggestBoxOrProduct = async function(){

  const inputEl = document.getElementById("buscarSalida");
  const contenedor = document.getElementById("sugerenciasSalida");

  const input = inputEl.value.toLowerCase().trim();
  contenedor.innerHTML = "";

  if(!input) return;

  await loadCajas();

  const resultados = [];

  cacheCajas.forEach(c => {
    (c.componentes || []).forEach(comp => {
      const matchUbicacion = c.ubicacion.toLowerCase().includes(input);
      const matchNombre = comp.nombre?.toLowerCase().includes(input);
      const matchPn = comp.pn?.toLowerCase().includes(input);

      if(matchUbicacion || matchNombre || matchPn){
        resultados.push({ ubicacion: c.ubicacion, ...comp });
      }
    });
  });

  if(resultados.length === 0){
    contenedor.innerHTML = `<div class="suggestion" style="cursor:default;">Sin resultados</div>`;
    return;
  }

  resultados.slice(0,8).forEach(r=>{

    const item = document.createElement("div");
    item.className = "suggestion";
    item.innerHTML = `<b>${r.nombre}</b> — Caja ${r.ubicacion} · Disponible: ${r.cantidad}`;

    item.onclick = () => {
      document.getElementById("buscarSalida").value = `${r.nombre} (${r.ubicacion})`;
      document.getElementById("ubicacionSalida").value = r.ubicacion;
      document.getElementById("nombreSalida").value = r.nombre;
      document.getElementById("pnSalida").value = r.pn || "NO APLICA";
      document.getElementById("disponibleSalida").value = r.cantidad;
      contenedor.innerHTML = "";
    };

    contenedor.appendChild(item);
  });

};

window.resetSalidaForm = function(){
  const buscar = document.getElementById("buscarSalida");
  if(!buscar) return;

  buscar.value = "";
  document.getElementById("ubicacionSalida").value = "";
  document.getElementById("nombreSalida").value = "";
  document.getElementById("pnSalida").value = "";
  document.getElementById("disponibleSalida").value = "";
  document.getElementById("cantidadSalida").value = "";
  document.getElementById("comentariosSalida").value = "";
  document.getElementById("sugerenciasSalida").innerHTML = "";
};

/* =====================
HISTORIAL
===================== */

window.viewHistory = async function(){

  const tabla = document.getElementById("tablaHistorial");
  if(!tabla) return;

  const snapshot = await getDocs(collection(db,"historial"));

  historialCache = snapshot.docs.map(doc => doc.data());
  historialCache.sort((a,b) => new Date(b.fecha) - new Date(a.fecha));

  renderHistorial(historialCache);
};

/* =====================
RENDER HISTORIAL
===================== */

let renderizandoHistorial = false;

function renderHistorial(data){

  if(renderizandoHistorial) return;
  renderizandoHistorial = true;

  const tabla = document.getElementById("tablaHistorial");
  if(!tabla){
    renderizandoHistorial = false;
    return;
  }

  tabla.innerHTML = "";

  try{

    let html = "";

    data.forEach(d => {
      html += `
<tr>
<td>${d.fecha || ""}</td>
<td>${d.accion || ""}</td>
<td>${d.ubicacion || "-"}</td>
<td>${d.nombre || ""}</td>
<td>${d.cantidad || 0}</td>
<td>${d.responsable || ""}</td>
<td>${d.comentarios || ""}</td>
</tr>`;
    });

    tabla.innerHTML = html || `<tr><td colspan="7" style="color:var(--ink-soft);">Sin movimientos registrados</td></tr>`;

  }catch(e){
    console.error("Error renderizando historial:", e);
  }

  renderizandoHistorial = false;
}

/* =====================
BUSCAR + FILTRAR HISTORIAL
===================== */

window.filterHistory = function(){

  const texto = document.getElementById("valor").value.toLowerCase();
  const tipo = document.getElementById("tipoFiltro").value;

  const filtrado = historialCache.filter(item => {

    const matchTexto =
      item.nombre?.toLowerCase().includes(texto) ||
      item.ubicacion?.toLowerCase().includes(texto);

    const matchTipo =
      tipo === "todos" || item.accion === tipo;

    return matchTexto && matchTipo;
  });

  renderHistorial(filtrado);
};

/* =====================
EXPORTAR HISTORIAL
===================== */

window.exportHistory = function(){

  let csv = "Fecha,Movimiento,Ubicacion,Producto,Cantidad,Responsable,Comentarios\n";

  historialCache.forEach(d=>{
    csv += `${d.fecha},${d.accion},${d.ubicacion},${d.nombre},${d.cantidad},${d.responsable},${d.comentarios}\n`;
  });

  const blob = new Blob([csv], {type:"text/csv"});
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "historial.csv";
  a.click();
};

/* =====================
AUTOCOMPLETE ENTRADA — sugiere productos ya existentes en cualquier caja
===================== */

window.suggestProducts = async function(){

  const input = document.getElementById("nombre").value.toLowerCase();
  const contenedor = document.getElementById("sugerencias");

  contenedor.innerHTML = "";
  if(!input) return;

  await loadCajas();

  // nombres únicos entre todas las cajas
  const vistos = new Set();
  const filtrados = [];

  cacheCajas.forEach(c=>{
    (c.componentes||[]).forEach(comp=>{
      const key = comp.nombre.toLowerCase();
      if(vistos.has(key)) return;

      if(key.includes(input) || comp.pn?.toLowerCase().includes(input)){
        vistos.add(key);
        filtrados.push(comp);
      }
    });
  });

  filtrados.slice(0,6).forEach(p => {

    const item = document.createElement("div");
    item.className = "suggestion";
    item.innerText = `${p.nombre || "Sin nombre"} ${p.pn && p.pn !== "NO APLICA" ? "· " + p.pn : ""}`;

    item.onclick = () => seleccionarProducto(p);

    contenedor.appendChild(item);
  });

};

function seleccionarProducto(p){

  document.getElementById("nombre").value = p.nombre || "";
  document.getElementById("pn").value = (p.pn && p.pn !== "NO APLICA") ? p.pn : "";

  document.getElementById("cantidad").value = "";
  document.getElementById("cantidad").focus();

  document.getElementById("sugerencias").innerHTML = "";
}

/* =====================
RACKS — administración
===================== */

async function loadRacks(force){
  if(!force && cacheRacks.length > 0) return cacheRacks;

  const snapshot = await getDocs(collection(db,"racks"));
  cacheRacks = snapshot.docs.map(d => ({ idDoc:d.id, ...d.data() }));
  cacheRacks.sort((a,b)=> a.nombre.localeCompare(b.nombre));

  return cacheRacks;
}

window.crearRack = async function(){

  if(bloquearSiNoAdmin("Solo el administrador puede agregar racks.")) return;

  const nombre = document.getElementById("rackNombre").value.trim().toUpperCase();
  const niveles = parseInt(document.getElementById("rackNiveles").value);
  const slots = parseInt(document.getElementById("rackSlots").value);

  if(!nombre || isNaN(niveles) || niveles <= 0 || isNaN(slots) || slots <= 0){
    alert("Datos de rack inválidos");
    return;
  }

  try{

    const rackRef = doc(db,"racks",nombre);
    const rackSnap = await getDoc(rackRef);

    if(rackSnap.exists()){
      alert("Ya existe un rack con ese nombre");
      return;
    }

    await setDoc(rackRef, {
      nombre, niveles, slots, status:"active"
    });

    document.getElementById("rackNombre").value = "";
    document.getElementById("rackNiveles").value = "";
    document.getElementById("rackSlots").value = "";

    alert("Rack " + nombre + " creado. Agrega cajas a cada slot desde esta página.");

    await loadRacks(true);
    await loadCajas(true);
    window.renderRacksPage();

  }catch(e){
    console.error(e);
    alert("Error creando rack");
  }

};

window.toggleRackStatus = async function(nombre){

  try{
    const rack = cacheRacks.find(r => r.nombre === nombre);
    if(!rack) return;

    const nuevoStatus = rack.status === "active" ? "inactive" : "active";

    await updateDoc(doc(db,"racks",nombre), { status: nuevoStatus });

    await loadRacks(true);
    window.renderRacksPage();

  }catch(e){
    console.error(e);
    alert("Error actualizando rack");
  }

};

window.eliminarRack = async function(nombre){

  if(bloquearSiNoAdmin("Solo el administrador puede eliminar racks.")) return;

  if(!confirm(`¿Eliminar el rack ${nombre} y todas sus cajas? Esta acción no se puede deshacer.`)) return;

  try{

    await deleteDoc(doc(db,"racks",nombre));

    const relacionadas = cacheCajas.filter(c => c.rack === nombre);
    for(const c of relacionadas){
      await deleteDoc(doc(db,"cajas",c.ubicacion));
    }

    await loadRacks(true);
    await loadCajas(true);
    window.renderRacksPage();

  }catch(e){
    console.error(e);
    alert("Error eliminando rack");
  }

};

/* =====================
CAJAS DENTRO DE UN SLOT (número manual)
===================== */

window.crearCajaEnSlot = async function(rack, nivel, slot){

  const entrada = prompt(`Número o etiqueta de la nueva caja para ${rack}-${pad2(nivel)}-${pad2(slot)}:`);
  if(entrada === null) return;

  const cajaId = normCaja(entrada);

  if(!cajaId){
    alert("Número de caja inválido");
    return;
  }

  const capacidadTxt = prompt("Capacidad de espacio de esta caja (número de unidades de espacio que tiene disponibles). Déjalo vacío si no quieres controlar su espacio:", "");
  let capacidad = null;
  if(capacidadTxt !== null && capacidadTxt.trim() !== ""){
    const num = parseFloat(capacidadTxt);
    if(!isNaN(num) && num > 0) capacidad = num;
  }

  const ubicacion = buildUbicacion(rack, nivel, slot, cajaId);

  try{

    const cajaRef = doc(db,"cajas",ubicacion);
    const cajaSnap = await getDoc(cajaRef);

    if(cajaSnap.exists()){
      alert("Ya existe una caja con ese número en este slot");
      return;
    }

    await setDoc(cajaRef, {
      rack, nivel: parseInt(nivel), slot: parseInt(slot), caja: cajaId, ubicacion,
      componentes: [], capacidad
    });

    await loadCajas(true);
    if(typeof window.renderRacksPage === "function") window.renderRacksPage();

  }catch(e){
    console.error(e);
    alert("Error creando caja");
  }

};

window.eliminarCaja = async function(ubicacion){

  if(bloquearSiNoAdmin("Solo el administrador puede eliminar cajas.")) return;

  const caja = cacheCajas.find(c => c.ubicacion === ubicacion);
  const tieneContenido = caja && (caja.componentes||[]).length > 0;

  const confirmMsg = tieneContenido
    ? `La caja ${ubicacion} tiene componentes registrados. ¿Eliminarla de todas formas?`
    : `¿Eliminar la caja ${ubicacion}?`;

  if(!confirm(confirmMsg)) return;

  try{
    await deleteDoc(doc(db,"cajas",ubicacion));
    await loadCajas(true);
    if(typeof window.renderRacksPage === "function") window.renderRacksPage();
  }catch(e){
    console.error(e);
    alert("Error eliminando caja");
  }

};

/* =====================
ELIMINAR MATERIAL (componente) DE UNA CAJA — SOLO ADMIN
===================== */

window.eliminarMaterial = async function(ubicacion, nombreMaterial){

  if(bloquearSiNoAdmin("Solo el administrador puede borrar materiales.")) return;

  if(!confirm(`¿Eliminar por completo el material "${nombreMaterial}" de la caja ${ubicacion}? Esta acción no se puede deshacer.`)) return;

  try{

    const cajaRef = doc(db,"cajas",ubicacion);
    const cajaSnap = await getDoc(cajaRef);

    if(!cajaSnap.exists()){
      alert("La caja no existe");
      return;
    }

    let data = cajaSnap.data();
    let componentes = data.componentes || [];

    const idx = componentes.findIndex(c => c.nombre.toLowerCase() === nombreMaterial.toLowerCase());

    if(idx < 0){
      alert("Ese material ya no está en esta caja");
      return;
    }

    const cantidadEliminada = componentes[idx].cantidad || 0;
    componentes.splice(idx,1);

    await updateDoc(cajaRef, { componentes });

    await addDoc(collection(db,"historial"),{
      fecha: new Date().toLocaleString(),
      accion: "ELIMINACION MATERIAL",
      ubicacion,
      nombre: nombreMaterial,
      cantidad: cantidadEliminada,
      responsable: getUser(),
      comentarios: "Eliminado por administrador"
    });

    await loadCajas(true);
    if(typeof window.showStock === "function") window.showStock(true);
    if(typeof window.renderRacksPage === "function") window.renderRacksPage();

    alert("Material eliminado");

  }catch(e){
    console.error(e);
    alert("Error eliminando material");
  }

};

/* Catálogo único de materiales (nombre + PN) usado por el autocompletado
   del formulario de Entrada y por las cajas del visor 3D */
window.getMaterialesCatalogo = function(){
  const vistos = new Map();
  cacheCajas.forEach(c=>{
    (c.componentes||[]).forEach(comp=>{
      if(!comp || !comp.nombre) return;
      const key = String(comp.nombre).toLowerCase().trim();
      const actual = vistos.get(key);
      const tienePn = comp.pn && comp.pn !== "NO APLICA";
      if(!actual || (tienePn && (!actual.pn || actual.pn === "NO APLICA"))){
        vistos.set(key, { nombre: comp.nombre, pn: comp.pn || "NO APLICA" });
      }
    });
  });
  return Array.from(vistos.values());
};

/* =====================
CATEGORÍA DE MATERIALES — clasificar, listar y filtrar
===================== */

window.setCategoriaMaterial = async function(ubicacion, nombreMaterial, categoria){

  categoria = String(categoria || "");

  try{

    const cajaRef = doc(db,"cajas",ubicacion);
    const cajaSnap = await getDoc(cajaRef);
    if(!cajaSnap.exists()){ alert("La caja ya no existe"); return false; }

    let componentes = cajaSnap.data().componentes || [];
    const idx = componentes.findIndex(c => String(c.nombre).toLowerCase() === String(nombreMaterial).toLowerCase());
    if(idx < 0){ alert("Ese material ya no está en esa caja"); return false; }

    componentes[idx].categoria = categoria;
    await updateDoc(cajaRef, { componentes });

    await loadCajas(true);
    if(typeof window.showStock === "function") await window.showStock(true);

    return true;

  }catch(e){
    console.error(e);
    alert("Error guardando la categoría");
    return false;
  }

};

/* Lista todas las ocurrencias de material (una fila por material por caja),
   filtrando opcionalmente por texto de búsqueda y/o categoría exacta.
   Usada por la sección "Categoría de materiales". */
window.listarOcurrenciasPorCategoria = async function(query, categoria){

  await loadCajas();

  query = String(query || "").toLowerCase().trim();
  categoria = String(categoria || "");

  const resultados = [];

  cacheCajas.forEach(c=>{
    (c.componentes||[]).forEach(comp=>{
      const nombre = String(comp.nombre || "");
      const pn = String(comp.pn || "");
      const cat = String(comp.categoria || "");

      if(categoria && categoria !== "__sin__" && cat !== categoria) return;
      if(categoria === "__sin__" && cat) return;

      if(query){
        const matchTexto =
          nombre.toLowerCase().includes(query) ||
          (pn && pn.toLowerCase() !== "no aplica" && pn.toLowerCase().includes(query)) ||
          String(c.ubicacion || "").toLowerCase().includes(query) ||
          cat.toLowerCase().includes(query);
        if(!matchTexto) return;
      }

      resultados.push({
        ubicacion: c.ubicacion, rack: c.rack, nivel: c.nivel, slot: c.slot, caja: c.caja || c.ubicacion,
        nombre: comp.nombre, pn: comp.pn || "NO APLICA", cantidad: comp.cantidad || 0,
        categoria: cat, espacio: comp.espacio || 0
      });
    });
  });

  resultados.sort((a,b) => String(a.nombre).localeCompare(String(b.nombre)));

  return resultados;
};

/* =====================================================
ENTRADAS / SALIDAS RÁPIDAS DESDE EL VISOR 3D
Usan exactamente la misma lógica y el mismo historial
que las páginas de Entrada y Salida.
===================================================== */

window.entradaRapida = async function(ubicacion, nombre, pn, cantidad, comentarios, categoria, espacio){

  nombre = String(nombre || "").trim();
  pn = String(pn || "").trim();
  cantidad = parseInt(cantidad);
  comentarios = comentarios || "NO APLICA";
  categoria = categoria || "";
  espacio = parseFloat(espacio);
  if(isNaN(espacio)) espacio = 0;

  if(!ubicacion || !nombre || isNaN(cantidad) || cantidad <= 0){
    alert("Datos inválidos");
    return false;
  }

  // Si no se especificó PN, se busca coincidencia con un material ya
  // existente en cualquier caja del almacén para reconocerlo como el
  // mismo material (mismo nombre) y heredar su número de parte.
  if(!pn){
    const catalogo = window.getMaterialesCatalogo();
    const match = catalogo.find(m => m.nombre.toLowerCase() === nombre.toLowerCase());
    pn = (match && match.pn && match.pn !== "NO APLICA") ? match.pn : "NO APLICA";
  }

  try{

    const cajaRef = doc(db,"cajas",ubicacion);
    const cajaSnap = await getDoc(cajaRef);

    if(!cajaSnap.exists()){
      alert("Esa caja ya no existe.");
      return false;
    }

    let componentes = cajaSnap.data().componentes || [];
    const idx = componentes.findIndex(c => String(c.nombre).toLowerCase() === nombre.toLowerCase());

    if(idx >= 0){
      componentes[idx].cantidad = (componentes[idx].cantidad || 0) + cantidad;
      componentes[idx].pn = (pn !== "NO APLICA") ? pn : componentes[idx].pn;
      componentes[idx].comentarios = comentarios;
      componentes[idx].responsable = getUser();
      componentes[idx].espacio = (componentes[idx].espacio || 0) + espacio;
      if(categoria) componentes[idx].categoria = categoria;
    } else {
      componentes.push({ nombre, pn, cantidad, comentarios, responsable: getUser(), categoria, espacio });
    }

    await updateDoc(cajaRef, { componentes });

    await addDoc(collection(db,"historial"),{
      fecha: new Date().toLocaleString(),
      accion: "ENTRADA",
      ubicacion,
      nombre,
      cantidad,
      responsable: getUser(),
      comentarios
    });

    await loadCajas(true);
    if(typeof window.showStock === "function") await window.showStock(true);

    return true;

  }catch(e){
    console.error(e);
    alert("Error registrando entrada");
    return false;
  }

};

window.salidaRapida = async function(ubicacion, nombre, cantidad, comentarios){

  nombre = String(nombre || "").trim();
  cantidad = parseInt(cantidad);
  comentarios = comentarios || "NO APLICA";

  if(!ubicacion || !nombre || isNaN(cantidad) || cantidad <= 0){
    alert("Datos inválidos");
    return false;
  }

  try{

    const cajaRef = doc(db,"cajas",ubicacion);
    const cajaSnap = await getDoc(cajaRef);

    if(!cajaSnap.exists()){
      alert("La caja no existe");
      return false;
    }

    let componentes = cajaSnap.data().componentes || [];
    const idx = componentes.findIndex(c => String(c.nombre).toLowerCase() === nombre.toLowerCase());

    if(idx < 0){
      alert("Ese componente ya no está en esa caja");
      return false;
    }

    if((componentes[idx].cantidad || 0) < cantidad){
      alert("Sin stock suficiente. Disponible: " + componentes[idx].cantidad);
      return false;
    }

    componentes[idx].cantidad -= cantidad;
    if(componentes[idx].cantidad <= 0) componentes.splice(idx,1);

    await updateDoc(cajaRef, { componentes });

    await addDoc(collection(db,"historial"),{
      fecha: new Date().toLocaleString(),
      accion: "SALIDA",
      ubicacion,
      nombre,
      cantidad,
      responsable: getUser(),
      comentarios
    });

    await loadCajas(true);
    if(typeof window.showStock === "function") await window.showStock(true);

    return true;

  }catch(e){
    console.error(e);
    alert("Error registrando salida");
    return false;
  }

};

/* STATUS MANUAL DE UNA CAJA (poco contenido / medio / llena) */
window.setEstadoCaja = async function(ubicacion, estado){

  const validos = ["vacia","bajo","medio","lleno"];
  estado = String(estado || "").toLowerCase();

  if(!ubicacion || !validos.includes(estado)){
    alert("Status inválido");
    return false;
  }

  try{

    const cajaRef = doc(db,"cajas",ubicacion);
    const cajaSnap = await getDoc(cajaRef);

    if(!cajaSnap.exists()){
      alert("La caja no existe");
      return false;
    }

    await updateDoc(cajaRef, { estado });
    await loadCajas(true);

    return true;

  }catch(e){
    console.error(e);
    alert("Error actualizando el status de la caja");
    return false;
  }

};

/* TAMAÑO FÍSICO DE UNA CAJA (chica / mediana / grande) — independiente del status */
window.setTamanoCaja = async function(ubicacion, tamano){

  const validos = ["chica","mediana","grande"];
  tamano = String(tamano || "").toLowerCase();

  if(!ubicacion || !validos.includes(tamano)){
    alert("Tamaño inválido");
    return false;
  }

  try{

    const cajaRef = doc(db,"cajas",ubicacion);
    const cajaSnap = await getDoc(cajaRef);

    if(!cajaSnap.exists()){
      alert("La caja no existe");
      return false;
    }

    await updateDoc(cajaRef, { tamano });
    await loadCajas(true);

    return true;

  }catch(e){
    console.error(e);
    alert("Error actualizando el tamaño de la caja");
    return false;
  }

};

/* datos en vivo para el visor 3D */
window.getDatosAlmacen = function(){
  return { racks: cacheRacks, cajas: cacheCajas };
};

/* =====================
RENDER PÁGINA RACKS & CAJAS
===================== */

window.renderRacksPage = async function(){

  const tablaRacks = document.getElementById("tablaRacks");
  const contBoxes = document.getElementById("cajasPorUbicacion");
  const contadorRacks = document.getElementById("contadorRacks");

  if(!tablaRacks) return;

  await loadRacks();
  await loadCajas();

  if(contadorRacks) contadorRacks.innerText = cacheRacks.length;

  // ---- tabla de racks ----
  let html = "";

  cacheRacks.forEach(r=>{

    const cajasDelRack = cacheCajas.filter(c => c.rack === r.nombre);
    const totalCajas = cajasDelRack.length;
    const conContenido = cajasDelRack.filter(c => (c.componentes||[]).length > 0).length;

    const badge = r.status === "active"
      ? `<span class="badge badge-active">Active</span>`
      : `<span class="badge badge-inactive">Inactive</span>`;

    html += `
<tr>
<td><b>${r.nombre}</b></td>
<td>${r.niveles}</td>
<td>${r.slots}</td>
<td>${totalCajas}</td>
<td>${conContenido}/${totalCajas}</td>
<td>${badge}</td>
<td>
<button class="btn-outline" onclick="toggleRackStatus('${r.nombre}')">${r.status === "active" ? "Desactivar" : "Activar"}</button>
${isAdmin() ? `<button class="btn-danger" onclick="eliminarRack('${r.nombre}')">🗑</button>` : ""}
</td>
</tr>`;
  });

  tablaRacks.innerHTML = html || `<tr><td colspan="7" style="color:var(--ink-soft);">Aún no hay racks registrados</td></tr>`;

  // ---- grid de cajas por ubicación (solo racks activos) ----
  if(contBoxes){

    let gridHtml = "";

    cacheRacks.filter(r => r.status === "active").forEach(r=>{

      gridHtml += `<div class="rack-block">
<div class="rack-block-head">📦 Rack ${r.nombre} <span>${r.niveles} niveles × ${r.slots} slots</span></div>`;

      for(let n=1; n<=r.niveles; n++){

        gridHtml += `<div class="level-label">Nivel ${pad2(n)}</div><div class="slot-grid">`;

        for(let s=1; s<=r.slots; s++){

          const slotLabel = `${r.nombre}-${pad2(n)}-${pad2(s)}`;
          const cajas = cajasDeSlot(r.nombre, n, s)
            .sort((a,b) => String(a.caja || a.ubicacion).localeCompare(String(b.caja || b.ubicacion)));

          gridHtml += `
<div class="slot-card">
<div class="slot-card-top">
<b>Slot ${slotLabel}</b>
<button class="slot-add" title="Agregar caja" onclick="crearCajaEnSlot('${r.nombre}',${n},${s})">+</button>
</div>`;

          if(cajas.length === 0){
            gridHtml += `<div class="slot-content"><span class="slot-empty">Sin cajas</span></div>`;
          } else {

            gridHtml += `<div class="caja-list">`;

            cajas.forEach(c=>{

              const cajaLabel = c.caja || c.ubicacion;
              const componentes = c.componentes || [];

              const contenido = componentes.length
                ? componentes.map(comp => `${comp.nombre} ×${comp.cantidad}`).join(", ")
                : `<span class="slot-empty">vacía</span>`;

              gridHtml += `
<div class="caja-item">
<div class="caja-item-top">
<b>Caja ${cajaLabel}</b>
<span class="caja-actions">
<button class="slot-add" title="Agregar componente" onclick="irAEntrada('${c.ubicacion}')">+</button>
${isAdmin() ? `<button class="slot-add slot-del" title="Eliminar caja" onclick="eliminarCaja('${c.ubicacion}')">×</button>` : ""}
</span>
</div>
<div class="slot-content">${contenido}</div>
</div>`;

            });

            gridHtml += `</div>`;
          }

          gridHtml += `</div>`;
        }

        gridHtml += `</div>`;
      }

      gridHtml += `</div>`;
    });

    contBoxes.innerHTML = gridHtml || `<p style="color:var(--ink-soft);">No hay racks activos para mostrar.</p>`;
  }

  // ---- VISOR 3D (misma información, en tiempo real) ----
  if(window.Rack3D && typeof window.Rack3D.rebuild === "function"){
    const activos = cacheRacks.filter(r => r.status === "active");
    window.Rack3D.rebuild(activos, cacheCajas, true);

    const infoCajas = document.getElementById("contadorCajas3D");
    if(infoCajas){
      const cajasDelArea = cacheCajas.filter(c => activos.some(r => r.nombre === c.rack));
      const totalCajas = cajasDelArea.length;

      const materialesArea = new Set();
      cajasDelArea.forEach(c => (c.componentes||[]).forEach(x => {
        if(x && x.nombre) materialesArea.add(String(x.nombre).toLowerCase().trim());
      }));

      await loadToolCrib();
      const materialesToolCrib = cacheToolCrib.length;

      const plural = (n, uno, varios) => n === 1 ? uno : varios;
      infoCajas.innerHTML =
        `<span class="stat-chip"><i class="dot dot-cajas"></i><b>${totalCajas}</b><em>${plural(totalCajas, "caja", "cajas")}</em></span>` +
        `<span class="stat-chip"><i class="dot dot-area"></i><b>${materialesArea.size}</b><em>${plural(materialesArea.size, "material distinto", "materiales distintos")} en el área</em></span>` +
        `<span class="stat-chip"><i class="dot dot-tool"></i><b>${materialesToolCrib}</b><em>${plural(materialesToolCrib, "material distinto", "materiales distintos")} en Tool Crib</em></span>`;
    }
  }

};

window.irAEntrada = function(ubicacion){

  const caja = cacheCajas.find(c => c.ubicacion === ubicacion);

  if(!caja){
    window.location.href = "entrada.html";
    return;
  }

  window.location.href = `entrada.html?rack=${encodeURIComponent(caja.rack)}&nivel=${caja.nivel}&slot=${caja.slot}&caja=${encodeURIComponent(caja.caja || "")}`;
};

/* =====================
IMPRIMIR ETIQUETAS
===================== */

window.printLabels = async function(){

  await loadRacks();
  await loadCajas();

  const activos = cacheRacks.filter(r => r.status === "active");

  if(activos.length === 0){
    alert("No hay racks activos para imprimir etiquetas");
    return;
  }

  const nombresActivos = new Set(activos.map(r => r.nombre));

  const cajasActivas = cacheCajas
    .filter(c => nombresActivos.has(c.rack))
    .sort((a,b) => a.ubicacion.localeCompare(b.ubicacion));

  if(cajasActivas.length === 0){
    alert("Todavía no hay cajas creadas. Agrégalas primero desde esta página.");
    return;
  }

  let etiquetas = "";

  cajasActivas.forEach(c=>{
    etiquetas += `<div class="etiqueta">${c.ubicacion}</div>`;
  });

  const ventana = window.open("", "_blank");
  ventana.document.write(`
<html><head><title>Etiquetas L10 ALMACEN</title>
<style>
body{ font-family:'Courier New',monospace; margin:20px; }
.etiqueta{
  display:inline-block; width:150px; height:80px; border:2px solid #000;
  border-radius:6px; margin:6px; text-align:center; line-height:80px;
  font-size:22px; font-weight:700;
}
@media print{ .etiqueta{ page-break-inside:avoid; } }
</style></head>
<body>${etiquetas}</body></html>
`);

  ventana.document.close();
  ventana.focus();
  ventana.print();
};

/* =====================
SELECTORES RACK / NIVEL / SLOT (entrada.html)
===================== */

window.initUbicacionSelectors = async function(){

  const rackSelect = document.getElementById("rackSelect");
  const nivelSelect = document.getElementById("nivelSelect");
  const slotSelect = document.getElementById("slotSelect");
  const cajaSelect = document.getElementById("cajaSelect");
  const cajaDisplay = document.getElementById("cajaDisplay");

  if(!rackSelect) return;

  await loadRacks();
  await loadCajas();

  const activos = cacheRacks.filter(r => r.status === "active");

  rackSelect.innerHTML = `<option value="">Seleccionar rack</option>` +
    activos.map(r => `<option value="${r.nombre}">Rack ${r.nombre}</option>`).join("");

  function actualizarCajas(){

    cajaSelect.innerHTML = `<option value="">Caja</option>`;
    cajaDisplay.value = "";

    if(!rackSelect.value || !nivelSelect.value || !slotSelect.value) return;

    const cajas = cajasDeSlot(rackSelect.value, nivelSelect.value, slotSelect.value)
      .sort((a,b) => String(a.caja || a.ubicacion).localeCompare(String(b.caja || b.ubicacion)));

    if(cajas.length === 0){
      cajaSelect.innerHTML = `<option value="">Sin cajas — créala en Racks y Cajas</option>`;
      return;
    }

    cajas.forEach(c=>{
      cajaSelect.innerHTML += `<option value="${c.ubicacion}">Caja ${c.caja || c.ubicacion}</option>`;
    });
  }

  function actualizarDisplay(){
    cajaDisplay.value = cajaSelect.value || "";
  }

  rackSelect.onchange = () => {
    const rack = activos.find(r => r.nombre === rackSelect.value);

    nivelSelect.innerHTML = `<option value="">Nivel</option>`;
    slotSelect.innerHTML = `<option value="">Slot</option>`;

    if(rack){
      for(let n=1; n<=rack.niveles; n++){
        nivelSelect.innerHTML += `<option value="${n}">Nivel ${pad2(n)}</option>`;
      }
      for(let s=1; s<=rack.slots; s++){
        slotSelect.innerHTML += `<option value="${s}">Slot ${pad2(s)}</option>`;
      }
    }

    actualizarCajas();
  };

  nivelSelect.onchange = actualizarCajas;
  slotSelect.onchange = actualizarCajas;
  cajaSelect.onchange = actualizarDisplay;

  // 🔥 precargar desde parámetros de URL (llegando desde racks.html)
  const params = new URLSearchParams(window.location.search);
  const rackParam = params.get("rack");
  const nivelParam = params.get("nivel");
  const slotParam = params.get("slot");
  const cajaParam = params.get("caja");

  if(rackParam){
    rackSelect.value = rackParam;
    rackSelect.onchange();

    if(nivelParam) nivelSelect.value = nivelParam;
    if(slotParam) slotSelect.value = slotParam;

    actualizarCajas();

    if(cajaParam){
      const match = cajasDeSlot(rackParam, nivelParam, slotParam)
        .find(c => String(c.caja || c.ubicacion) === String(cajaParam));
      if(match) cajaSelect.value = match.ubicacion;
    }

    actualizarDisplay();
  }

};

/* =========================================================
   MOVIMIENTOS — sección nueva (movimientos.html)
   -----------------------------------------------------------
   Tres capacidades, todas sobre las mismas colecciones reales:
     1) Mover un material de una caja a otra ("cambiar de caja").
     2) Enviar un material al Tool Crib (colección aparte,
        agregada por material, no por caja).
     3) Mover una caja completa de rack/nivel/slot a otro.
   ========================================================= */

/* Selector genérico de Rack → Nivel → Slot (→ Caja opcional).
   Se puede instanciar varias veces en la misma página con distintos
   ids (origen/destino) sin que se pisen entre sí. */
window.initSelectorGrupo = async function(ids){

  const rackSelect = document.getElementById(ids.rack);
  const nivelSelect = document.getElementById(ids.nivel);
  const slotSelect = document.getElementById(ids.slot);
  const cajaSelect = ids.caja ? document.getElementById(ids.caja) : null;

  if(!rackSelect || !nivelSelect || !slotSelect) return;

  await loadRacks();
  await loadCajas();

  const activos = cacheRacks.filter(r => r.status === "active");

  rackSelect.innerHTML = `<option value="">Rack</option>` +
    activos.map(r => `<option value="${r.nombre}">Rack ${r.nombre}</option>`).join("");

  function actualizarNivelesSlots(){
    const rack = activos.find(r => r.nombre === rackSelect.value);

    nivelSelect.innerHTML = `<option value="">Nivel</option>`;
    slotSelect.innerHTML = `<option value="">Slot</option>`;
    if(cajaSelect) cajaSelect.innerHTML = `<option value="">Caja</option>`;

    if(rack){
      for(let n=1; n<=rack.niveles; n++){
        nivelSelect.innerHTML += `<option value="${n}">Nivel ${pad2(n)}</option>`;
      }
      for(let s=1; s<=rack.slots; s++){
        slotSelect.innerHTML += `<option value="${s}">Slot ${pad2(s)}</option>`;
      }
    }
  }

  function actualizarCajas(){
    if(!cajaSelect) return;
    cajaSelect.innerHTML = `<option value="">Caja</option>`;
    if(!rackSelect.value || !nivelSelect.value || !slotSelect.value) return;

    const cajas = cajasDeSlot(rackSelect.value, nivelSelect.value, slotSelect.value)
      .sort((a,b) => String(a.caja || a.ubicacion).localeCompare(String(b.caja || b.ubicacion), undefined, {numeric:true}));

    if(cajas.length === 0){
      cajaSelect.innerHTML = `<option value="">Sin cajas en este slot</option>`;
      return;
    }

    cajas.forEach(c=>{
      cajaSelect.innerHTML += `<option value="${c.ubicacion}">Caja ${c.caja || c.ubicacion}</option>`;
    });
  }

  rackSelect.onchange = () => { actualizarNivelesSlots(); actualizarCajas(); };
  nivelSelect.onchange = actualizarCajas;
  slotSelect.onchange = actualizarCajas;
};

/* Devuelve la ubicación armada a partir de un grupo rack/nivel/slot
   (sin caja): usado para el destino al mover una caja completa. */
window.leerRackNivelSlot = function(ids){
  const rack = document.getElementById(ids.rack)?.value || "";
  const nivel = document.getElementById(ids.nivel)?.value || "";
  const slot = document.getElementById(ids.slot)?.value || "";
  return { rack, nivel, slot };
};

/* =====================
   1) BUSCADOR GLOBAL DE MATERIALES (por nombre, PN o número de caja)
   Usado tanto por "Movimiento entre cajas" como por "Tool Crib".
   ===================== */
window.buscarOcurrenciasMaterial = async function(query){

  await loadCajas();

  query = String(query || "").toLowerCase().trim();
  if(!query) return [];

  const resultados = [];

  cacheCajas.forEach(c=>{
    (c.componentes || []).forEach(comp=>{
      const nombre = String(comp.nombre || "");
      const pn = String(comp.pn || "");
      const matchNombre = nombre.toLowerCase().includes(query) ||
        (pn && pn.toLowerCase() !== "no aplica" && pn.toLowerCase().includes(query));
      const matchCaja = String(c.ubicacion || "").toLowerCase().includes(query) ||
        String(c.caja || "").toLowerCase().includes(query);

      if(matchNombre || matchCaja){
        resultados.push({
          ubicacion: c.ubicacion,
          rack: c.rack, nivel: c.nivel, slot: c.slot, caja: c.caja || c.ubicacion,
          nombre: comp.nombre, pn: comp.pn, cantidad: comp.cantidad
        });
      }
    });
  });

  return resultados.slice(0, 30);
};

/* =====================
   2) MOVER MATERIAL DE UNA CAJA A OTRA
   Descuenta (o borra) el material en la caja de origen y lo suma
   (o crea) en la caja de destino. Cambia por completo su registro
   de ubicación. Queda registrado en Historial.
   ===================== */
window.moverMaterialEntreCajas = async function(ubicacionOrigen, nombreMaterial, ubicacionDestino, cantidad, comentarios){

  nombreMaterial = String(nombreMaterial || "").trim();
  cantidad = parseInt(cantidad);
  comentarios = comentarios || "NO APLICA";

  if(!ubicacionOrigen || !ubicacionDestino || !nombreMaterial || isNaN(cantidad) || cantidad <= 0){
    alert("Selecciona material, cantidad y destino válidos");
    return false;
  }

  if(ubicacionOrigen === ubicacionDestino){
    alert("El origen y el destino son la misma caja");
    return false;
  }

  try{

    const origenRef = doc(db,"cajas",ubicacionOrigen);
    const origenSnap = await getDoc(origenRef);
    if(!origenSnap.exists()){ alert("La caja de origen ya no existe"); return false; }

    const destinoRef = doc(db,"cajas",ubicacionDestino);
    const destinoSnap = await getDoc(destinoRef);
    if(!destinoSnap.exists()){ alert("La caja de destino ya no existe"); return false; }

    let compOrigen = origenSnap.data().componentes || [];
    const idxOrigen = compOrigen.findIndex(c => String(c.nombre).toLowerCase() === nombreMaterial.toLowerCase());

    if(idxOrigen < 0){ alert("Ese material ya no está en la caja de origen"); return false; }
    if((compOrigen[idxOrigen].cantidad || 0) < cantidad){
      alert("Sin stock suficiente en el origen. Disponible: " + compOrigen[idxOrigen].cantidad);
      return false;
    }

    const pnMaterial = compOrigen[idxOrigen].pn || "NO APLICA";

    compOrigen[idxOrigen].cantidad -= cantidad;
    if(compOrigen[idxOrigen].cantidad <= 0) compOrigen.splice(idxOrigen,1);

    let compDestino = destinoSnap.data().componentes || [];
    const idxDestino = compDestino.findIndex(c => String(c.nombre).toLowerCase() === nombreMaterial.toLowerCase());

    if(idxDestino >= 0){
      compDestino[idxDestino].cantidad = (compDestino[idxDestino].cantidad || 0) + cantidad;
      compDestino[idxDestino].responsable = getUser();
    } else {
      compDestino.push({
        nombre: nombreMaterial, pn: pnMaterial, cantidad,
        comentarios, responsable: getUser()
      });
    }

    await updateDoc(origenRef, { componentes: compOrigen });
    await updateDoc(destinoRef, { componentes: compDestino });

    await addDoc(collection(db,"historial"),{
      fecha: new Date().toLocaleString(),
      accion: "MOVIMIENTO MATERIAL",
      ubicacion: `${ubicacionOrigen} → ${ubicacionDestino}`,
      nombre: nombreMaterial,
      cantidad,
      responsable: getUser(),
      comentarios
    });

    await loadCajas(true);
    if(typeof window.showStock === "function") await window.showStock(true);
    if(typeof window.renderRacksPage === "function") await window.renderRacksPage();

    alert(`Material movido de ${ubicacionOrigen} a ${ubicacionDestino}`);
    return true;

  }catch(e){
    console.error(e);
    alert("Error moviendo el material");
    return false;
  }

};

/* =====================
   3) TOOL CRIB — envío de materiales
   Colección aparte ("toolcrib"), un documento por material
   (agregado, no por caja). Descuenta del origen igual que una salida.
   ===================== */

let cacheToolCrib = [];
let cacheScrap = [];

function claveMaterial(nombre){
  return String(nombre || "").toLowerCase().trim().replace(/[\/\\]/g,"-");
}

async function loadToolCrib(force){
  if(!force && cacheToolCrib.length > 0) return cacheToolCrib;
  const snapshot = await getDocs(collection(db,"toolcrib"));
  cacheToolCrib = snapshot.docs.map(d => ({ idDoc:d.id, ...d.data() }));
  cacheToolCrib.sort((a,b) => String(a.nombre).localeCompare(String(b.nombre)));
  return cacheToolCrib;
}

async function loadScrap(force){
  if(!force && cacheScrap.length > 0) return cacheScrap;
  const snapshot = await getDocs(collection(db,"scrap"));
  cacheScrap = snapshot.docs.map(d => ({ idDoc:d.id, ...d.data() }));
  cacheScrap.sort((a,b) => String(a.nombre).localeCompare(String(b.nombre)));
  return cacheScrap;
}

/* Intenta liberar (borrar) una caja que se quedó vacía después de mover su
   material. Si le queda otro material, ofrece moverlo a otra caja para
   poder liberar esta. Devuelve true si la caja terminó libre/borrada. */
async function intentarLiberarCaja(ubicacion){

  const ref = doc(db,"cajas",ubicacion);
  const snap = await getDoc(ref);
  if(!snap.exists()) return true;

  let componentes = snap.data().componentes || [];

  if(componentes.length === 0){
    await deleteDoc(ref);
    return true;
  }

  const otros = componentes.map(c => `${c.nombre} (${c.cantidad})`).join(", ");
  const mover = confirm(
    `La caja ${ubicacion} todavía tiene otro material: ${otros}.\n` +
    `No puedes llevarte la caja vacía si sigue teniendo material.\n\n` +
    `¿Quieres mover ese material restante a otra caja para poder liberar esta?`
  );
  if(!mover) return false;

  const destino = prompt("¿A qué caja quieres mover el material restante? (formato RACK-NIVEL-SLOT-CAJA)");
  if(!destino || !destino.trim()) return false;

  const destinoUb = destino.trim().toUpperCase();
  if(destinoUb === ubicacion){ alert("Elige una caja distinta a la de origen"); return false; }

  for(const c of [...componentes]){
    await window.moverMaterialEntreCajas(ubicacion, c.nombre, destinoUb, c.cantidad, "Reubicado para liberar la caja de origen");
  }

  const freshSnap = await getDoc(ref);
  if(freshSnap.exists() && (freshSnap.data().componentes||[]).length === 0){
    await deleteDoc(ref);
    return true;
  }

  return false;
}

/* =====================
   ENVÍO A TOOL CRIB
   conservarCaja = true  → la caja se queda en el rack (aunque quede vacía).
   conservarCaja = false → se intenta liberar/borrar la caja del rack; si
   tiene otro material, se ofrece reubicarlo primero (ver intentarLiberarCaja).
   ===================== */
window.enviarATooCrib = async function(ubicacionOrigen, nombreMaterial, cantidad, comentarios, conservarCaja){

  nombreMaterial = String(nombreMaterial || "").trim();
  cantidad = parseInt(cantidad);
  comentarios = comentarios || "NO APLICA";
  conservarCaja = (conservarCaja === false) ? false : true;

  if(!ubicacionOrigen || !nombreMaterial || isNaN(cantidad) || cantidad <= 0){
    alert("Selecciona material y cantidad válidos");
    return false;
  }

  try{

    const origenRef = doc(db,"cajas",ubicacionOrigen);
    const origenSnap = await getDoc(origenRef);
    if(!origenSnap.exists()){ alert("La caja de origen ya no existe"); return false; }

    let componentes = origenSnap.data().componentes || [];
    const idx = componentes.findIndex(c => String(c.nombre).toLowerCase() === nombreMaterial.toLowerCase());

    if(idx < 0){ alert("Ese material ya no está en esa caja"); return false; }
    if((componentes[idx].cantidad || 0) < cantidad){
      alert("Sin stock suficiente. Disponible: " + componentes[idx].cantidad);
      return false;
    }

    const pnMaterial = componentes[idx].pn || "NO APLICA";

    componentes[idx].cantidad -= cantidad;
    if(componentes[idx].cantidad <= 0) componentes.splice(idx,1);

    await updateDoc(origenRef, { componentes });

    const key = claveMaterial(nombreMaterial);
    const cribRef = doc(db,"toolcrib",key);
    const cribSnap = await getDoc(cribRef);

    if(cribSnap.exists()){
      await updateDoc(cribRef, {
        cantidad: (cribSnap.data().cantidad || 0) + cantidad,
        pn: (pnMaterial && pnMaterial !== "NO APLICA") ? pnMaterial : (cribSnap.data().pn || "NO APLICA"),
        ultimaUbicacion: ubicacionOrigen,
        responsable: getUser(),
        comentarios,
        fecha: new Date().toLocaleString()
      });
    } else {
      await setDoc(cribRef, {
        nombre: nombreMaterial, pn: pnMaterial, cantidad,
        ultimaUbicacion: ubicacionOrigen,
        responsable: getUser(),
        comentarios,
        fecha: new Date().toLocaleString()
      });
    }

    await addDoc(collection(db,"historial"),{
      fecha: new Date().toLocaleString(),
      accion: "ENVIO TOOL CRIB",
      ubicacion: ubicacionOrigen,
      nombre: nombreMaterial,
      cantidad,
      responsable: getUser(),
      comentarios
    });

    let cajaLiberada = false;
    if(!conservarCaja){
      cajaLiberada = await intentarLiberarCaja(ubicacionOrigen);
    }

    await loadCajas(true);
    await loadToolCrib(true);
    if(typeof window.showStock === "function") await window.showStock(true);
    if(typeof window.renderRacksPage === "function") await window.renderRacksPage();
    if(typeof window.renderToolCrib === "function") await window.renderToolCrib(true);

    alert(`${cantidad} × ${nombreMaterial} enviado(s) a Tool Crib` +
      (conservarCaja ? "" : (cajaLiberada ? ". La caja quedó liberada del rack." : ". La caja se conservó porque aún tiene material.")));
    return true;

  }catch(e){
    console.error(e);
    alert("Error enviando material a Tool Crib");
    return false;
  }

};

/* Regresar material del Tool Crib al almacén — total o parcial — hacia
   una caja ya existente o hacia una caja nueva (rack/nivel/slot elegidos). */
window.regresarDeToolCrib = async function(nombreMaterial, cantidad, destino){

  nombreMaterial = String(nombreMaterial || "").trim();
  cantidad = parseInt(cantidad);

  if(!nombreMaterial || isNaN(cantidad) || cantidad <= 0 || !destino){
    alert("Selecciona material, cantidad y destino válidos");
    return false;
  }

  try{

    const key = claveMaterial(nombreMaterial);
    const cribRef = doc(db,"toolcrib",key);
    const cribSnap = await getDoc(cribRef);

    if(!cribSnap.exists()){ alert("Ese material ya no está en Tool Crib"); return false; }

    const cribData = cribSnap.data();
    if((cribData.cantidad || 0) < cantidad){
      alert("Sin stock suficiente en Tool Crib. Disponible: " + cribData.cantidad);
      return false;
    }

    let ubicacionDestino;

    if(destino.nueva){
      const { rack, nivel, slot, caja, capacidad } = destino.nueva;
      if(!rack || !nivel || !slot || !caja){
        alert("Completa rack, nivel, slot y número de caja del destino nuevo");
        return false;
      }
      ubicacionDestino = buildUbicacion(rack, nivel, slot, normCaja(caja));
      const destSnap = await getDoc(doc(db,"cajas",ubicacionDestino));
      if(destSnap.exists()){ alert("Ya existe una caja con ese número en ese slot"); return false; }

      await setDoc(doc(db,"cajas",ubicacionDestino), {
        rack, nivel: parseInt(nivel), slot: parseInt(slot), caja: normCaja(caja), ubicacion: ubicacionDestino,
        componentes: [{
          nombre: nombreMaterial, pn: cribData.pn || "NO APLICA", cantidad,
          comentarios: "Regresado de Tool Crib", responsable: getUser()
        }],
        capacidad: (typeof capacidad === "number" && capacidad > 0) ? capacidad : null
      });

    } else if(destino.existente){
      ubicacionDestino = destino.existente;
      const destRef = doc(db,"cajas",ubicacionDestino);
      const destSnap = await getDoc(destRef);
      if(!destSnap.exists()){ alert("La caja de destino ya no existe"); return false; }

      let componentes = destSnap.data().componentes || [];
      const idx = componentes.findIndex(c => String(c.nombre).toLowerCase() === nombreMaterial.toLowerCase());

      if(idx >= 0){
        componentes[idx].cantidad = (componentes[idx].cantidad || 0) + cantidad;
        componentes[idx].responsable = getUser();
      } else {
        componentes.push({
          nombre: nombreMaterial, pn: cribData.pn || "NO APLICA", cantidad,
          comentarios: "Regresado de Tool Crib", responsable: getUser()
        });
      }

      await updateDoc(destRef, { componentes });

    } else {
      alert("Indica si el destino es una caja existente o una caja nueva");
      return false;
    }

    const restante = (cribData.cantidad || 0) - cantidad;
    if(restante <= 0){
      await deleteDoc(cribRef);
    } else {
      await updateDoc(cribRef, { cantidad: restante });
    }

    await addDoc(collection(db,"historial"),{
      fecha: new Date().toLocaleString(),
      accion: "REGRESO TOOL CRIB",
      ubicacion: ubicacionDestino,
      nombre: nombreMaterial,
      cantidad,
      responsable: getUser(),
      comentarios: "Regreso desde Tool Crib"
    });

    await loadCajas(true);
    await loadToolCrib(true);
    if(typeof window.showStock === "function") await window.showStock(true);
    if(typeof window.renderRacksPage === "function") await window.renderRacksPage();
    if(typeof window.renderToolCrib === "function") await window.renderToolCrib(true);

    alert(`${cantidad} × ${nombreMaterial} regresado(s) al almacén, caja ${ubicacionDestino}`);
    return true;

  }catch(e){
    console.error(e);
    alert("Error regresando material del Tool Crib");
    return false;
  }

};

/* Tabla del Tool Crib — por MATERIAL, no por caja */
window.renderToolCrib = async function(force){

  const tabla = document.getElementById("tablaToolCrib");
  if(!tabla) return;

  await loadToolCrib(force);

  let html = "";

  cacheToolCrib.forEach(m=>{
    html += `
<tr>
<td>${m.nombre || ""}</td>
<td>${(m.pn && m.pn !== "NO APLICA") ? m.pn : "—"}</td>
<td>${m.cantidad || 0}</td>
<td>${m.ultimaUbicacion || ""}</td>
<td>${m.responsable || ""}</td>
<td>${m.comentarios || ""}</td>
<td>${m.fecha || ""}</td>
</tr>`;
  });

  tabla.innerHTML = html || `<tr><td colspan="7" style="color:var(--ink-soft);">Sin materiales en Tool Crib</td></tr>`;

};

window.getToolCribCatalogo = async function(force){
  await loadToolCrib(force);
  return cacheToolCrib;
};

/* =====================
   SCRAP — envío definitivo de material (desde una caja o desde Tool Crib)
   ===================== */
window.enviarAScrap = async function(origenTipo, origenId, nombreMaterial, cantidad, comentarios){

  nombreMaterial = String(nombreMaterial || "").trim();
  cantidad = parseInt(cantidad);
  comentarios = comentarios || "NO APLICA";

  if(!origenTipo || !origenId || !nombreMaterial || isNaN(cantidad) || cantidad <= 0){
    alert("Selecciona material y cantidad válidos");
    return false;
  }

  try{

    let pnMaterial = "NO APLICA";
    let ubicacionTexto = origenId;

    if(origenTipo === "caja"){

      const origenRef = doc(db,"cajas",origenId);
      const origenSnap = await getDoc(origenRef);
      if(!origenSnap.exists()){ alert("La caja de origen ya no existe"); return false; }

      let componentes = origenSnap.data().componentes || [];
      const idx = componentes.findIndex(c => String(c.nombre).toLowerCase() === nombreMaterial.toLowerCase());

      if(idx < 0){ alert("Ese material ya no está en esa caja"); return false; }
      if((componentes[idx].cantidad || 0) < cantidad){
        alert("Sin stock suficiente. Disponible: " + componentes[idx].cantidad);
        return false;
      }

      pnMaterial = componentes[idx].pn || "NO APLICA";
      componentes[idx].cantidad -= cantidad;
      if(componentes[idx].cantidad <= 0) componentes.splice(idx,1);

      await updateDoc(origenRef, { componentes });

    } else if(origenTipo === "toolcrib"){

      const key = claveMaterial(nombreMaterial);
      const cribRef = doc(db,"toolcrib",key);
      const cribSnap = await getDoc(cribRef);
      if(!cribSnap.exists()){ alert("Ese material ya no está en Tool Crib"); return false; }

      const cribData = cribSnap.data();
      if((cribData.cantidad || 0) < cantidad){
        alert("Sin stock suficiente en Tool Crib. Disponible: " + cribData.cantidad);
        return false;
      }

      pnMaterial = cribData.pn || "NO APLICA";
      ubicacionTexto = "Tool Crib";
      const restante = (cribData.cantidad || 0) - cantidad;
      if(restante <= 0) await deleteDoc(cribRef);
      else await updateDoc(cribRef, { cantidad: restante });

    } else {
      alert("Origen inválido");
      return false;
    }

    const key = claveMaterial(nombreMaterial);
    const scrapRef = doc(db,"scrap",key);
    const scrapSnap = await getDoc(scrapRef);

    if(scrapSnap.exists()){
      await updateDoc(scrapRef, {
        cantidad: (scrapSnap.data().cantidad || 0) + cantidad,
        pn: (pnMaterial && pnMaterial !== "NO APLICA") ? pnMaterial : (scrapSnap.data().pn || "NO APLICA"),
        ultimaUbicacion: ubicacionTexto,
        responsable: getUser(),
        comentarios,
        fecha: new Date().toLocaleString()
      });
    } else {
      await setDoc(scrapRef, {
        nombre: nombreMaterial, pn: pnMaterial, cantidad,
        ultimaUbicacion: ubicacionTexto,
        responsable: getUser(),
        comentarios,
        fecha: new Date().toLocaleString()
      });
    }

    await addDoc(collection(db,"historial"),{
      fecha: new Date().toLocaleString(),
      accion: "ENVIO SCRAP",
      ubicacion: ubicacionTexto,
      nombre: nombreMaterial,
      cantidad,
      responsable: getUser(),
      comentarios
    });

    await loadCajas(true);
    await loadToolCrib(true);
    await loadScrap(true);
    if(typeof window.showStock === "function") await window.showStock(true);
    if(typeof window.renderRacksPage === "function") await window.renderRacksPage();
    if(typeof window.renderToolCrib === "function") await window.renderToolCrib(true);
    if(typeof window.renderScrap === "function") await window.renderScrap(true);

    alert(`${cantidad} × ${nombreMaterial} enviado(s) a Scrap`);
    return true;

  }catch(e){
    console.error(e);
    alert("Error enviando material a Scrap");
    return false;
  }

};

window.renderScrap = async function(force){

  const tabla = document.getElementById("tablaScrap");
  if(!tabla) return;

  await loadScrap(force);

  let html = "";

  cacheScrap.forEach(m=>{
    html += `
<tr>
<td>${m.nombre || ""}</td>
<td>${(m.pn && m.pn !== "NO APLICA") ? m.pn : "—"}</td>
<td>${m.cantidad || 0}</td>
<td>${m.ultimaUbicacion || ""}</td>
<td>${m.responsable || ""}</td>
<td>${m.comentarios || ""}</td>
<td>${m.fecha || ""}</td>
</tr>`;
  });

  tabla.innerHTML = html || `<tr><td colspan="7" style="color:var(--ink-soft);">Sin materiales en Scrap</td></tr>`;

};

/* =====================
   4) MOVER UNA CAJA COMPLETA de rack/nivel/slot a otro
   Conserva el número/etiqueta de caja (o usa uno nuevo si se indica)
   y todo su contenido; cambia únicamente su ubicación.
   ===================== */
window.moverCajaUbicacion = async function(ubicacionOrigen, rackDestino, nivelDestino, slotDestino, cajaDestinoLabel, comentarios){

  comentarios = comentarios || "NO APLICA";

  if(!ubicacionOrigen || !rackDestino || !nivelDestino || !slotDestino){
    alert("Selecciona la caja de origen y el rack/nivel/slot de destino");
    return false;
  }

  try{

    const origenRef = doc(db,"cajas",ubicacionOrigen);
    const origenSnap = await getDoc(origenRef);
    if(!origenSnap.exists()){ alert("La caja de origen ya no existe"); return false; }

    const dataOrigen = origenSnap.data();
    const etiqueta = normCaja(cajaDestinoLabel || dataOrigen.caja || dataOrigen.ubicacion);

    if(!etiqueta){ alert("Número de caja de destino inválido"); return false; }

    const ubicacionDestino = buildUbicacion(rackDestino, nivelDestino, slotDestino, etiqueta);

    if(ubicacionDestino === ubicacionOrigen){
      alert("El destino es igual al origen");
      return false;
    }

    const destinoRef = doc(db,"cajas",ubicacionDestino);
    const destinoSnap = await getDoc(destinoRef);
    if(destinoSnap.exists()){
      alert("Ya existe una caja con ese número en el slot de destino");
      return false;
    }

    await setDoc(destinoRef, {
      rack: rackDestino,
      nivel: parseInt(nivelDestino),
      slot: parseInt(slotDestino),
      caja: etiqueta,
      ubicacion: ubicacionDestino,
      componentes: dataOrigen.componentes || [],
      estado: dataOrigen.estado || null,
      tamano: dataOrigen.tamano || null,
      capacidad: (typeof dataOrigen.capacidad === "number") ? dataOrigen.capacidad : null
    });

    await deleteDoc(origenRef);

    const totalPiezas = (dataOrigen.componentes || []).reduce((s,x)=> s + (Number(x.cantidad)||0), 0);

    await addDoc(collection(db,"historial"),{
      fecha: new Date().toLocaleString(),
      accion: "MOVIMIENTO CAJA",
      ubicacion: `${ubicacionOrigen} → ${ubicacionDestino}`,
      nombre: "Caja completa",
      cantidad: totalPiezas,
      responsable: getUser(),
      comentarios
    });

    await loadCajas(true);
    if(typeof window.renderRacksPage === "function") await window.renderRacksPage();

    alert(`Caja movida de ${ubicacionOrigen} a ${ubicacionDestino}`);
    return true;

  }catch(e){
    console.error(e);
    alert("Error moviendo la caja");
    return false;
  }

};

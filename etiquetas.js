/* =========================================================
   ETIQUETAS DE CAJA — dibujo (canvas), selección y descarga
   Usa window.getEtiquetas() / window.confirmarEtiquetaFisica()
   definidos en app.js
   ========================================================= */
(function(){

  var FONT = '"Barlow Condensed","Roboto Condensed","Arial Narrow",Arial,sans-serif';
  var W = 1024;

  var seleccion = new Set();
  var filtroPend = false;
  var observador = null;

  /* ---------------- utilidades de dibujo ---------------- */
  function rr(ctx, x, y, w, h, r){
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function fuente(ctx, px){ ctx.font = "700 " + px + "px " + FONT; }

  /* texto que se achica hasta caber; si no cabe ni al mínimo, se corta con … */
  function texto(ctx, t, x, y, maxW, px, minPx, align){
    var s = px;
    fuente(ctx, s);
    while(ctx.measureText(t).width > maxW && s > minPx){ s -= 1; fuente(ctx, s); }
    var out = t;
    if(ctx.measureText(out).width > maxW){
      while(out.length > 1 && ctx.measureText(out + "…").width > maxW) out = out.slice(0, -1);
      out += "…";
    }
    ctx.textAlign = align || "left";
    ctx.fillText(out, x, y);
    return s;
  }

  /* ---------------- la etiqueta ---------------- */
  /* v = objeto de getEtiquetas(); opts = { escala, incluirMov } */
  function dibujarEtiqueta(v, opts){

    opts = opts || {};
    var esc = opts.escala || 1;
    var incluirMov = opts.incluirMov !== false;

    var mats = v.materiales.length ? v.materiales : [{ nombre: "N/A", pn: "N/A", medida: "N/A", cant0: 0, vacio: true }];
    var k = mats.length;
    var multi = k > 1;

    /* encabezado: 4 líneas si hay un material; 2 líneas por material si hay varios */
    var lineas = [];
    if(!multi){
      var m = mats[0];
      lineas.push("Material: " + m.nombre);
      lineas.push("P/N: " + m.pn);
      lineas.push("Medida: " + m.medida);
      lineas.push("Cantidad: " + (m.vacio ? "N/A" : m.cant0 + " UNIDADES"));
    } else {
      mats.forEach(function(m, i){
        lineas.push((i + 1) + ") " + m.nombre);
        lineas.push("    P/N: " + m.pn + "   ·   MEDIDA: " + m.medida + "   ·   CANT: " + m.cant0 + " UNID.");
      });
    }

    var L = lineas.length;
    var lh = !multi ? 46 : (k <= 3 ? 40 : (k <= 6 ? 34 : 29));
    var px = Math.round(lh * 0.84);

    var top = 64;
    var cajaX = 596, cajaY = 52, cajaW = 372, cajaH = 160;
    var hdrH = Math.max(cajaH + 6, L * lh + 14);

    /* tabla */
    var colsBase = multi ? [138, 78, 226, 236, 234] : [170, 0, 262, 266, 214];
    var tabY = top + hdrH + 6;
    var headH = 62;
    var rowH = 66;
    var filas = incluirMov ? v.filas.slice(-24) : [];
    var nFilas = Math.max(5, filas.length);

    var H = tabY + headH + nFilas * rowH + 44;

    var cv = document.createElement("canvas");
    cv.width = W * esc;
    cv.height = Math.round(H * esc);
    var ctx = cv.getContext("2d");
    ctx.scale(esc, esc);

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);

    /* tarjeta */
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,.28)";
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 3;
    rr(ctx, 28, 26, W - 56, H - 56, 34);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.restore();
    rr(ctx, 28, 26, W - 56, H - 56, 34);
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#bdbdbd";
    ctx.stroke();

    ctx.fillStyle = "#111";
    ctx.textBaseline = "alphabetic";

    /* texto del encabezado: mismo tamaño para todas las líneas del mismo tipo */
    function cabe(t, maxW, p, min){
      var q = p; fuente(ctx, q);
      while(ctx.measureText(t).width > maxW && q > min){ q -= 1; fuente(ctx, q); }
      return q;
    }
    var pos = lineas.map(function(t, i){
      var y = top + 28 + i * lh;
      var maxW = (y - px < cajaY + cajaH + 4) ? (cajaX - 20 - 56) : (W - 56 - 56);
      var det = multi && (i % 2 === 1);
      return { t: t, y: y, maxW: maxW, det: det };
    });
    var szTit = px, szDet = Math.round(px * 0.8);
    pos.forEach(function(o){
      if(o.det) szDet = Math.min(szDet, cabe(o.t, o.maxW, szDet, 12));
      else szTit = Math.min(szTit, cabe(o.t, o.maxW, szTit, 12));
    });
    pos.forEach(function(o){
      var sz = o.det ? szDet : szTit;
      texto(ctx, o.t, 56, o.y, o.maxW, sz, Math.min(sz, 12), "left");
    });

    /* CAJA N */
    rr(ctx, cajaX, cajaY, cajaW, cajaH, 28);
    ctx.lineWidth = 7;
    ctx.strokeStyle = "#000";
    ctx.stroke();
    rr(ctx, cajaX + 14, cajaY + 14, cajaW - 28, cajaH - 28, 18);
    ctx.fillStyle = "#000";
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.textBaseline = "middle";
    texto(ctx, "CAJA " + v.cajaTxt, cajaX + cajaW / 2, cajaY + cajaH / 2 + 3, cajaW - 64, 104, 30, "center");
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#111";

    /* encabezado de la tabla */
    var x0 = 56, x1 = W - 56;
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#111";
    ctx.beginPath(); ctx.moveTo(x0, tabY); ctx.lineTo(x1, tabY); ctx.stroke();

    var anchoTot = x1 - x0;
    var sumaCols = colsBase.reduce(function(a, b){ return a + b; }, 0);
    var cols = colsBase.map(function(c){ return c * anchoTot / sumaCols; });
    var xs = [x0];
    cols.forEach(function(c){ xs.push(xs[xs.length - 1] + c); });

    var titulos = ["FECHA", "MAT.", "CANT. EXTRAÍDA", "TOTAL RESTANTE", "FIRMA"];
    for(var i = 0; i < 5; i++){
      if(!multi && i === 1) continue;
      var cx = (xs[i] + xs[i + 1]) / 2;
      ctx.fillStyle = "#111";
      if(i === 2){
        texto(ctx, titulos[i], cx, tabY + 30, cols[i] - 14, 29, 14, "center");
        fuente(ctx, 17);
        ctx.fillStyle = "#333";
        ctx.textAlign = "center";
        ctx.fillText("(  −  sale   +  entra  )", cx, tabY + 52);
        ctx.fillStyle = "#111";
      } else {
        texto(ctx, titulos[i], cx, tabY + 40, cols[i] - 14, 29, 14, "center");
      }
    }

    var yHead = tabY + headH;
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(x0, yHead); ctx.lineTo(x1, yHead); ctx.stroke();

    /* líneas de renglones */
    ctx.lineWidth = 2.5;
    for(var r = 1; r <= nFilas; r++){
      var yy = yHead + r * rowH;
      ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x1, yy); ctx.stroke();
    }

    /* líneas verticales */
    ctx.lineWidth = 2.5;
    for(var c = 0; c < xs.length; c++){
      if(!multi && c === 1) continue;
      if(c === 0 || c === xs.length - 1) continue;
      ctx.beginPath();
      ctx.moveTo(xs[c], tabY + 8);
      ctx.lineTo(xs[c], yHead + nFilas * rowH);
      ctx.stroke();
    }
    if(!multi){ /* sin columna MAT.: no hay línea en xs[1], pero sí entre FECHA y CANT. */
      ctx.beginPath(); ctx.moveTo(xs[2], tabY + 8); ctx.lineTo(xs[2], yHead + nFilas * rowH); ctx.stroke();
    }

    /* movimientos ya registrados (números grandes y legibles) */
    filas.forEach(function(f, idx){
      var yb = yHead + idx * rowH + rowH - 20;
      ctx.fillStyle = "#111";

      texto(ctx, f.fecha || "", (xs[0] + xs[1]) / 2 + (multi ? 0 : -(cols[1] / 2) * 0), yb, (multi ? cols[0] : cols[0] + cols[1]) - 12, 30, 14, "center");

      if(multi){
        var n = mats.findIndex(function(m){ return m.nombre === f.nom; }) + 1;
        texto(ctx, n > 0 ? String(n) : "?", (xs[1] + xs[2]) / 2, yb, cols[1] - 8, 40, 16, "center");
      }

      var signo = f.tipo === "+" ? "+" : "-";
      texto(ctx, signo + f.cant, (xs[2] + xs[3]) / 2, yb, cols[2] - 14, 44, 18, "center");
      texto(ctx, String(f.total), (xs[3] + xs[4]) / 2, yb, cols[3] - 14, 44, 18, "center");
      texto(ctx, String(f.firma || ""), (xs[4] + xs[5]) / 2, yb, cols[4] - 12, 22, 11, "center");
    });

    return cv;
  }

  /* El texto de la fecha en modo simple ocupa la columna 0 y la 1 (que no existe); se centra en ambas.
     Para que xs[1] tenga sentido en modo simple se define con ancho 0 (ver colsBase). */

  function cargarFuentes(){
    try{
      return Promise.all([
        document.fonts.load('700 40px "Barlow Condensed"'),
        document.fonts.load('600 40px "Barlow Condensed"')
      ]).catch(function(){});
    }catch(e){ return Promise.resolve(); }
  }

  function canvasABlob(cv){
    return new Promise(function(res){ cv.toBlob(res, "image/png"); });
  }

  /* ---------------- ZIP (sin librerías) ---------------- */
  var crcTabla = (function(){
    var t = [];
    for(var n = 0; n < 256; n++){
      var c = n;
      for(var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(u8){
    var c = 0xFFFFFFFF;
    for(var i = 0; i < u8.length; i++) c = crcTabla[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function crearZip(archivos){ /* [{nombre, datos:Uint8Array}] */
    var enc = new TextEncoder();
    var partes = [], central = [], offset = 0;
    var d = new Date();
    var dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    var dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();

    archivos.forEach(function(a){
      var nom = enc.encode(a.nombre);
      var crc = crc32(a.datos);
      var h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true);
      h.setUint16(4, 20, true);
      h.setUint16(6, 0x0800, true);
      h.setUint16(8, 0, true);
      h.setUint16(10, dosTime, true);
      h.setUint16(12, dosDate, true);
      h.setUint32(14, crc, true);
      h.setUint32(18, a.datos.length, true);
      h.setUint32(22, a.datos.length, true);
      h.setUint16(26, nom.length, true);
      h.setUint16(28, 0, true);
      partes.push(new Uint8Array(h.buffer), nom, a.datos);

      var c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true);
      c.setUint16(4, 20, true);
      c.setUint16(6, 20, true);
      c.setUint16(8, 0x0800, true);
      c.setUint16(10, 0, true);
      c.setUint16(12, dosTime, true);
      c.setUint16(14, dosDate, true);
      c.setUint32(16, crc, true);
      c.setUint32(20, a.datos.length, true);
      c.setUint32(24, a.datos.length, true);
      c.setUint16(28, nom.length, true);
      c.setUint32(42, offset, true);
      central.push(new Uint8Array(c.buffer), nom);

      offset += 30 + nom.length + a.datos.length;
    });

    var tamCentral = central.reduce(function(s, p){ return s + p.length; }, 0);
    var fin = new DataView(new ArrayBuffer(22));
    fin.setUint32(0, 0x06054b50, true);
    fin.setUint16(8, archivos.length, true);
    fin.setUint16(10, archivos.length, true);
    fin.setUint32(12, tamCentral, true);
    fin.setUint32(16, offset, true);

    return new Blob(partes.concat(central, [new Uint8Array(fin.buffer)]), { type: "application/zip" });
  }

  function descargarBlob(blob, nombre){
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }

  function nombreArchivo(v){
    return ("CAJA " + v.cajaTxt).replace(/[\\/:*?"<>|]/g, "-") + ".png";
  }

  function fechaCarpeta(){
    var d = new Date(), p = function(n){ return String(n).padStart(2, "0"); };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }

  /* ---------------- selección ---------------- */
  function todas(){ return window.getEtiquetas ? window.getEtiquetas() : []; }

  function visibles(){
    var q = (document.getElementById("etqBuscar").value || "").trim().toLowerCase();
    return todas().filter(function(v){
      if(filtroPend && !v.pendiente) return false;
      if(!q) return true;
      if(String(v.cajaTxt).toLowerCase().indexOf(q) >= 0) return true;
      if(String(v.ubicacion || "").toLowerCase().indexOf(q) >= 0) return true;
      return v.materiales.some(function(m){
        return m.nombre.toLowerCase().indexOf(q) >= 0 || String(m.pn).toLowerCase().indexOf(q) >= 0;
      });
    });
  }

  function seleccionadas(){
    var set = seleccion;
    return todas().filter(function(v){ return set.has(v.caja); });
  }

  function actualizarContador(){
    var n = seleccionadas().length;
    var el = document.getElementById("etqContador");
    if(el) el.textContent = n + (n === 1 ? " etiqueta seleccionada" : " etiquetas seleccionadas");
    document.querySelectorAll(".etq-btn-desc").forEach(function(b){ b.disabled = n === 0; });
    document.querySelectorAll(".etq-card").forEach(function(c){
      var on = seleccion.has(c.dataset.caja);
      c.classList.toggle("sel", on);
      var chk = c.querySelector("input[type=checkbox]");
      if(chk) chk.checked = on;
    });
  }

  function numCaja(v){
    var n = parseFloat(String(v.cajaTxt).replace(/[^0-9.]/g, ""));
    return isNaN(n) ? null : n;
  }

  /* ---------------- tarjetas ---------------- */
  function esc(t){
    return String(t).replace(/[&<>"']/g, function(c){
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function incluirMov(){
    var c = document.getElementById("etqIncluirMov");
    return !c || c.checked;
  }

  function pintarPreview(card){
    var caja = card.dataset.caja;
    var v = todas().find(function(x){ return x.caja === caja; });
    if(!v) return;
    cargarFuentes().then(function(){
      var cv = dibujarEtiqueta(v, { escala: 1, incluirMov: incluirMov() });
      cv.className = "etq-canvas";
      var cont = card.querySelector(".etq-prev");
      cont.innerHTML = "";
      cont.appendChild(cv);
    });
  }

  function render(){

    var grid = document.getElementById("etqGrid");
    if(!grid) return;

    var datos = todas();
    var pend = datos.filter(function(v){ return v.pendiente; });

    var aviso = document.getElementById("etqAviso");
    if(aviso){
      if(pend.length){
        aviso.style.display = "flex";
        aviso.querySelector("span").textContent =
          "⚠ " + pend.length + (pend.length === 1 ? " etiqueta debe" : " etiquetas deben") +
          " cambiarse físicamente: " + pend.slice(0, 8).map(function(v){ return "CAJA " + v.cajaTxt; }).join(", ") +
          (pend.length > 8 ? "…" : "");
      } else {
        aviso.style.display = "none";
      }
    }

    var lista = visibles();
    var info = document.getElementById("etqTotal");
    if(info) info.textContent = lista.length + " de " + datos.length + " cajas";

    if(observador) observador.disconnect();
    observador = ("IntersectionObserver" in window) ? new IntersectionObserver(function(es){
      es.forEach(function(e){
        if(e.isIntersecting){ observador.unobserve(e.target); pintarPreview(e.target); }
      });
    }, { rootMargin: "300px" }) : null;

    grid.innerHTML = "";

    if(!lista.length){
      grid.innerHTML = '<p class="etq-vacio">No hay cajas que coincidan.</p>';
      actualizarContador();
      return;
    }

    lista.forEach(function(v){

      var card = document.createElement("div");
      card.className = "etq-card" + (v.pendiente ? " pend" : "");
      card.dataset.caja = v.caja;

      var resumen = v.materiales.length
        ? v.materiales.length + (v.materiales.length === 1 ? " material" : " materiales")
        : "sin material (N/A)";

      card.innerHTML =
        '<div class="etq-head">' +
          '<label class="etq-chk"><input type="checkbox"> <b>CAJA ' + esc(v.cajaTxt) + '</b></label>' +
          '<span class="etq-meta">' + esc(v.ubicacion || "") + ' · ' + resumen + '</span>' +
        '</div>' +
        (v.pendiente
          ? '<div class="etq-alerta"><b>CAMBIAR ETIQUETA FÍSICA</b><ul>' +
            v.motivos.map(function(m){ return "<li>" + esc(m) + "</li>"; }).join("") +
            '</ul><button type="button" class="etq-ok">✔ Ya cambié la etiqueta física</button></div>'
          : '') +
        '<div class="etq-prev"><div class="etq-cargando">Cargando…</div></div>' +
        '<div class="etq-pie"><button type="button" class="etq-uno">⬇ Descargar PNG</button></div>';

      card.querySelector("input").addEventListener("change", function(e){
        if(e.target.checked) seleccion.add(v.caja); else seleccion.delete(v.caja);
        actualizarContador();
      });

      card.querySelector(".etq-uno").addEventListener("click", function(){
        descargarUna(v);
      });

      var ok = card.querySelector(".etq-ok");
      if(ok) ok.addEventListener("click", async function(){
        if(!confirm("¿Confirmas que ya imprimiste y pegaste la etiqueta nueva de la CAJA " + v.cajaTxt + "?\n\nLa tabla de la etiqueta empezará vacía.")) return;
        ok.disabled = true;
        await window.confirmarEtiquetaFisica(v.caja);
      });

      grid.appendChild(card);
      if(observador) observador.observe(card); else pintarPreview(card);
    });

    actualizarContador();
  }

  window.renderEtiquetas = render;

  /* ---------------- descargas ---------------- */
  async function descargarUna(v){
    await cargarFuentes();
    var cv = dibujarEtiqueta(v, { escala: 2, incluirMov: incluirMov() });
    var blob = await canvasABlob(cv);
    descargarBlob(blob, nombreArchivo(v));
  }

  async function generarArchivos(sel, progreso){
    await cargarFuentes();
    var usados = {}, out = [];
    for(var i = 0; i < sel.length; i++){
      var v = sel[i];
      var cv = dibujarEtiqueta(v, { escala: 2, incluirMov: incluirMov() });
      var blob = await canvasABlob(cv);
      var buf = new Uint8Array(await blob.arrayBuffer());
      var nom = nombreArchivo(v);
      if(usados[nom]){ nom = nom.replace(".png", " (" + (++usados[nom]) + ").png"); } else { usados[nom] = 1; }
      out.push({ nombre: nom, datos: buf });
      if(progreso) progreso(i + 1, sel.length);
      await new Promise(function(r){ setTimeout(r, 0); });
    }
    return out;
  }

  function setEstado(t){
    var el = document.getElementById("etqEstado");
    if(el) el.textContent = t || "";
  }

  async function descargarZip(){
    var sel = seleccionadas();
    if(!sel.length){ alert("Selecciona al menos una etiqueta"); return; }
    try{
      var archivos = await generarArchivos(sel, function(a, b){ setEstado("Generando " + a + " de " + b + "…"); });
      var carpeta = "Etiquetas L10 " + fechaCarpeta();
      archivos.forEach(function(a){ a.nombre = carpeta + "/" + a.nombre; });
      descargarBlob(crearZip(archivos), carpeta + ".zip");
      setEstado("✔ " + archivos.length + " etiqueta(s) en " + carpeta + ".zip (descomprime para ver la carpeta)");
    }catch(e){
      console.error(e);
      setEstado("");
      alert("No se pudieron generar las etiquetas");
    }
  }

  async function guardarEnCarpeta(){
    var sel = seleccionadas();
    if(!sel.length){ alert("Selecciona al menos una etiqueta"); return; }
    var dir;
    try{
      dir = await window.showDirectoryPicker({ mode: "readwrite" });
    }catch(e){ return; /* canceló */ }
    try{
      var archivos = await generarArchivos(sel, function(a, b){ setEstado("Guardando " + a + " de " + b + "…"); });
      var sub = await dir.getDirectoryHandle("Etiquetas L10 " + fechaCarpeta(), { create: true });
      for(var i = 0; i < archivos.length; i++){
        var fh = await sub.getFileHandle(archivos[i].nombre, { create: true });
        var w = await fh.createWritable();
        await w.write(archivos[i].datos);
        await w.close();
      }
      setEstado("✔ " + archivos.length + " etiqueta(s) guardadas en la carpeta \"Etiquetas L10 " + fechaCarpeta() + "\"");
    }catch(e){
      console.error(e);
      setEstado("");
      alert("No se pudo guardar en la carpeta. Prueba con la descarga ZIP.");
    }
  }

  /* ---------------- arranque ---------------- */
  function iniciar(){

    var q = document.getElementById("etqBuscar");
    q.addEventListener("input", render);

    document.getElementById("etqSoloPend").addEventListener("change", function(e){
      filtroPend = e.target.checked;
      render();
    });

    document.getElementById("etqIncluirMov").addEventListener("change", function(){
      document.querySelectorAll(".etq-card").forEach(pintarPreview);
    });

    document.getElementById("etqSelVisibles").addEventListener("click", function(){
      visibles().forEach(function(v){ seleccion.add(v.caja); });
      actualizarContador();
    });

    document.getElementById("etqSelNinguna").addEventListener("click", function(){
      seleccion.clear();
      actualizarContador();
    });

    document.getElementById("etqSelRango").addEventListener("click", function(){
      var a = parseFloat(document.getElementById("etqDesde").value);
      var b = parseFloat(document.getElementById("etqHasta").value);
      if(isNaN(a) || isNaN(b)){ alert("Escribe el número de caja inicial y el final"); return; }
      if(a > b){ var t = a; a = b; b = t; }
      var n = 0;
      todas().forEach(function(v){
        var num = numCaja(v);
        if(num !== null && num >= a && num <= b){ seleccion.add(v.caja); n++; }
      });
      setEstado(n ? n + " caja(s) seleccionadas del " + a + " al " + b : "No hay cajas numeradas en ese rango");
      actualizarContador();
    });

    document.getElementById("etqZip").addEventListener("click", descargarZip);

    var bc = document.getElementById("etqCarpeta");
    if(window.showDirectoryPicker){
      bc.addEventListener("click", guardarEnCarpeta);
    } else {
      bc.style.display = "none";
    }

    render();
  }

  window.iniciarEtiquetas = iniciar;

})();

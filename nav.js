/* =========================================================
   MENÚ LATERAL — submenú desplegable de "Movimientos"
   Se incluye en todas las páginas que tienen sidebar.
   ========================================================= */
(function(){

  var PANELES = ["panelMaterial","panelCajas","panelTool","panelScrap"];

  function pagina(){
    return location.pathname.split("/").pop() || "index.html";
  }

  function estaEnMovimientos(){
    return pagina() === "movimientos.html";
  }

  function abrir(abierto){
    var grupo  = document.getElementById("navMov");
    var toggle = document.getElementById("navMovToggle");
    if(!grupo || !toggle) return;
    grupo.classList.toggle("open", !!abierto);
    toggle.setAttribute("aria-expanded", abierto ? "true" : "false");
    try{ sessionStorage.setItem("navMovAbierto", abierto ? "1" : "0"); }catch(e){}
  }

  /* Marca en el submenú cuál es la opción activa */
  window.marcarSubmenuMov = function(panelId){
    document.querySelectorAll("#navMovSub .nav-sub").forEach(function(a){
      a.classList.toggle("active", a.dataset.panel === panelId);
    });
  };

  function panelDesdeHash(){
    var h = (location.hash || "").replace("#","");
    return PANELES.indexOf(h) >= 0 ? h : null;
  }

  document.addEventListener("DOMContentLoaded", function(){

    var grupo  = document.getElementById("navMov");
    var toggle = document.getElementById("navMovToggle");
    if(!grupo || !toggle) return;

    /* estado inicial: dentro de Movimientos siempre abierto;
       en otras páginas se respeta lo que el usuario dejó en esta sesión */
    var abierto = estaEnMovimientos();
    if(!abierto){
      try{ abierto = sessionStorage.getItem("navMovAbierto") === "1"; }catch(e){}
    }
    abrir(abierto);

    /* clic en "Movimientos": solo despliega / pliega las opciones */
    toggle.addEventListener("click", function(e){
      e.preventDefault();
      abrir(!grupo.classList.contains("open"));
    });

    /* clic en una opción */
    document.querySelectorAll("#navMovSub .nav-sub").forEach(function(a){
      a.addEventListener("click", function(e){
        if(estaEnMovimientos() && typeof window.mostrarPanel === "function"){
          e.preventDefault();
          var id = a.dataset.panel;
          window.mostrarPanel(id);
          try{ history.replaceState(null, "", "movimientos.html#" + id); }catch(err){}
        }
        /* en otra página el enlace navega a movimientos.html#panelX */
      });
    });

    if(estaEnMovimientos()){
      window.addEventListener("hashchange", function(){
        var id = panelDesdeHash();
        if(id && typeof window.mostrarPanel === "function") window.mostrarPanel(id);
      });
    }
  });

})();

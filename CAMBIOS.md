# Integración del Rack 3D — L10 ALMACEN

## Qué cambió

La sección **Racks y Cajas** (`racks.html`) ahora muestra el visor 3D en lugar de la
cuadrícula de cajas. El visor **ya no usa datos de ejemplo**: dibuja exactamente los
racks y cajas que existen en Firestore y escribe de vuelta en la misma base.

## Archivos

| Archivo | Estado |
|---|---|
| `racks.html` | Reescrito: visor 3D integrado con el layout, sidebar y permisos del sistema |
| `rack3d.js` | **Nuevo**: motor 3D alimentado por los datos reales |
| `rack3d.css` | **Nuevo**: estilos del visor |
| `app.js` | Ampliado: `entradaRapida`, `salidaRapida`, `isAdminUser`, alimentación del visor |
| Resto de archivos | Sin cambios |

## Cómo está ligado a las otras secciones

- Los **racks** se dibujan con los niveles y slots que tiene cada rack en la colección
  `racks`. Solo aparecen los racks con status `active`.
- Las **cajas** que se ven en cada slot son los documentos reales de la colección
  `cajas`; la etiqueta impresa en la caja es su número real y su tamaño/color depende
  de cuántos componentes contiene (azul = poco, naranja = medio, verde = llena).
- El botón **+** de una caja registra una **ENTRADA** real: actualiza `componentes`
  del documento y escribe en `historial`.
- El botón **−** registra una **SALIDA** real: descuenta stock, borra el componente si
  llega a cero y escribe en `historial`.
- **+ Nueva caja** crea el documento de caja en ese slot (mismo formato de ubicación
  `RACK-NIVEL-SLOT-CAJA`), y **🗑** la elimina (solo admin).
- Todo movimiento se refleja de inmediato en **Inventario**, **Salida**, **Historial**
  y en la tabla de racks, porque se usa el mismo caché y las mismas colecciones.
- El buscador del visor busca por **componente, PN o número de caja** y hace parpadear
  y salir al frente las cajas donde está el material.

## Funciones conservadas

Agregar rack, activar/desactivar, eliminar rack, crear y eliminar cajas, imprimir
etiquetas, ir al formulario de entrada con la ubicación precargada, y la restricción
de administrador (`roberto.figueroa@gdl.fii-na.com`).

(La vista de lista anterior fue eliminada en la Actualización 6.) Antes: el botón *📋 Ver lista* desplegaba la
cuadrícula clásica de cajas por ubicación.

## Navegación del visor

Rack → Nivel/Slot → Caja. Clic para entrar, *Retroceder* para subir un nivel,
*Vista general* para volver al inicio, *⛶ Pantalla completa* (o `Esc` para salir).
Arrastrar gira la cámara; la rueda hace zoom.

---

## Actualización 2

- Se eliminó por completo la sección **Usuarios** (menú y `usuarios.html`).
- Los racks ahora se dibujan **pegados**, compartiendo parales, como en un almacén real.
- En *Racks y Cajas* aparece primero **Almacén 3D** y debajo la tarjeta de **Racks**.
- Nueva barra superior del visor: el HUD y los controles viven en una misma fila
  con `flex-wrap`, así no se encinan ni se cortan. En pantallas angostas se apilan.
- El botón **⛶ Ampliar** está dentro de esa barra y, al estar ampliado, cambia a
  **↩ Vista previa** (también se sale con `Esc`).
- Cada caja tiene un **selector de status**: *Caja con poco contenido*,
  *Contenido medio*, *Caja llena*. Se guarda en el campo `estado` del documento de la
  caja y cambia su tamaño y color en el 3D. Si una caja no tiene status asignado, se
  calcula solo según cuántos componentes contiene.

---

## Actualización 3

- **Autocompletado de materiales en cada caja del 3D:** al escribir el nombre del
  componente en el formulario de una caja, se muestran coincidencias de materiales
  que ya existen en cualquier otra caja del almacén (con su PN si lo tiene). Si
  seleccionas una sugerencia, se llena el nombre y el PN automáticamente. Si no
  seleccionas ninguna pero el nombre coincide exactamente con uno del catálogo, el
  sistema igual reconoce que es el mismo material y le asigna su número de parte al
  guardar, para que se sume como el mismo registro. Si no coincide con nada, se crea
  un material nuevo — igual que ya sucede en el formulario de Entrada normal.
- **Rotación de cajas al ver un slot:** al entrar a un slot, las cajas vuelven a girar
  despacio sobre su propio eje (como antes). Al abrir una caja en específico, la
  rotación se detiene y la caja se endereza para mostrar su etiqueta de frente.
- **Nuevo status "Caja vacía":** además de *Poco contenido*, *Contenido medio* y
  *Caja llena*, ahora puedes marcar una caja como *Caja vacía* desde su selector de
  status. Una caja recién creada sin componentes se muestra como vacía por defecto.
- **Legibilidad de todos los campos de texto del visor:** el buscador principal y los
  campos dentro de cada caja (componente, PN, cantidad, salida) ahora fuerzan color de
  texto claro para que siempre se vea lo que escribes, sin que los estilos generales
  del sitio los opaquen.

---

## Actualización 4

- **Caja girando + contenido en texto al abrir una rejilla:** al entrar a un slot, cada
  caja sigue girando despacio y de forma lateral (horizontal, sobre su propio eje),
  pero ahora la tarjeta con el contenido en texto queda **un poco arriba** de la caja
  y su letrero (no encima), para que se vea la caja rotando debajo del texto. El fondo
  se mantiene oscuro/opaco igual que antes.
- **Cambiar un material de una caja a otra desde el visor 3D:** cada componente listado
  dentro de una caja tiene ahora un botón **↔** junto al de salida (**−**). Pide la caja
  destino y la cantidad, y mueve el registro usando la misma lógica que la nueva
  sección de Movimientos.
- **Nueva sección "Movimientos" (`movimientos.html`, ítem 06 del menú):**
  1. **Material en movimiento entre cajas** — busca un material por nombre, PN o
     número de caja, elige la caja destino (rack/nivel/slot/caja) y la cantidad; el
     material cambia por completo de ubicación en su registro.
  2. **Material en Tool Crib** — envía material desde cualquier caja al Tool Crib
     (nueva colección `toolcrib` en Firestore, un documento por material, agregado
     por nombre y no por caja). Debajo del formulario hay una tabla con todo lo que
     se ha mandado al Tool Crib: material, PN, cantidad acumulada, última caja de
     origen, responsable, comentarios y fecha.
  3. **Mover cajas de rack, nivel o slot** — mueve una caja completa (con todo su
     contenido) a otro rack/nivel/slot, conservando su número o asignándole uno
     nuevo si así se indica.
  Los tres movimientos quedan registrados en **Historial** con sus propias acciones:
  `MOVIMIENTO MATERIAL`, `ENVIO TOOL CRIB` y `MOVIMIENTO CAJA` (el filtro de
  Historial ya incluye estas opciones).
- El menú lateral se reordenó: **06 Movimientos** y **07 Historial** (antes Historial
  era el 06) en todas las páginas.

---

## Actualización 5

- **Cierre de sesión automático por inactividad (20 min):** cualquier página del
  sistema cierra la sesión sola si pasan 20 minutos sin ningún clic, tecla, scroll
  o toque. Se reinicia con cualquier actividad.
- **Deterrentes contra ver el código fuente:** se bloquea el clic derecho, F12,
  Ctrl+U, Ctrl+Shift+I/J/C y Ctrl+S. **Aviso honesto:** esto no puede impedir de
  forma absoluta que alguien vea el código de una página web (cualquier navegador
  permite abrir sus herramientas de desarrollo desde su propio menú); solo
  desalienta el acceso casual. La protección real de la base de datos depende de
  las **Reglas de Seguridad de Firestore** en la consola de Firebase, que están
  fuera de este código y conviene revisar aparte. Copiar y pegar texto normal
  sigue funcionando sin restricción.
- **Legibilidad garantizada en el visor 3D:** todos los textos de las tarjetas,
  el buscador, los botones y las etiquetas del visor 3D ahora tienen sombra y
  color reforzado para que siempre resalten sobre el fondo, sin importar qué
  tan claro se vea detrás.
- **Etiqueta del modelo 3D actualizada:** ahora dice
  `MODELO DE ALMACÉN · N cajas · N materiales distintos en el área · N materiales distintos en Tool Crib`.
- **Tool Crib — enviar con o sin caja:** al mandar material a Tool Crib ahora
  eliges si conservas la caja en el rack o si te la llevas también (liberando el
  espacio). Si la caja tiene otro material, el sistema no te deja llevártela
  vacía: te ofrece reubicar automáticamente ese material sobrante a otra caja
  primero.
- **Regresar material del Tool Crib:** nuevo bloque en Movimientos → *Mandar
  material a Tool Crib* para regresar todo o solo una parte del material,
  hacia una caja ya existente o hacia una caja nueva (con su propio rack,
  nivel, slot, número y capacidad).
- **Nueva sección "Mandar material a Scrap"** dentro de Movimientos: envía
  material a Scrap desde cualquier caja o desde el Tool Crib; incluye su
  propia tabla acumulada por material. Queda en Historial como `ENVIO SCRAP`
  (y el regreso de Tool Crib como `REGRESO TOOL CRIB`).
- **Movimientos ahora tiene un menú a la izquierda con 4 opciones** que
  cambian el panel de la derecha: *Mover Material de una caja a otra*,
  *Mover cajas de rack, slot o rejilla*, *Mandar material a Tool Crib*
  (incluye el regreso) y *Mandar material a Scrap*.
- **Categoría de materiales:** cada material puede clasificarse como
  *Consumible indirecto*, *Material en SAP*, *Material recibido de Taiwán sin
  registro en SAP*, *Material en validación de Scrap* o *Material en
  validación de envío a Tool Crib*. Se elige al registrar la entrada (en
  Entrada o desde el visor 3D) y se puede cambiar después.
- **Nueva sección "Categorías" (07 en el menú, `categorias.html`):**
  buscador inteligente, filtro por categoría (con chips de resumen), edición
  de categoría en línea, y botones para mandar cada material a Tool Crib o a
  Scrap directamente desde ahí. También hay un botón para ver todo lo de una
  categoría resaltado en el modelo 3D.
- **Búsqueda por categoría en el visor 3D:** el mismo buscador de siempre
  ahora también encuentra cajas por categoría de material, y desde Categorías
  puedes saltar directo a esa búsqueda en el 3D.
- **Tamaño/capacidad de cada caja:** al crear una caja nueva se puede definir
  su capacidad de espacio; cada material que se le agrega puede llevar cuánto
  espacio ocupa, y la tarjeta de la caja muestra una barra con el espacio
  usado contra el total.
- El menú lateral se reordenó otra vez: **07 Categorías** y **08 Historial**
  (antes Historial era el 07) en todas las páginas.

---

## Actualización 6

- **Movimientos en el menú lateral:** al hacer clic en *Movimientos* se despliega
  un submenú en la barra izquierda (como el de Baking) con las 4 opciones:
  *Material entre cajas*, *Mover cajas / slots*, *Material a Tool Crib* y
  *Material a Scrap*. Ya no hay menú interno dentro de la página de Movimientos;
  la opción elegida se marca en el submenú. Funciona igual desde cualquier página
  (`nav.js` nuevo, incluido en todas las páginas con sidebar).
- **Buscadores con fondo oscuro y letra blanca** (con ícono de lupa) en: Inventario,
  Historial, Registrar Salida, Registrar Entrada (campo Producto), Categorías,
  las tres búsquedas de Movimientos y sus listas de resultados/sugerencias.
- **Arreglo del buscador 3D (blanco sobre blanco):** al hacer clic dentro, el
  estilo global de los campos lo volvía blanco con letra blanca. Ahora el fondo
  se mantiene oscuro también al enfocar; lo mismo en los campos de cada caja
  (componente, PN, cantidad, espacio) y en sus selectores.
- **Encabezado del Modelo de Almacén ordenado:** título limpio y debajo tres
  chips: cajas · materiales distintos en el área · materiales distintos en Tool Crib.
- **Cuatro colores de status** (Caja vacía = rojo, Poco contenido = azul, Contenido
  medio = naranja, Caja llena = verde). La leyenda de abajo a la izquierda ahora
  muestra los cuatro y se pinta desde el mismo código que colorea las cajas, así
  siempre coinciden.
- **Tamaño de caja:** nuevo selector *Tamaño de caja* (Chica / Mediana / Grande)
  debajo del status. Se guarda en el campo `tamano` de la caja y es lo único que
  define su dimensión en el 3D (el status ahora solo cambia el color). Las cajas
  sin tamaño guardado se ven Medianas. Al mover una caja de rack/slot conserva su tamaño.
- **Se eliminó el botón "Ver lista"** del visor 3D (y la vista de lista asociada).

---

## Actualización 7

- **Cajas apoyadas una sobre otra (sin flotar):** en cada slot las cajas se acomodan
  en una rejilla sobre la repisa y, cuando ya no caben en el piso, se colocan
  encima de la caja de abajo. La altura de cada pila se calcula con la altura real
  de cada caja (chica/mediana/grande), así siempre quedan pegadas.
- **Auto-ajustable:** si un slot tiene muchas cajas (15, 30 o más), todas se reducen
  de forma uniforme lo necesario para que quepan dentro del slot sin salirse de la
  repisa ni chocar con el nivel de arriba.
- **Galería al abrir un slot:** las cajas ya no se encimen. Se reparten en una
  rejilla de pantalla: arriba cada caja 3D girando y debajo su tarjeta con el
  contenido, el status, el tamaño y los campos de entrada de siempre. Las columnas
  se ajustan al ancho disponible; con muchas cajas la galería se desplaza con la
  rueda del mouse (las cajas 3D siguen a su tarjeta). Dentro de la galería, las
  proporciones chica/mediana/grande se conservan.
- **Al guardar** algo en una caja la galería conserva la posición del scroll.
- **Detalles:** la tarjeta de inspección de una sola caja ya no se corta por arriba y
  la cantidad de cada componente (campo numérico de salida) ahora se ve.

---

## Actualización 8

- **Cero espacio entre cajas apiladas:** antes había un pequeño margen (6 mm) también
  en la dirección vertical, que a cierta distancia de cámara se veía como un hueco
  entre una caja y la de abajo. Ahora el espaciado vertical es 0: cada caja se apoya
  exactamente en el tope de la de abajo (pegadas de verdad), y el espacio de aire
  queda solo entre columnas/filas vecinas (para distinguir una caja de la de al lado).
- **Galería del slot más espaciada:** más separación entre tarjetas (antes 18px, ahora
  22–26px) y columnas un poco más angostas (230px en vez de 250px), así entran más
  columnas en pantalla y las cajas no se ven encimadas. La caja 3D girando también se
  ve más grande (hasta 210px de alto cuando hay pocas cajas en el slot).
- **Confirmado:** el tamaño de una caja (Chica/Mediana/Grande) es el único que define
  sus dimensiones en el 3D; el status (vacía/poco/medio/llena) solo cambia el color,
  nunca el tamaño — se puede definir al crearla o cambiarla después desde su selector
  "Tamaño de caja", sin depender de si tiene contenido o no.

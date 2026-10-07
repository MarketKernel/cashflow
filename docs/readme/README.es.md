# Cashflow

<!-- languages -->
<h3 align="center">
<a href="../../README.md">🇬🇧 English</a> ·
<a href="README.zh.md">🇨🇳 中文</a> ·
<a href="README.hi.md">🇮🇳 हिन्दी</a> ·
<b>🇪🇸 Español</b> ·
<a href="README.fr.md">🇫🇷 Français</a> ·
<a href="README.ar.md">🇸🇦 العربية</a> ·
<a href="README.bn.md">🇧🇩 বাংলা</a> ·
<a href="README.pt.md">🇧🇷 Português</a> ·
<a href="README.ru.md">🇷🇺 Русский</a> ·
<a href="README.ur.md">🇵🇰 اردو</a> ·
<a href="README.id.md">🇮🇩 Bahasa Indonesia</a> ·
<a href="README.de.md">🇩🇪 Deutsch</a> ·
<a href="README.ja.md">🇯🇵 日本語</a> ·
<a href="README.mr.md">🇮🇳 मराठी</a> ·
<a href="README.te.md">🇮🇳 తెలుగు</a> ·
<a href="README.tr.md">🇹🇷 Türkçe</a> ·
<a href="README.uk.md">🇺🇦 Українська</a>
</h3>
<!-- /languages -->

**Cashflow** lleva el control de tus finanzas personales sin anotar cada gasto. Configuras una
vez tus cuentas, deudas e ingresos y pagos habituales. De vez en cuando **concilias**: escribes
los saldos reales. La aplicación calcula cuánto dinero quedó sin registrar, hace la previsión de
los próximos meses, te dice cuánto dura el dinero y cuándo puedes comprar lo que quieres.

Toda la aplicación es un único archivo HTML independiente que funciona sin conexión: sin cuenta,
sin nube, sin peticiones de red. Los datos son una base de datos SQLite (SQLite compilado a
WebAssembly, dentro del propio archivo) que el navegador guarda en este dispositivo. La misma
página es también una PWA que se puede instalar y se ejecuta en su propia ventana.

![Cashflow: cuentas por moneda, dinero propio, el informe y la previsión](../cashflow.png)

## Cómo usarla

1. Descarga `cashflow-<version>.html` de las releases (o compílala: `./build.sh`) y ábrela en un
   navegador — abrirla desde el disco funciona igual.
2. Elige la moneda base: cada total se muestra en ella. En **Ajustes**, añade las demás monedas
   que tengas, con sus tasas — escritas a mano, la aplicación nunca se conecta a internet.
3. En **Cuentas**, añade tus cuentas (una tarjeta, efectivo, un depósito, una casa de cambio) y
   tus deudas (una tarjeta de crédito, un préstamo, dinero prestado), cada una con su saldo
   actual.
4. Pulsa **Conciliar** (o <kbd>R</kbd>). Cada campo ya contiene el saldo esperado; corrige lo
   que difiera y guarda. La previsión empieza aquí.
5. En **Recurrentes**, añade el salario, el alquiler, las suscripciones, el pago mensual de la
   tarjeta — diario, semanal, mensual o anual. En **Puntuales**, añade lo que las recurrentes no
   cubren: una compra, una bonificación, unas vacaciones planeadas.
6. Cada semana o dos, concilia de nuevo. El informe te dice qué quedó sin registrar, cuánto dura
   el dinero, y las metas en **Metas** te dicen cuándo se pueden comprar.

### En el móvil

Las pestañas pasan a una barra inferior, y los formularios se abren como hojas en la parte baja
de la pantalla; el teclado no tapa el campo que se está escribiendo. Instala la versión online:
en Android, el menú ⋮ de Chrome → Instalar aplicación; en iOS, Compartir → Añadir a pantalla de
inicio. No hay sincronización entre dispositivos: para mover los datos, expórtalos en uno e
impórtalos en el otro (Ajustes → Datos).

## Cómo funciona

### Conciliación

Una conciliación es una fotografía de los saldos reales de todas las cuentas y deudas en un
momento dado. El formulario muestra, para cada cuenta, lo que los registros esperan: el saldo
encontrado la última vez más cada operación desde entonces que pertenece a esa cuenta. Solo
cambias lo que difiera. La fotografía conserva los saldos, los nombres, las comisiones y las
tasas de ese momento, y nunca se recalcula: renombrar una cuenta, archivarla, editar una
operación o cambiar la moneda base deja las conciliaciones pasadas exactamente como estaban.
Solo se puede eliminar la última — para deshacer una conciliación hecha por error.

### De dónde sale el dinero no registrado

Para cada moneda, la aplicación suma lo que esperaba — los saldos encontrados la última vez, los
saldos iniciales de las cuentas creadas desde entonces, y cada operación recurrente y puntual del
intervalo — y lo compara con lo que escribiste. La diferencia es el dinero no registrado: menos
significa un gasto que no se anotó, más un ingreso que no se anotó. Se cuenta por moneda, no
sobre el total en la moneda base, así que un cambio en la tasa de cambio entre dos conciliaciones
no se toma por un gasto. Una cuenta nueva trae consigo su saldo inicial, así que crearla no es un
ingreso sin registrar; archivar una con dinero restante pregunta a dónde fue ese dinero (a otra
cuenta, o gastado) para que tampoco quede nada sin registrar.

### La previsión y "El dinero dura hasta"

La previsión empieza en la última conciliación y suma cada operación desde entonces — eso es lo
"esperado ahora". Desde ahí avanza día a día hasta el horizonte (cinco años por defecto): las
operaciones recurrentes, las puntuales planeadas y, salvo que se desactive, el ritmo medio del
gasto no registrado (el dinero no registrado de las conciliaciones de los últimos 90 días,
dividido entre sus días). El ingreso no registrado no se tiene en cuenta. "El dinero dura hasta"
es el primer momento en que el dinero de las cuentas llega a cero; si el dinero propio (las
cuentas menos las deudas) baja de cero antes, esa fecha aparece en segundo lugar. Si ninguna de
las dos ocurre dentro del horizonte, el informe dice que el dinero dura más — o, si crece, cuánto
al mes. La fecha de una meta es el primer momento en que la previsión alcanza su umbral.

### Las comisiones, y por qué la comisión de una deuda la hace mayor

La comisión de una cuenta es la parte que se pierde al convertir su dinero a la moneda base:
1000 USD en una cuenta con una comisión del 1 % valen 1000 × 41,5 × 0,99 = 41 085 UAH. La
comisión de una deuda funciona al revés — **esta es una decisión por defecto**: devolver una
deuda en otra moneda, o a través de un intermediario, cuesta más que su valor nominal, así que
una deuda de 200 USD con una comisión del 2 % cuenta como 200 × 41,5 × 1,02 = 8466 UAH debidos.
El dinero fuera de las cuentas y los precios de las metas se convierten a la tasa pura.

### Por qué eliminar una operación no cambia el pasado

Una operación recurrente tiene versiones. Editarla cierra la versión vigente en ese momento y
abre una nueva desde ahora; eliminarla solo la cierra. El tiempo desde la última conciliación
sigue contándose con la versión que estaba vigente entonces, así que la siguiente conciliación no
se lleva sorpresas, y las conciliaciones ya hechas nunca cambian. Una operación puntual con fecha
anterior a la última conciliación está en un periodo cerrado: se puede conservar como nota, pero
no cambia nada.

Los intereses de los préstamos no se modelan: añádelos como un gasto recurrente, y el pago en sí
como una transferencia a la deuda.

## Funciones

- Cuentas y deudas agrupadas por moneda, plegables, con el total en la moneda y en la moneda
  base; el dinero propio en letra grande.
- Cualquier código de moneda de 2 a 10 letras y dígitos (USD, EUR, USDT, BTC), con su propio
  número de decimales; los importes son enteros en unidades mínimas, así que no hay deriva de
  redondeo.
- Importes escritos con coma o punto, espacios o apóstrofos entre los miles, y aritmética
  sencilla: `1200+350-50*2`.
- Operaciones recurrentes diarias (con una hora), semanales, mensuales (un día, o el último día)
  o anuales, vigentes desde un momento y hasta una fecha; el 31 en un mes corto es su último día,
  y el 29 de febrero en un año común es el 28. Las horas son locales, así que una operación diaria
  a las 09:00 se mantiene a las 09:00 pese al cambio de hora.
- Operaciones puntuales con un formulario rápido: el cursor en el importe, Enter guarda, la
  última cuenta usada.
- Transferencias entre cuentas en monedas distintas, con el importe acreditado; una transferencia
  a una deuda la salda.
- El gráfico de previsión para una semana, un mes, 3 o 6 meses o un año: dinero propio, dinero en
  las cuentas, la línea de cero y las metas; una mira con los valores, y los mismos números en
  una tabla.
- Metas que se compran "con dinero de sobra" (el dinero propio al menos el precio más un margen)
  o "como parte" (el precio como mucho una parte del dinero propio); Comprado registra el gasto.
- Una conciliación pasada abre la pestaña Cuentas tal como estaba, con lo que esperaba y lo que
  encontró, y lo que se registró en el intervalo.
- Exportación e importación como JSON o como el propio archivo SQLite; en Chrome y Edge, una
  copia automática escrita en un archivo de tu elección tras cada cambio.
- "Nueva base de datos…" en Ajustes: todo se reemplaza por una base de datos vacía, tras una
  advertencia que ofrece una exportación y, si hay un PIN, lo pide.
- Un PIN de cuatro dígitos para la base de datos, pedido al crearla: la página no muestra nada
  hasta que se escribe, y cada PIN incorrecto duplica la pausa antes del siguiente intento,
  desde un segundo hasta una hora.
- Temas claro y oscuro, 17 idiomas, de derecha a izquierda para árabe y urdu, un diseño para
  móvil.

## Atajos de teclado

| Tecla | Qué hace |
| --- | --- |
| <kbd>R</kbd> | Conciliar |
| <kbd>N</kbd> | Una cuenta, operación recurrente o meta nueva en la pestaña abierta; el importe del formulario rápido en Puntuales |
| <kbd>Enter</kbd> | En un formulario: el siguiente campo; en el último, guarda |
| <kbd>Esc</kbd> | Cierra el diálogo |

En una pantalla táctil las indicaciones de teclas no se muestran.

## Seguridad y privacidad

- Nada sale de la página. La Content Security Policy en `src/app/template.html` tiene
  `default-src 'none'` y `connect-src 'none'`; WebAssembly está permitido para SQLite
  (`'wasm-unsafe-eval'`), `blob:` para la descarga de la exportación. La compilación se detiene
  ante cualquier `src` o `href` externo, y la CI lo vuelve a comprobar.
- Los datos viven en el IndexedDB de este navegador: un registro con los bytes de la base de
  datos SQLite, escrito entero tras cada cambio, para que un guardado nunca quede a medias.
  `localStorage` solo guarda el idioma, el tema, la pestaña abierta, los grupos plegados, el
  periodo del gráfico y la pausa tras un PIN incorrecto.
- Leer la base de datos o un archivo importado comprueba cada campo: un valor corrupto se
  sustituye por su valor por defecto en lugar de detener la aplicación.
- Tras el primer guardado la aplicación pide al navegador que conserve su almacenamiento
  (`navigator.storage.persist()`), para que un disco con poco espacio no se quede con los datos.
- El PIN mantiene fuera a alguien frente a un ordenador desbloqueado, no a quien copie los
  archivos del navegador: los datos no están cifrados. Solo se guarda su hash (PBKDF2 con una
  sal), entre los ajustes de la base de datos, así que una exportación lo lleva consigo y pide
  el mismo PIN dondequiera que se importe. Un PIN olvidado no se puede recuperar: "¿Olvidaste el
  PIN?" elimina la base de datos y empieza una nueva, vacía.

## Traducciones

El texto en inglés se queda en el código: `t('accounts', 'Reconcile')`, `tn('time', '{count} day
ago', '{count} days ago', n)`, y `data-i18n="context"` / `data-i18n-attr="context"` en la
plantilla. El primer argumento es el contexto — la parte de la interfaz a la que pertenece una
cadena, así la misma palabra en inglés puede traducirse de forma distinta en dos lugares. Un
diccionario, `src/locales/<code>.json`, asocia contexto → texto en inglés → traducción:

```json
{
  "accounts": { "Reconcile": "Сверить" },
  "time": { "{count} days ago": { "one": "{count} день назад", "few": "{count} дня назад", "many": "{count} дней назад", "other": "{count} дня назад" } }
}
```

Una cadena que falta en el diccionario se muestra en inglés. Un texto con un número tiene una
forma por cada categoría plural del idioma (`Intl.PluralRules`), indexada por la forma plural en
inglés. `npm run i18n` lista, por idioma, las cadenas aún no traducidas y las que ya no se usan;
`npm test` comprueba que cada traducción conserva los marcadores en inglés y tiene todas las
formas plurales. El nombre "Cashflow" nunca se traduce.

Este README también está traducido: `docs/readme/README.<code>.md`, uno por idioma, con la lista
de idiomas al principio de cada uno. Un cambio aquí debe reflejarse también en las traducciones.

## Compilación

```sh
./build.sh            # instala las dependencias si hace falta, y luego compila build/cashflow.html
npm install
npm run build         # -> build/cashflow.html y build/pages/
npm run watch         # recompila con los cambios en src/
npm run typecheck     # tsc --noEmit
npm test              # money, valuation, schedules, reconciliation, forecast, goals, state, SQLite, dictionaries
npm run test:browser  # la página compilada y la PWA en Chrome sin interfaz
npm run i18n          # cadenas que faltan o sobran en cada diccionario
npm run check         # typecheck, test, build y test:browser seguidos
npm run shots -- shots/after  # compila y luego hace capturas de cada pestaña en shots/after
node tools/icons.mjs  # los iconos PNG de la PWA a partir de assets/icon.svg
```

`build.mjs` empaqueta `src/app/main.ts` con esbuild en una IIFE — el WebAssembly de SQLite entra
como bytes mediante el cargador binario de esbuild — y lo sustituye, junto con los estilos y el
icono (un data URI), en `src/app/template.html`. El resultado es `build/cashflow.html`, de
alrededor de 1,4 MB: la mayor parte SQLite, y luego los 16 diccionarios.

La misma ejecución escribe `build/pages/`: esa página como PWA instalable — `index.html` con un
enlace al manifest y un `<meta name="service-worker">` que le indica a la página que registre su
worker, `manifest.webmanifest`, los iconos y `sw.js`, que guarda la página en caché para que se
abra sin conexión.

`tests/app.mjs` controla la página compilada en Chrome sin interfaz mediante el protocolo
DevTools (`tools/chrome.mjs`, sin dependencias): el primer arranque, las cuentas de los ejemplos
del enunciado y sus totales, dos conciliaciones con una semana de diferencia con −1500 sin
registrar, eliminar una operación sin cambiar el historial, una conciliación pasada, metas,
exportar → borrar → importar, la PWA sin conexión y su actualización, un móvil, y la página
abierta desde el disco conservando sus datos. No se espera al tiempo: un script colocado antes
que el de la propia página sustituye `Date.now()`, y la zona horaria es Europe/Kyiv, así que
también se prueba una semana con cambio de hora.

## Versiones y releases

La versión se escribe en un solo lugar, `package.json`. La compilación la coloca en la página (al
pie de los ajustes) y en el nombre de caché de la PWA. Una compilación del commit etiquetado
`v<version>` la muestra tal cual; cualquier otra añade su commit, `0.1.0+1a2b3c4`, para que una
página de `main` no se confunda con la release.

```sh
npm version minor           # 0.1.0 -> 0.2.0: package.json, package-lock.json, un commit y la etiqueta v0.2.0
git push --follow-tags      # la etiqueta arranca .github/workflows/release.yml
```

El workflow de release se detiene si la etiqueta y `package.json` no coinciden, y luego adjunta
`cashflow-<tag>.html` y `SHA256SUMS.txt`.

## GitHub Pages

`.github/workflows/pages.yml` compila y prueba cada push a `main` y despliega `build/pages/` en
GitHub Pages (Settings → Pages → Source: GitHub Actions). Los datos de la versión online
pertenecen a su dirección; una copia abierta desde el disco tiene sus propios datos.

Cada despliegue cambia el nombre de caché en `sw.js`, así que el navegador recoge el nuevo worker
por sí solo — al arrancar con conexión, cada pocas horas mientras la aplicación está abierta, o
cuando Ajustes → Buscar actualizaciones lo pide. El nuevo worker descarga su versión en una caché
propia y espera; el que está en marcha sigue sirviendo la página antigua, también sin conexión.
Los ajustes, con un punto en su pestaña, dicen entonces "La versión … está lista": Actualizar
guarda lo que está esperando, deja entrar al nuevo worker y recarga la página, que avisa una vez
de que se ha actualizado. Sin pulsar el botón, la nueva versión arranca en cuanto se han cerrado
todas las ventanas de la aplicación. Un archivo descargado se queda con la versión que tiene; para
una versión fija en el disco, toma `cashflow-<tag>.html` de una release y compárala con
`SHA256SUMS.txt`.

## Estructura

```
src/core/             sin DOM: las pruebas lo ejecutan en Node
  money.ts            unidades mínimas; lectura de importes escritos y aritmética; formato en un idioma
  valuation.ts        cuentas y deudas en la moneda base, con comisiones
  schedule.ts         cuándo ocurre una operación recurrente, en hora local
  flows.ts            operaciones como movimientos de dinero entre cuentas y monedas
  reconcile.ts        saldos esperados y reales, la fotografía, el dinero no registrado y su ritmo
  forecast.ts         la curva por delante, cuándo se acaba el dinero, cuándo se alcanza un umbral
  goals.ts            el umbral, el progreso y la fecha de una meta
  pin.ts              el PIN de la base de datos: su hash salado, su comprobación, la pausa tras los incorrectos
  state.ts            los tipos del estado, comprobación de lo leído, migraciones de documentos antiguos
  db.ts               el estado en SQLite: el esquema y sus migraciones, una transacción por guardado
  sqlite.ts           sql.js con su WebAssembly incrustado
  i18n.ts             t()/tn(), la lista de idiomas, traducción del marcado de la página
src/app/              la página: el archivo único y la PWA
  template.html       marcado con los marcadores __STYLES__/__APP__/__ICON__, la CSP
  styles.css          paleta, temas claro y oscuro, el diseño para móvil
  main.ts             arranque, pestañas, dibujo, atajos
  store.ts            el estado en memoria, guardado en SQLite e IndexedDB un instante después de cada cambio
  storage.ts          IndexedDB: los bytes de la base de datos, el handle de archivo de la copia automática; persist()
  lock.ts             la pantalla que pide el PIN, la pregunta de una base de datos nueva, su tarjeta en Ajustes
  prefs.ts            localStorage: idioma, tema, pestaña, grupos plegados, periodo del gráfico
  accounts.ts         la pestaña Cuentas, el informe, el historial, una conciliación pasada
  account-dialog.ts   crear, editar, archivar y eliminar cuentas y deudas
  reconcile-form.ts   el formulario de conciliación
  recurring.ts        la pestaña Recurrentes y su formulario; versiones de las operaciones
  oneoff.ts           la pestaña Puntuales y su formulario rápido
  op-fields.ts        los campos que comparten las operaciones: tipo, importe, cuenta o moneda, transferencia
  goals.ts            la pestaña Metas, Comprado
  chart.ts            el gráfico de previsión, SVG escrito a mano
  settings.ts         la pestaña Ajustes: monedas y tasas, previsión, idioma, tema, datos, PIN
  backup.ts           exportación e importación (JSON y SQLite), la copia automática
  update.ts           las actualizaciones de la PWA
  ui.ts, dom.ts       diálogos, avisos, campos; construcción del DOM
  format.ts, inputs.ts  importes y fechas en el idioma de la interfaz; el campo de importe
src/pwa/sw.js         el service worker de la compilación de Pages
src/locales/          un diccionario por idioma
assets/               el icono; pwa/, sus tamaños PNG para la PWA
tests/                pruebas unitarias del núcleo con los números fijos del enunciado; app.mjs, la página en Chrome
tools/                load.mjs, chrome.mjs, i18n.mjs, shots.mjs, sample.mjs, icons.mjs
docs/                 la captura de arriba; readme/, este README en los demás idiomas
build/                el resultado de la compilación; build/pages/ es la PWA para GitHub Pages
```

## Limitaciones

- No hay sincronización entre dispositivos: los datos se quedan en el navegador donde se
  introdujeron. Moverlos es una exportación en un dispositivo y una importación en el otro.
- Las tasas de cambio se escriben a mano: la aplicación nunca se conecta a internet por ellas.
- Una página abierta desde el disco conserva sus datos en el almacenamiento de ese navegador para
  archivos locales. Chrome y Edge lo conservan (las pruebas del navegador lo comprueban); Firefox
  y Safari normalmente también, pero algunas configuraciones y las ventanas privadas no — la
  página entonces lo avisa arriba y funciona solo en memoria: exporta los datos, o usa la
  aplicación instalada.
- Los intereses de los préstamos no se modelan; son un gasto recurrente que añades tú.
- Cada meta se mide por separado: comprar una no se descuenta de las demás.

## Licencia

MIT — ver [LICENSE](../../LICENSE). sql.js (SQLite compilado a WebAssembly) tiene licencia MIT;
el propio SQLite es de dominio público.

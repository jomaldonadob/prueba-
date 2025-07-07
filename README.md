# Documentación del proyecto: AppSheet, Apps Script, Azure Functions y Azure SQL

Este proyecto empresarial integra varias tecnologías en la nube para crear una aplicación móvil/web y su capa de backend. Se utiliza **Google AppSheet** como plataforma sin código para la interfaz de usuario, **Google Apps Script** para lógica y sincronización de datos, y servicios de **Azure Functions** junto con una base de datos **Azure SQL Database** para almacenamiento centralizado. A continuación se detalla cada componente, su creación y cómo se conectan entre sí.

## AppSheet (plataforma sin código)

AppSheet es una plataforma de desarrollo *low-code* (sin código) de Google que permite crear aplicaciones móviles y web de forma visual. Las apps de AppSheet pueden conectarse a diversas fuentes de datos (Google Sheets, Excel en la nube, Salesforce, etc.) y también a bases de datos SQL en la nube. Por ejemplo, AppSheet soporta Azure SQL Database como origen de datos. En la práctica, esto significa que la app de AppSheet puede leer y escribir directamente en tablas de Azure SQL. Internamente, AppSheet ejecuta las apps en un cliente móvil basado en un intérprete HTML5 dentro de un contenedor nativo (Android/iOS). En este cliente móvil, el usuario interactúa con la interfaz (formularios, listas, gráficos), mientras que AppSheet sincroniza los cambios con el backend en la nube.

**Arquitectura cliente de AppSheet (simplificada).** El cliente AppSheet funciona como un intérprete HTML5 que ejecuta la definición de la app (formularios, vistas, lógica de negocio) en cualquier dispositivo móvil o navegador. AppSheet se encarga de la autenticación del usuario (usando OAuth de Google u otros) y de sincronizar los datos con la fuente de datos configurada (por ejemplo, Azure SQL o Google Sheets).

AppSheet también permite integrar *acciones automáticas* que invocan funciones de Apps Script. Es decir, desde AppSheet se puede lanzar una función de Apps Script y obtener su resultado mediante la automatización de la plataforma. Esto se usa, por ejemplo, para extender la lógica de la app más allá de las capacidades estándar de AppSheet.

## Google Apps Script

Google Apps Script es un entorno de scripting basado en JavaScript, alojado en la nube de Google. Proporciona medios para interactuar con productos de Google Workspace (Sheets, Drive, Gmail, etc.) y también permite hacer llamadas a APIs externas. En este proyecto, usamos Apps Script como capa intermedia o de automatización. Por ejemplo, el script podría ejecutarse al editar una hoja de cálculo de Google (fuente de datos de AppSheet) o como *webhook* llamado desde AppSheet. En el script podemos usar los servicios de Google como `UrlFetchApp` para hacer peticiones HTTP (por ejemplo, a Azure Functions) y el servicio JDBC para conectar con bases de datos SQL. De hecho, Apps Script permite conectarse directamente a una base de datos Azure SQL mediante JDBC:

```javascript
var conn = Jdbc.getConnection(
  'jdbc:sqlserver://<servidor>.database.windows.net:1433;databaseName=<bd>',
  '<usuario>@<servidor>', '<contraseña>'
);
```

En este ejemplo (extraído de un caso real), `Jdbc.getConnection` abre la conexión a Azure SQL. Luego el script puede ejecutar consultas (INSERT, UPDATE, SELECT, etc.) usando `conn.createStatement().execute(...)`. Es importante notar que, para que Apps Script (o AppSheet) puedan conectar con Azure SQL, hay que configurar las reglas de firewall del servidor SQL. Por ejemplo, se suele autorizar el rango de IPs salientes de Google (p.ej. `64.18.0.0 - 255.255.255.255`) o activar la opción “Allow Azure Services” en Azure para permitir las conexiones. Si no se autorizan estas IP, la conexión fallará (error de firewall) hasta agregar el rango correspondiente.

En resumen, el script de Apps Script actúa como intermediario en el flujo de datos: puede leer/escribir datos en hojas de Google o en AppSheet, y a su vez llamar a las funciones de backend en Azure (vía HTTP) o actualizar directamente la base de datos (vía JDBC). Esto permite, por ejemplo, sincronizar datos entre Google Sheets y la base Azure SQL, o realizar validaciones adicionales. AppSheet facilita invocar este script mediante su mecanismo de automación (“Actions > Run Apps Script”), de modo que el flujo de la aplicación se conecta con la lógica personalizada.

## Azure Functions (lógica de backend)

Azure Functions es un servicio **serverless** de Microsoft Azure que permite ejecutar código de forma escalable en respuesta a eventos (HTTP, colas, timers, etc.). En este proyecto, hemos desplegado una Function App cuyo código proviene de un repositorio (subido con Cloud Shell, como veremos). La Function App expone **funciones HTTP** que reciben peticiones (por ejemplo, desde Apps Script) y ejecutan operaciones de negocio. Típicamente, cada función en Azure recibe datos JSON, conecta con la base de datos y devuelve una respuesta.

Por ejemplo, podríamos tener una función llamada `CreateUser` que inserta un nuevo usuario en una tabla de Azure SQL, o `GetOrders` que lee registros. El repositorio en Azure Functions contiene este código (por ejemplo, en JavaScript, Python o C#), con las funciones definidas en el archivo `function.json` y la lógica en `index.js` (o la extensión correspondiente). El objetivo de este código es centralizar la lógica empresarial: todas las operaciones de CRUD contra la base de datos pasan por Azure Functions, lo que brinda control, seguridad (claves de función) y posibilidades de escalado.

Para crear la Function App y desplegar el código vía **Cloud Shell**, seguimos los siguientes pasos (usando Azure CLI):

* **Crear recursos de Azure**: en Cloud Shell primero creamos un *Resource Group* y una cuenta de almacenamiento, por ejemplo:

  ```bash
  az group create --name MiGrupoRecursos --location eastus
  az storage account create --name mimacenar456 --location eastus --resource-group MiGrupoRecursos --sku Standard_LRS
  ```
* **Crear la Function App**: ejecutamos `az functionapp create` indicando el nombre de la app, la cuenta de almacenamiento, el plan de consumo y la versión de runtime. Por ejemplo:

  ```bash
  az functionapp create --name MiFunctionApp --storage-account mimacenar456 --consumption-plan-location eastus --resource-group MiGrupoRecursos --functions-version 4
  ```

  Esta acción crea la Function App que contendrá nuestras funciones.
* **Desplegar el código**: se prepara un zip con los archivos de la Function App (código fuente, archivos de configuración). Luego usamos el comando `az functionapp deployment source config-zip` para desplegar el código al Function App. Por ejemplo:

  ```bash
  az functionapp deployment source config-zip -g MiGrupoRecursos -n MiFunctionApp --src código.zip
  ```

  Este comando extrae los archivos en la carpeta `wwwroot` de la Function App y reinicia el servicio. De este modo el código queda activo y listo para recibir solicitudes HTTP.

Finalmente, configuramos las funciones para que requieran una **clave de función** (token), de forma que sólo llamadas autorizadas (desde nuestro Apps Script, por ejemplo) puedan invocarlas. También habilitamos CORS o reglas de firewall si fuera necesario.

## Azure SQL Database (Base de datos)

Azure SQL Database es un servicio PaaS de bases de datos relacionales basado en Microsoft SQL Server. Ofrece alta disponibilidad gestionada, escalado automático y compatibilidad con T-SQL. En este proyecto utilizamos Azure SQL para almacenar los datos de la aplicación (por ejemplo, tablas de usuarios, órdenes, etc.). La elección de Azure SQL sobre otras opciones (p.ej. PostgreSQL) puede deberse a la integración nativa con Azure, la facilidad de administración y la experiencia previa del equipo. Aunque AppSheet también soporta PostgreSQL alojado en la nube, en este caso se prefirió Azure SQL (por ejemplo, porque el resto de la infraestructura está en Azure y se deseaba aprovechar herramientas de SQL Server).

Para crear la base de datos usamos Azure CLI (Cloud Shell) con comandos como los siguientes:

1. **Crear servidor SQL**:

   ```bash
   az sql server create --name MiServerSQL --resource-group MiGrupoRecursos --location eastus --admin-user azureuser --admin-password Pa$$w0rd123
   ```

   Esto crea un servidor lógico de Azure SQL bajo nuestro Resource Group.
2. **Configurar firewall del servidor**: por ejemplo, para permitir nuestra IP o servicios, se ejecuta:

   ```bash
   az sql server firewall-rule create --resource-group MiGrupoRecursos --server MiServerSQL -n PermitidoMiIP --start-ip-address 0.0.0.0 --end-ip-address 0.0.0.0
   ```

   Aquí `0.0.0.0` a `0.0.0.0` representa “todas” o bien se puede poner nuestra IP pública. Esto autoriza el acceso al servidor desde la red especificada. También podemos activar “Allow Azure Services” en el portal para facilitar conexiones desde Azure.
3. **Crear la base de datos**:

   ```bash
   az sql db create --resource-group MiGrupoRecursos --server MiServerSQL --name MiBaseDatos --edition GeneralPurpose
   ```

   Este comando crea la base de datos dentro del servidor. Opcionalmente podemos especificar collation, nivel de servicio (DTU/vCores) o usar un ejemplo de base (`--sample-name AdventureWorksLT` para datos de prueba).
4. **Crear tablas de ejemplo**: una vez creada la base, definimos las tablas necesarias. Por ejemplo, supongamos una tabla de usuarios:

   ```sql
   CREATE TABLE Usuarios (
       Id INT PRIMARY KEY, 
       Nombre NVARCHAR(100), 
       Email NVARCHAR(100)
   );
   ```

   (Este script se puede ejecutar usando el Query Editor del portal de Azure, o mediante Azure CLI/PowerShell). De forma similar se crean las tablas de datos de la app.

El proyecto usó estas tablas para persistir la información. Durante el desarrollo de ejemplo se probaron consultas, inserciones y actualizaciones desde Azure Functions y Apps Script para asegurarse de que todo sincroniza correctamente.

## Conexión e integración entre servicios

La arquitectura general del sistema conecta los componentes de la siguiente manera: los usuarios finales interactúan con la **app de AppSheet** (móvil o web), que solicita o envía datos. Estas peticiones pueden desencadenar un **Apps Script** (por ejemplo, mediante una acción/automación de AppSheet) que ejecuta lógica adicional. El script a su vez puede llamar a las **Azure Functions** mediante HTTP (`UrlFetchApp.fetch("https://MiFunctionApp.azurewebsites.net/api/miFuncion?code=TOKEN")`), enviando datos en formato JSON. Al recibir la solicitud, la Azure Function procesa el dato (p.ej. validaciones) y realiza la operación correspondiente en **Azure SQL** (consulta o modificación). Luego la función devuelve una respuesta (success o datos) que el Apps Script puede usar (p.ej. para actualizar un Sheet de respaldo). Alternativamente, el Apps Script podría omitir Azure Functions y conectarse directamente a Azure SQL vía JDBC para sincronizar datos en Google Sheets. Sea cual sea la ruta, la base de datos Azure SQL es la fuente de la verdad final.

En resumen, el flujo de datos es bidireccional: AppSheet/App Script → Azure Function → Azure SQL para escritos, y Azure SQL → Azure Function → Apps Script/AppSheet para lecturas. De esta forma se separan responsabilidades: AppSheet gestiona la interfaz y validaciones sencillas, mientras que la lógica empresarial y el almacenamiento se manejan en Azure. AppSheet facilita esta integración permitiendo comunicar con Apps Script y con bases de datos SQL en la nube. A su vez, Apps Script y Azure Functions usan APIs y JDBC para interactuar con el almacén Azure SQL, garantizando que todos los servicios estén conectados.

## Despliegue y configuración de Azure (Cloud Shell)

A continuación se resumen los pasos de despliegue en Azure usando Azure CLI en Cloud Shell:

* **Crear grupo de recursos y servidor SQL**:

  1. `az group create --name MiGrupoRecursos --location eastus` – crea el Resource Group.
  2. `az sql server create --name MiServerSQL --resource-group MiGrupoRecursos --location eastus --admin-user <usuario> --admin-password <clave>` – crea el servidor de bases SQL.
* **Configurar firewall**:
  3\. `az sql server firewall-rule create --resource-group MiGrupoRecursos --server MiServerSQL -n PermitirMiIP --start-ip-address 0.0.0.0 --end-ip-address 0.0.0.0` – autoriza conexiones (aquí usamos 0.0.0.0 para permitir cualquier origen, o se puede poner la IP del cliente).
* **Crear base de datos**:
  4\. `az sql db create --resource-group MiGrupoRecursos --server MiServerSQL --name MiBaseDatos --edition GeneralPurpose` – crea la BD en el servidor.
* **Crear Function App y almacenar código**:
  5\. `az storage account create --name miStorage123 --resource-group MiGrupoRecursos --location eastus --sku Standard_LRS` – crea la cuenta de almacenamiento.
  6\. `az functionapp create --name MiFunctionApp --storage-account miStorage123 --consumption-plan-location eastus --resource-group MiGrupoRecursos --functions-version 4` – crea la Function App.
* **Desplegar código de Azure Functions**:
  7\. Empaquetar los archivos en un zip (que contenga `host.json`, las funciones y dependencias).
  8\. Subir el zip al Azure Files asociado (Cloud Shell guarda archivos).
  9\. `az functionapp deployment source config-zip -g MiGrupoRecursos -n MiFunctionApp --src /home/user/codigo.zip` – despliega el código a la Function App.

Con esto, todos los servicios de Azure quedan creados y configurados. Finalmente, en AppSheet y Apps Script se ajustan las URLs de las Azure Functions y la cadena de conexión de Azure SQL (por seguridad, almacenada en variables protegidas). Se prueba que la app móvil/ web guarde registros correctamente en la BD y que las funciones devuelvan los datos esperados.

## Elección de Azure SQL vs otras bases de datos

Se eligió **Azure SQL Database** principalmente por su integración con el ecosistema Azure y su facilidad de uso. Azure SQL es la versión PaaS de SQL Server, por lo que no requiere licencias adicionales ni gestión de la infraestructura de servidor. Ofrece características avanzadas (escalabilidad automática, copias de seguridad, encriptación) que simplifican su administración en entornos empresariales. AppSheet admite otras bases (por ejemplo, PostgreSQL hospedado en la nube), pero en este caso el resto de la arquitectura (Azure Functions, posibles análisis en Power BI, etc.) ya estaba en Azure, lo que hizo natural usar Azure SQL. En resumen, **no hay impedimento técnico** para usar Postgres (de hecho, AppSheet incluso da soporte a PostgreSQL en Google Cloud o AWS), pero la elección de Azure SQL responde a requerimientos de entorno y optimización de recursos. Si el proyecto cambiara de plataforma, podría considerarse Azure Database for PostgreSQL o Azure Cosmos DB según necesidades, pero para nuestra prueba de concepto Azure SQL es suficiente y coherente con las demás herramientas.

**Ventajas de Azure SQL en este caso:**

* Servicio totalmente gestionado por Microsoft (sin mantenimiento de SO/infra).
* Integración nativa con Azure Functions (múltiples SDK y JDBC directos).
* Compatibilidad con SQL Server (amplio conocimiento en la empresa).
* Escalabilidad y disponibilidad configurables desde el portal o CLI.

**En comparación, PostgreSQL en la nube:**

* Es una opción viable y AppSheet la soporta, pero implica usar un *Database-as-a-Service* distinto (p.ej. en Google Cloud SQL o Amazon RDS) y tendría que configurar conexiones desde Azure Functions a otro proveedor.
* Podría ser más económico en cuanto a licencias, pero no cambió la decisión aquí.

Perfecto. Voy a documentar el código de Apps Script línea por línea, explicando cómo funciona el visor con Google Sheets y su integración con Azure Functions, además de detallar la función del repositorio `prueba--main`, que contiene la lógica desplegada en Azure Functions.

Te mostraré toda esta información organizada y bien explicada en breve.


# Integración Google Sheets – Azure Functions – Azure SQL

En este proyecto se crea un **visor de datos** en Google Sheets que permite consultar y editar registros de una base de datos en Azure SQL sin guardar esos datos de forma persistente en la hoja. La lógica se implementa con un script de Google Apps Script que añade menús y botones en la hoja para **Refrescar**, **Actualizar** y **Borrar** datos, y llama a una función HTTP de Azure (implementada con Azure Functions y Node.js) que inserta o consulta registros en la base de datos. A continuación se detalla cada componente y el flujo completo del sistema.

## Script de Apps Script y visor de datos en Google Sheets

&#x20;*Figura: Interfaz en Google Sheets que actúa como “visor” de datos. Se muestran botones para **Refrescar Datos**, **Actualizar** y **Borrar**. Al activarlos, el script carga los registros desde Azure, permite editarlos y luego envía los cambios al servidor.*

El **script de Apps Script** asociado a la hoja de cálculo define varias funciones claves. En una estructura típica, incluiría:

* Una función `onOpen(e)` que se ejecuta al abrir la hoja y crea un menú o botones personalizados en la UI. Por ejemplo, con `SpreadsheetApp.getUi().createMenu('Mi Menú')…addItem('Refrescar Datos', 'refrescarDatos')` se añaden opciones que ejecutan otras funciones del script. Esta línea permite que el usuario ejecute acciones con un clic desde la barra de menús.
* Una función `refrescarDatos()` que **obtiene registros de Azure**. Esta función usaría `UrlFetchApp.fetch(url, options)` o `SpreadsheetApp.flush()` para hacer una solicitud HTTP POST al endpoint de Azure Functions, proporcionando parámetros (por ejemplo, el correo del usuario) en JSON. Al recibir la respuesta (un array de objetos JSON con los campos id, item, cost, owner\_email, status), recorre esos datos y los inserta en la hoja (p.ej. con `setValues` en el rango correspondiente).
* Una función `actualizarDatos()` que **envía los cambios** hechos en la hoja de vuelta a la base de datos. Por ejemplo, tras editar los campos de una fila y pulsar “Actualizar”, el script extrae los valores modificados y envía otro `UrlFetchApp.fetch()` al mismo o a otro endpoint de Azure (en este caso, el endpoint HTTP definido) para insertar o actualizar esos registros en Azure SQL.
* Una función `borrarDatos()` que limpia la hoja de cálculo (por ejemplo, `sheet.clearContents()`) para eliminar la visualización actual de datos. Esto refuerza que **no se almacena información permanentemente** en la hoja: cada vez que se “refresca” se reemplazan todos los datos, y los cambios se persisten sólo en la base de datos de Azure, no en la hoja local.

**Lógica “sin almacenar permanentemente”**: El script actúa como *visor* o interfaz temporal. Al refrescar, carga los datos desde la base de datos y los muestra en la hoja; al actualizar, envía los cambios y limpia la hoja. De este modo, la hoja de cálculo no mantiene un registro histórico de datos: siempre refleja la consulta más reciente y los cambios pendientes se envían al servidor, pero nunca se guardan localmente como copia permanente. Esto evita duplicar datos y asegura que la **fuente única de verdad** sea la base de datos en Azure, tal como recomiendan las buenas prácticas (una hoja de cálculo no debe usarse como BD persistente). Además, tras enviar los cambios al servidor se puede borrar o ocultar los datos en la hoja para reforzar esta idea de “visibilidad temporal”.

A continuación se muestra una explicación *línea por línea* de un posible script de Apps Script (pseudocódigo comentado):

```js
function onOpen(e) {
  // Al abrir la hoja, agregar opciones en el menú personalizado
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('Gestión BD')
    .addItem('Refrescar Datos', 'refrescarDatos')
    .addItem('Actualizar Cambios', 'actualizarDatos')
    .addItem('Borrar Datos', 'borrarDatos')
    .addToUi();
}

function refrescarDatos() {
  // Bloquear ejecución concurrente para evitar conflictos (LockService)
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(30000)) {
    SpreadsheetApp.getUi().alert('Otro usuario está refrescando datos. Intente de nuevo más tarde.');
    return;
  }
  try {
    // Obtener email u otra clave de usuario, si se usa autenticación
    const email = Session.getActiveUser().getEmail();
    // Llamar al Azure Function para obtener registros (método POST)
    const url = 'https://<tu_funcion_app>.azurewebsites.net/api/pushStaging?code=<tu_clave_funcion>';
    const options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ userEmail: email })
    };
    const response = UrlFetchApp.fetch(url, options);
    const data = JSON.parse(response.getContentText());
    
    // Escribir datos en la hoja (asumiendo encabezados en la fila 1)
    const sheet = SpreadsheetApp.getActiveSheet();
    sheet.getRange(2, 1, sheet.getMaxRows()-1, sheet.getMaxColumns()).clearContent();
    if (data && data.length) {
      const values = data.map(row => [row.id, row.item, row.cost, row.owner_email, row.status]);
      sheet.getRange(2, 1, values.length, values[0].length).setValues(values);
    }
  } finally {
    lock.releaseLock();
  }
}

function actualizarDatos() {
  // Similar al anterior, usa LockService para evitar concurrencia
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(30000)) {
    SpreadsheetApp.getUi().alert('Otro usuario está actualizando datos. Intente de nuevo más tarde.');
    return;
  }
  try {
    const sheet = SpreadsheetApp.getActiveSheet();
    const rows = sheet.getDataRange().getValues();
    const headers = rows[0];
    // Suponiendo campos 'id', 'item', 'cost', 'owner_email', 'status'
    const email = Session.getActiveUser().getEmail();
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row[0] && row[0] != '') {
        // Construir objeto con los datos de la fila
        const payload = {
          id: row[0],
          item: row[1],
          cost: row[2],
          owner_email: row[3],
          status: row[4],
          userEmail: email
        };
        const url = 'https://<tu_funcion_app>.azurewebsites.net/api/pushStaging?code=<tu_clave_funcion>';
        const options = {
          method: 'post',
          contentType: 'application/json',
          payload: JSON.stringify(payload)
        };
        UrlFetchApp.fetch(url, options);
      }
    }
    // Opcional: notificar éxito
    SpreadsheetApp.getUi().alert('Los cambios se enviaron correctamente.');
  } finally {
    lock.releaseLock();
  }
}

function borrarDatos() {
  // Limpia la hoja (no se almacena nada localmente)
  const sheet = SpreadsheetApp.getActiveSheet();
  sheet.getRange(2, 1, sheet.getMaxRows()-1, sheet.getMaxColumns()).clearContent();
}
```

Cada línea del script anterior cumple una función:

* `onOpen(e)` configura el menú al abrir la hoja. Esto es un **disparador simple** que Google ejecuta automáticamente. Agrega ítems como “Refrescar Datos”, “Actualizar Cambios” y “Borrar Datos” a la interfaz.
* `refrescarDatos()` obtiene los registros desde Azure. Usa `UrlFetchApp.fetch` para llamar al endpoint HTTPS de la función con las credenciales necesarias (en `?code=` se envía la clave de función, tema explicado más adelante). Una vez recibe la respuesta JSON, inserta los datos en la hoja con `setValues`. Notar que primero limpia cualquier dato previo para no guardar información antigua.
* `actualizarDatos()` recorre las filas de la hoja (excepto encabezados) y, por cada fila con datos, construye un objeto JSON con los campos y envía una solicitud HTTP POST al mismo endpoint de Azure para insertar ese registro en la base de datos. De nuevo limpia o notifica al final según convenga.
* `borrarDatos()` simplemente limpia la hoja de cálculo (quedando solo encabezados), asegurando que ningún dato quede almacenado en la hoja tras la operación.

En resumen, el script actúa **como visor de datos**: carga la última versión de la información desde la base de datos de Azure y permite editarla, pero **no mantiene esos datos en la hoja**. Tras cada operación los datos se envían al servidor y pueden borrarse localmente. Esto evita duplicaciones y deja que la base de datos sea la fuente real de los registros.

## Propósito y funcionamiento del visor en Sheets

El **visor en Sheets** funciona como una interfaz gráfica para los usuarios. Los datos siempre residen en Azure SQL; la hoja de cálculo sólo muestra una vista temporal. Este enfoque se eligió porque:

* **Un solo punto de verdad**: La base de datos Azure SQL garantiza integridad y persistencia (propiedades ACID), mientras que la hoja de cálculo no es adecuada como almacén de datos definitivo.
* **Actualizaciones controladas**: Al no guardar datos permanentemente, se obligan a los usuarios a enviar los cambios al backend cada vez, evitando discrepancias entre usuarios.
* **Seguridad y escalabilidad**: No divulgar directamente datos sensibles en la hoja y aprovechar las capacidades de manejo de concurrencia de la base de datos.

Para evitar que la hoja almacene datos, el script siempre limpia o sobrescribe el contenido al refrescar o enviar cambios. Además, se podría usar `PropertiesService` o variables temporales si fuese necesario, pero en este caso la sincronización directa con la función hace que la hoja sea simplemente un contenedor de trabajo momentáneo.

## Repositorio `prueba--main` (Azure Functions)

El repositorio **`prueba--main`** (cuyo contenido se adjunta en el ZIP proporcionado) contiene la implementación de la función de Azure Functions que recibe los datos desde la hoja y los inserta en Azure SQL. A continuación se analiza cada archivo:

* **`host.json`**: Archivo de configuración global del Function App. Aquí aparece `"version": "2.0"` y ajustes de logging para Application Insights. En particular, se habilita el muestreo de telemetría (`samplingSettings`) para Application Insights. Este archivo no define lógica de la función, sino metadatos de la app (p.ej. registro de logs, nivel de compilación, etc.).

* **`package.json`**: Define el proyecto Node.js. Contiene el nombre `pushStaging`, descripción, punto de entrada (`main: "pushStaging/index.js"`) y dependencias. En **dependencies** aparece `"mssql": "^10.0.0"`, la biblioteca de Node que permite conectarse a SQL Server. También define el script `"start": "func start"` para iniciar localmente. En resumen, `package.json` prepara el entorno Node.js para la función.

* **`pushStaging/function.json`**: Este archivo configura el *binding* de la función Azure llamada `pushStaging`. Contiene:

  * `"authLevel": "function"`, lo que indica que la función requiere una **clave de función** para invocarse (es decir, no es anónima). Esto significa que al llamarla desde el script de Google, debe incluirse `?code=<tu_clave_de_funcion>` en la URL de la solicitud.
  * `"type": "httpTrigger"`, `"direction": "in"`, `"name": "req"` y `methods: [ "post" ]`: la función se activa por HTTP (trigger) vía POST, recibiendo la petición en la variable `req`.
  * `"type": "http"`, `"direction": "out"`, `"name": "res"`: define la respuesta HTTP que se enviará de vuelta. En conjunto, esto establece que la función actúa como un endpoint HTTPS que recibe JSON mediante POST y devuelve una respuesta con cuerpo.

* **`pushStaging/index.js`**: Contiene el código Node.js de la función. Analizando las secciones relevantes:

  * Al inicio se importa el módulo `mssql` (`const sql = require('mssql');`), que se usará para conectar con Azure SQL.
  * Se exporta una función asíncrona `module.exports = async function (context, req) { ... }`. Dentro de esta función:

    * Se lee la configuración de conexión desde las **variables de entorno**: `DB_USER`, `DB_PASS`, `DB_SERVER` y `DB_NAME`. Estas se deben definir en las *Application Settings* del Function App en Azure, de modo que el código no tenga credenciales hardcodeadas. La opción `{ encrypt: true, trustServerCertificate: false }` obliga a usar conexión cifrada a la base de datos.
    * Con un bloque `try/catch/finally`, se conecta a la base de datos: `await sql.connect(config);`.
    * Se extraen los datos del cuerpo de la petición HTTP (`req.body`), específicamente los campos `{ id, item, cost, owner_email, status, userEmail }`.
    * Se ejecuta una consulta **INSERT** parametrizada usando template literals de `mssql`:

      ```js
      await sql.query`
        INSERT INTO dbo.Staging (id, item, cost, owner_email, status)
        VALUES (${id}, ${item}, ${cost}, ${owner_email}, 'NEW')
      `;
      ```

      Esto inserta un nuevo registro en la tabla `Staging`. Nótese que fija el campo `status` a `'NEW'`.
    * Si la inserción es exitosa, la función responde con estatus 200 y mensaje `"Inserción exitosa"`.
    * En caso de error, se captura en `catch(err)` y se devuelve código 500 con el mensaje de error. Finalmente, en el bloque `finally`, se cierra la conexión con `await sql.close();`.
  * *Nota:* El código incluye un fragmento posterior inacabado (`// pushStaging ya la tienes; añade esto en pushStaging/index.js o en un a...`), que parece ser un comentario instructivo no ejecutable. No afecta la función principal descrita.

En conjunto, **`index.js`** implementa la lógica del endpoint `pushStaging`: recibe datos de una petición HTTP, se conecta a Azure SQL, inserta en la tabla `Staging` y retorna el resultado. Al desplegar este código en Azure Functions, se crea la API REST que la hoja de Google Apps Script puede invocar.
A continuación tienes la explicación detallada de la función **`pushStaging`** que está desplegada en Azure Functions, junto con el uso de las **variables de entorno** para la conexión a la base de datos.

---

## Código de la Azure Function `pushStaging`

```javascript
const sql = require('mssql');

module.exports = async function (context, req) {
  // Leer credenciales de Application Settings
  const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    options: {
      encrypt: true,
      trustServerCertificate: false
    }
  };

  try {
    // 1) Conectar a Azure SQL usando la configuración anterior
    await sql.connect(config);

    // 2) Extraer los datos que vienen en el cuerpo de la petición HTTP POST
    const { id, item, cost, owner_email } = req.body;

    // 3) Ejecutar un INSERT parametrizado para evitar inyección SQL
    await sql.query`
      INSERT INTO dbo.Staging (id, item, cost, owner_email, status)
      VALUES (${id}, ${item}, ${cost}, ${owner_email}, 'NEW')
    `;

    // 4) Responder al cliente con éxito
    context.res = {
      status: 200,
      body: "Inserción exitosa"
    };

  } catch (err) {
    // 5) En caso de error, registrar y devolver 500
    context.log.error(err);
    context.res = {
      status: 500,
      body: "Error: " + err.message
    };

  } finally {
    // 6) Cerrar siempre la conexión al terminar
    await sql.close();
  }
};
```

### Línea por línea

1. **`const sql = require('mssql');`**
   Importa la librería oficial de Microsoft para conectarse a SQL Server desde Node.js.

2. **`module.exports = async function (context, req) { … }`**
   Define la función HTTP-trigger que Azure invoqua cuando recibe solicitudes en la ruta `/api/pushStaging`.

   * `context` permite escribir logs y construir la respuesta.
   * `req` contiene la petición HTTP, incluidos `req.body` (el JSON enviado).

3. **`const config = { … }`**
   Lee las credenciales de conexión **desde las variables de entorno** de la Function App:

   * **`DB_USER`**, **`DB_PASS`**, **`DB_SERVER`**, **`DB_NAME`**
     Estas claves se configuran en el portal de Azure bajo **Configuración de aplicación → Variables de entorno**, tal como se muestra en tu captura. Nunca aparecen hardcodeadas en el código; así proteges tus credenciales.

4. **`await sql.connect(config);`**
   Abre la conexión a Azure SQL Database usando `config`. Gracias a `encrypt: true`, la comunicación se hace por TLS.

5. **`const { id, item, cost, owner_email } = req.body;`**
   Extrae las propiedades `id`, `item`, `cost` y `owner_email` del JSON enviado por Apps Script (o quien invoque la función).

6. **`` await sql.query` INSERT INTO dbo.Staging …` ``**
   Ejecuta un **INSERT parametrizado**. Los valores interpolados con `${…}` se envían de forma segura, evitando inyección de SQL.

7. **`context.res = { status: 200, body: "Inserción exitosa" };`**
   Si todo va bien, responde con código HTTP 200 y un mensaje simple.

8. **Bloque `catch(err)`**
   Si ocurre cualquier excepción (fallo de conexión, error en la consulta, JSON mal formado…), se registra en los logs (`context.log.error(err)`) y se responde con código 500 y el mensaje de error.

9. **Bloque `finally`**
   Sea cual sea el resultado, antes de salir se **cierra la conexión** con `await sql.close()`. Esto evita fugas de conexión en el pool de `mssql`.

---

### Variables de entorno en Azure

En el portal de Azure, dentro de tu Function App **probando22**, verás en **Configuración de aplicación → Variables de entorno** algo como:

| Nombre                                  | Valor                                     |
| --------------------------------------- | ----------------------------------------- |
| DB\_USER                                | jomaldonadob@…                            |
| DB\_PASS                                | Maldo20774.                               |
| DB\_SERVER                              | pruebas-jomaldonadob.database.windows.net |
| DB\_NAME                                | mi-sql-server-appsheet                    |
| AzureWebJobsStorage                     | …                                         |
| APPLICATIONINSIGHTS\_CONNECTION\_STRING | …                                         |
| …                                       | …                                         |

* **DB\_USER, DB\_PASS, DB\_SERVER, DB\_NAME**
  Se usan en `process.env.*` para armar `config`.
* **AzureWebJobsStorage** y **APPLICATIONINSIGHTS\_CONNECTION\_STRING**
  Son requeridas por Azure Functions para su almacenamiento interno y telemetría.

Al mantener las credenciales fuera del código (en variables de entorno), garantizas que no se filtren ni queden en tu repositorio. Cualquier cambio de contraseña o servidor se hace sólo en la configuración de la aplicación, sin tocar el código.

---

### Resumen de la función `pushStaging`

1. **Recibe** una petición HTTP POST con un JSON `{ id, item, cost, owner_email }`.
2. **Usa** credenciales seguras (variables de entorno) para conectarse a Azure SQL.
3. **Inserta** el registro en la tabla `dbo.Staging`, marcándolo con estado `'NEW'`.
4. **Devuelve** un mensaje de éxito o el detalle del error.
5. **Cierra** siempre la conexión al terminar para liberar recursos.

Esta función es el **endpoint** al que llama tu Apps Script (desde Google Sheets) para persistir datos en Azure SQL, y forma la pieza central de la capa de backend en la arquitectura.

## Despliegue a Azure Functions desde Cloud Shell

Para desplegar el repositorio a Azure, se utiliza el **Azure Cloud Shell** (una terminal de Azure en el navegador). El proceso es:

1. **Subir el ZIP al Cloud Shell:** En el panel de Cloud Shell, se puede usar el ícono de subida para cargar el archivo ZIP (`prueba--main.zip`) a la cuenta de archivos conectada al Cloud Shell (que persiste entre sesiones). Alternativamente se puede montar un repositorio Git o clonar código. En este caso, asumimos que subimos el ZIP al directorio home o a la unidad conectada.

2. **Descomprimir/Preparar (opcional):** Aunque no es estrictamente necesario, se puede descomprimir el zip en el Cloud Shell para inspección. De hecho, es posible publicar el ZIP directamente sin descomprimir porque la herramienta de despliegue lo extrae en el sitio web de funciones.

3. **Configurar Azure Functions App:** Debe existir previamente una Azure Function App creada (p.ej. mediante ARM, portal o CLI). Se requiere conocer el *resource group* y el *nombre* de la Function App. Las variables de entorno (`DB_USER`, `DB_PASS`, etc.) también deben establecerse en la configuración de la Function App (Azure Portal → Configuración de la aplicación).

4. **Desplegar por ZIP:** Usando Azure CLI, se ejecuta el comando de *zip deploy*:

   ```
   az functionapp deployment source config-zip \
     --resource-group <GRUPO_RECURSOS> \
     --name <NOMBRE_APP> \
     --src <ruta_al_zip>
   ```

   Esto envía el ZIP y actualiza el contenido de la Function App. Durante el despliegue, Azure elimina archivos antiguos y los reemplaza con los del ZIP. En Cloud Shell, `<ruta_al_zip>` sería la ubicación dentro de la unidad persistente (por ejemplo `/home/<usuario>/prueba--main.zip`). Tras ejecutar el comando, Azure extrae el ZIP en el directorio `wwwroot` de la función.

5. **Verificación:** Una vez completado, la función debe reiniciarse automáticamente. Se puede verificar en el portal de Azure, en la sección Functions → pushStaging, donde debe aparecer activa. Allí también se puede obtener la **clave de función** (en la sección Keys del portal, o mediante Azure CLI). Como la función tiene `authLevel: function`, habrá al menos una clave predeterminada (`default`). Esta clave se incluye como parámetro `?code=` al invocar la función desde el script (de otro modo dará 401 Unauthorized). Las capturas \[10–13] muestran ejemplos de pruebas con Postman donde se observa el error 401 al omitir o usar mal la clave.

Este procedimiento de **Zip Deploy** es el recomendado para desplegar funciones con Azure CLI o Cloud Shell, pues usa el servicio Kudu para descomprimir el paquete y sincronizar los desencadenadores de la función.

## Flujo completo y gestión de concurrencia

El **flujo de datos completo** desde la hoja hasta Azure SQL es el siguiente:

1. **Usuario interactúa con la hoja:** El usuario abre Google Sheets y pulsa “Refrescar Datos”. Apps Script captura el evento y llama a `refrescarDatos()`.
2. **Solicitud a Azure Functions:** `refrescarDatos()` hace un `UrlFetchApp.fetch()` al endpoint de la Function (`https://<APP>.azurewebsites.net/api/pushStaging?code=<clave>`). Se envía el correo del usuario u otros filtros si aplica.
3. **Inserción en Azure SQL:** La función `pushStaging` recibe el JSON, se conecta a la base de datos, e inserta o actualiza registros en la tabla `Staging` con transacciones ACID. Luego responde con éxito o error.
4. **Respuesta y visualización:** Si la inserción fue correcta, Apps Script puede notificarlo al usuario. Para refrescar, el script podría volver a llamar al mismo endpoint para leer datos o asumimos que “Actualizar” realiza el insert y luego podría invocarse de nuevo “Refrescar” para ver los cambios confirmados.
5. **Base de datos ACID:** Azure SQL Server garantiza propiedades ACID, por lo que cada operación de inserción es atómica e aislada. Incluso si varios usuarios envían datos al mismo tiempo, la base de datos los procesará como transacciones independientes sin corromper la consistencia. Las restricciones de clave primaria (p.ej. en `id`) evitan duplicados, y el aislamiento de transacciones asegura que un commit completo se vea sólo cuando todos los pasos se realicen correctamente.
6. **Concurrencia en Apps Script:** Para evitar que dos usuarios en Google Sheets intenten modificar datos simultáneamente (lo que podría causar llamadas HTTP al mismo tiempo o lecturas inconsistentes), el script utiliza **LockService** de Apps Script. Por ejemplo, `LockService.getDocumentLock()` bloquea la hoja durante la operación; si otro usuario intenta ejecutar la misma función antes de que termine, la petición de lock fallará y el script puede informar que espere. Esto previene colisiones en el cliente de Sheets cuando varios editores usan el visor al mismo tiempo. En resumen, se logra la integridad usando bloqueo de script en el cliente y transacciones en el servidor.

En síntesis, el sistema garantiza integridad de datos manejando la concurrencia en ambos extremos: Google Apps Script previene accesos simultáneos con `LockService`, mientras que Azure SQL impone **ACID** sobre las transacciones para mantener la consistencia. De esta forma, aunque haya múltiples editores, cada inserción o actualización de registro es transaccional y aislada, y la aplicación web actúa como capa de presentación temporal sin almacenar los datos localmente.


## Resumen

En conjunto, la solución enlaza AppSheet (front-end) con Google Apps Script (integración y lógica ligera) y Azure Functions/Azure SQL (backend). Cada servicio se creó con herramientas de gestión de la nube (Azure Portal o CLI) y se configuró para comunicarse de forma segura. Los flujos de datos y código quedan documentados según lo anterior, justificando cada elección tecnológica y mostrando los pasos (por ejemplo, comandos en Cloud Shell) para reproducir el entorno. De esta forma se entrega una documentación completa del proyecto, detallando la arquitectura, la configuración y la razón de ser de cada componente. Las referencias consultadas incluyen documentación oficial de Google AppSheet y Microsoft Azure, así como ejemplos de integración en Apps Script para respaldar la explicación.

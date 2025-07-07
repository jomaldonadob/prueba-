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

## Resumen

En conjunto, la solución enlaza AppSheet (front-end) con Google Apps Script (integración y lógica ligera) y Azure Functions/Azure SQL (backend). Cada servicio se creó con herramientas de gestión de la nube (Azure Portal o CLI) y se configuró para comunicarse de forma segura. Los flujos de datos y código quedan documentados según lo anterior, justificando cada elección tecnológica y mostrando los pasos (por ejemplo, comandos en Cloud Shell) para reproducir el entorno. De esta forma se entrega una documentación completa del proyecto, detallando la arquitectura, la configuración y la razón de ser de cada componente. Las referencias consultadas incluyen documentación oficial de Google AppSheet y Microsoft Azure, así como ejemplos de integración en Apps Script para respaldar la explicación.

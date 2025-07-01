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
    // Conectar a Azure SQL
    await sql.connect(config);

    // Extraer datos del cuerpo de la petición
    const { id, item, cost, owner_email } = req.body;

    // Ejecutar INSERT parametrizado
    await sql.query`
      INSERT INTO dbo.Staging (id, item, cost, owner_email, status)
      VALUES (${id}, ${item}, ${cost}, ${owner_email}, 'NEW')
    `;

    // Responder OK
    context.res = {
      status: 200,
      body: "Inserción exitosa"
    };

  } catch (err) {
    context.log.error(err);
    context.res = {
      status: 500,
      body: "Error: " + err.message
    };
  } finally {
    // Cerrar conexión
    await sql.close();
  }
};

// pushStaging ya la tienes; añade esto en pushStaging/index.js o en un archivo separado
module.exports = async function(context, req) {
  const sql = require('mssql');
  // extrae email autenticado, ejemplo de Easy Auth header:
  const principal = context.req.headers['x-ms-client-principal'];
  const userEmail = JSON.parse(Buffer.from(principal, 'base64').toString()).userId;
  
  const config = { /* tus vars de entorno */ };
  try {
    await sql.connect(config);
    const result = await sql.query`
      SELECT id,item,cost,owner_email,status
      FROM dbo.Staging
      WHERE owner_email = ${userEmail}
    `;
    context.res = { status: 200, body: result.recordset };
  } catch(e) {
    context.res = { status: 500, body: e.message };
  } finally {
    await sql.close();
  }
};

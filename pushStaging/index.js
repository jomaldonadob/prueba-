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

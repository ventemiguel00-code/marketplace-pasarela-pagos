const path = require('node:path');
const dotenv = require('dotenv');

// La ruta no depende de la carpeta desde la que se ejecute Node.
const result = dotenv.config({
  path: path.resolve(__dirname, '../../.env'),
  quiet: true,
});

if (result.error && result.error.code !== 'ENOENT') {
  throw result.error;
}

const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT debe ser un entero entre 1 y 65535.');
}

module.exports = {
  host: process.env.HOST || '127.0.0.1',
  port,
};

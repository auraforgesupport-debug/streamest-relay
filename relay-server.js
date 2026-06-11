const { startServer } = require("./server");

const port = Number(process.env.PORT || 3789);

startServer({ rootDir: __dirname, port, host: "0.0.0.0" })
  .then((server) => {
    console.log(`Streamest relay listening on ${server.localUrl}`);
  })
  .catch((error) => {
    console.error("Could not start Streamest relay.");
    console.error(error);
    process.exit(1);
  });

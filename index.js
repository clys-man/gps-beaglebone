const fs = require("fs");
const WebSocket = require("ws");
const https = require("https");
const SerialPort = require("serialport");
const express = require("express");
const path = require("path");
const app = express();
const { exec } = require("child_process");

const pinsToConfigure = [
  { pin: "P9_11", mode: "uart" },
  { pin: "P9_13", mode: "uart" },
];

function executeCommand(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(stdout.trim());
    });
  });
}

function configurePins() {
  try {
    for (const pin of pinsToConfigure) {
      const cmd = `config-pin ${pin.pin} ${pin.mode}`;
      executeCommand(cmd)
        .then((res) => {
          console.log("Pino ${pin.pin} configurado para o modo ${pin.mode}");
        })
        .catch((error) => {
          console.error("Erro ao configurar o pino:", error);
        });
    }
  } catch (error) {
    console.error("Erro: ", error);
  }
}

const options = {
  key: fs.readFileSync(path.join(__dirname, "certs", "ca.key")),
  cert: fs.readFileSync(path.join(__dirname, "certs", "ca.crt")),
};

const server = https.createServer(options, app);
const wss = new WebSocket.Server({ server });

const serialPort = new SerialPort("/dev/ttyO4", { baudRate: 9600 });

let lastSentLocation = null;

wss.on("connection", (socket) => {
  console.log("Conexão estabelecida");

  serialPort.on("data", () => {
    const serialData = data.toString().trim();
    console.log("Dados recebidos da serial: ", serialData);

    const fields = serialData.split(",");

    if (fields[0] === "$GNRMC" && fields.length >= 2) {
      const latitude = fields[3];
      const latitudeDirection = fields[4];
      const longitude = fields[5];
      const longitudeDirection = fields[6];

      if (latitude && latitudeDirection && longitude && longitudeDirection) {
        const latitudeDecimal = parseFloat(latitude.substring(0, 2)) +
          parseFloat(latitude.substring(2)) / 60;
        const longitudeDecimal = parseFloat(longitude.substring(0, 3)) +
          parseFloat(longitude.substring(3)) / 60;

        const locationData = {
          latitude: latitudeDirection === "N"
            ? latitudeDecimal
            : -latitudeDecimal,
          longitude: longitudeDirection === "E"
            ? longitudeDecimal
            : -longitudeDecimal,
        };

        if (!lastSentLocation || lastSentLocation !== locationData) {
          lastSentLocation = locationData;
          socket.send(JSON.stringify(locationData));
        }
      }
    }
  });
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.use(express.static(path.join(__dirname, "public")));

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  configurePins();
});

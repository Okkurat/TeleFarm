const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const mqtt = require('mqtt');
const path = require('path');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
const server = http.createServer(app);
const wss = new WebSocket.Server({server});

const brokerUrl = 'mqtt://localhost';
const options = {
  clientId: 'mqtt_subscriber',
  clean: true,
};

const client = mqtt.connect(brokerUrl, options);
let latestSensorData = {};

// measurements published on telefarm/status
client.on('connect', () => {
  client.subscribe('telefarm/status', (err) => {
    if (err) console.error('Error subscribing:', err);
    else console.log('Subscribed to telefarm/status');
  });
});

client.on('message', (topic, message) => {
  if (topic === 'telefarm/status') {
    const data = JSON.parse(message.toString());
    latestSensorData = data;
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(latestSensorData));
      }
    });
  }
});

wss.on('connection', (ws) => {
  ws.send(JSON.stringify(latestSensorData));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/pump', (req, res) => {
  client.publish('telefarm/pump', 'true', function(err) {
    if (err) {
      console.error('Error publishing message:', err);
      res.status(500).send('Error while triggering pump manually');
    } else {
      console.log('Published "true" to telefarm/pump');
      res.status(200).send('Pump triggered successfully');
    }
  });
});

app.post('/irrigate', (req, res) => {
  client.publish('telefarm/irrigate', 'true', function(err) {
    if (err) {
      console.error('Error publishing message:', err);
      res.status(500).send('Error when calling for irrigation');
    } else {
      console.log(`Plant has been watered at [${new Date().toLocaleString()}]`);
    }
  });
});

server.listen(3000, () => {
  console.log('Server OK port 3000');
});

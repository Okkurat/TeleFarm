const mqtt = require('mqtt');

const brokerUrl = 'mqtt://localhost';
const options = {
  clientId: 'mqtt_simulator',
  clean: true,
};

const client = mqtt.connect(brokerUrl, options);

// Mock data
function sendMockData() {
  const pumpStatus = Math.random() < 0.5 ? 0 : 1;
  const tankLevel = Math.floor(Math.random() * 100);
  const soilMoisture = Math.floor(Math.random() * 100);
  const temperature = Math.floor(Math.random() * 100);
  const lightLevel = Math.floor(Math.random() * 100);

  const data = {
    pumpStatus,
    tankLevel,
    soilMoisture,
    temperature,
    lightLevel,
  };

  client.publish('telefarm/status', JSON.stringify(data));
}

client.on('connect', () => {
  console.log('MQTT ok');

  setInterval(() => {
    sendMockData();
  }, 5000); // 5 secs
});

client.on('error', (error) => {
  console.error('Error:', error);
});

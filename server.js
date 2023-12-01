const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const mqtt = require('mqtt');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const app = express();
app.use(express.json())
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


const db = new sqlite3.Database('data/myDatabase.db', (err) => {
  if (err) {
      console.error(err.message);
  } else {
      console.log('Connected to the SQLite database.');
  }
});

server.listen(3000, () => {
  console.log('Server OK port 3000');
});

function init_db(){
  db.run(`CREATE TABLE IF NOT EXISTS profile(
      name TEXT,
      auto BOOLEAN,
      target_moisture INTEGER,
      water_timing TEXT,
      amount_of_water INTEGER
  );`, (error) => {
      if(error){
          console.log(error);
          process.exit();
      } else {
          console.log("Initialized DB");
      }
  });
}

app.get('/profiles', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'profiles.html')); // Send the profiles.html file
});

app.get('/selectData', (req, res) => {
  db.all('SELECT name FROM profile', (err, rows) => {
      if (err) {
          res.status(500).json({ error: err.message });
          return;
      }
      res.json(rows);
  });
});

function insertTestData() {
  const testProfiles = [
      { name: 'John Doe', auto: true, target_moisture: 50, water_timing: '06:00', amount_of_water: 200 },
      { name: 'Jane Smith', auto: false, target_moisture: 60, water_timing: '12:00', amount_of_water: 150 },
  ];

  const placeholders = testProfiles.map(() => '(?, ?, ?, ?, ?)').join(',');

  const insertQuery = `
      INSERT INTO profile (name, auto, target_moisture, water_timing, amount_of_water)
      VALUES ${placeholders}
  `;

  const values = testProfiles.reduce((acc, profile) => {
      acc.push(profile.name, profile.auto, profile.target_moisture, profile.water_timing, profile.amount_of_water);
      return acc;
  }, []);

  db.run(insertQuery, values, function(err) {
      if (err) {
          console.error(err.message);
          return;
      }
      console.log('Test data inserted successfully');
  });
}

function clearDatabase() {
  const clearQuery = `DELETE FROM profile`;

  db.run(clearQuery, function(err) {
      if (err) {
          console.error(err.message);
      } else {
          console.log('Database cleared successfully');
      }
  });
}

app.get('/profileData', (req, res) => {
  const selectedName = req.query.name;
  console.log(selectedName)
  db.all('SELECT * FROM profile WHERE name = ?', [selectedName], (err, rows) => {
      if (err) {
          res.status(500).json({ error: err.message });
          return;
      }
      res.json(rows);
  });
});

app.post('/createProfile', (req, res) => {
  console.log(req.body)
  const { name, auto, target_moisture, water_timing, amount_of_water } = req.body;

  // Check if a profile with the same name exists
  db.get('SELECT name FROM profile WHERE name = ?', [name], (err, row) => {
      if (err) {
          res.status(500).json({ error: err.message });
          return;
      }

      if (row) {
          // Profile with the same name already exists
          res.status(400).json({ error: 'Profile with this name already exists' });
          return;
      }

      // Insert new profile since no profile with this name exists
      const insertQuery = `
          INSERT INTO profile (name, auto, target_moisture, water_timing, amount_of_water)
          VALUES (?, ?, ?, ?, ?)
      `;

      db.run(insertQuery, [name, auto, target_moisture, water_timing, amount_of_water], function(err) {
          if (err) {
              res.status(500).json({ error: err.message });
              return;
          }
          res.json({ message: 'Profile created successfully' });
      });
  });
});

app.delete('/deleteProfile', (req, res) => {
  const name = req.query.name;

  db.run('DELETE FROM profile WHERE name = ?', [name], function(err) {
      if (err) {
          res.status(500).json({ error: err.message });
          return;
      }
      if (this.changes === 0) {
          res.json({ success: false }); // Profile not found
      } else {
          res.json({ success: true }); // Profile successfully deleted
      }
  });
});

//clearDatabase()
//insertTestData()

init_db();
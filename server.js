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
    let date = new Date()
    let time_stamp = date.getTime()
    let selectedProfile;
    let profileName;

    // Assuming 'profile' represents the currently selected profile from the profiles page
    const { water, light, moisture, errors, mode } = latestSensorData;
    //console.log(latestSensorData)
    if(errors == 0){

    
    db.get('SELECT * FROM profile WHERE selected = ?', [true], (err, selectedProfile) => {
      if (err) {
        console.error('Error fetching selected profile:', err);
        return;
      }
      //console.log(selectedProfile)
      //console.log(selectedProfile.name)
      try {
        if (selectedProfile.name !== undefined) {

          // Insert the measurement with the selected profile name
          db.run(
            `INSERT INTO measurement (time_stamp, water, moisture, light, profile) 
            VALUES (?, ?, ?, ?, ?)`,
            [time_stamp, water, moisture, light, selectedProfile.name],
            (err) => {
              if (err) {
                console.error('Error inserting measurement:', err);
              } else {
                //console.log('Measurement inserted successfully');
              }
            }
          );
          }
      } catch(e) {

      }
      
    });
      
    
      }
  }
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(latestSensorData));
    }
  });
});


wss.on('connection', (ws) => {
  ws.send(JSON.stringify(latestSensorData));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/pump', (req, res) => {
  db.get('SELECT * FROM profile WHERE selected = ?', [true], (err, profile) => {
    if (err) {
      console.error(err.message);
      return;
    }

    if (profile) {
      const { name, auto, water_timing, target_moisture, amount_of_water } = profile;
      const [profileHour, profileMinute] = water_timing.split(':').map(Number);
      
      // Construct the message in JSON format
      const message = JSON.stringify({
        mode: auto, // Auto mode
        moisture: target_moisture, // Target moisture
        water: amount_of_water // Water amount
      });
      console.log(message)

      // Publish the message to the 'set' topic
      client.publish('set', message, function(err) {
        if (err) {
          console.error('Error publishing message:', err);
        } else {
          console.log(`Message published to 'set' topic for ${name}`);
        }
      });
      
    }
  });/*
  client.publish('telefarm/pump', 'true', function(err) {
    if (err) {
      console.error('Error publishing message:', err);
      res.status(500).send('Error while triggering pump manually');
    } else {
      console.log('Published "true" to telefarm/pump');
      res.status(200).send('Pump triggered successfully');
    }
  });*/
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
  // Put selected parameter here
  db.run(`CREATE TABLE IF NOT EXISTS profile(
      name TEXT,
      auto BOOLEAN,
      target_moisture INTEGER,
      water_timing TEXT,
      amount_of_water INTEGER,
      selected BOOLEAN
  );`, (error) => {
      if(error){
          console.log(error);
          process.exit();
      } else {
          console.log("Initialized DB");
      }
  });
  db.run(`CREATE TABLE IF NOT EXISTS measurement(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    time_stamp INTEGER,
    water INTEGER,
    moisture INTEGER,
    light INTEGER,
    profile TEXT
    );
`, (error) => {
  if(error){
  console.log(error)
  process.exit()
  }
  else {
  console.log("Initialized DB")
  }
})
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
      { name: 'John Doe', auto: true, target_moisture: 50, water_timing: '06:00', amount_of_water: 200, selected: false },
      { name: 'Jane Smith', auto: false, target_moisture: 60, water_timing: '12:00', amount_of_water: 150, selected: false },
  ];

  const placeholders = testProfiles.map(() => '(?, ?, ?, ?, ?, ?)').join(',');

  const insertQuery = `
      INSERT INTO profile (name, auto, target_moisture, water_timing, amount_of_water, selected)
      VALUES ${placeholders}
  `;

  const values = testProfiles.reduce((acc, profile) => {
      acc.push(profile.name, profile.auto, profile.target_moisture, profile.water_timing, profile.amount_of_water, profile.selected);
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
  const clearQuery2 = `DELETE FROM measurement`;

  db.run(clearQuery2, function(err) {
      if (err) {
          console.error(err.message);
      } else {
          console.log('Database cleared successfully');
      }
  });
}

app.get('/profileData', (req, res) => {
  const selectedName = req.query.name;
  //console.log(selectedName);

  db.run('UPDATE profile SET selected = ?', [false], (updateErr) => {
    if (updateErr) {
      res.status(500).json({ error: updateErr.message });
      return;
    }

    db.run('UPDATE profile SET selected = ? WHERE name = ?', [true, selectedName], (err) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }

      db.all('SELECT * FROM profile WHERE name = ?', [selectedName], (err, rows) => {
        if (err) {
          res.status(500).json({ error: err.message });
          return;
        }

        if (rows.length > 0) {
          const selectedProfile = rows[0];
          const { auto, target_moisture, amount_of_water } = selectedProfile;

          // Construct and publish a message based on the selected profile
          const message = JSON.stringify({
            mode: auto,
            moisture: target_moisture,
            water: amount_of_water
          });

          // Publish the message to the 'set' topic
          /*
          client.publish('set', message, function(err) {
            if (err) {
              console.error('Error publishing message:', err);
            } else {
              console.log(`Message published to 'set' topic for ${selectedName}`);
            }
          });*/
        }

        res.json(rows);
      });
    });
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
          INSERT INTO profile (name, auto, target_moisture, water_timing, amount_of_water, selected)
          VALUES (?, ?, ?, ?, ?, ?)
      `;

      db.run(insertQuery, [name, auto, target_moisture, water_timing, amount_of_water, false], function(err) {
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
      return;
    }

    db.run('DELETE FROM measurement WHERE profile = ?', [name], function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }

      res.json({ success: true }); // Profile successfully deleted
    });
  });
});

app.get("/statistics", (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'data.html'));
})
function start(){
  clearDatabase()
  init_db()
  insertTestData()
}
//start()

function printProfiles() {
  db.all('SELECT * FROM profile', (err, rows) => {
    if (err) {
      console.error(err.message);
      return;
    }
    console.log("Profiles:");
    console.table(rows); // Prints the retrieved rows in a tabular format
  });
}
printProfiles()

function checkWaterTimings() {
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();

  db.get('SELECT * FROM profile WHERE selected = ? AND auto = ?', [true, false], (err, profile) => {
    if (err) {
      console.error(err.message);
      return;
    }

    if (profile) {
      const { name, auto, water_timing, target_moisture, amount_of_water } = profile;
      const [profileHour, profileMinute] = water_timing.split(':').map(Number);

      if (profileHour === currentHour && profileMinute === currentMinute) {
        console.log(`Time to water ${name} at ${water_timing}`);
        
        // Construct the message in JSON format
        const message = JSON.stringify({
          mode: auto, // Auto mode
          moisture: target_moisture, // Target moisture
          water: amount_of_water // Water amount
        });

        // Publish the message to the 'set' topic
        client.publish('set', message, function(err) {
          if (err) {
            console.error('Error publishing message:', err);
          } else {
            console.log(`Message published to 'set' topic for ${name}`);
          }
        });
      }
    }
  });
}


// Execute the function every minute (60,000 milliseconds)
setInterval(checkWaterTimings, 60000); // Runs every minute

function printSelectedProfileMeasurements() {
  // Fetch the selected profile
  db.get('SELECT * FROM profile WHERE selected = ?', [true], (err, selectedProfile) => {
    if (err) {
      console.error('Error fetching selected profile:', err);
      return;
    }

    if (selectedProfile) {
      const { name: selectedProfileName } = selectedProfile;

      // Fetch measurements for the selected profile
      db.all('SELECT * FROM measurement WHERE profile = ?', [selectedProfileName], (err, measurements) => {
        if (err) {
          console.error('Error fetching measurements:', err);
          return;
        }

        console.log(`Measurements for profile '${selectedProfileName}':`);
        console.table(measurements); // Print measurements in a tabular format
      });
    }
  });
}

app.get("/statistics/data", async (req, res) => {
  let parameters = ["time_stamp"];
  console.log(req.query)

  if (req.query.water) {
    parameters.push("water");
  }
  if (req.query.moisture) {
    parameters.push("moisture");
  }
  if (req.query.light) {
    parameters.push("light");
  }

  try {
    let data = await get_data(parameters, req.query.start, req.query.end);
    //console.log(data)
    res.send(data);
  } catch (exception) {
    console.log(exception);

    res.sendStatus(500);
  }
});

async function get_data(parameters, start, end) {
  return new Promise((resolve, reject) => {
    const selectedProfileQuery = 'SELECT name FROM profile WHERE selected = ?';
    // Fetch the selected profile name
    db.get(selectedProfileQuery, [true], (err, selectedProfile) => {
      if (err) {
        reject(err);
        return;
      }

      if (!selectedProfile || !selectedProfile.name) {
        resolve([]); // No selected profile or name found
        return;
      }

      let query = `SELECT ${parameters.join(', ')} FROM measurement WHERE profile = ?`;

      const queryArgs = [selectedProfile.name];
      console.log(isNaN(start))
      if (!isNaN(start) && !isNaN(start)) {
        query += ' AND time_stamp >= ? AND time_stamp <= ?';
        queryArgs.push(parseInt(start), parseInt(end));
      }
      console.log(query)
      console.log(queryArgs)

      db.all(query, queryArgs, (err, rows) => {
        if (err) {

          reject(err);
          return;
        }
        //console.log(rows)
        resolve(rows);
      });
    });
  });
}


// Execute the function every 5 seconds (5,000 milliseconds)
//setInterval(printSelectedProfileMeasurements, 50000); // Runs every 5 seconds

app.put('/modifyProfile', (req, res) => {
  const { name, auto, target_moisture, water_timing, amount_of_water } = req.body;

  // Check if the profile already exists with the given name
  db.get('SELECT name FROM profile WHERE name = ?', [name], (err, profile) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    
    if (profile) {
      res.status(400).json({ error: 'Profile with that name already exists' });
      return;
    }

    // Update the selected profile
    db.run('UPDATE profile SET name = ?, auto = ?, target_moisture = ?, water_timing = ?, amount_of_water = ? WHERE selected = ?', 
      [name, auto, target_moisture, water_timing, amount_of_water, true], function(updateErr) {
        if (updateErr) {
          res.status(500).json({ error: updateErr.message });
          return;
        }

        // Update the corresponding measurements with the new profile name
        db.run('UPDATE measurement SET profile = ? WHERE profile = ?', [name, req.body.name], function(measurementsErr) {
          if (measurementsErr) {
            res.status(500).json({ error: measurementsErr.message });
            return;
          }

          res.json({ message: 'Profile updated successfully' });
        });
      }
    );
  });
});

app.get('/selectedProfile', (req, res) => {
  const selectedProfileQuery = 'SELECT name FROM profile WHERE selected = ?';

  db.get(selectedProfileQuery, [true], (err, selectedProfile) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    console.log(selectedProfile)
    if (!selectedProfile) {
      res.json({}); // Return an empty object if no selected profile is found
      return;
    }

    res.json(selectedProfile); // Return the selected profile
  });
});
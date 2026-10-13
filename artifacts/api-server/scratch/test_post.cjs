const http = require('http');

const makeRequest = (options, postData) => {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });

    req.on('error', (e) => { reject(e); });

    if (postData) {
      req.write(JSON.stringify(postData));
    }
    req.end();
  });
};

async function main() {
  try {
    console.log("Logging in...");
    const loginRes = await makeRequest({
      hostname: 'localhost',
      port: 3002,
      path: '/api/auth/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    }, {
      email: 'saravanan@sankaraeye.com',
      password: 'Saravanan@2026'
    });

    console.log("Login Response Code:", loginRes.statusCode);
    console.log("Login Response Body:", loginRes.body);

    if (loginRes.statusCode !== 200) {
      console.error("Login failed!");
      return;
    }

    const loginData = JSON.parse(loginRes.body);
    const token = loginData.token;
    console.log("Token obtained successfully.");

    // Now attempt to create a batch
    console.log("Creating batch...");
    const createRes = await makeRequest({
      hostname: 'localhost',
      port: 3002,
      path: '/api/batches',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    }, {
      name: 'JULY 2026 - ALPHA CLUSTER',
      segment: 'Retina',
      date: '2026-05-26',
      timing: '09:00 AM - 01:00 PM',
      venue: 'SEH, Bangalore',
      programId: 15, // Let's use the valid program ID we found earlier (15)
      mcqTotalMarks: 50,
      psychometricTotalMarks: 50,
      interviewTotalMarks: 100
    });

    console.log("Create Batch Response Code:", createRes.statusCode);
    console.log("Create Batch Response Body:", createRes.body);

  } catch (err) {
    console.error("Error occurred:", err);
  }
}

main();

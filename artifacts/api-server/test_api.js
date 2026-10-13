async function test() {
  try {
    const loginRes = await fetch("http://localhost:3002/api/users/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "saravanan@sankaraeye.com", password: "password123" })
    });
    const loginData = await loginRes.json();
    const token = loginData.token;

    if (!token) {
      console.log("Login failed", loginData);
      return;
    }

    const batchRes = await fetch("http://localhost:3002/api/batches", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        name: "TEST",
        segment: "Retina",
        date: "2026-06-01",
        timing: "9:00 AM - 1:00 PM",
        venue: "SEH",
        programId: 1,
        mcqTotalMarks: 50,
        psychometricTotalMarks: 50,
        interviewTotalMarks: 100
      })
    });
    
    console.log("Status:", batchRes.status);
    const result = await batchRes.json();
    console.log("Result:", result);
  } catch (e) {
    console.error("Script Error:", e);
  }
}

test();

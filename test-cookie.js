// Quick cookie test script
// Run with: node test-cookie.js

const http = require('http');

const loginData = JSON.stringify({
  email: 'aq@gmail.com',
  password: 'your_password_here' // UPDATE THIS
});

const options = {
  hostname: 'localhost',
  port: 8000,
  path: '/auth/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': loginData.length
  }
};

const req = http.request(options, (res) => {
  console.log('\n📊 Response Status:', res.statusCode);
  console.log('\n📋 Response Headers:');
  console.log(JSON.stringify(res.headers, null, 2));
  
  // Check for Set-Cookie header
  const setCookie = res.headers['set-cookie'];
  if (setCookie) {
    console.log('\n✅ Set-Cookie header found!');
    console.log('🍪 Cookie:', setCookie);
  } else {
    console.log('\n❌ NO Set-Cookie header in response!');
    console.log('This means the backend is NOT setting the cookie!');
  }

  let body = '';
  res.on('data', (chunk) => {
    body += chunk;
  });

  res.on('end', () => {
    console.log('\n📦 Response Body:');
    console.log(body);
  });
});

req.on('error', (e) => {
  console.error('❌ Error:', e.message);
});

req.write(loginData);
req.end();


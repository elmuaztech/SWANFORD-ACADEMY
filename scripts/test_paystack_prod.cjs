const https = require('https');

const secretKey = process.env.PAYSTACK_SECRET_KEY;
console.log('Testing Paystack with key prefix:', secretKey ? secretKey.substring(0, 15) + '...' : 'NONE');

const reqData = JSON.stringify({
  email: 'test_parent@swanfordacademy.com.ng',
  amount: 500000,
  reference: 'TEST_INIT_' + Date.now(),
  callback_url: 'https://swanfordacademy.com.ng/admissions/pay/callback'
});

const req = https.request({
  hostname: 'api.paystack.co',
  path: '/transaction/initialize',
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + secretKey,
    'Content-Type': 'application/json'
  }
}, res => {
  let body = '';
  res.on('data', chunk => { body += chunk; });
  res.on('end', () => {
    console.log('HTTP Status:', res.statusCode);
    try {
      const parsed = JSON.parse(body);
      console.log('Paystack API Response:', JSON.stringify(parsed, null, 2));
      if (parsed.status === true && parsed.data && parsed.data.authorization_url) {
        console.log('PAYSTACK_INITIALIZATION_SUCCESS! Auth URL:', parsed.data.authorization_url);
      } else {
        console.error('PAYSTACK_INITIALIZATION_FAILED:', parsed.message);
      }
    } catch (e) {
      console.log('Raw body:', body);
    }
  });
});

req.on('error', err => {
  console.error('Request error:', err);
});

req.write(reqData);
req.end();

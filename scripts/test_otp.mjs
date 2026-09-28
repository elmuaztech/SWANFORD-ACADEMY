async function testOtp() {
  const res = await fetch('http://127.0.0.1:3002/api/auth/forgot-password/request-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'swanford99@gmail.com' }),
  });
  const data = await res.json();
  console.log('OTP Request Response (status', res.status, '):', data);
}

testOtp().catch(console.error);

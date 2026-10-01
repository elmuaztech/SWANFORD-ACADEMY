const { PrismaClient, PaymentTargetType, ApplicationPaymentStatus } = require('@prisma/client');
const prisma = new PrismaClient();

async function testFlow() {
  console.log('=== Starting E2E Admission Payment Session Test ===');
  
  // 1. Find an open admission cycle
  const cycle = await prisma.admissionCycle.findFirst({
    where: { status: 'OPEN' },
    include: { academicSession: true }
  });
  
  if (!cycle) {
    console.error('No open admission cycle found!');
    process.exit(1);
  }
  
  console.log('Using cycle:', cycle.name, 'Session:', cycle.academicSession.name);
  
  // 2. Find a programme
  const prog = await prisma.academicProgramme.findFirst();
  
  // 3. Create a test application
  const testNumber = 'TEST-' + Date.now().toString().slice(-6);
  const application = await prisma.application.create({
    data: {
      applicationNumber: testNumber,
      admissionCycleId: cycle.id,
      programmeId: prog.id,
      applicantFirstName: 'Test',
      applicantLastName: 'Applicant',
      dateOfBirth: new Date('2020-01-01'),
      gender: 'MALE',
      guardianName: 'Test Parent',
      guardianEmail: 'test.parent@swanfordacademy.com.ng',
      guardianPhone: '08012345678',
      guardianAddress: '123 Test Street, Abuja',
      stateOfOrigin: 'FCT',
      totalAmountKobo: BigInt(500000),
      paymentStatus: ApplicationPaymentStatus.PAYMENT_PENDING
    }
  });
  
  console.log('Created test application ID:', application.id, 'Number:', application.applicationNumber);
  
  try {
    // 4. Test payment session generation via internal API
    const http = require('http');
    
    function postJson(path, payload) {
      return new Promise((resolve, reject) => {
        const data = JSON.stringify(payload);
        const req = http.request({
          hostname: '127.0.0.1',
          port: 3000,
          path,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data),
            'Host': 'swanfordacademy.com.ng'
          }
        }, res => {
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => {
            try {
              resolve({ status: res.statusCode, data: JSON.parse(body) });
            } catch (e) {
              resolve({ status: res.statusCode, raw: body });
            }
          });
        });
        req.on('error', reject);
        req.write(data);
        req.end();
      });
    }
    
    console.log('Requesting payment session token from /api/payments/session ...');
    const sessionRes = await postJson('/api/payments/session', {
      targetType: 'APPLICATION_FEE',
      targetId: application.id
    });
    
    console.log('Session response status:', sessionRes.status, 'Body:', sessionRes.data);
    
    if (sessionRes.status !== 200 || !sessionRes.data.token) {
      throw new Error('Failed to create payment session: ' + JSON.stringify(sessionRes));
    }
    
    const sessionToken = sessionRes.data.token;
    console.log('Received sessionToken (hash verified):', sessionToken.slice(0, 16) + '...');
    
    console.log('Requesting Paystack checkout initialization from /api/payments/initialize ...');
    const initRes = await postJson('/api/payments/initialize', {
      sessionToken,
      targetType: 'APPLICATION_FEE'
    });
    
    console.log('Initialize response status:', initRes.status, 'Body:', initRes.data);
    
    if (initRes.status === 200 && initRes.data.authorizationUrl) {
      console.log('🎉 E2E TEST SUCCESS! Checkout URL generated:', initRes.data.authorizationUrl);
    } else {
      console.error('❌ E2E TEST FAILED:', initRes);
    }
  } finally {
    // 5. Cleanup test application
    await prisma.paymentSession.deleteMany({ where: { applicationId: application.id } });
    await prisma.paymentTransaction.deleteMany({ where: { applicationId: application.id } });
    await prisma.application.delete({ where: { id: application.id } });
    console.log('Cleaned up test application record.');
  }
}

testFlow()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

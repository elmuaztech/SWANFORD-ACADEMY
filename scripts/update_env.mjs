import fs from 'fs';
import path from 'path';

const envPath = '/root/swanford-academy/.env';
if (fs.existsSync(envPath)) {
  let content = fs.readFileSync(envPath, 'utf8');
  // Remove existing NOTIFICATION_PROVIDER and SMTP lines
  const lines = content.split('\n').filter(line => 
    !line.startsWith('NOTIFICATION_PROVIDER=') &&
    !line.startsWith('SMTP_')
  );

  // Append canonical working SMTP settings
  lines.push('NOTIFICATION_PROVIDER=smtp');
  lines.push('SMTP_HOST=smtp.gmail.com');
  lines.push('SMTP_PORT=587');
  lines.push('SMTP_SECURE=false');
  lines.push('SMTP_USER=swanford99@gmail.com');
  lines.push('SMTP_PASSWORD=msik fjvd pejo ndhn');
  lines.push('SMTP_PASS=msik fjvd pejo ndhn');
  lines.push('SMTP_FROM_NAME="Swanford Academy"');
  lines.push('SMTP_FROM_EMAIL=swanford99@gmail.com');
  lines.push('SMTP_CONNECTION_TIMEOUT=10000');
  lines.push('SMTP_RETRY_LIMIT=5');

  fs.writeFileSync(envPath, lines.join('\n') + '\n', 'utf8');
  console.log('✔ .env updated with live Gmail SMTP configuration');
} else {
  console.error('.env not found at', envPath);
  process.exit(1);
}

import { ForwardableEmailMessage, ExecutionContext, ExportedHandler } from '@cloudflare/workers-types';

interface Env {
  GDRIVE_API_CLIENT_ID: string;
  GDRIVE_API_CLIENT_SECRET: string;
  GDRIVE_TOKEN_JSON: string;
  GDRIVE_FOLDER_ID: string;

  BACKUP_EMAIL: string;
}

async function getAccessToken(env: Env): Promise<string> {
  const tokenData = JSON.parse(env.GDRIVE_TOKEN_JSON);

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: env.GDRIVE_API_CLIENT_ID,
      client_secret: env.GDRIVE_API_CLIENT_SECRET,
      refresh_token: tokenData.refresh_token,
      grant_type: 'refresh_token',
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`Failed to get access token: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as { access_token: string };
  return data.access_token;
}

function generateMaildirFilename(): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const microseconds = Math.floor((Date.now() % 1000) * 1000);
  const random = Math.floor(Math.random() * 1000000);
  const hostname = 'cloudflare-worker';
  return `${timestamp}.M${microseconds}P${random}.${hostname}`;
}

async function doUpload(
  rawBody: string,
  filename: string,
  env: Env
): Promise<void> {
  const accessToken = await getAccessToken(env);

  const metadata = {
    name: filename,
    parents: [env.GDRIVE_FOLDER_ID],
  };

  const boundary = 'eil0sheetouphohma5eeph6pahma0bi0IThae0ja';
  const delimiter = `\r\n--${boundary}\r\n`;
  const close_delim = `\r\n--${boundary}--`;

  const multipartRequestBody = 
    delimiter +
    'Content-Type: application/json\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: application/octet-stream\r\n\r\n' +
    rawBody +
    close_delim;

  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary="${boundary}"`,
    },
    body: multipartRequestBody,
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`Failed to upload: ${response.status} ${response.statusText}`);
  }

  const result = await response.json() as { id?: string };
  if (!result.id) {
    throw new Error('Upload succeeded but no file ID returned');
  }
}

export default {
  async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext): Promise<void> {
    // Read the raw message body
    const rawBody = await new Response(message.raw).text();

    // Log basic email information
    console.log('Received email:', {
      from: message.from,
      to: message.to,
      subject: message.headers.get('subject'),
      size: rawBody.length,
    });

    // Generate maildir filename
    const filename = generateMaildirFilename();

    // Try uploading once immediately
    try {
      await doUpload(rawBody, filename, env);
      console.log(`Email uploaded as: ${filename}`);
    } catch (error) {
      console.error('Upload failed:', error);
      if (error instanceof Error && error.stack) {
        console.error('Stack trace:', error.stack);
      }
    }

    // Forward the email to backup address
    await message.forward(env.BACKUP_EMAIL);
    console.log(`Email forwarded to: ${env.BACKUP_EMAIL}`);
  },

} satisfies ExportedHandler<Env>;

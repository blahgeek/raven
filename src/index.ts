import { ForwardableEmailMessage, ExecutionContext, ExportedHandler } from '@cloudflare/workers-types';
import { google } from 'googleapis';

interface Env {
  GDRIVE_API_CLIENT_ID: string;
  GDRIVE_API_CLIENT_SECRET: string;
  GDRIVE_TOKEN_JSON: string;
  GDRIVE_FOLDER_ID: string;

  BACKUP_EMAIL: string;
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
  let oauthClient = new google.auth.OAuth2(
    env.GDRIVE_API_CLIENT_ID,
    env.GDRIVE_API_CLIENT_SECRET,
    "http://localhost",  // unused
  );
  oauthClient.setCredentials(JSON.parse(env.GDRIVE_TOKEN_JSON));

  const drive = google.drive({ version: 'v3', auth: oauthClient });
  const response = await drive.files.create({
    requestBody: {
      name:  filename,
      parents: [env.GDRIVE_FOLDER_ID],
    },
    media: {
      mimeType: 'application/octet-stream',
      body: rawBody,
    }
  }, {
    timeout: 25000,
  });
  if (!response.data.id) {
    throw new Error(`Failed to upload: ${response.status}, ${response.statusText}`)
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

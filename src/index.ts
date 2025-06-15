import { ForwardableEmailMessage, ExecutionContext, ExportedHandler } from '@cloudflare/workers-types';

interface Env {
  NEXTCLOUD_URL: string;
  NEXTCLOUD_USERNAME: string;
  NEXTCLOUD_PASSWORD: string; // This will be a secret
  NEXTCLOUD_MAILDIR_PATH: string;
  BACKUP_EMAIL: string;
}

function generateMaildirFilename(): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const microseconds = Math.floor((Date.now() % 1000) * 1000);
  const random = Math.floor(Math.random() * 1000000);
  const hostname = 'cloudflare-worker';
  return `${timestamp}.M${microseconds}P${random}.${hostname}`;
}

async function uploadToNextcloud(
  rawBody: string,
  filename: string,
  env: Env
): Promise<void> {
  const webdavUrl = `${env.NEXTCLOUD_URL}/remote.php/dav/files/${env.NEXTCLOUD_USERNAME}/${env.NEXTCLOUD_MAILDIR_PATH}/new/${filename}`;
  
  const credentials = btoa(`${env.NEXTCLOUD_USERNAME}:${env.NEXTCLOUD_PASSWORD}`);
  
  const response = await fetch(webdavUrl, {
    method: 'PUT',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'message/rfc822',
    },
    body: rawBody,
  });

  if (!response.ok) {
    throw new Error(`Failed to upload to Nextcloud: ${response.status} ${response.statusText}`);
  }
}

export default {
  async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext): Promise<void> {
    try {
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
      
      // Upload to Nextcloud via WebDAV
      await uploadToNextcloud(rawBody, filename, env);
      
      console.log(`Email uploaded to Nextcloud as: ${filename}`);
      
      // Forward the email to backup address
      await message.forward(env.BACKUP_EMAIL);
      
      console.log(`Email forwarded to: ${env.BACKUP_EMAIL}`);
    } catch (error) {
      console.error('Error processing email:', error);
      throw error;
    }
  },

} satisfies ExportedHandler<Env>;

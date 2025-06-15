import { ForwardableEmailMessage, ExecutionContext, ExportedHandler } from '@cloudflare/workers-types';

interface Env {
  // Define your environment variables here
  // For example: MY_KV: KVNamespace;
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
      body: rawBody
    });
  },

} satisfies ExportedHandler<Env>;

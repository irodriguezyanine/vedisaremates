import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

let sesClient: SESv2Client | null | undefined;

function getSesEnv() {
  const accessKeyId = (process.env.AWS_ACCESS_KEY_ID ?? process.env.SES_ACCESS_KEY_ID ?? "").trim();
  const secretAccessKey = (process.env.AWS_SECRET_ACCESS_KEY ?? process.env.SES_SECRET_ACCESS_KEY ?? "").trim();
  const region = (process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? process.env.SES_REGION ?? "").trim();
  const fromEmail = (process.env.AWS_SES_FROM_EMAIL ?? process.env.SES_FROM_EMAIL ?? "").trim();
  const replyTo = (process.env.AWS_SES_REPLY_TO ?? process.env.SES_REPLY_TO ?? "").trim();
  if (!accessKeyId || !secretAccessKey || !region || !fromEmail) return null;
  return { accessKeyId, secretAccessKey, region, fromEmail, replyTo };
}

function getSesClient() {
  if (sesClient !== undefined) return sesClient;
  const env = getSesEnv();
  if (!env) {
    sesClient = null;
    return sesClient;
  }
  sesClient = new SESv2Client({
    region: env.region,
    credentials: {
      accessKeyId: env.accessKeyId,
      secretAccessKey: env.secretAccessKey,
    },
  });
  return sesClient;
}

export async function sendSesEmail({
  to,
  subject,
  html,
  text,
}: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<{ ok: boolean; error?: string }> {
  const env = getSesEnv();
  const client = getSesClient();
  if (!env || !client) {
    return { ok: false, error: "ses_no_configurado" };
  }

  try {
    await client.send(
      new SendEmailCommand({
        FromEmailAddress: env.fromEmail,
        Destination: { ToAddresses: [to] },
        ReplyToAddresses: env.replyTo ? [env.replyTo] : undefined,
        Content: {
          Simple: {
            Subject: { Data: subject, Charset: "UTF-8" },
            Body: {
              Text: { Data: text, Charset: "UTF-8" },
              Html: { Data: html, Charset: "UTF-8" },
            },
          },
        },
      }),
    );
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "error_desconocido";
    return { ok: false, error: msg };
  }
}

const fs = require('fs');
const axios = require('axios');
const Communication = require('../models/communications');
const { resendApiKey, defaultFromEmail } = require('../config/env');

const hasResendProvider = Boolean(resendApiKey);

const sendTransactionalEmail = async ({
  to,
  subject,
  html,
  text,
  attachments,
  patientId,
  metadata,
}) => {
  const providerInUse = hasResendProvider ? 'resend' : null;
  const hasProvider = Boolean(providerInUse);

  let normalizedAttachments;

  if (attachments && attachments.length > 0) {
    normalizedAttachments = attachments
      .map((attachment) => {
        if (attachment.path && !attachment.content) {
          try {
            const fileBuffer = fs.readFileSync(attachment.path);
            return {
              filename: attachment.filename,
              type: attachment.type || 'application/octet-stream',
              disposition: attachment.disposition || 'attachment',
              content: fileBuffer.toString('base64'),
            };
          } catch (error) {
            console.error('Failed to read attachment', attachment.path, error);
            return null;
          }
        }
        if (attachment.content && Buffer.isBuffer(attachment.content)) {
          return {
            ...attachment,
            content: attachment.content.toString('base64'),
          };
        }
        return attachment;
      })
      .filter(Boolean);
  }

  const message = {
    to,
    from: defaultFromEmail,
    subject,
    html,
    text,
    attachments: normalizedAttachments,
  };

  let response;
  let status = 'queued';
  let providerMessageId;
  let errorMessage;

  const simulated = !hasProvider;

  if (providerInUse === 'resend') {
    try {
      const resendPayload = {
        from: defaultFromEmail,
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
        text,
        attachments: normalizedAttachments?.length
          ? normalizedAttachments.map((attachment) => ({
              filename: attachment.filename,
              content: attachment.content,
            }))
          : undefined,
      };

      const resendResponse = await axios.post('https://api.resend.com/emails', resendPayload, {
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
      });

      providerMessageId = resendResponse?.data?.id;
      status = providerMessageId ? 'sent' : 'queued';
      response = resendResponse.data;
    } catch (error) {
      status = 'failed';
      errorMessage = error.response?.data?.message || error.message;
      console.error('Failed to send email via Resend', error);
    }
  } else {
    // No provider configured - log and surface failure so UI can inform the user
    status = 'failed';
    errorMessage = 'Email provider not configured';
    console.log('[EmailService] Email not sent (provider missing)', message);
  }

  if (patientId) {
    try {
      await Communication.create({
        communication_id: Date.now(),
        patient_id: patientId,
        type: 'email',
        subject,
        content: text || html,
        delivery_status: status === 'sent' ? 'sent' : status === 'failed' ? 'failed' : 'pending',
        metadata: {
          to: Array.isArray(to) ? to.join(',') : to,
          providerMessageId: providerMessageId || '',
          errorMessage: errorMessage || '',
          ...(metadata || {}),
        },
      });
    } catch (error) {
      console.error('Failed to log communication record', error);
    }
  }

  return {
    status,
    providerMessageId,
    errorMessage,
    response,
    simulated,
    provider: providerInUse,
  };
};

module.exports = {
  sendTransactionalEmail,
};

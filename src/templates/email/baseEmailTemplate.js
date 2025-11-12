const escapeHtml = (value = '') =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const renderEmailTemplate = ({
  heading = '',
  intro = '',
  content = '',
  previewText = '',
  cta,
  footerLines = [],
  brand = {},
}) => {
  const accent = brand.primary_color || '#1f3e82';
  const textColor = '#0f172a';
  const muted = '#475569';

  const buttonHtml = cta?.url
    ? `<table role="presentation" width="100%" style="margin:24px 0;">
        <tr>
          <td align="center">
            <a href="${escapeHtml(cta.url)}"
               style="background:${accent};color:#ffffff;padding:14px 26px;border-radius:999px;font-weight:600;font-family:'Segoe UI',Arial,sans-serif;text-decoration:none;display:inline-block;">
              ${escapeHtml(cta.label || 'View')}
            </a>
          </td>
        </tr>
      </table>`
    : '';

  const footerHtml = footerLines.length
    ? `<p style="margin:0;color:${muted};font-size:13px;line-height:1.5;">${footerLines
        .map((line) => escapeHtml(line))
        .join('<br/>')}</p>`
    : '';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(heading || 'Message')}</title>
    <style>
      @media only screen and (max-width: 600px) {
        .email-wrapper {
          padding: 20px 0 !important;
        }
        .email-container {
          width: 100% !important;
          margin: 0 !important;
          border-radius: 0 !important;
        }
        .email-content {
          padding: 20px !important;
        }
        .stack-sm,
        .stack-sm tr,
        .stack-sm td {
          display: block !important;
          width: 100% !important;
        }
        .card-spacing {
          padding: 16px !important;
        }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background:#eef2ff;">
    ${
      previewText
        ? `<div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(previewText)}</div>`
        : ''
    }
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="email-wrapper" style="padding:32px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="email-container" style="max-width:600px;background:#ffffff;border-radius:18px;box-shadow:0 20px 45px rgba(15,23,42,0.08);overflow:hidden;">
            <tr>
              <td style="background:${accent};padding:24px 28px;">
                <h1 style="margin:0;font-size:24px;font-family:'Segoe UI',Arial,sans-serif;color:#ffffff;">${escapeHtml(
                  heading || 'Update',
                )}</h1>
                ${
                  intro
                    ? `<p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-family:'Segoe UI',Arial,sans-serif;">${escapeHtml(
                        intro,
                      )}</p>`
                    : ''
                }
              </td>
            </tr>
            <tr>
              <td class="email-content" style="padding:28px;font-family:'Segoe UI',Arial,sans-serif;color:${textColor};font-size:15px;line-height:1.7;">
                ${content}
                ${buttonHtml}
                ${footerHtml}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
};

module.exports = {
  renderEmailTemplate,
};

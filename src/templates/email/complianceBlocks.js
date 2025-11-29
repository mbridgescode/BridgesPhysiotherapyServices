const DEFAULT_PRIVACY_POLICY_URL =
  process.env.PRIVACY_POLICY_URL || 'https://www.bridgesphysiotherapy.co.uk/privacy-policy';
const DEFAULT_CANCELLATION_POLICY_URL =
  process.env.CANCELLATION_POLICY_URL || 'https://www.bridgesphysiotherapy.co.uk/cancellation-charges';

const resolveComplianceLinks = (branding = {}) => ({
  privacyUrl: branding.privacy_policy_url || DEFAULT_PRIVACY_POLICY_URL,
  cancellationUrl: branding.cancellation_policy_url || DEFAULT_CANCELLATION_POLICY_URL,
});

const buildComplianceBlockHtml = (branding = {}) => {
  const { privacyUrl, cancellationUrl } = resolveComplianceLinks(branding);
  return `
  <div style="margin-top:24px;padding:14px 18px;background:rgba(15,23,42,0.04);border-radius:12px;">
    <strong style="display:block;margin-bottom:6px;color:#0f172a;">Helpful links</strong>
    <a href="${privacyUrl}" style="display:inline-block;color:#1f3e82;text-decoration:none;margin-right:18px;">
      Privacy policy
    </a>
    <a href="${cancellationUrl}" style="display:inline-block;color:#1f3e82;text-decoration:none;">
      Cancellation charges
    </a>
  </div>
`;
};

const buildComplianceTextLines = (branding = {}) => {
  const { privacyUrl, cancellationUrl } = resolveComplianceLinks(branding);
  return [
    `Privacy policy: ${privacyUrl}`,
    `Cancellation charges: ${cancellationUrl}`,
  ];
};

module.exports = {
  buildComplianceBlockHtml,
  buildComplianceTextLines,
  resolveComplianceLinks,
};

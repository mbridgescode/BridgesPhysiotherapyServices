const AuditLog = require('../models/auditLog');

const recordAuditEvent = async ({
  event,
  userId,
  userRole,
  actorId,
  actorRole,
  ipAddress,
  metadata,
  success = true,
}) => {
  try {
    await AuditLog.create({
      event,
      user: userId,
      user_role: userRole,
      actor: actorId,
      actor_role: actorRole,
      ip_address: ipAddress,
      metadata,
      success,
    });
  } catch (error) {
    console.error('Failed to record audit event', event, error);
  }
};

module.exports = {
  recordAuditEvent,
};

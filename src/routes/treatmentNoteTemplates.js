const express = require('express');
const TreatmentNoteTemplate = require('../models/treatmentNoteTemplate');
const { authenticate, authorize } = require('../middleware/auth');
const { recordAuditEvent } = require('../utils/audit');

const router = express.Router();

const TEMPLATE_ROLES = ['admin', 'therapist'];

const buildTemplatePayload = (template) => ({
  id: template.id || template._id,
  name: template.name,
  body: template.body,
  tags: template.tags || [],
  archived: template.archived || false,
  createdAt: template.createdAt,
  updatedAt: template.updatedAt,
  createdBy: template.createdBy,
  updatedBy: template.updatedBy,
});

router.get(
  '/',
  authenticate,
  authorize(...TEMPLATE_ROLES),
  async (req, res, next) => {
    try {
      const templates = await TreatmentNoteTemplate.find({ archived: false })
        .sort({ updatedAt: -1 })
        .populate('createdBy', 'username email role')
        .populate('updatedBy', 'username email role');

      res.json({
        success: true,
        templates: templates.map(buildTemplatePayload),
      });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/',
  authenticate,
  authorize(...TEMPLATE_ROLES),
  async (req, res, next) => {
    try {
      const { name, body, tags = [] } = req.body;
      if (!name || !name.trim()) {
        return res.status(400).json({ success: false, message: 'Template name is required' });
      }
      if (!body || !body.trim()) {
        return res.status(400).json({ success: false, message: 'Template body is required' });
      }

      const template = new TreatmentNoteTemplate({
        name: name.trim(),
        body: body.trim(),
        tags,
        createdBy: req.user.id,
        updatedBy: req.user.id,
      });
      await template.save();

      await recordAuditEvent({
        event: 'template.treatment_note.create',
        success: true,
        actorId: req.user.id,
        actorRole: req.user.role,
        metadata: { template_id: template.id, template_name: template.name },
      });

      res.status(201).json({ success: true, template: buildTemplatePayload(template) });
    } catch (error) {
      next(error);
    }
  },
);

router.put(
  '/:templateId',
  authenticate,
  authorize(...TEMPLATE_ROLES),
  async (req, res, next) => {
    const { templateId } = req.params;
    const { name, body, tags, archived } = req.body;

    if (name !== undefined && !name.trim()) {
      return res.status(400).json({ success: false, message: 'Template name cannot be empty' });
    }
    if (body !== undefined && !body.trim()) {
      return res.status(400).json({ success: false, message: 'Template body cannot be empty' });
    }

    try {
      const template = await TreatmentNoteTemplate.findByIdAndUpdate(
        templateId,
        {
          $set: {
            ...(name !== undefined ? { name: name.trim() } : {}),
            ...(body !== undefined ? { body: body.trim() } : {}),
            ...(tags !== undefined ? { tags } : {}),
            ...(archived !== undefined ? { archived: Boolean(archived) } : {}),
            updatedBy: req.user.id,
          },
        },
        { new: true },
      );

      if (!template) {
        return res.status(404).json({ success: false, message: 'Template not found' });
      }

      await recordAuditEvent({
        event: 'template.treatment_note.update',
        success: true,
        actorId: req.user.id,
        actorRole: req.user.role,
        metadata: { template_id: template.id, archived: template.archived ? 'true' : 'false' },
      });

      res.json({ success: true, template: buildTemplatePayload(template) });
    } catch (error) {
      next(error);
    }
  },
);

router.delete(
  '/:templateId',
  authenticate,
  authorize(...TEMPLATE_ROLES),
  async (req, res, next) => {
    try {
      const template = await TreatmentNoteTemplate.findByIdAndDelete(req.params.templateId);
      if (!template) {
        return res.status(404).json({ success: false, message: 'Template not found' });
      }

      await recordAuditEvent({
        event: 'template.treatment_note.delete',
        success: true,
        actorId: req.user.id,
        actorRole: req.user.role,
        metadata: { template_id: template.id, template_name: template.name },
      });

      res.json({ success: true, template: buildTemplatePayload(template) });
    } catch (error) {
      next(error);
    }
  },
);

module.exports = router;

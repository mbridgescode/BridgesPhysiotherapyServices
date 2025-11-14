const express = require('express');
const GpLetterTemplate = require('../models/gpLetterTemplate');
const { authenticate, authorize } = require('../middleware/auth');
const { recordAuditEvent } = require('../utils/audit');

const router = express.Router();

const TEMPLATE_ROLES = ['admin', 'therapist'];

const serializeTemplate = (template) => ({
  id: template.id || template._id,
  name: template.name,
  body: template.body,
  category: template.category || '',
  tags: template.tags || [],
  archived: Boolean(template.archived),
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
      const templates = await GpLetterTemplate.find({ archived: false })
        .sort({ updatedAt: -1 })
        .populate('createdBy', 'name username email role')
        .populate('updatedBy', 'name username email role');

      res.json({
        success: true,
        templates: templates.map(serializeTemplate),
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
      const { name, body, category = '', tags = [] } = req.body || {};
      if (!name || !name.trim()) {
        return res.status(400).json({ success: false, message: 'Template name is required' });
      }
      if (!body || !body.trim()) {
        return res.status(400).json({ success: false, message: 'Template body is required' });
      }

      const template = await GpLetterTemplate.create({
        name: name.trim(),
        body: body.trim(),
        category: category.trim(),
        tags,
        createdBy: req.user.id,
        updatedBy: req.user.id,
      });

      await recordAuditEvent({
        event: 'template.gp_letter.create',
        success: true,
        actorId: req.user.id,
        actorRole: req.user.role,
        metadata: { template_id: template.id, template_name: template.name },
      });

      res.status(201).json({
        success: true,
        template: serializeTemplate(template),
      });
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
    try {
      const { templateId } = req.params;
      const { name, body, category, tags, archived } = req.body || {};

      if (name !== undefined && !name.trim()) {
        return res.status(400).json({ success: false, message: 'Template name cannot be empty' });
      }
      if (body !== undefined && !body.trim()) {
        return res.status(400).json({ success: false, message: 'Template body cannot be empty' });
      }

      const template = await GpLetterTemplate.findByIdAndUpdate(
        templateId,
        {
          $set: {
            ...(name !== undefined ? { name: name.trim() } : {}),
            ...(body !== undefined ? { body: body.trim() } : {}),
            ...(category !== undefined ? { category: category.trim() } : {}),
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
        event: 'template.gp_letter.update',
        success: true,
        actorId: req.user.id,
        actorRole: req.user.role,
        metadata: { template_id: template.id },
      });

      res.json({
        success: true,
        template: serializeTemplate(template),
      });
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
      const template = await GpLetterTemplate.findByIdAndDelete(req.params.templateId);
      if (!template) {
        return res.status(404).json({ success: false, message: 'Template not found' });
      }

      await recordAuditEvent({
        event: 'template.gp_letter.delete',
        success: true,
        actorId: req.user.id,
        actorRole: req.user.role,
        metadata: { template_id: template.id, template_name: template.name },
      });

      res.json({
        success: true,
        template: serializeTemplate(template),
      });
    } catch (error) {
      next(error);
    }
  },
);

module.exports = router;

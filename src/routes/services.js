const express = require('express');
const Service = require('../models/service');
const Counter = require('../models/counter');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

const mapService = (service) => ({
  id: service.id,
  treatment_id: service.treatment_id,
  treatment_description: service.treatment_description,
  price: service.price,
  duration_minutes: service.duration_minutes,
  active: service.active,
  notes: service.notes,
  createdAt: service.createdAt,
  updatedAt: service.updatedAt,
});

router.get(
  '/',
  authenticate,
  authorize('admin', 'therapist', 'receptionist'),
  async (req, res, next) => {
    try {
      const { includeInactive } = req.query;
      const filter = {};
      if (!includeInactive) {
        filter.active = true;
      }
      const services = await Service.find(filter).sort({ treatment_description: 1 });
      return res.json({ success: true, services: services.map(mapService) });
    } catch (error) {
      return next(error);
    }
  },
);

router.post(
  '/',
  authenticate,
  authorize('admin'),
  async (req, res, next) => {
    try {
      const {
        treatment_description: treatmentDescription,
        price,
        duration_minutes: durationMinutes,
        active = true,
        notes,
      } = req.body;

      if (!treatmentDescription || typeof price !== 'number') {
        return res.status(400).json({
          success: false,
          message: 'treatment_description and numeric price are required',
        });
      }

      if (price < 0) {
        return res.status(400).json({ success: false, message: 'price must be >= 0' });
      }

      if (durationMinutes && durationMinutes < 0) {
        return res.status(400).json({ success: false, message: 'duration_minutes must be >= 0' });
      }

      const treatmentId = await Counter.next('service_id', 1);

      const service = await Service.create({
        treatment_id: treatmentId,
        treatment_description: treatmentDescription,
        price,
        duration_minutes: durationMinutes,
        active,
        notes,
      });

      return res.status(201).json({ success: true, service: mapService(service) });
    } catch (error) {
      return next(error);
    }
  },
);

router.put(
  '/:id',
  authenticate,
  authorize('admin'),
  async (req, res, next) => {
    try {
      const {
        treatment_description: treatmentDescription,
        price,
        duration_minutes: durationMinutes,
        active,
        notes,
      } = req.body;

      const update = {};
      if (treatmentDescription !== undefined) {
        update.treatment_description = treatmentDescription;
      }
      if (price !== undefined) {
        if (typeof price !== 'number' || price < 0) {
          return res.status(400).json({ success: false, message: 'price must be a non-negative number' });
        }
        update.price = price;
      }
      if (durationMinutes !== undefined) {
        if (durationMinutes < 0) {
          return res.status(400).json({ success: false, message: 'duration_minutes must be >= 0' });
        }
        update.duration_minutes = durationMinutes;
      }
      if (active !== undefined) {
        update.active = active;
      }
      if (notes !== undefined) {
        update.notes = notes;
      }

      const service = await Service.findByIdAndUpdate(
        req.params.id,
        { $set: update },
        { new: true },
      );

      if (!service) {
        return res.status(404).json({ success: false, message: 'Service not found' });
      }

      return res.json({ success: true, service: mapService(service) });
    } catch (error) {
      return next(error);
    }
  },
);

module.exports = router;

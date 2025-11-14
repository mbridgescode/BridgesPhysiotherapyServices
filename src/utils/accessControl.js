const mongoose = require('mongoose');

const toObjectId = (value) => (mongoose.Types.ObjectId.isValid(value) ? new mongoose.Types.ObjectId(value) : null);

const buildPatientScopeQuery = (user) => {
  if (!user || user.role === 'admin') {
    return null;
  }
  const scope = [];
  if (user.employeeID !== null && user.employeeID !== undefined) {
    scope.push({ primary_therapist_id: user.employeeID });
  }
  const userObjectId = toObjectId(user.id);
  if (userObjectId) {
    scope.push({ primaryTherapist: userObjectId });
    scope.push({ createdBy: userObjectId });
  } else if (user.id) {
    scope.push({ primaryTherapist: user.id });
    scope.push({ createdBy: user.id });
  }
  return scope.length ? { $or: scope } : null;
};

const userCanAccessPatient = (patient, user, options = {}) => {
  if (!patient || !user) {
    return false;
  }

  const { allowAllTherapists = false } = options;

  if (user.role === 'admin') {
    return true;
  }

  if (allowAllTherapists && user.role === 'therapist') {
    return true;
  }

  const employeeId = user.employeeID;
  if (employeeId !== null && employeeId !== undefined) {
    if (Number(patient.primary_therapist_id) === Number(employeeId)) {
      return true;
    }
    if (
      patient.primaryTherapist
      && Number(patient.primaryTherapist.employeeID) === Number(employeeId)
    ) {
      return true;
    }
  }
  const therapistId = patient.primaryTherapist?._id || patient.primaryTherapist;
  if (therapistId && therapistId.toString && therapistId.toString() === String(user.id)) {
    return true;
  }
  if (patient.createdBy && patient.createdBy.toString && patient.createdBy.toString() === String(user.id)) {
    return true;
  }
  return false;
};

module.exports = {
  buildPatientScopeQuery,
  userCanAccessPatient,
};

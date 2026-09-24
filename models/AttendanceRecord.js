const mongoose = require('mongoose');

const AttendanceRecordSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  projectId: {
    type: String,
    required: true,
    index: true
  },
  projectName: {
    type: String,
    default: ''
  },
  staffName: {
    type: String,
    required: true
  },
  staffId: {
    type: String,
    default: ''
  },
  date: {
    type: String, // YYYY-MM-DD
    required: true,
    index: true
  },
  checkIn: {
    type: String, // e.g. "09:30 AM"
    required: true
  },
  checkOut: {
    type: String, // e.g. "05:30 PM"
    default: ''
  },
  status: {
    type: String,
    enum: ['Present', 'Half-day', 'Late', 'Absent'],
    default: 'Present'
  },
  geoLocation: {
    captured: { type: Boolean, default: false },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    accuracy: { type: Number, default: null },
    capturedAt: { type: Date, default: null }
  },
  submittedBy: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
});

// Compound index on project and date
AttendanceRecordSchema.index({ projectId: 1, date: -1 });

module.exports = mongoose.model('AttendanceRecord', AttendanceRecordSchema);

const mongoose = require('mongoose');

const SettingsSchema = new mongoose.Schema({
  id: {
    type: String,
    default: 'global_settings',
    unique: true
  },
  complianceThreshold: {
    type: Number,
    default: 60 // alerts if compliance score drops below this %
  },
  attendanceDropThreshold: {
    type: Number,
    default: 15 // alerts if attendance drops by > 15% between checks
  },
  zeroCategoryDaysThreshold: {
    type: Number,
    default: 5 // alerts if a category stays at 0% for > 5 days
  },
  inspectionOverdueHours: {
    type: Number,
    default: 48 // alerts if scheduled inspection exceeds 48 hours
  },
  alertEmailRecipient: {
    type: String,
    default: 'admin@dosje.gov.in'
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Settings', SettingsSchema);

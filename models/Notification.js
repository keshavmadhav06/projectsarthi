const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
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
  state: {
    type: String,
    default: ''
  },
  ruleTriggered: {
    type: String,
    required: true,
    index: true
  },
  severity: {
    type: String,
    enum: ['critical', 'warning', 'info'],
    default: 'warning',
    index: true
  },
  message: {
    type: String,
    required: true
  },
  details: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  recipients: {
    type: [String],
    default: []
  },
  status: {
    type: String,
    enum: ['active', 'resolved'],
    default: 'active',
    index: true
  },
  resolved: {
    type: Boolean,
    default: false,
    index: true
  },
  resolutionNotes: {
    type: String,
    default: ''
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  resolvedAt: {
    type: Date,
    default: null
  },
  resolvedBy: {
    type: String,
    default: null
  }
});

NotificationSchema.index({ projectId: 1, createdAt: -1 });
NotificationSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', NotificationSchema);

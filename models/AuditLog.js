const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema({
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
    default: 'General Project'
  },
  state: {
    type: String,
    default: ''
  },
  actionType: {
    type: String,
    required: true,
    enum: [
      'checklist',
      'checklist_toggle',
      'custom_item_added',
      'custom_item_deleted',
      'score',
      'score_changed',
      'status',
      'status_changed',
      'comment',
      'inspection'
    ],
    index: true
  },
  actorId: {
    type: String,
    default: ''
  },
  actorName: {
    type: String,
    required: true
  },
  field: {
    type: String,
    default: ''
  },
  oldValue: {
    type: String,
    default: ''
  },
  newValue: {
    type: String,
    default: ''
  },
  delta: {
    type: String,
    default: ''
  },
  description: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true // indexed in UTC
  }
});

// Compound index on projectId and timestamp for fast reverse-chronological project logs
AuditLogSchema.index({ projectId: 1, timestamp: -1 });
// Compound index on actionType and timestamp for fast filtering
AuditLogSchema.index({ actionType: 1, timestamp: -1 });

module.exports = mongoose.model('AuditLog', AuditLogSchema);

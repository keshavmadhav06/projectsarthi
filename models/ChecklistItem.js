const mongoose = require('mongoose');

const ChecklistItemSchema = new mongoose.Schema({
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
  category: {
    type: String,
    required: true,
    enum: [
      'Infrastructure',
      'Staffing & Attendance',
      'Documentation',
      'Service Delivery'
    ]
  },
  questionText: {
    type: String,
    required: true,
    trim: true
  },
  weight: {
    type: Number,
    required: true,
    min: 0,
    max: 25
  },
  isChecked: {
    type: Boolean,
    default: false
  },
  isCustom: {
    type: Boolean,
    default: false
  },
  createdBy: {
    type: String,
    default: 'System'
  }
}, {
  timestamps: true // createdAt and updatedAt in UTC
});

// Compound index on projectId and category for fast category retrieval
ChecklistItemSchema.index({ projectId: 1, category: 1 });

module.exports = mongoose.model('ChecklistItem', ChecklistItemSchema);

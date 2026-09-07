const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true
  },
  employeeId: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
    index: true
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: [
      'PMU Inspector',
      'Department Official',
      'Project / NGO Administrator'
    ],
    default: 'PMU Inspector'
  },
  assignedProjectIds: {
    type: [String],
    default: []
  },
  verified: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true // createdAt and updatedAt in UTC
});

module.exports = mongoose.model('User', UserSchema);

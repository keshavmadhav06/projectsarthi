const mongoose = require('mongoose');

const ProjectSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  scheme: {
    type: String,
    required: true,
    trim: true
  },
  district: {
    type: String,
    required: true,
    trim: true
  },
  state: {
    type: String,
    required: true,
    trim: true
  },
  risk: {
    type: String,
    enum: ['High', 'Medium', 'Low', 'Pending review'],
    default: 'Medium'
  },
  status: {
    type: String,
    enum: ['Live', 'Closed'],
    default: 'Live'
  },
  attendance: {
    type: Number,
    default: 75,
    min: 0,
    max: 100
  },
  score: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  assignedInspector: {
    type: String,
    default: 'Arjun Mehta'
  },
  assignedInspectorId: {
    type: String,
    default: 'GOV-2026-1001'
  },
  owner: {
    type: String,
    default: 'NGO/2026/1001'
  },
  camera: {
    type: String,
    default: 'Live'
  },
  inspectionAssigned: {
    type: Boolean,
    default: false
  },
  lat: {
    type: Number,
    default: 20.5937
  },
  lng: {
    type: Number,
    default: 78.9629
  },
  lastInspection: {
    type: String,
    default: '14 Aug 2026'
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true // stores createdAt & updatedAt in UTC
});

module.exports = mongoose.model('Project', ProjectSchema);

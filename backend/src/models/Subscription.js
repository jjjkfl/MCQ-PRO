const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  planId: { type: mongoose.Schema.Types.ObjectId, ref: 'SubscriptionPlan', required: true },
  startDate: { type: Date, default: Date.now },
  endDate: { type: Date, required: true },
  status: { type: String, enum: ['active', 'expired', 'suspended'], default: 'active' },
  paymentDetails: {
    transactionId: { type: String },
    amount: { type: Number },
    currency: { type: String, default: 'INR' }
  }
}, { timestamps: true });

module.exports = mongoose.model('Subscription', subscriptionSchema);
